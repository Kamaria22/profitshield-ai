import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Brain, TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';

export default function ModelExplainabilityPanel({ explainability }) {
  if (!explainability) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-slate-500">
          Select a model to view explainability data
        </CardContent>
      </Card>
    );
  }

  const { feature_importance = [], decision_paths = [], global_metrics = {} } = explainability;

  return (
    <div className="space-y-4">
      <Alert className="bg-blue-50 border-blue-300">
        <Info className="w-4 h-4 text-blue-600" />
        <AlertDescription className="text-blue-900">
          <strong>Model Explainability:</strong> Understanding how the model makes decisions helps ensure fairness, 
          detect bias, and build trust in AI systems.
        </AlertDescription>
      </Alert>

      {/* Feature Importance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-600" />
            Feature Importance
          </CardTitle>
          <CardDescription>
            Impact of each feature on model predictions (SHAP-based)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={feature_importance} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 0.3]} />
              <YAxis type="category" dataKey="name" width={150} fontSize={12} />
              <Tooltip />
              <Bar dataKey="importance" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>

          <div className="mt-4 space-y-2">
            {feature_importance.map((feature, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="font-medium">{feature.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">{(feature.importance * 100).toFixed(1)}%</span>
                  {feature.trend === 'increasing' ? (
                    <TrendingUp className="w-4 h-4 text-green-500" />
                  ) : feature.trend === 'decreasing' ? (
                    <TrendingDown className="w-4 h-4 text-red-500" />
                  ) : (
                    <Minus className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Decision Paths */}
      <Card>
        <CardHeader>
          <CardTitle>Key Decision Rules</CardTitle>
          <CardDescription>
            Main decision paths and their impact on risk scoring
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {decision_paths.map((path, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium">{path.rule}</div>
                    {path.threshold && (
                      <div className="text-sm text-slate-500 mt-1">
                        Threshold: {path.threshold}
                      </div>
                    )}
                  </div>
                  <Badge variant={path.direction === 'increase_risk' ? 'destructive' : 'secondary'}>
                    {path.direction === 'increase_risk' ? '+' : ''}{(path.impact * 100).toFixed(0)}%
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Global Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Model Health Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-slate-500">Bias Score</div>
              <div className="text-2xl font-bold">{global_metrics.bias_score || 0}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Drift Score</div>
              <div className="text-2xl font-bold">{global_metrics.drift_score || 0}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Precision</div>
              <div className="text-2xl font-bold">
                {global_metrics.precision ? (global_metrics.precision * 100).toFixed(1) : 'N/A'}%
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Recall</div>
              <div className="text-2xl font-bold">
                {global_metrics.recall ? (global_metrics.recall * 100).toFixed(1) : 'N/A'}%
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}