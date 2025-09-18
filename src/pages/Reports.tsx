import { useEffect, useMemo, useState } from 'react';
import { PageSkeleton, ListSkeleton } from '@/components/skeletons/PageSkeleton';
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

  // Auto-refresh when filters change (no need to click Apply)
  useEffect(() => {
    if (!user) return;
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, type]);

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
      const { data, error }: any = await q;
      if (error) throw error;
      setTxs((data || []) as Transaction[]);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  // Realtime refresh on transactions changes
  useEffect(() => {
    if (!user) return;
    let timeout: number | undefined;
    const schedule = () => {
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        fetchReport();
      }, 300);
    };
    const ch = supabase
      .channel('realtime-reports')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: `owner_user_id=eq.${user.id}` },
        (payload: any) => {
          const row: any = payload.new || payload.old;
          // Only refresh for current user
          if (row && row.owner_user_id === user.id) schedule();
        }
      )
      .subscribe();
    return () => {
      if (timeout) window.clearTimeout(timeout);
      supabase.removeChannel(ch);
    };
  }, [user?.id, from, to, type]);

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

  if (loading && txs.length === 0) {
    return <PageSkeleton showFilters cardCount={4} listRows={8} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Reports</h1>
        </div>
        <Button onClick={exportCSV} disabled={loading || txs.length === 0}>
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
      </div>

      {/* Filters Card */}
      <Card>
        <CardHeader className="pb-2 border-b border-sky-100">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Select a date range and transaction type</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
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
        </CardContent>
      </Card>

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
            <ListSkeleton rows={6} />
          ) : txs.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No data for selected filters.</div>
          ) : (
            <div className="space-y-2 max-h-[480px] overflow-auto">
              {txs.map(t => (
                <div
                  key={t.id}
                  className="grid grid-cols-4 gap-2 border border-sky-100 rounded-xl p-3 text-sm items-center bg-white"
                >
                  <div className="font-medium capitalize flex items-center gap-2">
                    {/* Status badge for type */}
                    <span className="hidden md:inline-block">
                      {t.transaction_type === 'delivery' ? (
                        <span className="inline-flex items-center rounded-full bg-[#38bdf8] text-white px-2 py-0.5 text-[10px] font-semibold">Delivery</span>
                      ) : t.transaction_type === 'payment' ? (
                        <span className="inline-flex items-center rounded-full bg-[#10b981] text-white px-2 py-0.5 text-[10px] font-semibold">Payment</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-[#f59e0b] text-white px-2 py-0.5 text-[10px] font-semibold">Return</span>
                      )}
                    </span>
                    <span className="md:hidden">{t.transaction_type}</span>
                  </div>
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
