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

const sendToServer = (level: LogLevel, message: string, stack?: string) => {
  if (typeof fetch === 'undefined') return;
  fetch('/api/error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level, message, stack })
  }).catch(() => {});
};

const record = (level: LogLevel, args: unknown[], reportToServer = false) => {
  const message = args.map(stringifyArg).join(' ');
  entries.push({ level, message, time: typeof performance !== 'undefined' ? performance.now() : Date.now() });
  if (entries.length > maxEntries) entries.shift();
  if (reportToServer) sendToServer(level, message);
};

export const logCollector = {
  init() {
    if (initialized || typeof console === 'undefined') return;
    initialized = true;

    (['log', 'info', 'warn', 'error', 'debug'] as LogLevel[]).forEach(level => {
      const original = console[level].bind(console);
      console[level] = (...args: unknown[]) => {
        record(level, args, level === 'error' || level === 'warn');
        original(...args);
      };
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('error', event => {
        const msg = `${event.message} at ${event.filename}:${event.lineno}:${event.colno}`;
        record('error', [msg], true);
        sendToServer('error', msg, event.error?.stack);
      });
      window.addEventListener('unhandledrejection', event => {
        const reason = event.reason instanceof Error ? event.reason.stack || event.reason.message : String(event.reason);
        record('error', ['UnhandledRejection', reason], true);
        sendToServer('error', 'UnhandledRejection: ' + reason);
      });

      (window as unknown as { __LOGS__?: LogEntry[] }).__LOGS__ = entries;
    }
  },
  getEntries(): LogEntry[] {
    return [...entries];
  }
};

export const initLogCollector = () => logCollector.init();
