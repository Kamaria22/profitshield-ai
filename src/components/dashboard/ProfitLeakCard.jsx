import React from 'react';
import { motion } from 'framer-motion';
import { 
  Truck, 
  Percent, 
  Package, 
  CreditCard, 
  RotateCcw, 
  HelpCircle,
  AlertTriangle,
  ChevronRight,
  Lightbulb
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const leakTypeConfig = {
  shipping_loss: {
    icon: Truck,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200'
  },
  discount_abuse: {
    icon: Percent,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    border: 'border-purple-200'
  },
  negative_margin_sku: {
    icon: Package,
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200'
  },
  payment_fees: {
    icon: CreditCard,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-200'
  },
  refund_losses: {
    icon: RotateCcw,
    color: 'text-pink-600',
    bg: 'bg-pink-50',
    border: 'border-pink-200'
  },
  missing_costs: {
    icon: HelpCircle,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200'
  },
  chargeback_losses: {
    icon: AlertTriangle,
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200'
  }
};

export default function ProfitLeakCard({ leak, index, onViewDetails }) {
  const config = leakTypeConfig[leak.type] || leakTypeConfig.missing_costs;
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
    >
      <Card className={`p-5 border-l-4 ${config.border} hover:shadow-md transition-all duration-200`}>
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-xl ${config.bg}`}>
            <Icon className={`w-6 h-6 ${config.color}`} />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-slate-900">{leak.title}</h3>
                <p className="text-sm text-slate-500 mt-1">{leak.description}</p>
              </div>
              <Badge variant="destructive" className="shrink-0 bg-red-100 text-red-700 hover:bg-red-100">
                -${leak.impact_amount?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </Badge>
            </div>

            <div className="flex items-center gap-4 mt-3 text-sm text-slate-500">
              <span>{leak.affected_orders} orders affected</span>
              {leak.affected_skus?.length > 0 && (
                <span>{leak.affected_skus.length} SKUs</span>
              )}
            </div>

            {leak.recommendation && (
              <div className={`flex items-start gap-2 mt-3 p-3 rounded-lg ${config.bg}`}>
                <Lightbulb className={`w-4 h-4 ${config.color} mt-0.5 shrink-0`} />
                <p className={`text-sm ${config.color}`}>{leak.recommendation}</p>
              </div>
            )}

            {onViewDetails && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="mt-3 -ml-2 text-slate-600"
                onClick={() => onViewDetails(leak)}
              >
                View Details
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}