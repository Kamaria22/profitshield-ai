import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { usePlatformResolver } from '@/components/usePlatformResolver';
import { SupportTicketQueue } from '@/components/support/emailSupportService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { MessageCircle, Upload, Loader2 } from 'lucide-react';

const CATEGORIES = [
  { value: 'general', label: 'General Question' },
  { value: 'billing', label: 'Billing' },
  { value: 'bug', label: 'Bug Report' },
  { value: 'integration', label: 'Integration' },
  { value: 'risk', label: 'Risk & Alerts' },
];

function buildAiResponse(category) {
  const base = 'Thanks for contacting ProfitShield support. I logged this ticket and started initial diagnostics.';
  if (category === 'bug') {
    return `${base} We will prioritize bug analysis and update you when the fix path is confirmed.`;
  }
  if (category === 'billing') {
    return `${base} Billing checks are running now. We will confirm plan and invoice details shortly.`;
  }
  if (category === 'integration') {
    return `${base} Integration health checks are in progress and we will follow up with next steps.`;
  }
  return `${base} If additional admin action is required, this ticket will be escalated automatically.`;
}

function statusTone(status) {
  switch (status) {
    case 'ai_resolved':
      return 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30';
    case 'escalated':
      return 'bg-red-500/15 text-red-300 border border-red-500/30';
    case 'owner_replied':
      return 'bg-violet-500/15 text-violet-300 border border-violet-500/30';
    case 'closed':
      return 'bg-slate-500/15 text-slate-300 border border-slate-500/30';
    default:
      return 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30';
  }
}

export default function MerchantSupportForm() {
  const queryClient = useQueryClient();
  const resolver = usePlatformResolver();
  const { user } = useAuth();

  const tenantId = resolver?.tenantId || user?.tenant_id || null;
  const userEmail = user?.email || resolver?.user?.email || null;
  const userName = user?.full_name || user?.name || null;

  const [category, setCategory] = useState('general');
  const [message, setMessage] = useState('');
  const [screenshotFile, setScreenshotFile] = useState(null);

  const listQueryKey = useMemo(() => ['merchant-support-conversations', tenantId, userEmail], [tenantId, userEmail]);

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: listQueryKey,
    queryFn: async () => {
      if (!tenantId || !userEmail) return [];
      return base44.entities.SupportConversation.filter({ tenant_id: tenantId, user_email: userEmail }, '-created_date', 50);
    },
    enabled: !!tenantId && !!userEmail,
    refetchInterval: 30000,
  });

  const submitTicket = useMutation({
    mutationFn: async () => {
      if (!tenantId || !userEmail) throw new Error('Unable to identify your tenant or account.');
      const trimmed = message.trim();
      if (!trimmed) throw new Error('Please enter a support message.');

      const aiResolution = buildAiResponse(category);
      const userMessage = {
        role: 'user',
        content: trimmed,
        timestamp: new Date().toISOString(),
        sender_name: userName || userEmail,
      };
      const aiMessage = {
        role: 'assistant',
        content: aiResolution,
        timestamp: new Date().toISOString(),
        sender_name: 'ProfitShield AI Support',
      };

      if (screenshotFile) {
        userMessage.attachment = {
          type: 'image',
          name: screenshotFile.name,
          size: screenshotFile.size,
          mime: screenshotFile.type || 'image/*',
        };
      }

      await SupportTicketQueue.createTicket({
        tenantId,
        userEmail,
        userName,
        issueSummary: trimmed.slice(0, 140),
        issueType: category,
        priority: category === 'bug' ? 'high' : 'medium',
        messages: [userMessage, aiMessage],
        aiResolution,
        autoFixTriggered: false,
        needsOwnerAttention: false,
      });
    },
    onSuccess: () => {
      toast.success('Support request submitted. AI response added to your ticket.');
      setMessage('');
      setCategory('general');
      setScreenshotFile(null);
      queryClient.invalidateQueries({ queryKey: listQueryKey });
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to submit support request');
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-indigo-400" />
            Contact Support
          </CardTitle>
          <CardDescription>
            Send a message to support and track your ticket status and AI responses.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-slate-300">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full h-10 rounded-md border border-white/10 bg-black/20 px-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            >
              {CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-slate-300">Message</label>
            <Textarea
              placeholder="Describe the issue and what happened."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-slate-300">Optional Screenshot</label>
            <div className="flex items-center gap-3">
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setScreenshotFile(e.target.files?.[0] || null)}
              />
              <Upload className="w-4 h-4 text-slate-500" />
            </div>
            {screenshotFile && (
              <p className="text-xs text-slate-500">Attached: {screenshotFile.name}</p>
            )}
          </div>

          <Button
            className="bg-indigo-600 hover:bg-indigo-700"
            onClick={() => submitTicket.mutate()}
            disabled={submitTicket.isPending}
          >
            {submitTicket.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Submit Support Message
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your Tickets</CardTitle>
          <CardDescription>Only tickets from your own account are shown here.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading tickets...</p>
          ) : conversations.length === 0 ? (
            <p className="text-sm text-slate-500">No support tickets yet.</p>
          ) : (
            conversations.map((conversation) => (
              <div key={conversation.id} className="rounded-lg border border-white/10 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-slate-200 line-clamp-1">{conversation.issue_summary || 'Support request'}</p>
                  <Badge className={statusTone(conversation.status)}>{conversation.status || 'open'}</Badge>
                </div>
                {conversation.ai_resolution && (
                  <p className="text-xs text-slate-400">AI Response: {conversation.ai_resolution}</p>
                )}
                <p className="text-xs text-slate-500">
                  Updated: {new Date(conversation.updated_date || conversation.created_date).toLocaleString()}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
