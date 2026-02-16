import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { base44 } from '@/api/base44Client';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, 
  Store, 
  Scan, 
  CheckCircle, 
  ArrowRight, 
  Loader2,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

import ProfitIntegrityScore from '../components/dashboard/ProfitIntegrityScore';
import ProfitLeakCard from '../components/dashboard/ProfitLeakCard';

const steps = [
  { id: 'connect', title: 'Connect Store', icon: Store },
  { id: 'scan', title: 'Analyze Data', icon: Scan },
  { id: 'results', title: 'View Results', icon: Sparkles },
  { id: 'rules', title: 'Risk Rules', icon: Shield },
  { id: 'sync', title: 'Sync Setup', icon: Zap },
];

const defaultRiskRules = [
  {
    name: 'High Value First Orders',
    description: 'Flag first-time customers with large orders',
    conditions: [{ field: 'is_first_order', operator: 'equals', value: 'true' }, { field: 'order_value', operator: 'greater_than', value: '500' }],
    risk_adjustment: 25,
    action: 'verify'
  },
  {
    name: 'Excessive Discounts',
    description: 'Orders with more than 30% discount',
    conditions: [{ field: 'discount_pct', operator: 'greater_than', value: '30' }],
    risk_adjustment: 15,
    action: 'flag'
  },
  {
    name: 'International High Value',
    description: 'High value orders shipping internationally',
    conditions: [{ field: 'shipping_country', operator: 'not_equals', value: 'US' }, { field: 'order_value', operator: 'greater_than', value: '300' }],
    risk_adjustment: 20,
    action: 'verify'
  }
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [currentStep, setCurrentStep] = useState('connect');
  const [scanProgress, setScanProgress] = useState(0);
  const [scanMessage, setScanMessage] = useState('Connecting to Shopify...');
  const [analysisResults, setAnalysisResults] = useState(null);
  const [protections, setProtections] = useState({
    discount_protection: true,
    shipping_alerts: true,
    risk_alerts: true
  });
  const [selectedRules, setSelectedRules] = useState([0, 1]); // Default first two rules selected
  const [syncSettings, setSyncSettings] = useState({
    auto_sync_enabled: true,
    sync_frequency_minutes: 15,
    two_way_sync: true,
    push_tags: true,
    push_notes: true,
    auto_hold_high_risk: false
  });

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      
      // Check if already onboarded
      if (currentUser?.tenant_id) {
        const tenants = await base44.entities.Tenant.filter({ id: currentUser.tenant_id });
        if (tenants.length > 0 && tenants[0].onboarding_completed) {
          navigate(createPageUrl('Home'));
        }
      }
    } catch (e) {
      console.log('User not logged in');
    }
  };

  const startScan = async () => {
    setCurrentStep('scan');
    setScanProgress(0);
    
    // Simulate scanning progress
    const messages = [
      'Connecting to Shopify...',
      'Fetching orders from the last 30 days...',
      'Analyzing product costs...',
      'Calculating profit margins...',
      'Detecting shipping discrepancies...',
      'Evaluating risk patterns...',
      'Identifying profit leaks...',
      'Generating your Profit Integrity Score...',
      'Almost done...'
    ];

    for (let i = 0; i <= 100; i += 2) {
      await new Promise(resolve => setTimeout(resolve, 80));
      setScanProgress(i);
      const messageIndex = Math.floor((i / 100) * (messages.length - 1));
      setScanMessage(messages[messageIndex]);
    }

    // Generate mock analysis results
    const mockResults = {
      profitIntegrityScore: 67,
      totalOrders: 247,
      totalRevenue: 45280,
      totalProfit: 12340,
      avgMargin: 27.3,
      profitLeaks: [
        {
          id: '1',
          type: 'shipping_loss',
          title: 'Shipping Undercharging',
          description: '43 orders charged less than actual shipping cost',
          impact_amount: 892,
          affected_orders: 43,
          recommendation: 'Review shipping rates or add a handling fee to cover costs'
        },
        {
          id: '2',
          type: 'negative_margin_sku',
          title: 'Unprofitable Products',
          description: '7 SKUs are selling below cost after fees',
          impact_amount: 1245,
          affected_orders: 89,
          affected_skus: ['SKU-001', 'SKU-042', 'SKU-078'],
          recommendation: 'Raise prices or discontinue these products'
        },
        {
          id: '3',
          type: 'discount_abuse',
          title: 'Excessive Discounting',
          description: '12 orders had multiple discount codes stacked',
          impact_amount: 567,
          affected_orders: 12,
          recommendation: 'Enable discount protection to prevent code stacking'
        }
      ]
    };

    setAnalysisResults(mockResults);
    setCurrentStep('results');
  };

  const proceedToRules = () => {
    setCurrentStep('rules');
  };

  const proceedToSync = () => {
    setCurrentStep('sync');
  };

  const completeOnboarding = async () => {
    setCurrentStep('completing');
    
    // Save settings and mark onboarding complete
    if (user?.tenant_id) {
      try {
        // Update tenant
        const tenants = await base44.entities.Tenant.filter({ id: user.tenant_id });
        if (tenants.length > 0) {
          await base44.entities.Tenant.update(tenants[0].id, {
            onboarding_completed: true,
            profit_integrity_score: analysisResults?.profitIntegrityScore || 50,
            status: 'active'
          });
        }

        // Create or update settings
        const existingSettings = await base44.entities.TenantSettings.filter({ tenant_id: user.tenant_id });
        if (existingSettings.length > 0) {
          await base44.entities.TenantSettings.update(existingSettings[0].id, {
            enable_discount_protection: protections.discount_protection,
            enable_shipping_alerts: protections.shipping_alerts,
            enable_risk_alerts: protections.risk_alerts
          });
        } else {
          await base44.entities.TenantSettings.create({
            tenant_id: user.tenant_id,
            enable_discount_protection: protections.discount_protection,
            enable_shipping_alerts: protections.shipping_alerts,
            enable_risk_alerts: protections.risk_alerts
          });
        }

        // Create selected risk rules
        for (const index of selectedRules) {
          const rule = defaultRiskRules[index];
          if (rule) {
            await base44.entities.RiskRule.create({
              tenant_id: user.tenant_id,
              name: rule.name,
              description: rule.description,
              is_active: true,
              priority: 50,
              conditions: rule.conditions,
              risk_adjustment: rule.risk_adjustment,
              action: rule.action,
              notification: true
            });
          }
        }

        // Update platform integration with sync settings
        const integrations = await base44.entities.PlatformIntegration.filter({ tenant_id: user.tenant_id });
        if (integrations.length > 0) {
          await base44.entities.PlatformIntegration.update(integrations[0].id, {
            sync_config: {
              auto_sync_enabled: syncSettings.auto_sync_enabled,
              sync_frequency_minutes: syncSettings.sync_frequency_minutes,
              sync_products: true,
              sync_customers: true
            },
            two_way_sync: {
              enabled: syncSettings.two_way_sync,
              push_tags: syncSettings.push_tags,
              push_notes: syncSettings.push_notes,
              auto_hold_high_risk: syncSettings.auto_hold_high_risk
            }
          });
        }
      } catch (e) {
        console.log('Error saving settings:', e);
      }
    }

    // Wait a moment then redirect
    await new Promise(resolve => setTimeout(resolve, 1500));
    navigate(createPageUrl('Home'));
  };

  const currentStepIndex = steps.findIndex(s => s.id === currentStep);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <span className="font-bold text-xl text-slate-900">ProfitShield AI</span>
        </div>
      </header>

      {/* Progress Steps */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-8">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = index === currentStepIndex;
            const isComplete = index < currentStepIndex;
            
            return (
              <React.Fragment key={step.id}>
                <div className="flex flex-col items-center">
                  <div className={`
                    w-12 h-12 rounded-full flex items-center justify-center transition-all
                    ${isComplete ? 'bg-emerald-500' : isActive ? 'bg-emerald-100 ring-2 ring-emerald-500' : 'bg-slate-100'}
                  `}>
                    {isComplete ? (
                      <CheckCircle className="w-6 h-6 text-white" />
                    ) : (
                      <Icon className={`w-6 h-6 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                    )}
                  </div>
                  <span className={`text-sm mt-2 ${isActive ? 'text-emerald-600 font-medium' : 'text-slate-500'}`}>
                    {step.title}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-4 ${index < currentStepIndex ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 pb-12">
        <AnimatePresence mode="wait">
          {/* Step 1: Connect */}
          {currentStep === 'connect' && (
            <motion.div
              key="connect"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card className="text-center py-12">
                <CardContent>
                  <div className="w-20 h-20 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Store className="w-10 h-10 text-emerald-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">Welcome to ProfitShield AI</h2>
                  <p className="text-slate-500 mb-8 max-w-md mx-auto">
                    Let's analyze your Shopify store to uncover hidden profit leaks and calculate your true margins.
                  </p>
                  <div className="space-y-4">
                    <Button 
                      size="lg" 
                      className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                      onClick={startScan}
                    >
                      <Scan className="w-5 h-5" />
                      Analyze My Store
                      <ArrowRight className="w-5 h-5" />
                    </Button>
                    <p className="text-sm text-slate-400">
                      We'll scan your last 30 days of orders. Takes about 2 minutes.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Step 2: Scanning */}
          {currentStep === 'scan' && (
            <motion.div
              key="scan"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card className="text-center py-12">
                <CardContent>
                  <div className="w-20 h-20 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-6 relative">
                    <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">Analyzing Your Store</h2>
                  <p className="text-slate-500 mb-8">{scanMessage}</p>
                  <div className="max-w-md mx-auto">
                    <Progress value={scanProgress} className="h-2 mb-2" />
                    <p className="text-sm text-slate-400">{scanProgress}% complete</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Step 3: Results */}
          {currentStep === 'results' && analysisResults && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <Card className="overflow-hidden">
                <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-6 text-white">
                  <h2 className="text-2xl font-bold mb-1">Your Profit Analysis is Ready!</h2>
                  <p className="text-emerald-100">
                    We analyzed {analysisResults.totalOrders} orders from the last 30 days
                  </p>
                </div>
                <CardContent className="p-6">
                  <div className="grid md:grid-cols-2 gap-8">
                    {/* Score */}
                    <div className="flex flex-col items-center justify-center">
                      <h3 className="text-sm font-medium text-slate-500 mb-4">Your Profit Integrity Score</h3>
                      <ProfitIntegrityScore score={analysisResults.profitIntegrityScore} />
                    </div>

                    {/* Stats */}
                    <div className="space-y-4">
                      <div className="p-4 bg-slate-50 rounded-xl">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500">True Net Profit</span>
                          <span className="text-2xl font-bold text-emerald-600">
                            ${analysisResults.totalProfit.toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-xl">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500">Total Revenue</span>
                          <span className="text-2xl font-bold text-slate-900">
                            ${analysisResults.totalRevenue.toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-xl">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500">Average Margin</span>
                          <span className="text-2xl font-bold text-slate-900">
                            {analysisResults.avgMargin}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Profit Leaks */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  <h3 className="text-lg font-semibold text-slate-900">
                    We Found {analysisResults.profitLeaks.length} Hidden Profit Leaks
                  </h3>
                </div>
                <div className="space-y-4">
                  {analysisResults.profitLeaks.map((leak, index) => (
                    <ProfitLeakCard key={leak.id} leak={leak} index={index} />
                  ))}
                </div>
                <p className="text-center text-slate-500 mt-4">
                  Total potential savings: 
                  <span className="font-semibold text-emerald-600 ml-1">
                    ${analysisResults.profitLeaks.reduce((sum, l) => sum + l.impact_amount, 0).toLocaleString()}
                  </span>
                </p>
              </div>

              {/* Protections */}
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">
                    <Zap className="w-5 h-5 inline mr-2 text-amber-500" />
                    Enable Profit Protection
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                      <div>
                        <p className="font-medium text-slate-900">Discount Protection</p>
                        <p className="text-sm text-slate-500">Alert on excessive discount stacking</p>
                      </div>
                      <Switch 
                        checked={protections.discount_protection}
                        onCheckedChange={(v) => setProtections({ ...protections, discount_protection: v })}
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                      <div>
                        <p className="font-medium text-slate-900">Shipping Buffer Alerts</p>
                        <p className="text-sm text-slate-500">Notify when shipping costs exceed charges</p>
                      </div>
                      <Switch 
                        checked={protections.shipping_alerts}
                        onCheckedChange={(v) => setProtections({ ...protections, shipping_alerts: v })}
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                      <div>
                        <p className="font-medium text-slate-900">High-Risk Order Alerts</p>
                        <p className="text-sm text-slate-500">Flag potentially fraudulent orders</p>
                      </div>
                      <Switch 
                        checked={protections.risk_alerts}
                        onCheckedChange={(v) => setProtections({ ...protections, risk_alerts: v })}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="text-center">
                <Button 
                  size="lg" 
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                  onClick={proceedToRules}
                >
                  Set Up Risk Rules
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 4: Risk Rules */}
          {currentStep === 'rules' && (
            <motion.div
              key="rules"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
                      <Shield className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">Customize Risk Detection</h2>
                      <p className="text-slate-500">Select rules to automatically flag risky orders</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {defaultRiskRules.map((rule, index) => (
                      <div 
                        key={index}
                        className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          selectedRules.includes(index) 
                            ? 'border-emerald-500 bg-emerald-50' 
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                        onClick={() => {
                          if (selectedRules.includes(index)) {
                            setSelectedRules(selectedRules.filter(i => i !== index));
                          } else {
                            setSelectedRules([...selectedRules, index]);
                          }
                        }}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                              selectedRules.includes(index) ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'
                            }`}>
                              {selectedRules.includes(index) && <CheckCircle className="w-3 h-3 text-white" />}
                            </div>
                            <div>
                              <p className="font-medium text-slate-900">{rule.name}</p>
                              <p className="text-sm text-slate-500">{rule.description}</p>
                              <div className="flex flex-wrap gap-1 mt-2">
                                {rule.conditions.map((c, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">
                                    {c.field.replace('_', ' ')} {c.operator.replace('_', ' ')} {c.value}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                          <Badge className={rule.risk_adjustment > 15 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}>
                            +{rule.risk_adjustment} pts
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="text-sm text-slate-500 mt-4 text-center">
                    You can add more custom rules later in Settings
                  </p>
                </CardContent>
              </Card>

              <div className="text-center">
                <Button 
                  size="lg" 
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                  onClick={proceedToSync}
                >
                  Configure Sync
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 5: Sync Setup */}
          {currentStep === 'sync' && (
            <motion.div
              key="sync"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
                      <Zap className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">Automated Sync Settings</h2>
                      <p className="text-slate-500">Configure how ProfitShield syncs with your store</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                      <div>
                        <p className="font-medium text-slate-900">Auto-Sync Orders</p>
                        <p className="text-sm text-slate-500">Automatically sync new orders from your store</p>
                      </div>
                      <Switch 
                        checked={syncSettings.auto_sync_enabled}
                        onCheckedChange={(v) => setSyncSettings({ ...syncSettings, auto_sync_enabled: v })}
                      />
                    </div>

                    {syncSettings.auto_sync_enabled && (
                      <div className="p-4 bg-slate-50 rounded-xl">
                        <Label className="text-sm font-medium text-slate-700">Sync Frequency</Label>
                        <div className="flex gap-2 mt-2">
                          {[5, 15, 30, 60].map((mins) => (
                            <Button
                              key={mins}
                              variant={syncSettings.sync_frequency_minutes === mins ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setSyncSettings({ ...syncSettings, sync_frequency_minutes: mins })}
                              className={syncSettings.sync_frequency_minutes === mins ? 'bg-emerald-600' : ''}
                            >
                              {mins < 60 ? `${mins}m` : '1h'}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}

                    <Separator />

                    <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                      <div>
                        <p className="font-medium text-slate-900 flex items-center gap-2">
                          Two-Way Sync
                          <Badge className="bg-emerald-100 text-emerald-700 text-xs">Recommended</Badge>
                        </p>
                        <p className="text-sm text-slate-500">Push risk data back to your store</p>
                      </div>
                      <Switch 
                        checked={syncSettings.two_way_sync}
                        onCheckedChange={(v) => setSyncSettings({ ...syncSettings, two_way_sync: v })}
                      />
                    </div>

                    {syncSettings.two_way_sync && (
                      <div className="ml-4 space-y-3">
                        <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                          <div>
                            <p className="text-sm font-medium text-slate-900">Add Risk Tags to Orders</p>
                            <p className="text-xs text-slate-500">e.g., "high-risk", "medium-risk"</p>
                          </div>
                          <Switch 
                            checked={syncSettings.push_tags}
                            onCheckedChange={(v) => setSyncSettings({ ...syncSettings, push_tags: v })}
                          />
                        </div>
                        <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                          <div>
                            <p className="text-sm font-medium text-slate-900">Add Risk Notes</p>
                            <p className="text-xs text-slate-500">Detailed risk analysis in order notes</p>
                          </div>
                          <Switch 
                            checked={syncSettings.push_notes}
                            onCheckedChange={(v) => setSyncSettings({ ...syncSettings, push_notes: v })}
                          />
                        </div>
                        <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                          <div>
                            <p className="text-sm font-medium text-slate-900">Auto-Hold High Risk Orders</p>
                            <p className="text-xs text-slate-500">Automatically hold fulfillment for review</p>
                          </div>
                          <Switch 
                            checked={syncSettings.auto_hold_high_risk}
                            onCheckedChange={(v) => setSyncSettings({ ...syncSettings, auto_hold_high_risk: v })}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <div className="text-center">
                <Button 
                  size="lg" 
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                  onClick={completeOnboarding}
                >
                  Complete Setup
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 6: Completing */}
          {currentStep === 'completing' && (
            <motion.div
              key="protect"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card className="text-center py-12">
                <CardContent>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 15 }}
                    className="w-20 h-20 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-6"
                  >
                    <CheckCircle className="w-10 h-10 text-white" />
                  </motion.div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">You're All Set!</h2>
                  <p className="text-slate-500 mb-4">
                    ProfitShield AI is now protecting your profits.
                  </p>
                  <Loader2 className="w-6 h-6 text-emerald-600 animate-spin mx-auto" />
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}