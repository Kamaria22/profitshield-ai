import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Brain, Loader2, ShieldAlert, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';

export default function AIOrderInsightsBadge({ order }) {
  const [insights, setInsights] = useState(null);
  const [open, setOpen] = useState(false);

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
        <Button variant="ghost" size="sm" className="h-7 px-2 text-purple-600 hover:text-purple-700 hover:bg-purple-50">
          <Brain className="w-3.5 h-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-600" />
            <span className="font-medium text-sm">AI Analysis</span>
          </div>

          {analyzeMutation.isPending && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
            </div>
          )}

          {insights && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge className={riskColors[insights.risk_level]}>
                  {insights.risk_level} risk
                </Badge>
              </div>

              <p className="text-sm text-slate-600">{insights.summary}</p>

              {insights.concerns?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-red-700 mb-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Concerns
                  </p>
                  <ul className="text-xs text-slate-600 space-y-1">
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
                  <ul className="text-xs text-slate-600 space-y-1">
                    {insights.positives.map((p, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <span className="text-emerald-400">•</span> {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {insights.action && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-purple-700">
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