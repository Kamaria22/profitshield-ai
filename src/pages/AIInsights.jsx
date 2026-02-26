import React from 'react';
import { motion } from 'framer-motion';
import { Brain, Users, Megaphone, Search, Sparkles } from 'lucide-react';
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
      {/* Header */}
      <motion.div variants={fadeInUp}>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/25">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">AI Insights Hub</h1>
            <p className="text-slate-500">Advanced AI-powered analytics and automation</p>
          </div>
        </div>
      </motion.div>

      {/* Feature Cards */}
      <motion.div variants={fadeInUp} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-violet-50 to-white border-violet-200">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8 text-violet-600" />
              <div>
                <h3 className="font-semibold text-violet-900">Customer Segmentation</h3>
                <p className="text-xs text-violet-600">AI-powered RFM analysis</p>
              </div>
            </div>
          </CardContent>
        </Card>
        {isAdmin && (
          <Card className="bg-gradient-to-br from-pink-50 to-white border-pink-200">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <Megaphone className="w-8 h-8 text-pink-600" />
                <div>
                  <h3 className="font-semibold text-pink-900">Marketing Automation</h3>
                  <p className="text-xs text-pink-600">AI-generated campaigns</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        <Card className="bg-gradient-to-br from-slate-50 to-white border-slate-200">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Search className="w-8 h-8 text-slate-600" />
              <div>
                <h3 className="font-semibold text-slate-900">Leak Forensics</h3>
                <p className="text-xs text-slate-600">Deep profit analysis</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Main Panels */}
      <div className={`grid grid-cols-1 ${isAdmin ? 'lg:grid-cols-2' : ''} gap-6`}>
        <motion.div variants={fadeInUp}>
          <CustomerSegmentationPanel tenantId={authTenantId} />
        </motion.div>
        {isAdmin && (
          <motion.div variants={fadeInUp}>
            <MarketingCampaignsPanel tenantId={authTenantId} />
          </motion.div>
        )}
      </div>

      {/* Forensics Panel - Full Width */}
      <motion.div variants={fadeInUp}>
        <ProfitLeakForensicsPanel tenantId={authTenantId} />
      </motion.div>
    </motion.div>
  );
}