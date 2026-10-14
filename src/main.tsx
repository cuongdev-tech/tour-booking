import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import './i18n';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster position="top-right" richColors closeButton />
  </StrictMode>,
);

// PWA: register the service worker in production builds only (dev must never
// serve a stale cached shell; private mode or http contexts must not break).
try {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }
} catch {
  /* ignore */
}
