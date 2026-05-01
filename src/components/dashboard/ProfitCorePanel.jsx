import React from 'react';
import { CommandCard, CommandCardContent, CommandCardDescription, CommandCardHeader, CommandCardTitle } from '@/components/ui/command-card';

function formatCurrency(value) {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 1000) return `$${(amount / 1000).toFixed(1)}k`;
  return `$${amount.toFixed(0)}`;
}

function buildTrendPoints(orders = []) {
  const source = [...orders].reverse().slice(-8);
  const values = source.map((order) => Number(order?.net_profit || order?.total_revenue || 0));
  if (!values.length) return '0,28 100,28';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  return values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * 100;
      const y = 28 - ((value - min) / range) * 22;
      return `${x},${y}`;
    })
    .join(' ');
}

function getTrendMeta(orders = []) {
  if (orders.length < 2) return 'Stable';
  const latest = Number(orders[0]?.net_profit || orders[0]?.total_revenue || 0);
  const previous = Number(orders[orders.length - 1]?.net_profit || orders[orders.length - 1]?.total_revenue || 0);
  if (!previous) return 'Fresh signal';
  const pct = ((latest - previous) / Math.abs(previous)) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}% recent trend`;
}

function estimateDailyRunRate(orders = [], totalProfit = 0) {
  if (!orders.length) return 0;
  const timestamps = orders
    .map((order) => new Date(order?.order_date || order?.processed_at || 0).getTime())
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!timestamps.length) return totalProfit / 30;
  const minTs = Math.min(...timestamps);
  const maxTs = Math.max(...timestamps);
  const spanDays = Math.max(1, Math.ceil((maxTs - minTs) / (1000 * 60 * 60 * 24)) + 1);
  return totalProfit / spanDays;
}

function ForecastMetric({ label, value }) {
  return (
    <div className="dashboard-subpanel">
      <p className="dashboard-label">{label}</p>
      <p className="mt-2 text-xl font-bold text-white">{formatCurrency(value)}</p>
    </div>
  );
}

export function ProfitOverviewCard({ metrics, orders = [] }) {
  const totalProfit = Number(metrics?.totalProfit || 0);
  const totalRevenue = Number(metrics?.totalRevenue || 0);
  const margin = Number(metrics?.avgMargin || 0);
  const trendPoints = buildTrendPoints(orders);
  const trendMeta = getTrendMeta(orders);
  const revenueMeta = totalRevenue > 0 ? `${formatCurrency(totalRevenue)} revenue` : 'No revenue captured yet';

  return (
    <CommandCard className="h-full">
      <CommandCardHeader>
        <CommandCardTitle>Profit Overview</CommandCardTitle>
        <CommandCardDescription>What’s happening with profit right now.</CommandCardDescription>
      </CommandCardHeader>
      <CommandCardContent>
        <p className="dashboard-metric">{formatCurrency(totalProfit)}</p>
        <p className="mt-2 text-sm text-slate-400">{revenueMeta}</p>
        <div className="mt-4 flex items-center justify-between gap-4">
          <div>
            <p className="dashboard-label">Margin</p>
            <p className="mt-2 text-lg font-semibold text-[#00E5FF]">{margin.toFixed(1)}%</p>
          </div>
          <div className="min-w-[140px] flex-1">
            <svg viewBox="0 0 100 32" className="h-10 w-full">
              <polyline
                fill="none"
                stroke="#00E5FF"
                strokeWidth="2"
                points={trendPoints}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="text-right text-xs text-slate-400">{trendMeta}</p>
          </div>
        </div>
      </CommandCardContent>
    </CommandCard>
  );
}

export function ForecastCard({ metrics, orders = [] }) {
  const totalProfit = Number(metrics?.totalProfit || 0);
  const dailyRunRate = estimateDailyRunRate(orders, totalProfit);
  const monthlyRunRate = dailyRunRate * 30;

  return (
    <CommandCard className="h-full">
      <CommandCardHeader>
        <CommandCardTitle>Forecast</CommandCardTitle>
        <CommandCardDescription>Projected from current profit run rate.</CommandCardDescription>
      </CommandCardHeader>
      <CommandCardContent className="space-y-3">
        <ForecastMetric label="30 days" value={monthlyRunRate} />
        <ForecastMetric label="60 days" value={monthlyRunRate * 2} />
        <ForecastMetric label="90 days" value={monthlyRunRate * 3} />
      </CommandCardContent>
    </CommandCard>
  );
}

export default function ProfitCorePanel(props) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ProfitOverviewCard {...props} />
      <ForecastCard {...props} />
    </div>
  );
}
