import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  FlaskConical, Play, RefreshCw, TrendingUp, AlertTriangle, 
  CheckCircle2, XCircle, Target
} from 'lucide-react';
import { toast } from 'sonner';

const recommendationColors = {
  strongly_recommend: 'bg-emerald-500 text-white',
  recommend: 'bg-emerald-100 text-emerald-700',
  neutral: 'bg-slate-100 text-slate-700',
  caution: 'bg-amber-100 text-amber-700',
  avoid: 'bg-red-100 text-red-700'
};

const scenarioTypes = [
  { value: 'price_cut', label: 'Competitor Price Cut' },
  { value: 'feature_launch', label: 'Feature Launch' },
  { value: 'enterprise_push', label: 'Enterprise Push' },
  { value: 'partnership', label: 'Strategic Partnership' },
  { value: 'acquisition', label: 'Competitor Acquisition' },
  { value: 'geographic_expansion', label: 'Geographic Expansion' }
];

const strategies = [
  { value: 'price_match', label: 'Price Match' },
  { value: 'feature_acceleration', label: 'Feature Acceleration' },
  { value: 'marketing_blitz', label: 'Marketing Blitz' },
  { value: 'acquisition_counter', label: 'Acquisition Counter' },
  { value: 'partnership_defense', label: 'Partnership Defense' },
  { value: 'segment_focus', label: 'Segment Focus' },
  { value: 'do_nothing', label: 'Do Nothing' }
];

export default function SimulationLab() {
  const queryClient = useQueryClient();
  const [newScenario, setNewScenario] = useState({
    competitor_name: '',
    scenario_type: 'price_cut',
    probability_score: 0.5,
    revenue_impact: -100000
  });
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [selectedStrategies, setSelectedStrategies] = useState(['price_match', 'feature_acceleration', 'do_nothing']);

  const { data: labData, isLoading } = useQuery({
    queryKey: ['simulationLab'],
    queryFn: async () => {
      const res = await base44.functions.invoke('marketSimulation', { action: 'get_simulation_lab' });
      return res.data?.lab;
    }
  });

  const createScenarioMutation = useMutation({
    mutationFn: (params) => base44.functions.invoke('marketSimulation', { action: 'create_scenario', ...params }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simulationLab'] });
      toast.success('Scenario created');
      setNewScenario({ competitor_name: '', scenario_type: 'price_cut', probability_score: 0.5, revenue_impact: -100000 });
    }
  });

  const runSimulationMutation = useMutation({
    mutationFn: ({ scenario_id, response_strategies }) => 
      base44.functions.invoke('marketSimulation', { action: 'run_simulation', scenario_id, response_strategies }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['simulationLab'] });
      toast.success(`Simulation complete: Optimal strategy is ${res.data?.optimal_path?.strategy}`);
    }
  });

  if (isLoading) {
    return <Card><CardContent className="py-8 text-center"><RefreshCw className="w-6 h-6 animate-spin mx-auto" /></CardContent></Card>;
  }

  const lab = labData || {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <FlaskConical className="w-6 h-6 text-purple-600" />
            Strategic Simulation Lab
          </h2>
          <p className="text-sm text-slate-500">Model competitive moves before they happen</p>
        </div>
      </div>

      {/* Create New Scenario */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Create Scenario</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-3">
            <Input
              placeholder="Competitor name"
              value={newScenario.competitor_name}
              onChange={(e) => setNewScenario({ ...newScenario, competitor_name: e.target.value })}
            />
            <Select value={newScenario.scenario_type} onValueChange={(v) => setNewScenario({ ...newScenario, scenario_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {scenarioTypes.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              placeholder="Probability (0-1)"
              value={newScenario.probability_score}
              onChange={(e) => setNewScenario({ ...newScenario, probability_score: parseFloat(e.target.value) })}
              step="0.1"
              min="0"
              max="1"
            />
            <Button 
              onClick={() => createScenarioMutation.mutate(newScenario)}
              disabled={!newScenario.competitor_name || createScenarioMutation.isPending}
            >
              Create
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Existing Scenarios */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Scenarios ({lab.total_scenarios || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-64 overflow-auto">
            {lab.scenarios?.map((scenario) => (
              <div 
                key={scenario.id} 
                className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${selectedScenario?.id === scenario.id ? 'bg-purple-100 border border-purple-300' : 'bg-slate-50 hover:bg-slate-100'}`}
                onClick={() => setSelectedScenario(scenario)}
              >
                <div>
                  <p className="font-medium text-sm">{scenario.competitor}</p>
                  <p className="text-xs text-slate-500">{scenario.type?.replace('_', ' ')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{(scenario.probability * 100).toFixed(0)}% prob</Badge>
                  {scenario.simulations?.length > 0 && (
                    <Badge className="bg-purple-100 text-purple-700">{scenario.simulations.length} sims</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Run Simulation */}
      {selectedScenario && (
        <Card className="border-purple-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="w-4 h-4 text-purple-600" />
              Simulate: {selectedScenario.competitor} - {selectedScenario.type}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-slate-500 mb-2">Select strategies to simulate:</p>
                <div className="flex flex-wrap gap-2">
                  {strategies.map(s => (
                    <Badge 
                      key={s.value}
                      className={`cursor-pointer ${selectedStrategies.includes(s.value) ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-700'}`}
                      onClick={() => {
                        if (selectedStrategies.includes(s.value)) {
                          setSelectedStrategies(selectedStrategies.filter(x => x !== s.value));
                        } else {
                          setSelectedStrategies([...selectedStrategies, s.value]);
                        }
                      }}
                    >
                      {s.label}
                    </Badge>
                  ))}
                </div>
              </div>
              <Button 
                onClick={() => runSimulationMutation.mutate({ 
                  scenario_id: selectedScenario.id, 
                  response_strategies: selectedStrategies 
                })}
                disabled={selectedStrategies.length === 0 || runSimulationMutation.isPending}
                className="w-full bg-purple-600 hover:bg-purple-700"
              >
                {runSimulationMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                Run Monte Carlo Simulation
              </Button>
            </div>

            {/* Show existing simulations for this scenario */}
            {selectedScenario.simulations?.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm font-medium mb-2">Previous Simulations:</p>
                <div className="space-y-2">
                  {selectedScenario.simulations.map((sim, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                      <span className="text-sm">{sim.strategy?.replace('_', ' ')}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{(sim.roi * 100).toFixed(0)}% ROI</span>
                        <Badge className={recommendationColors[sim.recommendation]}>{sim.recommendation}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent Simulations */}
      {lab.recent_simulations?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent Simulations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {lab.recent_simulations.map((sim, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                  <div>
                    <p className="text-sm font-medium">{sim.strategy?.replace('_', ' ')}</p>
                    <p className="text-xs text-slate-500">{new Date(sim.date).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {sim.recommendation === 'strongly_recommend' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                    {sim.recommendation === 'avoid' && <XCircle className="w-4 h-4 text-red-600" />}
                    {sim.recommendation === 'caution' && <AlertTriangle className="w-4 h-4 text-amber-600" />}
                    <Badge className={recommendationColors[sim.recommendation]}>{sim.recommendation}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}