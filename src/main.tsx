import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary';
import {reportClientError} from './services/clientErrorReport';
import './index.css';

// خطاهای خارج از چرخهٔ رندر (رویدادها و پرامیس‌های ردشده) هم گزارش و نمایش داده می‌شوند
window.addEventListener('error', (event) => {
  reportClientError({
    message: event.message || 'خطای نامشخص مرورگر',
    stack: event.error?.stack || null,
    source: 'window-error',
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  reportClientError({
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack || null : null,
    source: 'unhandled-rejection',
  });
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
