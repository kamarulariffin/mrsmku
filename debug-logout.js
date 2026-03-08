const puppeteer = require('puppeteer');

async function debugLogout() {
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  
  console.log('Step 1: Login as parent');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  let buttons = await page.$$('button');
  for (const button of buttons) {
    const buttonText = await page.evaluate(el => el.textContent, button);
    if (buttonText.includes('Skip')) {
      await button.click();
      await new Promise(resolve => setTimeout(resolve, 2000));
      break;
    }
  }
  
  buttons = await page.$$('button');
  for (const button of buttons) {
    const buttonText = await page.evaluate(el => el.textContent, button);
    if (buttonText.includes('Log Masuk')) {
      await button.click();
      await new Promise(resolve => setTimeout(resolve, 3000));
      break;
    }
  }
  
  const inputs = await page.$$('input');
  await inputs[0].type('parent@muafakat.link');
  await inputs[1].type('parent123');
  
  buttons = await page.$$('button');
  for (const button of buttons) {
    const buttonText = await page.evaluate(el => el.textContent, button);
    if (buttonText === 'Log Masuk' || buttonText === 'Login') {
      await button.click();
      await new Promise(resolve => setTimeout(resolve, 3000));
      break;
    }
  }
  
  console.log('Step 2: After login, URL:', page.url());
  
  console.log('\nStep 3: Looking for logout button');
  const allButtons = await page.$$('button');
  for (const button of allButtons) {
    const buttonText = await page.evaluate(el => el.textContent.toLowerCase(), button);
    if (buttonText.includes('log out') || buttonText.includes('keluar') || buttonText.includes('logout')) {
      console.log('Found logout button:', buttonText);
      await button.click();
      await new Promise(resolve => setTimeout(resolve, 3000));
      break;
    }
  }
  
  console.log('\nStep 4: After logout, URL:', page.url());
  await page.screenshot({ path: 'after-logout.png' });
  console.log('Screenshot saved: after-logout.png');
  
  const inputsAfterLogout = await page.$$('input');
  console.log(`Found ${inputsAfterLogout.length} inputs after logout`);
  
  const buttonsAfterLogout = await page.$$('button');
  console.log(`Found ${buttonsAfterLogout.length} buttons after logout`);
  
  for (let i = 0; i < Math.min(buttonsAfterLogout.length, 10); i++) {
    const button = buttonsAfterLogout[i];
    const text = await page.evaluate(el => el.textContent, button);
    console.log(`Button ${i+1}: "${text.trim().substring(0, 50)}"`);
  }
  
  await browser.close();
}

debugLogout().catch(console.error);
