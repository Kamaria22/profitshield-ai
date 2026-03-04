import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { 
  Users, 
  TrendingUp, 
  AlertTriangle, 
  Sparkles, 
  RefreshCw,
  Target,
  DollarSign,
  UserCheck,
  UserX,
  Crown,
  Loader2
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';

const priorityColors = {
  high: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-emerald-100 text-emerald-700 border-emerald-200'
};

const segmentIcons = {
  'VIP': Crown,
  'Champions': Crown,
  'Loyal': UserCheck,
  'At Risk': AlertTriangle,
  'Churned': UserX,
  'New': Sparkles,
  'default': Users
};

function CustomerSegmentationPanelInner({ tenantId }) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['customerSegmentation', tenantId],
    queryFn: async () => {
      const response = await base44.functions.invoke('aiCustomerSegmentation', {
        tenant_id: tenantId
      });
      return response.data;
    },
    enabled: !!tenantId,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  const handleRefresh = () => {
    toast.promise(refetch(), {
      loading: 'Analyzing customers...',
      success: 'Segmentation complete!',
      error: 'Analysis failed'
    });
  };

  if (!tenantId) return null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="w-5 h-5" />
            AI Customer Segments
          </CardTitle>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            disabled={isFetching}
            className="bg-white/20 hover:bg-white/30 text-white border-0"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
            Analyze
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
            <span className="ml-2 text-slate-500">Analyzing customer base...</span>
          </div>
        ) : data?.segments ? (
          <div className="space-y-4">
            {/* Health Score */}
            {data.health_score && (
              <div className="flex items-center gap-4 p-3 bg-violet-50 rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold text-violet-700">{data.health_score}</div>
                  <div className="text-xs text-violet-600">Health Score</div>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-slate-600">{data.churn_risk_summary}</p>
                </div>
              </div>
            )}

            {/* Segments Grid */}
            <div className="grid gap-3 sm:grid-cols-2">
              {data.segments?.map((segment, i) => {
                const Icon = Object.entries(segmentIcons).find(([key]) => 
                  segment.name?.toLowerCase().includes(key.toLowerCase())
                )?.[1] || segmentIcons.default;
                
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={`p-3 rounded-lg border ${priorityColors[segment.priority]}`}
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <Icon className="w-4 h-4 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-medium text-sm">{segment.name}</p>
                        <p className="text-xs opacity-80">{segment.size} customers ({segment.percentage})</p>
                      </div>
                    </div>
                    <p className="text-xs mb-2">{segment.description}</p>
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />
                        {segment.value_potential}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        ROI: {segment.expected_roi}
                      </Badge>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Insights */}
            {data.insights?.length > 0 && (
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-1">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  Key Insights
                </h4>
                <div className="space-y-2">
                  {data.insights.slice(0, 3).map((insight, i) => (
                    <div key={i} className="p-2 bg-amber-50 rounded-lg text-xs">
                      <p className="font-medium text-amber-800">{insight.insight}</p>
                      <p className="text-amber-600 mt-1">{insight.action}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <Users className="w-12 h-12 text-violet-300 mx-auto mb-3" />
            <p className="text-slate-600">Click "Analyze" to segment your customers</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CustomerSegmentationPanel(props) {
  return (
    <GuardianErrorBoundary featureKey="customer_segmentation_panel">
      <CustomerSegmentationPanelInner {...props} />
    </GuardianErrorBoundary>
  );
}