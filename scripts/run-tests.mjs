import puppeteer from 'puppeteer';

const URL = process.argv[2] || 'http://localhost:3006/?test=true';

async function run() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') console.error('Browser:', msg.text());
  });

  console.log(`Loading ${URL}...`);
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });

  // Wait for tests to complete (look for COMPLETE or FAILED text)
  await page.waitForFunction(() => {
    const text = document.body.innerText;
    return text.includes('COMPLETE') || text.includes('ALL TESTS');
  }, { timeout: 60000 });

  // Extract results
  const results = await page.evaluate(() => {
    const rows = document.querySelectorAll('[class*="bg-green-900"], [class*="bg-red-900"]');
    const tests = [];
    rows.forEach(row => {
      const status = row.innerText.includes('PASS') ? 'PASS' : 'FAIL';
      const text = row.innerText;
      tests.push({ status, text: text.trim() });
    });

    const summary = document.body.innerText;
    const passMatch = summary.match(/(\d+) passed/);
    const failMatch = summary.match(/(\d+) failed/);
    const allPassed = summary.includes('ALL TESTS PASSED');

    return {
      tests,
      passed: passMatch ? parseInt(passMatch[1]) : 0,
      failed: failMatch ? parseInt(failMatch[1]) : 0,
      allPassed
    };
  });

  console.log('\n--- TEST RESULTS ---');
  results.tests.forEach(t => {
    const icon = t.status === 'PASS' ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`${icon} ${t.text}`);
  });

  console.log('\n--- SUMMARY ---');
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  console.log(results.allPassed ? '\x1b[32mALL TESTS PASSED\x1b[0m' : '\x1b[31mSOME TESTS FAILED\x1b[0m');

  await browser.close();
  process.exit(results.failed > 0 ? 1 : 0);
}

run().catch(e => {
  console.error('Test runner error:', e.message);
  process.exit(1);
});
