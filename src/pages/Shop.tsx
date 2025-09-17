import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Users, ShoppingCart, Package } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface Customer {
  id: string;
  name: string;
  pin: string;
  customer_type: 'household' | 'shop' | 'function';
  balance: number | null;
}

interface BottleRow {
  id: string;
  bottle_number: string;
  bottle_type: 'normal' | 'cool';
  is_returned: boolean;
}

interface PricingRow {
  bottle_type: 'normal' | 'cool';
  customer_type: 'household' | 'shop' | 'function';
  price: number;
}

const Shop = () => {
  const [mode, setMode] = useState<'guest' | 'customer'>('customer');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [bottleType, setBottleType] = useState<'normal' | 'cool'>('normal');
  const [quantity, setQuantity] = useState<number>(1);
  const [pricing, setPricing] = useState<PricingRow[]>([]);

  const [inStock, setInStock] = useState<BottleRow[]>([]);
  const [selectedBottleIds, setSelectedBottleIds] = useState<string[]>([]);
  const [withCustomer, setWithCustomer] = useState<BottleRow[]>([]);
  const [actionMode, setActionMode] = useState<'fill_only' | 'bottle_and_water'>('fill_only');
  const [amount, setAmount] = useState<number | ''>('');
  const [returnBottleIds, setReturnBottleIds] = useState<string[]>([]);
  const [lastAction, setLastAction] = useState<
    | null
    | {
        used: boolean;
        kind: 'fill_only_guest' | 'fill_only_customer' | 'bottle_and_water';
        customerId: string | null;
        transactionId: string;
        bottleIds?: string[];
        amount: number;
      }
  >(null);

  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    fetchCustomers();
    fetchPricing();
    fetchInStock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    const fetchWithCustomer = async () => {
      if (!user || !selectedCustomerId) {
        setWithCustomer([]);
        setReturnBottleIds([]);
        return;
      }
      const { data, error } = await supabase
        .from('bottles')
        .select('id, bottle_number, bottle_type, is_returned')
        .eq('owner_user_id', user.id)
        .eq('current_customer_id', selectedCustomerId)
        .eq('is_returned', false)
        .order('bottle_number');
      if (!error) setWithCustomer((data || []) as any);
    };
    fetchWithCustomer();
  }, [user?.id, selectedCustomerId]);

  // Mark previously held bottles as returned for the selected customer
  const markReturns = async (customerId: string) => {
    try {
      if (!user || returnBottleIds.length === 0) return;
      // Look up numbers from withCustomer list
      const dict = new Map<string, BottleRow>();
      for (const b of withCustomer) dict.set(b.id, b);
      const numbers = returnBottleIds.map(id => dict.get(id)?.bottle_number).filter(Boolean) as string[];
      if (numbers.length === 0) return;
      const { error: updErr } = await supabase
        .from('bottles')
        .update({ current_customer_id: null, is_returned: true })
        .in('id', returnBottleIds);
      if (updErr) throw updErr;
      const { error: txErr } = await supabase.from('transactions').insert({
        customer_id: customerId,
        transaction_type: 'return',
        quantity: numbers.length,
        bottle_numbers: numbers,
        transaction_date: new Date().toISOString(),
        notes: 'Returned in Shop',
        owner_user_id: user!.id,
      });
      if (txErr) throw txErr;
      // refresh lists
      setReturnBottleIds([]);
      await fetchInStock();
      // Also refresh withCustomer list
      const { data } = await supabase
        .from('bottles')
        .select('id, bottle_number, bottle_type, is_returned')
        .eq('owner_user_id', user!.id)
        .eq('current_customer_id', customerId)
        .eq('is_returned', false)
        .order('bottle_number');
      setWithCustomer((data || []) as any);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    }
  };

  const fetchCustomers = async () => {
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, pin, customer_type, balance')
      .eq('owner_user_id', user!.id)
      .order('name');
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      return;
    }
    setCustomers((data || []) as any);
  };

  const fetchPricing = async () => {
    const { data, error } = await supabase
      .from('pricing')
      .select('bottle_type, customer_type, price')
      .eq('owner_user_id', user!.id);
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      return;
    }
    setPricing((data || []) as any);
  };

  const fetchInStock = async () => {
    const { data, error } = await supabase
      .from('bottles')
      .select('id, bottle_number, bottle_type, is_returned')
      .eq('owner_user_id', user!.id)
      .eq('is_returned', true)
      .order('bottle_number');
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      return;
    }
    setInStock((data || []) as any);
  };

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter(c =>
      c.name.toLowerCase().includes(term) || c.pin.toLowerCase().includes(term)
    );
  }, [customers, search]);

  const getUnitPrice = (ctype: 'household' | 'shop' | 'function', bt: 'normal' | 'cool') => {
    const row = pricing.find(p => p.customer_type === ctype && p.bottle_type === bt);
    return row?.price;
  };

  const ensureGuestCustomer = async (): Promise<string> => {
    // Use a dedicated Guest customer with a 4-char pin to satisfy DB constraint
    const GUEST_PIN = 'G001';
    const { data: found } = await supabase
      .from('customers')
      .select('id')
      .eq('pin', GUEST_PIN)
      .eq('owner_user_id', user!.id)
      .single();
    if (found?.id) return found.id;

    // Create one if missing
    const { data, error } = await supabase
      .from('customers')
      .insert({
        name: 'Guest',
        pin: GUEST_PIN,
        customer_type: 'shop',
        delivery_type: 'daily',
        balance: 0,
        deposit_amount: 0,
        owner_user_id: user!.id,
      })
      .select('id')
      .single();
    if (error) throw error;
    return data!.id as string;
  };

  const handleFill = async (overrideAmount?: number) => {
    try {
      const customerId = mode === 'guest' ? await ensureGuestCustomer() : selectedCustomerId;
      if (!customerId) {
        toast({ variant: 'destructive', title: 'Select customer', description: 'Please select a customer' });
        return;
      }
      // If there are returns checked, process them first
      if (mode === 'customer' && returnBottleIds.length > 0) {
        await markReturns(customerId);
      }
      const customer = customers.find(c => c.id === customerId);
      const ctype = mode === 'guest' ? 'shop' : (customer?.customer_type as any);
      const price = getUnitPrice(ctype, bottleType);
      if (price === undefined) {
        toast({ variant: 'destructive', title: 'Pricing missing', description: `No pricing for ${ctype}/${bottleType}` });
        return;
      }
      const calcAmount = overrideAmount !== undefined ? overrideAmount : price * quantity;

      const { data: txIns, error: txErr } = await supabase.from('transactions').insert({
        customer_id: customerId,
        transaction_type: 'delivery',
        quantity,
        bottle_type: bottleType,
        amount: calcAmount,
        transaction_date: new Date().toISOString(),
        notes: mode === 'guest' ? 'Shop fill (guest)' : 'Shop fill (customer)',
        owner_user_id: user!.id,
      }).select('id').single();
      if (txErr) throw txErr;

      // Balance update for customer mode only (guests not tracked)
      if (mode === 'customer' && customer) {
        await supabase.from('customers').update({ balance: (customer.balance || 0) + calcAmount }).eq('id', customer.id);
      }

      toast({ title: 'Recorded', description: `Filled ${quantity} ${bottleType}` });
      setLastAction({ used: false, kind: mode === 'guest' ? 'fill_only_guest' : 'fill_only_customer', customerId: mode === 'guest' ? null : customer?.id || null, transactionId: (txIns as any).id as string, amount: calcAmount });
      setQuantity(1);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  const handleBottleAndWater = async (overrideAmount?: number) => {
    try {
      if (mode !== 'customer') {
        toast({ variant: 'destructive', title: 'Not allowed', description: 'Guests cannot take bottles' });
        return;
      }
      if (!selectedCustomerId) {
        toast({ variant: 'destructive', title: 'Select customer', description: 'Please select a customer' });
        return;
      }
      // First process returns if any
      if (returnBottleIds.length > 0) {
        await markReturns(selectedCustomerId);
      }
      if (selectedBottleIds.length === 0) {
        toast({ variant: 'destructive', title: 'Select bottles', description: 'Select one or more bottles to take' });
        return;
      }
      const customer = customers.find(c => c.id === selectedCustomerId)!;
      const bottlesSelected = inStock.filter(b => selectedBottleIds.includes(b.id));
      // Sum price by current selected water type
      const unit = getUnitPrice(customer.customer_type, bottleType) || 0;
      const defaultTotal = unit * bottlesSelected.length;
      const total = overrideAmount !== undefined ? overrideAmount : defaultTotal;

      const { error: updErr } = await supabase
        .from('bottles')
        .update({ current_customer_id: selectedCustomerId, is_returned: false })
        .in('id', selectedBottleIds);
      if (updErr) throw updErr;

      const bottle_numbers = bottlesSelected.map(b => b.bottle_number);
      const { data: txIns, error: txErr } = await supabase.from('transactions').insert({
        customer_id: selectedCustomerId,
        transaction_type: 'delivery',
        quantity: bottle_numbers.length,
        bottle_numbers,
        bottle_type: bottleType,
        amount: total,
        transaction_date: new Date().toISOString(),
        notes: 'Shop take bottle + fill',
        owner_user_id: user!.id,
      }).select('id').single();
      if (txErr) throw txErr;

      await supabase.from('customers').update({ balance: (customer.balance || 0) + total }).eq('id', customer.id);

      toast({ title: 'Recorded', description: `Bottles issued: ${bottle_numbers.join(', ')}` });
      setSelectedBottleIds([]);
      setLastAction({ used: false, kind: 'bottle_and_water', customerId: customer.id, transactionId: (txIns as any).id as string, bottleIds: bottlesSelected.map(b => b.id), amount: total });
      await fetchInStock();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  const handleUndo = async () => {
    if (!lastAction || lastAction.used) return;
    try {
      // Delete the transaction
      await supabase.from('transactions').delete().eq('id', lastAction.transactionId);
      // Revert bottles if needed
      if (lastAction.bottleIds && lastAction.bottleIds.length > 0) {
        await supabase
          .from('bottles')
          .update({ current_customer_id: null, is_returned: true })
          .in('id', lastAction.bottleIds);
      }
      // Revert balance for customer actions
      if (lastAction.customerId) {
        const { data: cust } = await supabase.from('customers').select('balance').eq('id', lastAction.customerId).single();
        if (cust) {
          await supabase.from('customers').update({ balance: Math.max(0, (cust.balance || 0) - lastAction.amount) }).eq('id', lastAction.customerId);
        }
      }
      setLastAction((prev) => (prev ? { ...prev, used: true } : prev));
      toast({ title: 'Undone', description: 'Last action has been reverted' });
      await fetchInStock();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Undo failed', description: e.message });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Shop</h1>
        </div>
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleUndo}
            disabled={!lastAction || lastAction.used}
            title={lastAction && !lastAction.used ? 'Undo last action' : 'Nothing to undo'}
          >
            Undo
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Mode</CardTitle><CardDescription>Guest or Customer</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <Select value={mode} onValueChange={(v: any) => {
              setMode(v);
              if (v === 'guest') {
                setActionMode('fill_only');
                setSelectedBottleIds([]);
              }
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="guest">Guest</SelectItem>
                <SelectItem value="customer">Customer</SelectItem>
              </SelectContent>
            </Select>

            {mode === 'customer' && (
              <div>
                <Label>Customer</Label>
                <div className="relative">
                  <Input placeholder="Search by name or PIN" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-2" />
                  {search && filteredCustomers.length > 0 && (
                    <div className="absolute z-50 w-full border rounded bg-card shadow">
                      <ul className="max-h-56 overflow-auto text-sm">
                        {filteredCustomers.slice(0, 8).map(c => (
                          <li key={c.id}>
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-accent hover:text-accent-foreground"
                              onClick={() => { setSelectedCustomerId(c.id); setSearch(`${c.name} (${c.pin})`); }}
                            >
                              {c.name} ({c.pin})
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                {!selectedCustomerId && <div className="text-xs text-muted-foreground">Select a customer from suggestions above.</div>}
                {withCustomer.length > 0 && (
                  <div className="mt-2 text-xs space-y-1">
                    <div className="font-medium">Previously with customer (mark returned):</div>
                    <div className="grid grid-cols-3 gap-2">
                      {withCustomer.map(b => (
                        <label key={b.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={returnBottleIds.includes(b.id)}
                            onChange={(e) => setReturnBottleIds(prev => e.target.checked ? [...prev, b.id] : prev.filter(x => x !== b.id))}
                          />
                          {b.bottle_number}
                        </label>
                      ))}
                    </div>
                    <div className="text-muted-foreground">Checked bottles will be marked as returned before saving.</div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">Record Sale</CardTitle><CardDescription>Fill only or Bottle + Water</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Action</Label>
                <Select value={actionMode} onValueChange={(v: any) => {
                  if (mode === 'guest' && v === 'bottle_and_water') return; // disallow in guest mode
                  setActionMode(v);
                  setSelectedBottleIds([]);
                  setAmount('');
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fill_only">Filling (no bottle)</SelectItem>
                    <SelectItem value="bottle_and_water" disabled={mode === 'guest'}>
                      Bottle + Water
                    </SelectItem>
                  </SelectContent>
                </Select>
                {mode === 'guest' && (
                  <div className="text-xs text-muted-foreground mt-1">Bottle + Water requires selecting a customer.</div>
                )}
              </div>
              <div>
                <Label>Bottle Type</Label>
                <Select value={bottleType} onValueChange={(v: any) => setBottleType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="cool">Cool</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quantity</Label>
                <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))} />
              </div>
            </div>

            {actionMode === 'fill_only' && (
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">
                  {(() => {
                    const ctype = mode === 'guest' ? 'shop' : (customers.find(c => c.id === selectedCustomerId)?.customer_type || 'shop');
                    const p = getUnitPrice(ctype as any, bottleType);
                    const calc = p !== undefined ? p * quantity : undefined;
                    return p !== undefined ? `Price: ₹${p.toFixed(2)} • Total: ₹${calc!.toFixed(2)}` : 'Pricing not set';
                  })()}
                </div>
                <div>
                  <Label>Amount (editable)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={amount === '' ? (() => { const ctype = mode === 'guest' ? 'shop' : (customers.find(c => c.id === selectedCustomerId)?.customer_type || 'shop'); const p = getUnitPrice(ctype as any, bottleType); return p !== undefined ? p * quantity : '' })() : amount}
                    onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Auto-calculated. You can override."
                  />
                </div>
                <div className="flex items-end">
                  <Button onClick={() => handleFill(typeof amount === 'number' ? amount : undefined)} className="w-full"><ShoppingCart className="h-4 w-4 mr-2" /> Fill</Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  {(() => {
                    const ret = returnBottleIds.length;
                    const calc = (() => {
                      const ctype = mode === 'guest' ? 'shop' : (customers.find(c => c.id === selectedCustomerId)?.customer_type || 'shop');
                      const p = getUnitPrice(ctype as any, bottleType);
                      return p !== undefined ? (typeof amount === 'number' ? amount : p * quantity) : undefined;
                    })();
                    const parts: string[] = [];
                    if (ret > 0) parts.push(`Returning ${ret} bottle${ret>1?'s':''}`);
                    parts.push(`filling ${quantity} ${bottleType}`);
                    if (calc !== undefined) parts.push(`charging ₹${calc.toFixed(2)}`);
                    return parts.join(', ');
                  })()}
                </div>
              </div>
            )}

            {actionMode === 'bottle_and_water' && (
              <div className="space-y-2">
                <div>
                  <Label>Select bottles from inventory</Label>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-auto border rounded p-2">
                    {inStock.filter(b => b.bottle_type === bottleType).map(b => (
                      <label key={b.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={selectedBottleIds.includes(b.id)} onChange={(e) => setSelectedBottleIds(prev => e.target.checked ? [...prev, b.id] : prev.filter(id => id !== b.id))} />
                        <span>{b.bottle_number}</span>
                      </label>
                    ))}
                    {inStock.filter(b => b.bottle_type === bottleType).length === 0 && (
                      <div className="text-xs text-muted-foreground">No {bottleType} bottles in stock.</div>
                    )}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  {(() => {
                    const customer = customers.find(c => c.id === selectedCustomerId);
                    const unit = customer ? getUnitPrice(customer.customer_type, bottleType) : undefined;
                    const calc = unit !== undefined ? unit * selectedBottleIds.length : undefined;
                    return unit !== undefined ? `Unit: ₹${unit.toFixed(2)} • Total: ₹${(calc || 0).toFixed(2)}` : 'Pricing not set';
                  })()}
                </div>
                <div>
                  <Label>Amount (editable)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={amount === '' ? '' : amount}
                    onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Auto-calculated. You can override."
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={() => handleBottleAndWater(typeof amount === 'number' ? amount : undefined)}
                    className="w-full"
                    disabled={mode !== 'customer' || !selectedCustomerId}
                  >
                    <Package className="h-4 w-4 mr-2" /> Bottle + Water
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
};

export default Shop;
