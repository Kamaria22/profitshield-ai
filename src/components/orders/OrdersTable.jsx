import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import { format } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  ChevronRight, 
  AlertTriangle, 
  CheckCircle, 
  AlertCircle,
  HelpCircle,
  ExternalLink
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import AIOrderInsightsBadge from './AIOrderInsightsBadge';
import { CommandCard, CommandCardContent } from '@/components/ui/command-card';

const riskBadgeConfig = {
  low: { variant: 'outline', className: 'border-emerald-200 text-emerald-700 bg-emerald-50' },
  medium: { variant: 'outline', className: 'border-yellow-200 text-yellow-700 bg-yellow-50' },
  high: { variant: 'outline', className: 'border-red-200 text-red-700 bg-red-50' },
};

const getRiskScoreColor = (score) => {
  if (score >= 70) return 'text-red-600 bg-red-50';
  if (score >= 40) return 'text-yellow-600 bg-yellow-50';
  return 'text-emerald-600 bg-emerald-50';
};

const confidenceIcon = {
  high: { icon: CheckCircle, color: 'text-emerald-500' },
  medium: { icon: AlertCircle, color: 'text-yellow-500' },
  low: { icon: HelpCircle, color: 'text-slate-400' },
};

const statusBadgeConfig = {
  pending: 'bg-slate-100 text-slate-700',
  paid: 'bg-blue-100 text-blue-700',
  fulfilled: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-500',
  refunded: 'bg-red-100 text-red-700',
  partially_refunded: 'bg-orange-100 text-orange-700',
};

export default function OrdersTable({ orders, loading, onOrderClick }) {
  if (loading) {
    return (
      <CommandCard>
        <CommandCardContent className="animate-pulse pt-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-4 border-b border-white/8 py-4 last:border-0">
              <div className="h-4 w-24 rounded bg-white/10" />
              <div className="h-4 w-32 rounded bg-white/10" />
              <div className="h-4 w-20 rounded bg-white/10" />
              <div className="h-4 w-16 rounded bg-white/10" />
              <div className="h-4 w-20 rounded bg-white/10" />
            </div>
          ))}
        </CommandCardContent>
      </CommandCard>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <CommandCard className="p-12 text-center">
        <p className="text-slate-400">No orders found</p>
      </CommandCard>
    );
  }

  return (
    <CommandCard className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-white/8 bg-white/[0.03] hover:bg-white/[0.03]">
            <TableHead className="font-semibold text-slate-300">Order</TableHead>
            <TableHead className="font-semibold text-slate-300">Date</TableHead>
            <TableHead className="font-semibold text-slate-300">Customer</TableHead>
            <TableHead className="text-right font-semibold text-slate-300">Revenue</TableHead>
            <TableHead className="text-right font-semibold text-slate-300">Net Profit</TableHead>
            <TableHead className="text-right font-semibold text-slate-300">Margin</TableHead>
            <TableHead className="font-semibold text-slate-300">Risk</TableHead>
            <TableHead className="font-semibold text-slate-300">Status</TableHead>
            <TableHead className="font-semibold text-slate-300">AI</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => {
            const ConfidenceIcon = confidenceIcon[order.confidence]?.icon || HelpCircle;
            const confidenceColor = confidenceIcon[order.confidence]?.color || 'text-slate-400';
            const isProfitable = (order.net_profit || 0) >= 0;
            
            return (
              <TableRow 
                key={order.id} 
                className="cursor-pointer border-white/8 transition-colors hover:bg-white/[0.03]"
                onClick={() => onOrderClick?.(order)}
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    #{order.order_number}
                    {order.risk_level === 'high' && (
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-slate-400">
                  {order.order_date ? format(new Date(order.order_date), 'MMM d, yyyy') : '-'}
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium text-slate-100">{order.customer_name || 'Guest'}</p>
                    <p className="text-sm text-slate-400">{order.customer_email}</p>
                  </div>
                </TableCell>
                <TableCell className="text-right font-medium">
                  ${order.total_revenue?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                </TableCell>
                <TableCell className={`text-right font-semibold ${isProfitable ? 'text-emerald-600' : 'text-red-600'}`}>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center justify-end gap-1">
                          {isProfitable ? '+' : ''}${order.net_profit?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                          <ConfidenceIcon className={`w-3.5 h-3.5 ${confidenceColor}`} />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Data confidence: {order.confidence || 'unknown'}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                <TableCell className={`text-right font-medium ${isProfitable ? 'text-emerald-600' : 'text-red-600'}`}>
                  {order.margin_pct?.toFixed(1) || '0.0'}%
                </TableCell>
                <TableCell>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2">
                          {order.fraud_score !== undefined && order.fraud_score !== null ? (
                            <span className={`inline-flex items-center justify-center w-10 h-6 rounded text-xs font-bold ${getRiskScoreColor(order.fraud_score)}`}>
                              {order.fraud_score}
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-10 h-6 rounded bg-white/[0.06] text-xs text-slate-400">
                              --
                            </span>
                          )}
                          {order.risk_level && (
                            <Badge 
                              variant={riskBadgeConfig[order.risk_level]?.variant}
                              className={`${riskBadgeConfig[order.risk_level]?.className} text-xs px-1.5`}
                            >
                              {order.risk_level}
                            </Badge>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs">
                        {order.risk_reasons?.length > 0 ? (
                          <div className="space-y-1">
                            <p className="font-medium">Risk Factors:</p>
                            <ul className="text-xs space-y-0.5">
                              {order.risk_reasons.slice(0, 5).map((reason, i) => (
                                <li key={i}>• {reason}</li>
                              ))}
                              {order.risk_reasons.length > 5 && (
                                <li className="text-slate-400">+{order.risk_reasons.length - 5} more</li>
                              )}
                            </ul>
                          </div>
                        ) : order.fraud_score !== undefined ? (
                          <p>Risk score: {order.fraud_score}/100</p>
                        ) : (
                          <p>Not analyzed yet</p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                <TableCell>
                  <Badge className={statusBadgeConfig[order.status] || statusBadgeConfig.pending}>
                    {order.status?.replace('_', ' ')}
                  </Badge>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <AIOrderInsightsBadge order={order} />
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </CommandCard>
  );
}
