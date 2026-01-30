export interface LongTaskRecord {
  name: string;
  startTime: number;
  duration: number;
}

const longTasks: LongTaskRecord[] = [];
let initialized = false;
const maxEntries = 1000;

export function initLongTaskMonitor() {
  if (initialized || typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;
  initialized = true;

  try {
    const observer = new PerformanceObserver(list => {
      list.getEntries().forEach(entry => {
        longTasks.push({
          name: entry.name,
          startTime: entry.startTime,
          duration: entry.duration
        });
        if (longTasks.length > maxEntries) longTasks.shift();
      });
    });
    observer.observe({ entryTypes: ['longtask'] });
  } catch {
    // Ignore if longtask entries are not supported
  }

  (window as unknown as { __LONGTASKS__?: LongTaskRecord[] }).__LONGTASKS__ = longTasks;
}
