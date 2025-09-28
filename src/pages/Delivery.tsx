import { useEffect, useMemo, useState } from 'react';
import { PageSkeleton } from '@/components/skeletons/PageSkeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Search, Truck, Check, X, PlusCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { withTimeoutRetry } from '@/lib/supaRequest';

interface Customer {
  id: string;
  pin: string;
  name: string;
  phone?: string;
  customer_type: 'household' | 'shop' | 'function';
  balance: number | null;
}

interface Bottle {
  id: string;
  bottle_number: string;
  bottle_type: 'normal' | 'cool';
  is_returned: boolean;
  current_customer_id?: string | null;
}

interface PricingRow {
  id: string;
  bottle_type: 'normal' | 'cool';
  customer_type: 'household' | 'shop' | 'function';
  price: number;
}

const Delivery = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [pricing, setPricing] = useState<PricingRow[]>([]);
  const [deliveredToday, setDeliveredToday] = useState<Record<string, boolean>>({});
  const [skippedToday, setSkippedToday] = useState<Record<string, boolean>>({});
  const [inStock, setInStock] = useState<Bottle[]>([]);

  // Dialog state
  const [activeCustomer, setActiveCustomer] = useState<Customer | null>(null);
  const [dialogType, setDialogType] = useState<'given' | 'extra' | null>(null);
  const [quantity, setQuantity] = useState<number | ''>(1);
  const [bottleType, setBottleType] = useState<'normal' | 'cool'>('normal');
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 16));
  const [mode, setMode] = useState<'handover' | 'fill_only'>('handover');
  const [selectedBottleIds, setSelectedBottleIds] = useState<string[]>([]);
  const [withCustomer, setWithCustomer] = useState<Bottle[]>([]);
  const [yesterdayGiven, setYesterdayGiven] = useState<string[]>([]);
  const [returnBottleIds, setReturnBottleIds] = useState<string[]>([]);
  const [amount, setAmount] = useState<number | ''>('');
  const [lastAction, setLastAction] = useState<
    | null
    | {
        used: boolean;
        kind: 'handover' | 'fill_only' | 'extra_handover' | 'extra_fill';
        customerId: string;
        transactionId: string;
        bottleIds?: string[];
        amount: number;
      }
  >(null);
  const [dialogSaving, setDialogSaving] = useState(false);

  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Realtime: keep delivery view in sync when core tables change
  useEffect(() => {
    if (!user) return;
    let debounce: number | undefined;
    const schedule = (fn: () => void) => {
      if (debounce) window.clearTimeout(debounce);
      debounce = window.setTimeout(fn, 250);
    };

    const channel = supabase
      .channel('realtime-delivery-page')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: `owner_user_id=eq.${user.id}` },
        (payload: any) => {
        const tx = payload.new as any;
        if (!tx || tx.owner_user_id === user.id) {
          // Fine-grained map updates for today's delivery/skip markers
          const isTodayTx = (iso: string) => {
            if (!iso) return false;
            const d = new Date(iso);
            const todayStart = new Date(); todayStart.setHours(0,0,0,0);
            const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(todayStart.getDate() + 1);
            return d >= todayStart && d < tomorrowStart;
          };
          if (payload.eventType === 'INSERT' && tx.transaction_type === 'delivery' && isTodayTx(tx.transaction_date)) {
            if ((tx.quantity || 0) > 0) {
              setDeliveredToday((prev) => ({ ...prev, [tx.customer_id]: true }));
            } else {
              setSkippedToday((prev) => ({ ...prev, [tx.customer_id]: true }));
            }
            return; // no need to refetch for simple inserts
          }
          // For UPDATE/DELETE we may need to unset flags; fall back to debounced fetch
          schedule(() => fetchData());
        }
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bottles', filter: `owner_user_id=eq.${user.id}` },
        (payload: any) => {
        const row = (payload.new || payload.old) as any;
        if (!row || row.owner_user_id === user.id) {
          // Fine-grained update to inStock list (bottles with is_returned=true)
          setInStock((prev) => {
            const list = [...prev];
            const n = payload.new as any;
            const o = payload.old as any;
            const indexOf = (id: string) => list.findIndex((b) => b.id === id);
            if (payload.eventType === 'INSERT' && n) {
              if (n.is_returned) return [...list, { id: n.id, bottle_number: n.bottle_number, bottle_type: n.bottle_type, is_returned: n.is_returned }];
              return list;
            }
            if (payload.eventType === 'UPDATE' && n) {
              const idx = indexOf(n.id);
              if (n.is_returned) {
                if (idx >= 0) {
                  list[idx] = { id: n.id, bottle_number: n.bottle_number, bottle_type: n.bottle_type, is_returned: n.is_returned };
                  return list;
                }
                return [...list, { id: n.id, bottle_number: n.bottle_number, bottle_type: n.bottle_type, is_returned: n.is_returned }];
              } else {
                if (idx >= 0) list.splice(idx, 1);
                return list;
              }
            }
            if (payload.eventType === 'DELETE' && o) {
              const idx = indexOf(o.id);
              if (idx >= 0) list.splice(idx, 1);
              return list;
            }
            return list;
          });
          schedule(() => fetchData());
        }
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customers', filter: `owner_user_id=eq.${user.id}` },
        (payload: any) => {
        const row = (payload.new || payload.old) as any;
        if (!row || row.owner_user_id === user.id) {
          schedule(() => fetchData());
        }
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pricing', filter: `owner_user_id=eq.${user.id}` },
        (payload: any) => {
        const row = (payload.new || payload.old) as any;
        if (!row || row.owner_user_id === user.id) {
          schedule(() => fetchData());
        }
      })
      .subscribe();

    return () => {
      if (debounce) window.clearTimeout(debounce);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const fetchData = async () => {
    try {
      const [customersRes, pricingRes, inStockRes] = await Promise.all([
        supabase
          .from('customers')
          .select('id, pin, name, phone, customer_type, balance')
          .eq('customer_type', 'household')
          .eq('owner_user_id', user!.id)
          .order('name'),
        supabase
          .from('pricing')
          .select('id, bottle_type, customer_type, price')
          .eq('owner_user_id', user!.id)
          .eq('customer_type', 'household'),
        supabase
          .from('bottles')
          .select('id, bottle_number, bottle_type, is_returned, current_customer_id')
          .eq('owner_user_id', user!.id)
          .eq('is_returned', true)
          .order('bottle_number')
      ]);

      if (customersRes.error) throw customersRes.error;
      if (pricingRes.error) throw pricingRes.error;
      if (inStockRes.error) throw inStockRes.error;

      const custList = customersRes.data || [];
      setCustomers(custList);
      setPricing(pricingRes.data || []);
      setInStock(inStockRes.data || []);

      // After loading customers, check if delivered or skipped today per customer
      if (custList.length > 0) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const tomorrowStart = new Date(todayStart);
        tomorrowStart.setDate(todayStart.getDate() + 1);

        const { data: txs, error: txErr } = await supabase
          .from('transactions')
          .select('customer_id, quantity, transaction_date, transaction_type, notes')
          .eq('transaction_type', 'delivery')
          .eq('owner_user_id', user!.id)
          .gte('transaction_date', todayStart.toISOString())
          .lt('transaction_date', tomorrowStart.toISOString())
          .in('customer_id', custList.map(c => c.id));
        if (txErr) throw txErr;

        const deliveredMap: Record<string, boolean> = {};
        const skippedMap: Record<string, boolean> = {};
        for (const t of txs || []) {
          const qty = (t as any).quantity || 0;
          if (qty > 0) deliveredMap[(t as any).customer_id] = true;
          if (qty === 0) skippedMap[(t as any).customer_id] = true;
        }
        setDeliveredToday(deliveredMap);
        setSkippedToday(skippedMap);
      } else {
        setDeliveredToday({});
        setSkippedToday({});
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const markReturns = async (cust: Customer, ids: string[], when: string) => {
    if (ids.length === 0) return;
    // Lookup numbers
    const dict = new Map<string, Bottle>();
    for (const b of withCustomer) dict.set(b.id, b);
    const numbers = ids.map(id => dict.get(id)?.bottle_number).filter(Boolean) as string[];
    // Update bottles: returned
    const { error: updErr } = await supabase
      .from('bottles')
      .update({ current_customer_id: null, is_returned: true })
      .in('id', ids);
    if (updErr) throw updErr;
    // Insert return transactions (aggregate as one entry)
    const { error: txErr } = await supabase.from('transactions').insert({
      customer_id: cust.id,
      transaction_type: 'return',
      quantity: numbers.length,
      bottle_numbers: numbers,
      bottle_type: null,
      transaction_date: when,
      owner_user_id: user!.id,
      notes: 'Returned before handover',
    });
    if (txErr) throw txErr;
  };

  const assignBottlesDelivery = async (
    cust: Customer,
    ids: string[],
    bt: 'normal' | 'cool',
    when: string,
    note?: string,
    overrideAmount?: number
  ): Promise<{ transactionId: string; amount: number; numbers: string[]; }> => {
    // Look up numbers from inStock/current lists
    const dict = new Map<string, Bottle>();
    for (const b of inStock) dict.set(b.id, b);
    const numbers = ids.map(id => dict.get(id)?.bottle_number).filter(Boolean) as string[];

    // Update bottles to assign
    const { error: updErr } = await supabase
      .from('bottles')
      .update({ current_customer_id: cust.id, is_returned: false })
      .in('id', ids);
    if (updErr) throw updErr;

    // Insert transaction with bottle_numbers
    const unitPrice = householdPrices[bt] || 0;
    const amount = overrideAmount !== undefined ? overrideAmount : unitPrice * numbers.length;
    const { data: txIns, error: txErr } = await supabase.from('transactions').insert({
      customer_id: cust.id,
      transaction_type: 'delivery',
      quantity: numbers.length,
      bottle_type: bt,
      bottle_numbers: numbers,
      amount,
      transaction_date: when,
      notes: note || null,
      owner_user_id: user!.id,
    }).select('id').single();
    if (txErr) throw txErr;

    // Recompute balance from transactions for correctness
    await recomputeCustomerBalance(cust.id);
    return { transactionId: (txIns as any).id as string, amount, numbers };
  };

  const householdPrices = useMemo(() => {
    const map: Record<'normal' | 'cool', number | undefined> = { normal: undefined, cool: undefined };
    for (const row of pricing) {
      if (row.customer_type === 'household') {
        map[row.bottle_type] = row.price;
      }
    }
    return map;
  }, [pricing]);

  const filteredCustomers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter(c =>
      c.name.toLowerCase().includes(term) ||
      c.pin.toLowerCase().includes(term) ||
      (c.phone || '').toLowerCase().includes(term)
    );
  }, [customers, searchTerm]);

  const resetDialog = () => {
    setQuantity(1);
    setBottleType('normal');
    setDate(new Date().toISOString().slice(0, 16));
    setActiveCustomer(null);
    setDialogType(null);
    setMode('handover');
    setSelectedBottleIds([]);
    setReturnBottleIds([]);
    setWithCustomer([]);
    setYesterdayGiven([]);
    setReturnBottleIds([]);
    setAmount('');
  };

  const handleOpenDialog = async (type: 'given' | 'extra', customer: Customer) => {
    setActiveCustomer(customer);
    setDialogType(type);
    setQuantity(1);
    setBottleType('normal');
    setDate(new Date().toISOString().slice(0, 16));
    setMode('handover');
    setSelectedBottleIds([]);

    try {
      // Bottles currently with this customer
      const { data: custBottles, error: custErr } = await supabase
        .from('bottles')
        .select('id, bottle_number, bottle_type, is_returned, current_customer_id')
        .eq('owner_user_id', user!.id)
        .eq('current_customer_id', customer.id)
        .eq('is_returned', false)
        .order('bottle_number');
      if (custErr) throw custErr;
      setWithCustomer(custBottles || []);

      // Yesterday given list (by bottle_numbers)
      const start = new Date();
      start.setHours(0,0,0,0);
      const yStart = new Date(start);
      yStart.setDate(start.getDate() - 1);
      const { data: yTx, error: yErr } = await supabase
        .from('transactions')
        .select('bottle_numbers, transaction_date')
        .eq('owner_user_id', user!.id)
        .eq('customer_id', customer.id)
        .eq('transaction_type', 'delivery')
        .gte('transaction_date', yStart.toISOString())
        .lt('transaction_date', start.toISOString())
        .order('transaction_date', { ascending: false });
      if (yErr) throw yErr;
      const yList: string[] = [];
      for (const t of yTx || []) {
        for (const num of ((t as any).bottle_numbers || [])) yList.push(num);
      }
      setYesterdayGiven(yList);
    } catch (e) {
      // Non-blocking
    }
  };

  const upsertDelivery = async (
    cust: Customer,
    qty: number,
    bt: 'normal' | 'cool',
    whenISO: string,
    note?: string,
    overrideAmount?: number
  ): Promise<{ transactionId: string; amount: number; } | null> => {
    // Pricing check
    const unitPrice = householdPrices[bt];
    if (unitPrice === undefined) {
      toast({ variant: 'destructive', title: 'Pricing missing', description: `No pricing set for household / ${bt}. Please set it in Pricing.` });
      return null;
    }

    const when = new Date(whenISO).toISOString();
    const amount = overrideAmount !== undefined ? overrideAmount : qty * unitPrice;

    // Insert transaction and update balance
    const { data: txIns, error: txErr } = await withTimeoutRetry(
      () => supabase.from('transactions').insert({
        customer_id: cust.id,
        transaction_type: 'delivery',
        quantity: qty,
        bottle_type: bt,
        amount: amount,
        transaction_date: when,
        notes: note || null,
        owner_user_id: user!.id,
      }).select('id').single(),
      { timeoutMs: 10000 }
    );
    if (txErr) throw txErr;
    // Recompute after insert
    await recomputeCustomerBalance(cust.id);
    return { transactionId: (txIns as any).id as string, amount };
  };

  const handleGivenConfirm = async () => {
    if (!activeCustomer || !dialogType) return;
    try {
      setDialogSaving(true);
      const qNum = typeof quantity === 'number' ? quantity : 0;
      if (qNum < 1) {
        toast({ variant: 'destructive', title: 'Quantity required', description: 'Please enter a valid quantity' });
        return;
      }
      // First, process any returns marked from previously held bottles
      if (returnBottleIds.length > 0) {
        await withTimeoutRetry(() => markReturns(activeCustomer, returnBottleIds, date), { timeoutMs: 10000 });
      }
      const effAmount = typeof amount === 'number' ? amount : undefined;
      if (mode === 'handover') {
        const filtered = inStock.filter(b => b.bottle_type === bottleType);
        let selected = selectedBottleIds.filter(id => filtered.some(b => b.id === id));
        if (selected.length < qNum && filtered.length >= qNum) {
          // Auto-pick the first N available bottles to meet the requested quantity
          selected = filtered.slice(0, qNum).map(b => b.id);
        }
        if (selected.length !== qNum) {
          toast({ variant: 'destructive', title: 'Select bottles', description: `Please select ${qNum} ${bottleType} bottle(s) to hand over.` });
          return;
        }
        const result = await withTimeoutRetry(
          () => assignBottlesDelivery(activeCustomer, selected, bottleType, date, undefined, effAmount),
          { timeoutMs: 10000 }
        );
        setLastAction({ used: false, kind: 'handover', customerId: activeCustomer.id, transactionId: result.transactionId, bottleIds: selected, amount: result.amount });
      } else {
        const result = await withTimeoutRetry(
          () => upsertDelivery(activeCustomer, qNum, bottleType, date, 'Fill only (no bottle handover)', effAmount),
          { timeoutMs: 10000 }
        );
        if (!result) return; // pricing missing, already toasted
        setLastAction({ used: false, kind: 'fill_only', customerId: activeCustomer.id, transactionId: result.transactionId, amount: result.amount });
      }
      toast({ title: 'Recorded', description: `Given ${qNum} ${bottleType} bottle(s) to ${activeCustomer.name}` });
      await fetchData();
      resetDialog();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setDialogSaving(false);
    }
  };

  const handleUndo = async () => {
    if (!lastAction || lastAction.used) return;
    try {
      // Delete the transaction
      await withTimeoutRetry(() => supabase.from('transactions').delete().eq('id', lastAction.transactionId), { timeoutMs: 10000 });
      // Revert bottles if any were handed over
      if (lastAction.bottleIds && lastAction.bottleIds.length > 0) {
        await withTimeoutRetry(() => supabase
          .from('bottles')
          .update({ current_customer_id: null, is_returned: true })
          .in('id', lastAction.bottleIds), { timeoutMs: 10000 });
      }
      // Recompute customer balance for correctness instead of clamping
      await recomputeCustomerBalance(lastAction.customerId);
      setLastAction(prev => (prev ? { ...prev, used: true } : prev));
      toast({ title: 'Undone', description: 'Last action has been reverted' });
      await fetchData();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Undo failed', description: e.message });
    }
  };

  const handleExtraConfirm = async () => {
    if (!activeCustomer || !dialogType) return;
    try {
      setDialogSaving(true);
      const qNum = typeof quantity === 'number' ? quantity : 0;
      if (qNum < 1) {
        toast({ variant: 'destructive', title: 'Quantity required', description: 'Please enter a valid quantity' });
        return;
      }
      // Process any returns marked from previously held bottles
      if (returnBottleIds.length > 0) {
        await withTimeoutRetry(() => markReturns(activeCustomer, returnBottleIds, date), { timeoutMs: 10000 });
      }
      const effAmount = typeof amount === 'number' ? amount : undefined;
      if (mode === 'handover') {
        // Validate selection count and assign bottles as extra
        const filtered = inStock.filter(b => b.bottle_type === bottleType);
        let selected = selectedBottleIds.filter(id => filtered.some(b => b.id === id));
        if (selected.length < qNum && filtered.length >= qNum) {
          // Auto-pick the first N available bottles to meet the requested quantity
          selected = filtered.slice(0, qNum).map(b => b.id);
        }
        if (selected.length !== qNum) {
          toast({ variant: 'destructive', title: 'Select bottles', description: `Please select ${qNum} ${bottleType} bottle(s) to hand over.` });
          return;
        }
        const result = await withTimeoutRetry(
          () => assignBottlesDelivery(activeCustomer, selected, bottleType, date, 'Extra', effAmount),
          { timeoutMs: 10000 }
        );
        setLastAction({ used: false, kind: 'extra_handover', customerId: activeCustomer.id, transactionId: result.transactionId, bottleIds: selected, amount: result.amount });
      } else {
        // Fill only extra delivery (no bottle handover)
        const result = await withTimeoutRetry(
          () => upsertDelivery(activeCustomer, qNum, bottleType, date, 'Extra (fill only)', effAmount),
          { timeoutMs: 10000 }
        );
        if (!result) return; // pricing missing, already toasted
        setLastAction({ used: false, kind: 'extra_fill', customerId: activeCustomer.id, transactionId: result.transactionId, amount: result.amount });
      }
      toast({ title: 'Recorded', description: `Extra ${qNum} ${bottleType} bottle(s) for ${activeCustomer.name}` });
      await fetchData();
      resetDialog();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setDialogSaving(false);
    }
  };

  const handleSkipped = async (customer: Customer) => {
    try {
      const when = new Date().toISOString();
      const { error } = await withTimeoutRetry(() => supabase.from('transactions').insert({
        customer_id: customer.id,
        transaction_type: 'delivery',
        quantity: 0,
        amount: 0,
        bottle_type: null,
        transaction_date: when,
        notes: 'Skipped delivery',
        owner_user_id: user!.id,
      }), { timeoutMs: 10000 });
      if (error) throw error;
      toast({ title: 'Marked skipped', description: `${customer.name} marked as skipped for today` });
      await fetchData();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  if (loading) {
    return <PageSkeleton showFilters cardCount={0} listRows={6} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Delivery</h1>
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

      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search customers by name, PIN, or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-white"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredCustomers.map((customer) => (
          <Card key={customer.id}>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Truck className="h-4 w-4" />
                    {customer.name}
                  </CardTitle>
                  <CardDescription>
                    PIN: {customer.pin} {customer.phone ? `• ${customer.phone}` : ''}
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="bg-gray-100 text-gray-800">
                  Balance: ₹{(customer.balance || 0).toFixed(2)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {deliveredToday[customer.id] ? (
                  <>
                    <Button size="sm" variant="secondary" disabled>
                      <Check className="h-4 w-4 mr-1" /> Delivered Today
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleOpenDialog('extra', customer)}>
                      <PlusCircle className="h-4 w-4 mr-1" /> Extra
                    </Button>
                  </>
                ) : skippedToday[customer.id] ? (
                  <>
                    <Button size="sm" variant="secondary" disabled>
                      <X className="h-4 w-4 mr-1" /> Skipped Today
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" onClick={() => handleOpenDialog('given', customer)}>
                      <Check className="h-4 w-4 mr-1" /> Given
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => handleSkipped(customer)}>
                      <X className="h-4 w-4 mr-1" /> Skipped
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleOpenDialog('extra', customer)}>
                      <PlusCircle className="h-4 w-4 mr-1" /> Extra
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Dialog for Given / Extra */}
      <Dialog open={!!dialogType} onOpenChange={(open) => { if (!open) resetDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogType === 'extra' ? 'Add Extra Delivery' : 'Record Delivery'}</DialogTitle>
            <DialogDescription>
              {activeCustomer ? `${activeCustomer.name} (${activeCustomer.pin})` : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {activeCustomer && (
              <div className="text-sm space-y-1">
                {withCustomer.length > 0 && (
                  <div className="space-y-1">
                    <div className="font-medium">Previously with customer:</div>
                    <div className="grid grid-cols-3 gap-2">
                      {withCustomer.map(b => (
                        <label key={b.id} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={returnBottleIds.includes(b.id)}
                            onChange={(e) => {
                              setReturnBottleIds(prev => e.target.checked ? [...prev, b.id] : prev.filter(x => x !== b.id));
                            }}
                          />
                          {b.bottle_number}
                        </label>
                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground">Check to mark as returned now.</div>
                  </div>
                )}
                {yesterdayGiven.length > 0 && (
                  <div>
                    <div className="font-medium">Given yesterday:</div>
                    <div className="text-muted-foreground">{yesterdayGiven.join(', ')}</div>
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') {
                      setQuantity('');
                    } else {
                      const num = Number(v);
                      setQuantity(!Number.isFinite(num) || num < 1 ? 1 : num);
                    }
                  }}
                  className="bg-white"
                />
              </div>
              <div>
                <Label htmlFor="bottle_type">Bottle Type</Label>
                <div className="mt-1">
                  <ToggleGroup
                    type="single"
                    value={bottleType}
                    onValueChange={(v) => v && setBottleType(v as 'normal' | 'cool')}
                    className="relative grid grid-cols-2 items-center bg-white rounded-lg border p-1 overflow-hidden"
                  >
                    {/* Sliding indicator */}
                    <div
                      aria-hidden
                      className={`absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-md bg-[#0E6AA8] shadow-sm transition-transform duration-300 ease-out pointer-events-none transform ${bottleType === 'cool' ? 'translate-x-full' : 'translate-x-0'}`}
                      style={{ zIndex: 0 }}
                    />
                    <ToggleGroupItem
                      value="normal"
                      aria-label="Normal"
                      className="z-10 h-8 flex items-center justify-center px-3 rounded-md border border-transparent text-sm font-medium text-[#0E6AA8] transition-colors duration-200 hover:bg-transparent focus-visible:ring-0 focus-visible:outline-none data-[state=on]:bg-transparent data-[state=on]:text-white data-[state=on]:font-semibold data-[state=on]:shadow-none"
                    >
                      Normal
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="cool"
                      aria-label="Cool"
                      className="z-10 h-8 flex items-center justify-center px-3 rounded-md border border-transparent text-sm font-medium text-[#0E6AA8] transition-colors duration-200 hover:bg-transparent focus-visible:ring-0 focus-visible:outline-none data-[state=on]:bg-transparent data-[state=on]:text-white data-[state=on]:font-semibold data-[state=on]:shadow-none"
                    >
                      Cool
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Mode</Label>
                <div className="mt-1">
                  <ToggleGroup
                    type="single"
                    value={mode}
                    onValueChange={(v) => v && (setMode(v as 'handover' | 'fill_only'), setSelectedBottleIds([]))}
                    className="relative inline-grid w-fit grid-cols-2 items-center bg-white rounded-full border border-blue-200 p-1 h-10 overflow-hidden"
                  >
                    {/* Sliding indicator */}
                    <div
                      aria-hidden
                      className={`absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-[#0E6AA8] shadow-sm transition-transform duration-300 ease-out pointer-events-none transform ${mode === 'fill_only' ? 'translate-x-full' : 'translate-x-0'}`}
                      style={{ zIndex: 0 }}
                    />
                    <ToggleGroupItem
                      value="handover"
                      aria-label="Hand over"
                      className="z-10 h-8 flex items-center justify-center px-4 rounded-full border border-transparent text-sm font-medium text-[#0E6AA8] whitespace-nowrap transition-colors duration-200 hover:bg-transparent focus-visible:ring-0 focus-visible:outline-none data-[state=on]:bg-transparent data-[state=on]:text-white data-[state=on]:font-semibold data-[state=on]:shadow-none"
                    >
                      Handover
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="fill_only"
                      aria-label="Fill only"
                      className="z-10 h-8 flex items-center justify-center px-4 rounded-full border border-transparent text-sm font-medium text-[#0E6AA8] whitespace-nowrap transition-colors duration-200 hover:bg-transparent focus-visible:ring-0 focus-visible:outline-none data-[state=on]:bg-transparent data-[state=on]:text-white data-[state=on]:font-semibold data-[state=on]:shadow-none"
                    >
                      Fill only
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>
            </div>

            {mode === 'handover' && (
              <div>
                <Label>Select bottles to hand over</Label>
                <div className="grid grid-cols-3 gap-2 max-h-40 overflow-auto border rounded p-2 mt-1">
                  {inStock.filter(b => b.bottle_type === bottleType).map(b => (
                    <label key={b.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={selectedBottleIds.includes(b.id)}
                        onChange={(e) => {
                          setSelectedBottleIds(prev => e.target.checked ? [...prev, b.id] : prev.filter(x => x !== b.id));
                        }}
                      />
                      {b.bottle_number}
                    </label>
                  ))}
                  {inStock.filter(b => b.bottle_type === bottleType).length === 0 && (
                    <div className="col-span-2 text-xs text-muted-foreground">No in-stock {bottleType} bottles available.</div>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Select exactly {typeof quantity === 'number' ? quantity : 0} bottle(s).</div>
              </div>
            )}

            {/* Amount (editable) */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="amount">Amount (₹)</Label>
                <Input
                  id="amount"
                  type="number"
                  min={0}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder={(() => {
                    const unit = householdPrices[bottleType];
                    const qNum = typeof quantity === 'number' ? quantity : 0;
                    return unit !== undefined && qNum > 0 ? String(unit * qNum) : '';
                  })()}
                  className="bg-white"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="date">Date & Time</Label>
              <Input
                id="date"
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-white"
              />
            </div>

            <div className="text-sm text-muted-foreground">
              {householdPrices[bottleType] !== undefined ? (
                (() => {
                  const unit = householdPrices[bottleType]!;
                  const qNum = typeof quantity === 'number' ? quantity : 0;
                  const total = qNum > 0 ? (unit * qNum).toFixed(2) : '--';
                  return <>Price per bottle: ₹{unit.toFixed(2)} • Total: ₹{total}</>;
                })()
              ) : (
                <>No pricing set for {bottleType} (household). Set it in Pricing page.</>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <Button variant="secondary" onClick={resetDialog}>Cancel</Button>
              <Button onClick={dialogType === 'extra' ? handleExtraConfirm : handleGivenConfirm} disabled={!(typeof quantity === 'number' && quantity > 0)}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Delivery;
