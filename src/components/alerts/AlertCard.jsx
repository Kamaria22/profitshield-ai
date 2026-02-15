import React from 'react';
import { format } from 'date-fns';
import { 
  AlertTriangle, 
  TrendingDown, 
  Truck, 
  CreditCard, 
  RotateCcw, 
  Percent,
  Settings,
  CheckCircle,
  Clock,
  ChevronRight
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const alertTypeConfig = {
  high_risk_order: {
    icon: AlertTriangle,
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200'
  },
  negative_margin: {
    icon: TrendingDown,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-200'
  },
  shipping_loss: {
    icon: Truck,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200'
  },
  chargeback_warning: {
    icon: CreditCard,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    border: 'border-purple-200'
  },
  return_spike: {
    icon: RotateCcw,
    color: 'text-pink-600',
    bg: 'bg-pink-50',
    border: 'border-pink-200'
  },
  discount_abuse: {
    icon: Percent,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200'
  },
  system: {
    icon: Settings,
    color: 'text-slate-600',
    bg: 'bg-slate-50',
    border: 'border-slate-200'
  }
};

const severityConfig = {
  critical: { badge: 'bg-red-600 text-white', label: 'Critical' },
  high: { badge: 'bg-red-100 text-red-700', label: 'High' },
  medium: { badge: 'bg-yellow-100 text-yellow-700', label: 'Medium' },
  low: { badge: 'bg-slate-100 text-slate-600', label: 'Low' }
};

const statusConfig = {
  pending: { icon: Clock, color: 'text-yellow-600', label: 'Pending' },
  reviewed: { icon: CheckCircle, color: 'text-blue-600', label: 'Reviewed' },
  action_taken: { icon: CheckCircle, color: 'text-emerald-600', label: 'Resolved' },
  dismissed: { icon: CheckCircle, color: 'text-slate-400', label: 'Dismissed' }
};

export default function AlertCard({ alert, onStatusChange, onViewDetails }) {
  const typeConfig = alertTypeConfig[alert.type] || alertTypeConfig.system;
  const severity = severityConfig[alert.severity] || severityConfig.medium;
  const status = statusConfig[alert.status] || statusConfig.pending;
  const Icon = typeConfig.icon;
  const StatusIcon = status.icon;

  return (
    <Card className={`p-4 border-l-4 ${typeConfig.border} hover:shadow-md transition-all duration-200`}>
      <div className="flex items-start gap-4">
        <div className={`p-2.5 rounded-xl ${typeConfig.bg}`}>
          <Icon className={`w-5 h-5 ${typeConfig.color}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-slate-900">{alert.title}</h3>
              <Badge className={severity.badge}>{severity.label}</Badge>
              <Badge variant="outline" className="flex items-center gap-1">
                <StatusIcon className={`w-3 h-3 ${status.color}`} />
                {status.label}
              </Badge>
            </div>
            <span className="text-xs text-slate-400 whitespace-nowrap">
              {alert.created_date ? format(new Date(alert.created_date), 'MMM d, h:mm a') : ''}
            </span>
          </div>

          <p className="text-sm text-slate-600 mt-1">{alert.message}</p>

          {alert.recommended_action && (
            <p className={`text-sm mt-2 ${typeConfig.color} font-medium`}>
              Recommended: {alert.recommended_action}
            </p>
          )}

          <div className="flex items-center gap-2 mt-3">
            {alert.status === 'pending' && (
              <>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => onStatusChange?.(alert.id, 'action_taken')}
                  className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                >
                  <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                  Mark Resolved
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost"
                  onClick={() => onStatusChange?.(alert.id, 'dismissed')}
                  className="text-slate-500"
                >
                  Dismiss
                </Button>
              </>
            )}
            {onViewDetails && (
              <Button 
                size="sm" 
                variant="ghost"
                onClick={() => onViewDetails(alert)}
                className="ml-auto"
              >
                View Details
                <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}