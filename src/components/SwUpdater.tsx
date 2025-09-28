import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Listens for a custom window event 'sw-update-available' dispatched by service worker registration
 * logic in main.tsx. Shows a small banner to prompt the user to update the app.
 */
const SwUpdater = () => {
  const [updateReady, setUpdateReady] = useState<ServiceWorker | null>(null);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    const onUpdateAvailable = (e: Event) => {
      const sw = (e as CustomEvent<ServiceWorker>).detail;
      setUpdateReady(sw);
    };
    window.addEventListener('sw-update-available', onUpdateAvailable as EventListener);
    return () => window.removeEventListener('sw-update-available', onUpdateAvailable as EventListener);
  }, []);

  useEffect(() => {
    // If the controller changes, the new SW took control; reload once
    const onControllerChange = () => {
      if (reloading) return;
      setReloading(true);
      window.location.reload();
    };
    navigator.serviceWorker?.addEventListener?.('controllerchange', onControllerChange);
    return () => navigator.serviceWorker?.removeEventListener?.('controllerchange', onControllerChange);
  }, [reloading]);

  if (!updateReady) return null;

  const applyUpdate = () => {
    // Ask waiting SW to activate immediately
    updateReady?.postMessage?.({ type: 'SKIP_WAITING' });
  };

  return (
    <div className="fixed bottom-[72px] left-1/2 -translate-x-1/2 z-50 bg-card border rounded-md shadow p-3 flex items-center gap-3 text-sm">
      <span>A new update is available.</span>
      <Button size="sm" onClick={applyUpdate} disabled={reloading}>
        {reloading ? 'Updating…' : 'Update'}
      </Button>
    </div>
  );
};

export default SwUpdater;
