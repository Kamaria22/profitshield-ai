import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Bell,
  ShieldAlert,
  Zap
} from 'lucide-react';

export default function AlertSummaryCards({ alerts = [] }) {
  const stats = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const pending = alerts.filter(a => a.status === 'pending');
    const resolved = alerts.filter(a => a.status === 'action_taken' || a.status === 'dismissed');
    const critical = alerts.filter(a => a.severity === 'critical' && a.status === 'pending');
    const high = alerts.filter(a => a.severity === 'high' && a.status === 'pending');
    
    const todayAlerts = alerts.filter(a => {
      if (!a.created_date) return false;
      try {
        const created = new Date(a.created_date);
        return !isNaN(created.getTime()) && created >= today;
      } catch {
        return false;
      }
    });

    const weekAlerts = alerts.filter(a => {
      if (!a.created_date) return false;
      try {
        const created = new Date(a.created_date);
        return !isNaN(created.getTime()) && created >= weekAgo;
      } catch {
        return false;
      }
    });

    // Resolution rate
    const total = alerts.length;
    const resolutionRate = total > 0 ? Math.round((resolved.length / total) * 100) : 100;

    // Average resolution time (mock calculation based on resolved alerts)
    let avgResolutionHours = 0;
    if (resolved.length > 0) {
      const resolvedWithTime = resolved.filter(a => a.reviewed_at && a.created_date);
      if (resolvedWithTime.length > 0) {
        const totalHours = resolvedWithTime.reduce((sum, a) => {
          const created = new Date(a.created_date);
          const reviewed = new Date(a.reviewed_at);
          return sum + (reviewed - created) / (1000 * 60 * 60);
        }, 0);
        avgResolutionHours = Math.round(totalHours / resolvedWithTime.length);
      }
    }

    return {
      pending: pending.length,
      resolved: resolved.length,
      critical: critical.length,
      high: high.length,
      todayCount: todayAlerts.length,
      weekCount: weekAlerts.length,
      total,
      resolutionRate,
      avgResolutionHours
    };
  }, [alerts]);

  const cards = [
    {
      label: 'Pending',
      value: stats.pending,
      icon: Clock,
      color: 'yellow',
      bgColor: 'bg-yellow-50',
      iconColor: 'text-yellow-600',
      valueColor: stats.pending > 0 ? 'text-yellow-600' : 'text-slate-900'
    },
    {
      label: 'Critical',
      value: stats.critical,
      icon: ShieldAlert,
      color: 'red',
      bgColor: 'bg-red-50',
      iconColor: 'text-red-600',
      valueColor: stats.critical > 0 ? 'text-red-600' : 'text-slate-900'
    },
    {
      label: 'High Priority',
      value: stats.high,
      icon: AlertTriangle,
      color: 'orange',
      bgColor: 'bg-orange-50',
      iconColor: 'text-orange-600',
      valueColor: stats.high > 0 ? 'text-orange-600' : 'text-slate-900'
    },
    {
      label: 'Resolved',
      value: stats.resolved,
      icon: CheckCircle,
      color: 'emerald',
      bgColor: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
      valueColor: 'text-emerald-600'
    },
    {
      label: 'Today',
      value: stats.todayCount,
      icon: Zap,
      color: 'blue',
      bgColor: 'bg-blue-50',
      iconColor: 'text-blue-600',
      valueColor: 'text-slate-900'
    },
    {
      label: 'This Week',
      value: stats.weekCount,
      icon: Bell,
      color: 'slate',
      bgColor: 'bg-slate-50',
      iconColor: 'text-slate-600',
      valueColor: 'text-slate-900'
    }
  ];

  return (
    <div className="space-y-4">
      {/* Main stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 ${card.bgColor} rounded-lg`}>
                    <Icon className={`w-5 h-5 ${card.iconColor}`} />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">{card.label}</p>
                    <p className={`text-xl font-bold ${card.valueColor}`}>{card.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Resolution rate bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">Resolution Rate</span>
            <span className="text-sm font-semibold text-emerald-600">{stats.resolutionRate}%</span>
          </div>
          <Progress value={stats.resolutionRate} className="h-2" />
          <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
            <span>{stats.resolved} resolved</span>
            <span>{stats.pending} pending</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}