import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import {
  TrendingUp,
  DollarSign,
  Users,
  Activity,
  Target,
  Shield,
  Award,
  AlertTriangle,
  CheckCircle,
  Lock
} from 'lucide-react';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function FounderDashboard() {
  const [user, setUser] = useState(null);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      if (u.role !== 'admin') {
        setAccessDenied(true);
      }
    }).catch(() => setAccessDenied(true));
  }, []);

  const { data: allTenants = [] } = useQuery({
    queryKey: ['allTenants'],
    queryFn: () => base44.entities.Tenant.list(),
    enabled: !accessDenied
  });

  const { data: saasMetrics = [] } = useQuery({
    queryKey: ['saasMetrics'],
    queryFn: () => base44.entities.SaaSMetrics.filter({}, '-period', 12),
    enabled: !accessDenied
  });

  // Calculate live metrics
  const metrics = React.useMemo(() => {
    const active = allTenants.filter(t => t.status === 'active').length;
    const trial = allTenants.filter(t => t.subscription_tier === 'trial').length;
    const starter = allTenants.filter(t => t.subscription_tier === 'starter').length;
    const growth = allTenants.filter(t => t.subscription_tier === 'growth').length;
    const pro = allTenants.filter(t => t.subscription_tier === 'pro').length;

    // Calculate MRR (example pricing)
    const tierPricing = { trial: 0, starter: 29, growth: 79, pro: 199, enterprise: 499 };
    const mrr = allTenants.reduce((sum, t) => sum + (tierPricing[t.subscription_tier] || 0), 0);
    const arr = mrr * 12;
    const arpu = active > 0 ? mrr / active : 0;

    return {
      total: allTenants.length,
      active,
      trial,
      starter,
      growth,
      pro,
      mrr,
      arr,
      arpu,
      trialConversion: trial > 0 ? (((starter + growth + pro) / (trial + starter + growth + pro)) * 100).toFixed(1) : 0
    };
  }, [allTenants]);

  const tierData = [
    { name: 'Trial', value: metrics.trial, color: '#94a3b8' },
    { name: 'Starter', value: metrics.starter, color: '#10b981' },
    { name: 'Growth', value: metrics.growth, color: '#3b82f6' },
    { name: 'Pro', value: metrics.pro, color: '#8b5cf6' }
  ];

  const acquisitionReadiness = React.useMemo(() => {
    const scores = {
      revenueQuality: Math.min(100, metrics.mrr / 10), // Target $1000 MRR
      customerDiversity: Math.min(100, metrics.active * 10), // Target 10 customers
      integrationDepth: 75, // Shopify deep integration
      dataAsset: 60, // Industry benchmarks
      security: 85, // Enterprise security features
      scalability: 80 // Event-driven architecture
    };
    
    const overall = Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length;
    
    return { scores, overall };
  }, [metrics]);

  if (accessDenied) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Lock className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">Access Restricted</h2>
            <p className="text-slate-500">This dashboard is only available to platform administrators.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Award className="w-7 h-7 text-purple-600" />
            Founder Dashboard
          </h1>
          <p className="text-slate-500 mt-1">SaaS metrics and acquisition readiness</p>
        </div>
        <Badge className="bg-purple-100 text-purple-700">Admin Only</Badge>
      </div>

      {/* Key SaaS Metrics */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-emerald-50 to-white">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Monthly Recurring Revenue</p>
                <p className="text-3xl font-bold text-emerald-600">${metrics.mrr.toLocaleString()}</p>
              </div>
              <DollarSign className="w-10 h-10 text-emerald-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-white">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Annual Recurring Revenue</p>
                <p className="text-3xl font-bold text-blue-600">${metrics.arr.toLocaleString()}</p>
              </div>
              <TrendingUp className="w-10 h-10 text-blue-200" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Active Tenants</p>
                <p className="text-3xl font-bold text-slate-900">{metrics.active}</p>
              </div>
              <Users className="w-10 h-10 text-slate-200" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">ARPU</p>
                <p className="text-3xl font-bold text-slate-900">${metrics.arpu.toFixed(0)}</p>
              </div>
              <Target className="w-10 h-10 text-slate-200" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tier Distribution & Conversion */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Tier Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={tierData.filter(d => d.value > 0)}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {tierData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conversion Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Trial → Paid</span>
                  <span>{metrics.trialConversion}%</span>
                </div>
                <Progress value={parseFloat(metrics.trialConversion)} />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Starter → Growth</span>
                  <span>{metrics.starter > 0 ? ((metrics.growth / metrics.starter) * 100).toFixed(0) : 0}%</span>
                </div>
                <Progress value={metrics.starter > 0 ? (metrics.growth / metrics.starter) * 100 : 0} />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Growth → Pro</span>
                  <span>{metrics.growth > 0 ? ((metrics.pro / metrics.growth) * 100).toFixed(0) : 0}%</span>
                </div>
                <Progress value={metrics.growth > 0 ? (metrics.pro / metrics.growth) * 100 : 0} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Acquisition Readiness Score */}
      <Card className="bg-gradient-to-br from-purple-50 to-white border-purple-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-purple-600" />
            Acquisition Readiness Score
          </CardTitle>
          <CardDescription>Overall readiness for strategic acquisition</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6 mb-6">
            <div className="text-center">
              <div className="text-5xl font-bold text-purple-600">{acquisitionReadiness.overall.toFixed(0)}</div>
              <div className="text-sm text-slate-500">/ 100</div>
            </div>
            <Progress value={acquisitionReadiness.overall} className="flex-1 h-4" />
          </div>

          <Separator className="my-4" />

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(acquisitionReadiness.scores).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                <span className="text-sm capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                <div className="flex items-center gap-2">
                  <Progress value={value} className="w-16 h-2" />
                  <span className="text-sm font-medium w-8">{value}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Checklist */}
      <Card>
        <CardHeader>
          <CardTitle>Acquisition Checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { label: 'Multi-tenant isolation', done: true },
              { label: 'Event-driven architecture', done: true },
              { label: 'Full audit trail', done: true },
              { label: 'Industry benchmarks (data moat)', done: true },
              { label: 'Adaptive risk models', done: true },
              { label: 'GDPR compliance', done: true },
              { label: 'Enterprise security', done: true },
              { label: 'Tiered pricing', done: true },
              { label: 'Deep Shopify integration', done: true },
              { label: 'SaaS metrics tracking', done: true }
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                {item.done ? (
                  <CheckCircle className="w-5 h-5 text-emerald-500" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                )}
                <span className={item.done ? 'text-slate-700' : 'text-slate-500'}>{item.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}