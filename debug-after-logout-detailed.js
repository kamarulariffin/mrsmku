const puppeteer = require('puppeteer');

async function debugAfterLogout() {
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
  
  console.log('Step 2: Clear storage and navigate');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  
  const cookies = await page.cookies();
  if (cookies.length > 0) {
    await page.deleteCookie(...cookies);
  }
  
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log('\nURL after logout:', page.url());
  await page.screenshot({ path: 'after-logout-detailed.png' });
  console.log('Screenshot saved: after-logout-detailed.png');
  
  const inputsAfterLogout = await page.$$('input');
  console.log(`\nFound ${inputsAfterLogout.length} inputs`);
  
  const buttonsAfterLogout = await page.$$('button');
  console.log(`Found ${buttonsAfterLogout.length} buttons`);
  
  for (let i = 0; i < Math.min(buttonsAfterLogout.length, 10); i++) {
    const button = buttonsAfterLogout[i];
    const text = await page.evaluate(el => el.textContent, button);
    console.log(`Button ${i+1}: "${text.trim().substring(0, 50)}"`);
  }
  
  console.log('\nStep 3: Try to find and click Skip again');
  for (const button of buttonsAfterLogout) {
    const buttonText = await page.evaluate(el => el.textContent, button);
    if (buttonText.includes('Skip')) {
      console.log('Found Skip button!');
      await button.click();
      await new Promise(resolve => setTimeout(resolve, 3000));
      break;
    }
  }
  
  console.log('\nURL after Skip:', page.url());
  
  const buttonsAfterSkip = await page.$$('button');
  console.log(`Found ${buttonsAfterSkip.length} buttons after Skip`);
  
  for (let i = 0; i < Math.min(buttonsAfterSkip.length, 10); i++) {
    const button = buttonsAfterSkip[i];
    const text = await page.evaluate(el => el.textContent, button);
    console.log(`Button ${i+1}: "${text.trim().substring(0, 50)}"`);
  }
  
  await browser.close();
}

debugAfterLogout().catch(console.error);
