import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { 
  Users, 
  Package, 
  Truck, 
  DollarSign, 
  TrendingUp, 
  AlertTriangle 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

interface DashboardStats {
  totalCustomers: number;
  bottlesInCirculation: number;
  todayDeliveries: number;
  pendingBalance: number;
  lostBottles: number;
  todayRevenue: number;
}

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalCustomers: 0,
    bottlesInCirculation: 0,
    todayDeliveries: 0,
    pendingBalance: 0,
    lostBottles: 0,
    todayRevenue: 0,
  });
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    fetchDashboardStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Realtime: refresh dashboard KPIs when core tables change
  useEffect(() => {
    if (!user) return;
    let debounce: number | undefined;
    const schedule = (fn: () => void) => {
      if (debounce) window.clearTimeout(debounce);
      debounce = window.setTimeout(fn, 250);
    };
    const channel = supabase
      .channel('realtime-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers', filter: `owner_user_id=eq.${user.id}` }, () => schedule(() => fetchDashboardStats()))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bottles', filter: `owner_user_id=eq.${user.id}` }, () => schedule(() => fetchDashboardStats()))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `owner_user_id=eq.${user.id}` }, () => schedule(() => fetchDashboardStats()))
      .subscribe();

    return () => {
      if (debounce) window.clearTimeout(debounce);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const fetchDashboardStats = async () => {
    try {
      setLoading(true);

      // Get total customers
      const { count: customerCount } = await supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('owner_user_id', user!.id);

      // Get bottles in circulation
      const { count: bottleCount } = await supabase
        .from('bottles')
        .select('id', { count: 'exact', head: true })
        .eq('owner_user_id', user!.id)
        .eq('is_returned', false);

      // Get today's deliveries
      const today = new Date().toISOString().split('T')[0];
      const { count: deliveryCount } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('transaction_type', 'delivery')
        .eq('owner_user_id', user!.id)
        .gte('transaction_date', today);

      // Get pending balances
      const { data: balanceData } = await supabase
        .from('customers')
        .select('balance')
        .eq('owner_user_id', user!.id);
      
      const totalBalance = balanceData?.reduce((sum, customer) => 
        sum + (parseFloat(customer.balance?.toString() || '0')), 0) || 0;

      // Get lost bottles (bottles not returned for more than 7 days)
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      
      const { count: lostCount } = await supabase
        .from('bottles')
        .select('id', { count: 'exact', head: true })
        .eq('owner_user_id', user!.id)
        .eq('is_returned', false)
        .lt('created_at', weekAgo.toISOString());

      // Get today's revenue
      const { data: revenueData } = await supabase
        .from('transactions')
        .select('amount')
        .eq('transaction_type', 'payment')
        .eq('owner_user_id', user!.id)
        .gte('transaction_date', today);

      const todayRevenue = revenueData?.reduce((sum, transaction) => 
        sum + (parseFloat(transaction.amount?.toString() || '0')), 0) || 0;

      setStats({
        totalCustomers: customerCount || 0,
        bottlesInCirculation: bottleCount || 0,
        todayDeliveries: deliveryCount || 0,
        pendingBalance: totalBalance,
        lostBottles: lostCount || 0,
        todayRevenue,
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Total Customers',
      value: stats.totalCustomers,
      icon: Users,
      description: 'Active customers',
      color: 'text-primary'
    },
    {
      title: 'Bottles Out',
      value: stats.bottlesInCirculation,
      icon: Package,
      description: 'Bottles in circulation',
      color: 'text-blue-600'
    },
    {
      title: 'Today\'s Deliveries',
      value: stats.todayDeliveries,
      icon: Truck,
      description: 'Deliveries completed today',
      color: 'text-green-600'
    },
    {
      title: 'Pending Balance',
      value: `₹${(-stats.pendingBalance).toFixed(2)}`,
      icon: DollarSign,
      description: 'Outstanding payments',
      color: 'text-yellow-600'
    },
    {
      title: 'Today\'s Revenue',
      value: `₹${stats.todayRevenue.toFixed(2)}`,
      icon: TrendingUp,
      description: 'Payments received today',
      color: 'text-green-600'
    },
    {
      title: 'Lost Bottles',
      value: stats.lostBottles,
      icon: AlertTriangle,
      description: 'Bottles not returned (7+ days)',
      color: 'text-red-600'
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
        </div>
        
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="space-y-2">
                <div className="h-4 bg-muted rounded w-3/4"></div>
                <div className="h-8 bg-muted rounded w-1/2"></div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card
              key={index}
              onClick={() => {
                if (stat.title === 'Bottles Out') {
                  navigate('/bottles?status=out');
                }
              }}
              className={
                'rounded-xl border-0 bg-gradient-to-r from-[#005f99] to-[#00c2cc] text-white shadow-lg transition hover:shadow-xl ' +
                (stat.title === 'Bottles Out' ? 'cursor-pointer' : '')
              }
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-white/90">
                  {stat.title}
                </CardTitle>
                <Icon className="h-7 w-7 text-white/90" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stat.value}</div>
                <p className="text-xs text-white/80">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      
    </div>
  );
};

export default Dashboard;