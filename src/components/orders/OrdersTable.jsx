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

const riskBadgeConfig = {
  low: { variant: 'outline', className: 'border-emerald-200 text-emerald-700 bg-emerald-50' },
  medium: { variant: 'outline', className: 'border-yellow-200 text-yellow-700 bg-yellow-50' },
  high: { variant: 'outline', className: 'border-red-200 text-red-700 bg-red-50' },
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
      <div className="bg-white rounded-lg border border-slate-200">
        <div className="animate-pulse p-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-4 py-4 border-b border-slate-100 last:border-0">
              <div className="h-4 bg-slate-200 rounded w-24" />
              <div className="h-4 bg-slate-200 rounded w-32" />
              <div className="h-4 bg-slate-200 rounded w-20" />
              <div className="h-4 bg-slate-200 rounded w-16" />
              <div className="h-4 bg-slate-200 rounded w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
        <p className="text-slate-500">No orders found</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead className="font-semibold">Order</TableHead>
            <TableHead className="font-semibold">Date</TableHead>
            <TableHead className="font-semibold">Customer</TableHead>
            <TableHead className="font-semibold text-right">Revenue</TableHead>
            <TableHead className="font-semibold text-right">Net Profit</TableHead>
            <TableHead className="font-semibold text-right">Margin</TableHead>
            <TableHead className="font-semibold">Risk</TableHead>
            <TableHead className="font-semibold">Status</TableHead>
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
                className="cursor-pointer hover:bg-slate-50 transition-colors"
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
                <TableCell className="text-slate-500">
                  {order.order_date ? format(new Date(order.order_date), 'MMM d, yyyy') : '-'}
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium text-slate-900">{order.customer_name || 'Guest'}</p>
                    <p className="text-sm text-slate-500">{order.customer_email}</p>
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
                  {order.risk_level && (
                    <Badge 
                      variant={riskBadgeConfig[order.risk_level]?.variant}
                      className={riskBadgeConfig[order.risk_level]?.className}
                    >
                      {order.risk_level}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={statusBadgeConfig[order.status] || statusBadgeConfig.pending}>
                    {order.status?.replace('_', ' ')}
                  </Badge>
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
    </div>
  );
}