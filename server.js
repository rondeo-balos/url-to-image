const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const sharp = require('sharp');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Configuration ──────────────────────────────────────────────────────────────

const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT) || 3;
const CONTEXT_MAX_AGE_MS = 60_000;       // Force-kill contexts older than 60s
const ZOMBIE_CHECK_INTERVAL_MS = 15_000; // Check for zombies every 15s
const QUEUE_TIMEOUT_MS = 30_000;         // Max time a request waits in queue
const SCREENSHOT_TIMEOUT_MS = 30_000;    // Default page navigation timeout
const GRACEFUL_SHUTDOWN_MS = 10_000;     // Time to wait for in-flight work on shutdown

// ─── Middleware ──────────────────────────────────────────────────────────────────

app.use(helmet());
app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
});
app.use(limiter);

// ─── Browser Configuration (Playwright) ─────────────────────────────────────────

const BROWSER_CONFIG = {
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--single-process'
  ],
  timeout: 30000
};

// ─── Singleton Browser Manager ──────────────────────────────────────────────────

let browserInstance = null;
let browserLaunchPromise = null;
let isShuttingDown = false;

/**
 * Get or create the singleton browser instance.
 * If the browser is disconnected or doesn't exist, a new one is launched.
 * Uses a launch promise to prevent concurrent launches.
 */
async function getBrowser() {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }

  // Prevent multiple simultaneous launches
  if (browserLaunchPromise) {
    return browserLaunchPromise;
  }

  browserLaunchPromise = (async () => {
    try {
      console.log('🚀 Launching singleton Chromium browser...');
      const browser = await chromium.launch(BROWSER_CONFIG);

      browser.on('disconnected', () => {
        console.warn('⚠️  Browser disconnected unexpectedly. Will re-launch on next request.');
        browserInstance = null;
      });

      browserInstance = browser;
      console.log('✅ Singleton browser ready (PID:', browser.process()?.pid ?? 'unknown', ')');
      return browser;
    } catch (error) {
      console.error('❌ Failed to launch browser:', error.message);
      throw new Error('Failed to launch browser instance');
    } finally {
      browserLaunchPromise = null;
    }
  })();

  return browserLaunchPromise;
}

// ─── Concurrency Limiter (Semaphore + Queue) ────────────────────────────────────

let activeCount = 0;
const waitQueue = [];

function acquireSlot() {
  return new Promise((resolve, reject) => {
    if (activeCount < MAX_CONCURRENT) {
      activeCount++;
      return resolve();
    }

    // Queue the request with a timeout
    const timer = setTimeout(() => {
      const idx = waitQueue.indexOf(entry);
      if (idx !== -1) waitQueue.splice(idx, 1);
      reject(new Error('Screenshot queue timeout — server is overloaded'));
    }, QUEUE_TIMEOUT_MS);

    const entry = { resolve, reject, timer };
    waitQueue.push(entry);
  });
}

function releaseSlot() {
  if (waitQueue.length > 0) {
    const next = waitQueue.shift();
    clearTimeout(next.timer);
    next.resolve();
  } else {
    activeCount--;
  }
}

// ─── Active Context Tracker (for zombie cleanup) ────────────────────────────────

/** @type {Map<string, { context: import('playwright').BrowserContext, createdAt: number }>} */
const activeContexts = new Map();
let contextIdCounter = 0;

function trackContext(context) {
  const id = String(++contextIdCounter);
  activeContexts.set(id, { context, createdAt: Date.now() });
  return id;
}

function untrackContext(id) {
  activeContexts.delete(id);
}

// ─── Zombie Cleanup Watchdog ────────────────────────────────────────────────────

const zombieInterval = setInterval(async () => {
  const now = Date.now();
  for (const [id, entry] of activeContexts) {
    const age = now - entry.createdAt;
    if (age > CONTEXT_MAX_AGE_MS) {
      console.warn(`🧟 Killing zombie context ${id} (age: ${Math.round(age / 1000)}s)`);
      try {
        await entry.context.close();
      } catch (e) {
        console.warn(`   Failed to close zombie context ${id}:`, e.message);
      }
      activeContexts.delete(id);
    }
  }
}, ZOMBIE_CHECK_INTERVAL_MS);

// Don't let the interval keep the process alive during shutdown
zombieInterval.unref();

// ─── Helpers ────────────────────────────────────────────────────────────────────

function isValidUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function mapWaitUntil(waitUntil) {
  switch (waitUntil) {
    case 'load':
      return 'load';
    case 'domcontentloaded':
      return 'domcontentloaded';
    case 'networkidle0':
    case 'networkidle2':
    default:
      return 'networkidle';
  }
}

// ─── Core Screenshot Function ───────────────────────────────────────────────────

async function captureScreenshot(url, options = {}) {
  const {
    width = 1200,
    height = 800,
    quality = 80,
    fullPage = false,
    waitUntil = 'networkidle',
    timeout = SCREENSHOT_TIMEOUT_MS
  } = options;

  // Acquire a concurrency slot (may wait in queue)
  await acquireSlot();

  let context = null;
  let page = null;
  let contextId = null;

  try {
    if (isShuttingDown) {
      throw new Error('Server is shutting down');
    }

    const browser = await getBrowser();

    // Create a lightweight context (NOT a new browser process)
    context = await browser.newContext({
      viewport: {
        width: parseInt(width),
        height: parseInt(height)
      },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    contextId = trackContext(context);
    page = await context.newPage();

    // Navigate with timeout
    await page.goto(url, {
      waitUntil: mapWaitUntil(waitUntil),
      timeout: parseInt(timeout)
    });

    // Take screenshot
    const screenshotOptions = {
      type: 'png',
      fullPage: fullPage === 'true' || fullPage === true
    };

    if (!screenshotOptions.fullPage) {
      screenshotOptions.clip = {
        x: 0,
        y: 0,
        width: parseInt(width),
        height: parseInt(height)
      };
    }

    const screenshot = await page.screenshot(screenshotOptions);

    // Optimize to WebP
    const optimizedImage = await sharp(screenshot)
      .webp({ quality: parseInt(quality) })
      .toBuffer();

    return optimizedImage;
  } catch (error) {
    throw new Error(`Screenshot failed: ${error.message}`);
  } finally {
    // Always clean up context + page (this does NOT kill the browser)
    try {
      if (page) await page.close().catch(() => { });
      if (context) await context.close().catch(() => { });
    } catch (cleanupError) {
      console.warn('Cleanup warning:', cleanupError.message);
    }
    if (contextId) untrackContext(contextId);
    releaseSlot();
  }
}

// ─── Routes ─────────────────────────────────────────────────────────────────────

// Health check — now with operational metrics
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    browserStatus: browserInstance?.isConnected() ? 'connected' : 'disconnected',
    activeSessions: activeCount,
    queuedRequests: waitQueue.length,
    maxConcurrent: MAX_CONCURRENT
  });
});

// GET screenshot
app.get('/screenshot', async (req, res) => {
  try {
    const { url, width, height, quality, fullPage, waitUntil, timeout } = req.query;

    if (!url) {
      return res.status(400).json({
        error: 'URL parameter is required',
        example: '/screenshot?url=https://example.com&width=1200&height=800'
      });
    }

    if (!isValidUrl(url)) {
      return res.status(400).json({
        error: 'Invalid URL format. Must include http:// or https://'
      });
    }

    const widthNum = parseInt(width) || 1200;
    const heightNum = parseInt(height) || 800;

    if (widthNum < 100 || widthNum > 4000) {
      return res.status(400).json({
        error: 'Width must be between 100 and 4000 pixels'
      });
    }

    if (heightNum < 100 || heightNum > 4000) {
      return res.status(400).json({
        error: 'Height must be between 100 and 4000 pixels'
      });
    }

    const imageBuffer = await captureScreenshot(url, {
      width: widthNum,
      height: heightNum,
      quality: quality || 80,
      fullPage,
      waitUntil: waitUntil || 'networkidle2',
      timeout: timeout || SCREENSHOT_TIMEOUT_MS
    });

    res.set({
      'Content-Type': 'image/webp',
      'Content-Length': imageBuffer.length,
      'Cache-Control': 'public, max-age=3600',
      'X-Screenshot-URL': url,
      'X-Screenshot-Dimensions': `${widthNum}x${heightNum}`
    });

    res.send(imageBuffer);
  } catch (error) {
    console.error('Screenshot error:', error.message);
    const status = error.message.includes('queue timeout') ? 503 : 500;
    res.status(status).json({
      error: 'Failed to capture screenshot',
      message: error.message
    });
  }
});

// POST screenshot
app.post('/screenshot', async (req, res) => {
  try {
    const { url, options = {} } = req.body;

    if (!url) {
      return res.status(400).json({
        error: 'URL is required in request body'
      });
    }

    if (!isValidUrl(url)) {
      return res.status(400).json({
        error: 'Invalid URL format. Must include http:// or https://'
      });
    }

    const imageBuffer = await captureScreenshot(url, options);

    res.set({
      'Content-Type': 'image/webp',
      'Content-Length': imageBuffer.length,
      'Cache-Control': 'public, max-age=3600'
    });

    res.send(imageBuffer);
  } catch (error) {
    console.error('Screenshot error:', error.message);
    const status = error.message.includes('queue timeout') ? 503 : 500;
    res.status(status).json({
      error: 'Failed to capture screenshot',
      message: error.message
    });
  }
});

// API documentation
app.get('/api/docs', (req, res) => {
  res.json({
    title: 'HTML to Image API',
    version: '2.0.0',
    description: 'Convert any URL to optimized WebP images (singleton browser, concurrency-limited)',
    endpoints: {
      'GET /screenshot': {
        description: 'Capture screenshot of a URL',
        parameters: {
          url: { type: 'string', required: true, description: 'URL to capture' },
          width: { type: 'number', default: 1200, description: 'Screenshot width (100-4000px)' },
          height: { type: 'number', default: 800, description: 'Screenshot height (100-4000px)' },
          quality: { type: 'number', default: 80, description: 'WebP quality (1-100)' },
          fullPage: { type: 'boolean', default: false, description: 'Capture full page height' },
          waitUntil: { type: 'string', default: 'networkidle', description: 'When to consider loading finished' },
          timeout: { type: 'number', default: 30000, description: 'Navigation timeout in ms' }
        },
        example: '/screenshot?url=https://example.com&width=1200&height=800&quality=85'
      },
      'POST /screenshot': {
        description: 'Capture screenshot with complex options',
        body: {
          url: { type: 'string', required: true },
          options: { type: 'object', description: 'Screenshot options' }
        }
      },
      'GET /health': {
        description: 'Health check with operational metrics (activeSessions, queuedRequests, browserStatus)'
      }
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    availableEndpoints: ['/screenshot', '/health', '/api/docs']
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// ─── Graceful Shutdown ──────────────────────────────────────────────────────────

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);

  // Reject any queued requests
  while (waitQueue.length > 0) {
    const entry = waitQueue.shift();
    clearTimeout(entry.timer);
    entry.reject(new Error('Server is shutting down'));
  }

  // Wait for active sessions to finish (up to GRACEFUL_SHUTDOWN_MS)
  const deadline = Date.now() + GRACEFUL_SHUTDOWN_MS;
  while (activeCount > 0 && Date.now() < deadline) {
    console.log(`   Waiting for ${activeCount} active session(s)...`);
    await new Promise(r => setTimeout(r, 500));
  }

  if (activeCount > 0) {
    console.warn(`⚠️  Force-closing ${activeCount} remaining session(s)`);
    for (const [id, entry] of activeContexts) {
      try { await entry.context.close(); } catch (_) { }
      activeContexts.delete(id);
    }
  }

  // Close the singleton browser
  if (browserInstance) {
    try {
      await browserInstance.close();
      console.log('✅ Browser closed');
    } catch (e) {
      console.warn('Browser close error:', e.message);
    }
  }

  clearInterval(zombieInterval);
  console.log('👋 Server shutdown complete');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// ─── Server Startup ─────────────────────────────────────────────────────────────

// SSL Certificate paths
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || '/var/www/html-to-image/cert/n8n.gotobizpro.com.crt';
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || '/var/www/html-to-image/cert/n8n.gotobizpro.com.key';

let httpsOptions = null;

function loadSSLCertificates() {
  try {
    if (fs.existsSync(SSL_CERT_PATH) && fs.existsSync(SSL_KEY_PATH)) {
      httpsOptions = {
        key: fs.readFileSync(SSL_KEY_PATH),
        cert: fs.readFileSync(SSL_CERT_PATH)
      };
      console.log('✅ SSL certificates loaded successfully');
      return true;
    } else {
      console.log('⚠️  SSL certificates not found, falling back to HTTP');
      return false;
    }
  } catch (error) {
    console.error('❌ Error loading SSL certificates:', error.message);
    return false;
  }
}

async function startServer() {
  // Pre-launch the browser so the first request doesn't pay the cold-start cost
  try {
    await getBrowser();
  } catch (e) {
    console.error('❌ Failed to pre-launch browser. Requests will attempt lazy launch.', e.message);
  }

  const hasSSL = loadSSLCertificates();

  const startupInfo = () => {
    const proto = hasSSL ? 'https' : 'http';
    console.log(`🚀 HTML to Image server running on ${proto}://localhost:${PORT}`);
    console.log(`📖 API docs: ${proto}://localhost:${PORT}/api/docs`);
    console.log(`🩺 Health check: ${proto}://localhost:${PORT}/health`);
    console.log(`📸 Example: ${proto}://localhost:${PORT}/screenshot?url=https://example.com&width=1200&height=800`);
    console.log(`🔧 Max concurrent: ${MAX_CONCURRENT} | Context max age: ${CONTEXT_MAX_AGE_MS / 1000}s`);
    if (hasSSL) console.log(`🔒 SSL: ${SSL_CERT_PATH}`);
  };

  if (hasSSL && httpsOptions) {
    const httpsServer = https.createServer(httpsOptions, app);

    httpsServer.listen(PORT, () => startupInfo());

    httpsServer.on('error', (error) => {
      if (error.code === 'EACCES') {
        console.error(`❌ Permission denied to bind to port ${PORT}. Try running with sudo or use a port > 1024.`);
      } else if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use.`);
      } else {
        console.error('❌ HTTPS server error:', error.message);
      }
      process.exit(1);
    });
  } else {
    app.listen(PORT, () => startupInfo());
  }
}

startServer();