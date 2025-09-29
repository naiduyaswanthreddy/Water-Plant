import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

/**
 * Listens for messages from the Service Worker to inform the user about
 * queued actions and background sync progress/completion.
 */
const SyncIndicator = () => {
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;

    const onMessage = (event: MessageEvent) => {
      const { type, payload } = event.data || {};
      switch (type) {
        case 'queued-action': {
          const method = payload?.method || 'REQUEST';
          toast.info(`Action queued (${method}). Will sync when online.`);
          break;
        }
        case 'sync-start': {
          const total = payload?.total ?? 0;
          if (total > 0) toast.message(`Syncing ${total} queued ${total === 1 ? 'action' : 'actions'}…`);
          break;
        }
        case 'sync-progress': {
          const remaining = payload?.remaining ?? 0;
          toast.message(remaining > 0 ? `Sync in progress… ${remaining} remaining` : 'Sync in progress…');
          break;
        }
        case 'sync-complete': {
          toast.success('All queued actions synced');
          break;
        }
      }
    };

    navigator.serviceWorker?.addEventListener?.('message', onMessage as any);
    return () => navigator.serviceWorker?.removeEventListener?.('message', onMessage as any);
  }, []);

  return null;
};

export default SyncIndicator;
