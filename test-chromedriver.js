const { Builder, By } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function testChromeDriver() {
  console.log('🧪 Testing ChromeDriver on Pi 4...');
  
  try {
    // Create Chrome options
    const options = new chrome.Options();
    options.addArguments('--headless');
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-dev-shm-usage');
    options.addArguments('--disable-gpu');
    
    // Pi 4 specific settings
    if (process.platform === 'linux') {
      options.setChromeBinaryPath('/usr/bin/chromium-browser');
      console.log('✅ Using Chromium binary');
    }
    
    // Create service with explicit ChromeDriver path
    const service = new chrome.ServiceBuilder('/usr/bin/chromedriver');
    console.log('✅ Using ChromeDriver at /usr/bin/chromedriver');
    
    // Create WebDriver
    const driver = new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .setChromeService(service)
      .build();
    
    console.log('✅ WebDriver created successfully');
    
    // Test navigation
    await driver.get('https://www.google.com');
    console.log('✅ Successfully navigated to Google');
    
    // Get page title
    const title = await driver.getTitle();
    console.log(`✅ Page title: ${title}`);
    
    // Close driver
    await driver.quit();
    console.log('✅ ChromeDriver test completed successfully!');
    
  } catch (error) {
    console.error('❌ ChromeDriver test failed:');
    console.error(error.message);
    console.error(error.stack);
  }
}

// Run the test
testChromeDriver(); 