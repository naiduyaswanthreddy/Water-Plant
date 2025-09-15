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
import { Plus, Search, Edit, Trash2, Calendar, Users, CheckCircle, Clock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface FunctionOrder {
  id: string;
  customer_id: string;
  event_name?: string;
  event_date?: string;
  bottles_supplied: number;
  bottles_returned: number;
  total_amount: number;
  amount_paid: number;
  is_settled: boolean;
  created_at: string;
  updated_at: string;
}

interface Customer {
  id: string;
  name: string;
  pin: string;
  customer_type: string;
}

const FunctionOrders = () => {
  const [orders, setOrders] = useState<FunctionOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [inStockBottles, setInStockBottles] = useState<{ id: string; bottle_number: string; bottle_type: 'normal' | 'cool' }[]>([]);
  const [selectedBottleIds, setSelectedBottleIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [pricing, setPricing] = useState<Array<{ id: string; bottle_type: 'normal' | 'cool'; customer_type: 'household' | 'shop' | 'function'; price: number }>>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<FunctionOrder | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  // Edit-only tabs and receiving state
  const [activeTab, setActiveTab] = useState<'giving' | 'receiving'>('giving');
  const [withCustomer, setWithCustomer] = useState<{ id: string; bottle_number: string; bottle_type: 'normal' | 'cool' }[]>([]);
  const [returnBottleIds, setReturnBottleIds] = useState<string[]>([]);
  const [receivePaid, setReceivePaid] = useState<string>('');
  // Inline new function customer fields (for new orders)
  const [newFuncName, setNewFuncName] = useState('');
  const [newFuncPhone, setNewFuncPhone] = useState('');
  const [overrideTotal, setOverrideTotal] = useState<string>('');
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const fetchData = async () => {
    try {
      const [ordersResult, customersResult, bottlesResult, pricingResult] = await Promise.all([
        supabase.from('function_orders').select('*').eq('owner_user_id', user!.id).order('event_date', { ascending: false }),
        supabase.from('customers').select('id, name, pin, customer_type')
          .eq('customer_type', 'function')
          .eq('owner_user_id', user!.id)
          .order('name'),
        supabase.from('bottles').select('id, bottle_number, bottle_type, is_returned').eq('is_returned', true).eq('owner_user_id', user!.id).order('bottle_number'),
        supabase.from('pricing').select('id, bottle_type, customer_type, price').eq('owner_user_id', user!.id)
      ]);

      if (ordersResult.error) throw ordersResult.error;
      if (customersResult.error) throw customersResult.error;
      if (bottlesResult.error) throw bottlesResult.error;
      if (pricingResult.error) throw pricingResult.error;

      setOrders(ordersResult.data || []);
      setCustomers(customersResult.data || []);
      setInStockBottles((bottlesResult.data || []).map((b: any) => ({ id: b.id, bottle_number: b.bottle_number, bottle_type: b.bottle_type })));
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

  const fetchWithCustomerForOrder = async (order: FunctionOrder) => {
    try {
      const { data, error } = await supabase
        .from('bottles')
        .select('id, bottle_number, bottle_type, is_returned, current_customer_id')
        .eq('owner_user_id', user!.id)
        .eq('current_customer_id', order.customer_id)
        .eq('is_returned', false)
        .order('bottle_number');
      if (error) throw error;
      setWithCustomer((data || []).map((b: any) => ({ id: b.id, bottle_number: b.bottle_number, bottle_type: b.bottle_type })));
    } catch (e) {
      setWithCustomer([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const formData = new FormData(e.currentTarget);
    // Compute auto total for selected bottles using function pricing
    const selected = inStockBottles.filter((b) => selectedBottleIds.includes(b.id));
    const calcTotal = selected.reduce((sum, b) => {
      const pr = pricing.find(p => p.customer_type === 'function' && p.bottle_type === b.bottle_type);
      return sum + (pr ? pr.price : 0);
    }, 0);

    // Decide customer: if editing use selected customer_id, otherwise create a new function customer
    let customer_id: string | null = editingOrder ? (formData.get('customer_id') as string) : null;
    if (!editingOrder) {
      if (!newFuncName.trim()) {
        toast({ variant: 'destructive', title: 'Missing name', description: 'Please enter a function customer name' });
        return;
      }
      // Try to generate a unique PIN if RPC exists; fall back to timestamp
      let pin = 'F' + Math.floor(1000 + Math.random() * 9000).toString();
      try {
        const { data: pinData } = await supabase.rpc('generate_unique_pin');
        if (pinData) pin = pinData as string;
      } catch {}
      const { data: custIns, error: custErr } = await supabase
        .from('customers')
        .insert({
          name: newFuncName.trim(),
          phone: newFuncPhone || null,
          pin,
          customer_type: 'function',
          delivery_type: 'daily',
          balance: 0,
          deposit_amount: 0,
          owner_user_id: user!.id
        })
        .select('id')
        .single();
      if (custErr) {
        toast({ variant: 'destructive', title: 'Error', description: custErr.message });
        return;
      }
      customer_id = custIns?.id as string;
    }

    const finalTotal = overrideTotal ? parseFloat(overrideTotal) || 0 : calcTotal;

    const orderData = {
      customer_id: customer_id as string,
      event_name: formData.get('event_name') as string || null,
      event_date: formData.get('event_date') as string || null,
      bottles_supplied: selectedBottleIds.length, // enforce supplied equals selected
      bottles_returned: parseInt(formData.get('bottles_returned') as string) || 0,
      total_amount: finalTotal,
      amount_paid: parseFloat(formData.get('amount_paid') as string) || 0,
      is_settled: formData.get('is_settled') === 'on'
    };

    try {
      let orderId = editingOrder?.id || null;
      if (!editingOrder) {
        const { data, error } = await supabase
          .from('function_orders')
          .insert({ ...orderData, owner_user_id: user!.id })
          .select('id');
        
        if (error) throw error;
        
        toast({
          title: "Success",
          description: "Function order created successfully"
        });
        // Attempt to retrieve the inserted order id if returned
        if (data && data[0]?.id) {
          orderId = data[0].id as string;
        }
      } else if (activeTab === 'giving') {
        // Update giving details
        const { error } = await supabase
          .from('function_orders')
          .update(orderData)
          .eq('id', editingOrder.id);
        if (error) throw error;
        toast({ title: 'Success', description: 'Function order updated successfully' });
        orderId = editingOrder.id;
      } else if (activeTab === 'receiving') {
        // Receiving: process returns and payments, then optionally clear
        const order = editingOrder;
        let bottlesReturnedInc = 0;
        if (returnBottleIds.length > 0) {
          // Get bottle numbers for return
          const dict = new Map(withCustomer.map(b => [b.id, b] as const));
          const numbers = returnBottleIds.map(id => dict.get(id)?.bottle_number).filter(Boolean) as string[];
          // Mark returned
          const { error: updErr } = await supabase
            .from('bottles')
            .update({ current_customer_id: null, is_returned: true })
            .in('id', returnBottleIds);
          if (updErr) throw updErr;
          // Insert return transaction
          const { error: txErr } = await supabase
            .from('transactions')
            .insert({
              customer_id: order.customer_id,
              transaction_type: 'return',
              quantity: numbers.length,
              bottle_numbers: numbers,
              transaction_date: new Date().toISOString(),
              notes: order.event_name ? `Function return: ${order.event_name}` : 'Function order bottles returned',
              owner_user_id: user!.id,
            });
          if (txErr) throw txErr;
          bottlesReturnedInc = numbers.length;
        }

        const addPaid = receivePaid ? parseFloat(receivePaid) || 0 : 0;
        if (addPaid > 0) {
          // Insert payment transaction
          const { error: payErr } = await supabase
            .from('transactions')
            .insert({
              customer_id: order.customer_id,
              transaction_type: 'payment',
              amount: addPaid,
              transaction_date: new Date().toISOString(),
              notes: order.event_name ? `Function payment: ${order.event_name}` : 'Function order payment',
              owner_user_id: user!.id,
            });
          if (payErr) throw payErr;
        }

        const updatedPaid = order.amount_paid + (receivePaid ? parseFloat(receivePaid) || 0 : 0);
        const updatedReturned = order.bottles_returned + bottlesReturnedInc;
        const unreturned = Math.max(0, order.bottles_supplied - updatedReturned);
        const balance = order.total_amount - updatedPaid;
        const wantClear = formData.get('is_settled') === 'on';
        const mayClear = unreturned === 0 && Math.abs(balance) < 0.005;

        if (wantClear && !mayClear) {
          toast({ variant: 'destructive', title: 'Cannot clear', description: 'All bottles must be returned and balance must be zero to clear.' });
        }

        const { error: updOrderErr } = await supabase
          .from('function_orders')
          .update({
            bottles_returned: updatedReturned,
            amount_paid: updatedPaid,
            is_settled: wantClear && mayClear ? true : order.is_settled,
          })
          .eq('id', order.id);
        if (updOrderErr) throw updOrderErr;

        toast({ title: 'Saved', description: `Received ${bottlesReturnedInc} bottle(s), payment ₹${(receivePaid||'0')}` });
      }
      
      // If bottles were selected, assign them to the function customer and create a transaction
      if (!editingOrder && selectedBottleIds.length > 0) {
        // Load bottle numbers for selected bottles
        const bottleNumbers = selected.map((b) => b.bottle_number);

        // Update bottles as out and assign to the customer
        const { error: updErr } = await supabase
          .from('bottles')
          .update({ current_customer_id: orderData.customer_id, is_returned: false })
          .in('id', selectedBottleIds);
        if (updErr) throw updErr;

        // Create a delivery transaction mapped to these bottle numbers
        const { error: txErr } = await supabase
          .from('transactions')
          .insert({
            customer_id: orderData.customer_id,
            transaction_type: 'delivery',
            quantity: bottleNumbers.length,
            bottle_numbers: bottleNumbers,
            amount: finalTotal,
            transaction_date: new Date().toISOString(),
            notes: orderData.event_name ? `Function: ${orderData.event_name}` : 'Function order bottles supplied',
            owner_user_id: user!.id,
          });
        if (txErr) throw txErr;

        // Update customer balance by calcTotal
        const { data: custRow } = await supabase.from('customers').select('id, balance').eq('id', orderData.customer_id).single();
        if (custRow) {
          await supabase.from('customers').update({ balance: (custRow.balance || 0) + finalTotal }).eq('id', orderData.customer_id);
        }
      }

      fetchData();
      setIsDialogOpen(false);
      setEditingOrder(null);
      setSelectedBottleIds([]);
      setReturnBottleIds([]);
      setReceivePaid('');
      setWithCustomer([]);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message
      });
    }
  };

  const handleEdit = (order: FunctionOrder) => {
    setEditingOrder(order);
    setIsDialogOpen(true);
    setActiveTab('giving');
    setReturnBottleIds([]);
    setReceivePaid('');
    fetchWithCustomerForOrder(order);
  };

  const handleDelete = async (orderId: string) => {
    if (!confirm('Are you sure you want to delete this function order?')) return;
    
    try {
      const { error } = await supabase
        .from('function_orders')
        .delete()
        .eq('id', orderId);
      
      if (error) throw error;
      
      toast({
        title: "Success",
        description: "Function order deleted successfully"
      });
      
      fetchData();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message
      });
    }
  };

  const toggleSettled = async (orderId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('function_orders')
        .update({ is_settled: !currentStatus })
        .eq('id', orderId);
      
      if (error) throw error;
      
      toast({
        title: "Success",
        description: `Order ${!currentStatus ? 'marked as settled' : 'marked as pending'}`
      });
      
      fetchData();
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

  const getBalanceAmount = (order: FunctionOrder) => {
    return order.total_amount - order.amount_paid;
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = getCustomerName(order.customer_id).toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.event_name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesFilter = true;
    if (filterStatus === 'settled') matchesFilter = order.is_settled;
    else if (filterStatus === 'pending') matchesFilter = !order.is_settled;
    
    return matchesSearch && matchesFilter;
  });

  if (loading) {
    return <PageSkeleton showFilters cardCount={0} listRows={8} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Function Orders</h1>
          <p className="text-muted-foreground">Manage bulk orders for events and functions</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingOrder(null)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Function Order
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingOrder ? 'Edit Function Order' : 'Add New Function Order'}
              </DialogTitle>
              <DialogDescription>
                {editingOrder ? 'Update function order details' : 'Create a new function order'}
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              {editingOrder && (
                <div className="flex gap-2">
                  <Button type="button" variant={activeTab === 'giving' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('giving')}>Giving</Button>
                  <Button type="button" variant={activeTab === 'receiving' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('receiving')}>Receiving</Button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                {editingOrder ? (
                  <div>
                    <Label htmlFor="customer_id">Customer *</Label>
                    <Select name="customer_id" defaultValue={editingOrder.customer_id} required>
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
                ) : (
                  <div className="space-y-2">
                    <Label>Function Customer</Label>
                    <Input placeholder="Function name (required)" value={newFuncName} onChange={(e) => setNewFuncName(e.target.value)} required />
                    <Input placeholder="Phone (optional)" value={newFuncPhone} onChange={(e) => setNewFuncPhone(e.target.value)} />
                  </div>
                )}
                <div>
                  <Label htmlFor="event_date">Event Date</Label>
                  <Input
                    id="event_date"
                    name="event_date"
                    type="date"
                    defaultValue={editingOrder?.event_date || ''}
                  />
                </div>
              </div>
              
              {(!editingOrder || activeTab === 'giving') && (
              <div>
                <Label htmlFor="event_name">Event Name</Label>
                <Input
                  id="event_name"
                  name="event_name"
                  defaultValue={editingOrder?.event_name || ''}
                  placeholder="Wedding, Birthday, Corporate Event, etc."
                />
              </div>
              )}
              
              {(!editingOrder || activeTab === 'giving') && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="bottles_supplied">Bottles Supplied</Label>
                  <Input
                    id="bottles_supplied"
                    name="bottles_supplied"
                    type="number"
                    min="0"
                    defaultValue={editingOrder?.bottles_supplied || ''}
                  />
                </div>
                <div>
                  <Label htmlFor="bottles_returned">Bottles Returned</Label>
                  <Input
                    id="bottles_returned"
                    name="bottles_returned"
                    type="number"
                    min="0"
                    defaultValue={editingOrder?.bottles_returned || ''}
                  />
                </div>
              </div>
              )}

              {/* Bottle selection for this function order */}
              {(!editingOrder || activeTab === 'giving') && (
              <div>
                <Label>Select Bottles to send</Label>
                <div className="flex gap-2 mt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const ids = inStockBottles.filter(b => b.bottle_type === 'normal').map(b => b.id);
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
                      const ids = inStockBottles.filter(b => b.bottle_type === 'cool').map(b => b.id);
                      setSelectedBottleIds((prev) => Array.from(new Set([...prev, ...ids])));
                    }}
                  >
                    Select all Cool
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedBottleIds([])}
                  >
                    Clear
                  </Button>
                </div>
                <div className="mt-2 max-h-48 overflow-auto border rounded-md p-2 space-y-1">
                  {inStockBottles.length === 0 && (
                    <div className="text-sm text-muted-foreground">No in-stock bottles available.</div>
                  )}
                  {inStockBottles.map((b) => (
                    <label key={b.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedBottleIds.includes(b.id)}
                        onChange={(e) => {
                          setSelectedBottleIds((prev) => e.target.checked ? [...prev, b.id] : prev.filter(id => id !== b.id));
                        }}
                      />
                      <span>{b.bottle_number} • {b.bottle_type}</span>
                    </label>
                  ))}
                </div>
                {selectedBottleIds.length > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">{selectedBottleIds.length} bottle(s) selected</div>
                )}
              </div>
              )}

              {(!editingOrder || activeTab === 'giving') && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="total_amount">Total Amount (₹)</Label>
                  <Input
                    id="total_amount"
                    name="total_amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={overrideTotal || ''}
                    onChange={(e) => setOverrideTotal(e.target.value)}
                    placeholder="Auto from bottles; editable"
                  />
                  <div className="text-xs text-muted-foreground mt-1">Default: auto from selected bottles. You can edit this value.</div>
                </div>
                <div>
                  <Label htmlFor="amount_paid">Amount Paid (₹)</Label>
                  <Input
                    id="amount_paid"
                    name="amount_paid"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={editingOrder?.amount_paid || ''}
                  />
                </div>
              </div>
              )}
              
              <Button type="submit" className="w-full">
                {editingOrder ? 'Update Order' : 'Create Order'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search function orders..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Orders</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="settled">Settled</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-sm text-muted-foreground">
          {filteredOrders.length} of {orders.length} orders
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredOrders.map((order) => (
          <Card key={order.id}>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    {getCustomerName(order.customer_id)}
                  </CardTitle>
                  <CardDescription>
                    {order.event_name || 'Unnamed Event'}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(order)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(order.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {order.event_date && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    {new Date(order.event_date).toLocaleDateString()}
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Supplied:</span>
                    <span className="font-medium ml-1">{order.bottles_supplied}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Returned:</span>
                    <span className="font-medium ml-1">{order.bottles_returned}</span>
                  </div>
                </div>
                
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total:</span>
                    <span className="font-medium">₹{order.total_amount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Paid:</span>
                    <span className="font-medium">₹{order.amount_paid.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Balance:</span>
                    <span className={`font-medium ${getBalanceAmount(order) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      ₹{getBalanceAmount(order).toFixed(2)}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between pt-2 border-t">
                  <Badge 
                    variant={order.is_settled ? 'default' : 'secondary'}
                    className={order.is_settled ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}
                  >
                    {order.is_settled ? (
                      <>
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Settled
                      </>
                    ) : (
                      <>
                        <Clock className="h-3 w-3 mr-1" />
                        Pending
                      </>
                    )}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleSettled(order.id, order.is_settled)}
                  >
                    {order.is_settled ? 'Mark Pending' : 'Mark Settled'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredOrders.length === 0 && (
        <div className="text-center py-12">
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            {searchTerm || filterStatus !== 'all' ? 'No function orders found matching your criteria.' : 'No function orders yet. Add your first function order to get started.'}
          </p>
        </div>
      )}
    </div>
  );
};

export default FunctionOrders;