import React from 'react';
import { format } from 'date-fns';
import { X, AlertTriangle, CheckCircle, Package, Truck, CreditCard, RotateCcw, Percent, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function OrderDetailPanel({ order, onClose }) {
  if (!order) return null;

  const isProfitable = (order.net_profit || 0) >= 0;

  const profitBreakdown = [
    { label: 'Revenue', value: order.total_revenue, type: 'positive' },
    { label: 'Cost of Goods', value: -(order.total_cogs || 0), type: 'negative' },
    { label: 'Payment Fees', value: -(order.payment_fee || 0), type: 'negative' },
    { label: 'Platform Fees', value: -(order.platform_fee || 0), type: 'negative' },
    { label: 'Shipping Cost', value: -(order.shipping_cost || 0), type: 'negative' },
    { label: 'Discounts', value: -(order.discount_total || 0), type: 'negative' },
    { label: 'Refunds', value: -(order.refund_amount || 0), type: 'negative' },
  ].filter(item => item.value !== 0);

  const riskReasonIcons = {
    'new_customer_high_aov': AlertTriangle,
    'address_mismatch': MapPin,
    'discount_stacking': Percent,
    'high_return_rate_sku': RotateCcw,
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-white shadow-xl z-50 border-l border-slate-200">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Order #{order.order_number}</h2>
            <p className="text-sm text-slate-500">
              {order.order_date ? format(new Date(order.order_date), 'MMMM d, yyyy h:mm a') : '-'}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            {/* Profit Summary */}
            <div className={`p-4 rounded-xl ${isProfitable ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <p className="text-sm font-medium text-slate-500 mb-1">Net Profit</p>
              <p className={`text-3xl font-bold ${isProfitable ? 'text-emerald-700' : 'text-red-700'}`}>
                {isProfitable ? '+' : ''}${order.net_profit?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
              </p>
              <p className={`text-sm mt-1 ${isProfitable ? 'text-emerald-600' : 'text-red-600'}`}>
                {order.margin_pct?.toFixed(1)}% margin • {order.confidence} confidence
              </p>
            </div>

            {/* Risk Assessment */}
            {order.risk_level && order.risk_level !== 'low' && (
              <div className={`p-4 rounded-xl ${order.risk_level === 'high' ? 'bg-red-50' : 'bg-yellow-50'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className={`w-5 h-5 ${order.risk_level === 'high' ? 'text-red-600' : 'text-yellow-600'}`} />
                  <p className={`font-semibold ${order.risk_level === 'high' ? 'text-red-700' : 'text-yellow-700'}`}>
                    {order.risk_level === 'high' ? 'High Risk Order' : 'Medium Risk'}
                  </p>
                </div>
                
                {order.risk_reasons?.length > 0 && (
                  <ul className="space-y-1 text-sm mt-3">
                    {order.risk_reasons.map((reason, i) => (
                      <li key={i} className={`flex items-center gap-2 ${order.risk_level === 'high' ? 'text-red-600' : 'text-yellow-600'}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {reason}
                      </li>
                    ))}
                  </ul>
                )}

                {order.recommended_action && order.recommended_action !== 'none' && (
                  <div className={`mt-3 p-3 rounded-lg ${order.risk_level === 'high' ? 'bg-red-100' : 'bg-yellow-100'}`}>
                    <p className={`text-sm font-medium ${order.risk_level === 'high' ? 'text-red-700' : 'text-yellow-700'}`}>
                      Recommended: {order.recommended_action.replace('_', ' ')}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Profit Breakdown */}
            <div>
              <h3 className="font-semibold text-slate-900 mb-3">Profit Breakdown</h3>
              <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                {profitBreakdown.map((item, index) => (
                  <div key={index} className="flex justify-between text-sm">
                    <span className="text-slate-600">{item.label}</span>
                    <span className={`font-medium ${item.value >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
                      {item.value >= 0 ? '+' : ''}${Math.abs(item.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Net Profit</span>
                  <span className={isProfitable ? 'text-emerald-600' : 'text-red-600'}>
                    {isProfitable ? '+' : ''}${order.net_profit?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                  </span>
                </div>
              </div>
            </div>

            {/* Customer Info */}
            <div>
              <h3 className="font-semibold text-slate-900 mb-3">Customer</h3>
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="font-medium text-slate-900">{order.customer_name || 'Guest'}</p>
                <p className="text-sm text-slate-500">{order.customer_email}</p>
                {order.is_first_order && (
                  <Badge className="mt-2 bg-blue-100 text-blue-700 hover:bg-blue-100">
                    First Order
                  </Badge>
                )}
              </div>
            </div>

            {/* Addresses */}
            {(order.billing_address || order.shipping_address) && (
              <div className="grid grid-cols-2 gap-4">
                {order.billing_address && (
                  <div>
                    <h4 className="text-sm font-medium text-slate-500 mb-2">Billing</h4>
                    <div className="text-sm text-slate-700">
                      <p>{order.billing_address.city}, {order.billing_address.province}</p>
                      <p>{order.billing_address.country}</p>
                    </div>
                  </div>
                )}
                {order.shipping_address && (
                  <div>
                    <h4 className="text-sm font-medium text-slate-500 mb-2">Shipping</h4>
                    <div className="text-sm text-slate-700">
                      <p>{order.shipping_address.city}, {order.shipping_address.province}</p>
                      <p>{order.shipping_address.country}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Discount Codes */}
            {order.discount_codes?.length > 0 && (
              <div>
                <h3 className="font-semibold text-slate-900 mb-3">Discounts Applied</h3>
                <div className="flex flex-wrap gap-2">
                  {order.discount_codes.map((code, i) => (
                    <Badge key={i} variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                      <Percent className="w-3 h-3 mr-1" />
                      {code}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}