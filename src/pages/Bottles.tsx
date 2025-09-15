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
import { Plus, Search, Package, AlertCircle, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface Bottle {
  id: string;
  bottle_number: string;
  bottle_type: 'normal' | 'cool';
  current_customer_id?: string;
  is_returned: boolean;
  created_at: string;
  notes?: string | null;
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
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [filterStatus, setFilterStatus] = useState<'all' | 'out' | 'returned'>('all');
  const { toast } = useToast();
  const [pricing, setPricing] = useState<Array<{ id: string; bottle_type: 'normal' | 'cool'; customer_type: 'household' | 'shop' | 'function'; price: number }>>([]);
  // Control bottle type for the add form because shadcn Select doesn't submit native form values
  const [newBottleType, setNewBottleType] = useState<'normal' | 'cool'>('normal');
  const { user } = useAuth();

  const location = useLocation();

  // Configurable caps for recent activity (avoid magic numbers in code)
  const RECENT_TX_PER_BOTTLE = 5;
  const MAX_INITIAL_TX = 500;

  useEffect(() => {
    if (!user) return;
    fetchBottles();
    fetchCustomers();
    fetchPricing();
    // Parse query param for status
    const params = new URLSearchParams(location.search);
    const status = params.get('status');
    if (status === 'out' || status === 'returned' || status === 'all') {
      setFilterStatus(status as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, user?.id]);

  // Realtime updates for transactions and bottles
  useEffect(() => {
    // Subscribe to new/updated transactions to refresh recent activity in realtime
    const txChannel = supabase
      .channel('realtime-transactions')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions' }, (payload: any) => {
        const tx = payload.new as Transaction;
        const nums = tx?.bottle_numbers || [];
        if (!Array.isArray(nums) || nums.length === 0) return;
        setRecentTxMap((prev) => {
          const next = { ...prev };
          for (const num of nums) {
            const list = next[num] ? [tx, ...next[num]] : [tx];
            // Deduplicate by id and cap list size
            const seen = new Set<string>();
            const deduped: Transaction[] = [];
            for (const t of list) {
              if (!seen.has(t.id)) {
                seen.add(t.id);
                deduped.push(t);
              }
              if (deduped.length >= RECENT_TX_PER_BOTTLE) break;
            }
            next[num] = deduped;
          }
          return next;
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'transactions' }, (payload: any) => {
        const tx = payload.new as Transaction;
        const nums = tx?.bottle_numbers || [];
        if (!Array.isArray(nums) || nums.length === 0) return;
        setRecentTxMap((prev) => {
          const next = { ...prev };
          for (const num of nums) {
            const list = next[num] || [];
            // Replace if exists, else prepend
            const idx = list.findIndex((t) => t.id === tx.id);
            if (idx >= 0) list[idx] = tx;
            else list.unshift(tx);
            next[num] = list.slice(0, RECENT_TX_PER_BOTTLE);
          }
          return next;
        });
      })
      .subscribe();

    // Subscribe to bottles changes to keep list in sync (assign/return/delete)
    const bottlesChannel = supabase
      .channel('realtime-bottles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bottles' }, () => {
        fetchBottles();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(txChannel);
      supabase.removeChannel(bottlesChannel);
    };
  }, []);

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
        .eq('owner_user_id', user!.id)
        .order('bottle_number');

      if (error) throw error;
      setBottles(data || []);
      // initialize drafts for notes to current value
      const draft: Record<string, string> = {};
      for (const b of (data || [])) {
        draft[b.id] = (b as any).notes || '';
      }
      setNotesDraft(draft);
      // After bottles load, fetch recent transactions for these bottles
      const numbers = (data || []).map((b: any) => b.bottle_number);
      if (numbers.length > 0) {
        const { data: txs, error: txErr } = await supabase
          .from('transactions')
          .select('*')
          .eq('owner_user_id', user!.id)
          .overlaps('bottle_numbers', numbers)
          .order('transaction_date', { ascending: false })
          .limit(MAX_INITIAL_TX);
        if (txErr) throw txErr;
        const map: Record<string, Transaction[]> = {};
        for (const tx of txs || []) {
          for (const num of tx.bottle_numbers || []) {
            if (!map[num]) map[num] = [];
            if (map[num].length < RECENT_TX_PER_BOTTLE) {
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
        .select('id, bottle_type, customer_type, price')
        .eq('owner_user_id', user!.id);
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
        .eq('owner_user_id', user!.id)
        .order('name');

      if (error) throw error;
      setCustomers(data || []);
    } catch (error: any) {
      console.error('Error fetching customers:', error);
    }
  };

  // Generate next unique numbers by type (uppercase): 'C1','C2',... for cool; 'N1','N2',... for normal
  const generateNextBottleNumbers = (type: 'normal' | 'cool', count: number) => {
    const prefixLower = type === 'cool' ? 'c' : 'n';
    const prefixUpper = type === 'cool' ? 'C' : 'N';
    // Collect used indices for this prefix (case-insensitive, to support legacy lowercase numbers)
    const used = new Set<number>();
    for (const b of bottles) {
      const num = b.bottle_number?.toLowerCase() || '';
      if (num.startsWith(prefixLower)) {
        const idx = parseInt(num.slice(prefixLower.length), 10);
        if (!isNaN(idx) && idx > 0) used.add(idx);
      }
    }
    const result: string[] = [];
    let i = 1;
    while (result.length < count) {
      if (!used.has(i)) {
        result.push(`${prefixUpper}${i}`);
      }
      i++;
      // Safety cap to avoid infinite loop in pathological data
      if (i > 100000) break;
    }
    const ok = result.length === count;
    return { ok: ok as const, numbers: result, available: result.length };
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const formData = new FormData(e.currentTarget);
    // Read from controlled state; shadcn Select doesn't populate FormData
    const bottleType: 'normal' | 'cool' = newBottleType;
    const quantity = parseInt(formData.get('quantity') as string) || 1;

    try {
      // Create multiple bottles based on quantity with type-based prefixes
      const gen = generateNextBottleNumbers(bottleType, quantity);
      if (!gen.ok) {
        toast({
          variant: "destructive",
          title: "Not enough numbers",
          description: `Only ${gen.available} new bottle numbers available for type "${bottleType}". Reduce quantity or free up numbers.`,
        });
        return;
      }
      const bottlesToCreate = gen.numbers.map((num) => ({
        bottle_number: num,
        bottle_type: bottleType,
        is_returned: true,
        owner_user_id: user!.id,
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
          notes: 'Assigned from Bottles page',
          owner_user_id: user!.id,
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
          notes: 'Returned via Bottles page',
          owner_user_id: user!.id,
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

  const handleDeleteBottle = async (bottleId: string) => {
    try {
      const bottle = bottles.find(b => b.id === bottleId);
      if (!bottle) return;
      if (!bottle.is_returned) {
        toast({
          variant: 'destructive',
          title: 'Cannot delete',
          description: 'Bottle is currently out for delivery. Mark it as returned before deleting.'
        });
        return;
      }

      const confirmed = window.confirm(`Delete bottle ${bottle.bottle_number}? This action cannot be undone.`);
      if (!confirmed) return;

      const { error } = await supabase.from('bottles').delete().eq('id', bottleId);
      if (error) throw error;

      toast({ title: 'Deleted', description: `Bottle ${bottle.bottle_number} was deleted.` });
      fetchBottles();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  // Save per-bottle notes
  const handleSaveNotes = async (bottleId: string) => {
    try {
      const note = notesDraft[bottleId] || null;
      const { error } = await supabase
        .from('bottles')
        .update({ notes: note })
        .eq('id', bottleId);
      if (error) throw error;
      toast({ title: 'Saved', description: 'Notes updated for bottle' });
      setBottles(prev => prev.map(b => (b.id === bottleId ? { ...b, notes: note } : b)));
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
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
                <Select value={newBottleType} onValueChange={(v: 'normal' | 'cool') => setNewBottleType(v)}>
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

      {/* Stats Cards: 2x2 on mobile, 4 across on md+ */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
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
            <SelectItem value="out">Out Bottles</SelectItem>
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
                <div className="flex gap-2 items-center">
                  {!bottle.is_returned && getFunctionBadge(bottle.bottle_number) && (
                    <Badge variant="secondary">{getFunctionBadge(bottle.bottle_number)}</Badge>
                  )}
                  <Badge variant={bottle.is_returned ? 'secondary' : 'destructive'}>
                    {bottle.is_returned ? 'In Stock' : 'Out'}
                  </Badge>
                  {bottle.is_returned && (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-8 w-8 p-0"
                      title="Delete bottle"
                      aria-label="Delete bottle"
                      onClick={() => handleDeleteBottle(bottle.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
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

                {/* Notes editor */}
                <div className="space-y-1">
                  <Label htmlFor={`notes_${bottle.id}`}>Notes</Label>
                  <Input
                    id={`notes_${bottle.id}`}
                    value={notesDraft[bottle.id] ?? ''}
                    onChange={(e) => setNotesDraft(prev => ({ ...prev, [bottle.id]: e.target.value }))}
                    placeholder="Add remarks for this bottle"
                  />
                  <div className="flex justify-end">
                    <Button variant="secondary" size="sm" onClick={() => handleSaveNotes(bottle.id)}>Save</Button>
                  </div>
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