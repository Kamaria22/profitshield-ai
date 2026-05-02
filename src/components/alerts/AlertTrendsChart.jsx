import React, { useMemo } from 'react';
import { format, parseISO, startOfDay, subDays } from 'date-fns';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import {
  CommandCard,
  CommandCardContent,
  CommandCardDescription,
  CommandCardHeader,
  CommandCardTitle,
} from '@/components/ui/command-card';

export default function AlertTrendsChart({ alerts = [] }) {
  const chartData = useMemo(() => {
    const days = [];
    for (let i = 13; i >= 0; i -= 1) {
      const date = startOfDay(subDays(new Date(), i));
      days.push({
        date: format(date, 'yyyy-MM-dd'),
        label: format(date, 'MMM d'),
        total: 0,
      });
    }

    alerts.forEach((alert) => {
      if (!alert.created_date) return;
      try {
        const alertDate = format(startOfDay(parseISO(alert.created_date)), 'yyyy-MM-dd');
        const bucket = days.find((day) => day.date === alertDate);
        if (bucket) bucket.total += 1;
      } catch {
        // Ignore malformed dates.
      }
    });

    return days;
  }, [alerts]);

  const totalAlerts = chartData.reduce((sum, day) => sum + day.total, 0);
  const maxDailyAlerts = chartData.reduce((max, day) => Math.max(max, day.total), 0);
  const hasMeaningfulTrend = totalAlerts > 1 && maxDailyAlerts > 0;

  if (!hasMeaningfulTrend) {
    return (
      <CommandCard className="border-white/8 bg-white/[0.03]">
        <CommandCardContent className="flex items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-medium text-slate-100">Alert Activity</div>
            <div className="text-sm text-slate-400">No alert activity in selected period</div>
          </div>
        </CommandCardContent>
      </CommandCard>
    );
  }

  return (
    <CommandCard className="border-white/8 bg-white/[0.03]">
      <CommandCardHeader className="pb-2">
        <CommandCardTitle className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-cyan-300" />
          Alert Activity
        </CommandCardTitle>
        <CommandCardDescription>Compact 14-day trend for recent alert volume.</CommandCardDescription>
      </CommandCardHeader>
      <CommandCardContent>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="alertTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: '12px',
                  color: '#e2e8f0',
                }}
                labelStyle={{ color: '#f8fafc', fontWeight: 600 }}
              />
              <Area
                type="monotone"
                dataKey="total"
                name="Alerts"
                stroke="#22d3ee"
                fill="url(#alertTrendFill)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CommandCardContent>
    </CommandCard>
  );
}
