import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Shows a small banner when offline and announces status changes.
 * Provides minimal, global offline UX without coupling into pages.
 */
const NetworkStatus = () => {
  const [online, setOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed bottom-[120px] left-1/2 -translate-x-1/2 z-50 rounded-md border bg-amber-50 text-amber-900 shadow px-3 py-2 text-sm'
      )}
    >
      You are offline. Some actions will be queued and synced when online.
    </div>
  );
};

export default NetworkStatus;
