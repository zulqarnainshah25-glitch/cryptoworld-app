import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App.tsx';
import './index.css';
import { manageServiceWorkerLifecycle } from './utils/serviceWorker';

if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
  const runSwLifecycle = () => {
    void manageServiceWorkerLifecycle({
      isProd: import.meta.env.PROD,
      isNative: Capacitor.isNativePlatform(),
      nav: navigator,
    });
  };

  if (document.readyState === 'complete') {
    runSwLifecycle();
  } else {
    window.addEventListener('load', runSwLifecycle, { once: true });
  }
}

createRoot(document.getElementById('root')!).render(<App />);
