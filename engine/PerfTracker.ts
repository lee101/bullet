export interface PerfSample {
  count: number;
  total: number;
  max: number;
  last: number;
}

export interface PerfSummaryItem extends PerfSample {
  label: string;
  avg: number;
}

export interface PerfSummary {
  name: string;
  sampledFrames: number;
  items: PerfSummaryItem[];
}

export interface PerfTrackerOptions {
  enabled?: boolean;
  sampleEveryFrames?: number;
  reportIntervalMs?: number;
  slowThresholdMs?: number;
  maxLogs?: number;
  logToConsole?: boolean;
}

export interface PerfRecordOptions {
  force?: boolean;
}

export interface PerfThresholdOptions extends PerfRecordOptions {
  thresholdMs?: number;
}

export class PerfTracker {
  private samples: Map<string, PerfSample> = new Map();
  private logs: string[] = [];
  private frame = 0;
  private sampledFrames = 0;
  private sampleThisFrame = false;
  private lastReport = 0;
  private enabled: boolean;
  private sampleEveryFrames: number;
  private reportIntervalMs: number;
  private slowThresholdMs: number;
  private maxLogs: number;
  private logToConsole: boolean;
  private nowFn: () => number;

  constructor(private name: string, options: PerfTrackerOptions = {}) {
    this.enabled = options.enabled ?? false;
    this.sampleEveryFrames = Math.max(1, options.sampleEveryFrames ?? 10);
    this.reportIntervalMs = options.reportIntervalMs ?? 2000;
    this.slowThresholdMs = options.slowThresholdMs ?? 8;
    this.maxLogs = options.maxLogs ?? 2000;
    this.logToConsole = options.logToConsole ?? true;
    this.nowFn = typeof performance !== 'undefined' && performance.now
      ? () => performance.now()
      : () => Date.now();
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  startFrame() {
    if (!this.enabled) return;
    this.frame += 1;
    this.sampleThisFrame = this.frame % this.sampleEveryFrames === 0;
    if (this.sampleThisFrame) this.sampledFrames += 1;

    const now = this.nowFn();
    if (this.reportIntervalMs > 0 && now - this.lastReport >= this.reportIntervalMs) {
      this.lastReport = now;
      this.report();
    }
  }

  measure<T>(label: string, fn: () => T, options: PerfRecordOptions = {}): T {
    if (!this.enabled || (!this.sampleThisFrame && !options.force)) return fn();
    const start = this.nowFn();
    try {
      return fn();
    } finally {
      this.record(label, this.nowFn() - start, options);
    }
  }

  start(label: string): number {
    if (!this.enabled) return 0;
    return this.nowFn();
  }

  end(label: string, startTime: number, options: PerfRecordOptions = {}) {
    if (!this.enabled || (!this.sampleThisFrame && !options.force)) return;
    const duration = this.nowFn() - startTime;
    this.record(label, duration, options);
  }

  record(label: string, duration: number, options: PerfThresholdOptions = {}) {
    if (!this.enabled || (!this.sampleThisFrame && !options.force)) return;
    const entry = this.samples.get(label) || { count: 0, total: 0, max: 0, last: 0 };
    entry.count += 1;
    entry.total += duration;
    entry.last = duration;
    if (duration > entry.max) entry.max = duration;
    this.samples.set(label, entry);

    const threshold = options.thresholdMs ?? this.slowThresholdMs;
    if (duration >= threshold) {
      this.log(`[PERF:${this.name}] ${label} ${duration.toFixed(2)}ms`);
    }
  }

  getSummary(): PerfSummary {
    const items: PerfSummaryItem[] = Array.from(this.samples.entries()).map(([label, sample]) => ({
      label,
      count: sample.count,
      total: sample.total,
      max: sample.max,
      last: sample.last,
      avg: sample.count ? sample.total / sample.count : 0
    }));

    items.sort((a, b) => b.total - a.total);

    return {
      name: this.name,
      sampledFrames: this.sampledFrames,
      items
    };
  }

  getLogs(): string[] {
    return [...this.logs];
  }

  private report() {
    const summary = this.getSummary();
    if (summary.items.length === 0) return;
    const top = summary.items.slice(0, 5)
      .map(item => `${item.label}: avg ${item.avg.toFixed(2)}ms max ${item.max.toFixed(2)}ms n=${item.count}`)
      .join(' | ');
    this.log(`[PERF:${this.name}] Top ${top}`);
  }

  private log(message: string) {
    this.logs.push(message);
    if (this.logs.length > this.maxLogs) this.logs.shift();
    if (this.logToConsole) console.log(message);
  }
}
