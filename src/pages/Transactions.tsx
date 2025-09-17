import { useEffect, useState } from 'react';
import { PageSkeleton } from '@/components/skeletons/PageSkeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Receipt, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface Transaction {
  id: string;
  customer_id: string;
  transaction_type: 'delivery' | 'payment' | 'return' | 'balance';
  quantity?: number;
  amount?: number;
  bottle_type?: 'normal' | 'cool';
  payment_type?: 'cash' | 'online' | 'credit' | 'not_paid';
  bottle_numbers?: string[];
  notes?: string;
  staff_id?: string;
  transaction_date: string;
  created_at: string;
}

interface Customer {
  id: string;
  name: string;
  pin: string;
  customer_type?: 'household' | 'shop' | 'function';
  balance?: number;
}

// Removed Staff interface and all related references

const Transactions = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [pricing, setPricing] = useState<Array<{ id: string; bottle_type: 'normal' | 'cool'; customer_type: 'household' | 'shop' | 'function'; price: number }>>([]);
  // Removed staff state
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  const { toast } = useToast();
  const { user } = useAuth();

  // Local form state for auto amount preview
  const [formType, setFormType] = useState<'delivery' | 'payment' | 'return' | 'balance' | 'all' | string>('delivery');
  const [formCustomerId, setFormCustomerId] = useState<string>('');
  const [formBottleType, setFormBottleType] = useState<'normal' | 'cool' | ''>('');
  const [formQty, setFormQty] = useState<number>(0);
  const [formDeliveryMode, setFormDeliveryMode] = useState<'bottle' | 'filling'>('bottle');
  const [formAmount, setFormAmount] = useState<number | ''>('');
  const [formPaymentType, setFormPaymentType] = useState<'cash' | 'online' | 'credit' | 'not_paid' | ''>('');
  const [inStock, setInStock] = useState<Array<{ id: string; bottle_number: string; bottle_type: 'normal' | 'cool' }>>([]);
  const [selectedBottleIds, setSelectedBottleIds] = useState<string[]>([]);
  const [withCustomer, setWithCustomer] = useState<Array<{ id: string; bottle_number: string; bottle_type: 'normal' | 'cool' }>>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerListOpen, setCustomerListOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Realtime: refresh transactions list, customers, and inventory on changes
  useEffect(() => {
    if (!user) return;
    let debounce: number | undefined;
    const schedule = (fn: () => void) => {
      if (debounce) window.clearTimeout(debounce);
      debounce = window.setTimeout(fn, 250);
    };
    const channel = supabase
      .channel('realtime-transactions-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, (payload: any) => {
        const tx = payload.new as any;
        if (!tx || tx.owner_user_id === user.id) {
          // Fine-grained local update to the visible list
          setTransactions((prev) => {
            const list = [...prev];
            if (payload.eventType === 'INSERT' && payload.new) {
              return [payload.new as any, ...list];
            }
            if (payload.eventType === 'UPDATE' && payload.new) {
              const idx = list.findIndex((t) => t.id === (payload.new as any).id);
              if (idx >= 0) list[idx] = { ...(list[idx] as any), ...(payload.new as any) } as any;
              return list;
            }
            if (payload.eventType === 'DELETE' && payload.old) {
              return list.filter((t) => t.id !== (payload.old as any).id);
            }
            return list;
          });
          // Debounced safety refresh to keep related data in sync
          schedule(() => fetchData());
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, (payload: any) => {
        const row = (payload.new || payload.old) as any;
        if (!row || row.owner_user_id === user.id) schedule(() => fetchData());
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bottles' }, (payload: any) => {
        const row = (payload.new || payload.old) as any;
        if (!row || row.owner_user_id === user.id) schedule(() => fetchData());
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pricing' }, (payload: any) => {
        const row = (payload.new || payload.old) as any;
        if (!row || row.owner_user_id === user.id) schedule(() => fetchData());
      })
      .subscribe();

    return () => {
      if (debounce) window.clearTimeout(debounce);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Load bottles currently with selected customer for Return
  useEffect(() => {
    const loadWithCustomer = async () => {
      if (!user || !formCustomerId || formType !== 'return') {
        setWithCustomer([]);
        return;
      }
      const { data, error } = await supabase
        .from('bottles')
        .select('id, bottle_number, bottle_type')
        .eq('owner_user_id', user.id)
        .eq('current_customer_id', formCustomerId)
        .eq('is_returned', false)
        .order('bottle_number');
      if (!error) setWithCustomer((data || []) as any);
    };
    loadWithCustomer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, formCustomerId, formType]);

  // Compute preview amount for delivery/payment/balance (returns are zero)
  const computePreviewAmount = (): number => {
    const customer = customers.find(c => c.id === formCustomerId);
    if (formType === 'delivery') {
      if (formDeliveryMode === 'bottle') {
        if (!customer || !formBottleType) return 0;
        const pr = pricing.find(p => p.customer_type === (customer.customer_type as any) && p.bottle_type === formBottleType);
        const qty = selectedBottleIds.length;
        return pr ? pr.price * qty : 0;
      } else {
        return typeof formAmount === 'number' ? formAmount : 0;
      }
    }
    if (formType === 'balance' || formType === 'payment') {
      return typeof formAmount === 'number' ? formAmount : 0;
    }
    return 0;
  };

  const fetchData = async () => {
    try {
      const [transactionsResult, customersResult, pricingResult, inStockRes] = await Promise.all([
        supabase.from('transactions').select('*').eq('owner_user_id', user!.id).order('transaction_date', { ascending: false }),
        supabase.from('customers').select('id, name, pin, customer_type, balance').eq('owner_user_id', user!.id).order('name'),
        supabase.from('pricing').select('id, bottle_type, customer_type, price').eq('owner_user_id', user!.id),
        supabase.from('bottles').select('id, bottle_number, bottle_type').eq('owner_user_id', user!.id).eq('is_returned', true).order('bottle_number')
      ]);

      if (transactionsResult.error) throw transactionsResult.error;
      if (customersResult.error) throw customersResult.error;
      if (pricingResult.error) throw pricingResult.error;
      if (inStockRes.error) throw inStockRes.error;
      

      setTransactions(transactionsResult.data || []);
      setCustomers(customersResult.data || []);
      setPricing(pricingResult.data || []);
      setInStock((inStockRes.data || []) as any);
      
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch data: " + error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const formData = new FormData(e.currentTarget);
    const customer_id = formData.get('customer_id') as string;
    const transaction_type = formData.get('transaction_type') as 'delivery' | 'payment' | 'return' | 'balance';
    let quantity = parseInt(formData.get('quantity') as string) || 0;
    const bottle_type = (formData.get('bottle_type') as 'normal' | 'cool') || null;
    const payment_type = (formData.get('payment_type') as 'cash' | 'online' | 'credit' | 'not_paid') || null;
    const notes = (formData.get('notes') as string) || null;
    const transaction_date = (formData.get('transaction_date') as string) || new Date().toISOString();
    const delivery_mode = (formData.get('delivery_mode') as 'bottle' | 'filling') || 'bottle';
    const amount_input = parseFloat(formData.get('amount') as string);

    // Auto-calc amount based on pricing
    const customer = customers.find(c => c.id === customer_id);
    let amount = 0;
    if (transaction_type === 'delivery') {
      if (delivery_mode === 'bottle') {
        if (!customer || !bottle_type) {
          toast({ variant: 'destructive', title: 'Error', description: 'Select customer and bottle type for delivery (bottle)' });
          return;
        }
        // quantity from selection
        quantity = selectedBottleIds.length;
        if (quantity === 0) {
          toast({ variant: 'destructive', title: 'Select bottles', description: 'Choose one or more bottles to assign' });
          return;
        }
        const priceRow = pricing.find(p => p.customer_type === (customer.customer_type as any) && p.bottle_type === bottle_type);
        if (!priceRow) {
          toast({ variant: 'destructive', title: 'Pricing missing', description: `No pricing for ${customer?.customer_type} / ${bottle_type}` });
          return;
        }
        amount = quantity * priceRow.price;
      } else {
        // filling: amount entered manually
        if (isNaN(amount_input) || amount_input <= 0) {
          toast({ variant: 'destructive', title: 'Invalid amount', description: 'Enter a valid amount for filling' });
          return;
        }
        amount = amount_input;
      }
    } else if (transaction_type === 'payment') {
      amount = isNaN(amount_input) ? 0 : amount_input; // payments use user-entered amount
    } else if (transaction_type === 'return') {
      // Returns: must select previously taken bottles
      quantity = selectedBottleIds.length;
      if (quantity === 0) {
        toast({ variant: 'destructive', title: 'Select bottles', description: 'Choose one or more bottles to mark as returned' });
        return;
      }
      amount = 0;
    } else if (transaction_type === 'balance') {
      if (isNaN(amount_input) || amount_input <= 0) {
        toast({ variant: 'destructive', title: 'Invalid amount', description: 'Enter a positive balance amount' });
        return;
      }
      amount = amount_input;
    }

    const storagePaymentType: 'cash' | 'online' | 'credit' | null = payment_type === 'not_paid' ? null : (payment_type as any);
    const extraNotes = transaction_type === 'delivery' && payment_type === 'not_paid' ? (notes ? `${notes} • Not paid` : 'Not paid') : notes;
    const transactionData = {
      customer_id,
      transaction_type: transaction_type === 'balance' ? 'delivery' : transaction_type, // store as delivery for compatibility
      quantity,
      amount,
      bottle_type,
      payment_type: storagePaymentType,
      notes: transaction_type === 'balance' ? (notes ? `Balance: ${notes}` : 'Balance adjustment') : extraNotes,
      transaction_date,
      owner_user_id: user!.id,
    };

    try {
      // If delivering bottles, perform bottle assignment and capture numbers
      if (transaction_type === 'delivery' && delivery_mode === 'bottle') {
        // update bottles to assign
        const { error: updErr } = await supabase
          .from('bottles')
          .update({ current_customer_id: customer_id, is_returned: false })
          .in('id', selectedBottleIds);
        if (updErr) throw updErr;
        // map ids to numbers
        const map = new Map<string, { bottle_number: string; bottle_type: 'normal' | 'cool' }>();
        for (const b of inStock) map.set(b.id, { bottle_number: b.bottle_number, bottle_type: b.bottle_type });
        const bottle_numbers = selectedBottleIds.map(id => map.get(id)?.bottle_number).filter(Boolean) as string[];
        (transactionData as any).bottle_numbers = bottle_numbers;
      }

      const { error } = await supabase
        .from('transactions')
        .insert(transactionData as any);
      
      if (error) throw error;
      // Update balance rules
      if (customer) {
        if (transaction_type === 'delivery' || transaction_type === 'balance') {
          await supabase.from('customers').update({ balance: (customer.balance || 0) + amount }).eq('id', customer.id);
        } else if (transaction_type === 'payment') {
          await supabase.from('customers').update({ balance: (customer.balance || 0) - amount }).eq('id', customer.id);
        }
        // return: no balance change
      }
      
      toast({
        title: "Success",
        description: "Transaction recorded successfully"
      });
      
      fetchData();
      setIsDialogOpen(false);
      setSelectedBottleIds([]);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message
      });
    }
  };

  const getCustomerName = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    return customer ? `${customer.name} (${customer.pin})` : 'Unknown Customer';
  };

  // Removed getStaffName

  const getTransactionTypeColor = (type: string) => {
    switch (type) {
      case 'delivery': return 'bg-blue-100 text-blue-800';
      case 'payment': return 'bg-green-100 text-green-800';
      case 'return': return 'bg-yellow-100 text-yellow-800';
      case 'counter_sale': return 'bg-purple-100 text-purple-800';
      case 'function_order': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'payment': return TrendingUp;
      case 'return': return TrendingDown;
      default: return Receipt;
    }
  };

  const filteredTransactions = transactions.filter(transaction => {
    const matchesSearch = getCustomerName(transaction.customer_id).toLowerCase().includes(searchTerm.toLowerCase()) ||
      transaction.notes?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === 'all' || transaction.transaction_type === filterType;
    return matchesSearch && matchesFilter;
  });

  if (loading) {
    return <PageSkeleton showFilters cardCount={0} listRows={8} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Transactions</h1>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Record Transaction
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[85vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Record New Transaction</DialogTitle>
              <DialogDescription>
                Create a new transaction record
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="customer_search">Customer *</Label>
                <input type="hidden" name="customer_id" value={formCustomerId} />
                <div className="space-y-2 relative">
                  <Input
                    id="customer_search"
                    placeholder={formCustomerId ? customers.find(c => c.id === formCustomerId)?.name || 'Search customer' : 'Search customer'}
                    value={customerSearch}
                    onFocus={() => setCustomerListOpen(true)}
                    onChange={(e) => { setCustomerSearch(e.target.value); setCustomerListOpen(true); }}
                    onBlur={() => setTimeout(() => setCustomerListOpen(false), 150)}
                    className="bg-white"
                  />
                  {customerListOpen && (
                    <div className="absolute z-50 mt-1 w-full max-h-56 overflow-auto border rounded-md bg-white shadow">
                      {customers
                        .filter(c => {
                          const term = customerSearch.trim().toLowerCase();
                          if (!term) return true;
                          return c.name.toLowerCase().includes(term);
                        })
                        .slice(0, 50)
                        .map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { setFormCustomerId(c.id); setCustomerSearch(c.name); setCustomerListOpen(false); }}
                            className={`w-full text-left px-3 py-2 hover:bg-gray-100 ${formCustomerId === c.id ? 'bg-gray-50' : ''}`}
                          >
                            {c.name} ({c.pin})
                          </button>
                        ))}
                      {customers.filter(c => c.name.toLowerCase().includes(customerSearch.trim().toLowerCase())).length === 0 && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">No results</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              
              <div>
                <Label htmlFor="transaction_type">Transaction Type *</Label>
                <Select name="transaction_type" required onValueChange={(v) => { setFormType(v); }}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="delivery">Delivery</SelectItem>
                      <SelectItem value="payment">Payment</SelectItem>
                      <SelectItem value="return">Return</SelectItem>
                      <SelectItem value="balance">Balance</SelectItem>
                    </SelectContent>
                </Select>
              </div>

              {/* Delivery mode or simple inputs based on type */}
              {formType === 'delivery' && (
                <>
                  <div>
                    <Label htmlFor="delivery_mode">Delivery Mode</Label>
                    <Select name="delivery_mode" value={formDeliveryMode} onValueChange={(v) => setFormDeliveryMode(v as any)}>
                      <SelectTrigger className="bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bottle">Bottle</SelectItem>
                        <SelectItem value="filling">Filling</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {formDeliveryMode === 'bottle' ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="quantity">Quantity</Label>
                        <Input id="quantity" name="quantity" type="number" min="0" value={selectedBottleIds.length} readOnly className="bg-white" />
                      </div>
                      <div>
                        <Label htmlFor="bottle_type">Bottle Type</Label>
                        <Select name="bottle_type" onValueChange={(v) => setFormBottleType(v as 'normal' | 'cool')}>
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="normal">Normal</SelectItem>
                            <SelectItem value="cool">Cool</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <Label>Select bottles from inventory</Label>
                        <div className="grid grid-cols-2 gap-2 max-h-48 overflow-auto border rounded p-2 mt-1">
                          {formBottleType ? (
                            inStock.filter(b => b.bottle_type === formBottleType).map(b => (
                              <label key={b.id} className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={selectedBottleIds.includes(b.id)}
                                  onChange={(e) => setSelectedBottleIds(prev => e.target.checked ? [...prev, b.id] : prev.filter(x => x !== b.id))}
                                />
                                <span>{b.bottle_number}</span>
                              </label>
                            ))
                          ) : (
                            <div className="text-xs text-muted-foreground">Select a bottle type to see available bottles.</div>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">Auto total: ₹{computePreviewAmount().toFixed(2)}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="amount">Amount (₹)</Label>
                        <Input id="amount" name="amount" type="number" min="0" step="0.01" value={formAmount === '' ? '' : formAmount} onChange={(e) => setFormAmount(e.target.value === '' ? '' : Number(e.target.value))} className="bg-white" />
                      </div>
                    </div>
                  )}
                  <div>
                    <Label htmlFor="payment_type">Payment Type</Label>
                    <Select name="payment_type" value={formPaymentType} onValueChange={(v) => setFormPaymentType(v as any)}>
                      <SelectTrigger className="bg-white">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not_paid">Not Paid</SelectItem>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="online">Online</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {formType === 'return' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="quantity">Quantity</Label>
                      <Input id="quantity" name="quantity" type="number" min="0" value={selectedBottleIds.length} readOnly className="bg-white" />
                    </div>
                  </div>
                  <div>
                    <Label>Select bottles to mark returned</Label>
                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-auto border rounded p-2 mt-1">
                      {withCustomer.length > 0 ? (
                        withCustomer.map(b => (
                          <label key={b.id} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={selectedBottleIds.includes(b.id)}
                              onChange={(e) => setSelectedBottleIds(prev => e.target.checked ? [...prev, b.id] : prev.filter(x => x !== b.id))}
                            />
                            <span>{b.bottle_number} • {b.bottle_type}</span>
                          </label>
                        ))
                      ) : (
                        <div className="text-xs text-muted-foreground">No bottles currently with this customer.</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {(formType === 'payment' || formType === 'balance') && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="amount">Amount (₹)</Label>
                    <Input id="amount" name="amount" type="number" min="0" step="0.01" value={formAmount === '' ? '' : formAmount} onChange={(e) => setFormAmount(e.target.value === '' ? '' : Number(e.target.value))} className="bg-white" />
                  </div>
                </div>
              )}

              {formType === 'delivery' && formDeliveryMode === 'bottle' && (
                <div className="text-sm text-muted-foreground">Auto total: ₹{computePreviewAmount().toFixed(2)}</div>
              )}
              
              {/* Staff selection removed */}
              
              <div>
                <Label htmlFor="transaction_date">Transaction Date</Label>
                <Input
                  id="transaction_date"
                  name="transaction_date"
                  type="datetime-local"
                  defaultValue={new Date().toISOString().slice(0, 16)}
                  className="bg-white"
                />
              </div>
              
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  placeholder="Additional notes..."
                  rows={2}
                  className="bg-white"
                />
              </div>
              
              <Button type="submit" className="w-full">
                Record Transaction
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search transactions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="delivery">Delivery</SelectItem>
            <SelectItem value="payment">Payment</SelectItem>
            <SelectItem value="return">Return</SelectItem>
            <SelectItem value="counter_sale">Counter Sale</SelectItem>
            <SelectItem value="function_order">Function Order</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-sm text-muted-foreground">
          {filteredTransactions.length} transactions
        </div>
      </div>

      <div className="space-y-4">
        {filteredTransactions.map((transaction) => {
          const Icon = getTransactionIcon(transaction.transaction_type);
          return (
            <Card key={transaction.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-muted">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium">{getCustomerName(transaction.customer_id)}</div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(transaction.transaction_date).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <Badge variant="secondary" className={getTransactionTypeColor(transaction.transaction_type)}>
                      {transaction.transaction_type.replace('_', ' ')}
                    </Badge>
                    
                    {transaction.quantity && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Qty:</span> {transaction.quantity}
                      </div>
                    )}
                    
                    {transaction.amount && (
                      <div className="flex items-center gap-1 font-medium">
                        <DollarSign className="h-4 w-4" />
                        ₹{transaction.amount.toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
                
                {transaction.notes && (
                  <div className="mt-2 text-sm text-muted-foreground">
                    {transaction.notes}
                  </div>
                )}
                
                <div className="mt-2 flex justify-end text-xs text-muted-foreground">
                  {transaction.payment_type && (
                    <span>Payment: {transaction.payment_type}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredTransactions.length === 0 && (
        <div className="text-center py-12">
          <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            {searchTerm || filterType !== 'all' ? 'No transactions found matching your criteria.' : 'No transactions yet. Record your first transaction to get started.'}
          </p>
        </div>
      )}
    </div>
  );
};

export default Transactions;