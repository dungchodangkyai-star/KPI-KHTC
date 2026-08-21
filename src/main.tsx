import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

declare global {
  interface Window { __kpiNativeFetch?: typeof window.fetch; }
}

const originalFetch = window.__kpiNativeFetch || window.fetch.bind(window);
window.__kpiNativeFetch = originalFetch;
window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
  const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const isApi = requestUrl.startsWith('/api/') || requestUrl.startsWith(window.location.origin + '/api/');
  if (!isApi) return originalFetch(input, init);
  const sourceHeaders = init.headers || (input instanceof Request ? input.headers : undefined);
  const headers = new Headers(sourceHeaders);
  const token = localStorage.getItem('kpi_session_token') || sessionStorage.getItem('kpi_session_token');
  if (token && !headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + token);
  return originalFetch(input, { ...init, headers }).then((response) => {
    if (!response.ok) console.error('[API]', response.status, requestUrl);
    return response;
  });
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
