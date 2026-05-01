import React from 'react';
import { CommandCard, CommandCardContent } from '@/components/ui/command-card';
import { 
  DollarSign, TrendingUp, TrendingDown, ShoppingCart, 
  Users, ArrowUpRight, ArrowDownRight
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
    }
  ];

  const colorClasses = {
    blue: 'bg-blue-500/10 text-blue-300',
    emerald: 'bg-emerald-500/10 text-emerald-300',
    red: 'bg-red-500/10 text-red-300',
    purple: 'bg-purple-500/10 text-purple-300',
    amber: 'bg-amber-500/10 text-amber-300',
    slate: 'bg-slate-500/10 text-slate-300',
    orange: 'bg-orange-500/10 text-orange-300'
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <CommandCard key={idx} className="h-full">
            <CommandCardContent className="pt-4">
              <div className="flex items-start justify-between">
                <div className={`p-2 rounded-lg ${colorClasses[card.color]}`}>
                  <Icon className="w-4 h-4" />
                </div>
                {card.trend ? (
                  <div className={`flex items-center text-xs ${card.trend === 'up' ? 'text-emerald-300' : 'text-red-300'}`}>
                    {card.trend === 'up' ? (
                      <ArrowUpRight className="w-3 h-3" />
                    ) : (
                      <ArrowDownRight className="w-3 h-3" />
                    )}
                  </div>
                ) : <div className="h-3 w-3" />}
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold text-slate-100">{card.value}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{card.title}</p>
                <p className="text-xs text-slate-400">{card.subtitle}</p>
              </div>
            </CommandCardContent>
          </CommandCard>
        );
      })}
    </div>
  );
}
