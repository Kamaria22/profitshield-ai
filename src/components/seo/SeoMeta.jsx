import { useEffect } from 'react';

const BASE_URL = 'https://profit-shield-ai.base44.app';

const PAGE_SEO = {
  Home: {
    title: 'ProfitShield AI Dashboard | Shopify Profit Intelligence',
    description: 'Track margins, detect profit leaks, and protect your Shopify revenue with real-time AI analytics.'
  },
  PnLAnalytics: {
    title: 'P&L Analytics for Shopify Stores | ProfitShield AI',
    description: 'Understand true net profit by order, product, and channel with automated P&L analytics.'
  },
  Intelligence: {
    title: 'Risk Intelligence & Fraud Detection | ProfitShield AI',
    description: 'Reduce chargebacks and fraud with AI-powered Shopify risk scoring and prevention workflows.'
  },
  Integrations: {
    title: 'Shopify Integrations & Sync | ProfitShield AI',
    description: 'Connect your Shopify store, sync orders automatically, and manage webhook health in one place.'
  },
  HelpCenter: {
    title: 'ProfitShield AI Help Center',
    description: 'Get setup guides, troubleshooting help, and best practices for ProfitShield AI on Shopify.'
  },
  Pricing: {
    title: 'ProfitShield AI Pricing for Shopify Merchants',
    description: 'Choose the best ProfitShield AI plan to scale profit protection, automation, and risk coverage.'
  },
  Download: {
    title: 'Download ProfitShield AI',
    description: 'Get ProfitShield AI on desktop and mobile to monitor your Shopify store anywhere.'
  },
};

function upsertMeta(attr, key, content) {
  if (!content) return;
  const selector = `meta[${attr}="${key}"]`;
  let node = document.head.querySelector(selector);
  if (!node) {
    node = document.createElement('meta');
    node.setAttribute(attr, key);
    document.head.appendChild(node);
  }
  node.setAttribute('content', content);
}

function upsertCanonical(href) {
  let node = document.head.querySelector('link[rel="canonical"]');
  if (!node) {
    node = document.createElement('link');
    node.setAttribute('rel', 'canonical');
    document.head.appendChild(node);
  }
  node.setAttribute('href', href);
}

export default function SeoMeta({ currentPageName, pathname }) {
  useEffect(() => {
    const page = PAGE_SEO[currentPageName] || {
      title: 'ProfitShield AI | Shopify Profit Intelligence & Fraud Protection',
      description: 'AI-powered fraud detection, profit analytics, and automated risk protection for Shopify merchants.'
    };
    const url = `${BASE_URL}${pathname || '/'}`;

    document.title = page.title;
    upsertMeta('name', 'description', page.description);
    upsertMeta('property', 'og:title', page.title);
    upsertMeta('property', 'og:description', page.description);
    upsertMeta('property', 'og:url', url);
    upsertMeta('name', 'twitter:title', page.title);
    upsertMeta('name', 'twitter:description', page.description);
    upsertCanonical(url);
  }, [currentPageName, pathname]);

  return null;
}

