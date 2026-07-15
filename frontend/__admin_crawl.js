const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const allErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') allErrors.push(`[console:${page.url()}] ${msg.text()}`); });
  page.on('pageerror', err => allErrors.push(`[pageerror:${page.url()}] ${err.message}`));
  page.on('response', async (res) => { if (res.status() >= 500) allErrors.push(`[${res.status()}:${res.url()}]`); });

  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 25000 });
  await page.waitForTimeout(1200);
  const loginInput = await page.$('input[placeholder="Enter Employee ID"]');
  if (loginInput) {
    await page.fill('input[placeholder="Enter Employee ID"]', 'ADMIN001');
    await page.fill('input[placeholder="••••••••"]', 'Password123');
    await Promise.all([
      page.waitForNavigation({ timeout: 20000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForTimeout(2000);
  }

  const pages = [
    '/', '/departments', '/mixing', '/blowroom', '/carding', '/comber', '/draw-frame', '/simplex', '/spinning',
    '/autoconer', '/process-parameter', '/usermanagement', '/rolespermission', '/operator', '/supervisordashboard',
    '/l3-ticketing', '/submitted-notebooks', '/submitted-notebook-threshold', '/activity-log', '/wheel-change-approvals',
    '/drawframe-wheel-change-approvals', '/carding-change-control-approvals', '/simplex-wheel-change-approvals',
    '/statistics-analysis', '/l1-analysis', '/l2-analysis', '/threshold-values', '/submission-threshold',
    '/pp-batch-threshold', '/reports/general', '/reports/custom', '/settings', '/ticket-calendar', '/ticket-calendar-l2',
    '/glossary', '/faqs', '/help',
  ];

  for (const path of pages) {
    allErrors.length = 0;
    const before = allErrors.length;
    try {
      await page.goto(`http://localhost:3000${path}`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(600);
    } catch (e) {
      console.log(`NAV FAIL ${path}: ${e.message}`);
      continue;
    }
    if (allErrors.length > before) {
      console.log(`${path} ->`, allErrors.slice(before));
    } else {
      console.log(`${path} -> OK`);
    }
  }

  await browser.close();
})().catch(e => console.log('FATAL', e.message));
