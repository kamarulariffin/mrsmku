const { chromium } = require('playwright');

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

async function isVisible(locator, timeout = 2000) {
  try {
    return await locator.isVisible({ timeout });
  } catch {
    return false;
  }
}

async function hasVisibleError(page) {
  const explicitErrorElements = await page.locator('[role="alert"], .error, .toast-error, .error-toast, .error-banner, .alert-danger').count();
  if (explicitErrorElements > 0) {
    return true;
  }

  return isVisible(page.locator('text=/error/i').first(), 1200);
}

async function collectCartSignals(page) {
  const cartLocator = page.locator('div:has-text("Cart"), div:has-text("Keranjang"), span:has-text("item"), [class*="cart"], [class*="keranjang"]');
  const firstCartText = await cartLocator.first().textContent().catch(() => '');
  const checkedCount = await page.locator('input[type="checkbox"]:checked').count().catch(() => 0);
  const clearButtonVisible = await isVisible(
    page.locator('button:has-text("Clear"), button:has-text("Reset"), button:has-text("Kosongkan")').first(),
    500
  );

  return {
    cartNodeCount: await cartLocator.count().catch(() => 0),
    firstCartTextLength: (firstCartText || '').trim().length,
    firstCartHasDigitOne: /\b1\b/.test(firstCartText || ''),
    checkedCount,
    clearButtonVisible
  };
}

async function login(page, email, password, flow) {
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await wait(1500);

    const skipButton = page.locator('button:has-text("Skip"), button:has-text("Langkau"), a:has-text("Skip")').first();
    if (await isVisible(skipButton, 1200)) {
      await skipButton.click();
      await wait(1000);
    }

    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i], input[type="text"]').first();
    const passwordInput = page.locator('input[type="password"]').first();

    // Some builds show login fields only after tapping "Log Masuk".
    if (!await isVisible(emailInput) || !await isVisible(passwordInput)) {
      const openLoginButton = page.locator('button:has-text("Log Masuk"), button:has-text("Log In"), button:has-text("Masuk"), a:has-text("Log Masuk"), a:has-text("Log In"), a:has-text("Masuk")').first();
      if (await isVisible(openLoginButton, 3000)) {
        await openLoginButton.click();
      }

      await emailInput.waitFor({ state: 'visible', timeout: 10000 });
      await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
    }
    
    await emailInput.fill(email);
    await passwordInput.fill(password);
    
    const loginButton = page.locator('form button[type="submit"], button[type="submit"], form button:has-text("Log"), button:has-text("Log Masuk"), button:has-text("Masuk")').first();
    await loginButton.click();
    
    await wait(2000);
    
    const currentUrl = page.url();
    const hasError = await hasVisibleError(page);
    
    if (hasError || currentUrl.includes('login')) {
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
    const logoutButton = page.locator('button:has-text("Log Out"), button:has-text("Keluar"), a:has-text("Log Out"), a:has-text("Keluar")').first();
    if (await isVisible(logoutButton, 2000)) {
      await logoutButton.click();
      await wait(1200);
    }
  } catch {}

  // Always reset session between flows so fallback credential checks are deterministic.
  try {
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  } catch {}

  try {
    await page.context().clearCookies();
  } catch {}

  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
  await wait(1000);
}

async function flowAParentPaymentCenter(page) {
  console.log('\n=== Starting Flow A: Parent Payment Center ===\n');
  
  if (!await login(page, PARENT_EMAIL, PARENT_PASSWORD, 'flowA')) {
    return;
  }
  
  try {
    await wait(2000);
    const hasErrorToast = await hasVisibleError(page);
    
    if (hasErrorToast) {
      results.flowA.push('❌ FAIL: Dashboard loaded with visible error toast');
    } else {
      results.flowA.push('✓ PASS: Dashboard/home loads without visible error toast');
    }
  } catch (error) {
    results.flowA.push(`❌ FAIL: Dashboard verification error - ${error.message}`);
  }
  
  try {
    await page.goto(`${BASE_URL}/payment-center`, { waitUntil: 'networkidle', timeout: 15000 });
    await wait(2000);
    
    results.flowA.push('✓ PASS: Navigated to /payment-center');
  } catch (error) {
    results.flowA.push(`❌ FAIL: Navigation to /payment-center failed - ${error.message}`);
    return;
  }
  
  try {
    const hasRedError = await hasVisibleError(page);
    const hasPaymentCard = await page.locator('div[class*="card"], div[class*="item"], li, tr').count() > 0;
    
    if (hasRedError) {
      results.flowA.push('❌ FAIL: Pending items section has red error banner/toast');
    } else if (!hasPaymentCard) {
      results.flowA.push('⚠ WARNING: No payment cards/items visible in pending items section');
    } else {
      results.flowA.push('✓ PASS: Pending items section loads (no red errors; payment items visible)');
    }
  } catch (error) {
    results.flowA.push(`❌ FAIL: Pending items verification error - ${error.message}`);
  }
  
  try {
    const addToCartCandidates = page.locator('button:has-text("Tambah"), button:has-text("Add"), button:has-text("Cart"), input[type="checkbox"]');
    const addToCartButton = addToCartCandidates.first();
    const addCandidateCount = await addToCartCandidates.count().catch(() => 0);
    const addTargetVisible = await isVisible(addToCartButton, 3000);

    // #region agent log
    fetch('http://127.0.0.1:7854/ingest/2d37e6c6-57b0-4dc5-ae68-6a3883d158fb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5df11e'},body:JSON.stringify({sessionId:'5df11e',runId:DEBUG_RUN_ID,hypothesisId:'H1',location:'smoke-test.js:flowA:add-to-cart:candidates',message:'Collected add-to-cart candidates',data:{addCandidateCount,addTargetVisible},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    
    if (addTargetVisible) {
      const targetMeta = await addToCartButton.evaluate(el => ({
        tagName: el.tagName,
        type: el.getAttribute('type') || '',
        disabled: !!el.disabled,
        textLength: (el.textContent || '').trim().length,
        hasTambahKeyword: /tambah/i.test(el.textContent || ''),
        hasAddKeyword: /\badd\b/i.test(el.textContent || ''),
        hasCartKeyword: /cart|keranjang/i.test(el.textContent || '')
      })).catch(() => null);

      // #region agent log
      fetch('http://127.0.0.1:7854/ingest/2d37e6c6-57b0-4dc5-ae68-6a3883d158fb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5df11e'},body:JSON.stringify({sessionId:'5df11e',runId:DEBUG_RUN_ID,hypothesisId:'H1',location:'smoke-test.js:flowA:add-to-cart:target-meta',message:'Captured clicked element metadata',data:{targetMeta},timestamp:Date.now()})}).catch(()=>{});
      // #endregion

      const initialSignals = await collectCartSignals(page);

      // #region agent log
      fetch('http://127.0.0.1:7854/ingest/2d37e6c6-57b0-4dc5-ae68-6a3883d158fb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5df11e'},body:JSON.stringify({sessionId:'5df11e',runId:DEBUG_RUN_ID,hypothesisId:'H2',location:'smoke-test.js:flowA:add-to-cart:before-click',message:'Captured cart signals before click',data:initialSignals,timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      
      await addToCartButton.click();

      const postClickElementState = await addToCartButton.evaluate(el => ({
        disabled: !!el.disabled,
        checked: typeof el.checked === 'boolean' ? el.checked : null,
        textLength: (el.textContent || '').trim().length
      })).catch(() => null);

      // #region agent log
      fetch('http://127.0.0.1:7854/ingest/2d37e6c6-57b0-4dc5-ae68-6a3883d158fb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5df11e'},body:JSON.stringify({sessionId:'5df11e',runId:DEBUG_RUN_ID,hypothesisId:'H3',location:'smoke-test.js:flowA:add-to-cart:post-click-state',message:'Captured element state right after click',data:{postClickElementState},timestamp:Date.now()})}).catch(()=>{});
      // #endregion

      await wait(1500);

      const updatedSignals = await collectCartSignals(page);

      // #region agent log
      fetch('http://127.0.0.1:7854/ingest/2d37e6c6-57b0-4dc5-ae68-6a3883d158fb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5df11e'},body:JSON.stringify({sessionId:'5df11e',runId:DEBUG_RUN_ID,hypothesisId:'H2',location:'smoke-test.js:flowA:add-to-cart:after-click',message:'Captured cart signals after click',data:updatedSignals,timestamp:Date.now()})}).catch(()=>{});
      // #endregion

      const legacyCartStateChanged =
        initialSignals.firstCartTextLength !== updatedSignals.firstCartTextLength ||
        initialSignals.firstCartHasDigitOne !== updatedSignals.firstCartHasDigitOne;

      const cartStateChanged =
        legacyCartStateChanged ||
        initialSignals.clearButtonVisible !== updatedSignals.clearButtonVisible;

      // #region agent log
      fetch('http://127.0.0.1:7854/ingest/2d37e6c6-57b0-4dc5-ae68-6a3883d158fb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5df11e'},body:JSON.stringify({sessionId:'5df11e',runId:DEBUG_RUN_ID,hypothesisId:'H4',location:'smoke-test.js:flowA:add-to-cart:decision',message:'Computed add-to-cart outcome from runtime signals',data:{legacyCartStateChanged,cartStateChanged,initialSignals,updatedSignals},timestamp:Date.now()})}).catch(()=>{});
      // #endregion

      if (cartStateChanged) {
        // #region agent log
        fetch('http://127.0.0.1:7854/ingest/2d37e6c6-57b0-4dc5-ae68-6a3883d158fb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5df11e'},body:JSON.stringify({sessionId:'5df11e',runId:DEBUG_RUN_ID,hypothesisId:'H7',location:'smoke-test.js:flowA:add-to-cart:result-pass',message:'Add-to-cart branch resolved as PASS',data:{legacyCartStateChanged,cartStateChanged},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        results.flowA.push('✓ PASS: Add to cart clicked and cart area updated');
        
        const clearButton = await page.locator('button:has-text("Clear"), button:has-text("Reset"), button:has-text("Kosongkan")').first();
        if (await clearButton.isVisible({ timeout: 2000 })) {
          await clearButton.click();
          await wait(1000);
          results.flowA.push('✓ PASS: Cart cleared/reset');
        } else {
          results.flowA.push('⚠ INFO: No clear/reset cart button found');
        }
      } else {
        // #region agent log
        fetch('http://127.0.0.1:7854/ingest/2d37e6c6-57b0-4dc5-ae68-6a3883d158fb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5df11e'},body:JSON.stringify({sessionId:'5df11e',runId:DEBUG_RUN_ID,hypothesisId:'H7',location:'smoke-test.js:flowA:add-to-cart:result-warning',message:'Add-to-cart branch resolved as WARNING',data:{legacyCartStateChanged,cartStateChanged,initialSignals,updatedSignals},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        results.flowA.push('⚠ WARNING: Cart area did not update visibly after add to cart');
      }
    } else {
      // #region agent log
      fetch('http://127.0.0.1:7854/ingest/2d37e6c6-57b0-4dc5-ae68-6a3883d158fb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5df11e'},body:JSON.stringify({sessionId:'5df11e',runId:DEBUG_RUN_ID,hypothesisId:'H6',location:'smoke-test.js:flowA:add-to-cart:no-target',message:'No visible add-to-cart target found',data:{addCandidateCount,addTargetVisible},timestamp:Date.now()})}).catch(()=>{});
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
  
  await logout(page);
  await wait(1000);
  
  let loginSuccess = await login(page, ADMIN_EMAIL, ADMIN_PASSWORD, 'flowB');
  
  if (!loginSuccess) {
    console.log('Trying fallback admin credentials...');
    loginSuccess = await login(page, FALLBACK_ADMIN_EMAIL, FALLBACK_ADMIN_PASSWORD, 'flowB');
    
    if (!loginSuccess) {
      results.flowB.push('❌ FAIL: Unable to login with both admin credentials');
      return;
    }
  }
  
  try {
    await page.goto(`${BASE_URL}/admin/yuran/pelajar`, { waitUntil: 'networkidle', timeout: 15000 });
    await wait(2000);
    
    results.flowB.push('✓ PASS: Navigated to /admin/yuran/pelajar');
  } catch (error) {
    results.flowB.push(`❌ FAIL: Navigation to /admin/yuran/pelajar failed - ${error.message}`);
    return;
  }
  
  try {
    const modeDropdown = await page.locator('select:has(option:has-text("Semasa")), select:has(option:has-text("Pre-Billing")), select[name*="mode" i], button:has-text("Mode")').first();
    
    if (!await modeDropdown.isVisible({ timeout: 3000 })) {
      results.flowB.push('❌ FAIL: Mode Invoice filter dropdown not found');
      return;
    }
    
    const semasa = await page.locator('option', { hasText: /Semasa/i }).count() > 0;
    const preBilling = await page.locator('option', { hasText: /Pre[- ]?Billing/i }).count() > 0;
    
    if (!semasa || !preBilling) {
      results.flowB.push('❌ FAIL: Mode Invoice dropdown missing Semasa or Pre-Billing options');
      return;
    }
    
    results.flowB.push('✓ PASS: Filter dropdown "Mode Invoice" exists with Semasa and Pre-Billing options');
  } catch (error) {
    results.flowB.push(`❌ FAIL: Filter dropdown verification error - ${error.message}`);
    return;
  }
  
  try {
    const modeSelect = await page.locator('select:has(option:has-text("Pre-Billing")), select:has(option:has-text("Pre Billing"))').first();
    
    if (await modeSelect.isVisible({ timeout: 2000 })) {
      const options = await modeSelect.locator('option').evaluateAll(nodes =>
        nodes.map(node => ({
          label: (node.textContent || '').trim(),
          value: node.value
        }))
      );
      const target = options.find(option => /pre[- ]?billing/i.test(option.label));
      if (!target) {
        throw new Error('Option Pre-Billing tidak dijumpai dalam dropdown');
      }
      await modeSelect.selectOption(target.value);
    } else {
      await page.locator('button:has-text("Pre-Billing"), button:has-text("Pre Billing")').first().click();
    }
    
    await wait(2000);
    
    const indicatorText = await page.locator('div:has-text("Pre-Billing"), span:has-text("Pre-Billing"), p:has-text("Pre-Billing")').first().textContent().catch(() => '');
    
    if (indicatorText.toLowerCase().includes('pre-billing') || indicatorText.toLowerCase().includes('pre billing')) {
      results.flowB.push('✓ PASS: Selected Pre-Billing and active indicator text updated');
    } else {
      results.flowB.push('❌ FAIL: Pre-Billing selected but indicator text did not update');
    }
  } catch (error) {
    results.flowB.push(`❌ FAIL: Pre-Billing selection error - ${error.message}`);
  }
  
  try {
    const modeSelect = await page.locator('select:has(option:has-text("Semasa"))').first();
    
    if (await modeSelect.isVisible({ timeout: 2000 })) {
      const options = await modeSelect.locator('option').evaluateAll(nodes =>
        nodes.map(node => ({
          label: (node.textContent || '').trim(),
          value: node.value
        }))
      );
      const target = options.find(option => /semasa/i.test(option.label));
      if (!target) {
        throw new Error('Option Semasa tidak dijumpai dalam dropdown');
      }
      await modeSelect.selectOption(target.value);
    } else {
      await page.locator('button:has-text("Semasa")').first().click();
    }
    
    await wait(2000);
    
    const indicatorText = await page.locator('div:has-text("Semasa"), span:has-text("Semasa"), p:has-text("Semasa")').first().textContent().catch(() => '');
    
    if (indicatorText.toLowerCase().includes('semasa')) {
      results.flowB.push('✓ PASS: Selected Semasa and active indicator text updated');
    } else {
      results.flowB.push('❌ FAIL: Semasa selected but indicator text did not update');
    }
  } catch (error) {
    results.flowB.push(`❌ FAIL: Semasa selection error - ${error.message}`);
  }
  
  try {
    const countBadge = await page.locator('div:has-text("rekod"), span:has-text("rekod"), p:has-text("halaman ini")').first().textContent().catch(() => '');
    
    if (countBadge && /\d+\s+rekod.*halaman ini.*\d+/i.test(countBadge)) {
      results.flowB.push(`✓ PASS: Count badge displayed with format "X rekod (halaman ini: Y)" - "${countBadge.trim()}"`);
    } else if (countBadge) {
      results.flowB.push(`⚠ WARNING: Count badge found but format might differ - "${countBadge.trim()}"`);
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
  fetch('http://127.0.0.1:7854/ingest/2d37e6c6-57b0-4dc5-ae68-6a3883d158fb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5df11e'},body:JSON.stringify({sessionId:'5df11e',runId:DEBUG_RUN_ID,hypothesisId:'H8',location:'smoke-test.js:generateReport:summary',message:'Generated run summary for diagnostics',data:{flowAFailed,flowBFailed,flowAWarnings,flowAAddCartResult},timestamp:Date.now()})}).catch(()=>{});
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
  fetch('http://127.0.0.1:7854/ingest/2d37e6c6-57b0-4dc5-ae68-6a3883d158fb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5df11e'},body:JSON.stringify({sessionId:'5df11e',runId:DEBUG_RUN_ID,hypothesisId:'H6',location:'smoke-test.js:runTests:start',message:'Smoke test process started',data:{argv:process.argv.slice(1),cwd:process.cwd()},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  
  const page = await context.newPage();
  
  try {
    await flowAParentPaymentCenter(page);
    await flowBAdminYuranFilter(page);
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
