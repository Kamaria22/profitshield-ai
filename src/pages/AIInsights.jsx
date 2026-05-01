import React from 'react';
import {
  Brain,
  ChevronRight,
  Loader2,
  Megaphone,
  Search,
  Sparkles,
  Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  CommandCard,
  CommandCardContent,
  CommandCardDescription,
  CommandCardHeader,
  CommandCardTitle
} from '@/components/ui/command-card';
import { usePlatformResolver, requireResolved } from '../components/usePlatformResolver';
import { usePermissions } from '../components/usePermissions';
import CustomerSegmentationPanel from '../components/ai/CustomerSegmentationPanel';
import MarketingCampaignsPanel from '../components/ai/MarketingCampaignsPanel';
import ProfitLeakForensicsPanel from '../components/ai/ProfitLeakForensicsPanel';

const MODULES = [
  {
    id: 'segments',
    title: 'Customer Segmentation',
    description: 'Customer value, retention, and segment health.',
    icon: Users
  },
  {
    id: 'forensics',
    title: 'Profit Leak Forensics',
    description: 'Leak detection, root causes, and recovery actions.',
    icon: Search
  },
  {
    id: 'marketing',
    title: 'Marketing Automation',
    description: 'Campaign ideas and launch-ready growth actions.',
    icon: Megaphone
  }
];

export default function AIInsights() {
  const resolver = usePlatformResolver();
  const resolverCheck = requireResolved(resolver);
  const tenantId = resolverCheck.tenantId;
  const { user } = usePermissions();
  const [activeModule, setActiveModule] = React.useState('segments');

  React.useEffect(() => {
    document.title = 'AI Insights – ProfitShield AI | Real-Time Profit Intelligence for Shopify';
  }, []);

  const isAdmin =
    user &&
    (user.role === 'admin' ||
      user.role === 'owner' ||
      user.app_role === 'admin' ||
      user.app_role === 'owner');

  if (resolver?.status === 'resolving') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (!tenantId) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <CommandCard className="w-full max-w-md">
          <CommandCardContent className="py-8 text-center">
            <Brain className="mx-auto mb-4 h-12 w-12 text-slate-500" />
            <p className="text-lg font-semibold text-white">Connect your store</p>
            <p className="mt-2 text-sm text-slate-400">
              Connect a store to access AI-powered insights.
            </p>
          </CommandCardContent>
        </CommandCard>
      </div>
    );
  }

  const activeModuleConfig = MODULES.find((module) => module.id === activeModule) || MODULES[0];

  return (
    <div className="space-y-6 pb-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold text-white">AI Insights Hub</h1>
        <p className="text-sm text-slate-400">
          AI-driven profit, customer, and growth intelligence
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {MODULES.map((module) => {
          const Icon = module.icon;
          const isActive = activeModule === module.id;
          const isLocked = module.id === 'marketing' && !isAdmin;

          return (
            <button
              key={module.id}
              type="button"
              onClick={() => !isLocked && setActiveModule(module.id)}
              disabled={isLocked}
              className={`text-left ${isLocked ? 'cursor-not-allowed opacity-70' : ''}`}
            >
              <CommandCard
                className={`h-full transition-all duration-150 ${
                  isActive
                    ? 'border-cyan-400/45 bg-white/[0.06]'
                    : 'hover:border-white/15 hover:bg-white/[0.05]'
                }`}
              >
                <CommandCardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03]">
                      <Icon className={`h-5 w-5 ${isActive ? 'text-cyan-300' : 'text-slate-300'}`} />
                    </div>
                    <span
                      className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                        isLocked
                          ? 'border-white/10 text-slate-500'
                          : isActive
                            ? 'border-cyan-400/30 text-cyan-300'
                            : 'border-white/10 text-slate-400'
                      }`}
                    >
                      {isLocked ? 'Admin only' : isActive ? 'Active' : 'Available'}
                    </span>
                  </div>
                  <CommandCardTitle className="mt-3">{module.title}</CommandCardTitle>
                  <CommandCardDescription>{module.description}</CommandCardDescription>
                </CommandCardHeader>
              </CommandCard>
            </button>
          );
        })}
      </div>

      <CommandCard>
        <CommandCardHeader className="border-b border-white/8 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Active Workspace
              </p>
              <CommandCardTitle className="mt-2">{activeModuleConfig.title}</CommandCardTitle>
              <CommandCardDescription>{activeModuleConfig.description}</CommandCardDescription>
            </div>
          </div>
        </CommandCardHeader>
        <CommandCardContent className="pt-4">
          {activeModule === 'segments' && <CustomerSegmentationPanel tenantId={tenantId} />}
          {activeModule === 'forensics' && <ProfitLeakForensicsPanel tenantId={tenantId} />}
          {activeModule === 'marketing' && isAdmin && <MarketingCampaignsPanel tenantId={tenantId} />}
          {activeModule === 'marketing' && !isAdmin && (
            <div className="rounded-[12px] border border-white/10 bg-white/[0.02] p-5 text-center">
              <Megaphone className="mx-auto h-10 w-10 text-slate-500" />
              <p className="mt-3 text-sm font-medium text-white">Marketing automation is restricted</p>
              <p className="mt-2 text-sm text-slate-400">
                Owner or admin access is required to generate and launch campaigns.
              </p>
            </div>
          )}
        </CommandCardContent>
      </CommandCard>

      <div className="grid gap-4 lg:grid-cols-3">
        <CommandCard>
          <CommandCardHeader className="pb-2">
            <CommandCardTitle>Current Focus</CommandCardTitle>
            <CommandCardDescription>Keep one workspace active to reduce scanning and scroll fatigue.</CommandCardDescription>
          </CommandCardHeader>
          <CommandCardContent>
            <div className="rounded-[12px] border border-white/10 bg-white/[0.03] px-3 py-3">
              <p className="text-sm font-medium text-white">{activeModuleConfig.title}</p>
              <p className="mt-1 text-xs text-slate-400">{activeModuleConfig.description}</p>
            </div>
          </CommandCardContent>
        </CommandCard>

        <CommandCard>
          <CommandCardHeader className="pb-2">
            <CommandCardTitle>Suggested Next Step</CommandCardTitle>
            <CommandCardDescription>
              Move to a related workspace instead of scanning all modules at once.
            </CommandCardDescription>
          </CommandCardHeader>
          <CommandCardContent>
            <div className="space-y-2">
              {activeModule !== 'forensics' && (
                <ActionShortcut
                  label="Open Profit Leak Forensics"
                  onClick={() => setActiveModule('forensics')}
                />
              )}
              {activeModule !== 'segments' && (
                <ActionShortcut
                  label="Open Customer Segmentation"
                  onClick={() => setActiveModule('segments')}
                />
              )}
              {isAdmin && activeModule !== 'marketing' && (
                <ActionShortcut
                  label="Open Marketing Automation"
                  onClick={() => setActiveModule('marketing')}
                />
              )}
            </div>
          </CommandCardContent>
        </CommandCard>

        <CommandCard>
          <CommandCardHeader className="pb-2">
            <CommandCardTitle>Operator Mode</CommandCardTitle>
            <CommandCardDescription>
              One active AI workspace is shown at a time to keep the page compact.
            </CommandCardDescription>
          </CommandCardHeader>
          <CommandCardContent>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-200">
              <Sparkles className="h-3.5 w-3.5" />
              Focused workspace enabled
            </div>
          </CommandCardContent>
        </CommandCard>
      </div>
    </div>
  );
}

function ActionShortcut({ label, onClick }) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-auto w-full justify-between border border-white/10 bg-white/[0.03] px-3 py-3 text-left text-slate-200 hover:bg-white/[0.05]"
      onClick={onClick}
    >
      <span className="text-sm">{label}</span>
      <ChevronRight className="h-4 w-4 text-slate-500" />
    </Button>
  );
}
