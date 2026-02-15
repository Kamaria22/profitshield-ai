import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card } from '@/components/ui/card';

export default function MetricCard({ 
  title, 
  value, 
  prefix = '', 
  suffix = '', 
  trend, 
  trendLabel,
  icon: Icon,
  iconColor = 'text-slate-400',
  iconBg = 'bg-slate-100',
  valueColor = 'text-slate-900',
  loading = false 
}) {
  const formatValue = (val) => {
    if (typeof val === 'number') {
      if (Math.abs(val) >= 1000000) {
        return (val / 1000000).toFixed(1) + 'M';
      }
      if (Math.abs(val) >= 1000) {
        return (val / 1000).toFixed(1) + 'K';
      }
      return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
    return val;
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-slate-200 rounded w-24 mb-4" />
          <div className="h-8 bg-slate-200 rounded w-32 mb-2" />
          <div className="h-3 bg-slate-200 rounded w-20" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
          <p className={`text-3xl font-bold ${valueColor} tracking-tight`}>
            {prefix}{formatValue(value)}{suffix}
          </p>
        </div>
        {Icon && (
          <div className={`p-3 rounded-xl ${iconBg}`}>
            <Icon className={`w-5 h-5 ${iconColor}`} />
          </div>
        )}
      </div>
      
      {trend !== undefined && (
        <div className="flex items-center gap-1 mt-3">
          {trend > 0 ? (
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          ) : trend < 0 ? (
            <TrendingDown className="w-4 h-4 text-red-500" />
          ) : (
            <Minus className="w-4 h-4 text-slate-400" />
          )}
          <span className={`text-sm font-medium ${
            trend > 0 ? 'text-emerald-600' : trend < 0 ? 'text-red-600' : 'text-slate-500'
          }`}>
            {trend > 0 && '+'}{trend}%
          </span>
          {trendLabel && (
            <span className="text-sm text-slate-500">{trendLabel}</span>
          )}
        </div>
      )}
    </Card>
  );
}