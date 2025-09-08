import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Users, ShoppingCart, Package } from 'lucide-react';

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

  const { toast } = useToast();

  useEffect(() => {
    fetchCustomers();
    fetchPricing();
    fetchInStock();
  }, []);

  const fetchCustomers = async () => {
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, pin, customer_type, balance')
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
      .select('bottle_type, customer_type, price');
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
    // Use a dedicated Guest customer with pin 'GUEST'
    const { data: found } = await supabase
      .from('customers')
      .select('id')
      .eq('pin', 'GUEST')
      .single();
    if (found?.id) return found.id;

    // Create one if missing
    const { data, error } = await supabase
      .from('customers')
      .insert({
        name: 'Guest',
        pin: 'GUEST',
        customer_type: 'shop',
        delivery_type: 'daily',
        balance: 0,
        deposit_amount: 0,
      })
      .select('id')
      .single();
    if (error) throw error;
    return data!.id as string;
  };

  const handleFill = async () => {
    try {
      const customerId = mode === 'guest' ? await ensureGuestCustomer() : selectedCustomerId;
      if (!customerId) {
        toast({ variant: 'destructive', title: 'Select customer', description: 'Please select a customer' });
        return;
      }
      const customer = customers.find(c => c.id === customerId);
      const ctype = mode === 'guest' ? 'shop' : (customer?.customer_type as any);
      const price = getUnitPrice(ctype, bottleType);
      if (price === undefined) {
        toast({ variant: 'destructive', title: 'Pricing missing', description: `No pricing for ${ctype}/${bottleType}` });
        return;
      }
      const amount = price * quantity;

      const { error: txErr } = await supabase.from('transactions').insert({
        customer_id: customerId,
        transaction_type: 'delivery',
        quantity,
        bottle_type: bottleType,
        amount,
        transaction_date: new Date().toISOString(),
        notes: mode === 'guest' ? 'Shop fill (guest)' : 'Shop fill (customer)'
      });
      if (txErr) throw txErr;

      // Balance update for customer mode only (guests not tracked)
      if (mode === 'customer' && customer) {
        await supabase.from('customers').update({ balance: (customer.balance || 0) + amount }).eq('id', customer.id);
      }

      toast({ title: 'Recorded', description: `Filled ${quantity} ${bottleType}` });
      setQuantity(1);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  const handleTakeBottle = async () => {
    try {
      if (mode !== 'customer') {
        toast({ variant: 'destructive', title: 'Not allowed', description: 'Guests cannot take bottles' });
        return;
      }
      if (!selectedCustomerId) {
        toast({ variant: 'destructive', title: 'Select customer', description: 'Please select a customer' });
        return;
      }
      if (selectedBottleIds.length === 0) {
        toast({ variant: 'destructive', title: 'Select bottles', description: 'Select one or more bottles to take' });
        return;
      }
      const customer = customers.find(c => c.id === selectedCustomerId)!;
      const bottlesSelected = inStock.filter(b => selectedBottleIds.includes(b.id));
      // Sum price by bottle type
      const total = bottlesSelected.reduce((sum, b) => {
        const p = getUnitPrice(customer.customer_type, b.bottle_type) || 0;
        return sum + p;
      }, 0);

      const { error: updErr } = await supabase
        .from('bottles')
        .update({ current_customer_id: selectedCustomerId, is_returned: false })
        .in('id', selectedBottleIds);
      if (updErr) throw updErr;

      const bottle_numbers = bottlesSelected.map(b => b.bottle_number);
      const { error: txErr } = await supabase.from('transactions').insert({
        customer_id: selectedCustomerId,
        transaction_type: 'delivery',
        quantity: bottle_numbers.length,
        bottle_numbers,
        amount: total,
        transaction_date: new Date().toISOString(),
        notes: 'Shop take bottle'
      });
      if (txErr) throw txErr;

      await supabase.from('customers').update({ balance: (customer.balance || 0) + total }).eq('id', customer.id);

      toast({ title: 'Recorded', description: `Bottles issued: ${bottle_numbers.join(', ')}` });
      setSelectedBottleIds([]);
      await fetchInStock();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Shop</h1>
          <p className="text-muted-foreground">Serve guests and customers with fills and bottle issuance</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Mode</CardTitle><CardDescription>Guest or Customer</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <Select value={mode} onValueChange={(v: any) => setMode(v)}>
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
                </div>
                <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredCustomers.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name} ({c.pin})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">Fill</CardTitle><CardDescription>Record a water fill</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
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
              <div className="flex items-end">
                <Button onClick={handleFill} className="w-full"><ShoppingCart className="h-4 w-4 mr-2" /> Fill</Button>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              {(() => {
                const ctype = mode === 'guest' ? 'shop' : (customers.find(c => c.id === selectedCustomerId)?.customer_type || 'shop');
                const p = getUnitPrice(ctype as any, bottleType);
                return p !== undefined ? `Price: ₹${p.toFixed(2)} • Total: ₹${(p * quantity).toFixed(2)}` : 'Pricing not set';
              })()}
            </div>
          </CardContent>
        </Card>
      </div>

      {mode === 'customer' && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Take Bottle</CardTitle><CardDescription>Issue physical bottles from inventory</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  const ids = inStock.filter(b => b.bottle_type === 'normal').map(b => b.id);
                  setSelectedBottleIds((prev) => Array.from(new Set([...prev, ...ids])));
                }}
              >
                Select all Normal
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  const ids = inStock.filter(b => b.bottle_type === 'cool').map(b => b.id);
                  setSelectedBottleIds((prev) => Array.from(new Set([...prev, ...ids])));
                }}
              >
                Select all Cool
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedBottleIds([])}>Clear</Button>
            </div>
            <div className="grid md:grid-cols-2 gap-2 max-h-64 overflow-auto border rounded p-2">
              {inStock.map(b => (
                <label key={b.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selectedBottleIds.includes(b.id)} onChange={(e) => setSelectedBottleIds(prev => e.target.checked ? [...prev, b.id] : prev.filter(id => id !== b.id))} />
                  <span>{b.bottle_number} • {b.bottle_type}</span>
                </label>
              ))}
            </div>
            <div className="flex items-end">
              <Button onClick={handleTakeBottle} className="w-full"><Package className="h-4 w-4 mr-2" /> Issue Bottles</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Shop;
