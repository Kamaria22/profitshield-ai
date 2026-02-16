import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, ShoppingCart, DollarSign, TrendingUp, TrendingDown, Package, User, Tag } from 'lucide-react';
import { format } from 'date-fns';

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
    <Card className="mt-6 border-2 border-emerald-200 bg-emerald-50/30">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <Icon className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <CardTitle className="text-lg">{segment.name}</CardTitle>
              <CardDescription>
                {orders.length} orders • {segmentBy.charAt(0).toUpperCase() + segmentBy.slice(1)} drill-down
              </CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Segment Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg p-4 border">
            <div className="flex items-center gap-2 text-blue-600 mb-1">
              <DollarSign className="w-4 h-4" />
              <span className="text-xs font-medium">Revenue</span>
            </div>
            <p className="text-xl font-bold">{formatCurrency(totalRevenue)}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border">
            <div className="flex items-center gap-2 text-amber-600 mb-1">
              <Package className="w-4 h-4" />
              <span className="text-xs font-medium">COGS</span>
            </div>
            <p className="text-xl font-bold">{formatCurrency(totalCogs)}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border">
            <div className={`flex items-center gap-2 mb-1 ${totalProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {totalProfit >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span className="text-xs font-medium">Net Profit</span>
            </div>
            <p className={`text-xl font-bold ${totalProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatCurrency(totalProfit)}
            </p>
          </div>
          <div className="bg-white rounded-lg p-4 border">
            <div className="flex items-center gap-2 text-purple-600 mb-1">
              <ShoppingCart className="w-4 h-4" />
              <span className="text-xs font-medium">Avg Order</span>
            </div>
            <p className="text-xl font-bold">{formatCurrency(avgOrderValue)}</p>
          </div>
        </div>

        {/* Cost Breakdown */}
        <div className="bg-white rounded-lg p-4 border">
          <h4 className="font-medium text-slate-900 mb-3">Cost Breakdown</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-slate-500">Shipping Cost</p>
              <p className="font-medium">{formatCurrency(totalShippingCost)}</p>
            </div>
            <div>
              <p className="text-slate-500">Shipping Charged</p>
              <p className="font-medium">{formatCurrency(totalShippingCharged)}</p>
            </div>
            <div>
              <p className="text-slate-500">Payment Fees</p>
              <p className="font-medium">{formatCurrency(totalPaymentFees)}</p>
            </div>
            <div>
              <p className="text-slate-500">Refunds</p>
              <p className="font-medium text-red-600">{formatCurrency(totalRefunds)}</p>
            </div>
          </div>
        </div>

        {/* Orders List */}
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b">
            <h4 className="font-medium text-slate-900">Orders ({orders.length})</h4>
          </div>
          <ScrollArea className="h-[300px]">
            <Table>
              <TableHeader>
                <TableRow>
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
                    <TableRow key={idx}>
                      <TableCell className="font-medium">
                        #{order.order_number || order.platform_order_id}
                      </TableCell>
                      <TableCell className="text-slate-500 text-sm">
                        {order.order_date ? format(new Date(order.order_date), 'MMM d, yyyy') : '-'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {order.customer_name || order.customer_email || 'Guest'}
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(order.total_revenue)}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {formatCurrency(order.total_cogs)}
                      </TableCell>
                      <TableCell>
                        <span className={order.net_profit >= 0 ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>
                          {formatCurrency(order.net_profit)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            margin >= 30 ? 'border-emerald-200 text-emerald-700' :
                            margin >= 15 ? 'border-amber-200 text-amber-700' :
                            'border-red-200 text-red-700'
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
      </CardContent>
    </Card>
  );
}