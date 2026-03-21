import React from 'react';
import { motion } from 'framer-motion';
import { Brain, Users, Megaphone, Search, Sparkles, Radar, Shield, Orbit } from 'lucide-react';
import { usePlatformResolver, requireResolved } from '../components/usePlatformResolver';
import { usePermissions } from '../components/usePermissions';
import CustomerSegmentationPanel from '../components/ai/CustomerSegmentationPanel';
import MarketingCampaignsPanel from '../components/ai/MarketingCampaignsPanel';
import ProfitLeakForensicsPanel from '../components/ai/ProfitLeakForensicsPanel';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 }
};

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.1 } }
};

export default function AIInsights() {
  const resolver = usePlatformResolver();
  const resolverCheck = requireResolved(resolver);
  const authTenantId = resolverCheck.tenantId;
  const { user } = usePermissions();
  const [showSegments, setShowSegments] = React.useState(false);
  const [showMarketing, setShowMarketing] = React.useState(false);

  // SEO: update document title
  React.useEffect(() => {
    document.title = 'AI Insights – ProfitShield AI | Real-Time Profit Intelligence for Shopify';
  }, []);

  React.useEffect(() => {
    if (!authTenantId) return undefined;
    const segmentsTimer = window.setTimeout(() => setShowSegments(true), 250);
    const marketingTimer = window.setTimeout(() => setShowMarketing(true), 1400);
    return () => {
      window.clearTimeout(segmentsTimer);
      window.clearTimeout(marketingTimer);
    };
  }, [authTenantId]);
  
  // Check if user is admin/owner
  const isAdmin = user && (user.role === 'admin' || user.role === 'owner' || user.app_role === 'admin' || user.app_role === 'owner');

  if (resolver?.status === 'resolving') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!authTenantId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="py-8 text-center">
            <Brain className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Connect Your Store</h2>
            <p className="text-slate-500">Connect a store to access AI-powered insights</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <motion.div 
      className="space-y-6 pb-6"
      initial="initial"
      animate="animate"
      variants={staggerContainer}
    >
      <motion.div variants={fadeInUp}>
        <div className="future-panel future-grid future-scan overflow-hidden rounded-[2rem] p-6 sm:p-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-2xl">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="future-badge inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-100">
                  <Radar className="h-3.5 w-3.5" />
                  AI Signal Command
                </span>
                <span className="future-badge inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-100">
                  <Sparkles className="h-3.5 w-3.5" />
                  Autonomous Insight Grid
                </span>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-[1.4rem] bg-[linear-gradient(135deg,#38bdf8,#818cf8,#34d399)] shadow-[0_0_28px_rgba(56,189,248,0.32)]">
                  <Brain className="h-7 w-7 text-white" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Strategic AI Runtime</p>
                  <h1 className="mt-2 text-3xl font-semibold text-white sm:text-5xl" style={{ textShadow: '0 0 26px rgba(56,189,248,0.16)' }}>
                    AI Insights Hub
                  </h1>
                  <p className="mt-3 max-w-xl text-sm text-slate-400 sm:text-base">
                    Customer intelligence, profit leak forensics, and growth automation arranged as a real operator cockpit instead of a report dump.
                  </p>
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 xl:w-[420px] xl:grid-cols-1">
              <SignalStrip icon={Users} label="Segments" value="Behavior clusters" tone="#a78bfa" />
              <SignalStrip icon={Search} label="Forensics" value="Leak detection priority" tone="#f59e0b" />
              <SignalStrip icon={Megaphone} label="Campaigns" value={isAdmin ? 'Admin launch controls' : 'Owner-only locked'} tone={isAdmin ? '#fb7185' : '#64748b'} />
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div variants={fadeInUp} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="future-panel border-white/10 bg-white/[0.03] text-white">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/15">
                <Users className="w-6 h-6 text-violet-300" />
              </div>
              <div>
                <h3 className="font-semibold text-violet-100">Customer Segmentation</h3>
                <p className="text-xs text-violet-200/70">AI-powered RFM analysis</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="future-panel border-white/10 bg-white/[0.03] text-white">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/15">
                <Search className="w-6 h-6 text-amber-300" />
              </div>
              <div>
                <h3 className="font-semibold text-amber-100">Leak Forensics</h3>
                <p className="text-xs text-amber-200/70">Deep profit analysis</p>
              </div>
            </div>
          </CardContent>
        </Card>
        {isAdmin && (
          <Card className="future-panel border-white/10 bg-white/[0.03] text-white">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-pink-500/15">
                  <Megaphone className="w-6 h-6 text-pink-300" />
                </div>
                <div>
                  <h3 className="font-semibold text-pink-100">Marketing Automation</h3>
                  <p className="text-xs text-pink-200/70">AI-generated campaigns</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </motion.div>

      <motion.div variants={fadeInUp}>
        <div className="future-panel rounded-[1.8rem] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Priority Module</p>
              <h2 className="text-lg font-semibold text-white">Profit Leak Forensics</h2>
            </div>
            <div className="future-badge inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-100">
              <Shield className="h-3.5 w-3.5" />
              Above The Fold
            </div>
          </div>
          <ProfitLeakForensicsPanel tenantId={authTenantId} />
        </div>
      </motion.div>

      <div className={`grid grid-cols-1 ${isAdmin ? 'xl:grid-cols-[1.1fr_0.9fr]' : ''} gap-6`}>
        <motion.div variants={fadeInUp}>
          {showSegments ? (
            <CustomerSegmentationPanel tenantId={authTenantId} />
          ) : (
            <DeferredPanel
              title="AI Customer Segments"
              copy="Queuing segmentation analysis behind the primary forensic pass."
              tone="violet"
            />
          )}
        </motion.div>
        {isAdmin && (
          <motion.div variants={fadeInUp}>
            <div className="future-panel rounded-[1.8rem] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Automation Wing</p>
                  <h2 className="text-lg font-semibold text-white">AI Marketing Campaigns</h2>
                </div>
                <div className="future-badge inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-pink-100">
                  <Orbit className="h-3.5 w-3.5" />
                  Launch Layer
                </div>
              </div>
              {showMarketing ? (
                <MarketingCampaignsPanel tenantId={authTenantId} />
              ) : (
                <DeferredPanel
                  title="AI Marketing Campaigns"
                  copy="Delaying campaign generation until the core analytics channels settle."
                  tone="pink"
                />
              )}
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

function SignalStrip({ icon: Icon, label, value, tone }) {
  return (
    <div className="rounded-[1.35rem] border border-white/8 bg-white/[0.03] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.04]">
          <Icon className="h-5 w-5" style={{ color: tone }} />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{label}</p>
          <p className="text-sm font-semibold" style={{ color: tone }}>{value}</p>
        </div>
      </div>
    </div>
  );
}

function DeferredPanel({ title, copy, tone }) {
  const toneMap = {
    violet: 'text-violet-300 bg-violet-500/15',
    pink: 'text-pink-300 bg-pink-500/15'
  };
  return (
    <div className="rounded-[1.6rem] border border-white/8 bg-white/[0.03] p-5">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${toneMap[tone] || toneMap.violet}`}>
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="text-xs text-slate-400">{copy}</p>
        </div>
      </div>
    </div>
  );
}
