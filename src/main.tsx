import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Register service worker for PWA (only in production and if supported)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // If there's an already waiting SW, notify UI
      if (reg.waiting) {
        const ev = new CustomEvent('sw-update-available', { detail: reg.waiting });
        window.dispatchEvent(ev);
      }
      // Listen for new updates
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          // When installed and an existing controller is active, it's an update
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            const ev = new CustomEvent('sw-update-available', { detail: reg.waiting || sw });
            window.dispatchEvent(ev);
          }
        });
      });
    }).catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  });
} else if ('serviceWorker' in navigator) {
  // In development, ensure any existing service workers are unregistered to prevent cache issues
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
}
