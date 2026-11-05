const { chromium, webkit } = require(process.env.RALLYDESK_PLAYWRIGHT_PATH || 'playwright');

async function audit(browserType, executablePath, engine) {
  const browser = await browserType.launch({ ...(executablePath ? { executablePath } : {}), headless: true });
  try {
    const failures = [];
    for (const width of process.env.QA_WIDTH ? [Number(process.env.QA_WIDTH)] : [320, 390, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: width < 768, hasTouch: width < 768 });
      page.on('pageerror', error => failures.push(`${width}: ${error.message}`));
      await page.goto('http://127.0.0.1:5173/?demo');
      for (const name of process.env.QA_PAGE ? [process.env.QA_PAGE] : ['Overview', 'Matches', 'Tournaments', 'Players', 'Referees', 'Statistics', 'Exports & recovery', 'Settings', 'Club guide', 'About Rallydesk']) {
        if (width <= 950) await page.getByRole('button', { name: 'Open navigation' }).click();
        await page.getByRole('button', { name, exact: true }).click();
        await page.waitForTimeout(60);
        const dims = await page.evaluate(() => ({ viewport: innerWidth, doc: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
        if (dims.doc > dims.viewport + 1 || dims.body > dims.viewport + 1) {
          const offenders = await page.evaluate(() => [...document.querySelectorAll('body *')].map(element => ({ element: element.tagName.toLowerCase() + (element.className && typeof element.className === 'string' ? '.' + element.className.trim().replaceAll(' ', '.') : ''), right: Math.round(element.getBoundingClientRect().right) })).filter(item => item.right > innerWidth + 1).slice(0, 8));
          failures.push(`${width} ${name}: horizontal overflow ${JSON.stringify(dims)} ${JSON.stringify(offenders)}`);
        }
        if (name === 'Settings') {
          const breadcrumb = await page.locator('.breadcrumb').innerText();
          if (breadcrumb.includes('Workspace settings')) failures.push(`${width}: duplicate settings label`);
        }
        if (name === 'Club guide' && await page.getByText('Explore the colour palette samples').count()) failures.push(`${width}: palette link remains`);
        if (name === 'About Rallydesk' && await page.getByText('practise', { exact: false }).count()) failures.push(`${width}: old about wording remains`);
      }
      if (width === 390) await page.screenshot({ path: '.test-tmp/about-phone.png', animations: 'disabled' });
      await page.close();
    }
    if (failures.length) throw new Error(failures.join('\n'));
    console.log(`${engine}: all pages fit 320/390/768/1440px; settings, guide, About copy passed`);
  } finally { await browser.close(); }
}

(async () => {
  await audit(chromium, process.env.RALLYDESK_BROWSER_EXECUTABLE, 'Edge');
  try { await audit(webkit, undefined, 'WebKit'); }
  catch (error) { if (/Executable doesn't exist|browserType\.launch: Executable/i.test(String(error))) console.log('WebKit browser binary unavailable: native Safari remains unverified'); else throw error; }
})().catch(error => { console.error(error); process.exitCode = 1; });
