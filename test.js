const http = require('http');
const fs = require('fs');
const path = require('path');

// Test configuration
const SERVER_URL = 'http://localhost:3000';
const TEST_OUTPUTS_DIR = path.join(__dirname, 'test-outputs');

// Ensure test outputs directory exists
if (!fs.existsSync(TEST_OUTPUTS_DIR)) {
  fs.mkdirSync(TEST_OUTPUTS_DIR);
}

// Test cases
const testCases = [
  {
    name: 'Basic Screenshot',
    endpoint: '/screenshot?url=https://example.com&width=800&height=600',
    outputFile: 'basic-screenshot.webp'
  },
  {
    name: 'High Quality Screenshot',
    endpoint: '/screenshot?url=https://github.com&width=1200&height=800&quality=95',
    outputFile: 'high-quality-screenshot.webp'
  },
  {
    name: 'Full Page Screenshot',
    endpoint: '/screenshot?url=https://httpbin.org/html&fullPage=true&width=1024&height=768',
    outputFile: 'full-page-screenshot.webp'
  }
];

// Helper function to make HTTP requests
function makeRequest(url, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const req = http.request(options, (res) => {
      let responseData = Buffer.alloc(0);
      
      res.on('data', (chunk) => {
        responseData = Buffer.concat([responseData, chunk]);
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: responseData
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// Test functions
async function testHealthCheck() {
  console.log('🏥 Testing health check endpoint...');
  try {
    const response = await makeRequest(`${SERVER_URL}/health`);
    if (response.statusCode === 200) {
      const healthData = JSON.parse(response.data.toString());
      console.log('✅ Health check passed:', healthData.status);
      return true;
    } else {
      console.log('❌ Health check failed with status:', response.statusCode);
      return false;
    }
  } catch (error) {
    console.log('❌ Health check error:', error.message);
    return false;
  }
}

async function testApiDocs() {
  console.log('📖 Testing API documentation endpoint...');
  try {
    const response = await makeRequest(`${SERVER_URL}/api/docs`);
    if (response.statusCode === 200) {
      const docsData = JSON.parse(response.data.toString());
      console.log('✅ API docs available:', docsData.title);
      return true;
    } else {
      console.log('❌ API docs failed with status:', response.statusCode);
      return false;
    }
  } catch (error) {
    console.log('❌ API docs error:', error.message);
    return false;
  }
}

async function testScreenshots() {
  console.log('📸 Testing screenshot endpoints...');
  let passedTests = 0;
  
  for (const testCase of testCases) {
    console.log(`\n🔍 Running: ${testCase.name}`);
    try {
      const response = await makeRequest(`${SERVER_URL}${testCase.endpoint}`);
      
      if (response.statusCode === 200) {
        // Check if response is actually an image
        const contentType = response.headers['content-type'];
        if (contentType && contentType.includes('image/webp')) {
          // Save the image for manual inspection
          const outputPath = path.join(TEST_OUTPUTS_DIR, testCase.outputFile);
          fs.writeFileSync(outputPath, response.data);
          
          console.log(`✅ ${testCase.name} passed - saved to ${testCase.outputFile}`);
          console.log(`   File size: ${Math.round(response.data.length / 1024)}KB`);
          passedTests++;
        } else {
          console.log(`❌ ${testCase.name} failed - invalid content type:`, contentType);
        }
      } else {
        console.log(`❌ ${testCase.name} failed with status:`, response.statusCode);
        if (response.data.length < 1000) {
          console.log('   Response:', response.data.toString());
        }
      }
    } catch (error) {
      console.log(`❌ ${testCase.name} error:`, error.message);
    }
  }
  
  return passedTests;
}

async function testPostEndpoint() {
  console.log('\n📮 Testing POST screenshot endpoint...');
  try {
    const requestData = {
      url: 'https://httpbin.org/json',
      options: {
        width: 800,
        height: 600,
        quality: 85,
        waitUntil: 'networkidle2'
      }
    };
    
    const response = await makeRequest(`${SERVER_URL}/screenshot`, 'POST', requestData);
    
    if (response.statusCode === 200) {
      const contentType = response.headers['content-type'];
      if (contentType && contentType.includes('image/webp')) {
        const outputPath = path.join(TEST_OUTPUTS_DIR, 'post-request-screenshot.webp');
        fs.writeFileSync(outputPath, response.data);
        console.log('✅ POST screenshot test passed');
        console.log(`   File size: ${Math.round(response.data.length / 1024)}KB`);
        return true;
      } else {
        console.log('❌ POST screenshot test failed - invalid content type:', contentType);
      }
    } else {
      console.log('❌ POST screenshot test failed with status:', response.statusCode);
    }
  } catch (error) {
    console.log('❌ POST screenshot test error:', error.message);
  }
  return false;
}

async function testErrorHandling() {
  console.log('\n🚨 Testing error handling...');
  const errorTests = [
    {
      name: 'Missing URL parameter',
      endpoint: '/screenshot',
      expectedStatus: 400
    },
    {
      name: 'Invalid URL format',
      endpoint: '/screenshot?url=invalid-url',
      expectedStatus: 400
    },
    {
      name: 'Invalid dimensions',
      endpoint: '/screenshot?url=https://example.com&width=5000&height=5000',
      expectedStatus: 400
    }
  ];
  
  let passedErrorTests = 0;
  
  for (const test of errorTests) {
    try {
      const response = await makeRequest(`${SERVER_URL}${test.endpoint}`);
      if (response.statusCode === test.expectedStatus) {
        console.log(`✅ ${test.name} - correctly returned ${test.expectedStatus}`);
        passedErrorTests++;
      } else {
        console.log(`❌ ${test.name} - expected ${test.expectedStatus}, got ${response.statusCode}`);
      }
    } catch (error) {
      console.log(`❌ ${test.name} error:`, error.message);
    }
  }
  
  return passedErrorTests;
}

// Main test runner
async function runTests() {
  console.log('🧪 Starting HTML to Image Server Tests\n');
  console.log('📁 Test outputs will be saved to:', TEST_OUTPUTS_DIR);
  console.log('🔗 Testing server at:', SERVER_URL);
  console.log('\n' + '='.repeat(50));
  
  let totalTests = 0;
  let passedTests = 0;
  
  // Test health check
  totalTests++;
  if (await testHealthCheck()) passedTests++;
  
  // Test API docs
  totalTests++;
  if (await testApiDocs()) passedTests++;
  
  // Test GET screenshots
  const screenshotTestsCount = testCases.length;
  totalTests += screenshotTestsCount;
  passedTests += await testScreenshots();
  
  // Test POST endpoint
  totalTests++;
  if (await testPostEndpoint()) passedTests++;
  
  // Test error handling
  const errorTestsCount = 3;
  totalTests += errorTestsCount;
  passedTests += await testErrorHandling();
  
  // Results summary
  console.log('\n' + '='.repeat(50));
  console.log(`📊 Test Results: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All tests passed! Your server is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Check the output above for details.');
  }
  
  console.log(`\n📁 Check the ${TEST_OUTPUTS_DIR} directory for screenshot samples.`);
}

// Check if server is running before starting tests
async function checkServerAndRunTests() {
  try {
    await makeRequest(`${SERVER_URL}/health`);
    await runTests();
  } catch (error) {
    console.log('❌ Server is not running or not accessible at', SERVER_URL);
    console.log('💡 Make sure to start the server first with: npm start');
    console.log('   Then run the tests with: npm test');
  }
}

checkServerAndRunTests();