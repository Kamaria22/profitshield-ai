import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  TrendingUp,
  Shield,
  DollarSign,
  FlaskConical,
  RefreshCw,
  ChevronRight,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';

const typeIcons = {
  growth: TrendingUp,
  moat: Shield,
  pricing: DollarSign,
  experiment: FlaskConical,
  retention: RefreshCw,
  operational: Zap
};

const typeColors = {
  growth: 'bg-purple-100 text-purple-700',
  moat: 'bg-blue-100 text-blue-700',
  pricing: 'bg-emerald-100 text-emerald-700',
  experiment: 'bg-amber-100 text-amber-700',
  retention: 'bg-pink-100 text-pink-700',
  operational: 'bg-slate-100 text-slate-700'
};

const riskColors = {
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-red-100 text-red-700',
  critical: 'bg-red-500 text-white'
};

const statusConfig = {
  proposed: { label: 'Pending', color: 'bg-blue-100 text-blue-700', icon: Clock },
  approved: { label: 'Approved', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: XCircle },
  executing: { label: 'Executing', color: 'bg-amber-100 text-amber-700', icon: RefreshCw },
  executed: { label: 'Executed', color: 'bg-emerald-500 text-white', icon: CheckCircle2 },
  rolled_back: { label: 'Rolled Back', color: 'bg-slate-100 text-slate-700', icon: RefreshCw }
};

export default function DecisionQueue({ limit = 10 }) {
  const queryClient = useQueryClient();

  const { data: decisions = [], isLoading } = useQuery({
    queryKey: ['founderDecisions'],
    queryFn: async () => {
      const all = await base44.entities.FounderDecision.filter({}, '-created_date', limit);
      return all;
    }
  });

  const approveMutation = useMutation({
    mutationFn: (id) => base44.functions.invoke('founderAutopilot', {
      action: 'approve_decision',
      decision_id: id
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['founderDecisions'] });
      toast.success('Decision approved');
    }
  });

  const rejectMutation = useMutation({
    mutationFn: (id) => base44.functions.invoke('founderAutopilot', {
      action: 'reject_decision',
      decision_id: id,
      reason: 'Manually rejected'
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['founderDecisions'] });
      toast.success('Decision rejected');
    }
  });

  const executeMutation = useMutation({
    mutationFn: (id) => base44.functions.invoke('founderAutopilot', {
      action: 'execute_decision',
      decision_id: id
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['founderDecisions'] });
      toast.success('Decision executed');
    }
  });

  const pendingDecisions = decisions.filter(d => d.status === 'proposed');
  const recentDecisions = decisions.filter(d => d.status !== 'proposed').slice(0, 5);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-slate-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pending Decisions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              Pending Decisions
            </span>
            <Badge variant="outline">{pendingDecisions.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pendingDecisions.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">No pending decisions</p>
          ) : (
            <div className="space-y-3">
              {pendingDecisions.map((decision) => {
                const TypeIcon = typeIcons[decision.decision_type] || Zap;
                return (
                  <div key={decision.id} className="border rounded-lg p-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded ${typeColors[decision.decision_type]}`}>
                          <TypeIcon className="w-3 h-3" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{decision.title}</p>
                          <p className="text-xs text-slate-500">{decision.hypothesis}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge className={riskColors[decision.risk_level]} variant="outline">
                          {decision.risk_level}
                        </Badge>
                        <span className="text-xs text-slate-400">
                          {Math.round((decision.confidence_score || 0) * 100)}%
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">
                        {decision.source_engine?.replace('_', ' ')}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => rejectMutation.mutate(decision.id)}
                          disabled={rejectMutation.isPending}
                        >
                          <XCircle className="w-3 h-3 mr-1" />
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => approveMutation.mutate(decision.id)}
                          disabled={approveMutation.isPending}
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Approve
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Decisions */}
      {recentDecisions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent Decisions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentDecisions.map((decision) => {
                const statusInfo = statusConfig[decision.status] || statusConfig.proposed;
                const StatusIcon = statusInfo.icon;
                return (
                  <div key={decision.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <StatusIcon className={`w-4 h-4 ${
                        decision.status === 'executed' ? 'text-emerald-500' :
                        decision.status === 'rejected' ? 'text-red-500' :
                        'text-slate-400'
                      }`} />
                      <span className="text-sm">{decision.title}</span>
                    </div>
                    <Badge className={statusInfo.color} variant="outline">
                      {statusInfo.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}