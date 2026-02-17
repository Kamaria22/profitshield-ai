import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { 
  Search, 
  AlertTriangle, 
  ShieldAlert, 
  TrendingDown, 
  RefreshCw,
  Target,
  DollarSign,
  Loader2,
  CheckCircle2,
  XCircle,
  Eye,
  Zap
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

const severityColors = {
  critical: 'bg-red-100 text-red-700 border-red-300',
  high: 'bg-orange-100 text-orange-700 border-orange-300',
  medium: 'bg-amber-100 text-amber-700 border-amber-300',
  low: 'bg-blue-100 text-blue-700 border-blue-300'
};

const priorityIcons = {
  immediate: Zap,
  this_week: Target,
  this_month: Eye
};

export default function ProfitLeakForensicsPanel({ tenantId }) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['profitLeakForensics', tenantId],
    queryFn: async () => {
      const response = await base44.functions.invoke('aiProfitLeakForensics', {
        tenant_id: tenantId
      });
      return response.data;
    },
    enabled: !!tenantId,
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  const handleRefresh = () => {
    toast.promise(refetch(), {
      loading: 'Running forensic analysis...',
      success: 'Forensics complete!',
      error: 'Analysis failed'
    });
  };

  if (!tenantId) return null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3 bg-gradient-to-r from-slate-800 to-slate-900 text-white">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="w-5 h-5" />
            Profit Leak Forensics
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
            <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
            <span className="ml-2 text-slate-500">Running deep analysis...</span>
          </div>
        ) : data?.summary ? (
          <Tabs defaultValue="summary" className="space-y-4">
            <TabsList className="grid grid-cols-4">
              <TabsTrigger value="summary" className="text-xs">Summary</TabsTrigger>
              <TabsTrigger value="causes" className="text-xs">Root Causes</TabsTrigger>
              <TabsTrigger value="patterns" className="text-xs">Patterns</TabsTrigger>
              <TabsTrigger value="actions" className="text-xs">Actions</TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="space-y-4">
              {/* Health Grade */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 rounded-lg text-center">
                  <div className={`text-2xl font-bold ${
                    data.summary.health_grade === 'A' ? 'text-emerald-600' :
                    data.summary.health_grade === 'B' ? 'text-blue-600' :
                    data.summary.health_grade === 'C' ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {data.summary.health_grade}
                  </div>
                  <div className="text-xs text-slate-500">Health Grade</div>
                </div>
                <div className="p-3 bg-red-50 rounded-lg text-center">
                  <div className="text-xl font-bold text-red-600">{data.summary.total_identified_leaks}</div>
                  <div className="text-xs text-slate-500">Total Leaks</div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-lg text-center">
                  <div className="text-xl font-bold text-emerald-600">{data.summary.recoverable_profit}</div>
                  <div className="text-xs text-slate-500">Recoverable</div>
                </div>
                <div className="p-3 bg-amber-50 rounded-lg text-center">
                  <div className="text-xs font-medium text-amber-700 leading-tight">{data.summary.top_priority}</div>
                  <div className="text-xs text-slate-500 mt-1">Top Priority</div>
                </div>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="p-2 bg-slate-50 rounded">
                  <span className="text-slate-500">Revenue:</span>
                  <span className="font-medium ml-1">${data.metrics?.total_revenue?.toFixed(0)}</span>
                </div>
                <div className="p-2 bg-slate-50 rounded">
                  <span className="text-slate-500">Profit:</span>
                  <span className="font-medium ml-1">${data.metrics?.total_profit?.toFixed(0)}</span>
                </div>
                <div className="p-2 bg-slate-50 rounded">
                  <span className="text-slate-500">Refunds:</span>
                  <span className="font-medium ml-1">${data.metrics?.total_refunds?.toFixed(0)}</span>
                </div>
              </div>

              {/* Risky Customers */}
              {data.risky_customers?.length > 0 && (
                <div className="border-t pt-3">
                  <h4 className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    High-Risk Customers
                  </h4>
                  <div className="space-y-1">
                    {data.risky_customers.slice(0, 5).map((c, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-amber-50 rounded text-xs">
                        <span className="truncate">{c.email}</span>
                        <div className="flex gap-2">
                          <Badge variant="outline" className="text-xs">{c.refunds} refunds</Badge>
                          {c.high_risk > 0 && (
                            <Badge className="bg-red-100 text-red-700 text-xs">{c.high_risk} risky</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="causes" className="space-y-3">
              {data.root_causes?.map((cause, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`p-3 rounded-lg border-l-4 ${severityColors[cause.severity]}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-medium text-sm">{cause.category}</p>
                    <Badge className={severityColors[cause.severity]}>{cause.severity}</Badge>
                  </div>
                  <p className="text-sm mb-2">{cause.cause}</p>
                  <p className="text-xs opacity-80"><strong>Evidence:</strong> {cause.evidence}</p>
                  <p className="text-xs opacity-80"><strong>Impact:</strong> {cause.impact}</p>
                </motion.div>
              ))}
            </TabsContent>

            <TabsContent value="patterns" className="space-y-3">
              {data.hidden_patterns?.map((pattern, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="p-3 bg-purple-50 border border-purple-200 rounded-lg"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Eye className="w-4 h-4 text-purple-600" />
                    <p className="font-medium text-sm text-purple-800">{pattern.pattern_name}</p>
                  </div>
                  <p className="text-sm text-purple-700 mb-2">{pattern.description}</p>
                  <div className="flex gap-3 text-xs text-purple-600">
                    <span>Affected: {pattern.affected_orders}</span>
                    <span>Loss: {pattern.potential_loss}</span>
                  </div>
                </motion.div>
              ))}
            </TabsContent>

            <TabsContent value="actions" className="space-y-3">
              {data.remediation_plan?.map((action, i) => {
                const Icon = priorityIcons[action.priority] || Target;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={`p-3 rounded-lg border ${
                      action.priority === 'immediate' ? 'border-red-200 bg-red-50' :
                      action.priority === 'this_week' ? 'border-amber-200 bg-amber-50' :
                      'border-blue-200 bg-blue-50'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <Icon className={`w-4 h-4 mt-0.5 ${
                        action.priority === 'immediate' ? 'text-red-600' :
                        action.priority === 'this_week' ? 'text-amber-600' : 'text-blue-600'
                      }`} />
                      <div className="flex-1">
                        <p className="font-medium text-sm">{action.action}</p>
                        <p className="text-xs opacity-80 mt-1">Target: {action.target}</p>
                        <p className="text-xs opacity-80">{action.implementation}</p>
                        <div className="flex items-center justify-between mt-2">
                          <Badge variant="outline" className="text-xs">
                            <DollarSign className="w-3 h-3 mr-1" />
                            {action.expected_savings}
                          </Badge>
                          <Badge className={`text-xs ${
                            action.priority === 'immediate' ? 'bg-red-500' :
                            action.priority === 'this_week' ? 'bg-amber-500' : 'bg-blue-500'
                          } text-white`}>
                            {action.priority?.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}

              {/* Prevention Strategies */}
              {data.prevention_strategies?.length > 0 && (
                <div className="border-t pt-3">
                  <h4 className="text-sm font-medium text-slate-700 mb-2">Prevention Strategies</h4>
                  <div className="space-y-2">
                    {data.prevention_strategies.map((s, i) => (
                      <div key={i} className="p-2 bg-emerald-50 rounded-lg text-xs">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span className="font-medium text-emerald-800">{s.strategy}</span>
                          {s.automation_possible && (
                            <Badge className="bg-emerald-100 text-emerald-700 text-xs ml-auto">
                              Automatable
                            </Badge>
                          )}
                        </div>
                        <p className="text-emerald-700 mt-1 ml-5">{s.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="text-center py-8">
            <Search className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600">Click "Analyze" for deep forensic analysis</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}