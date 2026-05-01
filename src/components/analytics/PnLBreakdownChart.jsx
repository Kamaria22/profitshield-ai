// @ts-nocheck
import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { PieChart as PieIcon, DollarSign } from 'lucide-react';
import { CommandCard, CommandCardContent, CommandCardDescription, CommandCardHeader, CommandCardTitle } from '@/components/ui/command-card';

const formatCurrency = (value) => {
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value.toFixed(2)}`;
};

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function PnLBreakdownChart({ metrics }) {
  // Cost breakdown data
  const costBreakdown = [
    { name: 'COGS', value: metrics.totalCogs, color: '#f59e0b' },
    { name: 'Shipping Cost', value: metrics.totalShippingCost, color: '#3b82f6' },
    { name: 'Payment Fees', value: metrics.totalPaymentFees, color: '#8b5cf6' },
    { name: 'Platform Fees', value: metrics.totalPlatformFees, color: '#ec4899' },
    { name: 'Refunds', value: metrics.totalRefunds, color: '#ef4444' },
  ].filter(item => item.value > 0);

  const totalCosts = costBreakdown.reduce((sum, item) => sum + item.value, 0);

  // Profit waterfall data
  const waterfallData = [
    { name: 'Revenue', value: metrics.totalRevenue, fill: '#10b981' },
    { name: 'COGS', value: -metrics.totalCogs, fill: '#f59e0b' },
    { name: 'Shipping', value: -(metrics.totalShippingCost - metrics.totalShippingCharged), fill: '#3b82f6' },
    { name: 'Fees', value: -(metrics.totalPaymentFees + metrics.totalPlatformFees), fill: '#8b5cf6' },
    { name: 'Refunds', value: -metrics.totalRefunds, fill: '#ef4444' },
    { name: 'Net Profit', value: metrics.netProfit, fill: metrics.netProfit >= 0 ? '#10b981' : '#ef4444' },
  ];

  const CustomPieTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0].payload;
    return (
      <div className="rounded-lg border border-white/10 bg-slate-950/95 p-3 shadow-lg">
        <p className="font-medium text-slate-100">{data.name}</p>
        <p className="text-sm text-slate-300">{formatCurrency(data.value)}</p>
        <p className="text-xs text-slate-500">
          {((data.value / totalCosts) * 100).toFixed(1)}% of costs
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Cost Breakdown Pie */}
      <CommandCard>
        <CommandCardHeader>
          <CommandCardTitle className="flex items-center gap-2">
            <PieIcon className="w-5 h-5 text-cyan-300" />
            Cost Breakdown
          </CommandCardTitle>
          <CommandCardDescription>Where your money goes</CommandCardDescription>
        </CommandCardHeader>
        <CommandCardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={costBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {costBreakdown.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomPieTooltip />} />
                <Legend 
                  formatter={(value, entry) => (
                    <span className="text-sm text-slate-300">{value}</span>
                  )}
                  wrapperStyle={{ color: '#cbd5e1' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Cost summary */}
          <div className="mt-4 space-y-2">
            {costBreakdown.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-slate-300">{item.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-slate-500">
                    {((item.value / metrics.totalRevenue) * 100).toFixed(1)}%
                  </span>
                  <span className="font-medium text-slate-100">{formatCurrency(item.value)}</span>
                </div>
              </div>
            ))}
          </div>
        </CommandCardContent>
      </CommandCard>

      {/* Profit Waterfall */}
      <CommandCard>
        <CommandCardHeader>
          <CommandCardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-cyan-300" />
            Profit Waterfall
          </CommandCardTitle>
          <CommandCardDescription>From revenue to net profit</CommandCardDescription>
        </CommandCardHeader>
        <CommandCardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={waterfallData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.16)" horizontal={false} />
                <XAxis 
                  type="number" 
                  tickFormatter={formatCurrency}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={{ stroke: 'rgba(148,163,184,0.18)' }}
                  tickLine={{ stroke: 'rgba(148,163,184,0.18)' }}
                />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  width={70}
                  axisLine={{ stroke: 'rgba(148,163,184,0.18)' }}
                  tickLine={{ stroke: 'rgba(148,163,184,0.18)' }}
                />
                <Tooltip 
                  formatter={(value) => formatCurrency(Math.abs(value))}
                  labelStyle={{ fontWeight: 600, color: '#e2e8f0' }}
                  contentStyle={{ backgroundColor: '#020617', border: '1px solid rgba(255,255,255,0.08)' }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {waterfallData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Profit summary */}
          <div className="mt-4 border-t border-white/10 pt-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-slate-500">Gross Margin</p>
                <p className="text-lg font-bold text-emerald-300">
                  {metrics.grossMargin.toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Net Margin</p>
                <p className={`text-lg font-bold ${metrics.netMargin >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                  {metrics.netMargin.toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Profitable Orders</p>
                <p className="text-lg font-bold text-cyan-300">
                  {((metrics.profitableOrders / metrics.orderCount) * 100).toFixed(0)}%
                </p>
              </div>
            </div>
          </div>
        </CommandCardContent>
      </CommandCard>
    </div>
  );
}
