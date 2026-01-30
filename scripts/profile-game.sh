#!/bin/bash
# Profile game with bun and generate flamegraph
# Usage: ./scripts/profile-game.sh [duration_seconds]

DURATION=${1:-30}
PORT=${PERF_TEST_PORT:-3002}
PROFILE_DIR="profiles"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$PROFILE_DIR"

echo "Starting dev server..."
bun run dev &
DEV_PID=$!
sleep 3

echo "Profiling for ${DURATION}s..."

# Use Chrome DevTools Protocol to profile
node --input-type=module -e "
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({
  headless: true,
  args: ['--enable-gpu-rasterization', '--enable-webgl', '--no-sandbox']
});

const page = await browser.newPage();
await page.goto('http://localhost:${PORT}?perf=1', { waitUntil: 'domcontentloaded' });

// Wait for engine
await page.waitForFunction(() => window.__ENGINE__, { timeout: 15000 });

// Start game
await page.evaluate(() => {
  window.__ENGINE__.startWithCharacters([
    { slotIndex: 0, characterId: 'samurai', controllerId: 0, inputType: 'KEYBOARD_WASD' }
  ]);
});

// Start CPU profile
await page.tracing.start({ path: '${PROFILE_DIR}/trace_${TIMESTAMP}.json', screenshots: false });

console.log('Recording CPU profile...');
await new Promise(r => setTimeout(r, ${DURATION} * 1000));

await page.tracing.stop();
console.log('Profile saved to ${PROFILE_DIR}/trace_${TIMESTAMP}.json');

// Get perf snapshot
const perf = await page.evaluate(() => window.__PERF__?.snapshot ? window.__PERF__.snapshot() : null);
if (perf) {
  require('fs').writeFileSync('${PROFILE_DIR}/perf_${TIMESTAMP}.json', JSON.stringify(perf, null, 2));
  console.log('Perf data saved to ${PROFILE_DIR}/perf_${TIMESTAMP}.json');
}

await browser.close();
"

kill $DEV_PID 2>/dev/null

echo ""
echo "=== Profile Complete ==="
echo "Trace: ${PROFILE_DIR}/trace_${TIMESTAMP}.json"
echo "Perf:  ${PROFILE_DIR}/perf_${TIMESTAMP}.json"
echo ""
echo "View trace: Open Chrome DevTools > Performance > Load profile"
echo "Convert to flamegraph: speedscope ${PROFILE_DIR}/trace_${TIMESTAMP}.json"
