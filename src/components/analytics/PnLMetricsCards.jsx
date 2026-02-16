import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { 
  DollarSign, TrendingUp, TrendingDown, ShoppingCart, 
  Users, Package, CreditCard, Truck, ArrowUpRight, ArrowDownRight
} from 'lucide-react';

const formatCurrency = (value) => {
  if (Math.abs(value) >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  }
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value.toFixed(2)}`;
};

const formatPercent = (value) => `${value.toFixed(1)}%`;

export default function PnLMetricsCards({ metrics }) {
  const cards = [
    {
      title: 'Total Revenue',
      value: formatCurrency(metrics.totalRevenue),
      icon: DollarSign,
      color: 'blue',
      subtitle: `${metrics.orderCount} orders`
    },
    {
      title: 'Gross Profit',
      value: formatCurrency(metrics.grossProfit),
      icon: TrendingUp,
      color: 'emerald',
      subtitle: `${formatPercent(metrics.grossMargin)} margin`,
      trend: metrics.grossMargin >= 30 ? 'up' : 'down'
    },
    {
      title: 'Net Profit',
      value: formatCurrency(metrics.netProfit),
      icon: metrics.netProfit >= 0 ? TrendingUp : TrendingDown,
      color: metrics.netProfit >= 0 ? 'emerald' : 'red',
      subtitle: `${formatPercent(metrics.netMargin)} margin`,
      trend: metrics.netProfit >= 0 ? 'up' : 'down'
    },
    {
      title: 'Average Order Value',
      value: formatCurrency(metrics.aov),
      icon: ShoppingCart,
      color: 'purple',
      subtitle: `${metrics.orderCount} orders`
    },
    {
      title: 'Customer LTV',
      value: formatCurrency(metrics.ltv),
      icon: Users,
      color: 'amber',
      subtitle: `${metrics.uniqueCustomers} customers`
    },
    {
      title: 'COGS',
      value: formatCurrency(metrics.totalCogs),
      icon: Package,
      color: 'slate',
      subtitle: `${formatPercent(metrics.totalRevenue > 0 ? (metrics.totalCogs / metrics.totalRevenue) * 100 : 0)} of revenue`
    },
    {
      title: 'Payment Fees',
      value: formatCurrency(metrics.totalPaymentFees),
      icon: CreditCard,
      color: 'orange',
      subtitle: `${formatPercent(metrics.totalRevenue > 0 ? (metrics.totalPaymentFees / metrics.totalRevenue) * 100 : 0)} of revenue`
    },
    {
      title: 'Shipping P&L',
      value: formatCurrency(metrics.shippingProfit),
      icon: Truck,
      color: metrics.shippingProfit >= 0 ? 'emerald' : 'red',
      subtitle: `Charged: ${formatCurrency(metrics.totalShippingCharged)}`,
      trend: metrics.shippingProfit >= 0 ? 'up' : 'down'
    }
  ];

  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600',
    emerald: 'bg-emerald-100 text-emerald-600',
    red: 'bg-red-100 text-red-600',
    purple: 'bg-purple-100 text-purple-600',
    amber: 'bg-amber-100 text-amber-600',
    slate: 'bg-slate-100 text-slate-600',
    orange: 'bg-orange-100 text-orange-600'
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <Card key={idx} className="hover:shadow-md transition-shadow">
            <CardContent className="pt-4">
              <div className="flex items-start justify-between">
                <div className={`p-2 rounded-lg ${colorClasses[card.color]}`}>
                  <Icon className="w-4 h-4" />
                </div>
                {card.trend && (
                  <div className={`flex items-center text-xs ${card.trend === 'up' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {card.trend === 'up' ? (
                      <ArrowUpRight className="w-3 h-3" />
                    ) : (
                      <ArrowDownRight className="w-3 h-3" />
                    )}
                  </div>
                )}
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold text-slate-900">{card.value}</p>
                <p className="text-xs text-slate-500 mt-1">{card.title}</p>
                <p className="text-xs text-slate-400">{card.subtitle}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}