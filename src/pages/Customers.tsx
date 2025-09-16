import { useEffect, useMemo, useState } from 'react';
import { PageSkeleton } from '@/components/skeletons/PageSkeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Edit, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface Customer {
  id: string;
  pin: string;
  name: string;
  phone?: string;
  address?: string;
  customer_type: 'household' | 'shop' | 'function';
  delivery_type: 'daily' | 'alternate' | 'weekly';
  balance: number;
  deposit_amount: number;
}

const Customers = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [activeCustomer, setActiveCustomer] = useState<Customer | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txPage, setTxPage] = useState(0);
  const [txHasMore, setTxHasMore] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();
  // Address input state for add/edit dialog (to enable suggestions)
  const [addressQuery, setAddressQuery] = useState('');
  const addressOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of customers) {
      if (c.address && c.address.trim()) set.add(c.address.trim());
    }
    return Array.from(set);
  }, [customers]);
  const filteredAddressSuggestions = useMemo(() => {
    const q = addressQuery.trim().toLowerCase();
    if (!q) return [] as string[];
    return addressOptions.filter(a => a.toLowerCase().includes(q)).slice(0, 8);
  }, [addressQuery, addressOptions]);

  useEffect(() => {
    if (!user) return;
    fetchCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Sync address field when opening dialog or switching editing target
  useEffect(() => {
    if (isDialogOpen) {
      setAddressQuery(editingCustomer?.address || '');
    } else {
      setAddressQuery('');
    }
  }, [isDialogOpen, editingCustomer]);

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('owner_user_id', user!.id)
        .order('name');

      if (error) throw error;
      setCustomers(data || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch customers: " + error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const openDetails = async (customer: Customer) => {
    setActiveCustomer(customer);
    setIsDetailsOpen(true);
    setTransactions([]);
    setTxPage(0);
    setTxHasMore(true);
    await fetchTransactions(customer.id, 0, true);
  };

  const fetchTransactions = async (customerId: string, page: number = 0, replace: boolean = false) => {
    setTxLoading(true);
    try {
      const pageSize = 25;
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('customer_id', customerId)
        .eq('owner_user_id', user!.id)
        .order('transaction_date', { ascending: false })
        .range(from, to);
      if (error) throw error;
      const rows = data || [];
      setTransactions(replace ? rows : [...transactions, ...rows]);
      setTxHasMore(rows.length === pageSize);
      setTxPage(page);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setTxLoading(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeCustomer) return;
    const formData = new FormData(e.currentTarget);
    const amount = parseFloat(formData.get('amount') as string) || 0;
    const payment_type = (formData.get('payment_type') as 'cash' | 'online' | 'credit') || null;
    const notes = (formData.get('notes') as string) || null;
    const transaction_date = (formData.get('transaction_date') as string) || new Date().toISOString();

    if (amount <= 0) {
      toast({ variant: 'destructive', title: 'Invalid amount', description: 'Enter a positive payment amount' });
      return;
    }

    try {
      const { error } = await supabase.from('transactions').insert({
        customer_id: activeCustomer.id,
        transaction_type: 'payment',
        amount,
        payment_type,
        notes,
        transaction_date,
        owner_user_id: user!.id,
      });
      if (error) throw error;

      // Update balance: subtract payment
      const newBalance = (activeCustomer.balance || 0) - amount;
      const { error: balErr } = await supabase
        .from('customers')
        .update({ balance: newBalance })
        .eq('id', activeCustomer.id);
      if (balErr) throw balErr;

      toast({ title: 'Payment recorded', description: `₹${amount.toFixed(2)} recorded for ${activeCustomer.name}` });
      // Refresh lists and details
      await fetchCustomers();
      const updated = (customers.find(c => c.id === activeCustomer.id) || activeCustomer);
      setActiveCustomer(updated);
      await fetchTransactions(activeCustomer.id);
      (e.currentTarget as HTMLFormElement).reset();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  const generateUniquePin = async (): Promise<string> => {
    const { data, error } = await supabase
      .rpc('generate_unique_pin');
    
    if (error) throw error;
    return data;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const formData = new FormData(e.currentTarget);
    const customerData = {
      name: formData.get('name') as string,
      phone: formData.get('phone') as string || null,
      address: formData.get('address') as string || null,
      customer_type: formData.get('customer_type') as 'household' | 'shop' | 'function',
      delivery_type: formData.get('delivery_type') as 'daily' | 'alternate' | 'weekly',
      deposit_amount: parseFloat(formData.get('deposit_amount') as string) || 0,
    };

    try {
      if (editingCustomer) {
        // Update existing customer
        const { error } = await supabase
          .from('customers')
          .update(customerData)
          .eq('id', editingCustomer.id);
        
        if (error) throw error;
        
        toast({
          title: "Success",
          description: "Customer updated successfully"
        });
      } else {
        // Create new customer with auto-generated PIN
        const pin = await generateUniquePin();
        
        const { error } = await supabase
        .from('customers')
        .insert({
          ...customerData,
          pin,
          owner_user_id: user!.id
        });
        
        if (error) throw error;
        
        toast({
          title: "Success",
          description: `Customer created successfully with PIN: ${pin}`
        });
      }
      
      fetchCustomers();
      setIsDialogOpen(false);
      setEditingCustomer(null);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message
      });
    }
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setIsDialogOpen(true);
  };

  const handleDelete = async (customerId: string) => {
    if (!confirm('Are you sure you want to delete this customer?')) return;
    
    try {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', customerId);
      
      if (error) throw error;
      
      toast({
        title: "Success",
        description: "Customer deleted successfully"
      });
      
      fetchCustomers();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message
      });
    }
  };

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.pin.includes(searchTerm) ||
    customer.phone?.includes(searchTerm)
  );

  const getCustomerTypeColor = (type: string) => {
    switch (type) {
      case 'household': return 'bg-blue-100 text-blue-800';
      case 'shop': return 'bg-green-100 text-green-800';
      case 'function': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getBalanceColor = (balance: number) => {
    if (balance > 0) return 'text-red-600';
    if (balance < 0) return 'text-green-600';
    return 'text-gray-600';
  };

  if (loading) {
    return <PageSkeleton showFilters cardCount={0} listRows={8} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Customers</h1>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingCustomer(null)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Customer
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
              </DialogTitle>
              <DialogDescription>
                {editingCustomer ? 'Update customer information' : 'Create a new customer account'}
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    defaultValue={editingCustomer?.name || ''}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    defaultValue={editingCustomer?.phone || ''}
                  />
                </div>
              </div>
              
              <div className="relative">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  name="address"
                  autoComplete="off"
                  value={addressQuery}
                  onChange={(e) => setAddressQuery(e.target.value)}
                />
                {filteredAddressSuggestions.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full border rounded bg-card shadow">
                    <ul className="max-h-48 overflow-auto text-sm">
                      {filteredAddressSuggestions.map((addr) => (
                        <li key={addr}>
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-accent hover:text-accent-foreground"
                            onClick={() => setAddressQuery(addr)}
                          >
                            {addr}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="customer_type">Customer Type</Label>
                  <Select name="customer_type" defaultValue={editingCustomer?.customer_type || 'household'}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="household">Household</SelectItem>
                      <SelectItem value="shop">Shop</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="delivery_type">Delivery Type</Label>
                  <Select name="delivery_type" defaultValue={editingCustomer?.delivery_type || 'daily'}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select delivery type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="alternate">Alternate Days</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div>
                <Label htmlFor="deposit_amount">Deposit Amount (₹)</Label>
                <Input
                  id="deposit_amount"
                  name="deposit_amount"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={editingCustomer?.deposit_amount || ''}
                />
              </div>
              
              <Button type="submit" className="w-full">
                {editingCustomer ? 'Update Customer' : 'Create Customer'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col md:flex-row gap-3 md:gap-4 items-stretch md:items-center">
        <div className="relative flex-1 w-full md:max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search customers by name, PIN, or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="text-sm text-muted-foreground md:text-right">
          {filteredCustomers.length} of {customers.length} customers
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredCustomers.map((customer) => (
          <Card key={customer.id}>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{customer.name}</CardTitle>
                  <CardDescription>PIN: {customer.pin}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openDetails(customer)}>
                    View
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(customer)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(customer.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Type:</span>
                  <Badge variant="secondary" className={getCustomerTypeColor(customer.customer_type)}>
                    {customer.customer_type}
                  </Badge>
                </div>
                
                {customer.phone && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Phone:</span>
                    <span className="text-sm">{customer.phone}</span>
                  </div>
                )}
                
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Delivery:</span>
                  <span className="text-sm">{customer.delivery_type}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Balance:</span>
                  <span className={`text-sm font-medium ${getBalanceColor(customer.balance)}`}>
                    ₹{customer.balance.toFixed(2)}
                  </span>
                </div>
                
                {customer.deposit_amount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Deposit:</span>
                    <span className="text-sm">₹{customer.deposit_amount.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Details Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Customer Details</DialogTitle>
            <DialogDescription>
              {activeCustomer ? `${activeCustomer.name} (PIN: ${activeCustomer.pin})` : ''}
            </DialogDescription>
          </DialogHeader>

          {activeCustomer && (
            <div className="space-y-6">
              <div className="grid md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">Profile</CardTitle></CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <div><span className="text-muted-foreground">Phone:</span> {activeCustomer.phone || '—'}</div>
                    <div><span className="text-muted-foreground">Address:</span> {activeCustomer.address || '—'}</div>
                    <div><span className="text-muted-foreground">Type:</span> {activeCustomer.customer_type}</div>
                    <div><span className="text-muted-foreground">Delivery:</span> {activeCustomer.delivery_type}</div>
                    <div><span className="text-muted-foreground">Deposit:</span> ₹{(activeCustomer.deposit_amount || 0).toFixed(2)}</div>
                    <div><span className="text-muted-foreground">Balance:</span> <span className="font-medium">₹{(activeCustomer.balance || 0).toFixed(2)}</span></div>
                  </CardContent>
                </Card>

                <Card className="md:col-span-2">
                  <CardHeader className="pb-2"><CardTitle className="text-base">Record Payment</CardTitle></CardHeader>
                  <CardContent>
                    <form onSubmit={handleRecordPayment} className="grid grid-cols-2 gap-3">
                      <div className="col-span-1">
                        <Label htmlFor="amount">Amount (₹)</Label>
                        <Input id="amount" name="amount" type="number" min="0" step="0.01" required />
                      </div>
                      <div className="col-span-1">
                        <Label htmlFor="payment_type">Payment Type</Label>
                        <select id="payment_type" name="payment_type" className="w-full border rounded h-9 px-2">
                          <option value="cash">Cash</option>
                          <option value="online">Online</option>
                          <option value="credit">Credit</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <Label htmlFor="transaction_date">Date & Time</Label>
                        <Input id="transaction_date" name="transaction_date" type="datetime-local" defaultValue={new Date().toISOString().slice(0,16)} />
                      </div>
                      <div className="col-span-2">
                        <Label htmlFor="notes">Notes</Label>
                        <Input id="notes" name="notes" placeholder="Optional notes..." />
                      </div>
                      <div className="col-span-2">
                        <Button type="submit" className="w-full">Record Payment</Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              </div>

              <div>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">Recent Transactions</CardTitle></CardHeader>
                  <CardContent>
                    {txLoading ? (
                      <div className="text-sm text-muted-foreground">Loading transactions...</div>
                    ) : (
                      <div className="space-y-2 max-h-80 overflow-auto">
                        {transactions.length === 0 && (
                          <div className="text-sm text-muted-foreground">No transactions yet.</div>
                        )}
                        {transactions.map((tx) => (
                          <div key={tx.id} className="flex items-center justify-between border rounded p-2">
                            <div>
                              <div className="text-sm font-medium capitalize">{tx.transaction_type}</div>
                              <div className="text-xs text-muted-foreground">{new Date(tx.transaction_date).toLocaleString()}</div>
                              {tx.notes && <div className="text-xs text-muted-foreground">{tx.notes}</div>}
                            </div>
                            <div className="text-right text-sm">
                              {tx.quantity ? <div>Qty: {tx.quantity}</div> : null}
                              {typeof tx.amount === 'number' ? <div>₹{tx.amount.toFixed(2)}</div> : null}
                            </div>
                          </div>
                        ))}
                        {txHasMore && (
                          <div className="pt-2">
                            <Button
                              variant="secondary"
                              className="w-full"
                              disabled={txLoading}
                              onClick={() => activeCustomer && fetchTransactions(activeCustomer.id, txPage + 1)}
                            >
                              {txLoading ? 'Loading...' : 'Load more'}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {filteredCustomers.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            {searchTerm ? 'No customers found matching your search.' : 'No customers yet. Add your first customer to get started.'}
          </p>
        </div>
      )}
    </div>
  );
};

export default Customers;