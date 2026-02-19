import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MessageCircle, 
  X, 
  Send, 
  Bot, 
  User, 
  Loader2, 
  AlertTriangle,
  CheckCircle2,
  Wrench,
  Sparkles,
  HelpCircle,
  Shield,
  Mail
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

// Owner escalation email for critical issues
const OWNER_ESCALATION_EMAIL = 'owner@profitshieldAI.com';

const SYSTEM_CONTEXT = `You are ProfitShield's expert AI Support Assistant - the most knowledgeable and helpful support agent ever created.

CORE IDENTITY:
- You are an absolute expert on every feature of ProfitShield
- You provide precise, professional, and effective support
- You can diagnose issues and trigger automatic fixes
- You represent the highest standard of customer support

APP KNOWLEDGE:
- Dashboard: Central hub with Profit Integrity Score, metrics, alerts
- AI Insights: Customer segmentation, marketing campaigns, profit forensics
- Orders: Real-time risk scoring, fraud detection, profitability analysis
- Products: Cost mapping, margin tracking, pricing optimization
- Alerts: Smart notifications, customizable rules, multi-channel delivery
- Settings: Notification preferences, integrations, user management
- Automations: Auto-hold risky orders, dynamic pricing, discount creation

TIER FEATURES:
- Trial: Basic dashboard, 100 orders/month, email support
- Starter: 500 orders, risk scoring, basic reports
- Growth: 2000 orders, AI insights, segmentation, campaigns
- Pro: 10000 orders, full automation, priority support
- Enterprise: Unlimited, dedicated support, custom integrations

SUPPORT GUIDELINES:
1. Always be helpful, professional, and precise
2. Diagnose issues thoroughly before suggesting solutions
3. For technical issues, collect details then escalate to autonomous fix
4. Never make users wait - provide immediate value
5. If you detect a system issue, mark it for auto-fix
6. Always confirm resolution with the user`;

export default function TechSupportChat({ tenantId, isOpen, onClose, onOpen }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `👋 Welcome to ProfitShield Support!

I'm your AI assistant, here to help with anything you need. I have complete knowledge of all ProfitShield features and can:

• Answer questions about features & functionality
• Help troubleshoot issues
• Guide you through best practices
• Automatically fix technical problems

How can I help you today?`,
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const detectIssueType = (message) => {
    const lowerMsg = message.toLowerCase();
    if (lowerMsg.includes('error') || lowerMsg.includes('bug') || lowerMsg.includes('broken') || 
        lowerMsg.includes('not working') || lowerMsg.includes('crash') || lowerMsg.includes('fail')) {
      return 'technical';
    }
    if (lowerMsg.includes('how do') || lowerMsg.includes('how to') || lowerMsg.includes('where') || 
        lowerMsg.includes('what is') || lowerMsg.includes('explain')) {
      return 'question';
    }
    if (lowerMsg.includes('slow') || lowerMsg.includes('performance') || lowerMsg.includes('loading')) {
      return 'performance';
    }
    return 'general';
  };

  const triggerAutonomousFix = async (issueDescription, isCritical = false) => {
    setIsFixing(true);
    
    // Log the issue for the autonomous system
    try {
      await base44.entities.Task.create({
        tenant_id: tenantId,
        title: `[AUTO-FIX] ${issueDescription.slice(0, 50)}...`,
        description: `**Autonomous Fix Request**\n\nIssue: ${issueDescription}\n\nSource: Tech Support Chat\nPriority: Auto-escalated`,
        priority: isCritical ? 'critical' : 'high',
        status: 'pending',
        category: 'auto_fix',
        source: 'support_chat',
        is_auto_generated: true
      });

      await base44.entities.Alert.create({
        tenant_id: tenantId,
        alert_type: 'system_fix_requested',
        severity: isCritical ? 'critical' : 'medium',
        title: 'Autonomous Fix Initiated',
        message: issueDescription,
        status: 'pending',
        source: 'support_chat',
        is_auto_generated: true
      });

      // For critical issues, also escalate to owner via email
      if (isCritical) {
        await escalateToOwner(issueDescription, tenantId);
      }
    } catch (e) {
      console.error('Failed to create fix task:', e);
    }
    
    setIsFixing(false);
    return true;
  };

  const escalateToOwner = async (issueDescription, tid) => {
    try {
      await base44.integrations.Core.SendEmail({
        to: OWNER_ESCALATION_EMAIL,
        subject: `🚨 CRITICAL: ProfitShield Support Escalation - Tenant ${tid}`,
        body: `CRITICAL ISSUE ESCALATION

A critical issue has been reported that requires your personal attention.

TENANT ID: ${tid}
TIMESTAMP: ${new Date().toISOString()}

ISSUE DESCRIPTION:
${issueDescription}

This has been auto-escalated by the autonomous support system because:
- The issue is marked as critical
- Automatic fixes may not be sufficient
- User may require direct intervention

Please review and take appropriate action.

---
ProfitShield AI Autonomous Support System`
      });
      console.log('Owner escalation email sent to:', OWNER_ESCALATION_EMAIL);
    } catch (e) {
      console.error('Failed to send owner escalation:', e);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    
    setMessages(prev => [...prev, {
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    }]);

    setIsLoading(true);

    try {
      const issueType = detectIssueType(userMessage);
      const conversationHistory = messages.slice(-6).map(m => 
        `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
      ).join('\n');

      const prompt = `${SYSTEM_CONTEXT}

CONVERSATION HISTORY:
${conversationHistory}

USER MESSAGE: ${userMessage}

DETECTED ISSUE TYPE: ${issueType}

${issueType === 'technical' ? `
IMPORTANT: This appears to be a technical issue. 
1. Acknowledge the issue professionally
2. Ask clarifying questions if needed
3. If the issue is confirmed, indicate that you're initiating an automatic fix
4. Provide immediate workarounds if possible
5. Include "[AUTO_FIX_NEEDED]" in your response if automatic fixing is required
6. For CRITICAL issues (data loss, security, payments broken), add "[ESCALATE_OWNER]" to alert the founder
` : ''}

Respond helpfully and professionally. Be concise but thorough.`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            response: { type: "string" },
            needs_auto_fix: { type: "boolean" },
            issue_summary: { type: "string" },
            confidence: { type: "number" }
          }
        }
      });

      let aiResponse = response.response || response;
      let needsFix = response.needs_auto_fix || aiResponse.includes('[AUTO_FIX_NEEDED]');
      let needsOwnerEscalation = aiResponse.includes('[ESCALATE_OWNER]');
      
      // Clean up response
      if (typeof aiResponse === 'object') {
        aiResponse = aiResponse.response || JSON.stringify(aiResponse);
      }
      aiResponse = aiResponse.replace('[AUTO_FIX_NEEDED]', '').replace('[ESCALATE_OWNER]', '').trim();

      // If technical issue detected, trigger autonomous fix
      if (needsFix && issueType === 'technical') {
        await triggerAutonomousFix(response.issue_summary || userMessage, needsOwnerEscalation);
        aiResponse += `\n\n🔧 **Automatic Fix Initiated**\nI've escalated this to our autonomous repair system. The issue will be analyzed and fixed automatically. You'll receive a notification when complete.`;
        
        if (needsOwnerEscalation) {
          aiResponse += `\n\n📧 **Owner Notified**\nDue to the critical nature of this issue, the ProfitShield founder has been personally notified and will review your case.`;
        }
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date(),
        isFixing: needsFix
      }]);

    } catch (error) {
      console.error('Support chat error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `I apologize, but I encountered an issue processing your request. Please try again, or contact support@profitshield.ai for immediate assistance.`,
        timestamp: new Date(),
        isError: true
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Help Button */}
      <motion.button
        onClick={onOpen}
        className="fixed bottom-6 right-6 z-40 p-4 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-full shadow-lg hover:shadow-xl transition-shadow"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        aria-label="Open support chat"
      >
        <HelpCircle className="w-6 h-6" />
      </motion.button>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-6 z-50 w-96 max-w-[calc(100vw-3rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-4 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold">ProfitShield Support</h3>
                    <p className="text-xs text-white/80">AI-Powered • Always Online</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="h-80 p-4" ref={scrollRef}>
              <div className="space-y-4">
                {messages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                  >
                    <div className={`p-2 rounded-full flex-shrink-0 ${
                      msg.role === 'user' 
                        ? 'bg-emerald-100' 
                        : msg.isError ? 'bg-red-100' : 'bg-slate-100'
                    }`}>
                      {msg.role === 'user' ? (
                        <User className="w-4 h-4 text-emerald-600" />
                      ) : msg.isFixing ? (
                        <Wrench className="w-4 h-4 text-amber-600" />
                      ) : (
                        <Bot className={`w-4 h-4 ${msg.isError ? 'text-red-600' : 'text-slate-600'}`} />
                      )}
                    </div>
                    <div className={`flex-1 p-3 rounded-2xl text-sm ${
                      msg.role === 'user'
                        ? 'bg-emerald-500 text-white rounded-tr-sm'
                        : msg.isError 
                          ? 'bg-red-50 text-red-800 rounded-tl-sm'
                          : 'bg-slate-100 text-slate-800 rounded-tl-sm'
                    }`}>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      {msg.isFixing && (
                        <Badge className="mt-2 bg-amber-100 text-amber-700">
                          <Wrench className="w-3 h-3 mr-1" />
                          Auto-fix in progress
                        </Badge>
                      )}
                    </div>
                  </motion.div>
                ))}

                {isLoading && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex gap-3"
                  >
                    <div className="p-2 rounded-full bg-slate-100">
                      <Bot className="w-4 h-4 text-slate-600" />
                    </div>
                    <div className="p-3 rounded-2xl rounded-tl-sm bg-slate-100">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                        <span className="text-sm text-slate-500">Thinking...</span>
                      </div>
                    </div>
                  </motion.div>
                )}

                {isFixing && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm"
                  >
                    <div className="flex items-center gap-2 text-amber-700">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Autonomous repair system engaged...</span>
                    </div>
                  </motion.div>
                )}
              </div>
            </ScrollArea>

            {/* Input */}
            <div className="p-4 border-t border-slate-200">
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything..."
                  className="flex-1"
                  disabled={isLoading}
                />
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="bg-emerald-500 hover:bg-emerald-600"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-slate-400 mt-2 text-center">
                <Sparkles className="w-3 h-3 inline mr-1" />
                Powered by ProfitShield AI
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}