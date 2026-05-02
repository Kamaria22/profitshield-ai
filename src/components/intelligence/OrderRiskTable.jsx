import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  Zap
} from 'lucide-react';
import { CommandCard, CommandCardContent } from '@/components/ui/command-card';

const DATE_OPTIONS = [
  { label: 'Last 7 days', value: '7' },
  { label: 'Last 30 days', value: '30' },
  { label: 'Last 90 days', value: '90' },
  { label: 'Last year', value: '365' },
];

const RISK_OPTIONS = [
  { label: 'All', value: 'all' },
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' },
];

function getRiskClasses(level, active = false) {
  if (level === 'high') {
    return active
      ? 'border-red-400/40 bg-red-400/14 text-red-200 shadow-[0_0_0_1px_rgba(248,113,113,0.15)]'
      : 'border-red-400/20 bg-red-400/10 text-red-300';
  }
  if (level === 'medium') {
    return active
      ? 'border-amber-400/40 bg-amber-400/14 text-amber-200 shadow-[0_0_0_1px_rgba(251,191,36,0.15)]'
      : 'border-amber-400/20 bg-amber-400/10 text-amber-300';
  }
  return active
    ? 'border-emerald-400/40 bg-emerald-400/14 text-emerald-200 shadow-[0_0_0_1px_rgba(52,211,153,0.15)]'
    : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300';
}

function getRowClasses(level) {
  if (level === 'high') return 'border-l-2 border-l-red-400 bg-red-400/[0.04] hover:bg-red-400/[0.08]';
  if (level === 'medium') return 'border-l-2 border-l-amber-400 bg-amber-400/[0.03] hover:bg-amber-400/[0.07]';
  return 'border-l-2 border-l-emerald-400/70 bg-emerald-400/[0.02] hover:bg-emerald-400/[0.05]';
}

function getScoreTone(score) {
  if (score >= 71) {
    return {
      label: 'High Risk',
      sublabel: '71–100',
      bar: 'from-amber-400 via-red-400 to-red-500',
      text: 'text-red-300'
    };
  }
  if (score >= 31) {
    return {
      label: 'Watch',
      sublabel: '31–70',
      bar: 'from-emerald-400 via-amber-400 to-amber-500',
      text: 'text-amber-300'
    };
  }
  return {
    label: 'Safe',
    sublabel: '0–30',
    bar: 'from-emerald-400 to-emerald-500',
    text: 'text-emerald-300'
  };
}

function getAiState(order) {
  const score = Number(order?.fraud_score ?? 0);
  const riskLevel = String(order?.risk_level || '').toLowerCase();
  const hasReasons = (order?.risk_reasons || []).length > 0;

  if (riskLevel === 'high' || score >= 71) {
    return { label: 'High Risk', className: 'border-red-400/20 bg-red-400/10 text-red-300' };
  }
  if (String(order?.recommended_action || '') !== 'none' && String(order?.recommended_action || '') !== '') {
    return { label: 'Flagged', className: 'border-orange-400/20 bg-orange-400/10 text-orange-300' };
  }
  if (riskLevel === 'medium' || score >= 31 || hasReasons) {
    return { label: 'Review', className: 'border-amber-400/20 bg-amber-400/10 text-amber-300' };
  }
  return { label: 'Safe', className: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' };
}

function ScoreMeter({ score }) {
  const tone = getScoreTone(score);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="w-[148px]">
            <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
              <span>25</span>
              <span>50</span>
              <span>75</span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div className={`h-full rounded-full bg-gradient-to-r ${tone.bar}`} style={{ width: `${Math.min(Math.max(score, 0), 100)}%` }} />
              <div className="absolute inset-y-0 left-1/4 w-px bg-slate-900/70" />
              <div className="absolute inset-y-0 left-1/2 w-px bg-slate-900/70" />
              <div className="absolute inset-y-0 left-3/4 w-px bg-slate-900/70" />
            </div>
            <div className={`mt-1 flex items-center justify-between text-xs ${tone.text}`}>
              <span className="font-medium">{tone.label}</span>
              <span className="font-mono">{score}</span>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent className="border-white/10 bg-slate-950 text-slate-100">
          <p>{tone.label}</p>
          <p className="text-xs text-slate-400">{tone.sublabel}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function OrderRow({ order }) {
  const [expanded, setExpanded] = useState(false);
  const fraudScore = Number(order.fraud_score ?? 0);
  const riskLevel = order.risk_level || 'low';
  const reasons = order.risk_reasons || [];
  const aiState = getAiState(order);

  return (
    <>
      <tr
        className={`cursor-pointer border-b border-white/8 transition-colors ${getRowClasses(riskLevel)}`}
        onClick={() => setExpanded((value) => !value)}
      >
        <td className="px-4 py-3 text-sm font-medium text-slate-100">
          <div className="flex items-center gap-2">
            #{order.order_number || order.platform_order_id}
            {riskLevel === 'high' && <AlertTriangle className="h-4 w-4 text-red-400" />}
          </div>
        </td>
        <td className="hidden px-4 py-3 text-sm text-slate-400 md:table-cell">
          {order.customer_email || '—'}
        </td>
        <td className="hidden px-4 py-3 text-sm text-slate-300 sm:table-cell">
          ${(order.total_revenue || 0).toFixed(2)}
        </td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${getRiskClasses(riskLevel)}`}>
            {riskLevel}
          </span>
        </td>
        <td className="px-4 py-3">
          <ScoreMeter score={fraudScore} />
        </td>
        <td className="px-4 py-3">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-medium ${aiState.className}`}>
                  {aiState.label}
                </span>
              </TooltipTrigger>
              <TooltipContent className="border-white/10 bg-slate-950 text-slate-100">
                <p>Open this order row for risk factors and recommended action.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </td>
        <td className="hidden px-4 py-3 text-xs text-slate-500 lg:table-cell">
          {order.order_date ? format(new Date(order.order_date), 'MMM d, yyyy') : '—'}
        </td>
        <td className="px-4 py-3 text-slate-500">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-950/45">
          <td colSpan={8} className="px-4 py-3">
            <div className="grid gap-4 sm:grid-cols-3 text-xs">
              <div>
                <p className="mb-1 text-slate-500">Fraud Score</p>
                <ScoreMeter score={order.fraud_score ?? 0} />
              </div>
              <div>
                <p className="mb-1 text-slate-500">Return Score</p>
                <ScoreMeter score={order.return_score ?? 0} />
              </div>
              <div>
                <p className="mb-1 text-slate-500">Chargeback Score</p>
                <ScoreMeter score={order.chargeback_score ?? 0} />
              </div>
            </div>
            {reasons.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-xs text-slate-500">Risk Factors</p>
                <div className="flex flex-wrap gap-1.5">
                  {reasons.map((reason, index) => (
                    <span key={index} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-xs text-slate-300">
                      {reason}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {order.recommended_action && order.recommended_action !== 'none' && (
              <div className="mt-3 text-xs">
                <span className="text-slate-500">Recommended action: </span>
                <span className="font-medium capitalize text-amber-300">{order.recommended_action}</span>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function OrderRiskTable({ tenantId }) {
  const [cardFilter, setCardFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [dateRange, setDateRange] = useState('30');
  const [searchTerm, setSearchTerm] = useState('');
  const [backfilling, setBackfilling] = useState(false);

  const { data: allOrders = [], isLoading, refetch } = useQuery({
    queryKey: ['riskOrders', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const results = await base44.entities.Order.filter({ tenant_id: tenantId, is_demo: false }, '-order_date', 200);
      return results.filter((order) => order.fraud_score !== null && order.fraud_score !== undefined);
    },
    enabled: !!tenantId,
    refetchInterval: 30000,
  });

  const { data: allTenantOrders = [] } = useQuery({
    queryKey: ['allOrdersCount', tenantId],
    queryFn: () =>
      tenantId
        ? base44.entities.Order.filter({ tenant_id: tenantId, is_demo: false }, '-order_date', 200)
        : [],
    enabled: !!tenantId,
  });

  const unscored = allTenantOrders.filter((order) => order.fraud_score === null || order.fraud_score === undefined).length;

  const filteredOrders = useMemo(() => {
    const effectiveRisk = riskFilter !== 'all' ? riskFilter : cardFilter;
    const cutoff = subDays(new Date(), Number(dateRange) || 30);

    return allOrders.filter((order) => {
      if (effectiveRisk !== 'all' && order.risk_level !== effectiveRisk) return false;
      if (order.order_date && new Date(order.order_date) < cutoff) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const haystack = [
          String(order.order_number || ''),
          String(order.platform_order_id || ''),
          String(order.customer_email || ''),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [allOrders, cardFilter, riskFilter, dateRange, searchTerm]);

  const highCount = allTenantOrders.filter((order) => order.risk_level === 'high').length;
  const medCount = allTenantOrders.filter((order) => order.risk_level === 'medium').length;
  const lowCount = allTenantOrders.filter((order) => order.risk_level === 'low').length;
  const actionableHigh = filteredOrders.filter((order) => order.risk_level === 'high').length;
  const actionableFlagged = filteredOrders.filter((order) => {
    const state = getAiState(order);
    return state.label === 'Flagged' || state.label === 'Review' || state.label === 'High Risk';
  }).length;

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
    } catch (error) {
      toast.error(`Backfill failed: ${error.message}`);
    } finally {
      setBackfilling(false);
    }
  };

  const handleExport = () => {
    const headers = ['Order', 'Customer', 'Revenue', 'Risk Level', 'Fraud Score', 'AI Status', 'Date'];
    const rows = filteredOrders.map((order) => [
      order.order_number || order.platform_order_id || '',
      order.customer_email || '',
      Number(order.total_revenue || 0).toFixed(2),
      order.risk_level || '',
      order.fraud_score ?? '',
      getAiState(order).label,
      order.order_date ? new Date(order.order_date).toLocaleDateString() : '',
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `risk-intelligence-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'High Risk', count: highCount, value: 'high' },
          { label: 'Medium Risk', count: medCount, value: 'medium' },
          { label: 'Low Risk', count: lowCount, value: 'low' },
        ].map((item) => {
          const active = cardFilter === item.value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                setCardFilter((current) => (current === item.value ? 'all' : item.value));
                setRiskFilter('all');
              }}
              className={`rounded-xl border px-4 py-3 text-left transition-all ${getRiskClasses(item.value, active)}`}
            >
              <p className="text-[11px] uppercase tracking-[0.18em] opacity-80">{item.label}</p>
              <p className="mt-1 text-2xl font-bold">{item.count}</p>
            </button>
          );
        })}
      </div>

      <CommandCard className="border-cyan-400/20 bg-[linear-gradient(180deg,rgba(0,229,255,0.07),rgba(255,255,255,0.03))]">
        <CommandCardContent className="px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 p-2">
                <Shield className="h-4 w-4 text-cyan-300" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-100">{actionableHigh} high-risk orders need review</p>
                <p className="mt-1 text-sm text-slate-400">{actionableFlagged} flagged orders are currently pending attention</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {unscored > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBackfill}
                  disabled={backfilling}
                  className="border-amber-400/20 bg-amber-400/10 text-amber-300 hover:bg-amber-400/15"
                >
                  {backfilling ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Zap className="mr-2 h-3 w-3" />}
                  Score All
                </Button>
              )}
              <Button
                size="sm"
                className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                onClick={() => {
                  setCardFilter('high');
                  setRiskFilter('all');
                }}
              >
                Review Now
              </Button>
            </div>
          </div>
        </CommandCardContent>
      </CommandCard>

      <CommandCard className="sticky top-[70px] z-20 border-white/10 bg-slate-950/90 shadow-[0_10px_30px_rgba(2,6,23,0.28)] backdrop-blur">
        <CommandCardContent className="px-3 py-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search order # or email..."
                className="h-10 border-white/10 bg-white/[0.03] pl-9 text-slate-100 placeholder:text-slate-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={riskFilter} onValueChange={setRiskFilter}>
                <SelectTrigger className="h-10 w-36 border-white/10 bg-white/[0.03] text-slate-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RISK_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="h-10 w-36 border-white/10 bg-white/[0.03] text-slate-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                className="h-10 border-white/10 bg-white/[0.03] text-slate-100 hover:bg-white/[0.05]"
                onClick={handleExport}
              >
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>

              <Button
                size="icon"
                variant="ghost"
                className="h-10 w-10 text-slate-400 hover:bg-white/[0.05] hover:text-slate-100"
                onClick={() => refetch()}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CommandCardContent>
      </CommandCard>

      <CommandCard className="overflow-hidden border-white/10 bg-white/[0.03]">
        <CommandCardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <Shield className="mx-auto mb-3 h-10 w-10 opacity-30" />
              <p className="font-medium">No scored orders found</p>
              <p className="mt-1 text-xs">Orders are scored automatically as they arrive via webhook</p>
              {unscored > 0 && (
                <Button
                  size="sm"
                  className="mt-4 bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                  onClick={handleBackfill}
                  disabled={backfilling}
                >
                  {backfilling ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
                  Score {unscored} existing orders
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/8 bg-white/[0.03]">
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Order</th>
                    <th className="hidden px-4 py-3 text-left text-xs font-medium text-slate-500 md:table-cell">Customer</th>
                    <th className="hidden px-4 py-3 text-left text-xs font-medium text-slate-500 sm:table-cell">Revenue</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Risk</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Fraud Score</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">AI Status</th>
                    <th className="hidden px-4 py-3 text-left text-xs font-medium text-slate-500 lg:table-cell">Date</th>
                    <th className="w-8 px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <OrderRow key={order.id} order={order} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CommandCardContent>
      </CommandCard>
    </div>
  );
}
