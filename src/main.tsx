import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Global uncaught error filter to guard against face-api Box.constructor runtime warnings
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason && typeof event.reason.message === 'string' && event.reason.message.includes('Box.constructor')) {
      event.preventDefault();
    }
  });
  window.addEventListener('error', (event) => {
    if (event.message && typeof event.message === 'string' && event.message.includes('Box.constructor')) {
      event.preventDefault();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        reg.update().catch(() => {});
        console.log('Service Worker registered:', reg.scope);
      })
      .catch((err) => console.error('Service worker registration failed:', err));
  });
}


