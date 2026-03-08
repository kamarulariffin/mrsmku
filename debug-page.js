const puppeteer = require('puppeteer');

async function debugPage() {
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  
  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 15000 });
  
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  await page.screenshot({ path: 'page-debug.png', fullPage: true });
  console.log('Screenshot saved to page-debug.png');
  
  const html = await page.content();
  console.log('\n=== Page HTML (first 2000 chars) ===');
  console.log(html.substring(0, 2000));
  
  const allInputs = await page.$$('input');
  console.log(`\n=== Found ${allInputs.length} input elements ===`);
  
  for (let i = 0; i < allInputs.length; i++) {
    const input = allInputs[i];
    const type = await page.evaluate(el => el.type, input);
    const name = await page.evaluate(el => el.name, input);
    const placeholder = await page.evaluate(el => el.placeholder, input);
    console.log(`Input ${i+1}: type="${type}", name="${name}", placeholder="${placeholder}"`);
  }
  
  const allButtons = await page.$$('button');
  console.log(`\n=== Found ${allButtons.length} button elements ===`);
  
  for (let i = 0; i < Math.min(allButtons.length, 5); i++) {
    const button = allButtons[i];
    const text = await page.evaluate(el => el.textContent, button);
    console.log(`Button ${i+1}: "${text.trim()}"`);
  }
  
  await browser.close();
}

debugPage().catch(console.error);
