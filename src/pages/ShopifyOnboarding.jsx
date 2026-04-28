// @ts-nocheck
/**
 * ShopifyOnboarding — guided setup flow for new Shopify merchants
 * Triggered automatically after ShopifyEmbeddedAuthGate completes for a brand-new tenant.
 * Works inside the Shopify Admin iframe.
 */

import React, { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Zap, TrendingUp, CheckCircle, ArrowRight,
  AlertTriangle, Package, BarChart2, Bell
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { createPageUrl, getPersistedContext } from '@/components/platformContext';

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
  const location = useLocation();
  const navigate = useNavigate();
  const resolvedContext = useMemo(() => {
    const params = new URLSearchParams(location.search || '');
    const persisted = getPersistedContext(true) || {};
    return {
      tenantId: tenantId || params.get('tenantId') || persisted.tenantId || null,
      integrationId: integrationId || params.get('integrationId') || persisted.integrationId || null,
      shopDomain: shopDomain || params.get('shop') || persisted.shop || persisted.storeKey || null,
    };
  }, [tenantId, integrationId, shopDomain, location.search]);
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
  const stepProgress = ((step + 1) / STEPS.length) * 100;

  const toggle = (key) => setConfig(prev => ({ ...prev, [key]: !prev[key] }));

  const finish = async () => {
    setSaving(true);
    setSaveError('');
    try {
      if (resolvedContext.tenantId) {
        // Save settings
        const existing = await base44.entities.TenantSettings.filter({ tenant_id: resolvedContext.tenantId });
        const settingsPayload = {
          tenant_id: resolvedContext.tenantId,
          notifications_enabled: config.risk_alerts,
          auto_hold_high_risk: config.auto_hold_high_risk,
        };
        if (existing.length > 0) {
          await base44.entities.TenantSettings.update(existing[0].id, settingsPayload);
        } else {
          await base44.entities.TenantSettings.create(settingsPayload);
        }

        // Update integration two-way sync
        if (resolvedContext.integrationId) {
          await base44.entities.PlatformIntegration.update(resolvedContext.integrationId, {
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
      navigate(createPageUrl('Pricing', location.search));
    } catch (e) {
      console.warn('[ShopifyOnboarding] Save error:', e.message);
      setSaveError(e?.message || 'Failed to save onboarding settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="future-grid min-h-screen bg-slate-950 px-4 pb-12 pt-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="future-panel rounded-[2rem] p-7 sm:p-8">
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <span className="future-badge inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-100">
                Shopify Install Sequence
              </span>
              <span className="future-badge inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-100">
                {shopDomain}
              </span>
            </div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Merchant Activation</p>
            <h1 className="mt-2 max-w-2xl text-3xl font-semibold text-white sm:text-5xl" style={{ textShadow: '0 0 26px rgba(56,189,248,0.15)' }}>
              Configure a commerce nervous system before it goes autonomous.
            </h1>
            <p className="mt-4 max-w-xl text-sm text-slate-400 sm:text-base">
              This launch sequence tunes protection behavior, signal routing, and Shopify writeback preferences before live automation begins.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <LaunchMetric label="Sequence" value={`${step + 1}/${STEPS.length}`} tone="#38bdf8" />
              <LaunchMetric label="Completion" value={`${Math.round(stepProgress)}%`} tone="#34d399" />
              <LaunchMetric label="Mode" value={config.auto_hold_high_risk ? 'Guarded' : 'Observe'} tone={config.auto_hold_high_risk ? '#fbbf24' : '#a5b4fc'} />
            </div>
          </div>

          <div className="future-panel rounded-[2rem] p-6">
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Progress Mesh</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5">
              <div className="h-full rounded-full bg-[linear-gradient(90deg,#38bdf8,#818cf8,#34d399)] transition-all duration-500" style={{ width: `${stepProgress}%` }} />
            </div>
            <div className="mt-6 flex items-center justify-between gap-3">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < step;
            const active = i === step;
            return (
              <React.Fragment key={s.id}>
                    <div className="flex flex-col items-center gap-2">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border transition-all
                    ${done ? 'border-emerald-400 bg-emerald-500/20' : active ? 'border-cyan-400 bg-cyan-400/10' : 'border-slate-700 bg-slate-800/80'}`}>
                    {done
                      ? <CheckCircle className="w-4 h-4 text-white" />
                      : <Icon className={`w-4 h-4 ${active ? 'text-cyan-300' : 'text-slate-500'}`} />
                    }
                  </div>
                      <span className={`text-[10px] font-medium uppercase tracking-[0.18em] ${active ? 'text-cyan-200' : 'text-slate-600'}`}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                        <div className={`h-px flex-1 ${i < step ? 'bg-emerald-400/70' : 'bg-slate-700'}`} />
                )}
              </React.Fragment>
            );
          })}
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-2xl">
        <AnimatePresence mode="wait">
          {/* WELCOME */}
          {currentStepId === 'welcome' && (
            <motion.div key="welcome" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="future-panel rounded-[2rem] p-8 text-center">
              <div className="w-16 h-16 rounded-[1.35rem] bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center mx-auto mb-5"
                style={{ boxShadow: '0 0 30px rgba(56,189,248,0.32)' }}>
                <Shield className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Welcome to ProfitShield AI</h1>
              <p className="text-slate-400 text-sm mb-1">
                Connected to <span className="text-cyan-300 font-medium">{shopDomain}</span>
              </p>
              <p className="text-slate-500 text-sm mb-8">
                Let's take 2 minutes to configure your profit protection. This only happens once.
              </p>
              <Button className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400 h-11" onClick={() => setStep(1)}>
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
                  <div key={i} className="future-panel rounded-[1.4rem] p-4 flex gap-4 items-start">
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
              <Button className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400 h-11 mt-2" onClick={() => setStep(2)}>
                Configure Protections <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </motion.div>
          )}

          {/* CONFIGURE */}
          {currentStepId === 'configure' && (
            <motion.div key="configure" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="future-panel rounded-[2rem] p-6 space-y-4">
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
                <div key={item.key} className="flex items-center justify-between p-4 bg-slate-800/60 rounded-xl border border-white/6">
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
              <Button className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400 h-11 mt-2" onClick={() => setStep(3)}>
                Next: Alert Preferences <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </motion.div>
          )}

          {/* ALERTS */}
          {currentStepId === 'alerts' && (
            <motion.div key="alerts" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="future-panel rounded-[2rem] p-6 space-y-4">
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
              <Button className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400 h-11" onClick={() => setStep(4)}>
                Finish Setup <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </motion.div>
          )}

          {/* DONE */}
          {currentStepId === 'done' && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="future-panel rounded-[2rem] p-8 text-center">
              <motion.div
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className="w-16 h-16 rounded-2xl bg-emerald-500 flex items-center justify-center mx-auto mb-5"
                style={{ boxShadow: '0 0 30px rgba(52,211,153,0.4)' }}>
                <CheckCircle className="w-8 h-8 text-white" />
              </motion.div>
              <h1 className="text-2xl font-bold text-white mb-2">You're All Set!</h1>
              <p className="text-slate-400 text-sm mb-6">
                Choose your plan to activate automated sync and live Shopify protection for <span className="text-cyan-300 font-medium">{resolvedContext.shopDomain}</span>.
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
              <Button className="w-full bg-emerald-500 text-slate-950 hover:bg-emerald-400 h-11" onClick={finish} disabled={saving}>
                {saving ? 'Saving...' : 'Choose Plan'}
                {!saving && <ArrowRight className="w-4 h-4 ml-1" />}
              </Button>
              {saveError && (
                <p className="text-xs text-red-400 mt-3">{saveError}</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        <p className="text-[11px] text-slate-500 text-center mt-4">
          Setup is governed by our{' '}
          <Link to={createPageUrl('TermsOfService', location.search)} className="underline hover:text-slate-300">Terms</Link>,{' '}
          <Link to={createPageUrl('PrivacyPolicy', location.search)} className="underline hover:text-slate-300">Privacy Policy</Link>,{' '}
          <Link to={createPageUrl('CookiePolicy', location.search)} className="underline hover:text-slate-300">Cookie Policy</Link>, and{' '}
          <Link to={createPageUrl('EndUserLicenseAgreement', location.search)} className="underline hover:text-slate-300">EULA</Link>.
        </p>
        </div>
      </div>
    </div>
  );
}

function LaunchMetric({ label, value, tone }) {
  return (
    <div className="rounded-[1.35rem] border border-white/8 bg-white/[0.03] px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold" style={{ color: tone }}>{value}</p>
    </div>
  );
}
