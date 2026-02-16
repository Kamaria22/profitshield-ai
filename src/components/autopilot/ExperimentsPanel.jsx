import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  FlaskConical,
  CheckCircle2,
  Clock,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Rocket
} from 'lucide-react';
import { toast } from 'sonner';

const statusColors = {
  draft: 'bg-slate-100 text-slate-700',
  running: 'bg-blue-100 text-blue-700',
  paused: 'bg-amber-100 text-amber-700',
  completed: 'bg-emerald-100 text-emerald-700',
  winner_deployed: 'bg-purple-100 text-purple-700',
  inconclusive: 'bg-slate-100 text-slate-700'
};

export default function ExperimentsPanel() {
  const queryClient = useQueryClient();

  const { data: experiments = [], isLoading } = useQuery({
    queryKey: ['autopilotExperiments'],
    queryFn: () => base44.entities.AutopilotExperiment.filter({}, '-created_date', 20)
  });

  const checkResultsMutation = useMutation({
    mutationFn: (id) => base44.functions.invoke('founderAutopilot', {
      action: 'check_experiment_results',
      experiment_id: id
    }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['autopilotExperiments'] });
      if (res.data?.winner && res.data.winner !== 'inconclusive') {
        toast.success(`Experiment complete! Winner: Variant ${res.data.winner} (+${res.data.lift_percentage?.toFixed(1)}%)`);
      } else {
        toast.info('Not enough data yet for statistical significance');
      }
    }
  });

  const runningExperiments = experiments.filter(e => e.status === 'running');
  const completedExperiments = experiments.filter(e => ['completed', 'winner_deployed', 'inconclusive'].includes(e.status));

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
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-purple-600" />
          Experiments
          <Badge variant="outline" className="ml-auto">{runningExperiments.length} active</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {experiments.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">No experiments yet</p>
        ) : (
          <div className="space-y-4">
            {/* Running Experiments */}
            {runningExperiments.map((exp) => {
              const totalSamples = (exp.current_sample_a || 0) + (exp.current_sample_b || 0);
              const progress = Math.min((totalSamples / (exp.min_sample_size || 100)) * 100, 100);
              
              return (
                <div key={exp.id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-medium text-sm">{exp.experiment_name}</p>
                      <p className="text-xs text-slate-500">{exp.hypothesis}</p>
                    </div>
                    <Badge className={statusColors[exp.status]}>{exp.status}</Badge>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Progress: {totalSamples} / {exp.min_sample_size || 100} samples</span>
                      <span>{progress.toFixed(0)}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                    
                    <div className="flex items-center justify-between pt-2">
                      <div className="flex gap-4 text-xs">
                        <span>A: {exp.current_sample_a || 0}</span>
                        <span>B: {exp.current_sample_b || 0}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => checkResultsMutation.mutate(exp.id)}
                        disabled={checkResultsMutation.isPending}
                      >
                        Check Results
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Completed Experiments */}
            {completedExperiments.length > 0 && (
              <div className="pt-2 border-t">
                <p className="text-xs text-slate-500 mb-2">Recent Results</p>
                {completedExperiments.slice(0, 3).map((exp) => (
                  <div key={exp.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      {exp.winner === 'B' ? (
                        <TrendingUp className="w-4 h-4 text-emerald-500" />
                      ) : exp.winner === 'A' ? (
                        <CheckCircle2 className="w-4 h-4 text-blue-500" />
                      ) : (
                        <Clock className="w-4 h-4 text-slate-400" />
                      )}
                      <span className="text-sm">{exp.experiment_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {exp.lift_percentage && (
                        <span className={`text-xs ${exp.lift_percentage > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {exp.lift_percentage > 0 ? '+' : ''}{exp.lift_percentage.toFixed(1)}%
                        </span>
                      )}
                      <Badge className={statusColors[exp.status]} variant="outline">
                        {exp.winner ? `Winner: ${exp.winner}` : exp.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}