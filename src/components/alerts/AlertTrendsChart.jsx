import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { format, subDays, startOfDay, parseISO } from 'date-fns';

export default function AlertTrendsChart({ alerts = [] }) {
  const chartData = useMemo(() => {
    // Generate last 14 days
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const date = startOfDay(subDays(new Date(), i));
      days.push({
        date: format(date, 'yyyy-MM-dd'),
        label: format(date, 'MMM d'),
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        total: 0
      });
    }

    // Count alerts per day by severity
    alerts.forEach(alert => {
      if (!alert.created_date) return;
      const alertDate = format(startOfDay(parseISO(alert.created_date)), 'yyyy-MM-dd');
      const dayData = days.find(d => d.date === alertDate);
      if (dayData) {
        const severity = alert.severity || 'medium';
        if (dayData[severity] !== undefined) {
          dayData[severity]++;
        }
        dayData.total++;
      }
    });

    return days;
  }, [alerts]);

  const totalAlerts = chartData.reduce((sum, d) => sum + d.total, 0);
  const avgPerDay = (totalAlerts / 14).toFixed(1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            Alert Trends (14 Days)
          </CardTitle>
          <div className="text-sm text-slate-500">
            Avg: <span className="font-medium text-slate-700">{avgPerDay}/day</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="criticalGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#DC2626" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#DC2626" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="highGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#F59E0B" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="mediumGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="lowGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6B7280" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#6B7280" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis 
                dataKey="label" 
                tick={{ fontSize: 11, fill: '#64748B' }}
                axisLine={{ stroke: '#E2E8F0' }}
                tickLine={false}
              />
              <YAxis 
                tick={{ fontSize: 11, fill: '#64748B' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                }}
                labelStyle={{ fontWeight: 600, marginBottom: 4 }}
              />
              <Legend 
                iconType="circle" 
                iconSize={8}
                wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              />
              <Area 
                type="monotone" 
                dataKey="critical" 
                name="Critical"
                stackId="1"
                stroke="#DC2626" 
                fill="url(#criticalGrad)" 
                strokeWidth={2}
              />
              <Area 
                type="monotone" 
                dataKey="high" 
                name="High"
                stackId="1"
                stroke="#F59E0B" 
                fill="url(#highGrad)" 
                strokeWidth={2}
              />
              <Area 
                type="monotone" 
                dataKey="medium" 
                name="Medium"
                stackId="1"
                stroke="#3B82F6" 
                fill="url(#mediumGrad)" 
                strokeWidth={2}
              />
              <Area 
                type="monotone" 
                dataKey="low" 
                name="Low"
                stackId="1"
                stroke="#6B7280" 
                fill="url(#lowGrad)" 
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}