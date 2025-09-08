import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useLocation } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Package, AlertCircle } from 'lucide-react';

interface Bottle {
  id: string;
  bottle_number: string;
  bottle_type: 'normal' | 'cool';
  current_customer_id?: string;
  is_returned: boolean;
  created_at: string;
  customer?: {
    name: string;
    pin: string;
  };
}

interface Transaction {
  id: string;
  customer_id: string;
  transaction_type: 'delivery' | 'payment' | 'return';
  quantity?: number | null;
  amount?: number | null;
  bottle_type?: 'normal' | 'cool' | null;
  payment_type?: 'cash' | 'online' | 'credit' | null;
  bottle_numbers?: string[] | null;
  notes?: string | null;
  transaction_date: string;
}

const Bottles = () => {
  const [bottles, setBottles] = useState<Bottle[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [recentTxMap, setRecentTxMap] = useState<Record<string, Transaction[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'out' | 'returned'>('all');
  const { toast } = useToast();
  const [pricing, setPricing] = useState<Array<{ id: string; bottle_type: 'normal' | 'cool'; customer_type: 'household' | 'shop' | 'function'; price: number }>>([]);

  const location = useLocation();

  useEffect(() => {
    fetchBottles();
    fetchCustomers();
    fetchPricing();
    // Parse query param for status
    const params = new URLSearchParams(location.search);
    const status = params.get('status');
    if (status === 'out' || status === 'returned' || status === 'all') {
      setFilterStatus(status as any);
    }
  }, [location.search]);

  const fetchBottles = async () => {
    try {
      const { data, error } = await supabase
        .from('bottles')
        .select(`
          *,
          customer:current_customer_id (
            name,
            pin
          )
        `)
        .order('bottle_number');

      if (error) throw error;
      setBottles(data || []);
      // After bottles load, fetch recent transactions for these bottles
      const numbers = (data || []).map((b: any) => b.bottle_number);
      if (numbers.length > 0) {
        const { data: txs, error: txErr } = await supabase
          .from('transactions')
          .select('*')
          .overlaps('bottle_numbers', numbers)
          .order('transaction_date', { ascending: false })
          .limit(300);
        if (txErr) throw txErr;
        const map: Record<string, Transaction[]> = {};
        for (const tx of txs || []) {
          for (const num of tx.bottle_numbers || []) {
            if (!map[num]) map[num] = [];
            if (map[num].length < 3) {
              map[num].push(tx as Transaction);
            }
          }
        }
        setRecentTxMap(map);
      } else {
        setRecentTxMap({});
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch bottles: " + error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchPricing = async () => {
    try {
      const { data, error } = await supabase
        .from('pricing')
        .select('id, bottle_type, customer_type, price');
      if (error) throw error;
      setPricing(data || []);
    } catch (error) {
      console.error('Error fetching pricing:', error);
    }
  };

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, pin, customer_type, balance')
        .order('name');

      if (error) throw error;
      setCustomers(data || []);
    } catch (error: any) {
      console.error('Error fetching customers:', error);
    }
  };

  // Generate up to `count` unique 2-digit bottle numbers (B00 - B99) that are not already used
  const generateTwoDigitBottleNumbers = (count: number) => {
    const existing = new Set(bottles.map((b) => b.bottle_number));
    const all = Array.from({ length: 100 }, (_, i) => `B${i.toString().padStart(2, '0')}`);
    const available = all.filter((n) => !existing.has(n));
    if (available.length < count) {
      return { ok: false as const, numbers: [] as string[], available: available.length };
    }
    // Simple selection: take first N after shuffling for distribution
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }
    return { ok: true as const, numbers: available.slice(0, count), available: available.length };
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const formData = new FormData(e.currentTarget);
    const bottleType = formData.get('bottle_type') as string;
    const quantity = parseInt(formData.get('quantity') as string) || 1;

    try {
      // Create multiple bottles based on quantity with 2-digit numbers
      const gen = generateTwoDigitBottleNumbers(quantity);
      if (!gen.ok) {
        toast({
          variant: "destructive",
          title: "Not enough numbers",
          description: `Only ${gen.available} unique 2-digit bottle numbers available (B00-B99). Reduce quantity or free up numbers.`,
        });
        return;
      }
      const bottlesToCreate = gen.numbers.map((num) => ({
        bottle_number: num,
        bottle_type: bottleType,
        is_returned: true,
      }));

      const { error } = await supabase
        .from('bottles')
        .insert(bottlesToCreate);
      
      if (error) throw error;
      
      toast({
        title: "Success",
        description: `${quantity} bottle${quantity > 1 ? 's' : ''} added to inventory`
      });
      
      fetchBottles();
      setIsDialogOpen(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message
      });
    }
  };

  const handleAssignBottle = async (bottleId: string, customerId: string) => {
    try {
      // Load bottle for number and type
      const bottle = bottles.find(b => b.id === bottleId);
      const bottleNum = bottle?.bottle_number ? [bottle.bottle_number] : [];
      const { error } = await supabase
        .from('bottles')
        .update({
          current_customer_id: customerId,
          is_returned: false
        })
        .eq('id', bottleId);

      if (error) throw error;

      // Log a delivery transaction for this specific bottle
      if (bottleNum.length > 0) {
        // Auto-calc amount using pricing
        const customer = customers.find(c => c.id === customerId);
        const priceRow = customer && bottle ? pricing.find(p => p.customer_type === customer.customer_type && p.bottle_type === bottle.bottle_type) : undefined;
        const amount = priceRow ? priceRow.price : 0;

        await supabase.from('transactions').insert({
          customer_id: customerId,
          transaction_type: 'delivery',
          quantity: 1,
          bottle_numbers: bottleNum,
          bottle_type: bottle?.bottle_type || null,
          amount,
          transaction_date: new Date().toISOString(),
          notes: 'Assigned from Bottles page'
        });
        // Update balance
        if (customer) {
          await supabase.from('customers').update({ balance: (customer.balance || 0) + amount }).eq('id', customer.id);
        }
      }

      toast({
        title: "Success",
        description: "Bottle assigned to customer"
      });

      fetchBottles();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message
      });
    }
  };

  const handleReturnBottle = async (bottleId: string) => {
    try {
      const bottle = bottles.find(b => b.id === bottleId);
      const bottleNum = bottle?.bottle_number ? [bottle.bottle_number] : [];
      const { error } = await supabase
        .from('bottles')
        .update({
          current_customer_id: null,
          is_returned: true
        })
        .eq('id', bottleId);

      if (error) throw error;

      // Log a return transaction for this bottle
      if (bottleNum.length > 0) {
        await supabase.from('transactions').insert({
          customer_id: bottle?.current_customer_id || customers[0]?.id || '',
          transaction_type: 'return',
          quantity: 1,
          bottle_numbers: bottleNum,
          bottle_type: bottle?.bottle_type || null,
          transaction_date: new Date().toISOString(),
          notes: 'Returned via Bottles page'
        });
      }

      toast({
        title: "Success",
        description: "Bottle marked as returned"
      });

      fetchBottles();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message
      });
    }
  };

  const filteredBottles = bottles.filter(bottle => {
    const matchesSearch = bottle.bottle_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bottle.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bottle.customer?.pin?.includes(searchTerm);

    const matchesFilter = filterStatus === 'all' || 
      (filterStatus === 'out' && !bottle.is_returned) ||
      (filterStatus === 'returned' && bottle.is_returned);

    return matchesSearch && matchesFilter;
  });

  const stats = {
    total: bottles.length,
    out: bottles.filter(b => !b.is_returned).length,
    returned: bottles.filter(b => b.is_returned).length,
    lost: bottles.filter(b => !b.is_returned && 
      new Date().getTime() - new Date(b.created_at).getTime() > 7 * 24 * 60 * 60 * 1000).length
  };

  const getFunctionBadge = (bottle_number: string) => {
    const list = recentTxMap[bottle_number] || [];
    const latest = list[0];
    if (latest?.notes && latest.notes.startsWith('Function:')) {
      return latest.notes;
    }
    return null;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Bottle Management</h1>
        </div>
        <div className="text-center py-12">Loading bottles...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Bottle Management</h1>
          <p className="text-muted-foreground">Track and manage your water bottles</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Bottles
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Bottles</DialogTitle>
              <DialogDescription>
                Add bottles to your inventory
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="bottle_type">Bottle Type</Label>
                <Select name="bottle_type" defaultValue="normal">
                  <SelectTrigger>
                    <SelectValue placeholder="Select bottle type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="cool">Cool</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  name="quantity"
                  type="number"
                  min="1"
                  defaultValue="1"
                  required
                />
              </div>
              
              <Button type="submit" className="w-full">
                Add Bottles
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Bottles</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Out for Delivery</CardTitle>
            <Package className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.out}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Stock</CardTitle>
            <Package className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.returned}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Potentially Lost</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.lost}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search bottles by number or customer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Bottles</SelectItem>
            <SelectItem value="out">Out for Delivery</SelectItem>
            <SelectItem value="returned">In Stock</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bottles Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredBottles.map((bottle) => (
          <Card key={bottle.id}>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{bottle.bottle_number}</CardTitle>
                  <CardDescription>
                    <Badge variant={bottle.bottle_type === 'cool' ? 'default' : 'secondary'}>
                      {bottle.bottle_type}
                    </Badge>
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {!bottle.is_returned && getFunctionBadge(bottle.bottle_number) && (
                    <Badge variant="secondary">{getFunctionBadge(bottle.bottle_number)}</Badge>
                  )}
                  <Badge variant={bottle.is_returned ? 'secondary' : 'destructive'}>
                    {bottle.is_returned ? 'In Stock' : 'Out'}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {bottle.customer && !bottle.is_returned && (
                  <div>
                    <p className="text-sm text-muted-foreground">With Customer:</p>
                    <p className="font-medium">{bottle.customer.name}</p>
                    <p className="text-sm">PIN: {bottle.customer.pin}</p>
                  </div>
                )}
                
                <div className="flex gap-2">
                  {bottle.is_returned ? (
                    <Select onValueChange={(customerId) => handleAssignBottle(bottle.id, customerId)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Assign to customer" />
                      </SelectTrigger>
                      <SelectContent>
                        {customers.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.name} (PIN: {customer.pin})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Button
                      onClick={() => handleReturnBottle(bottle.id)}
                      variant="outline"
                      size="sm"
                      className="w-full"
                    >
                      Mark as Returned
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
            <CardContent>
              {/* Recent transactions per bottle */}
              <div>
                <p className="text-sm text-muted-foreground">Recent activity:</p>
                <ul className="text-sm list-disc pl-5">
                  {(recentTxMap[bottle.bottle_number] || []).map((tx) => (
                    <li key={tx.id}>
                      {tx.transaction_type} • {new Date(tx.transaction_date).toLocaleString()} {tx.notes ? `• ${tx.notes}` : ''}
                    </li>
                  ))}
                  {!(recentTxMap[bottle.bottle_number]?.length) && (
                    <li className="text-muted-foreground">No recent activity</li>
                  )}
                </ul>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredBottles.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            {searchTerm || filterStatus !== 'all' 
              ? 'No bottles found matching your criteria.' 
              : 'No bottles in inventory. Add some bottles to get started.'}
          </p>
        </div>
      )}
    </div>
  );
};

export default Bottles;