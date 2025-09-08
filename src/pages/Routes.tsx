import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Edit, Trash2, MapPin } from 'lucide-react';

interface Route {
  id: string;
  name: string;
  description?: string;
  order_sequence?: number[];
  created_at: string;
}

const Routes = () => {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchRoutes();
  }, []);

  const fetchRoutes = async () => {
    try {
      const { data, error } = await supabase
        .from('routes')
        .select('*')
        .order('name');

      if (error) throw error;
      setRoutes(data || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch routes: " + error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const formData = new FormData(e.currentTarget);
    const routeData = {
      name: formData.get('name') as string,
      description: formData.get('description') as string || null,
    };

    try {
      if (editingRoute) {
        const { error } = await supabase
          .from('routes')
          .update(routeData)
          .eq('id', editingRoute.id);
        
        if (error) throw error;
        
        toast({
          title: "Success",
          description: "Route updated successfully"
        });
      } else {
        const { error } = await supabase
          .from('routes')
          .insert(routeData);
        
        if (error) throw error;
        
        toast({
          title: "Success",
          description: "Route created successfully"
        });
      }
      
      fetchRoutes();
      setIsDialogOpen(false);
      setEditingRoute(null);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message
      });
    }
  };

  const handleEdit = (route: Route) => {
    setEditingRoute(route);
    setIsDialogOpen(true);
  };

  const handleDelete = async (routeId: string) => {
    if (!confirm('Are you sure you want to delete this route?')) return;
    
    try {
      const { error } = await supabase
        .from('routes')
        .delete()
        .eq('id', routeId);
      
      if (error) throw error;
      
      toast({
        title: "Success",
        description: "Route deleted successfully"
      });
      
      fetchRoutes();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message
      });
    }
  };

  const filteredRoutes = routes.filter(route =>
    route.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    route.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Routes</h1>
        </div>
        <div className="text-center py-12">Loading routes...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Routes</h1>
          <p className="text-muted-foreground">Manage delivery routes</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingRoute(null)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Route
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingRoute ? 'Edit Route' : 'Add New Route'}
              </DialogTitle>
              <DialogDescription>
                {editingRoute ? 'Update route information' : 'Create a new delivery route'}
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Route Name *</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={editingRoute?.name || ''}
                  placeholder="e.g., North Zone, City Center"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  defaultValue={editingRoute?.description || ''}
                  placeholder="Route description, coverage areas, etc."
                  rows={3}
                />
              </div>
              
              <Button type="submit" className="w-full">
                {editingRoute ? 'Update Route' : 'Create Route'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search routes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          {filteredRoutes.length} of {routes.length} routes
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredRoutes.map((route) => (
          <Card key={route.id}>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    {route.name}
                  </CardTitle>
                  <CardDescription>
                    Created {new Date(route.created_at).toLocaleDateString()}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(route)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(route.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {route.description && (
                  <p className="text-sm text-muted-foreground">
                    {route.description}
                  </p>
                )}
                
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Customer Count:</span>
                  <Badge variant="secondary">0</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredRoutes.length === 0 && (
        <div className="text-center py-12">
          <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            {searchTerm ? 'No routes found matching your search.' : 'No routes yet. Add your first route to get started.'}
          </p>
        </div>
      )}
    </div>
  );
};

export default Routes;