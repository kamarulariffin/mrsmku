const puppeteer = require('puppeteer');

async function debugLogin() {
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  
  console.log('Step 1: Navigate to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  await page.screenshot({ path: 'step1-initial.png' });
  console.log('Screenshot saved: step1-initial.png');
  
  console.log('\nStep 2: Looking for Skip button...');
  const buttons = await page.$$('button');
  console.log(`Found ${buttons.length} buttons`);
  
  for (let i = 0; i < buttons.length; i++) {
    const button = buttons[i];
    const buttonText = await page.evaluate(el => el.textContent, button);
    console.log(`Button ${i+1}: "${buttonText.trim()}"`);
    
    if (buttonText.includes('Skip')) {
      console.log('Clicking Skip button...');
      await button.click();
      await new Promise(resolve => setTimeout(resolve, 3000));
      break;
    }
  }
  
  await page.screenshot({ path: 'step2-after-skip.png' });
  console.log('Screenshot saved: step2-after-skip.png');
  
  console.log('\nStep 3: Checking for inputs...');
  const allInputs = await page.$$('input');
  console.log(`Found ${allInputs.length} input elements`);
  
  for (let i = 0; i < allInputs.length; i++) {
    const input = allInputs[i];
    const type = await page.evaluate(el => el.type, input);
    const name = await page.evaluate(el => el.name || '', input);
    const placeholder = await page.evaluate(el => el.placeholder || '', input);
    const id = await page.evaluate(el => el.id || '', input);
    console.log(`Input ${i+1}: type="${type}", name="${name}", id="${id}", placeholder="${placeholder}"`);
  }
  
  const allButtons2 = await page.$$('button');
  console.log(`\nFound ${allButtons2.length} button elements after Skip`);
  
  for (let i = 0; i < Math.min(allButtons2.length, 10); i++) {
    const button = allButtons2[i];
    const text = await page.evaluate(el => el.textContent, button);
    const type = await page.evaluate(el => el.type, button);
    console.log(`Button ${i+1}: type="${type}", text="${text.trim().substring(0, 50)}"`);
  }
  
  console.log('\nStep 4: Checking page URL and title...');
  console.log('URL:', page.url());
  console.log('Title:', await page.title());
  
  await browser.close();
}

debugLogin().catch(console.error);
