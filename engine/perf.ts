import { PerfTracker } from './PerfTracker';

const hasWindow = typeof window !== 'undefined';
const search = hasWindow ? new URLSearchParams(window.location.search) : null;
const perfEnabled = hasWindow && (search?.get('perf') === '1' || localStorage.getItem('perf') === '1');
const perfLogsEnabled = hasWindow && (search?.get('perfLog') === '1' || perfEnabled);

export const enginePerf = new PerfTracker('engine', {
  enabled: perfEnabled,
  sampleEveryFrames: 10,
  reportIntervalMs: 2000,
  slowThresholdMs: 6,
  logToConsole: perfLogsEnabled
});

export const renderPerf = new PerfTracker('render', {
  enabled: perfEnabled,
  sampleEveryFrames: 10,
  reportIntervalMs: 2000,
  slowThresholdMs: 8,
  logToConsole: perfLogsEnabled
});

export const assetPerf = new PerfTracker('asset', {
  enabled: perfEnabled,
  sampleEveryFrames: 1,
  reportIntervalMs: 5000,
  slowThresholdMs: 20,
  logToConsole: perfLogsEnabled
});

export const worldPerf = new PerfTracker('world', {
  enabled: perfEnabled,
  sampleEveryFrames: 1,
  reportIntervalMs: 5000,
  slowThresholdMs: 12,
  logToConsole: perfLogsEnabled
});

export interface PerfSnapshot {
  engine: ReturnType<typeof enginePerf.getSummary>;
  render: ReturnType<typeof renderPerf.getSummary>;
  asset: ReturnType<typeof assetPerf.getSummary>;
  world: ReturnType<typeof worldPerf.getSummary>;
}

export function getPerfSnapshot(): PerfSnapshot {
  return {
    engine: enginePerf.getSummary(),
    render: renderPerf.getSummary(),
    asset: assetPerf.getSummary(),
    world: worldPerf.getSummary()
  };
}

// Expose for runtime inspection/testing
if (hasWindow) {
  (window as unknown as { __PERF__?: { snapshot: () => PerfSnapshot; logs: string[] } }).__PERF__ = {
    snapshot: () => getPerfSnapshot(),
    logs: [
      ...enginePerf.getLogs(),
      ...renderPerf.getLogs(),
      ...assetPerf.getLogs(),
      ...worldPerf.getLogs()
    ]
  };
}
