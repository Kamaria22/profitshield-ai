import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Brain, Loader2, AlertTriangle, CheckCircle } from 'lucide-react';

export default function AIOrderInsightsBadge({ order }) {
  const [insights, setInsights] = useState(null);
  const [open, setOpen] = useState(false);

  const netProfit = Number(order?.net_profit || 0);
  const fraudScore = Number(order?.fraud_score ?? -1);
  const riskLevel = String(order?.risk_level || '').toLowerCase();

  const defaultState =
    riskLevel === 'high' || fraudScore >= 70
      ? {
          label: 'High risk',
          className: 'border-red-400/20 bg-red-400/10 text-red-300',
          detail: 'High fraud or risk score detected. Open the order for review.'
        }
      : fraudScore >= 40 || netProfit < 0
        ? {
            label: 'Review',
            className: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
            detail: 'This order has moderate risk or weak profitability and should be reviewed.'
          }
        : netProfit === 0
          ? {
              label: 'Leak detected',
              className: 'border-yellow-400/20 bg-yellow-400/10 text-yellow-200',
              detail: 'Profit is flat. Inspect costs, discounts, and shipping before fulfillment.'
            }
          : {
              label: 'Healthy',
              className: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
              detail: 'No immediate profitability or fraud concern is visible.'
            };

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const prompt = `Analyze this single e-commerce order for risk and profitability issues. Be concise.

ORDER:
- Order #: ${order.order_number || order.platform_order_id}
- Revenue: $${order.total_revenue}
- COGS: $${order.total_cogs || 'Unknown'}
- Net Profit: $${order.net_profit || 'Unknown'}
- Shipping Charged: $${order.shipping_charged || 0}
- Shipping Cost: $${order.shipping_cost || 0}
- Discount: $${order.discount_total || 0}
- Customer: ${order.customer_email || 'Guest'}
- First Order: ${order.is_first_order ? 'Yes' : 'No'}
- Risk Score: ${order.fraud_score || 'N/A'}
- Tags: ${(order.tags || []).join(', ') || 'None'}

Provide a quick risk assessment and any concerns.`;

      return await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            risk_level: { type: "string", enum: ["low", "medium", "high"] },
            summary: { type: "string", description: "1-2 sentence summary" },
            concerns: { type: "array", items: { type: "string" } },
            positives: { type: "array", items: { type: "string" } },
            action: { type: "string", description: "Recommended action if any" }
          }
        }
      });
    },
    onSuccess: (data) => setInsights(data)
  });

  const handleOpen = (isOpen) => {
    setOpen(isOpen);
    if (isOpen && !insights && !analyzeMutation.isPending) {
      analyzeMutation.mutate();
    }
  };

  const riskColors = {
    low: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    high: 'bg-red-100 text-red-700 border-red-200'
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 rounded-full border px-2.5 text-[11px] font-medium hover:bg-white/[0.05] ${defaultState.className}`}
        >
          <Brain className="mr-1.5 h-3.5 w-3.5" />
          {defaultState.label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 border-white/10 bg-slate-950 text-slate-100" align="end">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-cyan-300" />
            <span className="font-medium text-sm">AI Analysis</span>
          </div>

          <div className={`rounded-lg border px-3 py-2 text-xs ${defaultState.className}`}>
            {defaultState.detail}
          </div>

          {analyzeMutation.isPending && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-cyan-300" />
            </div>
          )}

          {insights && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge className={riskColors[insights.risk_level]}>
                  {insights.risk_level} risk
                </Badge>
              </div>

              <p className="text-sm text-slate-300">{insights.summary}</p>

              {insights.concerns?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-red-700 mb-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Concerns
                  </p>
                  <ul className="text-xs text-slate-300 space-y-1">
                    {insights.concerns.map((c, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <span className="text-red-400">•</span> {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {insights.positives?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-emerald-700 mb-1 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Positives
                  </p>
                  <ul className="text-xs text-slate-300 space-y-1">
                    {insights.positives.map((p, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <span className="text-emerald-400">•</span> {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {insights.action && (
                <div className="pt-2 border-t border-white/10">
                  <p className="text-xs text-cyan-300">
                    <strong>Recommended:</strong> {insights.action}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
