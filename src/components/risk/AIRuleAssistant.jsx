/**
 * AIRuleAssistant
 * 
 * Two-mode AI panel embedded inside CustomRiskRulesManager:
 *   1. Suggest mode   — analyses store data and proposes ready-to-use rules
 *   2. Chat mode      — conversational assistant for building a custom rule
 */

import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Brain, Sparkles, Send, ChevronRight, Check, RefreshCw,
  MessageSquare, Lightbulb, Loader2, X, ArrowRight, Shield
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const SUGGESTION_STARTERS = [
  'Suggest rules based on my store data',
  'Help me flag high-value first orders',
  'Create a rule for international shipping risk',
  'Detect discount code abuse',
  'Flag orders from high-risk countries',
];

export default function AIRuleAssistant({ tenantId, onApplyRule, onClose }) {
  const [mode, setMode] = useState('home'); // 'home' | 'suggest' | 'chat'
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [draftRule, setDraftRule] = useState(null);
  const [appliedIds, setAppliedIds] = useState(new Set());
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // ── SUGGEST mode ────────────────────────────────────────────────────────
  const runSuggest = async () => {
    setMode('suggest');
    setLoading(true);
    setSuggestions([]);
    try {
      const { data } = await base44.functions.invoke('aiRuleAssistant', {
        action: 'suggest',
        tenant_id: tenantId
      });
      setSuggestions(data.suggestions || []);
    } catch (e) {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  // ── CHAT mode ────────────────────────────────────────────────────────────
  const startChat = (initialMessage = '') => {
    setMode('chat');
    setMessages([]);
    setDraftRule(null);
    if (initialMessage) {
      sendMessage(initialMessage, []);
    }
  };

  const sendMessage = async (text, existingMessages) => {
    const userMsg = text || input.trim();
    if (!userMsg || loading) return;
    setInput('');

    const history = existingMessages ?? messages;
    const newMessages = [...history, { role: 'user', content: userMsg }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const { data } = await base44.functions.invoke('aiRuleAssistant', {
        action: 'refine',
        tenant_id: tenantId,
        message: userMsg,
        draft_rule: draftRule,
        conversation_history: history
      });

      setMessages(prev => [...prev, { role: 'assistant', content: data.reply || '' }]);
      if (data.updated_rule) {
        setDraftRule(data.updated_rule);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleApplySuggestion = (suggestion, idx) => {
    onApplyRule({
      name: suggestion.name,
      description: suggestion.description || '',
      is_active: true,
      priority: 50,
      conditions: suggestion.conditions || [],
      risk_adjustment: suggestion.risk_adjustment || 10,
      action: suggestion.action || 'flag',
      notification: suggestion.notification !== false,
      shopify_action_type: 'none',
      shopify_action_config: {}
    });
    setAppliedIds(prev => new Set([...prev, idx]));
  };

  const handleApplyDraft = () => {
    if (!draftRule) return;
    onApplyRule({
      name: draftRule.name || 'AI Generated Rule',
      description: draftRule.description || '',
      is_active: true,
      priority: 50,
      conditions: draftRule.conditions || [],
      risk_adjustment: draftRule.risk_adjustment || 10,
      action: draftRule.action || 'flag',
      notification: draftRule.notification !== false,
      shopify_action_type: 'none',
      shopify_action_config: {}
    });
  };

  const actionColors = {
    flag: 'bg-violet-500/15 text-violet-400 border-violet-500/25',
    hold: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
    verify: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
    cancel: 'bg-red-500/15 text-red-400 border-red-500/25',
    none: 'bg-slate-500/15 text-slate-400 border-slate-500/25'
  };

  // ── HOME ─────────────────────────────────────────────────────────────────
  if (mode === 'home') {
    return (
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-indigo-500/20 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
              <Brain className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <p className="font-semibold text-white text-sm">AI Rule Assistant</p>
              <p className="text-xs text-slate-500">Powered by AI · suggests & builds rules for you</p>
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={runSuggest}
            className="flex flex-col items-start gap-2 p-4 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-xl transition-all text-left group"
          >
            <Sparkles className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition-transform" />
            <p className="text-sm font-semibold text-white">Suggest Rules</p>
            <p className="text-xs text-slate-400">AI analyses your order data and recommends rules</p>
          </button>

          <button
            onClick={() => startChat()}
            className="flex flex-col items-start gap-2 p-4 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 rounded-xl transition-all text-left group"
          >
            <MessageSquare className="w-5 h-5 text-violet-400 group-hover:scale-110 transition-transform" />
            <p className="text-sm font-semibold text-white">Build a Rule</p>
            <p className="text-xs text-slate-400">Chat with AI to define a custom rule step by step</p>
          </button>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-2">Quick starts</p>
          {SUGGESTION_STARTERS.map((s, i) => (
            <button
              key={i}
              onClick={() => startChat(s)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors group"
            >
              <ChevronRight className="w-3 h-3 text-slate-600 group-hover:text-indigo-400 transition-colors" />
              {s}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── SUGGEST ───────────────────────────────────────────────────────────────
  if (mode === 'suggest') {
    return (
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-indigo-500/20 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span className="font-semibold text-sm text-white">AI Suggestions</span>
          </div>
          <div className="flex gap-2">
            <button onClick={runSuggest} className="text-slate-500 hover:text-indigo-400 transition-colors" title="Regenerate">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setMode('home')} className="text-slate-500 hover:text-slate-300 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3 max-h-[480px] overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center animate-pulse">
                <Brain className="w-5 h-5 text-indigo-400" />
              </div>
              <p className="text-sm text-slate-400">Analysing your order data…</p>
            </div>
          ) : suggestions.length === 0 ? (
            <p className="text-center text-slate-500 text-sm py-8">No suggestions generated. Try again.</p>
          ) : suggestions.map((s, i) => (
            <div key={i} className="bg-slate-800/60 border border-white/6 rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="text-sm font-semibold text-white">{s.name}</p>
                    <Badge className={`text-[11px] border ${actionColors[s.action] || actionColors.flag}`}>
                      {s.action}
                    </Badge>
                    <Badge className="text-[11px] border bg-rose-500/10 text-rose-400 border-rose-500/20">
                      +{s.risk_adjustment} pts
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400">{s.description}</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleApplySuggestion(s, i)}
                  disabled={appliedIds.has(i)}
                  className={`shrink-0 h-8 text-xs gap-1.5 ${appliedIds.has(i)
                    ? 'bg-emerald-600 hover:bg-emerald-600 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
                >
                  {appliedIds.has(i) ? <><Check className="w-3 h-3" /> Applied</> : <><ArrowRight className="w-3 h-3" /> Use Rule</>}
                </Button>
              </div>

              {s.rationale && (
                <p className="text-xs text-slate-500 italic border-l-2 border-slate-700 pl-3">{s.rationale}</p>
              )}

              <div className="flex flex-wrap gap-1.5">
                {(s.conditions || []).map((c, ci) => (
                  <span key={ci} className="text-[11px] font-mono bg-slate-700/60 text-slate-300 px-2 py-0.5 rounded-md">
                    {c.field} {c.operator.replace('_', ' ')} {c.value}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-white/5 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setMode('chat')}
            className="text-xs gap-1.5 border-slate-700 text-slate-300"
          >
            <MessageSquare className="w-3 h-3" /> Chat instead
          </Button>
        </div>
      </div>
    );
  }

  // ── CHAT ──────────────────────────────────────────────────────────────────
  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-violet-500/20 rounded-xl overflow-hidden flex flex-col" style={{ minHeight: 380, maxHeight: 520 }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-violet-400" />
          <span className="font-semibold text-sm text-white">Rule Builder</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setMode('home'); setMessages([]); setDraftRule(null); }}
            className="text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && !loading && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg bg-violet-500/20 flex items-center justify-center shrink-0 mt-0.5">
              <Brain className="w-3.5 h-3.5 text-violet-400" />
            </div>
            <div className="bg-slate-800/60 rounded-xl rounded-tl-sm px-3 py-2.5 text-sm text-slate-300 max-w-xs">
              Hi! Tell me what kind of orders you want to flag or block. I'll help you build the rule. What pattern concerns you?
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex items-start gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {m.role === 'assistant' && (
              <div className="w-7 h-7 rounded-lg bg-violet-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Brain className="w-3.5 h-3.5 text-violet-400" />
              </div>
            )}
            <div className={`rounded-xl px-3 py-2.5 text-sm max-w-[80%] ${
              m.role === 'user'
                ? 'bg-indigo-600 text-white rounded-tr-sm'
                : 'bg-slate-800/60 text-slate-300 rounded-tl-sm'
            }`}>
              {m.role === 'assistant'
                ? <ReactMarkdown className="prose prose-sm prose-invert max-w-none [&>p]:m-0 [&>ul]:mt-1 [&>ul]:mb-0">{m.content}</ReactMarkdown>
                : m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg bg-violet-500/20 flex items-center justify-center shrink-0 mt-0.5">
              <Brain className="w-3.5 h-3.5 text-violet-400" />
            </div>
            <div className="bg-slate-800/60 rounded-xl rounded-tl-sm px-3 py-2.5">
              <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Draft rule preview */}
      {draftRule && (
        <div className="mx-4 mb-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-xs font-semibold text-indigo-300">Draft Rule Ready</span>
            </div>
            <Button
              size="sm"
              onClick={handleApplyDraft}
              className="h-6 text-[11px] bg-indigo-600 hover:bg-indigo-700 text-white px-2 gap-1"
            >
              <Check className="w-3 h-3" /> Apply
            </Button>
          </div>
          <p className="text-xs text-white font-medium">{draftRule.name}</p>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {(draftRule.conditions || []).map((c, ci) => (
              <span key={ci} className="text-[10px] font-mono bg-slate-700/60 text-slate-300 px-1.5 py-0.5 rounded">
                {c.field} {c.operator?.replace('_', ' ')} {c.value}
              </span>
            ))}
            {draftRule.action && (
              <Badge className={`text-[10px] border ${actionColors[draftRule.action] || actionColors.flag}`}>
                {draftRule.action}
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-4 flex gap-2">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          placeholder="Describe what you want to flag…"
          className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-600 text-sm h-9"
          disabled={loading}
        />
        <Button
          size="sm"
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading}
          className="bg-violet-600 hover:bg-violet-700 h-9 w-9 p-0 shrink-0"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}