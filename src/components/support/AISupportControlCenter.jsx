/**
 * AI Support Control Center
 * Admin Owner only — full support intelligence dashboard
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Shield, AlertTriangle, CheckCircle2, Clock, Wrench,
  Send, RefreshCw, User, Bot, Bell, X, Inbox, Zap,
  Activity, Eye, Mail, MessageCircle, ChevronRight,
  TrendingUp, BarChart3, Search, Play
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

const STATUS_CONFIG = {
  open:          { label: 'Open',        color: 'bg-blue-500/15 text-blue-300 border-blue-500/20' },
  ai_resolved:   { label: 'AI Resolved', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20' },
  escalated:     { label: 'Needs You',   color: 'bg-red-500/15 text-red-300 border-red-500/20' },
  owner_replied: { label: 'Replied',     color: 'bg-violet-500/15 text-violet-300 border-violet-500/20' },
  closed:        { label: 'Closed',      color: 'bg-slate-500/15 text-slate-400 border-slate-500/20' },
};

const PRIORITY_COLOR = {
  low:      'text-slate-400',
  medium:   'text-blue-300',
  high:     'text-amber-300',
  critical: 'text-red-300',
};

export default function AISupportControlCenter() {
  const [selected, setSelected] = useState(null);
  const [reply, setReply] = useState('');
  const [filter, setFilter] = useState('all');
  const queryClient = useQueryClient();

  // Fetch conversations
  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ['support-conversations', filter],
    queryFn: async () => {
      const query = filter === 'all' ? {} :
        filter === 'escalated' ? { needs_owner_attention: true } :
        { status: filter };
      return base44.entities.SupportConversation.filter(query, '-created_date', 100);
    },
    refetchInterval: 30000
  });

  // Fetch recent audit logs for repair activity
  const { data: repairLogs = [] } = useQuery({
    queryKey: ['support-repair-logs'],
    queryFn: () => base44.entities.AuditLog.filter(
      { category: 'ai_action' }, '-created_date', 20
    ),
    refetchInterval: 60000
  });

  // Stats
  const stats = {
    total: conversations.length,
    escalated: conversations.filter(c => c.needs_owner_attention).length,
    open: conversations.filter(c => c.status === 'open').length,
    aiResolved: conversations.filter(c => c.status === 'ai_resolved').length,
    autoFixTriggered: conversations.filter(c => c.auto_fix_triggered).length,
  };

  // Run watchdog manually
  const watchdogMutation = useMutation({
    mutationFn: () => base44.functions.invoke('supportWatchdog', { manual: true }),
    onSuccess: (res) => {
      toast.success(`Watchdog run complete — ${res.data?.auto_resolved || 0} auto-resolved, ${res.data?.escalations || 0} escalated`);
      queryClient.invalidateQueries(['support-conversations']);
      queryClient.invalidateQueries(['support-repair-logs']);
    },
    onError: (e) => toast.error(`Watchdog failed: ${e.message}`)
  });

  // Reply to user
  const replyMutation = useMutation({
    mutationFn: async ({ conversationId, replyText, userEmail }) => {
      const conv = conversations.find(c => c.id === conversationId);
      const updatedMessages = [
        ...(conv?.messages || []),
        { role: 'owner', content: replyText, timestamp: new Date().toISOString(), sender_name: 'Support Team' }
      ];
      await base44.entities.SupportConversation.update(conversationId, {
        messages: updatedMessages,
        status: 'owner_replied',
        owner_reply: replyText,
        needs_owner_attention: false
      });
      if (userEmail) {
        await base44.integrations.Core.SendEmail({
          to: userEmail,
          subject: 'Reply from ProfitShield Support',
          body: `Hi,\n\nYou have a new reply from the ProfitShield support team:\n\n"${replyText}"\n\nYou can continue the conversation by opening the Help chat in ProfitShield.\n\n— ProfitShield Support Team`
        });
      }
    },
    onSuccess: () => {
      toast.success('Reply sent');
      setReply('');
      queryClient.invalidateQueries(['support-conversations']);
    }
  });

  const closeMutation = useMutation({
    mutationFn: (id) => base44.entities.SupportConversation.update(id, { status: 'closed' }),
    onSuccess: () => {
      toast.success('Ticket closed');
      queryClient.invalidateQueries(['support-conversations']);
      setSelected(null);
    }
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 0 20px rgba(99,102,241,0.4)' }}>
              <Shield className="w-4 h-4 text-white" />
            </div>
            AI Support Control Center
          </h1>
          <p className="text-slate-400 text-sm mt-0.5 flex items-center gap-2">
            <Mail className="w-3.5 h-3.5" />
            support@profitshield.ai · Watchdog + Guardian + Self-Healing Active
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-white/10 text-slate-300"
            onClick={() => { queryClient.invalidateQueries(['support-conversations']); queryClient.invalidateQueries(['support-repair-logs']); }}
          >
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => watchdogMutation.mutate()}
            disabled={watchdogMutation.isPending}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            <Play className="w-4 h-4 mr-2" />
            {watchdogMutation.isPending ? 'Running...' : 'Run Watchdog Now'}
          </Button>
        </div>
      </div>

      {/* Support Email Info */}
      <div className="rounded-xl p-4 flex items-center gap-4 flex-wrap"
        style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}>
          <Mail className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <p className="font-medium text-indigo-300">Support Email: support@profitshield.ai</p>
          <p className="text-xs text-slate-400 mt-0.5">All AI-unresolvable tickets are forwarded to your admin email. You receive alerts when human intervention is needed.</p>
        </div>
        <div className="ml-auto flex gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1"><Activity className="w-3 h-3 text-emerald-400" /> Watchdog Active</span>
          <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-amber-400" /> Guardian Enabled</span>
          <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-400" /> Self-Healing On</span>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total Tickets',   value: stats.total,           icon: MessageCircle, color: 'text-indigo-400',  bg: 'rgba(99,102,241,0.1)' },
          { label: 'Need Attention',  value: stats.escalated,       icon: AlertTriangle, color: 'text-red-400',    bg: 'rgba(239,68,68,0.1)' },
          { label: 'Open',            value: stats.open,            icon: Clock,         color: 'text-amber-400',  bg: 'rgba(245,158,11,0.1)' },
          { label: 'AI Resolved',     value: stats.aiResolved,      icon: CheckCircle2,  color: 'text-emerald-400',bg: 'rgba(16,185,129,0.1)' },
          { label: 'Auto-Fix Used',   value: stats.autoFixTriggered,icon: Wrench,        color: 'text-violet-400', bg: 'rgba(139,92,246,0.1)' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4 glass-card">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-lg" style={{ background: s.bg }}>
                <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
              </div>
              <p className="text-xs text-slate-400">{s.label}</p>
            </div>
            <p className="text-2xl font-bold text-slate-100">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Escalation Alert Banner */}
      {stats.escalated > 0 && (
        <div className="rounded-xl p-4 flex items-center gap-3"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
          <Bell className="w-5 h-5 text-red-400 flex-shrink-0 animate-pulse" />
          <div className="flex-1">
            <p className="font-medium text-red-300">{stats.escalated} ticket{stats.escalated > 1 ? 's' : ''} need your personal attention</p>
            <p className="text-sm text-red-400/70">AI could not resolve these — admin email alert sent</p>
          </div>
          <Button size="sm" className="bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30"
            onClick={() => setFilter('escalated')}>
            View Now
          </Button>
        </div>
      )}

      <Tabs defaultValue="inbox">
        <TabsList className="bg-white/5 border border-white/10">
          <TabsTrigger value="inbox" className="data-[state=active]:bg-indigo-500/20 data-[state=active]:text-indigo-300">
            <Inbox className="w-3.5 h-3.5 mr-1.5" /> Inbox
            {stats.escalated > 0 && <span className="ml-1.5 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">{stats.escalated}</span>}
          </TabsTrigger>
          <TabsTrigger value="repairs" className="data-[state=active]:bg-indigo-500/20 data-[state=active]:text-indigo-300">
            <Wrench className="w-3.5 h-3.5 mr-1.5" /> Repair Logs
          </TabsTrigger>
        </TabsList>

        {/* INBOX TAB */}
        <TabsContent value="inbox" className="mt-4">
          <div className="grid lg:grid-cols-5 gap-4" style={{ minHeight: 500 }}>
            {/* List */}
            <div className="lg:col-span-2 glass-card rounded-xl overflow-hidden flex flex-col">
              <div className="flex gap-1 p-2 border-b border-white/5 flex-wrap">
                {['all', 'escalated', 'open', 'ai_resolved', 'closed'].map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${filter === f ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'text-slate-400 hover:text-slate-200'}`}>
                    {f === 'all' ? 'All' : f === 'escalated' ? '🚨 Escalated' : f === 'ai_resolved' ? '✅ AI Done' : f === 'open' ? 'Open' : 'Closed'}
                  </button>
                ))}
              </div>
              <ScrollArea className="flex-1">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="w-5 h-5 animate-spin text-slate-400" />
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="text-center py-12">
                    <MessageCircle className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-slate-500 text-sm">No tickets yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {conversations.map(conv => (
                      <button key={conv.id} onClick={() => setSelected(conv)}
                        className={`w-full text-left p-4 hover:bg-white/5 transition-all ${selected?.id === conv.id ? 'bg-white/5 border-l-2 border-indigo-500' : ''}`}>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="font-medium text-sm text-slate-200 truncate">{conv.user_email || 'Anonymous'}</span>
                          {conv.needs_owner_attention && <span className="w-2 h-2 bg-red-400 rounded-full flex-shrink-0 mt-1 animate-pulse" />}
                        </div>
                        <p className="text-xs text-slate-400 truncate mb-2">{conv.issue_summary || 'Support conversation'}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_CONFIG[conv.status]?.color}`}>
                            {STATUS_CONFIG[conv.status]?.label}
                          </span>
                          {conv.auto_fix_triggered && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400">
                              <Wrench className="w-2.5 h-2.5 inline" /> Fix
                            </span>
                          )}
                          <span className="text-xs text-slate-500 ml-auto">
                            {conv.created_date ? formatDistanceToNow(new Date(conv.created_date), { addSuffix: true }) : ''}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Detail */}
            <div className="lg:col-span-3 glass-card rounded-xl flex flex-col">
              {!selected ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                  <MessageCircle className="w-12 h-12 text-slate-700 mb-3" />
                  <p className="text-slate-500 font-medium">Select a ticket to view</p>
                </div>
              ) : (
                <>
                  <div className="p-4 border-b border-white/5 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-200">{selected.user_email || 'Anonymous'}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{selected.issue_summary}</p>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_CONFIG[selected.status]?.color}`}>
                          {STATUS_CONFIG[selected.status]?.label}
                        </span>
                        {selected.priority && (
                          <span className={`text-xs ${PRIORITY_COLOR[selected.priority]}`}>
                            ● {selected.priority}
                          </span>
                        )}
                        {selected.auto_fix_triggered && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/20">
                            <Wrench className="w-3 h-3 inline mr-1" />Auto-fix triggered
                          </span>
                        )}
                      </div>
                    </div>
                    {selected.status !== 'closed' && (
                      <Button size="sm" variant="outline" className="border-white/10 text-slate-400"
                        onClick={() => closeMutation.mutate(selected.id)}>
                        <X className="w-3 h-3 mr-1" /> Close
                      </Button>
                    )}
                  </div>

                  {selected.ai_resolution && (
                    <div className="mx-4 mt-3 p-3 rounded-lg text-xs" style={{ background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.2)' }}>
                      <p className="text-emerald-400 font-medium flex items-center gap-1.5 mb-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> AI Resolution Summary
                      </p>
                      <p className="text-slate-300">{selected.ai_resolution}</p>
                    </div>
                  )}

                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-3">
                      {(selected.messages || []).map((msg, i) => (
                        <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                            msg.role === 'user' ? 'bg-indigo-500/20 text-indigo-300' :
                            msg.role === 'owner' ? 'bg-violet-500/20 text-violet-300' :
                            'bg-slate-700 text-slate-300'
                          }`}>
                            {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> :
                             msg.role === 'owner' ? 'Y' : <Bot className="w-3.5 h-3.5" />}
                          </div>
                          <div className={`max-w-[80%] p-3 rounded-xl text-sm ${
                            msg.role === 'user' ? 'bg-indigo-500/15 text-slate-200 rounded-tr-sm' :
                            msg.role === 'owner' ? 'bg-violet-500/15 text-slate-200 rounded-tl-sm border border-violet-500/20' :
                            'bg-white/5 text-slate-300 rounded-tl-sm'
                          }`}>
                            {msg.role === 'owner' && <p className="text-xs text-violet-400 mb-1 font-medium">You (Support Team)</p>}
                            <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                            {msg.timestamp && <p className="text-xs text-slate-500 mt-1">{format(new Date(msg.timestamp), 'h:mm a')}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>

                  {selected.status !== 'closed' && (
                    <div className="p-4 border-t border-white/5">
                      <Textarea value={reply} onChange={e => setReply(e.target.value)}
                        placeholder="Reply to user... (they'll receive this via email)"
                        className="bg-white/5 border-white/10 text-slate-200 placeholder:text-slate-500 mb-2 resize-none" rows={3} />
                      <div className="flex justify-end">
                        <Button
                          onClick={() => replyMutation.mutate({ conversationId: selected.id, replyText: reply, userEmail: selected.user_email })}
                          disabled={!reply.trim() || replyMutation.isPending}
                          className="bg-indigo-600 hover:bg-indigo-700">
                          <Send className="w-4 h-4 mr-2" />
                          {replyMutation.isPending ? 'Sending...' : 'Send Reply'}
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </TabsContent>

        {/* REPAIR LOGS TAB */}
        <TabsContent value="repairs" className="mt-4">
          <div className="glass-card rounded-xl overflow-hidden">
            <div className="p-4 border-b border-white/5">
              <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-400" />
                Guardian & Self-Healing Activity Log
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Autonomous repair actions taken by the AI guardian system</p>
            </div>
            <ScrollArea className="h-96">
              {repairLogs.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                  <p className="text-slate-500 text-sm">No repair actions logged yet</p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {repairLogs.map(log => (
                    <div key={log.id} className="p-4 flex items-start gap-3 hover:bg-white/3 transition-colors">
                      <div className={`p-1.5 rounded-lg flex-shrink-0 ${
                        log.severity === 'high' || log.severity === 'critical' ? 'bg-red-500/15' :
                        log.severity === 'medium' ? 'bg-amber-500/15' : 'bg-emerald-500/15'
                      }`}>
                        <Zap className={`w-3.5 h-3.5 ${
                          log.severity === 'high' || log.severity === 'critical' ? 'text-red-400' :
                          log.severity === 'medium' ? 'text-amber-400' : 'text-emerald-400'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-200">{log.action?.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{log.description}</p>
                        {log.metadata && (
                          <p className="text-xs text-slate-500 mt-1">{JSON.stringify(log.metadata).slice(0, 100)}</p>
                        )}
                      </div>
                      <span className="text-xs text-slate-500 flex-shrink-0">
                        {log.created_date ? formatDistanceToNow(new Date(log.created_date), { addSuffix: true }) : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}