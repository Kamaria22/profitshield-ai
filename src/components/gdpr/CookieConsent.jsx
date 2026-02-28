import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Shield, ChevronDown, ChevronUp, X } from 'lucide-react';

const CONSENT_KEY = 'ps_cookie_consent_v1';

export function getConsent() {
  try {
    const stored = localStorage.getItem(CONSENT_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function hasConsented() {
  return getConsent() !== null;
}

export function consentAllowed(category) {
  const c = getConsent();
  if (!c) return false;
  if (category === 'necessary') return true;
  return c[category] === true;
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [prefs, setPrefs] = useState({ analytics: false, marketing: false });

  useEffect(() => {
    // Show on first visit
    const t = setTimeout(() => {
      if (!hasConsented()) setVisible(true);
    }, 800);

    // Allow "Manage Cookies" link to reopen modal via custom event
    const handler = () => { setVisible(true); setExpanded(true); };
    window.addEventListener('ps:manage-cookies', handler);

    return () => {
      clearTimeout(t);
      window.removeEventListener('ps:manage-cookies', handler);
    };
  }, []);

  const save = (analytics, marketing) => {
    const consent = {
      necessary: true,
      analytics,
      marketing,
      timestamp: new Date().toISOString(),
      version: '1.0'
    };
    localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
    setVisible(false);
  };

  const acceptAll = () => save(true, true);
  const rejectAll = () => save(false, false);
  const savePrefs = () => save(prefs.analytics, prefs.marketing);

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] bg-white border-t border-slate-200 shadow-2xl">
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="flex items-start gap-3 mb-3">
          <Shield className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900 text-sm">We use cookies</p>
            <p className="text-xs text-slate-500 mt-0.5">
              We use cookies to operate this service, analyze usage, and personalize content. 
              <button onClick={() => setExpanded(e => !e)} className="ml-1 text-emerald-600 hover:underline inline-flex items-center gap-0.5">
                Manage preferences {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </p>
          </div>
        </div>

        {expanded && (
          <div className="mb-4 space-y-3 p-3 bg-slate-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">Strictly Necessary</p>
                <p className="text-xs text-slate-500">Required for the service to function</p>
              </div>
              <Switch checked disabled />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">Analytics</p>
                <p className="text-xs text-slate-500">Helps us understand how you use the app</p>
              </div>
              <Switch checked={prefs.analytics} onCheckedChange={v => setPrefs(p => ({ ...p, analytics: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">Marketing</p>
                <p className="text-xs text-slate-500">Used to personalize ads and campaigns</p>
              </div>
              <Switch checked={prefs.marketing} onCheckedChange={v => setPrefs(p => ({ ...p, marketing: v }))} />
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={acceptAll} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            Accept All
          </Button>
          {expanded && (
            <Button size="sm" variant="outline" onClick={savePrefs}>
              Save Preferences
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={rejectAll} className="text-slate-500">
            Reject Non-Essential
          </Button>
        </div>
      </div>
    </div>
  );
}