import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer, ComposedChart, Bar
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { TrendingUp, BarChart3, Activity } from 'lucide-react';

const formatCurrency = (value) => {
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value.toFixed(0)}`;
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="bg-white p-3 rounded-lg shadow-lg border">
      <p className="font-medium text-slate-900 mb-2">
        {format(parseISO(label), 'MMM d, yyyy')}
      </p>
      {payload.map((entry, idx) => (
        <div key={idx} className="flex items-center justify-between gap-4 text-sm">
          <span style={{ color: entry.color }}>{entry.name}:</span>
          <span className="font-medium">{formatCurrency(entry.value)}</span>
        </div>
      ))}
    </div>
  );
};

export default function PnLTrendsChart({ data, granularity }) {
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              Profit Trends
            </CardTitle>
            <CardDescription>
              {granularity.charAt(0).toUpperCase() + granularity.slice(1)} performance over time
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex border rounded-lg overflow-hidden">
              <Button 
                variant={chartType === 'area' ? 'secondary' : 'ghost'} 
                size="sm"
                onClick={() => setChartType('area')}
                className="rounded-none"
              >
                <Activity className="w-4 h-4" />
              </Button>
              <Button 
                variant={chartType === 'bar' ? 'secondary' : 'ghost'} 
                size="sm"
                onClick={() => setChartType('bar')}
                className="rounded-none"
              >
                <BarChart3 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
        {/* Metric toggles */}
        <div className="flex flex-wrap gap-2 mt-4">
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
              className="text-xs"
            >
              {metric.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-80">
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
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(val) => format(parseISO(val), granularity === 'monthly' ? 'MMM' : 'MMM d')}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                />
                <YAxis 
                  tickFormatter={formatCurrency}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
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
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(val) => format(parseISO(val), granularity === 'monthly' ? 'MMM' : 'MMM d')}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                />
                <YAxis 
                  tickFormatter={formatCurrency}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
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
      </CardContent>
    </Card>
  );
}