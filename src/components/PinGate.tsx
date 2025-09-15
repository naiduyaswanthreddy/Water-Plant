import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { usePin } from '@/hooks/usePin';

interface PinGateProps {
  children: React.ReactNode;
}

const PinGate = ({ children }: PinGateProps) => {
  const { hasPin, verifyPin, lock } = usePin();
  const [pin, setPin] = useState('');
  const [checking, setChecking] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Force lock on every load so the PIN is prompted every time the site opens
    lock();
    setChecking(false);
  }, [lock]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasPin) {
      // If no PIN set yet, let through and optionally recommend setting one in Settings
      setUnlocked(true);
      return;
    }
    const ok = await verifyPin(pin);
    if (ok) {
      setUnlocked(true);
      setPin('');
    } else {
      toast({ variant: 'destructive', title: 'Incorrect PIN', description: 'Please try again.' });
    }
  };

  if (checking) return null;

  if (!unlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Enter PIN</CardTitle>
            <CardDescription>Access is protected. Please enter your PIN to continue.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUnlock} className="space-y-3">
              <Input
                type="password"
                inputMode="numeric"
                autoFocus
                placeholder="PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
              />
              <Button type="submit" className="w-full">Unlock</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};

export default PinGate;
