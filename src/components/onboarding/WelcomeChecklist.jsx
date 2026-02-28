/**
 * WELCOME CHECKLIST — shown after onboarding completes
 * Guides users through first week in the app
 */
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { CheckCircle2, Circle, X, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'ps_welcome_checklist_v1';

const CHECKLIST = [
  { id: 'store_connected', label: 'Connect your first store', page: 'Integrations' },
  { id: 'first_order_analyzed', label: 'View your first order analysis', page: 'Orders' },
  { id: 'risk_rule_created', label: 'Set up a risk rule', page: 'Intelligence' },
  { id: 'alert_reviewed', label: 'Review an alert', page: 'Alerts' },
  { id: 'plan_chosen', label: 'Choose a plan', page: 'Pricing' },
];

export default function WelcomeChecklist() {
  const [dismissed, setDismissed] = useState(false);
  const [completed, setCompleted] = useState({});

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (stored.dismissed) { setDismissed(true); return; }
      setCompleted(stored.completed || {});
    } catch {}
  }, []);

  const toggle = (id) => {
    const next = { ...completed, [id]: !completed[id] };
    setCompleted(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ completed: next }));
  };

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ dismissed: true, completed }));
  };

  const completedCount = Object.values(completed).filter(Boolean).length;
  const pct = Math.round((completedCount / CHECKLIST.length) * 100);

  if (dismissed) return null;
  if (completedCount === CHECKLIST.length) return null;

  return (
    <Card className="border-emerald-200 bg-emerald-50 mb-6">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            🚀 Get Started with ProfitShield
            <span className="text-sm font-normal text-emerald-600">{completedCount}/{CHECKLIST.length} done</span>
          </CardTitle>
          <button onClick={dismiss} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <Progress value={pct} className="h-1.5 mt-2" />
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {CHECKLIST.map(item => (
          <div key={item.id} className="flex items-center gap-3">
            <button onClick={() => toggle(item.id)} className="flex-shrink-0">
              {completed[item.id]
                ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                : <Circle className="w-5 h-5 text-slate-300" />
              }
            </button>
            <Link
              to={createPageUrl(item.page)}
              className={`text-sm flex-1 hover:text-emerald-700 transition-colors ${completed[item.id] ? 'line-through text-slate-400' : 'text-slate-700'}`}
            >
              {item.label}
            </Link>
            {!completed[item.id] && <ChevronRight className="w-4 h-4 text-slate-300" />}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}