import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Shield,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Eye,
  Package,
  Ban,
  Truck,
  FileSignature,
  Info
} from 'lucide-react';

const riskLevelConfig = {
  low: {
    icon: ShieldCheck,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    badge: 'bg-emerald-100 text-emerald-700'
  },
  medium: {
    icon: Shield,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    badge: 'bg-amber-100 text-amber-700'
  },
  high: {
    icon: ShieldAlert,
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
    badge: 'bg-red-100 text-red-700'
  }
};

const actionConfig = {
  none: { icon: CheckCircle2, label: 'No action needed', color: 'text-emerald-600' },
  hold: { icon: Package, label: 'Hold shipment for review', color: 'text-amber-600' },
  verify: { icon: Eye, label: 'Verify customer identity', color: 'text-amber-600' },
  signature: { icon: FileSignature, label: 'Require signature on delivery', color: 'text-blue-600' },
  cancel: { icon: Ban, label: 'Consider cancelling order', color: 'text-red-600' },
  split_shipment: { icon: Truck, label: 'Split into multiple shipments', color: 'text-blue-600' }
};

const confidenceConfig = {
  high: { icon: CheckCircle2, color: 'text-emerald-600', label: 'High confidence' },
  medium: { icon: AlertCircle, color: 'text-amber-600', label: 'Medium confidence' },
  low: { icon: XCircle, color: 'text-red-600', label: 'Low confidence - incomplete data' }
};

export default function RiskAnalysisCard({ order, compact = false }) {
  const riskLevel = order.risk_level || 'low';
  const config = riskLevelConfig[riskLevel];
  const RiskIcon = config.icon;
  const action = actionConfig[order.recommended_action] || actionConfig.none;
  const ActionIcon = action.icon;
  const confidenceLevel = order.confidence || 'medium';
  const confConfig = confidenceConfig[confidenceLevel];
  const ConfIcon = confConfig.icon;

  if (compact) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${config.bg} ${config.border} border`}>
        <RiskIcon className={`w-4 h-4 ${config.color}`} />
        <span className={`text-sm font-medium ${config.color} capitalize`}>{riskLevel} Risk</span>
        {order.fraud_score > 0 && (
          <Badge variant="outline" className="text-xs ml-auto">
            Score: {order.fraud_score}
          </Badge>
        )}
      </div>
    );
  }

  return (
    <Card className={`${config.border} border-2`}>
      <CardHeader className={`${config.bg} pb-3`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RiskIcon className={`w-5 h-5 ${config.color}`} />
            <CardTitle className="text-base">Risk Analysis</CardTitle>
          </div>
          <Badge className={config.badge}>
            {riskLevel.toUpperCase()} RISK
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {/* Risk Scores */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="text-xs text-slate-500 mb-1">Fraud</p>
            <div className="relative">
              <Progress 
                value={order.fraud_score || 0} 
                className="h-2"
              />
              <p className="text-sm font-semibold mt-1">{order.fraud_score || 0}</p>
            </div>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-500 mb-1">Return</p>
            <div className="relative">
              <Progress 
                value={order.return_score || 0} 
                className="h-2"
              />
              <p className="text-sm font-semibold mt-1">{order.return_score || 0}</p>
            </div>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-500 mb-1">Chargeback</p>
            <div className="relative">
              <Progress 
                value={order.chargeback_score || 0} 
                className="h-2"
              />
              <p className="text-sm font-semibold mt-1">{order.chargeback_score || 0}</p>
            </div>
          </div>
        </div>

        {/* Risk Reasons */}
        {order.risk_reasons && order.risk_reasons.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Risk Factors ({order.risk_reasons.length})
            </p>
            <ul className="space-y-1">
              {order.risk_reasons.map((reason, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-slate-700">
                  <span className="text-red-400 mt-1">•</span>
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Recommended Action */}
        {order.recommended_action && order.recommended_action !== 'none' && (
          <div className={`flex items-center gap-2 p-3 rounded-lg bg-slate-50 border`}>
            <ActionIcon className={`w-5 h-5 ${action.color}`} />
            <div>
              <p className="text-xs text-slate-500">Recommended Action</p>
              <p className={`text-sm font-medium ${action.color}`}>{action.label}</p>
            </div>
          </div>
        )}

        {/* Confidence */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <Info className="w-3 h-3" />
            Analysis Confidence
          </div>
          <div className={`flex items-center gap-1 ${confConfig.color}`}>
            <ConfIcon className="w-3 h-3" />
            <span className="text-xs font-medium">{confConfig.label}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}