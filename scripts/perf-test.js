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

import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DURATION_MS = 30000; // 30 seconds
const MIN_AVG_FPS = 55;
const MIN_FPS_THRESHOLD = 30;
const MAX_STARTUP_MS = 5000; // Target: 5 seconds or less to start game
const PORT = process.env.PERF_TEST_PORT || process.env.PORT || 3001;
const BASE_URL = `http://localhost:${PORT}`;
const HEADLESS = process.env.PERF_HEADLESS !== 'false';
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function summarizePerf(summary, top = 5) {
  if (!summary || !summary.items) return null;
  const byTotal = [...summary.items].sort((a, b) => b.total - a.total).slice(0, top);
  const byMax = [...summary.items].sort((a, b) => b.max - a.max).slice(0, top);
  return { byTotal, byMax };
}

async function runPerfTest() {
  console.log('Starting E2E Performance Test...\n');

  const browser = await puppeteer.launch({
    headless: HEADLESS,
    args: ['--disable-gpu-vsync', '--disable-frame-rate-limit']
  });

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);
  await page.setViewport({ width: 1920, height: 1080 });
  const logs = [];
  const errors = [];
  const jscheckSamples = [];

  page.on('console', msg => {
    logs.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location(),
      timestamp: Date.now()
    });
  });
  page.on('pageerror', err => {
    errors.push({ message: err.message, stack: err.stack, timestamp: Date.now() });
  });
  page.on('error', err => {
    errors.push({ message: err.message, stack: err.stack, timestamp: Date.now() });
  });
  page.on('requestfailed', req => {
    logs.push({
      type: 'requestfailed',
      text: `${req.failure()?.errorText || 'requestfailed'} ${req.url()}`,
      timestamp: Date.now()
    });
  });

  // Navigate to the game and measure startup time
  console.log('Loading game...');
  const startupStart = Date.now();
  await page.goto(`${BASE_URL}?perf=1&perfLog=1&quality=low`, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait for engine to be ready (pre-warmed)
  console.log('Waiting for engine pre-warm...');
  await page.waitForFunction(() => window.__ENGINE__, { timeout: 15000 });
  const engineReadyTime = Date.now() - startupStart;
  console.log(`Engine ready: ${engineReadyTime}ms`);

  console.log('Starting single-player game...');
  const gameStartTime = Date.now();
  await page.evaluate(() => {
    const engine = window.__ENGINE__;
    if (engine) {
      engine.startWithCharacters([
        { slotIndex: 0, characterId: 'samurai', controllerId: 0, inputType: 'KEYBOARD_WASD' }
      ]);
    }
  });
  await sleep(500);
  const startupTime = Date.now() - startupStart;
  console.log(`Total startup time: ${startupTime}ms (target: <${MAX_STARTUP_MS}ms)`);
  let jscheckBusy = false;
  const jscheckTimer = setInterval(async () => {
    if (jscheckBusy) return;
    jscheckBusy = true;
    try {
      const sample = await page.evaluate(() => {
        const perf = window.__PERF__?.snapshot ? window.__PERF__.snapshot() : null;
        const webVitals = window.__WEB_VITALS__ || null;
        const longTasks = window.__LONGTASKS__ || [];
        const memory = performance.memory
          ? {
              usedJSHeapSize: performance.memory.usedJSHeapSize,
              totalJSHeapSize: performance.memory.totalJSHeapSize,
              jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
            }
          : null;
        return { perf, webVitals, longTasks, memory };
      });
      jscheckSamples.push({ timestamp: Date.now(), ...sample });
    } catch (err) {
      logs.push({ type: 'jscheck-error', text: String(err), timestamp: Date.now() });
    } finally {
      jscheckBusy = false;
    }
  }, 5000);

  // Simulate keyboard input for movement
  console.log(`Running gameplay simulation for ${TEST_DURATION_MS / 1000} seconds...`);

  let movementInterval;

  // Simulate random movement with WASD
  movementInterval = setInterval(async () => {
    const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
    const randomKey = keys[Math.floor(Math.random() * keys.length)];

    await page.keyboard.down(randomKey);
    await sleep(100 + Math.random() * 200);
    await page.keyboard.up(randomKey);
  }, 300);

  // Wait for test duration
  await sleep(TEST_DURATION_MS);
  clearInterval(movementInterval);
  clearInterval(jscheckTimer);

  // Collect FPS data
  const fpsData = await page.evaluate(() => {
    return {
      samples: window.__GAME_FPS_SAMPLES__ || [],
      current: window.__GAME_FPS__ || 0
    };
  });

  const perfSnapshot = await page.evaluate(() => window.__PERF__?.snapshot ? window.__PERF__.snapshot() : null);
  const inPageLogs = await page.evaluate(() => window.__LOGS__ || []);
  const longTasks = await page.evaluate(() => window.__LONGTASKS__ || []);
  const webVitals = await page.evaluate(() => window.__WEB_VITALS__ || null);

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

  if (startupTime > MAX_STARTUP_MS) {
    console.log(`FAIL: Startup time (${startupTime}ms) exceeds threshold (${MAX_STARTUP_MS}ms)`);
    passed = false;
  } else {
    console.log(`PASS: Startup time (${startupTime}ms) <= ${MAX_STARTUP_MS}ms`);
  }

  const perfAnalysis = perfSnapshot ? {
    engine: summarizePerf(perfSnapshot.engine),
    render: summarizePerf(perfSnapshot.render),
    asset: summarizePerf(perfSnapshot.asset),
    world: summarizePerf(perfSnapshot.world)
  } : null;

  const outDir = path.resolve(__dirname, '..', 'test-results');
  fs.mkdirSync(outDir, { recursive: true });
  const report = {
    startupTime,
    engineReadyTime,
    fpsData,
    perfSnapshot,
    perfAnalysis,
    jscheckSamples,
    logs,
    inPageLogs,
    longTasks,
    webVitals,
    errors
  };
  const reportPath = path.join(outDir, 'perf-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  if (perfAnalysis) {
    console.log('\n=== PERF ANALYSIS (Top by total / max) ===\n');
    console.log(JSON.stringify(perfAnalysis, null, 2));
    console.log(`\nSaved perf report to ${reportPath}`);
  }

  console.log('\n' + (passed ? 'TEST PASSED' : 'TEST FAILED'));
  process.exit(passed ? 0 : 1);
}

runPerfTest().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
