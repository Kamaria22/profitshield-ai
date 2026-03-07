/**
 * ShopifyOnboarding — guided setup flow for new Shopify merchants
 * Triggered automatically after ShopifyEmbeddedAuthGate completes for a brand-new tenant.
 * Works inside the Shopify Admin iframe.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Zap, TrendingUp, CheckCircle, ArrowRight,
  AlertTriangle, Package, BarChart2, Bell
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';

const STEPS = [
  { id: 'welcome',    label: 'Welcome',    icon: Shield },
  { id: 'value',      label: 'Value',      icon: TrendingUp },
  { id: 'configure',  label: 'Configure',  icon: Zap },
  { id: 'alerts',     label: 'Alerts',     icon: Bell },
  { id: 'done',       label: 'Ready',      icon: CheckCircle },
];

const VALUE_PROPS = [
  {
    icon: AlertTriangle,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    title: 'Profit Leak Detection',
    desc: 'Automatically finds orders losing money from shipping gaps, discount abuse, and negative-margin SKUs.',
  },
  {
    icon: Shield,
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10',
    title: 'Fraud & Risk Intelligence',
    desc: 'Every order is scored in real-time. High-risk orders are flagged before fulfillment.',
  },
  {
    icon: BarChart2,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    title: 'True P&L Analytics',
    desc: 'See real net profit after COGS, fees, returns, and shipping — not just Shopify revenue.',
  },
  {
    icon: Package,
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    title: 'Auto-Sync with Shopify',
    desc: 'Risk tags and notes are pushed back to orders in real-time. No manual work.',
  },
];

export default function ShopifyOnboarding({ tenantId, integrationId, shopDomain, onComplete }) {
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState({
    discount_protection: true,
    shipping_alerts: true,
    risk_alerts: true,
    auto_hold_high_risk: false,
    push_tags: true,
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const currentStepId = STEPS[step].id;

  const toggle = (key) => setConfig(prev => ({ ...prev, [key]: !prev[key] }));

  const finish = async () => {
    setSaving(true);
    setSaveError('');
    try {
      if (tenantId) {
        // Mark onboarding complete
        const tenants = await base44.entities.Tenant.filter({ id: tenantId });
        if (tenants.length > 0) {
          await base44.entities.Tenant.update(tenants[0].id, {
            onboarding_completed: true,
            status: 'active',
          });
        }

        // Save settings
        const existing = await base44.entities.TenantSettings.filter({ tenant_id: tenantId });
        const settingsPayload = {
          tenant_id: tenantId,
          notifications_enabled: config.risk_alerts,
          auto_hold_high_risk: config.auto_hold_high_risk,
        };
        if (existing.length > 0) {
          await base44.entities.TenantSettings.update(existing[0].id, settingsPayload);
        } else {
          await base44.entities.TenantSettings.create(settingsPayload);
        }

        // Update integration two-way sync
        if (integrationId) {
          await base44.entities.PlatformIntegration.update(integrationId, {
            two_way_sync: {
              enabled: config.push_tags,
              push_tags: config.push_tags,
              push_notes: true,
              auto_hold_high_risk: config.auto_hold_high_risk,
            },
          });
        }
      }
      onComplete?.();
    } catch (e) {
      console.warn('[ShopifyOnboarding] Save error:', e.message);
      setSaveError(e?.message || 'Failed to save onboarding settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-start p-4 pt-10">
      {/* Progress bar */}
      <div className="w-full max-w-lg mb-8">
        <div className="flex items-center justify-between mb-3">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < step;
            const active = i === step;
            return (
              <React.Fragment key={s.id}>
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all
                    ${done ? 'bg-emerald-500 border-emerald-500' : active ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-700 bg-slate-800'}`}>
                    {done
                      ? <CheckCircle className="w-4 h-4 text-white" />
                      : <Icon className={`w-4 h-4 ${active ? 'text-indigo-400' : 'text-slate-500'}`} />
                    }
                  </div>
                  <span className={`text-[10px] font-medium ${active ? 'text-indigo-300' : 'text-slate-600'}`}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-px mx-1 ${i < step ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <div className="w-full max-w-lg">
        <AnimatePresence mode="wait">
          {/* WELCOME */}
          {currentStepId === 'welcome' && (
            <motion.div key="welcome" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="bg-slate-900 border border-white/8 rounded-2xl p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto mb-5"
                style={{ boxShadow: '0 0 30px rgba(99,102,241,0.4)' }}>
                <Shield className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Welcome to ProfitShield AI</h1>
              <p className="text-slate-400 text-sm mb-1">
                Connected to <span className="text-indigo-300 font-medium">{shopDomain}</span>
              </p>
              <p className="text-slate-500 text-sm mb-8">
                Let's take 2 minutes to configure your profit protection. This only happens once.
              </p>
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700 h-11" onClick={() => setStep(1)}>
                Get Started <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </motion.div>
          )}

          {/* VALUE PROPS */}
          {currentStepId === 'value' && (
            <motion.div key="value" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="space-y-4">
              <div className="text-center mb-2">
                <h2 className="text-xl font-bold text-white">What ProfitShield Does for You</h2>
                <p className="text-slate-400 text-sm mt-1">Protecting merchant profit, automatically.</p>
              </div>
              {VALUE_PROPS.map((vp, i) => {
                const Icon = vp.icon;
                return (
                  <div key={i} className="bg-slate-900 border border-white/8 rounded-xl p-4 flex gap-4 items-start">
                    <div className={`w-10 h-10 rounded-lg ${vp.bg} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-5 h-5 ${vp.color}`} />
                    </div>
                    <div>
                      <p className="font-semibold text-white text-sm">{vp.title}</p>
                      <p className="text-slate-400 text-sm mt-0.5">{vp.desc}</p>
                    </div>
                  </div>
                );
              })}
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700 h-11 mt-2" onClick={() => setStep(2)}>
                Configure Protections <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </motion.div>
          )}

          {/* CONFIGURE */}
          {currentStepId === 'configure' && (
            <motion.div key="configure" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="bg-slate-900 border border-white/8 rounded-2xl p-6 space-y-4">
              <div className="mb-2">
                <h2 className="text-xl font-bold text-white">Profit Protections</h2>
                <p className="text-slate-400 text-sm mt-1">Toggle what ProfitShield monitors for you.</p>
              </div>
              {[
                { key: 'discount_protection', label: 'Discount Abuse Protection', desc: 'Alert when orders stack multiple discount codes' },
                { key: 'shipping_alerts',     label: 'Shipping Loss Alerts',      desc: 'Notify when actual shipping cost exceeds what was charged' },
                { key: 'risk_alerts',         label: 'High-Risk Order Alerts',    desc: 'Flag potentially fraudulent orders before fulfillment' },
                { key: 'push_tags',           label: 'Push Risk Tags to Shopify', desc: 'Add risk-level tags to orders in your Shopify admin', badge: 'Recommended' },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between p-4 bg-slate-800/60 rounded-xl">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white">{item.label}</p>
                      {item.badge && <Badge className="text-[10px] bg-emerald-500/20 text-emerald-400 border-0">{item.badge}</Badge>}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                  </div>
                  <Switch checked={config[item.key]} onCheckedChange={() => toggle(item.key)} />
                </div>
              ))}
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700 h-11 mt-2" onClick={() => setStep(3)}>
                Next: Alert Preferences <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </motion.div>
          )}

          {/* ALERTS */}
          {currentStepId === 'alerts' && (
            <motion.div key="alerts" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="bg-slate-900 border border-white/8 rounded-2xl p-6 space-y-4">
              <div className="mb-2">
                <h2 className="text-xl font-bold text-white">Auto-Action Settings</h2>
                <p className="text-slate-400 text-sm mt-1">Let ProfitShield act automatically on risky orders.</p>
              </div>
              <div className="flex items-center justify-between p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <div>
                  <p className="text-sm font-medium text-white">Auto-Hold High Risk Orders</p>
                  <p className="text-xs text-amber-400 mt-0.5">Holds fulfillment automatically — you review before shipping</p>
                </div>
                <Switch checked={config.auto_hold_high_risk} onCheckedChange={() => toggle('auto_hold_high_risk')} />
              </div>
              <p className="text-xs text-slate-500 text-center">You can adjust all of these any time in Settings.</p>
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700 h-11" onClick={() => setStep(4)}>
                Finish Setup <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </motion.div>
          )}

          {/* DONE */}
          {currentStepId === 'done' && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="bg-slate-900 border border-white/8 rounded-2xl p-8 text-center">
              <motion.div
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className="w-16 h-16 rounded-2xl bg-emerald-500 flex items-center justify-center mx-auto mb-5"
                style={{ boxShadow: '0 0 30px rgba(52,211,153,0.4)' }}>
                <CheckCircle className="w-8 h-8 text-white" />
              </motion.div>
              <h1 className="text-2xl font-bold text-white mb-2">You're All Set!</h1>
              <p className="text-slate-400 text-sm mb-6">
                ProfitShield AI is now protecting <span className="text-indigo-300 font-medium">{shopDomain}</span>.
              </p>
              <div className="grid grid-cols-2 gap-3 mb-8 text-left">
                {[
                  { label: 'Profit Monitoring', on: true },
                  { label: 'Risk Scoring', on: true },
                  { label: 'Discount Alerts', on: config.discount_protection },
                  { label: 'Auto-Hold', on: config.auto_hold_high_risk },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-2 bg-slate-800/60 rounded-lg p-3">
                    <div className={`w-2 h-2 rounded-full ${item.on ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                    <span className="text-xs text-slate-300">{item.label}</span>
                  </div>
                ))}
              </div>
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700 h-11" onClick={finish} disabled={saving}>
                {saving ? 'Saving...' : 'Open Dashboard'}
                {!saving && <ArrowRight className="w-4 h-4 ml-1" />}
              </Button>
              {saveError && (
                <p className="text-xs text-red-400 mt-3">{saveError}</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
