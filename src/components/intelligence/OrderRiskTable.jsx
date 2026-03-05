import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Shield, AlertTriangle, RefreshCw, Loader2, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const RISK_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' },
];

function riskColor(level) {
  if (level === 'high') return 'bg-red-100 text-red-700 border-red-200';
  if (level === 'medium') return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-emerald-100 text-emerald-700 border-emerald-200';
}

function scoreBar(score) {
  const color = score >= 70 ? 'bg-red-500' : score >= 40 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(score, 100)}%` }} />
      </div>
      <span className="text-xs font-mono w-8 text-right">{score}</span>
    </div>
  );
}

function OrderRow({ order }) {
  const [expanded, setExpanded] = useState(false);
  const fraudScore = order.fraud_score ?? 0;
  const riskLevel = order.risk_level || 'low';
  const reasons = order.risk_reasons || [];

  return (
    <>
      <tr
        className="border-b border-slate-800/40 hover:bg-slate-800/30 cursor-pointer transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <td className="px-4 py-3 text-sm text-slate-200 font-medium">
          #{order.order_number || order.platform_order_id}
        </td>
        <td className="px-4 py-3 text-sm text-slate-400 hidden md:table-cell">
          {order.customer_email || '—'}
        </td>
        <td className="px-4 py-3 text-sm text-slate-300 hidden sm:table-cell">
          ${(order.total_revenue || 0).toFixed(2)}
        </td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${riskColor(riskLevel)}`}>
            {riskLevel.toUpperCase()}
          </span>
        </td>
        <td className="px-4 py-3 w-36">
          {scoreBar(fraudScore)}
        </td>
        <td className="px-4 py-3 text-xs text-slate-500 hidden lg:table-cell">
          {order.order_date ? format(new Date(order.order_date), 'MMM d, yyyy') : '—'}
        </td>
        <td className="px-4 py-3 text-slate-500">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-900/50">
          <td colSpan={7} className="px-4 py-3">
            <div className="grid sm:grid-cols-3 gap-4 text-xs">
              <div>
                <p className="text-slate-500 mb-1">Fraud Score</p>
                {scoreBar(order.fraud_score ?? 0)}
              </div>
              <div>
                <p className="text-slate-500 mb-1">Return Score</p>
                {scoreBar(order.return_score ?? 0)}
              </div>
              <div>
                <p className="text-slate-500 mb-1">Chargeback Score</p>
                {scoreBar(order.chargeback_score ?? 0)}
              </div>
            </div>
            {reasons.length > 0 && (
              <div className="mt-3">
                <p className="text-slate-500 text-xs mb-1">Risk Factors:</p>
                <div className="flex flex-wrap gap-1">
                  {reasons.map((r, i) => (
                    <span key={i} className="px-2 py-0.5 bg-slate-700 text-slate-300 rounded text-xs">{r}</span>
                  ))}
                </div>
              </div>
            )}
            {order.recommended_action && order.recommended_action !== 'none' && (
              <div className="mt-2 text-xs">
                <span className="text-slate-500">Recommended action: </span>
                <span className="text-amber-400 font-medium capitalize">{order.recommended_action}</span>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function OrderRiskTable({ tenantId }) {
  const [filter, setFilter] = useState('all');
  const [backfilling, setBackfilling] = useState(false);

  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ['riskOrders', tenantId, filter],
    queryFn: async () => {
      if (!tenantId) return [];
      const query = { tenant_id: tenantId, is_demo: false };
      if (filter !== 'all') query.risk_level = filter;
      const results = await base44.entities.Order.filter(query, '-order_date', 50);
      // Only show orders that have been risk-scored
      return results.filter(o => o.fraud_score !== null && o.fraud_score !== undefined);
    },
    enabled: !!tenantId,
    refetchInterval: 30000,
  });

  const { data: allOrders = [] } = useQuery({
    queryKey: ['allOrdersCount', tenantId],
    queryFn: () => tenantId
      ? base44.entities.Order.filter({ tenant_id: tenantId, is_demo: false }, '-order_date', 200)
      : [],
    enabled: !!tenantId,
  });

  const unscored = allOrders.filter(o => o.fraud_score === null || o.fraud_score === undefined).length;

  const handleBackfill = async () => {
    setBackfilling(true);
    try {
      const result = await base44.functions.invoke('riskEngine', {
        action: 'backfill',
        tenant_id: tenantId,
        limit: 50
      });
      toast.success(`Backfilled ${result.data?.scored ?? 0} orders`);
      refetch();
    } catch (e) {
      toast.error('Backfill failed: ' + e.message);
    } finally {
      setBackfilling(false);
    }
  };

  const highCount = allOrders.filter(o => o.risk_level === 'high').length;
  const medCount = allOrders.filter(o => o.risk_level === 'medium').length;
  const lowCount = allOrders.filter(o => o.risk_level === 'low').length;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'High Risk', count: highCount, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
          { label: 'Medium Risk', count: medCount, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
          { label: 'Low Risk', count: lowCount, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
        ].map(({ label, count, color, bg }) => (
          <div key={label} className={`rounded-xl border p-4 ${bg}`}>
            <p className="text-xs text-slate-500">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{count}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1">
          {RISK_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {unscored > 0 && (
            <span className="text-xs text-amber-400">{unscored} orders not yet scored</span>
          )}
          {unscored > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleBackfill}
              disabled={backfilling}
              className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
            >
              {backfilling ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Zap className="w-3 h-3 mr-1" />}
              Score All
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={refetch} className="text-slate-400">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No scored orders found</p>
              <p className="text-xs mt-1">Orders are scored automatically as they arrive via webhook</p>
              {unscored > 0 && (
                <Button
                  size="sm"
                  className="mt-4 bg-indigo-600 hover:bg-indigo-700"
                  onClick={handleBackfill}
                  disabled={backfilling}
                >
                  {backfilling ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                  Score {unscored} existing orders
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium">Order</th>
                    <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium hidden md:table-cell">Customer</th>
                    <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium hidden sm:table-cell">Revenue</th>
                    <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium">Risk Level</th>
                    <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium w-36">Fraud Score</th>
                    <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium hidden lg:table-cell">Date</th>
                    <th className="px-4 py-3 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {orders.map(order => (
                    <OrderRow key={order.id} order={order} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}