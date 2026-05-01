// @ts-nocheck
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer, ComposedChart, Bar
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { TrendingUp, BarChart3, Activity } from 'lucide-react';
import { CommandCard, CommandCardContent, CommandCardDescription, CommandCardHeader, CommandCardTitle } from '@/components/ui/command-card';

const formatCurrency = (value) => {
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value.toFixed(0)}`;
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/95 p-3 shadow-lg">
      <p className="mb-2 font-medium text-slate-100">
        {format(parseISO(label), 'MMM d, yyyy')}
      </p>
      {payload.map((entry, idx) => (
        <div key={idx} className="flex items-center justify-between gap-4 text-sm">
          <span style={{ color: entry.color }}>{entry.name}:</span>
          <span className="font-medium text-slate-100">{formatCurrency(entry.value)}</span>
        </div>
      ))}
    </div>
  );
};

export default function PnLTrendsChart({ data, granularity, embedded = false, compact = false }) {
  const [chartType, setChartType] = useState('area');
  const [showMetrics, setShowMetrics] = useState(['revenue', 'netProfit']);

  const toggleMetric = (metric) => {
    setShowMetrics(prev => 
      prev.includes(metric) 
        ? prev.filter(m => m !== metric)
        : [...prev, metric]
    );
  };

  const metrics = [
    { key: 'revenue', label: 'Revenue', color: '#3b82f6' },
    { key: 'grossProfit', label: 'Gross Profit', color: '#10b981' },
    { key: 'netProfit', label: 'Net Profit', color: '#8b5cf6' },
    { key: 'cogs', label: 'COGS', color: '#f59e0b' },
  ];

  const header = (
    <div className="flex items-center justify-between">
      <div>
        <CommandCardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-cyan-300" />
          Profit Trends
        </CommandCardTitle>
        <CommandCardDescription>
          {granularity.charAt(0).toUpperCase() + granularity.slice(1)} performance over time
        </CommandCardDescription>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
          <Button
            variant={chartType === 'area' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setChartType('area')}
            className="rounded-none border-0 text-slate-200"
          >
            <Activity className="w-4 h-4" />
          </Button>
          <Button
            variant={chartType === 'bar' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setChartType('bar')}
            className="rounded-none border-0 text-slate-200"
          >
            <BarChart3 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  const body = (
    <>
      <div className={`flex flex-wrap gap-2 ${embedded ? 'mb-4' : 'mt-4'}`}>
        {metrics.map(metric => (
          <Button
            key={metric.key}
            variant={showMetrics.includes(metric.key) ? 'default' : 'outline'}
            size="sm"
            onClick={() => toggleMetric(metric.key)}
            style={{
              backgroundColor: showMetrics.includes(metric.key) ? metric.color : undefined,
              borderColor: metric.color
            }}
            className="text-xs text-slate-100"
          >
            {metric.label}
          </Button>
        ))}
      </div>
      <div className={compact ? 'h-56' : 'h-80'}>
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'area' ? (
            <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                {metrics.map(metric => (
                  <linearGradient key={metric.key} id={`gradient-${metric.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={metric.color} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={metric.color} stopOpacity={0}/>
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.16)" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(val) => format(parseISO(val), granularity === 'monthly' ? 'MMM' : 'MMM d')}
                tick={{ fontSize: 12, fill: '#94a3b8' }}
                axisLine={{ stroke: 'rgba(148,163,184,0.18)' }}
                tickLine={{ stroke: 'rgba(148,163,184,0.18)' }}
              />
              <YAxis 
                tickFormatter={formatCurrency}
                tick={{ fontSize: 12, fill: '#94a3b8' }}
                axisLine={{ stroke: 'rgba(148,163,184,0.18)' }}
                tickLine={{ stroke: 'rgba(148,163,184,0.18)' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ color: '#cbd5e1' }} />
              {metrics.filter(m => showMetrics.includes(m.key)).map(metric => (
                <Area
                  key={metric.key}
                  type="monotone"
                  dataKey={metric.key}
                  name={metric.label}
                  stroke={metric.color}
                  fill={`url(#gradient-${metric.key})`}
                  strokeWidth={2}
                />
              ))}
            </AreaChart>
          ) : (
            <ComposedChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.16)" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(val) => format(parseISO(val), granularity === 'monthly' ? 'MMM' : 'MMM d')}
                tick={{ fontSize: 12, fill: '#94a3b8' }}
                axisLine={{ stroke: 'rgba(148,163,184,0.18)' }}
                tickLine={{ stroke: 'rgba(148,163,184,0.18)' }}
              />
              <YAxis 
                tickFormatter={formatCurrency}
                tick={{ fontSize: 12, fill: '#94a3b8' }}
                axisLine={{ stroke: 'rgba(148,163,184,0.18)' }}
                tickLine={{ stroke: 'rgba(148,163,184,0.18)' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ color: '#cbd5e1' }} />
              {metrics.filter(m => showMetrics.includes(m.key)).map(metric => (
                <Bar
                  key={metric.key}
                  dataKey={metric.key}
                  name={metric.label}
                  fill={metric.color}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>
    </>
  );

  if (embedded) {
    return body;
  }

  return (
    <CommandCard className="h-full">
      <CommandCardHeader>{header}</CommandCardHeader>
      <CommandCardContent>{body}</CommandCardContent>
    </CommandCard>
  );
}
