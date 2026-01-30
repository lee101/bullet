type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  level: LogLevel;
  message: string;
  time: number;
}

const entries: LogEntry[] = [];
const maxEntries = 5000;
let initialized = false;

const stringifyArg = (arg: unknown): string => {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return arg.stack || arg.message;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
};

const record = (level: LogLevel, args: unknown[]) => {
  const message = args.map(stringifyArg).join(' ');
  entries.push({ level, message, time: typeof performance !== 'undefined' ? performance.now() : Date.now() });
  if (entries.length > maxEntries) entries.shift();
};

export const logCollector = {
  init() {
    if (initialized || typeof console === 'undefined') return;
    initialized = true;

    (['log', 'info', 'warn', 'error', 'debug'] as LogLevel[]).forEach(level => {
      const original = console[level].bind(console);
      console[level] = (...args: unknown[]) => {
        record(level, args);
        original(...args);
      };
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('error', event => {
        record('error', [event.message, event.filename, event.lineno, event.colno]);
      });
      window.addEventListener('unhandledrejection', event => {
        record('error', ['UnhandledRejection', event.reason]);
      });

      (window as unknown as { __LOGS__?: LogEntry[] }).__LOGS__ = entries;
    }
  },
  getEntries(): LogEntry[] {
    return [...entries];
  }
};

export const initLogCollector = () => logCollector.init();
