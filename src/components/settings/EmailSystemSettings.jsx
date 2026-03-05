import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/components/platformContext';
import {
  Mail, Inbox, Bot, Activity, CheckCircle2, AlertTriangle,
  RefreshCw, ExternalLink, Zap, MessageCircle, Play
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

function StatusDot({ ok }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
  );
}

export default function EmailSystemSettings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Fetch support conversation stats
  const { data: conversations = [], isLoading, refetch } = useQuery({
    queryKey: ['email-settings-conversations'],
    queryFn: () => base44.entities.SupportConversation.filter({}, '-created_date', 200),
    refetchInterval: 30000,
  });

  const unread = conversations.filter(c => c.status === 'open').length;
  const escalated = conversations.filter(c => c.needs_owner_attention).length;
  const aiResolved = conversations.filter(c => c.status === 'ai_resolved').length;
  const total = conversations.length;
  const aiSuccessRate = total > 0 ? Math.round((aiResolved / total) * 100) : 0;

  // Run watchdog manually
  const watchdogMutation = useMutation({
    mutationFn: () => base44.functions.invoke('supportWatchdog', { manual: true }),
    onSuccess: (res) => {
      toast.success(`Watchdog complete — ${res.data?.auto_resolved || 0} auto-resolved`);
      queryClient.invalidateQueries(['email-settings-conversations']);
    },
    onError: (e) => toast.error(`Watchdog failed: ${e.message}`)
  });

  const metrics = [
    { label: 'Unread Messages', value: unread, icon: Inbox, color: 'text-indigo-400', bg: 'rgba(99,102,241,0.1)', alert: unread > 0 },
    { label: 'Need Attention', value: escalated, icon: AlertTriangle, color: 'text-red-400', bg: 'rgba(239,68,68,0.1)', alert: escalated > 0 },
    { label: 'AI Resolved', value: aiResolved, icon: CheckCircle2, color: 'text-emerald-400', bg: 'rgba(16,185,129,0.1)', alert: false },
    { label: 'AI Success Rate', value: `${aiSuccessRate}%`, icon: Bot, color: 'text-violet-400', bg: 'rgba(139,92,246,0.1)', alert: false },
  ];

  return (
    <div className="space-y-6">
      {/* Support Email Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-indigo-400" />
            Support Email Address
          </CardTitle>
          <CardDescription>Primary support email used for all incoming and outgoing support communications</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between flex-wrap gap-4 p-4 rounded-xl"
            style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}>
                <Mail className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <p className="font-semibold text-slate-100 text-lg">support@profitshield.ai</p>
                <div className="flex items-center gap-2 mt-1">
                  <StatusDot ok={true} />
                  <span className="text-xs text-emerald-400 font-medium">Active</span>
                  <span className="text-xs text-slate-500">· AI-powered inbox</span>
                </div>
              </div>
            </div>
            <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 px-3 py-1">
              Inbox Active
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Live Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            Real-time Inbox Monitoring
          </CardTitle>
          <CardDescription>Live stats from the AI support system — auto-refreshes every 30s</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[1,2,3,4].map(i => (
                <div key={i} className="h-24 rounded-xl shimmer" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {metrics.map(m => (
                <div key={m.label} className="rounded-xl p-4 glass-card relative">
                  {m.alert && m.value > 0 && (
                    <span className="absolute top-2 right-2 w-2 h-2 bg-red-400 rounded-full animate-pulse" />
                  )}
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 rounded-lg" style={{ background: m.bg }}>
                      <m.icon className={`w-3.5 h-3.5 ${m.color}`} />
                    </div>
                    <p className="text-xs text-slate-400">{m.label}</p>
                  </div>
                  <p className="text-2xl font-bold text-slate-100">{m.value}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
            <Button variant="outline" size="sm" className="border-white/10 text-slate-300 gap-2"
              onClick={() => refetch()}>
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh Stats
            </Button>
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 gap-2"
              onClick={() => watchdogMutation.mutate()}
              disabled={watchdogMutation.isPending}>
              <Play className="w-3.5 h-3.5" />
              {watchdogMutation.isPending ? 'Running Watchdog...' : 'Run Watchdog Now'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* AI Support Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-violet-400" />
            AI Support System Status
          </CardTitle>
          <CardDescription>Status of all AI, Guardian, and Self-Healing subsystems</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { label: 'AI Support Chatbot', desc: 'Responds to merchant support tickets automatically', ok: true },
              { label: 'Watchdog Agent', desc: 'Scans inbox every 30 min, auto-resolves tickets', ok: true },
              { label: 'Guardian Agent', desc: 'Validates resolutions, prevents regressions', ok: true },
              { label: 'Self-Healing System', desc: 'Auto-repairs broken flows and failed AI actions', ok: true },
              { label: 'Marketing Email Engine', desc: 'Sends personalized onboarding & feature emails daily at 9am', ok: true },
              { label: 'Admin Escalation Alerts', desc: 'Forwards unresolvable tickets to admin via email', ok: true },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between p-3 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-3">
                  <StatusDot ok={item.ok} />
                  <div>
                    <p className="text-sm font-medium text-slate-200">{item.label}</p>
                    <p className="text-xs text-slate-500">{item.desc}</p>
                  </div>
                </div>
                <Badge className={item.ok
                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                  : 'bg-red-500/10 text-red-300 border border-red-500/20'}>
                  {item.ok ? 'Operational' : 'Degraded'}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Open Support Inbox CTA */}
      <Card style={{ border: '1px solid rgba(99,102,241,0.25)', background: 'rgba(99,102,241,0.05)' }}>
        <CardContent className="py-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 0 20px rgba(99,102,241,0.4)' }}>
                <Inbox className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-semibold text-slate-100">Support Inbox</p>
                <p className="text-sm text-slate-400 mt-0.5">
                  View all tickets, AI responses, and reply directly to merchants
                  {escalated > 0 && <span className="ml-2 text-red-400 font-medium">· {escalated} need attention</span>}
                </p>
              </div>
            </div>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700 gap-2"
              onClick={() => navigate(createPageUrl('SupportInbox'))}>
              <ExternalLink className="w-4 h-4" />
              Open Support Inbox
              {escalated > 0 && (
                <span className="ml-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {escalated}
                </span>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}