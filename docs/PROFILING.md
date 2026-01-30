# Performance Profiling Guide

## Quick Start

```bash
# Run perf test with benchmarks
PERF_TEST_PORT=3002 bun run test:perf

# Profile game for 30 seconds
chmod +x scripts/profile-game.sh
./scripts/profile-game.sh 30
```

## In-Game Profiling

Add `?perf=1` to URL to enable performance tracking:
- `http://localhost:3002?perf=1` - Enable perf overlay
- `http://localhost:3002?perf=1&perfLog=1` - Also log to console

Access runtime data in browser console:
```javascript
window.__PERF__.snapshot()  // Get perf summary
window.__LOGS__             // Get console log history
window.__LONGTASKS__        // Get long task events
window.__ENGINE__           // Access game engine
```

## Chrome DevTools Profiling

1. Open DevTools (F12) > Performance tab
2. Click Record, play game for 10-30 seconds
3. Stop recording
4. Save profile as JSON

## Flame Graph Analysis

Using speedscope (recommended):
```bash
# Install speedscope
npm install -g speedscope

# Open trace file
speedscope profiles/trace_*.json
```

Using flamegraph-analyzer from dotfiles:
```bash
cd ~/code/dotfiles/flamegraph-analyzer
uv venv && source .venv/bin/activate
uv pip install -e .

# Analyze profile
flamegraph-analyzer profile.prof -o analysis.md
```

## Bun Profiling

```bash
# CPU profile with bun
bun --inspect scripts/your-script.ts

# Generate heap snapshot
bun --heap-snapshot scripts/your-script.ts
```

## Key Metrics

| Metric | Target | Critical |
|--------|--------|----------|
| Startup time | <3s | <5s |
| Avg FPS | >55 | >30 |
| Frame time | <16ms | <33ms |
| Long tasks | <50ms | <100ms |

## WebGL Renderer

The `WebGLRenderer` provides GPU-accelerated batched sprite rendering:

```typescript
import { webglRenderer } from './engine/WebGLRenderer';

// Initialize
webglRenderer.init(canvas);
webglRenderer.loadTexture('sprites', spriteSheet);

// Render frame
webglRenderer.begin(cameraX, cameraY);
webglRenderer.drawSprite(x, y, width, height, rotation);
webglRenderer.flush('sprites');
webglRenderer.end();
```

## Performance Checklist

- [ ] Assets loading in parallel
- [ ] Texture atlases for batch rendering
- [ ] Object pooling for particles/bullets
- [ ] Spatial hashing for collision detection
- [ ] Viewport culling for off-screen objects
- [ ] Web workers for heavy computation
- [ ] requestIdleCallback for non-critical work
