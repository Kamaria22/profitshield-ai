import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { PieChart as PieIcon, DollarSign } from 'lucide-react';

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
      <div className="bg-white p-3 rounded-lg shadow-lg border">
        <p className="font-medium">{data.name}</p>
        <p className="text-sm text-slate-600">{formatCurrency(data.value)}</p>
        <p className="text-xs text-slate-400">
          {((data.value / totalCosts) * 100).toFixed(1)}% of costs
        </p>
      </div>
    );
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* Cost Breakdown Pie */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieIcon className="w-5 h-5 text-amber-600" />
            Cost Breakdown
          </CardTitle>
          <CardDescription>Where your money goes</CardDescription>
        </CardHeader>
        <CardContent>
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
                    <span className="text-sm text-slate-600">{value}</span>
                  )}
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
                  <span className="text-slate-600">{item.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-slate-400">
                    {((item.value / metrics.totalRevenue) * 100).toFixed(1)}%
                  </span>
                  <span className="font-medium">{formatCurrency(item.value)}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Profit Waterfall */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            Profit Waterfall
          </CardTitle>
          <CardDescription>From revenue to net profit</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={waterfallData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis 
                  type="number" 
                  tickFormatter={formatCurrency}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  width={70}
                />
                <Tooltip 
                  formatter={(value) => formatCurrency(Math.abs(value))}
                  labelStyle={{ fontWeight: 600 }}
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
          <div className="mt-4 pt-4 border-t">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-slate-500">Gross Margin</p>
                <p className="text-lg font-bold text-emerald-600">
                  {metrics.grossMargin.toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Net Margin</p>
                <p className={`text-lg font-bold ${metrics.netMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {metrics.netMargin.toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Profitable Orders</p>
                <p className="text-lg font-bold text-blue-600">
                  {((metrics.profitableOrders / metrics.orderCount) * 100).toFixed(0)}%
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}