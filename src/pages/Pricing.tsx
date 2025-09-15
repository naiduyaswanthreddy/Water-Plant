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
import { Plus, Search, Edit, Trash2, DollarSign } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface Pricing {
  id: string;
  bottle_type: 'normal' | 'cool';
  customer_type: 'household' | 'shop' | 'function';
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

  useEffect(() => {
    if (!user) return;
    fetchPricings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const fetchPricings = async () => {
    try {
      const { data, error } = await supabase
        .from('pricing')
        .select('*')
        .eq('owner_user_id', user!.id)
        .order('bottle_type')
        .order('customer_type');

      if (error) throw error;
      const rows = data || [];
      // Auto-seed defaults if none exist for this user
      if (rows.length === 0) {
        const defaults = [
          { bottle_type: 'normal', customer_type: 'household', price: 20 },
          { bottle_type: 'cool',   customer_type: 'household', price: 25 },
          { bottle_type: 'normal', customer_type: 'shop',      price: 18 },
          { bottle_type: 'cool',   customer_type: 'shop',      price: 23 },
          { bottle_type: 'normal', customer_type: 'function',  price: 15 },
          { bottle_type: 'cool',   customer_type: 'function',  price: 20 },
        ] as const;
        const { error: seedErr } = await supabase
          .from('pricing')
          .upsert(
            defaults.map((d) => ({ ...d, owner_user_id: user!.id })) as any,
            { onConflict: 'owner_user_id,bottle_type,customer_type', ignoreDuplicates: true }
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
        setPricings(seeded.data || []);
      } else {
        setPricings(rows);
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
      customer_type: formData.get('customer_type') as 'household' | 'shop' | 'function',
      price: parseFloat(formData.get('price') as string)
    };

    try {
      if (editingPricing) {
        const { error } = await supabase
          .from('pricing')
          .update(pricingData)
          .eq('id', editingPricing.id);
        
        if (error) throw error;
        
        toast({
          title: "Success",
          description: "Pricing updated successfully"
        });
      } else {
        // Check if combination already exists
        const { data: existing } = await supabase
          .from('pricing')
          .select('id')
          .eq('bottle_type', pricingData.bottle_type)
          .eq('customer_type', pricingData.customer_type)
          .eq('owner_user_id', user!.id);
        
        if (existing && existing.length > 0) {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Pricing for this combination already exists"
          });
          return;
        }
        
        const { error } = await supabase
          .from('pricing')
          .insert({ ...pricingData, owner_user_id: user!.id });
        
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
          <p className="text-muted-foreground">Manage pricing for different bottle types and customer categories</p>
        </div>
        
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
                    </SelectContent>
                  </Select>
                </div>
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
              
              <Button type="submit" className="w-full">
                {editingPricing ? 'Update Pricing' : 'Create Pricing'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
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
          </SelectContent>
        </Select>
        <div className="text-sm text-muted-foreground">
          {filteredPricings.length} of {pricings.length} pricing rules
        </div>
      </div>

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