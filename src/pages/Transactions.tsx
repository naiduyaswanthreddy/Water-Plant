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
  transaction_type: 'delivery' | 'payment' | 'return';
  quantity?: number;
  amount?: number;
  bottle_type?: 'normal' | 'cool';
  payment_type?: 'cash' | 'online' | 'credit';
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
  const [formType, setFormType] = useState<'delivery' | 'payment' | 'return' | 'all' | string>('delivery');
  const [formCustomerId, setFormCustomerId] = useState<string>('');
  const [formBottleType, setFormBottleType] = useState<'normal' | 'cool' | ''>('');
  const [formQty, setFormQty] = useState<number>(0);

  useEffect(() => {
    if (!user) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Compute preview amount for delivery/return
  const computePreviewAmount = (): number => {
    if (formType === 'delivery') {
      const customer = customers.find(c => c.id === formCustomerId);
      if (!customer || !formBottleType || !formQty) return 0;
      const pr = pricing.find(p => p.customer_type === (customer.customer_type as any) && p.bottle_type === formBottleType);
      return pr ? pr.price * formQty : 0;
    }
    if (formType === 'return') return 0;
    return 0;
  };

  const fetchData = async () => {
    try {
      const [transactionsResult, customersResult, pricingResult] = await Promise.all([
        supabase.from('transactions').select('*').eq('owner_user_id', user!.id).order('transaction_date', { ascending: false }),
        supabase.from('customers').select('id, name, pin, customer_type, balance').eq('owner_user_id', user!.id).order('name'),
        supabase.from('pricing').select('id, bottle_type, customer_type, price').eq('owner_user_id', user!.id)
      ]);

      if (transactionsResult.error) throw transactionsResult.error;
      if (customersResult.error) throw customersResult.error;
      if (pricingResult.error) throw pricingResult.error;
      

      setTransactions(transactionsResult.data || []);
      setCustomers(customersResult.data || []);
      setPricing(pricingResult.data || []);
      
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
    const transaction_type = formData.get('transaction_type') as 'delivery' | 'payment' | 'return';
    const quantity = parseInt(formData.get('quantity') as string) || 0;
    const bottle_type = (formData.get('bottle_type') as 'normal' | 'cool') || null;
    const payment_type = (formData.get('payment_type') as 'cash' | 'online' | 'credit') || null;
    const notes = (formData.get('notes') as string) || null;
    const transaction_date = (formData.get('transaction_date') as string) || new Date().toISOString();

    // Auto-calc amount based on pricing
    const customer = customers.find(c => c.id === customer_id);
    let amount = 0;
    if (transaction_type === 'delivery') {
      if (!customer || !bottle_type) {
        toast({ variant: 'destructive', title: 'Error', description: 'Select customer and bottle type for delivery' });
        return;
      }
      const priceRow = pricing.find(p => p.customer_type === (customer.customer_type as any) && p.bottle_type === bottle_type);
      if (!priceRow) {
        toast({ variant: 'destructive', title: 'Pricing missing', description: `No pricing for ${customer.customer_type} / ${bottle_type}` });
        return;
      }
      amount = (quantity || 0) * priceRow.price;
    } else if (transaction_type === 'payment') {
      amount = parseFloat(formData.get('amount') as string) || 0; // payments use user-entered amount
    } else if (transaction_type === 'return') {
      amount = 0;
    }

    const transactionData = {
      customer_id,
      transaction_type,
      quantity,
      amount,
      bottle_type,
      payment_type,
      notes,
      transaction_date,
      owner_user_id: user!.id,
    };

    try {
      const { error } = await supabase
        .from('transactions')
        .insert(transactionData);
      
      if (error) throw error;
      // Update balance rules
      if (customer) {
        if (transaction_type === 'delivery') {
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
                <Label htmlFor="customer_id">Customer *</Label>
                <Select name="customer_id" required onValueChange={(v) => setFormCustomerId(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name} ({customer.pin})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="transaction_type">Transaction Type *</Label>
                <Select name="transaction_type" required onValueChange={(v) => setFormType(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="delivery">Delivery</SelectItem>
                      <SelectItem value="payment">Payment</SelectItem>
                      <SelectItem value="return">Return</SelectItem>
                    </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    name="quantity"
                    type="number"
                    min="0"
                    onChange={(e) => setFormQty(parseInt(e.target.value || '0'))}
                  />
                </div>
                <div>
                  <Label htmlFor="amount">Amount (₹) {formType !== 'payment' && '(auto)'}</Label>
                  <Input
                    id="amount"
                    name="amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formType === 'payment' ? undefined : computePreviewAmount()}
                    readOnly={formType !== 'payment'}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="bottle_type">Bottle Type</Label>
                  <Select name="bottle_type" onValueChange={(v) => setFormBottleType(v as 'normal' | 'cool')}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="cool">Cool</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="payment_type">Payment Type</Label>
                  <Select name="payment_type">
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="online">Online</SelectItem>
                      <SelectItem value="credit">Credit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {formType !== 'payment' && (
                <div className="text-sm text-muted-foreground">
                  Auto total: ₹{computePreviewAmount().toFixed(2)}
                </div>
              )}
              
              {/* Staff selection removed */}
              
              <div>
                <Label htmlFor="transaction_date">Transaction Date</Label>
                <Input
                  id="transaction_date"
                  name="transaction_date"
                  type="datetime-local"
                  defaultValue={new Date().toISOString().slice(0, 16)}
                />
              </div>
              
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  placeholder="Additional notes..."
                  rows={2}
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