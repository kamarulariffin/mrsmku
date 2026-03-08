const puppeteer = require('puppeteer');

async function debugLoginFlow() {
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  
  console.log('Navigate to http://localhost:3000');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log('\nClick Skip button');
  let buttons = await page.$$('button');
  for (const button of buttons) {
    const buttonText = await page.evaluate(el => el.textContent, button);
    if (buttonText.includes('Skip')) {
      await button.click();
      await new Promise(resolve => setTimeout(resolve, 3000));
      break;
    }
  }
  
  console.log('\nClick Log Masuk button');
  buttons = await page.$$('button');
  for (const button of buttons) {
    const buttonText = await page.evaluate(el => el.textContent, button);
    if (buttonText.includes('Log Masuk')) {
      console.log(`Found "Log Masuk" button with text: "${buttonText.trim()}"`);
      await button.click();
      await new Promise(resolve => setTimeout(resolve, 3000));
      break;
    }
  }
  
  await page.screenshot({ path: 'after-log-masuk-click.png' });
  console.log('\nScreenshot saved: after-log-masuk-click.png');
  
  console.log('\nChecking page state:');
  console.log('URL:', page.url());
  
  const allInputs = await page.$$('input');
  console.log(`\nFound ${allInputs.length} input elements`);
  
  for (let i = 0; i < allInputs.length; i++) {
    const input = allInputs[i];
    const type = await page.evaluate(el => el.type, input);
    const name = await page.evaluate(el => el.name || '', input);
    const placeholder = await page.evaluate(el => el.placeholder || '', input);
    const visible = await input.isIntersectingViewport();
    console.log(`Input ${i+1}: type="${type}", name="${name}", placeholder="${placeholder}", visible=${visible}`);
  }
  
  const allButtons = await page.$$('button');
  console.log(`\nFound ${allButtons.length} button elements`);
  
  for (let i = 0; i < Math.min(allButtons.length, 10); i++) {
    const button = allButtons[i];
    const text = await page.evaluate(el => el.textContent, button);
    console.log(`Button ${i+1}: "${text.trim().substring(0, 50)}"`);
  }
  
  const bodyText = await page.evaluate(() => document.body.textContent.substring(0, 500));
  console.log('\nPage text (first 500 chars):');
  console.log(bodyText);
  
  await browser.close();
}

debugLoginFlow().catch(console.error);
