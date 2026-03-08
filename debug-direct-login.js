const puppeteer = require('puppeteer');

async function debugDirectLoginNav() {
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  
  console.log('Navigate directly to http://localhost:3000/login');
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  await page.screenshot({ path: 'direct-login-nav.png' });
  console.log('Screenshot saved: direct-login-nav.png');
  
  console.log('\nURL:', page.url());
  
  const allInputs = await page.$$('input');
  console.log(`\nFound ${allInputs.length} input elements`);
  
  for (let i = 0; i < allInputs.length; i++) {
    const input = allInputs[i];
    const type = await page.evaluate(el => el.type, input);
    const visible = await input.isIntersectingViewport();
    console.log(`Input ${i+1}: type="${type}", visible=${visible}`);
  }
  
  const allButtons = await page.$$('button');
  console.log(`\nFound ${allButtons.length} button elements`);
  
  for (let i = 0; i < Math.min(allButtons.length, 10); i++) {
    const button = allButtons[i];
    const text = await page.evaluate(el => el.textContent, button);
    console.log(`Button ${i+1}: "${text.trim().substring(0, 50)}"`);
  }
  
  await browser.close();
}

debugDirectLoginNav().catch(console.error);
