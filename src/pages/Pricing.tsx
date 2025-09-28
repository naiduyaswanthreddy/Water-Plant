import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Edit, Trash2, DollarSign, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { withTimeoutRetry } from '@/lib/supaRequest';

interface Pricing {
  id: string;
  bottle_type: 'normal' | 'cool';
  customer_type: 'household' | 'shop' | 'function' | 'hotel';
  pricing_for: 'filling' | 'bottle';
  price: number;
  created_at: string;
  updated_at: string;
}

const Pricing = () => {
  const [pricings, setPricings] = useState<Pricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPricing, setEditingPricing] = useState<Pricing | null>(null);
  const [filterBottleType, setFilterBottleType] = useState<string>('all');
  const [filterCustomerType, setFilterCustomerType] = useState<string>('all');
  const { toast } = useToast();
  const { user } = useAuth();
  // Quick-setup inputs per missing combination: key = `${bottle_type}|${customer_type}`
  const [quickPrice, setQuickPrice] = useState<Record<string, string>>({});
  const [quickLoading, setQuickLoading] = useState<Record<string, boolean>>({});
  const [quickRetry, setQuickRetry] = useState<Record<string, boolean>>({});
  const [dialogLoading, setDialogLoading] = useState<boolean>(false);
  const [dialogRetry, setDialogRetry] = useState<boolean>(false);
  

  useEffect(() => {
    if (!user) return;
    fetchPricings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Realtime: refresh pricing list on changes
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('realtime-pricing-page')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pricing', filter: `owner_user_id=eq.${user.id}` },
        (payload: any) => {
        const row = (payload.new || payload.old) as any;
        if (!row || row.owner_user_id === user.id) {
          // Fine-grained local update
          setPricings((prev) => {
            const list = [...prev];
            if (payload.eventType === 'INSERT' && payload.new) {
              return [payload.new as any, ...list];
            }
            if (payload.eventType === 'UPDATE' && payload.new) {
              const idx = list.findIndex((p) => p.id === (payload.new as any).id);
              if (idx >= 0) list[idx] = { ...(list[idx] as any), ...(payload.new as any) };
              return list;
            }
            if (payload.eventType === 'DELETE' && payload.old) {
              return list.filter((p) => p.id !== (payload.old as any).id);
            }
            return list;
          });
          // Safety refetch to maintain sort order
          fetchPricings();
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Quick Setup data and action (component scope)
  const allBottleTypes: Array<'normal' | 'cool'> = ['normal', 'cool'];
  const allCustomerTypes: Array<'household' | 'shop' | 'function' | 'hotel'> = ['household', 'shop', 'function', 'hotel'];
  const pricingFor: Array<'filling' | 'bottle'> = ['filling', 'bottle'];
  const existing = new Set(pricings.map(p => `${p.bottle_type}|${p.customer_type}|${p.pricing_for}`));
  const missingCombos = allBottleTypes.flatMap((bt) =>
    allCustomerTypes.flatMap((ct) => pricingFor
      .filter((pf) => !existing.has(`${bt}|${ct}|${pf}`))
      .map((pf) => ({ bottle_type: bt, customer_type: ct, pricing_for: pf }))
    )
  );

  const addQuickPrice = async (
    bt: 'normal' | 'cool',
    ct: 'household' | 'shop' | 'function' | 'hotel',
    pf: 'filling' | 'bottle'
  ) => {
    const key = `${bt}|${ct}|${pf}`;
    const raw = (quickPrice[key] ?? '').toString().trim();
    const price = parseFloat(raw.replace(',', '.'));
    if (!Number.isFinite(price) || price <= 0) {
      toast({ variant: 'destructive', title: 'Invalid price', description: 'Enter a positive number, e.g. 20 or 20.5' });
      return;
    }
    try {
      setQuickLoading((prev) => ({ ...prev, [key]: true }));
      setQuickRetry((prev) => ({ ...prev, [key]: false }));
      const resp = await withTimeoutRetry(
        () => supabase
          .from('pricing')
          .insert({ bottle_type: bt, customer_type: ct, pricing_for: pf, price, owner_user_id: user!.id } as any)
          .select('id'),
        { timeoutMs: 10000 }
      );
      const { error } = resp as any;
      if (error) throw error;
      setQuickPrice((prev) => ({ ...prev, [key]: '' }));
      toast({ title: 'Added', description: `Pricing set for ${ct} / ${bt} (${pf})` });
      fetchPricings();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
      if ((e?.message || '').toLowerCase().includes('timeout')) {
        setQuickRetry((prev) => ({ ...prev, [key]: true }));
      }
    } finally {
      setQuickLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const fetchPricings = async () => {
    try {
      const { data, error } = await supabase
        .from('pricing')
        .select('*')
        .eq('owner_user_id', user!.id)
        .order('bottle_type')
        .order('customer_type')
        .order('pricing_for');

      if (error) throw error;
      const rows = (data as any) || [];
      // Auto-seed defaults if none exist for this user
      if (rows.length === 0) {
        // Seed both pricing_for types and include hotel
        const defaults = [
          // household
          { bottle_type: 'normal', customer_type: 'household', pricing_for: 'filling', price: 20 },
          { bottle_type: 'normal', customer_type: 'household', pricing_for: 'bottle',  price: 20 },
          { bottle_type: 'cool',   customer_type: 'household', pricing_for: 'filling', price: 25 },
          { bottle_type: 'cool',   customer_type: 'household', pricing_for: 'bottle',  price: 25 },
          // shop
          { bottle_type: 'normal', customer_type: 'shop',      pricing_for: 'filling', price: 18 },
          { bottle_type: 'normal', customer_type: 'shop',      pricing_for: 'bottle',  price: 18 },
          { bottle_type: 'cool',   customer_type: 'shop',      pricing_for: 'filling', price: 23 },
          { bottle_type: 'cool',   customer_type: 'shop',      pricing_for: 'bottle',  price: 23 },
          // function
          { bottle_type: 'normal', customer_type: 'function',  pricing_for: 'filling', price: 15 },
          { bottle_type: 'normal', customer_type: 'function',  pricing_for: 'bottle',  price: 15 },
          { bottle_type: 'cool',   customer_type: 'function',  pricing_for: 'filling', price: 20 },
          { bottle_type: 'cool',   customer_type: 'function',  pricing_for: 'bottle',  price: 20 },
          // hotel (example defaults)
          { bottle_type: 'normal', customer_type: 'hotel',     pricing_for: 'filling', price: 22 },
          { bottle_type: 'normal', customer_type: 'hotel',     pricing_for: 'bottle',  price: 22 },
          { bottle_type: 'cool',   customer_type: 'hotel',     pricing_for: 'filling', price: 27 },
          { bottle_type: 'cool',   customer_type: 'hotel',     pricing_for: 'bottle',  price: 27 },
        ] as const;
        const { error: seedErr } = await supabase
          .from('pricing')
          .upsert(
            defaults.map((d) => ({ ...d, owner_user_id: user!.id })) as any,
            { onConflict: 'owner_user_id,bottle_type,customer_type,pricing_for', ignoreDuplicates: true }
          );
        if (seedErr) throw seedErr;
        // Re-fetch after seeding
        const seeded = await supabase
          .from('pricing')
          .select('*')
          .eq('owner_user_id', user!.id)
          .order('bottle_type')
          .order('customer_type');
        if (seeded.error) throw seeded.error;
        setPricings(((seeded.data as any) || []) as Pricing[]);
      } else {
        setPricings(rows as Pricing[]);
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch pricing: " + error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const formData = new FormData(e.currentTarget);
    const pricingData = {
      bottle_type: formData.get('bottle_type') as 'normal' | 'cool',
      customer_type: formData.get('customer_type') as 'household' | 'shop' | 'function' | 'hotel',
      pricing_for: formData.get('pricing_for') as 'filling' | 'bottle',
      price: parseFloat((formData.get('price') as string || '').toString().trim().replace(',', '.'))
    };

    try {
      setDialogLoading(true);
      setDialogRetry(false);
      if (editingPricing) {
        const resp = await withTimeoutRetry(
          () => supabase
            .from('pricing')
            .update(pricingData as any)
            .eq('id', editingPricing.id)
            .select('id'),
          { timeoutMs: 10000 }
        );
        const { error } = resp as any;
        if (error) throw error;
        
        toast({
          title: "Success",
          description: "Pricing updated successfully"
        });
      } else {
        // Check if combination already exists
        const existingResp = await withTimeoutRetry(
          () => supabase
            .from('pricing')
            .select('id')
            .eq('bottle_type', pricingData.bottle_type as any)
            .eq('customer_type', pricingData.customer_type as any)
            .eq('pricing_for', pricingData.pricing_for as any)
            .eq('owner_user_id', user!.id),
          { timeoutMs: 10000 }
        );
        const existing = (existingResp as any).data as any[] | null;
        
        if (existing && existing.length > 0) {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Pricing for this combination already exists"
          });
          return;
        }
        
        const insResp = await withTimeoutRetry(
          () => supabase
            .from('pricing')
            .insert({ ...pricingData, owner_user_id: user!.id } as any)
            .select('id'),
          { timeoutMs: 10000 }
        );
        const { error } = insResp as any;
        if (error) throw error;
        
        toast({
          title: "Success",
          description: "Pricing created successfully"
        });
      }
      
      fetchPricings();
      setIsDialogOpen(false);
      setEditingPricing(null);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message
      });
      if ((error?.message || '').toLowerCase().includes('timeout')) {
        setDialogRetry(true);
      }
    } finally {
      setDialogLoading(false);
    }
  };

  const handleEdit = (pricing: Pricing) => {
    setEditingPricing(pricing);
    setIsDialogOpen(true);
  };

  const handleDelete = async (pricingId: string) => {
    if (!confirm('Are you sure you want to delete this pricing?')) return;
    
    try {
      const { error } = await supabase
        .from('pricing')
        .delete()
        .eq('id', pricingId);
      
      if (error) throw error;
      
      toast({
        title: "Success",
        description: "Pricing deleted successfully"
      });
      
      fetchPricings();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message
      });
    }
  };

  const getBottleTypeColor = (type: string) => {
    switch (type) {
      case 'normal': return 'bg-blue-100 text-blue-800';
      case 'cool': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getCustomerTypeColor = (type: string) => {
    switch (type) {
      case 'household': return 'bg-green-100 text-green-800';
      case 'shop': return 'bg-orange-100 text-orange-800';
      case 'function': return 'bg-pink-100 text-pink-800';
      case 'hotel': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredPricings = pricings.filter(pricing => {
    const matchesSearch = pricing.bottle_type.includes(searchTerm.toLowerCase()) ||
      pricing.customer_type.includes(searchTerm.toLowerCase()) ||
      pricing.price.toString().includes(searchTerm);
    
    const matchesBottleType = filterBottleType === 'all' || pricing.bottle_type === filterBottleType;
    const matchesCustomerType = filterCustomerType === 'all' || pricing.customer_type === filterCustomerType;
    
    return matchesSearch && matchesBottleType && matchesCustomerType;
  });

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Pricing</h1>
        </div>
        <div className="text-center py-12">Loading pricing...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Pricing</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={async () => {
            try {
              // Build defaults list
              const defaults = [
                // household
                { bottle_type: 'normal', customer_type: 'household', pricing_for: 'filling', price: 20 },
                { bottle_type: 'normal', customer_type: 'household', pricing_for: 'bottle',  price: 20 },
                { bottle_type: 'cool',   customer_type: 'household', pricing_for: 'filling', price: 25 },
                { bottle_type: 'cool',   customer_type: 'household', pricing_for: 'bottle',  price: 25 },
                // shop
                { bottle_type: 'normal', customer_type: 'shop',      pricing_for: 'filling', price: 18 },
                { bottle_type: 'normal', customer_type: 'shop',      pricing_for: 'bottle',  price: 18 },
                { bottle_type: 'cool',   customer_type: 'shop',      pricing_for: 'filling', price: 23 },
                { bottle_type: 'cool',   customer_type: 'shop',      pricing_for: 'bottle',  price: 23 },
                // function
                { bottle_type: 'normal', customer_type: 'function',  pricing_for: 'filling', price: 15 },
                { bottle_type: 'normal', customer_type: 'function',  pricing_for: 'bottle',  price: 15 },
                { bottle_type: 'cool',   customer_type: 'function',  pricing_for: 'filling', price: 20 },
                { bottle_type: 'cool',   customer_type: 'function',  pricing_for: 'bottle',  price: 20 },
                // hotel
                { bottle_type: 'normal', customer_type: 'hotel',     pricing_for: 'filling', price: 22 },
                { bottle_type: 'normal', customer_type: 'hotel',     pricing_for: 'bottle',  price: 22 },
                { bottle_type: 'cool',   customer_type: 'hotel',     pricing_for: 'filling', price: 27 },
                { bottle_type: 'cool',   customer_type: 'hotel',     pricing_for: 'bottle',  price: 27 },
              ] as const;

              // Determine existing
              const existingSet = new Set(pricings.map(p => `${p.bottle_type}|${p.customer_type}|${p.pricing_for}`));
              const toInsert = defaults
                .filter((d) => !existingSet.has(`${d.bottle_type}|${d.customer_type}|${d.pricing_for}`))
                .map((d) => ({ ...d, owner_user_id: user!.id }));
              if (toInsert.length === 0) {
                toast({ title: 'Nothing to seed', description: 'All defaults already exist.' });
                return;
              }
              const { error } = await supabase
                .from('pricing')
                .upsert(toInsert as any, { onConflict: 'owner_user_id,bottle_type,customer_type,pricing_for', ignoreDuplicates: true });
              if (error) throw error;
              toast({ title: 'Seeded', description: `Added ${toInsert.length} default pricing ${toInsert.length === 1 ? 'row' : 'rows'}.` });
              fetchPricings();
            } catch (e: any) {
              toast({ variant: 'destructive', title: 'Error', description: e.message });
            }
          }}>Seed Defaults</Button>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditingPricing(null)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Pricing
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingPricing ? 'Edit Pricing' : 'Add New Pricing'}
                </DialogTitle>
                <DialogDescription>
                  {editingPricing ? 'Update pricing information' : 'Create a new pricing rule'}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="bottle_type">Bottle Type *</Label>
                    <Select name="bottle_type" defaultValue={editingPricing?.bottle_type} required>
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
                    <Label htmlFor="customer_type">Customer Type *</Label>
                    <Select name="customer_type" defaultValue={editingPricing?.customer_type} required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select customer type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="household">Household</SelectItem>
                        <SelectItem value="shop">Shop</SelectItem>
                        <SelectItem value="function">Function/Event</SelectItem>
                        <SelectItem value="hotel">Hotel</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label htmlFor="pricing_for">Mode *</Label>
                  <Select name="pricing_for" defaultValue={editingPricing?.pricing_for ?? 'filling'} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="filling">Filling</SelectItem>
                      <SelectItem value="bottle">Bottle</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="price">Price per Bottle (₹) *</Label>
                  <Input
                    id="price"
                    name="price"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={editingPricing?.price || ''}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button type="submit" className="w-full" disabled={dialogLoading}>
                    {dialogLoading ? (
                      <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {editingPricing ? 'Updating' : 'Creating'}</span>
                    ) : (editingPricing ? 'Update Pricing' : 'Create Pricing')}
                  </Button>
                  {dialogRetry && !dialogLoading && (
                    <Button type="button" variant="outline" onClick={() => (editingPricing ? handleSubmit(new Event('submit') as any) : handleSubmit(new Event('submit') as any))}>Retry</Button>
                  )}
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search pricing..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterBottleType} onValueChange={setFilterBottleType}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Bottles</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="cool">Cool</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCustomerType} onValueChange={setFilterCustomerType}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Customers</SelectItem>
            <SelectItem value="household">Household</SelectItem>
            <SelectItem value="shop">Shop</SelectItem>
            <SelectItem value="function">Function</SelectItem>
            <SelectItem value="hotel">Hotel</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-sm text-muted-foreground">
          {filteredPricings.length} of {pricings.length} pricing rules
        </div>
      </div>

      {/* Quick Setup for missing combinations */}
      {missingCombos.length > 0 && (
        <div className="rounded border p-4 space-y-3">
          <div className="text-base font-semibold">Quick Setup: Missing Pricing</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {missingCombos.map(({ bottle_type, customer_type, pricing_for }) => {
              const key = `${bottle_type}|${customer_type}|${pricing_for}`;
              return (
                <div key={key} className="flex items-end gap-2">
                  <div className="flex-1">
                    <div className="text-sm text-muted-foreground mb-1">{customer_type} / {bottle_type} ({pricing_for})</div>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={quickPrice[key] ?? ''}
                      placeholder="0.00"
                      onChange={(e) => setQuickPrice(prev => ({ ...prev, [key]: e.target.value }))}
                      className="bg-white"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button onClick={() => addQuickPrice(bottle_type, customer_type, pricing_for)} className="shrink-0" disabled={!!quickLoading[key]}>
                      {quickLoading[key] ? (
                        <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Adding</span>
                      ) : 'Add'}
                    </Button>
                    {quickRetry[key] && !quickLoading[key] && (
                      <Button type="button" variant="outline" onClick={() => addQuickPrice(bottle_type, customer_type, pricing_for)}>Retry</Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-xs text-muted-foreground">Set prices for missing combinations here to stop seeing "Pricing not set" in other pages.</div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredPricings.map((pricing) => (
          <Card key={pricing.id}>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    ₹{pricing.price.toFixed(2)}
                  </CardTitle>
                  <CardDescription>
                    Per bottle pricing
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(pricing)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(pricing.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Bottle Type:</span>
                  <Badge variant="secondary" className={getBottleTypeColor(pricing.bottle_type)}>
                    {pricing.bottle_type}
                  </Badge>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Customer Type:</span>
                  <Badge variant="secondary" className={getCustomerTypeColor(pricing.customer_type)}>
                    {pricing.customer_type}
                  </Badge>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Mode:</span>
                  <Badge variant="secondary">
                    {pricing.pricing_for}
                  </Badge>
                </div>
                
                <div className="pt-2 border-t text-xs text-muted-foreground">
                  Last updated: {new Date(pricing.updated_at).toLocaleDateString()}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredPricings.length === 0 && (
        <div className="text-center py-12">
          <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            {searchTerm || filterBottleType !== 'all' || filterCustomerType !== 'all' 
              ? 'No pricing found matching your criteria.' 
              : 'No pricing set yet. Add your first pricing rule to get started.'}
          </p>
        </div>
      )}
    </div>
  );
};

export default Pricing;