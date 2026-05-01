import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, ShoppingCart, DollarSign, TrendingUp, TrendingDown, Package, User, Tag } from 'lucide-react';
import { format } from 'date-fns';
import { CommandCard, CommandCardContent, CommandCardDescription, CommandCardHeader, CommandCardTitle } from '@/components/ui/command-card';

const formatCurrency = (value) => `$${(value || 0).toFixed(2)}`;

export default function OrderDrilldownPanel({ orders, segment, segmentBy, onClose }) {
  // Calculate aggregate metrics for this segment
  const totalRevenue = orders.reduce((sum, o) => sum + (o.total_revenue || 0), 0);
  const totalCogs = orders.reduce((sum, o) => sum + (o.total_cogs || 0), 0);
  const totalShippingCost = orders.reduce((sum, o) => sum + (o.shipping_cost || 0), 0);
  const totalShippingCharged = orders.reduce((sum, o) => sum + (o.shipping_charged || 0), 0);
  const totalPaymentFees = orders.reduce((sum, o) => sum + (o.payment_fee || 0), 0);
  const totalRefunds = orders.reduce((sum, o) => sum + (o.refund_amount || 0), 0);
  const totalProfit = orders.reduce((sum, o) => sum + (o.net_profit || 0), 0);
  const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;

  const segmentIcons = {
    product: Package,
    customer: User,
    tags: Tag
  };
  const Icon = segmentIcons[segmentBy] || Package;

  return (
    <CommandCard className="mt-6 border-white/10">
      <CommandCardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
              <Icon className="w-5 h-5 text-cyan-300" />
            </div>
            <div>
              <CommandCardTitle className="text-lg">{segment.name}</CommandCardTitle>
              <CommandCardDescription>
                {orders.length} orders • {segmentBy.charAt(0).toUpperCase() + segmentBy.slice(1)} drill-down
              </CommandCardDescription>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="text-slate-400 hover:bg-white/[0.05] hover:text-slate-100" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CommandCardHeader>
      <CommandCardContent className="space-y-6">
        {/* Segment Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-1 flex items-center gap-2 text-cyan-300">
              <DollarSign className="w-4 h-4" />
              <span className="text-xs font-medium">Revenue</span>
            </div>
            <p className="text-xl font-bold text-slate-100">{formatCurrency(totalRevenue)}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-1 flex items-center gap-2 text-amber-300">
              <Package className="w-4 h-4" />
              <span className="text-xs font-medium">COGS</span>
            </div>
            <p className="text-xl font-bold text-slate-100">{formatCurrency(totalCogs)}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <div className={`mb-1 flex items-center gap-2 ${totalProfit >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
              {totalProfit >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span className="text-xs font-medium">Net Profit</span>
            </div>
            <p className={`text-xl font-bold ${totalProfit >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
              {formatCurrency(totalProfit)}
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-1 flex items-center gap-2 text-violet-300">
              <ShoppingCart className="w-4 h-4" />
              <span className="text-xs font-medium">Avg Order</span>
            </div>
            <p className="text-xl font-bold text-slate-100">{formatCurrency(avgOrderValue)}</p>
          </div>
        </div>

        {/* Cost Breakdown */}
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <h4 className="mb-3 font-medium text-slate-100">Cost Breakdown</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-slate-500">Shipping Cost</p>
              <p className="font-medium text-slate-100">{formatCurrency(totalShippingCost)}</p>
            </div>
            <div>
              <p className="text-slate-500">Shipping Charged</p>
              <p className="font-medium text-slate-100">{formatCurrency(totalShippingCharged)}</p>
            </div>
            <div>
              <p className="text-slate-500">Payment Fees</p>
              <p className="font-medium text-slate-100">{formatCurrency(totalPaymentFees)}</p>
            </div>
            <div>
              <p className="text-slate-500">Refunds</p>
              <p className="font-medium text-red-300">{formatCurrency(totalRefunds)}</p>
            </div>
          </div>
        </div>

        {/* Orders List */}
        <div className="rounded-lg border border-white/10 bg-white/[0.02]">
          <div className="border-b border-white/10 p-4">
            <h4 className="font-medium text-slate-100">Orders ({orders.length})</h4>
          </div>
          <ScrollArea className="h-[300px]">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead>Order</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Revenue</TableHead>
                  <TableHead>COGS</TableHead>
                  <TableHead>Profit</TableHead>
                  <TableHead>Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order, idx) => {
                  const profit = (order.total_revenue || 0) - (order.total_cogs || 0);
                  const margin = order.total_revenue > 0 ? (profit / order.total_revenue) * 100 : 0;
                  return (
                    <TableRow key={idx} className="border-white/10 hover:bg-white/[0.03]">
                      <TableCell className="font-medium text-slate-100">
                        #{order.order_number || order.platform_order_id}
                      </TableCell>
                      <TableCell className="text-slate-500 text-sm">
                        {order.order_date ? format(new Date(order.order_date), 'MMM d, yyyy') : '-'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {order.customer_name || order.customer_email || 'Guest'}
                      </TableCell>
                      <TableCell className="font-medium text-slate-100">
                        {formatCurrency(order.total_revenue)}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {formatCurrency(order.total_cogs)}
                      </TableCell>
                      <TableCell>
                        <span className={order.net_profit >= 0 ? 'font-medium text-emerald-300' : 'font-medium text-red-300'}>
                          {formatCurrency(order.net_profit)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            margin >= 30 ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' :
                            margin >= 15 ? 'border-amber-400/20 bg-amber-400/10 text-amber-300' :
                            'border-red-400/20 bg-red-400/10 text-red-300'
                          }
                        >
                          {margin.toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      </CommandCardContent>
    </CommandCard>
  );
}
