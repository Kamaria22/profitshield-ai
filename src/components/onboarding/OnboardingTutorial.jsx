import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle2, 
  Shield, 
  Brain, 
  TrendingUp,
  Users,
  ShoppingCart,
  AlertTriangle,
  Zap,
  Crown,
  Rocket,
  Star,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

const tutorialSlides = [
  {
    id: 'welcome',
    title: 'Welcome to ProfitShield',
    subtitle: 'Your AI-Powered Profit Protection Platform',
    icon: Shield,
    color: 'from-emerald-500 to-teal-600',
    content: `ProfitShield is the most advanced profit protection and optimization platform ever created. 
    We use cutting-edge AI to analyze every aspect of your e-commerce business and protect your margins.`,
    features: [
      'Real-time profit monitoring',
      'AI-powered risk detection',
      'Automated leak prevention',
      'Intelligent recommendations'
    ]
  },
  {
    id: 'dashboard',
    title: 'Your Command Center',
    subtitle: 'Dashboard Overview',
    icon: TrendingUp,
    color: 'from-blue-500 to-indigo-600',
    content: `The Dashboard is your central hub for monitoring business health. See your Profit Integrity Score, 
    key metrics, alerts, and AI insights all in one place.`,
    features: [
      'Profit Integrity Score (0-100)',
      'Revenue, profit & margin tracking',
      'Real-time alerts & notifications',
      'AI-generated insights'
    ],
    tier: 'all'
  },
  {
    id: 'ai-insights',
    title: 'AI Insights Hub',
    subtitle: 'Advanced Intelligence',
    icon: Brain,
    color: 'from-violet-500 to-purple-600',
    content: `Our AI Insights Hub provides deep analysis of your customers, marketing opportunities, 
    and profit leaks using advanced machine learning algorithms.`,
    features: [
      'Customer Segmentation (RFM Analysis)',
      'AI Marketing Campaigns',
      'Profit Leak Forensics',
      'Predictive Analytics'
    ],
    tier: 'growth'
  },
  {
    id: 'orders',
    title: 'Order Intelligence',
    subtitle: 'Every Order Analyzed',
    icon: ShoppingCart,
    color: 'from-amber-500 to-orange-600',
    content: `Every order is automatically analyzed for risk, profitability, and patterns. 
    Our AI detects fraud, chargebacks, and margin erosion before they impact your bottom line.`,
    features: [
      'Real-time risk scoring',
      'Fraud detection',
      'Profitability analysis',
      'Customer behavior tracking'
    ],
    tier: 'all'
  },
  {
    id: 'alerts',
    title: 'Smart Alerts',
    subtitle: 'Never Miss a Threat',
    icon: AlertTriangle,
    color: 'from-red-500 to-rose-600',
    content: `Receive instant alerts when our AI detects potential issues. From suspicious orders to 
    sudden margin drops, you'll always be the first to know.`,
    features: [
      'Critical threat notifications',
      'Customizable alert rules',
      'Multi-channel delivery',
      'One-click actions'
    ],
    tier: 'all'
  },
  {
    id: 'automation',
    title: 'AI Automation',
    subtitle: 'Set It & Forget It',
    icon: Zap,
    color: 'from-cyan-500 to-blue-600',
    content: `Let our AI handle routine tasks automatically. From price optimization to fraud blocking, 
    ProfitShield works 24/7 to protect and grow your profits.`,
    features: [
      'Auto-hold high-risk orders',
      'Dynamic pricing suggestions',
      'Automated discount creation',
      'Proactive leak prevention'
    ],
    tier: 'pro'
  }
];

const tierFeatures = {
  trial: {
    name: 'Trial',
    icon: Star,
    color: 'text-slate-600',
    features: ['Dashboard', 'Basic Alerts', '100 Orders/month', 'Email Support']
  },
  starter: {
    name: 'Starter',
    icon: Rocket,
    color: 'text-blue-600',
    features: ['Everything in Trial', '500 Orders/month', 'Risk Scoring', 'Basic Reports']
  },
  growth: {
    name: 'Growth',
    icon: TrendingUp,
    color: 'text-emerald-600',
    features: ['Everything in Starter', '2,000 Orders/month', 'AI Insights', 'Customer Segmentation', 'Marketing Campaigns']
  },
  pro: {
    name: 'Pro',
    icon: Crown,
    color: 'text-purple-600',
    features: ['Everything in Growth', '10,000 Orders/month', 'Full Automation', 'Priority Support', 'Custom Rules']
  },
  enterprise: {
    name: 'Enterprise',
    icon: Shield,
    color: 'text-amber-600',
    features: ['Unlimited Orders', 'Dedicated Support', 'Custom Integrations', 'SLA Guarantee', 'White-label Options']
  }
};

export default function OnboardingTutorial({ onComplete, userTier = 'trial' }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showTierInfo, setShowTierInfo] = useState(false);

  const handleNext = () => {
    if (currentSlide < tutorialSlides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else if (!showTierInfo) {
      setShowTierInfo(true);
    } else {
      onComplete?.();
    }
  };

  const handlePrev = () => {
    if (showTierInfo) {
      setShowTierInfo(false);
    } else if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const handleSkip = () => {
    onComplete?.();
  };

  const progress = showTierInfo 
    ? 100 
    : ((currentSlide + 1) / (tutorialSlides.length + 1)) * 100;

  const slide = tutorialSlides[currentSlide];
  const Icon = slide?.icon || Shield;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/95 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-4xl"
      >
        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/70 text-sm">
              {showTierInfo ? 'Plan Features' : `Step ${currentSlide + 1} of ${tutorialSlides.length}`}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              className="text-white/70 hover:text-white"
            >
              Skip Tutorial
            </Button>
          </div>
          <Progress value={progress} className="h-2 bg-white/20" />
        </div>

        <AnimatePresence mode="wait">
          {!showTierInfo ? (
            <motion.div
              key={currentSlide}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="overflow-hidden border-0 shadow-2xl">
                <div className={`bg-gradient-to-r ${slide.color} p-8 text-white`}>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-white/20 rounded-xl">
                      <Icon className="w-8 h-8" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold">{slide.title}</h2>
                      <p className="text-white/80">{slide.subtitle}</p>
                    </div>
                    {slide.tier && slide.tier !== 'all' && (
                      <Badge className="ml-auto bg-white/20 text-white">
                        {tierFeatures[slide.tier]?.name}+
                      </Badge>
                    )}
                  </div>
                </div>

                <CardContent className="p-8">
                  <p className="text-slate-600 text-lg mb-6 leading-relaxed">
                    {slide.content}
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    {slide.features.map((feature, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg"
                      >
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                        <span className="text-sm text-slate-700">{feature}</span>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="tiers"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
            >
              <Card className="overflow-hidden border-0 shadow-2xl">
                <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-8 text-white">
                  <h2 className="text-2xl font-bold mb-2">Choose Your Power Level</h2>
                  <p className="text-white/70">Features available at each tier</p>
                </div>

                <CardContent className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {Object.entries(tierFeatures).map(([key, tier], i) => {
                      const TierIcon = tier.icon;
                      const isCurrentTier = key === userTier;
                      
                      return (
                        <motion.div
                          key={key}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.1 }}
                          className={`p-4 rounded-xl border-2 ${
                            isCurrentTier 
                              ? 'border-emerald-500 bg-emerald-50' 
                              : 'border-slate-200 bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-3">
                            <TierIcon className={`w-5 h-5 ${tier.color}`} />
                            <span className="font-semibold">{tier.name}</span>
                            {isCurrentTier && (
                              <Badge className="ml-auto bg-emerald-500 text-white text-xs">
                                Current
                              </Badge>
                            )}
                          </div>
                          <ul className="space-y-2">
                            {tier.features.map((f, j) => (
                              <li key={j} className="flex items-start gap-2 text-xs text-slate-600">
                                <CheckCircle2 className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                                {f}
                              </li>
                            ))}
                          </ul>
                        </motion.div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <Button
            variant="outline"
            onClick={handlePrev}
            disabled={currentSlide === 0 && !showTierInfo}
            className="bg-white/10 text-white border-white/20 hover:bg-white/20"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>

          <div className="flex gap-2">
            {tutorialSlides.map((_, i) => (
              <button
                key={i}
                onClick={() => { setShowTierInfo(false); setCurrentSlide(i); }}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === currentSlide && !showTierInfo ? 'bg-white' : 'bg-white/30'
                }`}
              />
            ))}
            <button
              onClick={() => setShowTierInfo(true)}
              className={`w-2 h-2 rounded-full transition-colors ${
                showTierInfo ? 'bg-white' : 'bg-white/30'
              }`}
            />
          </div>

          <Button
            onClick={handleNext}
            className="bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            {showTierInfo ? 'Get Started' : 'Next'}
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </motion.div>
    </div>
  );
}