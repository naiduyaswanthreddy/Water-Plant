import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Captures the `beforeinstallprompt` event to present a custom install CTA.
 * Shows a small bottom banner with an Install button.
 */
const InstallPrompt = () => {
  const [deferred, setDeferred] = useState<any>(null);
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const onBIP = (e: any) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      setDeferred(e);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onBIP);
    return () => window.removeEventListener('beforeinstallprompt', onBIP);
  }, []);

  if (!visible) return null;

  const onInstall = async () => {
    if (!deferred) return;
    setInstalling(true);
    try {
      const outcome = await deferred.prompt();
      // Optionally: send analytics event with outcome.outcome ('accepted'|'dismissed')
      setDeferred(null);
      setVisible(false);
    } catch (_) {
      // Ignore
    } finally {
      setInstalling(false);
    }
  };

  const onDismiss = () => {
    setVisible(false);
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-card border rounded-md shadow p-3 flex items-center gap-3 text-sm">
      <span>Install Sri Venkateswara Water Plant for a faster, app-like experience.</span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={onDismiss} disabled={installing}>Later</Button>
        <Button size="sm" onClick={onInstall} disabled={installing}>{installing ? 'Installing…' : 'Install'}</Button>
      </div>
    </div>
  );
};

export default InstallPrompt;
