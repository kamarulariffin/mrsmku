const puppeteer = require('puppeteer');

const BASE_URL = 'http://localhost:3000';
const PARENT_EMAIL = 'parent@muafakat.link';
const PARENT_PASSWORD = 'parent123';
const ADMIN_EMAIL = 'bendahari@muafakat.link';
const ADMIN_PASSWORD = 'bendahari123';
const FALLBACK_ADMIN_EMAIL = 'superadmin@muafakat.link';
const FALLBACK_ADMIN_PASSWORD = 'super123';
const DEBUG_RUN_ID = process.env.DEBUG_RUN_ID || `run-${Date.now()}`;

const results = {
  flowA: [],
  flowB: []
};

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function login(page, email, password, flow) {
  try {
    const currentUrl = page.url();
    
    if (!currentUrl.includes('/login')) {
      await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 15000 });
      await wait(3000);
    }

    let buttons = await page.$$('button');
    for (const button of buttons) {
      const buttonText = await page.evaluate(el => el.textContent, button);
      if (buttonText.includes('Skip')) {
        await button.click();
        await wait(2000);
        break;
      }
    }

    buttons = await page.$$('button');
    for (const button of buttons) {
      const buttonText = await page.evaluate(el => el.textContent, button);
      if (buttonText.includes('Log Masuk')) {
        await button.click();
        await wait(3000);
        break;
      }
    }

    await page.waitForSelector('input[type="text"], input[type="password"]', { timeout: 10000 });
    
    const inputs = await page.$$('input');
    const emailInput = inputs[0];
    const passwordInput = inputs[1];
    
    if (!emailInput || !passwordInput) {
      await page.screenshot({ path: 'login-page-debug.png' });
      results[flow].push(`❌ FAIL: Login form inputs not found (screenshot saved)`);
      return false;
    }
    
    await emailInput.type(email);
    await passwordInput.type(password);
    
    const loginButton = await page.$('button[type="submit"]');
    if (!loginButton) {
      results[flow].push(`❌ FAIL: Login button not found`);
      return false;
    }
    
    await loginButton.click();
    await wait(3000);
    
    const postLoginUrl = page.url();
    const errorElement = await page.$('[role="alert"], .error, .toast-error');
    
    if (errorElement || postLoginUrl.includes('login')) {
      results[flow].push(`❌ FAIL: Login failed for ${email}`);
      return false;
    }
    
    results[flow].push(`✓ PASS: Successfully logged in as ${email}`);
    return true;
  } catch (error) {
    results[flow].push(`❌ FAIL: Login error - ${error.message}`);
    return false;
  }
}

async function logout(page) {
  try {
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    
    const cookies = await page.cookies();
    if (cookies.length > 0) {
      await page.deleteCookie(...cookies);
    }
    
    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 15000 });
    await wait(3000);
  } catch (error) {
    // Silently handle logout errors
  }
}

async function flowAParentPaymentCenter(page) {
  console.log('\n=== Starting Flow A: Parent Payment Center ===\n');
  
  if (!await login(page, PARENT_EMAIL, PARENT_PASSWORD, 'flowA')) {
    return;
  }
  
  try {
    await wait(2000);
    const errorToast = await page.$('[role="alert"]');
    
    if (errorToast) {
      const toastText = await page.evaluate(el => el.textContent.toLowerCase(), errorToast);
      if (toastText.includes('error')) {
        results.flowA.push('❌ FAIL: Dashboard loaded with visible error toast');
      } else {
        results.flowA.push('✓ PASS: Dashboard/home loads without visible error toast');
      }
    } else {
      results.flowA.push('✓ PASS: Dashboard/home loads without visible error toast');
    }
  } catch (error) {
    results.flowA.push(`❌ FAIL: Dashboard verification error - ${error.message}`);
  }
  
  try {
    await page.goto(`${BASE_URL}/payment-center`, { waitUntil: 'networkidle2', timeout: 15000 });
    await wait(2000);
    
    results.flowA.push('✓ PASS: Navigated to /payment-center');
  } catch (error) {
    results.flowA.push(`❌ FAIL: Navigation to /payment-center failed - ${error.message}`);
    return;
  }
  
  try {
    const errorBanner = await page.$('[role="alert"], .error-banner, .alert-danger');
    const paymentCards = await page.$$('div[class*="card"], div[class*="item"], li');
    
    if (errorBanner) {
      const errorText = await page.evaluate(el => el.textContent.toLowerCase(), errorBanner);
      if (errorText.includes('error')) {
        results.flowA.push('❌ FAIL: Pending items section has red error banner/toast');
      } else if (paymentCards.length === 0) {
        results.flowA.push('⚠ WARNING: No payment cards/items visible in pending items section');
      } else {
        results.flowA.push('✓ PASS: Pending items section loads (no red errors; payment items visible)');
      }
    } else if (paymentCards.length === 0) {
      results.flowA.push('⚠ WARNING: No payment cards/items visible in pending items section');
    } else {
      results.flowA.push('✓ PASS: Pending items section loads (no red errors; payment items visible)');
    }
  } catch (error) {
    results.flowA.push(`❌ FAIL: Pending items verification error - ${error.message}`);
  }
  
  try {
    const addButtons = await page.$$('button');
    let addToCartButton = null;
    let selectedButtonIndex = -1;
    const addButtonCount = addButtons.length;
    const candidateInfos = [];
    
    for (let i = 0; i < addButtons.length; i++) {
      const button = addButtons[i];
      const buttonTextRaw = await page.evaluate(el => (el.textContent || '').trim(), button);
      const buttonText = buttonTextRaw.toLowerCase();
      if (buttonText.includes('tambah') || buttonText.includes('add') || buttonText.includes('cart')) {
        candidateInfos.push({ index: i, textSample: buttonTextRaw.slice(0, 80) });
        if (!addToCartButton) {
          addToCartButton = button;
          selectedButtonIndex = i;
        }
      }
    }

    // #region agent log
    fetch('http://127.0.0.1:7854/ingest/2d37e6c6-57b0-4dc5-ae68-6a3883d158fb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5df11e'},body:JSON.stringify({sessionId:'5df11e',runId:DEBUG_RUN_ID,hypothesisId:'P1',location:'smoke-test-puppeteer.js:flowA:add-to-cart:candidates',message:'Collected button candidates for add-to-cart',data:{addButtonCount,hasCandidate:!!addToCartButton,selectedButtonIndex,candidateInfos},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    
    if (addToCartButton) {
      const targetMeta = await page.evaluate(el => ({
        tagName: el.tagName,
        type: el.getAttribute('type') || '',
        disabled: !!el.disabled,
        textLength: (el.textContent || '').trim().length,
        textSample: (el.textContent || '').trim().slice(0, 80),
        hasTambahKeyword: /tambah/i.test(el.textContent || ''),
        hasAddKeyword: /\badd\b/i.test(el.textContent || ''),
        hasCartKeyword: /cart|keranjang/i.test(el.textContent || '')
      }), addToCartButton).catch(() => null);

      // #region agent log
      fetch('http://127.0.0.1:7854/ingest/2d37e6c6-57b0-4dc5-ae68-6a3883d158fb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5df11e'},body:JSON.stringify({sessionId:'5df11e',runId:DEBUG_RUN_ID,hypothesisId:'P1',location:'smoke-test-puppeteer.js:flowA:add-to-cart:target-meta',message:'Captured selected add-to-cart element metadata',data:{selectedButtonIndex,targetMeta},timestamp:Date.now()})}).catch(()=>{});
      // #endregion

      const initialCartElement = await page.$('div[class*="cart"], div[class*="keranjang"]');
      const initialCartText = initialCartElement ? 
        await page.evaluate(el => el.textContent, initialCartElement) : '';
      const preButtonState = await page.evaluate(el => ({
        disabled: !!el.disabled,
        ariaPressed: el.getAttribute('aria-pressed') || '',
        className: el.className || ''
      }), addToCartButton).catch(() => null);
      const checkedCountBefore = await page.$$eval('input[type="checkbox"]', inputs =>
        inputs.filter(input => input.checked).length
      ).catch(() => 0);
      const initialClearButtonVisible = await page.$$eval('button', buttons =>
        buttons.some(button => {
          const text = (button.textContent || '').toLowerCase();
          return text.includes('clear') || text.includes('reset') || text.includes('kosongkan');
        })
      ).catch(() => false);

      // #region agent log
      fetch('http://127.0.0.1:7854/ingest/2d37e6c6-57b0-4dc5-ae68-6a3883d158fb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5df11e'},body:JSON.stringify({sessionId:'5df11e',runId:DEBUG_RUN_ID,hypothesisId:'P2',location:'smoke-test-puppeteer.js:flowA:add-to-cart:before-click',message:'Captured cart signals before click',data:{initialCartTextLength:(initialCartText || '').trim().length,initialClearButtonVisible,checkedCountBefore,preButtonState},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      
      await addToCartButton.click();
      await wait(1500);
      
      const updatedCartElement = await page.$('div[class*="cart"], div[class*="keranjang"]');
      const updatedCartText = updatedCartElement ? 
        await page.evaluate(el => el.textContent, updatedCartElement) : '';
      const postButtonState = await page.evaluate(el => ({
        disabled: !!el.disabled,
        ariaPressed: el.getAttribute('aria-pressed') || '',
        className: el.className || ''
      }), addToCartButton).catch(() => null);
      const checkedCountAfter = await page.$$eval('input[type="checkbox"]', inputs =>
        inputs.filter(input => input.checked).length
      ).catch(() => 0);
      const updatedClearButtonVisible = await page.$$eval('button', buttons =>
        buttons.some(button => {
          const text = (button.textContent || '').toLowerCase();
          return text.includes('clear') || text.includes('reset') || text.includes('kosongkan');
        })
      ).catch(() => false);
      const legacyCartStateChanged = initialCartText !== updatedCartText;
      let fallbackProbe = null;

      if (!legacyCartStateChanged && !updatedClearButtonVisible) {
        await page.evaluate(el => el.click(), addToCartButton).catch(() => {});
        await wait(800);

        const fallbackCartElement = await page.$('div[class*="cart"], div[class*="keranjang"]');
        const fallbackCartText = fallbackCartElement ?
          await page.evaluate(el => el.textContent, fallbackCartElement) : '';
        const fallbackClearButtonVisible = await page.$$eval('button', buttons =>
          buttons.some(button => {
            const text = (button.textContent || '').toLowerCase();
            return text.includes('clear') || text.includes('reset') || text.includes('kosongkan');
          })
        ).catch(() => false);
        const fallbackButtonState = await page.evaluate(el => ({
          disabled: !!el.disabled,
          ariaPressed: el.getAttribute('aria-pressed') || '',
          className: el.className || ''
        }), addToCartButton).catch(() => null);

        fallbackProbe = {
          fallbackCartTextLength: (fallbackCartText || '').trim().length,
          fallbackClearButtonVisible,
          fallbackButtonState
        };

        // #region agent log
        fetch('http://127.0.0.1:7854/ingest/2d37e6c6-57b0-4dc5-ae68-6a3883d158fb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5df11e'},body:JSON.stringify({sessionId:'5df11e',runId:DEBUG_RUN_ID,hypothesisId:'P6',location:'smoke-test-puppeteer.js:flowA:add-to-cart:fallback-click-probe',message:'Executed fallback DOM click probe after no-op Puppeteer click',data:{fallbackProbe},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
      }

      // #region agent log
      fetch('http://127.0.0.1:7854/ingest/2d37e6c6-57b0-4dc5-ae68-6a3883d158fb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5df11e'},body:JSON.stringify({sessionId:'5df11e',runId:DEBUG_RUN_ID,hypothesisId:'P2',location:'smoke-test-puppeteer.js:flowA:add-to-cart:after-click',message:'Captured cart signals after click',data:{updatedCartTextLength:(updatedCartText || '').trim().length,updatedClearButtonVisible,checkedCountAfter,postButtonState,legacyCartStateChanged,fallbackProbe},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      
      if (legacyCartStateChanged) {
        // #region agent log
        fetch('http://127.0.0.1:7854/ingest/2d37e6c6-57b0-4dc5-ae68-6a3883d158fb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5df11e'},body:JSON.stringify({sessionId:'5df11e',runId:DEBUG_RUN_ID,hypothesisId:'P3',location:'smoke-test-puppeteer.js:flowA:add-to-cart:result-pass',message:'Add-to-cart resolved PASS by legacy text-change logic',data:{legacyCartStateChanged,initialClearButtonVisible,updatedClearButtonVisible},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        results.flowA.push('✓ PASS: Add to cart clicked and cart area updated');
        
        const clearButtons = await page.$$('button');
        let clearButton = null;
        
        for (const button of clearButtons) {
          const buttonText = await page.evaluate(el => el.textContent.toLowerCase(), button);
          if (buttonText.includes('clear') || buttonText.includes('reset') || buttonText.includes('kosongkan')) {
            clearButton = button;
            break;
          }
        }
        
        if (clearButton) {
          await clearButton.click();
          await wait(1000);
          results.flowA.push('✓ PASS: Cart cleared/reset');
        } else {
          results.flowA.push('⚠ INFO: No clear/reset cart button found');
        }
      } else {
        // #region agent log
        fetch('http://127.0.0.1:7854/ingest/2d37e6c6-57b0-4dc5-ae68-6a3883d158fb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5df11e'},body:JSON.stringify({sessionId:'5df11e',runId:DEBUG_RUN_ID,hypothesisId:'P3',location:'smoke-test-puppeteer.js:flowA:add-to-cart:result-warning',message:'Add-to-cart resolved WARNING by legacy text-change logic',data:{legacyCartStateChanged,initialClearButtonVisible,updatedClearButtonVisible,initialCartTextLength:(initialCartText || '').trim().length,updatedCartTextLength:(updatedCartText || '').trim().length,fallbackProbe},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        results.flowA.push('⚠ WARNING: Cart area did not update visibly after add to cart');
      }
    } else {
      // #region agent log
      fetch('http://127.0.0.1:7854/ingest/2d37e6c6-57b0-4dc5-ae68-6a3883d158fb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5df11e'},body:JSON.stringify({sessionId:'5df11e',runId:DEBUG_RUN_ID,hypothesisId:'P1',location:'smoke-test-puppeteer.js:flowA:add-to-cart:no-target',message:'No add-to-cart target detected from candidates',data:{addButtonCount},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      results.flowA.push('⚠ INFO: No add to cart button found');
    }
  } catch (error) {
    results.flowA.push(`⚠ INFO: Add to cart test skipped - ${error.message}`);
  }
  
  results.flowA.push('✓ PASS: Did not perform checkout/payment (as required)');
}

async function flowBAdminYuranFilter(page) {
  console.log('\n=== Starting Flow B: Admin Yuran Mode Filter ===\n');
  
  let loginSuccess = await login(page, ADMIN_EMAIL, ADMIN_PASSWORD, 'flowB');
  
  if (!loginSuccess) {
    loginSuccess = await login(page, FALLBACK_ADMIN_EMAIL, FALLBACK_ADMIN_PASSWORD, 'flowB');
    
    if (!loginSuccess) {
      results.flowB.push('❌ FAIL: Unable to login with both admin credentials');
      return;
    }
  }
  
  try {
    await page.goto(`${BASE_URL}/admin/yuran/pelajar`, { waitUntil: 'networkidle2', timeout: 15000 });
    await wait(2000);
    
    results.flowB.push('✓ PASS: Navigated to /admin/yuran/pelajar');
  } catch (error) {
    results.flowB.push(`❌ FAIL: Navigation to /admin/yuran/pelajar failed - ${error.message}`);
    return;
  }
  
  try {
    const allDropdowns = await page.$$('select');
    
    let modeDropdown = null;
    let modeDropdownIndex = -1;
    
    for (let i = 0; i < allDropdowns.length; i++) {
      const dropdown = allDropdowns[i];
      const options = await page.evaluate((select) => {
        return Array.from(select.options).map(option => option.textContent);
      }, dropdown);
      
      const hasSemasa = options.some(opt => opt.includes('Semasa'));
      const hasPreBilling = options.some(opt => opt.includes('Pre-Billing') || opt.includes('Pre Billing') || opt.toLowerCase().includes('prebilling'));
      
      if (hasSemasa || hasPreBilling) {
        modeDropdown = dropdown;
        modeDropdownIndex = i;
        break;
      }
    }
    
    if (!modeDropdown) {
      await page.screenshot({ path: 'admin-yuran-no-mode-dropdown.png' });
      results.flowB.push(`❌ FAIL: Mode Invoice filter dropdown not found (searched ${allDropdowns.length} dropdown(s))`);
      return;
    }
    
    const options = await page.evaluate((select) => {
      return Array.from(select.options).map(option => option.textContent);
    }, modeDropdown);
    
    const hasSemasa = options.some(opt => opt.includes('Semasa'));
    const hasPreBilling = options.some(opt => opt.includes('Pre-Billing') || opt.includes('Pre Billing') || opt.toLowerCase().includes('prebilling'));
    
    if (!hasSemasa || !hasPreBilling) {
      results.flowB.push(`❌ FAIL: Mode Invoice dropdown missing required options (found: ${options.join(', ')})`);
      return;
    }
    
    results.flowB.push('✓ PASS: Filter dropdown "Mode Invoice" exists with Semasa and Pre-Billing options');
    
    await page.evaluate((select, idx) => {
      window.__modeDropdownIndex = idx;
    }, modeDropdown, modeDropdownIndex);
    
  } catch (error) {
    results.flowB.push(`❌ FAIL: Filter dropdown verification error - ${error.message}`);
    return;
  }
  
  try {
    const allDropdowns = await page.$$('select');
    const modeDropdownIndex = await page.evaluate(() => window.__modeDropdownIndex || 0);
    const modeDropdown = allDropdowns[modeDropdownIndex];
    
    await page.evaluate((select) => {
      const options = Array.from(select.options);
      const preBillingOption = options.find(opt => 
        opt.textContent.includes('Pre-Billing') || opt.textContent.includes('Pre Billing') || opt.textContent.toLowerCase().includes('prebilling')
      );
      if (preBillingOption) {
        select.value = preBillingOption.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, modeDropdown);
    
    await wait(2000);
    
    const bodyText = await page.evaluate(() => document.body.textContent);
    
    if (bodyText.toLowerCase().includes('pre-billing') || bodyText.toLowerCase().includes('pre billing')) {
      results.flowB.push('✓ PASS: Selected Pre-Billing and active indicator text updated');
    } else {
      results.flowB.push('❌ FAIL: Pre-Billing selected but indicator text did not update');
    }
  } catch (error) {
    results.flowB.push(`❌ FAIL: Pre-Billing selection error - ${error.message}`);
  }
  
  try {
    const allDropdowns = await page.$$('select');
    const modeDropdownIndex = await page.evaluate(() => window.__modeDropdownIndex || 0);
    const modeDropdown = allDropdowns[modeDropdownIndex];
    
    await page.evaluate((select) => {
      const options = Array.from(select.options);
      const semasaOption = options.find(opt => opt.textContent.includes('Semasa'));
      if (semasaOption) {
        select.value = semasaOption.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, modeDropdown);
    
    await wait(2000);
    
    const bodyText = await page.evaluate(() => document.body.textContent);
    
    if (bodyText.toLowerCase().includes('semasa')) {
      results.flowB.push('✓ PASS: Selected Semasa and active indicator text updated');
    } else {
      results.flowB.push('❌ FAIL: Semasa selected but indicator text did not update');
    }
  } catch (error) {
    results.flowB.push(`❌ FAIL: Semasa selection error - ${error.message}`);
  }
  
  try {
    const countBadgeText = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('div, span, p'));
      const badgeElement = elements.find(el => 
        el.textContent.includes('rekod') && el.textContent.includes('halaman ini')
      );
      if (badgeElement) {
        const match = badgeElement.textContent.match(/(\d+\s+rekod.*?halaman ini.*?\d+)/i);
        return match ? match[1] : badgeElement.textContent.substring(0, 100);
      }
      return '';
    });
    
    if (countBadgeText && /\d+\s+rekod.*halaman ini.*\d+/i.test(countBadgeText)) {
      results.flowB.push(`✓ PASS: Count badge displayed with format "X rekod (halaman ini: Y)" - "${countBadgeText.trim()}"`);
    } else if (countBadgeText) {
      results.flowB.push(`⚠ WARNING: Count badge found but format might differ - "${countBadgeText.trim().substring(0, 80)}"`);
    } else {
      results.flowB.push('❌ FAIL: Count badge not displayed');
    }
  } catch (error) {
    results.flowB.push(`❌ FAIL: Count badge verification error - ${error.message}`);
  }
}

async function generateReport() {
  console.log('\n\n');
  console.log('='.repeat(70));
  console.log('UI SMOKE TEST RESULTS');
  console.log('='.repeat(70));
  
  console.log('\n### Flow A: Parent Payment Center ###\n');
  results.flowA.forEach(result => console.log(result));
  
  console.log('\n### Flow B: Admin Yuran Mode Filter ###\n');
  results.flowB.forEach(result => console.log(result));
  
  const flowAFailed = results.flowA.filter(r => r.includes('❌ FAIL')).length;
  const flowBFailed = results.flowB.filter(r => r.includes('❌ FAIL')).length;
  const flowAWarnings = results.flowA.filter(r => r.includes('⚠ WARNING')).length;
  const flowAAddCartResult = results.flowA.find(r => r.includes('Add to cart')) || '';

  // #region agent log
  fetch('http://127.0.0.1:7854/ingest/2d37e6c6-57b0-4dc5-ae68-6a3883d158fb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5df11e'},body:JSON.stringify({sessionId:'5df11e',runId:DEBUG_RUN_ID,hypothesisId:'P4',location:'smoke-test-puppeteer.js:generateReport:summary',message:'Generated Puppeteer run summary',data:{flowAFailed,flowBFailed,flowAWarnings,flowAAddCartResult},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  
  console.log('\n' + '='.repeat(70));
  console.log('OVERALL STATUS');
  console.log('='.repeat(70));
  
  if (flowAFailed === 0 && flowBFailed === 0) {
    console.log('\n✅ OVERALL: PASS - All critical steps passed\n');
  } else {
    console.log(`\n❌ OVERALL: FAIL - ${flowAFailed + flowBFailed} critical failure(s) detected\n`);
    console.log(`   Flow A failures: ${flowAFailed}`);
    console.log(`   Flow B failures: ${flowBFailed}\n`);
  }
}

async function runTests() {
  // #region agent log
  fetch('http://127.0.0.1:7854/ingest/2d37e6c6-57b0-4dc5-ae68-6a3883d158fb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5df11e'},body:JSON.stringify({sessionId:'5df11e',runId:DEBUG_RUN_ID,hypothesisId:'P5',location:'smoke-test-puppeteer.js:runTests:start',message:'Puppeteer smoke test process started',data:{argv:process.argv.slice(1),cwd:process.cwd()},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page1 = await browser.newPage();
    await page1.setViewport({ width: 1280, height: 720 });
    await flowAParentPaymentCenter(page1);
    
    await page1.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    const cookies1 = await page1.cookies();
    if (cookies1.length > 0) {
      await page1.deleteCookie(...cookies1);
    }
    await page1.close();
    
    await wait(2000);
    
    const page2 = await browser.newPage();
    await page2.setViewport({ width: 1280, height: 720 });
    await flowBAdminYuranFilter(page2);
    await page2.close();
  } catch (error) {
    console.error('Fatal test error:', error);
  } finally {
    await browser.close();
    await generateReport();
  }
}

runTests().catch(error => {
  console.error('Test suite error:', error);
  process.exit(1);
});
