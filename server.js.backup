const express = require('express');
const { chromium } = require('playwright');
const sharp = require('sharp');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});
app.use(limiter);

// Browser configuration for Playwright
const BROWSER_CONFIG = {
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage'
  ],
  timeout: 30000
};

// Create a new browser instance using Playwright
async function createBrowser() {
  try {
    console.log('Creating new Chromium browser instance...');
    const browser = await chromium.launch(BROWSER_CONFIG);
    console.log('Browser created successfully');
    return browser;
  } catch (error) {
    console.error('Failed to create browser instance:', error.message);
    throw new Error('Failed to create browser instance');
  }
}

// Validate URL
function isValidUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

// Main screenshot function using Playwright
async function captureScreenshot(url, options = {}) {
  const {
    width = 1200,
    height = 800,
    quality = 80,
    fullPage = false,
    waitUntil = 'networkidle',
    timeout = 30000
  } = options;

  let browser;
  let context;
  let page;
  
  try {
    // Create a fresh browser instance for this request
    browser = await createBrowser();
    
    // Create browser context (like an incognito window)
    context = await browser.newContext({
      viewport: { 
        width: parseInt(width), 
        height: parseInt(height)
      },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    page = await context.newPage();

    // Map waitUntil options
    let playwrightWaitUntil;
    switch (waitUntil) {
      case 'load':
        playwrightWaitUntil = 'load';
        break;
      case 'domcontentloaded':
        playwrightWaitUntil = 'domcontentloaded';
        break;
      case 'networkidle0':
      case 'networkidle2':
      default:
        playwrightWaitUntil = 'networkidle';
        break;
    }

    // Navigate to URL with timeout
    await page.goto(url, { 
      waitUntil: playwrightWaitUntil,
      timeout: parseInt(timeout)
    });

    // Take screenshot
    const screenshotOptions = {
      type: 'png',
      fullPage: fullPage === 'true' || fullPage === true
    };

    // Add clip if not full page
    if (!screenshotOptions.fullPage) {
      screenshotOptions.clip = {
        x: 0,
        y: 0,
        width: parseInt(width),
        height: parseInt(height)
      };
    }

    const screenshot = await page.screenshot(screenshotOptions);

    // Optimize to WebP using Sharp
    const optimizedImage = await sharp(screenshot)
      .webp({ quality: parseInt(quality) })
      .toBuffer();

    return optimizedImage;
  } catch (error) {
    throw new Error(`Screenshot failed: ${error.message}`);
  } finally {
    // Clean up resources in proper order
    try {
      if (page) await page.close();
      if (context) await context.close();
      if (browser) await browser.close();
    } catch (cleanupError) {
      console.warn('Cleanup warning:', cleanupError.message);
    }
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Main screenshot endpoint
app.get('/screenshot', async (req, res) => {
  try {
    const { url, width, height, quality, fullPage, waitUntil, timeout } = req.query;

    // Validate required parameters
    if (!url) {
      return res.status(400).json({ 
        error: 'URL parameter is required',
        example: '/screenshot?url=https://example.com&width=1200&height=800'
      });
    }

    // Validate URL format
    if (!isValidUrl(url)) {
      return res.status(400).json({ 
        error: 'Invalid URL format. Must include http:// or https://'
      });
    }

    // Validate dimensions
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

    // Capture screenshot with timeout
    const screenshotPromise = captureScreenshot(url, {
      width: widthNum,
      height: heightNum,
      quality: quality || 80,
      fullPage,
      waitUntil: waitUntil || 'networkidle2',
      timeout: timeout || 30000
    });
    
    // Add overall timeout for the entire request
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Screenshot request timeout')), 60000);
    });
    
    const imageBuffer = await Promise.race([screenshotPromise, timeoutPromise]);

    // Set headers for image response
    res.set({
      'Content-Type': 'image/webp',
      'Content-Length': imageBuffer.length,
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      'X-Screenshot-URL': url,
      'X-Screenshot-Dimensions': `${widthNum}x${heightNum}`
    });

    res.send(imageBuffer);
  } catch (error) {
    console.error('Screenshot error:', error);
    res.status(500).json({ 
      error: 'Failed to capture screenshot',
      message: error.message
    });
  }
});

// POST endpoint for bulk screenshots or complex requests
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

    // Capture screenshot with timeout
    const screenshotPromise = captureScreenshot(url, options);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Screenshot request timeout')), 60000);
    });
    
    const imageBuffer = await Promise.race([screenshotPromise, timeoutPromise]);

    res.set({
      'Content-Type': 'image/webp',
      'Content-Length': imageBuffer.length,
      'Cache-Control': 'public, max-age=3600'
    });

    res.send(imageBuffer);
  } catch (error) {
    console.error('Screenshot error:', error);
    res.status(500).json({ 
      error: 'Failed to capture screenshot',
      message: error.message
    });
  }
});

// API documentation endpoint
app.get('/api/docs', (req, res) => {
  res.json({
    title: 'HTML to Image API',
    version: '1.0.0',
    description: 'Convert any URL to optimized WebP images',
    endpoints: {
      'GET /screenshot': {
        description: 'Capture screenshot of a URL',
        parameters: {
          url: { type: 'string', required: true, description: 'URL to capture' },
          width: { type: 'number', default: 1200, description: 'Screenshot width (100-4000px)' },
          height: { type: 'number', default: 800, description: 'Screenshot height (100-4000px)' },
          quality: { type: 'number', default: 80, description: 'WebP quality (1-100)' },
          fullPage: { type: 'boolean', default: false, description: 'Capture full page height' },
          waitUntil: { type: 'string', default: 'networkidle2', description: 'When to consider loading finished' },
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
        description: 'Health check endpoint'
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

// Graceful shutdown
async function gracefulShutdown(signal) {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  
  // Since we're using per-request browsers, no need for global cleanup
  // The process exit will handle any remaining resources
  
  console.log('Server shutdown complete');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit on unhandled rejections in production, just log them
  if (process.env.NODE_ENV !== 'production') {
    gracefulShutdown('unhandledRejection');
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 HTML to Image server running on port ${PORT}`);
  console.log(`📖 API docs: http://localhost:${PORT}/api/docs`);
  console.log(`🩺 Health check: http://localhost:${PORT}/health`);
  console.log(`📸 Example: http://localhost:${PORT}/screenshot?url=https://example.com&width=1200&height=800`);
  console.log(`💡 Using per-request browser instances for better stability`);
});