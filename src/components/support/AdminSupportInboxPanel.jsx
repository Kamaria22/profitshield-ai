/**
 * AdminSupportInboxPanel
 * Compact widget for FounderDashboard — shows live support stats + link to full inbox
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/components/platformContext';
import { MessageCircle, AlertTriangle, CheckCircle2, Clock, Mail, ExternalLink, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { usePlatformResolver } from '@/components/usePlatformResolver';

function isAdminOwner(user) {
  const role = (user?.role || user?.app_role || '').toLowerCase();
  return role === 'owner' || role === 'admin';
}

export default function AdminSupportInboxPanel() {
  const { user } = useAuth();
  const resolver = usePlatformResolver();
  const location = useLocation();
  const effectiveUser = user || resolver?.user || null;
  const canAccess = isAdminOwner(effectiveUser);

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ['support-inbox-widget'],
    queryFn: () => base44.entities.SupportConversation.filter({}, '-created_date', 200),
    refetchInterval: canAccess ? 30000 : false,
    staleTime: 20000,
    enabled: canAccess
  });

  if (!canAccess) {
    return (
      <div className="rounded-xl p-4" style={{ background: 'rgba(15,20,40,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-sm text-slate-300">Admin access required for the support inbox.</p>
      </div>
    );
  }

  const today = new Date().toDateString();
  const stats = {
    unread: conversations.filter(c => c.needs_owner_attention).length,
    aiResolvedToday: conversations.filter(c => 
      c.status === 'ai_resolved' && 
      new Date(c.updated_date || c.created_date).toDateString() === today
    ).length,
    pendingAdmin: conversations.filter(c => c.status === 'escalated' || c.needs_owner_attention).length,
    total: conversations.length,
    open: conversations.filter(c => c.status === 'open').length,
  };
  const unresolved = conversations
    .filter((c) => c.needs_owner_attention || c.status === 'open' || c.status === 'escalated')
    .slice(0, 4);

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: 'rgba(15,20,40,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 0 12px rgba(99,102,241,0.35)' }}>
            <Mail className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-200 text-sm flex items-center gap-2">
              Support Inbox
              {stats.unread > 0 && (
                <span className="px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full font-bold animate-pulse">
                  {stats.unread}
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500">support@profitshield.ai</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-emerald-400">
          <Activity className="w-3 h-3" />
          <span>Watchdog Active</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-px" style={{ background: 'rgba(255,255,255,0.03)' }}>
        {[
          { label: 'Unread',          value: stats.unread,         color: stats.unread > 0 ? 'text-red-400' : 'text-slate-300',    icon: AlertTriangle, urgent: stats.unread > 0 },
          { label: 'AI Resolved Today', value: stats.aiResolvedToday, color: 'text-emerald-400', icon: CheckCircle2 },
          { label: 'Pending Admin',   value: stats.pendingAdmin,   color: stats.pendingAdmin > 0 ? 'text-amber-400' : 'text-slate-300', icon: Clock, urgent: stats.pendingAdmin > 0 },
          { label: 'Total Tickets',   value: stats.total,          color: 'text-indigo-400',   icon: MessageCircle },
        ].map(s => (
          <div key={s.label} className="p-3" style={{ background: 'rgba(15,20,40,0.5)' }}>
            <div className="flex items-center gap-1.5 mb-1">
              <s.icon className={`w-3 h-3 ${s.color} ${s.urgent ? 'animate-pulse' : ''}`} />
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
            <p className={`text-xl font-bold ${s.color}`}>{isLoading ? '–' : s.value}</p>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="p-3 space-y-2">
        {unresolved.length > 0 && (
          <div className="rounded-lg border border-white/10 p-2">
            <p className="text-xs text-slate-400 mb-2">Needs response</p>
            <div className="space-y-1.5">
              {unresolved.map((ticket) => {
                const baseUrl = createPageUrl('SupportInbox', location.search);
                const to = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}conversation=${encodeURIComponent(ticket.id)}`;
                return (
                  <Link key={ticket.id} to={to} className="block">
                    <div className="flex items-center justify-between rounded-md border border-white/10 px-2 py-1.5 hover:border-indigo-500/40">
                      <span className="text-xs text-slate-200 truncate pr-2">{ticket.user_email || ticket.issue_summary || 'Support ticket'}</span>
                      <span className="text-[11px] text-indigo-300">Reply</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
        <Link to={createPageUrl('SupportInbox', location.search)}>
          <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm" size="sm">
            <ExternalLink className="w-3.5 h-3.5 mr-2" />
            Open Support Inbox
            {stats.unread > 0 && (
              <span className="ml-2 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">{stats.unread}</span>
            )}
          </Button>
        </Link>
      </div>
    </div>
  );
}
