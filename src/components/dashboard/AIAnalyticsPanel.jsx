import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Brain, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  AlertTriangle,
  Sparkles,
  Send,
  Loader2,
  MessageSquare,
  ChevronRight,
  Lightbulb,
  ArrowUpRight,
  ArrowDownRight,
  Calendar
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';

const trendIcons = {
  up: TrendingUp,
  down: TrendingDown,
  stable: Minus
};

const sentimentColors = {
  positive: 'border-emerald-200 bg-emerald-50',
  negative: 'border-red-200 bg-red-50',
  neutral: 'border-slate-200 bg-slate-50'
};

const sentimentText = {
  positive: 'text-emerald-700',
  negative: 'text-red-700',
  neutral: 'text-slate-700'
};

export default function AIAnalyticsPanel({ tenantId, dateRange = 30 }) {
  const [nlQuery, setNlQuery] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [showChat, setShowChat] = useState(false);

  // Fetch AI analytics
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboardAI', tenantId, dateRange],
    queryFn: async () => {
      const response = await base44.functions.invoke('dashboardAI', {
        tenant_id: tenantId,
        date_range: dateRange
      });
      return response.data;
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  // Natural language query mutation
  const queryMutation = useMutation({
    mutationFn: async (query) => {
      const response = await base44.functions.invoke('dashboardAI', {
        tenant_id: tenantId,
        action: 'natural_query',
        query,
        date_range: dateRange
      });
      return response.data;
    },
    onSuccess: (data, query) => {
      setChatHistory(prev => [...prev, 
        { type: 'user', text: query },
        { type: 'ai', text: data.answer, confidence: data.confidence, metrics: data.related_metrics }
      ]);
      setNlQuery('');
    }
  });

  const handleSubmitQuery = (e) => {
    e.preventDefault();
    if (!nlQuery.trim() || queryMutation.isPending) return;
    queryMutation.mutate(nlQuery.trim());
  };

  const suggestedQueries = [
    "What was my profit margin last month?",
    "How are my sales trending?",
    "Which day had the highest revenue?",
    "How do refunds impact my profit?"
  ];

  if (!tenantId) return null;

  return (
    <div className="space-y-4">
      {/* Key Trends Section */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-5 h-5" />
            AI-Powered Key Trends
            <Badge variant="secondary" className="ml-auto bg-white/20 text-white text-xs">
              Last {dateRange} days
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
              <span className="ml-2 text-slate-500">Analyzing trends...</span>
            </div>
          ) : error ? (
            <p className="text-center text-slate-500 py-4">Failed to load trends</p>
          ) : data?.key_trends?.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {data.key_trends.map((trend, i) => {
                const Icon = trendIcons[trend.trend_direction] || Minus;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className={`p-3 rounded-lg border ${sentimentColors[trend.sentiment]}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`p-1.5 rounded-lg ${
                        trend.sentiment === 'positive' ? 'bg-emerald-500' :
                        trend.sentiment === 'negative' ? 'bg-red-500' : 'bg-slate-400'
                      }`}>
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`font-medium text-sm ${sentimentText[trend.sentiment]}`}>
                            {trend.title}
                          </p>
                          {trend.change_value && (
                            <Badge variant="outline" className="text-xs">
                              {trend.change_value}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 mt-1">{trend.description}</p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <p className="text-center text-slate-500 py-4">No significant trends detected</p>
          )}

          {/* Recommendation */}
          {data?.recommendation && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-4 p-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg"
            >
              <div className="flex items-start gap-2">
                <Lightbulb className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-800 text-sm">{data.recommendation.title}</p>
                  <p className="text-xs text-amber-700 mt-1">{data.recommendation.description}</p>
                </div>
                <Badge className={`ml-auto flex-shrink-0 ${
                  data.recommendation.priority === 'high' ? 'bg-red-100 text-red-700' :
                  data.recommendation.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                  'bg-slate-100 text-slate-700'
                }`}>
                  {data.recommendation.priority}
                </Badge>
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Anomaly Detection */}
      {data?.anomalies?.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Detected Anomalies
              <Badge variant="destructive" className="ml-auto">{data.anomalies.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.anomalies.slice(0, 5).map((anomaly, i) => {
              const explanation = data.anomaly_explanations?.find(
                e => e.date === anomaly.date && e.metric === anomaly.metric
              );
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`p-3 rounded-lg border-l-4 ${
                    anomaly.type === 'spike' ? 'border-l-emerald-500 bg-emerald-50' : 'border-l-red-500 bg-red-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {anomaly.type === 'spike' ? (
                        <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <ArrowDownRight className="w-4 h-4 text-red-600" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-slate-800 capitalize">
                          {anomaly.metric} {anomaly.type}
                        </p>
                        <p className="text-xs text-slate-500 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(anomaly.date), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${anomaly.type === 'spike' ? 'text-emerald-700' : 'text-red-700'}`}>
                        ${anomaly.value?.toFixed(0) || anomaly.value}
                      </p>
                      <p className="text-xs text-slate-500">
                        vs avg ${anomaly.expected?.toFixed(0)}
                      </p>
                    </div>
                  </div>
                  {explanation && (
                    <p className="text-xs text-slate-600 mt-2 pl-6">
                      💡 {explanation.explanation}
                    </p>
                  )}
                </motion.div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Natural Language Query Interface */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="w-5 h-5 text-indigo-500" />
              Ask AI About Your Data
            </CardTitle>
            {chatHistory.length > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setChatHistory([])}
                className="text-xs"
              >
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Suggested Queries */}
          {chatHistory.length === 0 && (
            <div className="mb-4">
              <p className="text-xs text-slate-500 mb-2">Try asking:</p>
              <div className="flex flex-wrap gap-2">
                {suggestedQueries.map((q, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => {
                      setNlQuery(q);
                      queryMutation.mutate(q);
                    }}
                    disabled={queryMutation.isPending}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Chat History */}
          <AnimatePresence>
            {chatHistory.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-3 mb-4 max-h-64 overflow-y-auto"
              >
                {chatHistory.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] rounded-lg p-3 ${
                      msg.type === 'user' 
                        ? 'bg-indigo-600 text-white' 
                        : 'bg-slate-100 text-slate-800'
                    }`}>
                      <p className="text-sm">{msg.text}</p>
                      {msg.confidence && (
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className={`text-xs ${
                            msg.type === 'user' ? 'border-white/30 text-white/80' : ''
                          }`}>
                            {msg.confidence} confidence
                          </Badge>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Query Input */}
          <form onSubmit={handleSubmitQuery} className="flex gap-2">
            <Input
              value={nlQuery}
              onChange={(e) => setNlQuery(e.target.value)}
              placeholder="Ask a question about your store data..."
              className="flex-1"
              disabled={queryMutation.isPending}
            />
            <Button 
              type="submit" 
              disabled={!nlQuery.trim() || queryMutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {queryMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}