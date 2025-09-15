import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Download, Calendar, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface Transaction {
  id: string;
  customer_id: string;
  transaction_type: 'delivery' | 'payment' | 'return';
  quantity?: number | null;
  amount?: number | null;
  bottle_type?: 'normal' | 'cool' | null;
  transaction_date: string;
}

const Reports = () => {
  const [from, setFrom] = useState<string>(() => new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().slice(0, 10));
  const [to, setTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<'all' | 'delivery' | 'payment' | 'return'>('all');
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const startISO = new Date(`${from}T00:00:00`).toISOString();
      const endISO = new Date(`${to}T23:59:59`).toISOString();
      let q = supabase
        .from('transactions')
        .select('*')
        .eq('owner_user_id', user!.id)
        .gte('transaction_date', startISO)
        .lte('transaction_date', endISO)
        .order('transaction_date', { ascending: false });
      if (type !== 'all') q = q.eq('transaction_type', type);
      const { data, error } = await q;
      if (error) throw error;
      setTxs((data || []) as Transaction[]);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const summary = useMemo(() => {
    const s = {
      deliveries: 0,
      returns: 0,
      payments: 0,
      revenue: 0,
      bottlesDelivered: 0,
      bottlesReturned: 0,
    };
    for (const t of txs) {
      if (t.transaction_type === 'delivery') {
        s.deliveries += 1;
        s.bottlesDelivered += t.quantity || 0;
        s.revenue += t.amount || 0;
      } else if (t.transaction_type === 'return') {
        s.returns += 1;
        s.bottlesReturned += t.quantity || 0;
      } else if (t.transaction_type === 'payment') {
        s.payments += 1;
        s.revenue -= t.amount || 0; // payments reduce outstanding
      }
    }
    return s;
  }, [txs]);

  const exportCSV = () => {
    const headers = ['date', 'type', 'quantity', 'amount', 'bottle_type', 'customer_id'];
    const rows = txs.map(t => [
      new Date(t.transaction_date).toLocaleString(),
      t.transaction_type,
      t.quantity ?? '',
      t.amount ?? '',
      t.bottle_type ?? '',
      t.customer_id,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `report_${from}_to_${to}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Reports</h1>
          <p className="text-muted-foreground">Analyze deliveries, returns, and payments</p>
        </div>
        <Button onClick={exportCSV} disabled={loading || txs.length === 0}>
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
      </div>

      <div className="grid md:grid-cols-4 gap-4 items-end">
        <div>
          <label className="text-sm text-muted-foreground">From</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-sm text-muted-foreground">To</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Type</label>
          <Select value={type} onValueChange={(v: any) => setType(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="delivery">Delivery</SelectItem>
              <SelectItem value="payment">Payment</SelectItem>
              <SelectItem value="return">Return</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Button className="w-full" onClick={fetchReport} disabled={loading}>
            <Calendar className="h-4 w-4 mr-2" /> Apply
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Deliveries</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold flex items-center gap-2"><TrendingUp className="h-5 w-5" /> {summary.deliveries}</div>
            <CardDescription>{summary.bottlesDelivered} bottle(s)</CardDescription>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Returns</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold flex items-center gap-2"><TrendingDown className="h-5 w-5" /> {summary.returns}</div>
            <CardDescription>{summary.bottlesReturned} bottle(s)</CardDescription>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Payments</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold flex items-center gap-2"><Wallet className="h-5 w-5" /> {summary.payments}</div>
            <CardDescription>Payments recorded</CardDescription>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Net Revenue</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">₹{summary.revenue.toFixed(2)}</div>
            <CardDescription>Deliveries - Payments</CardDescription>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Transactions</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">Loading...</div>
          ) : txs.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No data for selected filters.</div>
          ) : (
            <div className="space-y-2 max-h-[480px] overflow-auto">
              {txs.map(t => (
                <div key={t.id} className="grid grid-cols-4 gap-2 border rounded p-2 text-sm items-center">
                  <div className="font-medium capitalize">{t.transaction_type}</div>
                  <div>{new Date(t.transaction_date).toLocaleString()}</div>
                  <div>{t.quantity ? `${t.quantity} bottle(s)` : '-'}</div>
                  <div>{typeof t.amount === 'number' ? `₹${t.amount.toFixed(2)}` : '-'}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Reports;
