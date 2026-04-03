/**
 * WELCOME CHECKLIST — shown after onboarding completes
 * Guides users through first week in the app
 */
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/components/platformContext';
import { CheckCircle2, Circle, X, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

const STORAGE_KEY = 'ps_welcome_checklist_v1';

const CHECKLIST = [
  { id: 'store_connected', label: 'Connect your first store', page: 'Integrations' },
  { id: 'first_order_analyzed', label: 'View your first order analysis', page: 'Orders' },
  { id: 'risk_rule_created', label: 'Set up a risk rule', page: 'Intelligence' },
  { id: 'alert_reviewed', label: 'Review an alert', page: 'Alerts' },
  { id: 'plan_chosen', label: 'Choose a plan', page: 'Pricing' },
];

export default function WelcomeChecklist() {
  const location = useLocation();
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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ completed: next }));
    } catch {}
  };

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ dismissed: true, completed }));
    } catch {}
  };

  const completedCount = Object.values(completed).filter(Boolean).length;
  const pct = Math.round((completedCount / CHECKLIST.length) * 100);

  if (dismissed) return null;
  if (completedCount === CHECKLIST.length) return null;

  return (
    <Card className="future-panel mb-3 overflow-hidden border-white/8 bg-white/[0.03]">
      <CardHeader className="pb-1.5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2 text-white sm:text-base">
            Launch Checklist
            <span className="text-xs font-normal text-emerald-300 sm:text-sm">{completedCount}/{CHECKLIST.length} done</span>
          </CardTitle>
          <button onClick={dismiss} className="text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>
        <Progress value={pct} className="mt-1.5 h-1.5" />
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-3">
        {CHECKLIST.map(item => (
          <div key={item.id} className="flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-1.5">
            <button onClick={() => toggle(item.id)} className="flex-shrink-0">
              {completed[item.id]
                ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                : <Circle className="w-5 h-5 text-slate-500" />
              }
            </button>
            <Link
              to={createPageUrl(item.page, location.search)}
              className={`text-sm flex-1 leading-5 transition-colors ${completed[item.id] ? 'line-through text-slate-500' : 'text-slate-200 hover:text-emerald-300'}`}
            >
              {item.label}
            </Link>
            {!completed[item.id] && <ChevronRight className="w-4 h-4 text-slate-500" />}
          </div>
        ))}
        </div>
      </CardContent>
    </Card>
  );
}
