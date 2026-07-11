const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`); });
  page.on('pageerror', err => errors.push(`[pageerror] ${err.message}`));

  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1000);
  const loginInput = await page.$('input[placeholder="Enter Employee ID"]');
  if (loginInput) {
    await page.fill('input[placeholder="Enter Employee ID"]', 'ADMIN001');
    await page.fill('input[placeholder="••••••••"]', 'Password123');
    await Promise.all([
      page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForTimeout(1500);
  }

  errors.length = 0;
  await page.goto('http://localhost:3000/mixing', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1000);
  await page.selectOption('select', { label: 'AFIS-6 MMF Data Entry' }).catch(e => console.log('select err', e.message));
  await page.waitForTimeout(1500);
  console.log((await page.innerText('body').catch(() => '')).slice(0, 2400));
  await page.screenshot({ path: 'C:/Users/Sneha/AppData/Local/Temp/claude/c--Users-Sneha-Downloads-spintelligence-frontend-beta1/137655f9-e526-407f-84dc-3456ca423d78/scratchpad/afis6_mmf_v2.png', fullPage: true });
  if (errors.length) { console.log('Errors:'); errors.forEach(e => console.log(e)); } else console.log('No console/page errors.');
  await browser.close();
})();
