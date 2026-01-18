/**
 * E2E Performance Test for Ethereal Storm
 *
 * Run with: node scripts/perf-test.js
 * Requires: puppeteer (npm install puppeteer)
 *
 * This test:
 * 1. Launches the game in a browser
 * 2. Starts single-player mode
 * 3. Simulates movement for 30 seconds
 * 4. Reports FPS statistics
 * 5. Fails if average FPS < 55 or min FPS < 30
 */

const puppeteer = require('puppeteer');

const TEST_DURATION_MS = 30000; // 30 seconds
const MIN_AVG_FPS = 55;
const MIN_FPS_THRESHOLD = 30;

async function runPerfTest() {
  console.log('Starting E2E Performance Test...\n');

  const browser = await puppeteer.launch({
    headless: false, // Set to true for CI
    args: ['--disable-gpu-vsync', '--disable-frame-rate-limit']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  // Navigate to the game (assumes dev server is running on 3001)
  console.log('Loading game...');
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle0' });
  await page.waitForTimeout(2000);

  // Click "Solo Quest" button to start single-player
  console.log('Starting single-player game...');
  await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.textContent.includes('Solo') || btn.textContent.includes('SOLO')) {
        btn.click();
        return;
      }
    }
  });

  await page.waitForTimeout(1000);

  // Simulate keyboard input for movement
  console.log(`Running gameplay simulation for ${TEST_DURATION_MS / 1000} seconds...`);

  const startTime = Date.now();
  let movementInterval;

  // Simulate random movement with WASD
  movementInterval = setInterval(async () => {
    const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
    const randomKey = keys[Math.floor(Math.random() * keys.length)];

    await page.keyboard.down(randomKey);
    await page.waitForTimeout(100 + Math.random() * 200);
    await page.keyboard.up(randomKey);
  }, 300);

  // Wait for test duration
  await page.waitForTimeout(TEST_DURATION_MS);
  clearInterval(movementInterval);

  // Collect FPS data
  const fpsData = await page.evaluate(() => {
    return {
      samples: window.__GAME_FPS_SAMPLES__ || [],
      current: window.__GAME_FPS__ || 0
    };
  });

  await browser.close();

  // Analyze results
  console.log('\n=== PERFORMANCE RESULTS ===\n');

  if (fpsData.samples.length === 0) {
    console.log('ERROR: No FPS samples collected');
    process.exit(1);
  }

  const samples = fpsData.samples;
  const avgFps = samples.reduce((a, b) => a + b, 0) / samples.length;
  const minFps = Math.min(...samples);
  const maxFps = Math.max(...samples);

  console.log(`Samples collected: ${samples.length}`);
  console.log(`Average FPS: ${avgFps.toFixed(1)}`);
  console.log(`Min FPS: ${minFps}`);
  console.log(`Max FPS: ${maxFps}`);
  console.log(`FPS Distribution: ${samples.join(', ')}`);

  console.log('\n=== PASS/FAIL CRITERIA ===\n');

  let passed = true;

  if (avgFps < MIN_AVG_FPS) {
    console.log(`FAIL: Average FPS (${avgFps.toFixed(1)}) below threshold (${MIN_AVG_FPS})`);
    passed = false;
  } else {
    console.log(`PASS: Average FPS (${avgFps.toFixed(1)}) >= ${MIN_AVG_FPS}`);
  }

  if (minFps < MIN_FPS_THRESHOLD) {
    console.log(`FAIL: Min FPS (${minFps}) below threshold (${MIN_FPS_THRESHOLD})`);
    passed = false;
  } else {
    console.log(`PASS: Min FPS (${minFps}) >= ${MIN_FPS_THRESHOLD}`);
  }

  console.log('\n' + (passed ? 'TEST PASSED' : 'TEST FAILED'));
  process.exit(passed ? 0 : 1);
}

runPerfTest().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
