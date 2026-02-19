import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Shield,
  TrendingUp,
  AlertTriangle,
  Brain,
  Zap,
  Crown,
  Rocket,
  ArrowRight,
  Check,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const TUTORIAL_SLIDES = [
  {
    id: 'welcome',
    title: 'Welcome to ProfitShield AI 🎉',
    description: 'Your AI-powered profit protection and growth platform',
    icon: Shield,
    color: 'from-emerald-500 to-teal-600',
    features: [
      'Real-time profit monitoring',
      'AI-powered risk detection',
      'Automated margin protection',
      'Executive-level insights'
    ]
  },
  {
    id: 'dashboard',
    title: 'Smart Dashboard',
    description: 'Track your business health at a glance',
    icon: TrendingUp,
    color: 'from-blue-500 to-indigo-600',
    features: [
      'Live profit metrics',
      'Customizable widgets',
      'Trend analysis',
      'Quick actions'
    ],
    tierNote: 'Starter'
  },
  {
    id: 'risk',
    title: 'Risk Intelligence',
    description: 'Detect and prevent profit leaks before they happen',
    icon: AlertTriangle,
    color: 'from-amber-500 to-orange-600',
    features: [
      'Fraud detection',
      'Chargeback prevention',
      'Shipping anomalies',
      'Custom risk rules'
    ],
    tierNote: 'Growth+'
  },
  {
    id: 'ai',
    title: 'AI Insights & Automation',
    description: 'Let AI optimize your business 24/7',
    icon: Brain,
    color: 'from-purple-500 to-pink-600',
    features: [
      'Predictive analytics',
      'Automated actions',
      'Smart recommendations',
      'Market intelligence'
    ],
    tierNote: 'Pro',
    upgrade: true
  },
  {
    id: 'autopilot',
    title: 'Founder Autopilot Mode',
    description: 'Strategic AI that runs while you sleep',
    icon: Rocket,
    color: 'from-rose-500 to-red-600',
    features: [
      'Autonomous decision-making',
      'Strategic simulations',
      'Competitive intelligence',
      'Growth experiments'
    ],
    tierNote: 'Enterprise',
    upgrade: true,
    premium: true
  }
];

const TIER_FEATURES = {
  trial: {
    name: 'Trial',
    price: 'Free',
    limits: '100 orders/month',
    features: ['Basic dashboard', 'Manual risk review', '7-day history'],
    color: 'text-slate-600'
  },
  starter: {
    name: 'Starter',
    price: '$49/mo',
    limits: '1,000 orders/month',
    features: ['Full dashboard', 'Real-time alerts', 'Custom rules', '30-day history'],
    color: 'text-blue-600',
    highlight: true
  },
  growth: {
    name: 'Growth',
    price: '$149/mo',
    limits: '5,000 orders/month',
    features: ['AI insights', 'Automated actions', 'Benchmarking', '90-day history'],
    color: 'text-purple-600'
  },
  pro: {
    name: 'Pro',
    price: '$399/mo',
    limits: '25,000 orders/month',
    features: ['Founder AI', 'Autopilot mode', 'Multi-store', 'Unlimited history'],
    color: 'text-emerald-600'
  },
  enterprise: {
    name: 'Enterprise',
    price: 'Custom',
    limits: 'Unlimited',
    features: ['White-label', 'Dedicated support', 'Custom integrations', 'SLA'],
    color: 'text-rose-600'
  }
};

export default function OnboardingTutorial({ open, onClose, onUpgrade, currentTier = 'trial' }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showPricing, setShowPricing] = useState(false);

  const slide = TUTORIAL_SLIDES[currentSlide];
  const Icon = slide.icon;
  const isLastSlide = currentSlide === TUTORIAL_SLIDES.length - 1;

  const handleNext = () => {
    if (isLastSlide) {
      setShowPricing(true);
    } else {
      setCurrentSlide(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (showPricing) {
      setShowPricing(false);
    } else if (currentSlide > 0) {
      setCurrentSlide(prev => prev - 1);
    }
  };

  const handleUpgrade = (tier) => {
    if (onUpgrade) {
      onUpgrade(tier);
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {!showPricing ? (
            <motion.div
              key="tutorial"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              {/* Header */}
              <div className={`bg-gradient-to-r ${slide.color} p-6 text-white`}>
                <div className="mb-4">
                  <Icon className="w-12 h-12" />
                </div>
                <h2 className="text-3xl font-bold mb-2">{slide.title}</h2>
                <p className="text-white/90 text-lg">{slide.description}</p>
                
                {slide.tierNote && (
                  <div className="mt-4 flex items-center gap-2">
                    <Badge className="bg-white/20 text-white border-white/30">
                      {slide.upgrade ? '🔒 ' : '✓ '} {slide.tierNote}
                    </Badge>
                    {slide.upgrade && (
                      <span className="text-sm text-white/80">Available with upgrade</span>
                    )}
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="p-6">
                <div className="space-y-4 mb-8">
                  {slide.features.map((feature, idx) => (
                    <motion.div
                      key={feature}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="flex items-start gap-3"
                    >
                      <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                      <span className="text-slate-600">{feature}</span>
                    </motion.div>
                  ))}
                </div>

                {/* Navigation */}
                <div className="flex items-center justify-between pt-6 border-t">
                  <Button
                    variant="ghost"
                    onClick={handleBack}
                    disabled={currentSlide === 0}
                  >
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>

                  <div className="flex gap-2">
                    {TUTORIAL_SLIDES.map((_, idx) => (
                      <div
                        key={idx}
                        className={`h-2 rounded-full transition-all ${
                          idx === currentSlide ? 'w-6 bg-emerald-600' : 'w-2 bg-slate-300'
                        }`}
                      />
                    ))}
                  </div>

                  <Button
                    onClick={handleNext}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {isLastSlide ? 'View Pricing' : 'Next'}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="pricing"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              {/* Pricing Section */}
              <div className="p-6">
                <h2 className="text-3xl font-bold mb-2 text-slate-900">Plans & Pricing</h2>
                <p className="text-slate-600 mb-8">Choose the perfect plan for your business</p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
                  {Object.entries(TIER_FEATURES).map(([tier, features]) => (
                    <Card
                      key={tier}
                      className={`relative transition-all ${
                        features.highlight ? 'ring-2 ring-emerald-500 lg:scale-105' : ''
                      } ${tier === currentTier ? 'ring-2 ring-blue-500' : ''}`}
                    >
                      <CardContent className="p-4">
                        <div className="text-sm font-semibold text-slate-600 mb-1">{features.name}</div>
                        <div className={`text-2xl font-bold mb-1 ${features.color}`}>{features.price}</div>
                        <div className="text-xs text-slate-500 mb-4">{features.limits}</div>
                        <ul className="space-y-2 mb-4">
                          {features.features.map((f, idx) => (
                            <li key={idx} className="text-xs text-slate-600 flex gap-2">
                              <Check className="w-3 h-3 text-emerald-500 flex-shrink-0 mt-0.5" />
                              {f}
                            </li>
                          ))}
                        </ul>
                        {tier !== currentTier && (
                          <Button
                            size="sm"
                            onClick={() => handleUpgrade(tier)}
                            className="w-full text-xs"
                            variant={features.highlight ? 'default' : 'outline'}
                          >
                            Upgrade
                          </Button>
                        )}
                        {tier === currentTier && (
                          <div className="text-xs text-emerald-600 font-semibold p-2 bg-emerald-50 rounded text-center">
                            Current Plan
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Navigation */}
                <div className="flex justify-between pt-6 border-t">
                  <Button variant="ghost" onClick={handleBack}>
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                  <Button onClick={onClose} variant="outline">
                    Continue
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}