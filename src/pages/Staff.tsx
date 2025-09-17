import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Edit, Trash2, Users } from 'lucide-react';

interface Staff {
  id: string;
  name: string;
  phone?: string;
  role: 'owner' | 'delivery' | 'counter';
  route_id?: string;
  is_active: boolean;
  user_id?: string;
  created_at: string;
}

interface Route {
  id: string;
  name: string;
}

const Staff = () => {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  // Realtime: refresh staff and routes when either table changes
  useEffect(() => {
    let debounce: number | undefined;
    const schedule = (fn: () => void) => {
      if (debounce) window.clearTimeout(debounce);
      debounce = window.setTimeout(fn, 250);
    };
    const channel = supabase
      .channel('realtime-staff-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff' }, (payload: any) => {
        // Fine-grained local updates
        setStaff((prev) => {
          const list = [...prev];
          if (payload.eventType === 'INSERT' && payload.new) {
            return [payload.new as any, ...list];
          }
          if (payload.eventType === 'UPDATE' && payload.new) {
            const idx = list.findIndex((s) => s.id === (payload.new as any).id);
            if (idx >= 0) list[idx] = { ...(list[idx] as any), ...(payload.new as any) } as any;
            return list;
          }
          if (payload.eventType === 'DELETE' && payload.old) {
            return list.filter((s) => s.id !== (payload.old as any).id);
          }
          return list;
        });
        schedule(() => fetchData());
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'routes' }, () => schedule(() => fetchData()))
      .subscribe();
    return () => {
      if (debounce) window.clearTimeout(debounce);
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchData = async () => {
    try {
      const [staffResult, routesResult] = await Promise.all([
        supabase.from('staff').select('*').order('name'),
        supabase.from('routes').select('id, name').order('name')
      ]);

      if (staffResult.error) throw staffResult.error;
      if (routesResult.error) throw routesResult.error;

      setStaff(staffResult.data || []);
      setRoutes(routesResult.data || []);
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
    const staffData = {
      name: formData.get('name') as string,
      phone: formData.get('phone') as string || null,
      role: formData.get('role') as 'owner' | 'delivery' | 'counter',
      route_id: formData.get('route_id') as string || null,
      is_active: formData.get('is_active') === 'on'
    };

    try {
      if (editingStaff) {
        const { error } = await supabase
          .from('staff')
          .update(staffData)
          .eq('id', editingStaff.id);
        
        if (error) throw error;
        
        toast({
          title: "Success",
          description: "Staff updated successfully"
        });
      } else {
        const { error } = await supabase
          .from('staff')
          .insert(staffData);
        
        if (error) throw error;
        
        toast({
          title: "Success",
          description: "Staff created successfully"
        });
      }
      
      fetchData();
      setIsDialogOpen(false);
      setEditingStaff(null);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message
      });
    }
  };

  const handleEdit = (member: Staff) => {
    setEditingStaff(member);
    setIsDialogOpen(true);
  };

  const handleDelete = async (staffId: string) => {
    if (!confirm('Are you sure you want to delete this staff member?')) return;
    
    try {
      const { error } = await supabase
        .from('staff')
        .delete()
        .eq('id', staffId);
      
      if (error) throw error;
      
      toast({
        title: "Success",
        description: "Staff deleted successfully"
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

  const toggleActive = async (staffId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('staff')
        .update({ is_active: !currentStatus })
        .eq('id', staffId);
      
      if (error) throw error;
      
      toast({
        title: "Success",
        description: `Staff ${!currentStatus ? 'activated' : 'deactivated'} successfully`
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

  const filteredStaff = staff.filter(member =>
    member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    member.phone?.includes(searchTerm) ||
    member.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'owner': return 'bg-red-100 text-red-800';
      case 'delivery': return 'bg-blue-100 text-blue-800';
      case 'counter': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getRouteName = (routeId?: string) => {
    if (!routeId) return 'No route assigned';
    const route = routes.find(r => r.id === routeId);
    return route?.name || 'Unknown route';
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Staff</h1>
        </div>
        <div className="text-center py-12">Loading staff...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Staff</h1>
          <p className="text-muted-foreground">Manage staff members and roles</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingStaff(null)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Staff
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingStaff ? 'Edit Staff' : 'Add New Staff'}
              </DialogTitle>
              <DialogDescription>
                {editingStaff ? 'Update staff information' : 'Create a new staff member'}
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    defaultValue={editingStaff?.name || ''}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    defaultValue={editingStaff?.phone || ''}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="role">Role</Label>
                  <Select name="role" defaultValue={editingStaff?.role || 'delivery'}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="delivery">Delivery</SelectItem>
                      <SelectItem value="counter">Counter</SelectItem>
                      <SelectItem value="owner">Owner</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="route_id">Route (for delivery staff)</Label>
                  <Select name="route_id" defaultValue={editingStaff?.route_id || ''}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select route" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No route</SelectItem>
                      {routes.map((route) => (
                        <SelectItem key={route.id} value={route.id}>
                          {route.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch 
                  id="is_active" 
                  name="is_active"
                  defaultChecked={editingStaff?.is_active ?? true}
                />
                <Label htmlFor="is_active">Active</Label>
              </div>
              
              <Button type="submit" className="w-full">
                {editingStaff ? 'Update Staff' : 'Create Staff'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search staff..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          {filteredStaff.length} of {staff.length} staff
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredStaff.map((member) => (
          <Card key={member.id}>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    {member.name}
                    {!member.is_active && (
                      <Badge variant="secondary" className="bg-gray-100 text-gray-800">
                        Inactive
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {member.phone || 'No phone number'}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(member)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(member.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Role:</span>
                  <Badge variant="secondary" className={getRoleColor(member.role)}>
                    {member.role}
                  </Badge>
                </div>
                
                {member.role === 'delivery' && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Route:</span>
                    <span className="text-sm">{getRouteName(member.route_id)}</span>
                  </div>
                )}
                
                <div className="flex justify-between items-center pt-2">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  <Switch
                    checked={member.is_active}
                    onCheckedChange={() => toggleActive(member.id, member.is_active)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredStaff.length === 0 && (
        <div className="text-center py-12">
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            {searchTerm ? 'No staff found matching your search.' : 'No staff yet. Add your first staff member to get started.'}
          </p>
        </div>
      )}
    </div>
  );
};

export default Staff;