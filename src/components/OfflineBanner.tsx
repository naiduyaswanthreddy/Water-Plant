import { useEffect, useState } from 'react';

const OfflineBanner = () => {
  const [online, setOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

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
    <div className="w-full bg-amber-100 text-amber-900 text-sm py-2 px-4 flex items-center justify-center gap-2">
      <span className="inline-block h-2 w-2 rounded-full bg-amber-600 animate-pulse" />
      You are offline. Actions will retry or time out. Please check your connection.
    </div>
  );
};

export default OfflineBanner;
