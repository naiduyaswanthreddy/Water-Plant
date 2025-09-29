import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { usePin } from '@/hooks/usePin';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

const LS_KEYS = {
  COMPANY_NAME: 'settings.company_name',
  COMPANY_ADDRESS: 'settings.company_address',
  
};

const Settings = () => {
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();
  const { hasPin, setPin, clearPin, verifyPin } = usePin();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');

  useEffect(() => {
    setCompanyName(localStorage.getItem(LS_KEYS.COMPANY_NAME) || '');
    setCompanyAddress(localStorage.getItem(LS_KEYS.COMPANY_ADDRESS) || '');
    
  }, []);

  const saveCompany = () => {
    localStorage.setItem(LS_KEYS.COMPANY_NAME, companyName);
    localStorage.setItem(LS_KEYS.COMPANY_ADDRESS, companyAddress);
    toast({ title: 'Saved', description: 'Company settings updated' });
  };

  

  const exportJson = async () => {
    setExporting(true);
    try {
      const [customers, transactions, pricing, bottles] = await Promise.all([
        supabase.from('customers').select('*'),
        supabase.from('transactions').select('*').limit(10000),
        supabase.from('pricing').select('*'),
        supabase.from('bottles').select('*'),
      ]);
      const payload = {
        exported_at: new Date().toISOString(),
        company: { name: companyName, address: companyAddress },
        customers: customers.data || [],
        transactions: transactions.data || [],
        pricing: pricing.data || [],
        bottles: bottles.data || [],
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bottle-buddy-backup-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Company</CardTitle>
            <CardDescription>Branding used in reports and statements</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="company_name">Company Name</Label>
              <Input id="company_name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="company_address">Address</Label>
              <Input id="company_address" value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} />
            </div>
            <Button onClick={saveCompany}>Save</Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Security PIN</CardTitle>
          <CardDescription>Require a PIN to open the app</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm">
            <span className="text-muted-foreground">Current status: </span>
            <span className={hasPin ? 'text-green-600' : 'text-red-600'}>
              {hasPin ? 'PIN set' : 'No PIN set'}
            </span>
          </div>

          {hasPin && (
            <div>
              <Label htmlFor="current_pin">Current PIN</Label>
              <Input
                id="current_pin"
                type="password"
                inputMode="numeric"
                placeholder="Enter current PIN"
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value)}
              />
              <div className="text-xs text-muted-foreground mt-1">For your security, the current PIN cannot be displayed.</div>
            </div>
          )}
          <div>
            <Label htmlFor="new_pin">New PIN</Label>
            <Input
              id="new_pin"
              type="password"
              inputMode="numeric"
              placeholder="Enter new PIN"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="confirm_pin">Confirm PIN</Label>
            <Input
              id="confirm_pin"
              type="password"
              inputMode="numeric"
              placeholder="Confirm new PIN"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
            />
          </div>
          <Button
            onClick={async () => {
              if (newPin.length < 4) {
                toast({ variant: 'destructive', title: 'PIN too short', description: 'Use at least 4 digits.' });
                return;
              }
              if (newPin !== confirmPin) {
                toast({ variant: 'destructive', title: 'PIN mismatch', description: 'Both PINs must match.' });
                return;
              }
              if (hasPin) {
                const ok = await verifyPin(currentPin);
                if (!ok) {
                  toast({ variant: 'destructive', title: 'Incorrect current PIN', description: 'Please enter the correct current PIN.' });
                  return;
                }
              }
              await setPin(newPin);
              setCurrentPin('');
              setNewPin('');
              setConfirmPin('');
              toast({ title: hasPin ? 'PIN updated' : 'PIN set' });
            }}
          >
            {hasPin ? 'Update PIN' : 'Set PIN'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Data Backup</CardTitle>
          <CardDescription>Export your key data as JSON</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button onClick={exportJson} disabled={exporting}>Export JSON</Button>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const { error } = await (supabase as any).rpc('claim_all_rows_for_current_user');
                  if (error) throw error;
                  toast({ title: 'Claimed', description: 'All unowned rows were claimed to your account.' });
                } catch (err: any) {
                  toast({ variant: 'destructive', title: 'Error', description: err.message });
                }
              }}
            >
              Claim Data
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Account</CardTitle>
          <CardDescription>Manage your session</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="destructive"
            onClick={async () => {
              try {
                // Redirect first so user lands on login immediately
                navigate('/auth', { replace: true });
                // Then perform sign out and cleanup in background
                await signOut();
                try { await queryClient.clear(); } catch {}
                toast({ title: 'Signed out', description: 'You have been logged out.' });
              } catch (err: any) {
                toast({ variant: 'destructive', title: 'Error', description: err?.message || 'Failed to sign out' });
              }
            }}
          >
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
