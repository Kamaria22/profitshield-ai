import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { usePlatformResolver, requireResolved } from '@/components/usePlatformResolver';
import { createPageUrl } from '@/components/platformContext';
import { 
  Check, 
  X, 
  Shield, 
  Zap, 
  Crown, 
  Building2,
  ArrowRight,
  Sparkles,
  TrendingUp,
  Users,
  Clock,
  HeadphonesIcon,
  Lock
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

const PRICING_TIERS = [
  {
    id: 'trial',
    name: 'Free Trial',
    description: 'Try ProfitShield risk-free',
    monthlyPrice: 0,
    yearlyPrice: 0,
    orderLimit: 100,
    duration: '14 days',
    icon: Sparkles,
    color: 'slate',
    popular: false,
    features: [
      { name: 'Up to 100 orders/month', included: true },
      { name: 'Basic profit analytics', included: true },
      { name: 'Risk scoring', included: true },
      { name: 'Email alerts', included: true },
      { name: 'Single store connection', included: true },
      { name: 'Demo data included', included: true },
      { name: 'Two-way Shopify sync', included: false },
      { name: 'Custom risk rules', included: false },
      { name: 'API access', included: false },
      { name: 'Priority support', included: false }
    ],
    cta: 'Start Free Trial',
    ctaVariant: 'outline'
  },
  {
    id: 'starter',
    name: 'Starter',
    description: 'For growing Shopify stores',
    monthlyPrice: 29,
    yearlyPrice: 290,
    orderLimit: 500,
    icon: Zap,
    color: 'blue',
    popular: false,
    features: [
      { name: 'Up to 500 orders/month', included: true },
      { name: 'Full profit analytics', included: true },
      { name: 'Advanced risk scoring', included: true },
      { name: 'Email + push alerts', included: true },
      { name: 'Single store connection', included: true },
      { name: 'Two-way Shopify sync', included: true },
      { name: '5 custom risk rules', included: true },
      { name: 'Basic API access', included: true },
      { name: 'Standard support', included: true },
      { name: 'Priority support', included: false }
    ],
    cta: 'Get Started',
    ctaVariant: 'default'
  },
  {
    id: 'growth',
    name: 'Growth',
    description: 'For scaling e-commerce brands',
    monthlyPrice: 79,
    yearlyPrice: 790,
    orderLimit: 2500,
    icon: TrendingUp,
    color: 'emerald',
    popular: true,
    features: [
      { name: 'Up to 2,500 orders/month', included: true },
      { name: 'Full profit analytics', included: true },
      { name: 'AI fraud detection', included: true },
      { name: 'All notification channels', included: true },
      { name: 'Up to 3 store connections', included: true },
      { name: 'Two-way Shopify sync', included: true },
      { name: '25 custom risk rules', included: true },
      { name: 'Full API access', included: true },
      { name: 'Priority support', included: true },
      { name: 'Churn prediction', included: true }
    ],
    cta: 'Start Growth Plan',
    ctaVariant: 'default'
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'For high-volume merchants',
    monthlyPrice: 199,
    yearlyPrice: 1990,
    orderLimit: 10000,
    icon: Crown,
    color: 'violet',
    popular: false,
    features: [
      { name: 'Up to 10,000 orders/month', included: true },
      { name: 'Advanced profit analytics', included: true },
      { name: 'AI fraud ring detection', included: true },
      { name: 'SMS + WhatsApp alerts', included: true },
      { name: 'Unlimited store connections', included: true },
      { name: 'Real-time Shopify sync', included: true },
      { name: 'Unlimited risk rules', included: true },
      { name: 'Webhooks + full API', included: true },
      { name: 'Dedicated support', included: true },
      { name: 'Custom integrations', included: true }
    ],
    cta: 'Go Pro',
    ctaVariant: 'default'
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large-scale operations',
    monthlyPrice: null,
    yearlyPrice: null,
    orderLimit: 'Unlimited',
    icon: Building2,
    color: 'slate',
    popular: false,
    features: [
      { name: 'Unlimited orders', included: true },
      { name: 'White-label options', included: true },
      { name: 'Multi-region deployment', included: true },
      { name: 'Custom SLA', included: true },
      { name: 'Agency/multi-tenant', included: true },
      { name: 'On-premise option', included: true },
      { name: 'Custom ML models', included: true },
      { name: 'Dedicated infrastructure', included: true },
      { name: 'Dedicated CSM', included: true },
      { name: 'SOC 2 compliance', included: true }
    ],
    cta: 'Contact Sales',
    ctaVariant: 'outline'
  }
];

const FAQ = [
  {
    q: 'What happens after my free trial ends?',
    a: 'Your account will automatically downgrade to a limited free tier. You can upgrade anytime to continue with full features. No credit card required for trial.'
  },
  {
    q: 'Can I change plans anytime?',
    a: 'Yes! Upgrade instantly or downgrade at the end of your billing cycle. We\'ll prorate any unused time when upgrading.'
  },
  {
    q: 'What counts as an "order"?',
    a: 'Each unique order synced from your store counts once. Refunds, updates, and risk re-calculations don\'t count as additional orders.'
  },
  {
    q: 'Do you offer discounts for annual billing?',
    a: 'Yes! Annual plans include 2 months free (save ~17%). Toggle to yearly billing above to see discounted prices.'
  },
  {
    q: 'Is my data secure?',
    a: 'Absolutely. We use bank-level encryption, never store payment details, and are GDPR compliant. Your Shopify data is processed securely.'
  }
];

export default function Pricing() {
  const [isYearly, setIsYearly] = useState(false);
  const [selectedTier, setSelectedTier] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  
  const resolver = usePlatformResolver();
  const resolverCheck = requireResolved(resolver);
  const tenant = resolver?.tenant;
  const currentTier = tenant?.subscription_tier || 'trial';

  const handleSelectPlan = async (tier) => {
    if (tier.id === 'enterprise') {
      // Open contact form or email
      window.location.href = 'mailto:sales@profitshield.ai?subject=Enterprise%20Inquiry';
      return;
    }

    if (tier.id === 'trial') {
      navigate(createPageUrl('Onboarding'));
      return;
    }

    setSelectedTier(tier.id);
    setLoading(true);

    try {
      // In production, this would integrate with Stripe
      if (resolverCheck.tenantId) {
        await base44.entities.Tenant.update(tenant.id, {
          subscription_tier: tier.id,
          monthly_order_limit: tier.orderLimit
        });
        toast.success(`Upgraded to ${tier.name}!`);
        navigate(createPageUrl('Home'));
      } else {
        // No tenant yet, go to onboarding
        navigate(createPageUrl('Onboarding'));
      }
    } catch (error) {
      toast.error('Failed to update subscription');
    } finally {
      setLoading(false);
      setSelectedTier(null);
    }
  };

  const getColorClasses = (color, type) => {
    const colors = {
      slate: {
        bg: 'bg-slate-50',
        border: 'border-slate-200',
        icon: 'bg-slate-100 text-slate-600',
        badge: 'bg-slate-100 text-slate-700',
        button: 'bg-slate-800 hover:bg-slate-900'
      },
      blue: {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        icon: 'bg-blue-100 text-blue-600',
        badge: 'bg-blue-100 text-blue-700',
        button: 'bg-blue-600 hover:bg-blue-700'
      },
      emerald: {
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        icon: 'bg-emerald-100 text-emerald-600',
        badge: 'bg-emerald-100 text-emerald-700',
        button: 'bg-emerald-600 hover:bg-emerald-700'
      },
      violet: {
        bg: 'bg-violet-50',
        border: 'border-violet-200',
        icon: 'bg-violet-100 text-violet-600',
        badge: 'bg-violet-100 text-violet-700',
        button: 'bg-violet-600 hover:bg-violet-700'
      }
    };
    return colors[color]?.[type] || colors.slate[type];
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div 
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-700 px-4 py-2 rounded-full text-sm font-medium mb-4">
            <Shield className="w-4 h-4" />
            Protect Your Profits
          </div>
          <h1 className="text-4xl font-bold text-slate-900 mb-4">
            Simple, Transparent Pricing
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Choose the plan that fits your store. All plans include core profit protection features.
            Scale as you grow.
          </p>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-4 mt-8">
            <span className={`text-sm font-medium ${!isYearly ? 'text-slate-900' : 'text-slate-500'}`}>
              Monthly
            </span>
            <Switch checked={isYearly} onCheckedChange={setIsYearly} />
            <span className={`text-sm font-medium ${isYearly ? 'text-slate-900' : 'text-slate-500'}`}>
              Yearly
            </span>
            {isYearly && (
              <Badge className="bg-emerald-100 text-emerald-700 ml-2">
                Save 17%
              </Badge>
            )}
          </div>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-16">
          {PRICING_TIERS.map((tier, index) => {
            const Icon = tier.icon;
            const isCurrentPlan = currentTier === tier.id;
            const price = isYearly ? tier.yearlyPrice : tier.monthlyPrice;
            
            return (
              <motion.div
                key={tier.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="relative"
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                    <Badge className="bg-emerald-600 text-white shadow-lg">
                      Most Popular
                    </Badge>
                  </div>
                )}
                
                <Card className={`h-full flex flex-col ${tier.popular ? 'border-2 border-emerald-500 shadow-xl shadow-emerald-500/10' : 'border-slate-200'} ${isCurrentPlan ? 'ring-2 ring-emerald-500' : ''}`}>
                  <CardHeader className="text-center pb-4">
                    <div className={`w-12 h-12 rounded-xl ${getColorClasses(tier.color, 'icon')} flex items-center justify-center mx-auto mb-3`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <CardTitle className="text-xl">{tier.name}</CardTitle>
                    <CardDescription className="text-sm">{tier.description}</CardDescription>
                  </CardHeader>
                  
                  <CardContent className="flex-1">
                    <div className="text-center mb-6">
                      {price !== null ? (
                        <>
                          <span className="text-4xl font-bold text-slate-900">${price}</span>
                          <span className="text-slate-500">/{isYearly ? 'year' : 'month'}</span>
                          {tier.duration && (
                            <p className="text-sm text-slate-500 mt-1">{tier.duration}</p>
                          )}
                        </>
                      ) : (
                        <span className="text-2xl font-bold text-slate-900">Custom</span>
                      )}
                    </div>

                    <div className="space-y-3">
                      {tier.features.map((feature, i) => (
                        <div key={i} className="flex items-start gap-2">
                          {feature.included ? (
                            <Check className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                          ) : (
                            <X className="w-4 h-4 text-slate-300 mt-0.5 flex-shrink-0" />
                          )}
                          <span className={`text-sm ${feature.included ? 'text-slate-700' : 'text-slate-400'}`}>
                            {feature.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>

                  <CardFooter className="pt-4">
                    <Button 
                      className={`w-full ${tier.popular ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
                      variant={tier.ctaVariant}
                      onClick={() => handleSelectPlan(tier)}
                      disabled={loading && selectedTier === tier.id || isCurrentPlan}
                    >
                      {isCurrentPlan ? (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          Current Plan
                        </>
                      ) : loading && selectedTier === tier.id ? (
                        'Processing...'
                      ) : (
                        <>
                          {tier.cta}
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* Trust Badges */}
        <motion.div 
          className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-16"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <div className="text-center p-4">
            <Lock className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">Bank-Level Security</p>
            <p className="text-xs text-slate-500">256-bit encryption</p>
          </div>
          <div className="text-center p-4">
            <Clock className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">14-Day Free Trial</p>
            <p className="text-xs text-slate-500">No credit card required</p>
          </div>
          <div className="text-center p-4">
            <HeadphonesIcon className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">Expert Support</p>
            <p className="text-xs text-slate-500">Real humans, fast response</p>
          </div>
          <div className="text-center p-4">
            <Users className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">1000+ Merchants</p>
            <p className="text-xs text-slate-500">Trust ProfitShield</p>
          </div>
        </motion.div>

        {/* FAQ Section */}
        <motion.div 
          className="max-w-3xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-8">
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            {FAQ.map((item, index) => (
              <Card key={index} className="border-slate-200">
                <CardContent className="pt-4">
                  <h3 className="font-semibold text-slate-900 mb-2">{item.q}</h3>
                  <p className="text-slate-600 text-sm">{item.a}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </motion.div>

        {/* CTA Section */}
        <motion.div 
          className="text-center mt-16 p-8 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl text-white"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.7 }}
        >
          <h2 className="text-2xl font-bold mb-2">Ready to protect your profits?</h2>
          <p className="text-emerald-100 mb-6">Start your 14-day free trial today. No credit card required.</p>
          <Button 
            size="lg" 
            className="bg-white text-emerald-700 hover:bg-emerald-50"
            onClick={() => navigate(createPageUrl('Onboarding'))}
          >
            Start Free Trial
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </motion.div>
      </div>
    </div>
  );
}