import { onCLS, onINP, onLCP, onFCP, onTTFB, type Metric } from 'web-vitals';

interface VitalsReport {
  cls: number | null;
  inp: number | null;
  lcp: number | null;
  fcp: number | null;
  ttfb: number | null;
}

const vitals: VitalsReport = {
  cls: null,
  inp: null,
  lcp: null,
  fcp: null,
  ttfb: null
};

const handleMetric = (metric: Metric) => {
  const name = metric.name.toLowerCase() as keyof VitalsReport;
  vitals[name] = metric.value;

  // Log in dev mode
  if (import.meta.env.DEV) {
    const rating = metric.rating;
    const color = rating === 'good' ? '#0f0' : rating === 'needs-improvement' ? '#ff0' : '#f00';
    console.log(`%c[WebVital] ${metric.name}: ${metric.value.toFixed(2)}ms (${rating})`, `color: ${color}`);
  }
};

export function initWebVitals(): void {
  onCLS(handleMetric);
  onINP(handleMetric);
  onLCP(handleMetric);
  onFCP(handleMetric);
  onTTFB(handleMetric);
}

export function getWebVitals(): VitalsReport {
  return { ...vitals };
}

// Expose for testing
declare global {
  interface Window {
    __WEB_VITALS__: VitalsReport;
  }
}

if (typeof window !== 'undefined') {
  window.__WEB_VITALS__ = vitals;
}
