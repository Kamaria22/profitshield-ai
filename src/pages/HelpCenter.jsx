import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, BookOpen, MessageCircle, Video, ChevronDown, ChevronRight,
  Zap, Shield, TrendingUp, ShoppingCart, Bell, Settings, Link2, Brain,
  ExternalLink, CheckCircle, Star, ArrowRight, HelpCircle
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createPageUrl } from '@/components/platformContext';
import { Link, useLocation, useNavigate } from 'react-router-dom';

// ─── Data ────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: 'getting-started', label: 'Getting Started', icon: Zap, color: '#818cf8' },
  { id: 'orders',          label: 'Orders & Risk',   icon: ShoppingCart, color: '#34d399' },
  { id: 'analytics',       label: 'Analytics',       icon: TrendingUp, color: '#a78bfa' },
  { id: 'alerts',          label: 'Alerts',           icon: Bell, color: '#fbbf24' },
  { id: 'integrations',    label: 'Integrations',     icon: Link2, color: '#60a5fa' },
  { id: 'ai',              label: 'AI Features',      icon: Brain, color: '#f472b6' },
  { id: 'settings',        label: 'Settings',         icon: Settings, color: '#94a3b8' },
];

const FAQS = [
  {
    category: 'getting-started',
    question: 'How do I connect my Shopify store?',
    answer: 'Go to Integrations in the sidebar, click "Connect Store", choose Shopify, and follow the OAuth flow. Your store will sync automatically once connected. Historical orders (up to 90 days) are imported on first sync.',
  },
  {
    category: 'getting-started',
    question: 'What is the Profit Integrity Score?',
    answer: 'The Profit Integrity Score (0–100) is an AI-generated health metric that combines margin quality, fraud risk, chargeback probability, and shipping efficiency. A score above 70 is healthy; below 40 indicates action needed.',
  },
  {
    category: 'getting-started',
    question: 'How long does the initial data sync take?',
    answer: 'First sync typically takes 1–5 minutes depending on your order volume. You\'ll see a "Syncing" indicator in the header. Orders appear in real-time as they\'re processed.',
  },
  {
    category: 'orders',
    question: 'How is the risk score for an order calculated?',
    answer: 'Risk scores (0–100) are computed by our AI model using 40+ signals: device fingerprint, IP reputation, shipping vs billing mismatch, order velocity, email quality, and historical chargeback patterns. Scores above 70 are flagged high-risk.',
  },
  {
    category: 'orders',
    question: 'What does "Net Profit" include?',
    answer: 'Net Profit = Revenue − COGS − Shipping Cost − Payment Fees − Platform Fees − Returns. You can configure COGS and fees in Settings → Costs and Settings → Fees.',
  },
  {
    category: 'orders',
    question: 'Can I cancel or hold an order automatically?',
    answer: 'Yes. In Settings → Alerts, enable "Auto-hold high-risk orders" and set a risk score threshold. Orders above that threshold will be held in Shopify pending your review. You\'ll get a notification for each action.',
  },
  {
    category: 'analytics',
    question: 'What is the P&L Analytics page?',
    answer: 'The P&L Analytics page breaks down your profit and loss by product, time period, customer segment, and marketing channel. It shows margin trends, top leakers, and AI-generated recommendations to improve profitability.',
  },
  {
    category: 'analytics',
    question: 'How are the 30/60/90-day profit forecasts generated?',
    answer: 'Forecasts use a time-series model trained on your store\'s historical revenue, margin trends, seasonality, and order velocity. They update daily as new data arrives.',
  },
  {
    category: 'analytics',
    question: 'What are Profit Leaks?',
    answer: 'Profit leaks are systematic inefficiencies that drain margins: oversized packaging relative to product weight, discount abuse patterns, return fraud signals, and shipping carriers charging above quoted rates.',
  },
  {
    category: 'alerts',
    question: 'What types of alerts does ProfitShield send?',
    answer: 'Alert types include: High-Risk Order, Negative Margin, Shipping Loss, Chargeback Warning, Return Spike, Discount Abuse, and Revenue Anomaly. Each has configurable severity and notification channels.',
  },
  {
    category: 'alerts',
    question: 'How do I create a custom alert rule?',
    answer: 'Go to Settings → Alerts → "Create Rule". Define a trigger condition (e.g., margin < 10%), set severity, and choose notification channels. Rules run automatically on every new order.',
  },
  {
    category: 'alerts',
    question: 'Can I get SMS notifications?',
    answer: 'SMS notifications are available on Growth and Pro plans. Add your phone number in Settings → Alerts → Notification Channels and enable SMS for desired severity levels.',
  },
  {
    category: 'integrations',
    question: 'Which e-commerce platforms are supported?',
    answer: 'Currently supported: Shopify (full), WooCommerce (beta), and BigCommerce (beta). Stripe direct integration is also available for subscription businesses. More platforms are on the roadmap.',
  },
  {
    category: 'integrations',
    question: 'What Shopify permissions does ProfitShield need?',
    answer: 'We request: read_orders, read_products, read_customers, read_fulfillments, read_shipping, and write_orders (for auto-hold). We never store your Shopify admin password.',
  },
  {
    category: 'integrations',
    question: 'How does two-way sync work?',
    answer: 'Two-way sync pushes risk scores and tags back to Shopify orders in real time. You can also enable auto-hold or auto-cancel from ProfitShield directly into your Shopify admin. Configure in Integrations → your store → Two-Way Sync.',
  },
  {
    category: 'ai',
    question: 'What is the Autonomous Insight Engine?',
    answer: 'The Autonomous Insight Engine monitors your store 24/7 and surfaces the most important actionable insights automatically — no manual queries needed. It detects margin erosion, risk clusters, profit leaks, and alert backlogs with confidence scores.',
  },
  {
    category: 'ai',
    question: 'What is the AI Insights page?',
    answer: 'AI Insights provides deep-dive analysis powered by our LLM: customer churn predictions, product-level profit forensics, marketing campaign ROI scoring, and autonomous recommendations with one-click fixes.',
  },
  {
    category: 'ai',
    question: 'How accurate is the fraud detection?',
    answer: 'Our fraud model achieves ~94% precision and ~88% recall on labeled chargeback data. False positive rate is < 3%. Models are retrained monthly on aggregated anonymized patterns across the merchant network.',
  },
  {
    category: 'settings',
    question: 'How do I set product cost (COGS)?',
    answer: 'Go to Settings → Costs. You can enter COGS per SKU manually, or bulk-import via CSV. You can also edit costs directly from the Products page by clicking the edit icon on any product.',
  },
  {
    category: 'settings',
    question: 'How do I configure payment processing fees?',
    answer: 'Go to Settings → Fees. Set your fixed fee (e.g., $0.30 for Stripe) and percentage fee (e.g., 2.9%). These are applied automatically to all profit calculations.',
  },
];

const GUIDES = [
  {
    title: 'Quick Start: Connect & Configure',
    description: 'Get your first store connected and profit tracking live in 5 minutes.',
    category: 'getting-started',
    steps: ['Connect your Shopify store via Integrations', 'Import historical COGS in Settings → Costs', 'Set payment fees in Settings → Fees', 'Review first profit report on the Dashboard'],
    time: '5 min',
    difficulty: 'Beginner',
  },
  {
    title: 'Set Up Fraud Alert Rules',
    description: 'Configure AI risk rules to automatically flag and hold suspicious orders.',
    category: 'alerts',
    steps: ['Go to Settings → Alerts', 'Set your High Risk threshold (default: 70)', 'Enable "Auto-hold high-risk orders"', 'Configure email/SMS notification channels', 'Test with a simulated high-risk order'],
    time: '10 min',
    difficulty: 'Intermediate',
  },
  {
    title: 'Analyze Profit Leaks',
    description: 'Find and fix the top 3 hidden profit drains in your store.',
    category: 'analytics',
    steps: ['Open P&L Analytics from the sidebar', 'Review the Profit Leaks section', 'Sort by impact amount (highest first)', 'Click each leak for root cause detail', 'Apply the one-click AI recommendation'],
    time: '15 min',
    difficulty: 'Intermediate',
  },
  {
    title: 'Enable Two-Way Shopify Sync',
    description: 'Push risk scores and tags back to Shopify in real time.',
    category: 'integrations',
    steps: ['Go to Integrations → your Shopify store', 'Click "Configure" then "Two-Way Sync"', 'Enable "Push risk scores to orders"', 'Enable "Auto-hold above threshold"', 'Save and test with a new order'],
    time: '8 min',
    difficulty: 'Intermediate',
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function FAQItem({ faq }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="rounded-xl border cursor-pointer transition-all duration-200"
      style={{
        background: open ? 'rgba(129,140,248,0.06)' : 'rgba(255,255,255,0.03)',
        borderColor: open ? 'rgba(129,140,248,0.25)' : 'rgba(255,255,255,0.06)',
      }}
      onClick={() => setOpen(o => !o)}
    >
      <div className="flex items-center justify-between p-4 gap-3">
        <p className="text-sm font-medium text-slate-200">{faq.question}</p>
        <ChevronDown className={`w-4 h-4 text-slate-500 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <p className="px-4 pb-4 text-sm text-slate-400 leading-relaxed">{faq.answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function GuideCard({ guide }) {
  const [expanded, setExpanded] = useState(false);
  const difficultyColor = guide.difficulty === 'Beginner' ? '#34d399' : '#fbbf24';

  return (
    <div className="glass-card rounded-xl p-4 hover-lift">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-slate-200 mb-1">{guide.title}</h3>
          <p className="text-xs text-slate-400 leading-relaxed">{guide.description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: `${difficultyColor}18`, color: difficultyColor, border: `1px solid ${difficultyColor}30` }}>
          {guide.difficulty}
        </span>
        <span className="text-[10px] text-slate-500">{guide.time}</span>
      </div>
      <button
        className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors mb-2"
        onClick={() => setExpanded(e => !e)}
      >
        {expanded ? 'Hide steps' : 'View steps'}
        <ChevronRight className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.ol
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden space-y-1.5"
          >
            {guide.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                <span className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold mt-0.5"
                  style={{ background: 'rgba(129,140,248,0.2)', color: '#818cf8' }}>
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </motion.ol>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HelpCenter() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const location = useLocation();
  const navigate = useNavigate();
  const supportContactUrl = createPageUrl('support/contact', location.search);

  const filteredFAQs = useMemo(() => {
    let result = FAQS;
    if (activeCategory !== 'all') result = result.filter(f => f.category === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(f => f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q));
    }
    return result;
  }, [search, activeCategory]);

  const filteredGuides = useMemo(() => {
    let result = GUIDES;
    if (activeCategory !== 'all') result = result.filter(g => g.category === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(g => g.title.toLowerCase().includes(q) || g.description.toLowerCase().includes(q));
    }
    return result;
  }, [search, activeCategory]);

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center py-8">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 0 30px rgba(99,102,241,0.4)' }}>
          <BookOpen className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-slate-100 mb-2">Help Center</h1>
        <p className="text-slate-400 max-w-lg mx-auto">
          FAQs, guides, and tutorials to get the most out of ProfitShield AI.
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-xl mx-auto">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <Input
          placeholder="Search for answers..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-11 h-12 text-sm bg-white/5 border-white/10 text-slate-200 placeholder:text-slate-600 focus:border-indigo-500/50"
        />
      </div>

      {/* Category Chips */}
      <div className="flex flex-wrap gap-2 justify-center">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${activeCategory === 'all' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40' : 'bg-white/5 text-slate-400 border border-white/8 hover:text-slate-200'}`}
        >
          All Topics
        </button>
        {CATEGORIES.map(cat => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(isActive ? 'all' : cat.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all"
              style={{
                background: isActive ? `${cat.color}18` : 'rgba(255,255,255,0.04)',
                borderColor: isActive ? `${cat.color}40` : 'rgba(255,255,255,0.08)',
                color: isActive ? cat.color : '#94a3b8',
              }}
            >
              <Icon className="w-3 h-3" />
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Quick Action Cards */}
      {!search && activeCategory === 'all' && (
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { icon: Zap, title: 'Quick Start', desc: 'Connect your store in 5 min', href: 'Integrations', color: '#818cf8' },
            { icon: Shield, title: 'Set Up Fraud Rules', desc: 'Auto-hold risky orders', href: 'Alerts', color: '#34d399' },
            { icon: TrendingUp, title: 'Explore Analytics', desc: 'Find hidden profit leaks', href: 'PnLAnalytics', color: '#a78bfa' },
          ].map(item => {
            const Icon = item.icon;
            return (
              <Link key={item.title} to={createPageUrl(item.href)}>
                <div className="glass-card rounded-xl p-4 hover-lift flex items-center gap-3 group cursor-pointer">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: `${item.color}18`, border: `1px solid ${item.color}30`, boxShadow: `0 0 12px ${item.color}20` }}>
                    <Icon className="w-4 h-4" style={{ color: item.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200">{item.title}</p>
                    <p className="text-xs text-slate-500">{item.desc}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors" />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Step-by-Step Guides */}
      {filteredGuides.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <Video className="w-5 h-5 text-violet-400" />
            Guides & Tutorials
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {filteredGuides.map(guide => <GuideCard key={guide.title} guide={guide} />)}
          </div>
        </section>
      )}

      {/* FAQs */}
      {filteredFAQs.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-indigo-400" />
            Frequently Asked Questions
            <Badge className="ml-1 text-[10px] px-1.5 py-0.5 bg-indigo-500/15 text-indigo-300 border-indigo-500/25">
              {filteredFAQs.length}
            </Badge>
          </h2>
          <div className="space-y-2">
            {filteredFAQs.map((faq, i) => <FAQItem key={i} faq={faq} />)}
          </div>
        </section>
      )}

      {filteredFAQs.length === 0 && filteredGuides.length === 0 && (
        <div className="text-center py-12">
          <HelpCircle className="w-12 h-12 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No results for "{search}"</p>
          <p className="text-slate-600 text-sm mt-1">Try a different search term or browse by category.</p>
        </div>
      )}

      {/* Contact Support Footer */}
      <div className="glass-card rounded-2xl p-6 text-center">
        <p className="text-slate-300 font-medium mb-1">Still need help?</p>
        <p className="text-slate-500 text-sm mb-4">Our support team typically responds within 24 hours.</p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Button
            size="sm"
            className="border-0 text-xs"
            style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(129,140,248,0.25)', color: '#a5b4fc' }}
            onClick={() => navigate(supportContactUrl)}
          >
            <MessageCircle className="w-3.5 h-3.5 mr-1.5" />
            Contact Support
          </Button>
          <Link to={createPageUrl('Settings')}>
            <Button variant="ghost" size="sm" className="text-xs text-slate-500 hover:text-slate-300">
              <Settings className="w-3.5 h-3.5 mr-1.5" />
              Settings
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
