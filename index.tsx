
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initWebVitals } from './engine/WebVitals';

// Initialize web vitals tracking
initWebVitals();

// Hide loading skeleton once React mounts
const skeleton = document.getElementById('loading-skeleton');
if (skeleton) skeleton.style.display = 'none';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
