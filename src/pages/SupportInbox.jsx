import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { formatDistanceToNow, format } from 'date-fns';
import {
  MessageCircle, AlertTriangle, CheckCircle2, Clock, Wrench,
  Send, RefreshCw, User, Bot, Bell, X, ChevronRight, Filter, Inbox
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

const STATUS_CONFIG = {
  open:          { label: 'Open',          color: 'bg-blue-500/15 text-blue-300 border-blue-500/20' },
  ai_resolved:   { label: 'AI Resolved',   color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20' },
  escalated:     { label: 'Needs You',     color: 'bg-red-500/15 text-red-300 border-red-500/20' },
  owner_replied: { label: 'You Replied',   color: 'bg-violet-500/15 text-violet-300 border-violet-500/20' },
  closed:        { label: 'Closed',        color: 'bg-slate-500/15 text-slate-400 border-slate-500/20' },
};

const PRIORITY_COLOR = {
  low:      'bg-slate-500/15 text-slate-400',
  medium:   'bg-blue-500/15 text-blue-300',
  high:     'bg-amber-500/15 text-amber-300',
  critical: 'bg-red-500/15 text-red-300',
};

export default function SupportInbox() {
  const [selected, setSelected] = useState(null);
  const [reply, setReply] = useState('');
  const [filter, setFilter] = useState('all');
  const queryClient = useQueryClient();

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ['support-conversations', filter],
    queryFn: async () => {
      const query = filter === 'all' ? {} : filter === 'escalated' 
        ? { needs_owner_attention: true }
        : { status: filter };
      return base44.entities.SupportConversation.filter(query, '-created_date', 100);
    },
    refetchInterval: 30000
  });

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
      // Send email to user if email exists
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
      // Refresh selected
      if (selected) {
        base44.entities.SupportConversation.filter({ id: selected.id }).then(r => r[0] && setSelected(r[0]));
      }
    }
  });

  const closeMutation = useMutation({
    mutationFn: async (id) => base44.entities.SupportConversation.update(id, { status: 'closed' }),
    onSuccess: () => { toast.success('Conversation closed'); queryClient.invalidateQueries(['support-conversations']); setSelected(null); }
  });

  const stats = {
    total: conversations.length,
    escalated: conversations.filter(c => c.needs_owner_attention).length,
    open: conversations.filter(c => c.status === 'open').length,
    aiResolved: conversations.filter(c => c.status === 'ai_resolved').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Inbox className="w-6 h-6 text-indigo-400" />
            Support Inbox
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">All user support conversations — chat, AI actions & escalations</p>
        </div>
        <Button variant="outline" size="sm" className="border-white/10 text-slate-300"
          onClick={() => queryClient.invalidateQueries(['support-conversations'])}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: stats.total, icon: MessageCircle, color: 'text-indigo-400' },
          { label: 'Need Attention', value: stats.escalated, icon: AlertTriangle, color: 'text-red-400' },
          { label: 'Open', value: stats.open, icon: Clock, color: 'text-amber-400' },
          { label: 'AI Resolved', value: stats.aiResolved, icon: CheckCircle2, color: 'text-emerald-400' },
        ].map(s => (
          <div key={s.label} className="glass-card rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={`w-4 h-4 ${s.color}`} />
              <p className="text-xs text-slate-400">{s.label}</p>
            </div>
            <p className="text-2xl font-bold text-slate-100">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Escalation Alert */}
      {stats.escalated > 0 && (
        <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
          <Bell className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div>
            <p className="font-medium text-red-300">{stats.escalated} conversation{stats.escalated > 1 ? 's' : ''} need your personal attention</p>
            <p className="text-sm text-red-400/70">AI could not resolve these — user may need a direct response from you</p>
          </div>
          <Button size="sm" className="ml-auto bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30"
            onClick={() => setFilter('escalated')}>
            View Now
          </Button>
        </div>
      )}

      {/* Main Panel */}
      <div className="grid lg:grid-cols-5 gap-4" style={{ minHeight: '500px' }}>
        {/* Conversation List */}
        <div className="lg:col-span-2 glass-card rounded-xl overflow-hidden flex flex-col">
          {/* Filter Tabs */}
          <div className="flex gap-1 p-2 border-b border-white/5 flex-wrap">
            {['all', 'escalated', 'open', 'ai_resolved', 'closed'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${filter === f ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'text-slate-400 hover:text-slate-200'}`}>
                {f === 'all' ? 'All' : f === 'escalated' ? '🚨 Needs You' : f === 'ai_resolved' ? 'AI Done' : f === 'open' ? 'Open' : 'Closed'}
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
                <p className="text-slate-500 text-sm">No conversations yet</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {conversations.map(conv => (
                  <button key={conv.id} onClick={() => setSelected(conv)}
                    className={`w-full text-left p-4 hover:bg-white/5 transition-all ${selected?.id === conv.id ? 'bg-white/5 border-l-2 border-indigo-500' : ''}`}>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className="font-medium text-sm text-slate-200 truncate">{conv.user_email || 'Anonymous'}</span>
                      {conv.needs_owner_attention && <span className="w-2 h-2 bg-red-400 rounded-full flex-shrink-0 mt-1.5 animate-pulse" />}
                    </div>
                    <p className="text-xs text-slate-400 truncate mb-2">{conv.issue_summary || 'Support conversation'}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_CONFIG[conv.status]?.color}`}>
                        {STATUS_CONFIG[conv.status]?.label}
                      </span>
                      {conv.priority && conv.priority !== 'medium' && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLOR[conv.priority]}`}>
                          {conv.priority}
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

        {/* Conversation Detail */}
        <div className="lg:col-span-3 glass-card rounded-xl flex flex-col">
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <MessageCircle className="w-12 h-12 text-slate-700 mb-3" />
              <p className="text-slate-500 font-medium">Select a conversation</p>
              <p className="text-slate-600 text-sm mt-1">Click any conversation on the left to view full details</p>
            </div>
          ) : (
            <>
              {/* Conv Header */}
              <div className="p-4 border-b border-white/5 flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-200">{selected.user_email || 'Anonymous User'}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{selected.issue_summary || 'Support conversation'}</p>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_CONFIG[selected.status]?.color}`}>
                      {STATUS_CONFIG[selected.status]?.label}
                    </span>
                    {selected.auto_fix_triggered && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/20">
                        <Wrench className="w-3 h-3 inline mr-1" />Auto-fix triggered
                      </span>
                    )}
                    <span className="text-xs text-slate-500">
                      {selected.created_date ? format(new Date(selected.created_date), 'MMM d, yyyy h:mm a') : ''}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {selected.status !== 'closed' && (
                    <Button size="sm" variant="outline" className="border-white/10 text-slate-400 hover:text-slate-200"
                      onClick={() => closeMutation.mutate(selected.id)}>
                      <X className="w-3 h-3 mr-1" /> Close
                    </Button>
                  )}
                </div>
              </div>

              {/* AI Resolution Note */}
              {selected.ai_resolution && (
                <div className="mx-4 mt-3 p-3 rounded-lg text-xs" style={{ background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.2)' }}>
                  <p className="text-emerald-400 font-medium flex items-center gap-1.5 mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> AI Resolution Summary
                  </p>
                  <p className="text-slate-300">{selected.ai_resolution}</p>
                </div>
              )}

              {/* Messages */}
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
                         msg.role === 'owner' ? 'Y' :
                         <Bot className="w-3.5 h-3.5" />}
                      </div>
                      <div className={`max-w-[80%] p-3 rounded-xl text-sm ${
                        msg.role === 'user' ? 'bg-indigo-500/15 text-slate-200 rounded-tr-sm' :
                        msg.role === 'owner' ? 'bg-violet-500/15 text-slate-200 rounded-tl-sm border border-violet-500/20' :
                        'bg-white/5 text-slate-300 rounded-tl-sm'
                      }`}>
                        {msg.role === 'owner' && <p className="text-xs text-violet-400 mb-1 font-medium">You (Support Team)</p>}
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        {msg.timestamp && (
                          <p className="text-xs text-slate-500 mt-1.5">
                            {format(new Date(msg.timestamp), 'h:mm a')}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Reply Box */}
              {selected.status !== 'closed' && (
                <div className="p-4 border-t border-white/5">
                  <Textarea
                    value={reply}
                    onChange={e => setReply(e.target.value)}
                    placeholder="Type your reply to the user... (they'll receive it via email)"
                    className="bg-white/5 border-white/10 text-slate-200 placeholder:text-slate-500 mb-2 resize-none"
                    rows={3}
                  />
                  <div className="flex justify-end">
                    <Button
                      onClick={() => replyMutation.mutate({ conversationId: selected.id, replyText: reply, userEmail: selected.user_email })}
                      disabled={!reply.trim() || replyMutation.isPending}
                      className="bg-indigo-600 hover:bg-indigo-700"
                    >
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
    </div>
  );
}