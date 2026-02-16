import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  AlertTriangle, 
  Shield, 
  ShieldAlert,
  ShieldCheck,
  MapPin,
  CreditCard,
  Package,
  User,
  Clock,
  Percent,
  TrendingUp
} from 'lucide-react';

const riskFactorIcons = {
  order_value: TrendingUp,
  first_order: User,
  address_mismatch: MapPin,
  high_discount: Percent,
  rush_shipping: Clock,
  high_risk_product: Package,
  payment_method: CreditCard,
  customer_history: User,
  default: AlertTriangle
};

const riskLevelConfig = {
  low: { color: 'bg-green-500', textColor: 'text-green-700', bgColor: 'bg-green-50', icon: ShieldCheck },
  medium: { color: 'bg-yellow-500', textColor: 'text-yellow-700', bgColor: 'bg-yellow-50', icon: Shield },
  high: { color: 'bg-red-500', textColor: 'text-red-700', bgColor: 'bg-red-50', icon: ShieldAlert }
};

export default function RiskBreakdownCard({ order, riskFactors = [] }) {
  const riskLevel = order?.risk_level || 'low';
  const fraudScore = order?.fraud_score || 0;
  const returnScore = order?.return_score || 0;
  const chargebackScore = order?.chargeback_score || 0;
  const config = riskLevelConfig[riskLevel];
  const RiskIcon = config.icon;

  // Default risk factors if not provided
  const factors = riskFactors.length > 0 ? riskFactors : generateDefaultFactors(order);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <RiskIcon className={`w-5 h-5 ${config.textColor}`} />
            Risk Assessment
          </CardTitle>
          <Badge className={`${config.bgColor} ${config.textColor} border-0`}>
            {riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)} Risk
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Risk Score Bars */}
        <div className="space-y-3">
          <RiskScoreBar label="Fraud Risk" score={fraudScore} />
          <RiskScoreBar label="Return Risk" score={returnScore} />
          <RiskScoreBar label="Chargeback Risk" score={chargebackScore} />
        </div>

        {/* Risk Factors */}
        {factors.length > 0 && (
          <div className="pt-3 border-t">
            <p className="text-sm font-medium text-slate-700 mb-2">Contributing Factors</p>
            <div className="space-y-2">
              {factors.map((factor, idx) => {
                const Icon = riskFactorIcons[factor.type] || riskFactorIcons.default;
                return (
                  <div 
                    key={idx}
                    className={`flex items-start gap-2 p-2 rounded-lg ${
                      factor.impact > 0 ? 'bg-red-50' : 'bg-green-50'
                    }`}
                  >
                    <Icon className={`w-4 h-4 mt-0.5 ${
                      factor.impact > 0 ? 'text-red-500' : 'text-green-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${
                        factor.impact > 0 ? 'text-red-700' : 'text-green-700'
                      }`}>
                        {factor.label}
                      </p>
                      <p className="text-xs text-slate-500">{factor.description}</p>
                    </div>
                    <Badge variant="outline" className={`text-xs ${
                      factor.impact > 0 ? 'border-red-200 text-red-600' : 'border-green-200 text-green-600'
                    }`}>
                      {factor.impact > 0 ? '+' : ''}{factor.impact}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RiskScoreBar({ label, score }) {
  const getColor = (s) => {
    if (s < 30) return 'bg-green-500';
    if (s < 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-slate-600">{label}</span>
        <span className="font-medium">{score}/100</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div 
          className={`h-full ${getColor(score)} transition-all duration-500`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function generateDefaultFactors(order) {
  const factors = [];
  
  if (!order) return factors;

  // Order value factor
  if (order.total_revenue > 500) {
    factors.push({
      type: 'order_value',
      label: 'High Order Value',
      description: `Order total of $${order.total_revenue?.toFixed(2)} exceeds typical threshold`,
      impact: Math.min(20, Math.floor(order.total_revenue / 100))
    });
  }

  // First order
  if (order.is_first_order) {
    factors.push({
      type: 'first_order',
      label: 'First-time Customer',
      description: 'No purchase history to establish trust',
      impact: 10
    });
  }

  // Address mismatch (if available)
  if (order.billing_address && order.shipping_address) {
    const billZip = order.billing_address.zip;
    const shipZip = order.shipping_address.zip;
    if (billZip && shipZip && billZip !== shipZip) {
      factors.push({
        type: 'address_mismatch',
        label: 'Address Mismatch',
        description: 'Billing and shipping addresses have different zip codes',
        impact: 15
      });
    }
  }

  // High discount
  if (order.discount_total && order.subtotal) {
    const discountPct = (order.discount_total / order.subtotal) * 100;
    if (discountPct > 30) {
      factors.push({
        type: 'high_discount',
        label: 'High Discount Applied',
        description: `${discountPct.toFixed(0)}% discount on this order`,
        impact: Math.floor(discountPct / 5)
      });
    }
  }

  // If no negative factors, add positive one
  if (factors.length === 0) {
    factors.push({
      type: 'customer_history',
      label: 'Clean Order Profile',
      description: 'No concerning risk indicators detected',
      impact: -10
    });
  }

  return factors;
}