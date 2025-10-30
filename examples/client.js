const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Server configuration
const SERVER_URL = 'http://localhost:3000';

/**
 * Example Node.js client for the HTML to Image API
 */
class ScreenshotClient {
  constructor(baseUrl = SERVER_URL) {
    this.baseUrl = baseUrl;
    this.axios = axios.create({
      baseURL: baseUrl,
      timeout: 60000, // 60 second timeout
      responseType: 'arraybuffer' // Important for binary image data
    });
  }

  /**
   * Take a screenshot using GET method
   */
  async takeScreenshot(url, options = {}) {
    const params = {
      url,
      width: options.width || 1200,
      height: options.height || 800,
      quality: options.quality || 80,
      fullPage: options.fullPage || false,
      waitUntil: options.waitUntil || 'networkidle2',
      timeout: options.timeout || 30000
    };

    try {
      const response = await this.axios.get('/screenshot', { params });
      return {
        success: true,
        data: response.data,
        headers: response.headers,
        size: response.data.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message,
        status: error.response?.status
      };
    }
  }

  /**
   * Take a screenshot using POST method
   */
  async takeScreenshotPost(url, options = {}) {
    const requestBody = {
      url,
      options
    };

    try {
      const response = await this.axios.post('/screenshot', requestBody);
      return {
        success: true,
        data: response.data,
        headers: response.headers,
        size: response.data.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message,
        status: error.response?.status
      };
    }
  }

  /**
   * Save image buffer to file
   */
  async saveImage(imageBuffer, filename) {
    try {
      const outputDir = path.join(__dirname, 'outputs');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const filepath = path.join(outputDir, filename);
      fs.writeFileSync(filepath, imageBuffer);
      
      return {
        success: true,
        filepath,
        size: imageBuffer.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check server health
   */
  async healthCheck() {
    try {
      const response = await axios.get(`${this.baseUrl}/health`);
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Example usage functions
async function basicExample() {
  console.log('🔄 Running basic example...');
  
  const client = new ScreenshotClient();
  
  const result = await client.takeScreenshot('https://example.com', {
    width: 1200,
    height: 800,
    quality: 85
  });

  if (result.success) {
    const saveResult = await client.saveImage(result.data, 'example-basic.webp');
    if (saveResult.success) {
      console.log('✅ Basic screenshot saved:', saveResult.filepath);
      console.log(`   File size: ${Math.round(saveResult.size / 1024)}KB`);
    }
  } else {
    console.error('❌ Basic screenshot failed:', result.error);
  }
}

async function advancedExample() {
  console.log('🔄 Running advanced example...');
  
  const client = new ScreenshotClient();
  
  const result = await client.takeScreenshotPost('https://github.com', {
    width: 1920,
    height: 1080,
    quality: 95,
    fullPage: true,
    waitUntil: 'networkidle0',
    timeout: 45000
  });

  if (result.success) {
    const saveResult = await client.saveImage(result.data, 'github-advanced.webp');
    if (saveResult.success) {
      console.log('✅ Advanced screenshot saved:', saveResult.filepath);
      console.log(`   File size: ${Math.round(saveResult.size / 1024)}KB`);
    }
  } else {
    console.error('❌ Advanced screenshot failed:', result.error);
  }
}

async function batchExample() {
  console.log('🔄 Running batch example...');
  
  const client = new ScreenshotClient();
  
  const urls = [
    { url: 'https://httpbin.org/html', filename: 'httpbin.webp' },
    { url: 'https://example.com', filename: 'example.webp' },
    { url: 'https://httpbin.org/json', filename: 'httpbin-json.webp' }
  ];

  const results = await Promise.all(
    urls.map(async ({ url, filename }) => {
      const result = await client.takeScreenshot(url, {
        width: 800,
        height: 600,
        quality: 80
      });

      if (result.success) {
        const saveResult = await client.saveImage(result.data, filename);
        return {
          url,
          filename,
          success: saveResult.success,
          size: saveResult.size
        };
      } else {
        return {
          url,
          filename,
          success: false,
          error: result.error
        };
      }
    })
  );

  console.log('📊 Batch results:');
  results.forEach(result => {
    if (result.success) {
      console.log(`✅ ${result.url} -> ${result.filename} (${Math.round(result.size / 1024)}KB)`);
    } else {
      console.log(`❌ ${result.url} -> Failed: ${result.error}`);
    }
  });
}

async function errorHandlingExample() {
  console.log('🔄 Running error handling example...');
  
  const client = new ScreenshotClient();
  
  // Test invalid URL
  let result = await client.takeScreenshot('invalid-url');
  console.log('Invalid URL test:', result.success ? '❌ Unexpected success' : '✅ Correctly failed');
  
  // Test missing URL
  result = await client.takeScreenshot('');
  console.log('Missing URL test:', result.success ? '❌ Unexpected success' : '✅ Correctly failed');
  
  // Test invalid dimensions
  result = await client.takeScreenshot('https://example.com', {
    width: 5000,
    height: 5000
  });
  console.log('Invalid dimensions test:', result.success ? '❌ Unexpected success' : '✅ Correctly failed');
}

// Main execution
async function runExamples() {
  console.log('🚀 HTML to Image Client Examples\n');
  
  const client = new ScreenshotClient();
  
  // Check server health first
  console.log('🏥 Checking server health...');
  const health = await client.healthCheck();
  
  if (!health.success) {
    console.error('❌ Server is not running or not accessible');
    console.error('💡 Make sure to start the server first with: npm start');
    return;
  }
  
  console.log('✅ Server is healthy:', health.data.status);
  console.log('');
  
  try {
    await basicExample();
    console.log('');
    
    await advancedExample();
    console.log('');
    
    await batchExample();
    console.log('');
    
    await errorHandlingExample();
    console.log('');
    
    console.log('🎉 All examples completed!');
    console.log('📁 Check the examples/outputs directory for screenshots');
  } catch (error) {
    console.error('💥 Example execution failed:', error);
  }
}

// Export for use as module
module.exports = ScreenshotClient;

// Run examples if called directly
if (require.main === module) {
  runExamples();
}