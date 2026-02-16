import React, { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { 
  MessageCircle, 
  Send, 
  Loader2, 
  Sparkles, 
  AlertTriangle,
  TrendingDown,
  ShoppingCart,
  Lightbulb,
  X
} from 'lucide-react';

const quickActions = [
  { label: 'Which orders should I cancel?', icon: AlertTriangle },
  { label: 'Why did my profit drop?', icon: TrendingDown },
  { label: 'Review high-risk orders', icon: ShoppingCart },
  { label: 'Suggest automation rules', icon: Lightbulb }
];

export default function MerchantAIChat({ tenantId, currentPage, selectedOrderId }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi! I\'m your AI assistant. Ask me anything about your orders, risk, or profit.' }
  ]);
  const scrollRef = useRef(null);

  const askMutation = useMutation({
    mutationFn: async (question) => {
      const result = await base44.functions.invoke('merchantAI', {
        action: 'ask',
        tenant_id: tenantId,
        question,
        context: { current_page: currentPage, selected_order_id: selectedOrderId }
      });
      return result.data;
    },
    onSuccess: (data) => {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.answer,
        insights: data.insights,
        actions: data.suggested_actions
      }]);
    },
    onError: (error) => {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error. Please try again.',
        error: true
      }]);
    }
  });

  const { data: recommendations = [] } = useQuery({
    queryKey: ['merchantRecommendations', tenantId],
    queryFn: () => base44.entities.MerchantRecommendation.filter({ 
      tenant_id: tenantId, 
      status: 'pending' 
    }, '-created_date', 5),
    enabled: open && !!tenantId
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || askMutation.isPending) return;
    
    setMessages(prev => [...prev, { role: 'user', content: input }]);
    askMutation.mutate(input);
    setInput('');
  };

  const handleQuickAction = (action) => {
    setMessages(prev => [...prev, { role: 'user', content: action }]);
    askMutation.mutate(action);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button 
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg bg-purple-600 hover:bg-purple-700 z-50"
          size="icon"
        >
          <MessageCircle className="w-6 h-6" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[450px] p-0 flex flex-col">
        <SheetHeader className="p-4 border-b bg-gradient-to-r from-purple-600 to-indigo-600">
          <SheetTitle className="text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            MerchantAI Assistant
          </SheetTitle>
        </SheetHeader>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                  msg.role === 'user' 
                    ? 'bg-purple-600 text-white' 
                    : msg.error 
                      ? 'bg-red-50 text-red-700 border border-red-200'
                      : 'bg-slate-100 text-slate-700'
                }`}>
                  <p className="text-sm">{msg.content}</p>
                  
                  {msg.insights?.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-200/50">
                      {msg.insights.map((insight, j) => (
                        <p key={j} className="text-xs opacity-80">• {insight}</p>
                      ))}
                    </div>
                  )}
                  
                  {msg.actions?.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-200/50 space-y-1">
                      <p className="text-xs font-medium">Suggested Actions:</p>
                      {msg.actions.map((action, j) => (
                        <Button 
                          key={j} 
                          variant="ghost" 
                          size="sm" 
                          className="w-full justify-start text-xs h-7 px-2"
                        >
                          {action.action || action}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {askMutation.isPending && (
              <div className="flex justify-start">
                <div className="bg-slate-100 rounded-2xl px-4 py-3">
                  <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Quick Actions */}
        {messages.length === 1 && (
          <div className="px-4 py-2 border-t">
            <p className="text-xs text-slate-500 mb-2">Quick questions:</p>
            <div className="flex flex-wrap gap-2">
              {quickActions.map((action, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => handleQuickAction(action.label)}
                >
                  <action.icon className="w-3 h-3 mr-1" />
                  {action.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && messages.length === 1 && (
          <div className="px-4 py-2 border-t">
            <p className="text-xs text-slate-500 mb-2">AI Recommendations:</p>
            <div className="space-y-2">
              {recommendations.slice(0, 2).map((rec) => (
                <Card key={rec.id} className="bg-purple-50 border-purple-200">
                  <CardContent className="p-3">
                    <p className="text-sm font-medium text-purple-900">{rec.title}</p>
                    <p className="text-xs text-purple-700 mt-1">{rec.description}</p>
                    {rec.one_click_apply && (
                      <Button size="sm" className="mt-2 h-7 text-xs bg-purple-600">
                        Apply Now
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t">
          <div className="flex gap-2">
            <Input
              placeholder="Ask anything..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              disabled={askMutation.isPending}
            />
            <Button 
              onClick={handleSend}
              disabled={!input.trim() || askMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}