// @ts-nocheck
import React, { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, isWithinInterval, parseISO, subDays } from 'date-fns';
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock3,
  Download,
  ExternalLink,
  Loader2,
  Search,
  ShieldAlert,
  Siren,
  Sparkles,
  Store,
} from 'lucide-react';
import { toast } from 'sonner';

import { base44 } from '@/api/base44Client';
import { invokeWithRetry } from '@/lib/safeApi';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  CommandCard,
  CommandCardContent,
  CommandCardDescription,
  CommandCardHeader,
  CommandCardTitle,
} from '@/components/ui/command-card';
import {
  usePlatformResolver,
  RESOLVER_STATUS,
  requireResolved,
  canQueryTenant,
  getTenantFilter,
  buildQueryKey,
} from '@/components/usePlatformResolver';
import { createPageUrl } from '@/components/platformContext';

import AlertTrendsChart from '../components/alerts/AlertTrendsChart';

const severityWeight = { critical: 0, high: 1, medium: 2, low: 3 };

const severityStyle = {
  critical: {
    badge: 'border-red-400/30 bg-red-500/15 text-red-200',
    row: 'border-red-500/30 bg-red-500/[0.06]',
    label: 'Critical',
  },
  high: {
    badge: 'border-orange-400/30 bg-orange-500/15 text-orange-200',
    row: 'border-orange-500/30 bg-orange-500/[0.05]',
    label: 'High',
  },
  medium: {
    badge: 'border-amber-400/20 bg-amber-500/10 text-amber-100',
    row: 'border-amber-500/20 bg-amber-500/[0.04]',
    label: 'Medium',
  },
  low: {
    badge: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100',
    row: 'border-emerald-500/20 bg-emerald-500/[0.04]',
    label: 'Low',
  },
};

const kpiCards = [
  {
    id: 'pending',
    label: 'Pending',
    accent: 'neutral',
    icon: Clock3,
    getValue: (stats) => stats.pending,
    getSubtext: (stats) => `${stats.immediateCount} require action`,
  },
  {
    id: 'critical',
    label: 'Critical',
    accent: 'critical',
    icon: Siren,
    getValue: (stats) => stats.critical,
    getSubtext: () => 'Immediate attention',
  },
  {
    id: 'high',
    label: 'High Priority',
    accent: 'high',
    icon: ShieldAlert,
    getValue: (stats) => stats.high,
    getSubtext: () => 'Review before fulfill',
  },
  {
    id: 'resolved',
    label: 'Resolved',
    accent: 'resolved',
    icon: CheckCircle,
    getValue: (stats) => stats.resolved,
    getSubtext: (stats) => `${stats.autoPrevented} auto-protected`,
  },
];

function parseNumberLike(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatCurrency(value) {
  const amount = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function getAlertImpact(alert) {
  const directFields = [
    alert?.impact_amount,
    alert?.potential_loss_amount,
    alert?.estimated_loss_amount,
    alert?.estimated_impact_amount,
    alert?.impact_value,
    alert?.amount_at_risk,
  ];
  for (const candidate of directFields) {
    const value = parseNumberLike(candidate);
    if (Number.isFinite(value)) return value;
  }

  const financialFields = [
    alert?.financial_impact?.net_loss,
    alert?.financial_impact?.original_value,
    alert?.financial_impact?.amount,
  ];
  for (const candidate of financialFields) {
    const value = parseNumberLike(candidate);
    if (Number.isFinite(value)) return value;
  }

  return 0;
}

function getAlertAction(alert) {
  if (alert?.recommended_action) {
    return String(alert.recommended_action)
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  switch (alert?.type || alert?.alert_type) {
    case 'high_risk_order':
    case 'fraud_detected':
      return 'Review before fulfillment';
    case 'negative_margin':
      return 'Inspect pricing and costs';
    case 'shipping_loss':
      return 'Check shipping rules';
    case 'chargeback_warning':
      return 'Verify order evidence';
    default:
      return 'Investigate and confirm next step';
  }
}

function getSeverity(alert) {
  return alert?.severity || 'medium';
}

function getStatusLabel(status) {
  if (status === 'action_taken') return 'Resolved';
  if (status === 'dismissed') return 'Ignored';
  if (status === 'reviewed') return 'Snoozed';
  return 'Pending';
}

function exportAlertsCsv(rows) {
  const headers = ['title', 'severity', 'status', 'impact', 'recommended_action', 'created_date'];
  const csv = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((key) => {
          const raw = key === 'impact' ? getAlertImpact(row) : row?.[key] ?? '';
          return `"${String(raw).replace(/"/g, '""')}"`;
        })
        .join(',')
    ),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'profitshield-alerts.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function Alerts() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('pending');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [sortBy, setSortBy] = useState('priority');
  const [expandedAlertId, setExpandedAlertId] = useState(null);
  const [dateRange, setDateRange] = useState({ from: subDays(new Date(), 30), to: new Date() });

  const resolver = usePlatformResolver();
  const resolverCheck = requireResolved(resolver);
  const canQuery = canQueryTenant(resolverCheck);
  const queryFilter = getTenantFilter(resolverCheck);
  const alertsQueryKey = buildQueryKey('alerts', resolverCheck);

  const status = resolver?.status || RESOLVER_STATUS.RESOLVING;
  const user = resolver?.user || null;
  const resolverLoading = status === RESOLVER_STATUS.RESOLVING;

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: alertsQueryKey,
    queryFn: async () => {
      if (!queryFilter?.tenant_id) return [];
      return base44.entities.Alert.filter({ tenant_id: queryFilter.tenant_id }, '-created_date', 500);
    },
    enabled: canQuery,
  });

  const updateAlertMutation = useMutation({
    mutationFn: async ({ id, nextStatus }) => {
      await base44.entities.Alert.update(id, {
        status: nextStatus,
        reviewed_by: user?.email,
        reviewed_at: new Date().toISOString(),
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: alertsQueryKey });
      const label =
        variables.nextStatus === 'action_taken'
          ? 'Alert resolved'
          : variables.nextStatus === 'dismissed'
            ? 'Alert ignored'
            : 'Alert snoozed';
      toast.success(label);
    },
    onError: () => {
      toast.error('Unable to update alert');
    },
  });

  const runScanMutation = useMutation({
    mutationFn: async () => {
      return invokeWithRetry('checkProfitAlerts', { tenant_id: queryFilter?.tenant_id }, { attempts: 2, baseMs: 300 });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertsQueryKey });
      toast.success('AI scan started');
    },
    onError: () => {
      toast.error('Unable to start AI scan');
    },
  });

  const stats = useMemo(() => {
    const pendingAlerts = alerts.filter((alert) => alert.status === 'pending');
    const resolvedAlerts = alerts.filter((alert) => alert.status === 'action_taken' || alert.status === 'dismissed');
    const criticalAlerts = pendingAlerts.filter((alert) => getSeverity(alert) === 'critical');
    const highAlerts = pendingAlerts.filter((alert) => getSeverity(alert) === 'high');
    const unresolvedImpact = pendingAlerts.reduce((sum, alert) => sum + Math.max(0, getAlertImpact(alert)), 0);
    const autoPrevented = alerts.filter((alert) => alert.status === 'action_taken').length;
    const immediateCount = pendingAlerts.filter((alert) => ['critical', 'high'].includes(getSeverity(alert))).length;

    return {
      pending: pendingAlerts.length,
      resolved: resolvedAlerts.length,
      critical: criticalAlerts.length,
      high: highAlerts.length,
      unresolvedImpact,
      autoPrevented,
      immediateCount,
    };
  }, [alerts]);

  const immediateActions = useMemo(() => {
    return alerts
      .filter((alert) => alert.status === 'pending')
      .sort((a, b) => {
        const bySeverity = (severityWeight[getSeverity(a)] ?? 99) - (severityWeight[getSeverity(b)] ?? 99);
        if (bySeverity !== 0) return bySeverity;
        return new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime();
      })
      .slice(0, 5);
  }, [alerts]);

  const filteredAlerts = useMemo(() => {
    let result = [...alerts];

    if (activeFilter === 'pending') {
      result = result.filter((alert) => alert.status === 'pending');
    } else if (activeFilter === 'resolved') {
      result = result.filter((alert) => ['action_taken', 'dismissed'].includes(alert.status));
    } else if (activeFilter === 'critical') {
      result = result.filter((alert) => alert.status === 'pending' && getSeverity(alert) === 'critical');
    } else if (activeFilter === 'high') {
      result = result.filter((alert) => alert.status === 'pending' && getSeverity(alert) === 'high');
    }

    if (severityFilter !== 'all') {
      result = result.filter((alert) => getSeverity(alert) === severityFilter);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      result = result.filter((alert) =>
        [
          alert.title,
          alert.message,
          alert.order_number,
          alert.customer_email,
          alert.recommended_action,
          alert.type,
          alert.alert_type,
        ]
          .map((value) => String(value || '').toLowerCase())
          .some((value) => value.includes(term))
      );
    }

    if (dateRange?.from && dateRange?.to) {
      result = result.filter((alert) => {
        if (!alert.created_date) return true;
        try {
          return isWithinInterval(parseISO(alert.created_date), { start: dateRange.from, end: dateRange.to });
        } catch {
          return true;
        }
      });
    }

    result.sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime();
      }
      if (sortBy === 'impact') {
        return getAlertImpact(b) - getAlertImpact(a);
      }
      const bySeverity = (severityWeight[getSeverity(a)] ?? 99) - (severityWeight[getSeverity(b)] ?? 99);
      if (bySeverity !== 0) return bySeverity;
      return new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime();
    });

    return result;
  }, [alerts, activeFilter, severityFilter, searchTerm, dateRange, sortBy]);

  const hasPendingAlerts = stats.pending > 0;

  const handleKpiClick = (filterId) => {
    setActiveFilter(filterId);
    if (filterId === 'critical') {
      setSeverityFilter('critical');
    } else if (filterId === 'high') {
      setSeverityFilter('high');
    } else if (filterId === 'resolved') {
      setSeverityFilter('all');
    } else if (filterId === 'pending') {
      setSeverityFilter('all');
    }
  };

  const handleAlertStatus = (id, nextStatus) => {
    updateAlertMutation.mutate({ id, nextStatus });
  };

  if (resolverLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!canQuery || status === RESOLVER_STATUS.ERROR) {
    return (
      <div className="space-y-4">
        <CommandCard className="border-amber-500/20 bg-amber-500/5">
          <CommandCardContent className="py-10 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15">
              <AlertTriangle className="h-6 w-6 text-amber-300" />
            </div>
            <h2 className="text-xl font-semibold text-slate-100">No Store Connected</h2>
            <p className="mt-2 text-sm text-slate-400">Connect your store to monitor live profit protection alerts.</p>
            <Link to={createPageUrl('Integrations', location.search)}>
              <Button className="mt-4 gap-2">
                <Store className="h-4 w-4" />
                Connect Store
              </Button>
            </Link>
          </CommandCardContent>
        </CommandCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Alerts</h1>
          <p className="mt-1 text-sm text-slate-400">Profit protection command center for live risk, action, and resolution.</p>
        </div>
        <Button
          onClick={() => runScanMutation.mutate()}
          disabled={runScanMutation.isPending}
          className="gap-2"
        >
          {runScanMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Run AI Scan
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          const isActive = activeFilter === card.id;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => handleKpiClick(card.id)}
              className={cn(
                'text-left',
                card.accent === 'critical' && isActive && 'animate-pulse'
              )}
            >
              <CommandCard
                className={cn(
                  'h-full border-white/10 p-0 transition-all duration-150 hover:border-cyan-300/30 hover:bg-white/[0.055]',
                  isActive && 'border-cyan-300/45 bg-white/[0.065] shadow-[0_0_0_1px_rgba(34,211,238,0.18)]',
                  card.accent === 'critical' && 'border-red-500/20',
                  card.accent === 'critical' && isActive && 'shadow-[0_0_0_1px_rgba(239,68,68,0.22)]',
                  card.accent === 'high' && isActive && 'shadow-[0_0_0_1px_rgba(249,115,22,0.22)]'
                )}
              >
                <CommandCardContent className="flex min-h-[94px] items-center gap-3 px-4 py-3">
                  <div className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.045]',
                    card.accent === 'critical' && 'text-red-300',
                    card.accent === 'high' && 'text-orange-300',
                    card.accent === 'resolved' && 'text-emerald-300',
                    card.accent === 'neutral' && 'text-slate-200'
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{card.label}</div>
                    <div className="mt-1 text-2xl font-semibold text-slate-50">{card.getValue(stats)}</div>
                    <div className="mt-1 text-xs text-slate-400">{card.getSubtext(stats)}</div>
                  </div>
                </CommandCardContent>
              </CommandCard>
            </button>
          );
        })}
      </div>

      <CommandCard className="border-red-500/20 bg-gradient-to-r from-red-500/[0.06] via-transparent to-transparent">
        <CommandCardContent className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Immediate Actions</div>
            <div className="mt-1 text-base font-semibold text-slate-100">
              {stats.immediateCount > 0 ? `${stats.immediateCount} alerts require immediate action` : 'No active profit risks detected'}
            </div>
            <div className="mt-1 text-sm text-slate-400">
              {stats.unresolvedImpact > 0
                ? `${formatCurrency(stats.unresolvedImpact)} at risk from unresolved alerts`
                : 'Real-time monitoring is active across live orders and sync events.'}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="border-white/10 bg-white/[0.03]"
              onClick={() => setActiveFilter('pending')}
            >
              Review Queue
            </Button>
            <Button onClick={() => runScanMutation.mutate()} disabled={runScanMutation.isPending}>
              Refresh Signals
            </Button>
          </div>
        </CommandCardContent>
      </CommandCard>

      {immediateActions.length > 0 && (
        <CommandCard>
          <CommandCardHeader className="pb-2">
            <CommandCardTitle>Immediate Actions</CommandCardTitle>
            <CommandCardDescription>Top issues that need a merchant decision now.</CommandCardDescription>
          </CommandCardHeader>
          <CommandCardContent className="space-y-2">
            {immediateActions.map((alert) => {
              const impact = getAlertImpact(alert);
              const style = severityStyle[getSeverity(alert)] || severityStyle.medium;
              return (
                <div
                  key={alert.id}
                  className={cn('rounded-xl border px-3 py-3', style.row)}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge className={cn('border text-[11px]', style.badge)}>{style.label}</Badge>
                        <span className="truncate text-sm font-medium text-slate-100">{alert.title}</span>
                      </div>
                      <div className="mt-1 text-sm text-slate-400">{alert.message || 'Review this alert before it impacts margin or fulfillment.'}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                        <span>Impact {impact > 0 ? formatCurrency(impact) : 'Risk watch'}</span>
                        <span>Suggested action: {getAlertAction(alert)}</span>
                        <span>{alert.created_date ? format(new Date(alert.created_date), 'MMM d, h:mm a') : 'Recent'}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => handleAlertStatus(alert.id, 'action_taken')}>Fix Now</Button>
                      <Button size="sm" variant="outline" onClick={() => handleAlertStatus(alert.id, 'reviewed')}>Investigate</Button>
                      <Button size="sm" variant="ghost" onClick={() => handleAlertStatus(alert.id, 'dismissed')}>Ignore</Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </CommandCardContent>
        </CommandCard>
      )}

      <div className="sticky top-[72px] z-20">
        <CommandCard className="border-white/10 bg-slate-950/85 backdrop-blur">
          <CommandCardContent className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search order #, email, issue"
                className="h-10 border-white/10 bg-white/[0.04] pl-9 text-slate-100 placeholder:text-slate-500"
              />
            </div>
            <Button variant="outline" className="border-white/10 bg-white/[0.04]">
              Find
            </Button>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="h-10 w-full border-white/10 bg-white/[0.04] lg:w-[150px]">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All risks</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-10 w-full border-white/10 bg-white/[0.04] lg:w-[170px]">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="priority">Priority first</SelectItem>
                <SelectItem value="impact">Highest impact</SelectItem>
                <SelectItem value="newest">Newest first</SelectItem>
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-10 border-white/10 bg-white/[0.04] justify-start">
                  <Calendar className="mr-2 h-4 w-4" />
                  {dateRange.from && dateRange.to
                    ? `${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d')}`
                    : 'Date range'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <CalendarComponent
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange.from}
                  selected={dateRange}
                  onSelect={(range) => setDateRange(range || { from: subDays(new Date(), 30), to: new Date() })}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
            <Button variant="outline" className="h-10 border-white/10 bg-white/[0.04]" onClick={() => exportAlertsCsv(filteredAlerts)}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </CommandCardContent>
        </CommandCard>
      </div>

      <CommandCard>
        <CommandCardHeader className="pb-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CommandCardTitle>Alert Queue</CommandCardTitle>
              <CommandCardDescription>
                {filteredAlerts.length} of {alerts.length} alerts visible
              </CommandCardDescription>
            </div>
            <div className="text-xs text-slate-500">Status → Control → Resolution</div>
          </div>
        </CommandCardHeader>
        <CommandCardContent className="space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, index) => (
                <div key={index} className="h-[88px] animate-pulse rounded-xl border border-white/10 bg-white/[0.03]" />
              ))}
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-emerald-400/20 bg-emerald-500/[0.04] px-4 py-10 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                <ShieldAlert className="h-6 w-6 text-emerald-300" />
              </div>
              <div className="text-lg font-semibold text-slate-100">
                {hasPendingAlerts || searchTerm || severityFilter !== 'all'
                  ? 'No alerts match the current view'
                  : 'No active profit risks detected'}
              </div>
              <div className="mt-2 text-sm text-slate-400">
                {hasPendingAlerts || searchTerm || severityFilter !== 'all'
                  ? 'Adjust the queue filters or review past alerts.'
                  : 'Monitoring is active and no unresolved profit risks are currently open.'}
              </div>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button onClick={() => runScanMutation.mutate()} disabled={runScanMutation.isPending}>
                  Run AI Scan
                </Button>
                <Button variant="outline" className="border-white/10 bg-white/[0.04]" onClick={() => setActiveFilter('resolved')}>
                  View Past Alerts
                </Button>
              </div>
            </div>
          ) : (
            filteredAlerts.map((alert) => {
              const impact = getAlertImpact(alert);
              const style = severityStyle[getSeverity(alert)] || severityStyle.medium;
              const isExpanded = expandedAlertId === alert.id;
              return (
                <div
                  key={alert.id}
                  className={cn('rounded-xl border px-4 py-3 transition-colors', style.row)}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={cn('border text-[11px]', style.badge)}>{style.label}</Badge>
                        <span className="text-sm font-medium text-slate-100">{alert.title}</span>
                        <span className="text-xs text-slate-500">{getStatusLabel(alert.status)}</span>
                      </div>
                      <div className="mt-1 text-sm text-slate-400">{alert.message || 'No additional description available.'}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                        <span>Impact {impact > 0 ? formatCurrency(impact) : 'Risk watch'}</span>
                        <span>{alert.created_date ? format(new Date(alert.created_date), 'MMM d, h:mm a') : 'Recent'}</span>
                        <span>{getAlertAction(alert)}</span>
                      </div>
                      {isExpanded && (
                        <div className="mt-3 rounded-lg border border-white/10 bg-black/10 px-3 py-3 text-sm text-slate-300">
                          <div><span className="text-slate-500">Suggested next step:</span> {getAlertAction(alert)}</div>
                          {alert.order_number && <div className="mt-1"><span className="text-slate-500">Order:</span> #{alert.order_number}</div>}
                          {alert.customer_email && <div className="mt-1"><span className="text-slate-500">Customer:</span> {alert.customer_email}</div>}
                          {(alert.type || alert.alert_type) && <div className="mt-1"><span className="text-slate-500">Signal:</span> {alert.type || alert.alert_type}</div>}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      {alert.status === 'pending' && (
                        <>
                          <Button size="sm" onClick={() => handleAlertStatus(alert.id, 'action_taken')}>Resolve</Button>
                          <Button size="sm" variant="outline" className="border-white/10 bg-white/[0.04]" onClick={() => handleAlertStatus(alert.id, 'reviewed')}>Snooze</Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpandedAlertId(isExpanded ? null : alert.id)}
                      >
                        {isExpanded ? 'Hide Details' : 'View Details'}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CommandCardContent>
      </CommandCard>

      <AlertTrendsChart alerts={alerts} />

      <CommandCard className="border-white/8 bg-white/[0.03]">
        <CommandCardContent className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Auto-Protection Status</div>
            <div className="mt-1 text-base font-semibold text-slate-100">{stats.autoPrevented} issues automatically prevented</div>
            <div className="mt-1 text-sm text-slate-400">Real-time monitoring active across alerts, orders, and sync health.</div>
          </div>
          <Link to={createPageUrl('Integrations', location.search)} className="w-full md:w-auto">
            <Button variant="outline" className="w-full border-white/10 bg-white/[0.04] md:w-auto">
              Review Protection Setup
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </CommandCardContent>
      </CommandCard>
    </div>
  );
}
