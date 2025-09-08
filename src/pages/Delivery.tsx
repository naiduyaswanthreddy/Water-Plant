import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Search, Truck, Check, X, PlusCircle } from 'lucide-react';

interface Customer {
  id: string;
  pin: string;
  name: string;
  phone?: string;
  customer_type: 'household' | 'shop' | 'function';
  balance: number | null;
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

  // Dialog state
  const [activeCustomer, setActiveCustomer] = useState<Customer | null>(null);
  const [dialogType, setDialogType] = useState<'given' | 'extra' | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [bottleType, setBottleType] = useState<'normal' | 'cool'>('normal');
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 16));

  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [customersRes, pricingRes] = await Promise.all([
        supabase
          .from('customers')
          .select('id, pin, name, phone, customer_type, balance')
          .eq('customer_type', 'household')
          .order('name'),
        supabase
          .from('pricing')
          .select('id, bottle_type, customer_type, price')
          .eq('customer_type', 'household')
      ]);

      if (customersRes.error) throw customersRes.error;
      if (pricingRes.error) throw pricingRes.error;

      const custList = customersRes.data || [];
      setCustomers(custList);
      setPricing(pricingRes.data || []);

      // After loading customers, check if delivered today per customer
      if (custList.length > 0) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const tomorrowStart = new Date(todayStart);
        tomorrowStart.setDate(todayStart.getDate() + 1);

        const { data: txs, error: txErr } = await supabase
          .from('transactions')
          .select('customer_id, quantity, transaction_date, transaction_type')
          .eq('transaction_type', 'delivery')
          .gte('transaction_date', todayStart.toISOString())
          .lt('transaction_date', tomorrowStart.toISOString())
          .in('customer_id', custList.map(c => c.id));
        if (txErr) throw txErr;

        const map: Record<string, boolean> = {};
        for (const t of txs || []) {
          if ((t as any).quantity && (t as any).quantity > 0) {
            map[(t as any).customer_id] = true;
          }
        }
        setDeliveredToday(map);
      } else {
        setDeliveredToday({});
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setLoading(false);
    }
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
  };

  const handleOpenDialog = (type: 'given' | 'extra', customer: Customer) => {
    setActiveCustomer(customer);
    setDialogType(type);
    setQuantity(1);
    setBottleType('normal');
    setDate(new Date().toISOString().slice(0, 16));
  };

  const upsertDelivery = async (cust: Customer, qty: number, bt: 'normal' | 'cool', when: string, note?: string) => {
    // Pricing check
    const unitPrice = householdPrices[bt];
    if (unitPrice === undefined) {
      toast({ variant: 'destructive', title: 'Pricing missing', description: `No pricing set for household / ${bt}. Please set it in Pricing.` });
      return;
    }

    const amount = qty * unitPrice;

    // Insert transaction and update balance
    const { error: txErr } = await supabase.from('transactions').insert({
      customer_id: cust.id,
      transaction_type: 'delivery',
      quantity: qty,
      bottle_type: bt,
      amount: amount,
      transaction_date: when,
      notes: note || null,
    });
    if (txErr) throw txErr;

    const { error: balErr } = await supabase
      .from('customers')
      .update({ balance: (cust.balance || 0) + amount })
      .eq('id', cust.id);
    if (balErr) throw balErr;
  };

  const handleGivenConfirm = async () => {
    if (!activeCustomer || !dialogType) return;
    try {
      await upsertDelivery(activeCustomer, quantity, bottleType, date);
      toast({ title: 'Recorded', description: `Given ${quantity} ${bottleType} bottle(s) to ${activeCustomer.name}` });
      await fetchData();
      resetDialog();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  const handleExtraConfirm = async () => {
    if (!activeCustomer || !dialogType) return;
    try {
      await upsertDelivery(activeCustomer, quantity, bottleType, date, 'Extra');
      toast({ title: 'Recorded', description: `Extra ${quantity} ${bottleType} bottle(s) for ${activeCustomer.name}` });
      await fetchData();
      resetDialog();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  const handleSkipped = async (customer: Customer) => {
    try {
      const when = new Date().toISOString();
      const { error } = await supabase.from('transactions').insert({
        customer_id: customer.id,
        transaction_type: 'delivery',
        quantity: 0,
        amount: 0,
        bottle_type: null,
        transaction_date: when,
        notes: 'Skipped delivery',
      });
      if (error) throw error;
      toast({ title: 'Marked skipped', description: `${customer.name} marked as skipped for today` });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Delivery</h1>
        </div>
        <div className="text-center py-12">Loading customers...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Delivery</h1>
          <p className="text-muted-foreground">Manage daily deliveries for household customers</p>
        </div>
      </div>

      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search customers by name, PIN, or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          {filteredCustomers.length} of {customers.length} household customers
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
              <div>
                <Label htmlFor="bottle_type">Bottle Type</Label>
                <Select value={bottleType} onValueChange={(v: 'normal' | 'cool') => setBottleType(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="cool">Cool</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="date">Date & Time</Label>
              <Input
                id="date"
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="text-sm text-muted-foreground">
              {householdPrices[bottleType] !== undefined ? (
                <>Price per bottle: ₹{householdPrices[bottleType]?.toFixed(2)} • Total: ₹{((householdPrices[bottleType] || 0) * quantity).toFixed(2)}</>
              ) : (
                <>No pricing set for {bottleType} (household). Set it in Pricing page.</>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <Button variant="secondary" onClick={resetDialog}>Cancel</Button>
              <Button onClick={dialogType === 'extra' ? handleExtraConfirm : handleGivenConfirm}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Delivery;
