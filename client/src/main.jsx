import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';
import './styles/index.css';

// Reload automatically once a new version has taken control, so installed
// PWA users always see the latest build without manually clearing caches.
registerSW({ immediate: true, onNeedRefresh() {}, onRegistered(r) {
  r && setInterval(() => r.update(), 60 * 1000);
} });
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload());
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
