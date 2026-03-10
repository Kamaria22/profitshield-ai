import { useEffect } from 'react';

const BASE_URL = 'https://profit-shield-ai.base44.app';
const SITE_NAME = 'ProfitShield AI';

const PAGE_SEO = {
  Home: {
    title: 'ProfitShield AI Dashboard | Shopify Profit Intelligence',
    description: 'Track margins, detect profit leaks, and protect your Shopify revenue with real-time AI analytics.',
    keywords: 'shopify profit app, shopify analytics, profit intelligence, fraud protection, chargeback prevention'
  },
  PnLAnalytics: {
    title: 'P&L Analytics for Shopify Stores | ProfitShield AI',
    description: 'Understand true net profit by order, product, and channel with automated P&L analytics.',
    keywords: 'shopify p&l analytics, ecommerce profit and loss, margin analytics'
  },
  Intelligence: {
    title: 'Risk Intelligence & Fraud Detection | ProfitShield AI',
    description: 'Reduce chargebacks and fraud with AI-powered Shopify risk scoring and prevention workflows.',
    keywords: 'shopify fraud detection, chargeback prevention, risk intelligence'
  },
  Integrations: {
    title: 'Shopify Integrations & Sync | ProfitShield AI',
    description: 'Connect your Shopify store, sync orders automatically, and manage webhook health in one place.',
    keywords: 'shopify integration app, order sync, webhook monitoring'
  },
  HelpCenter: {
    title: 'ProfitShield AI Help Center',
    description: 'Get setup guides, troubleshooting help, and best practices for ProfitShield AI on Shopify.',
    keywords: 'profitshield help, shopify app support, ecommerce app troubleshooting'
  },
  Pricing: {
    title: 'ProfitShield AI Pricing for Shopify Merchants',
    description: 'Choose the best ProfitShield AI plan to scale profit protection, automation, and risk coverage.',
    keywords: 'shopify app pricing, profitshield plans, ecommerce fraud prevention pricing'
  },
  Download: {
    title: 'Download ProfitShield AI',
    description: 'Get ProfitShield AI on desktop and mobile to monitor your Shopify store anywhere.',
    keywords: 'profitshield download, shopify dashboard mobile app'
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

function upsertJsonLd(id, data) {
  const scriptId = `jsonld-${id}`;
  let node = document.head.querySelector(`script#${scriptId}[type="application/ld+json"]`);
  if (!node) {
    node = document.createElement('script');
    node.setAttribute('id', scriptId);
    node.setAttribute('type', 'application/ld+json');
    document.head.appendChild(node);
  }
  node.textContent = JSON.stringify(data);
}

function shouldIndexPath(pathname = '/') {
  const indexablePublicPaths = new Set([
    '/',
    '/helpcenter',
    '/pricing',
    '/download',
    '/privacypolicy',
    '/termsofservice',
    '/cookiepolicy',
    '/appstorelisting'
  ]);
  const normalized = pathname.toLowerCase();
  return indexablePublicPaths.has(normalized);
}

export default function SeoMeta({ currentPageName, pathname }) {
  useEffect(() => {
    const page = PAGE_SEO[currentPageName] || {
      title: 'ProfitShield AI | Shopify Profit Intelligence & Fraud Protection',
      description: 'AI-powered fraud detection, profit analytics, and automated risk protection for Shopify merchants.',
      keywords: 'shopify app, ecommerce analytics, fraud prevention, profit intelligence'
    };
    const url = `${BASE_URL}${pathname || '/'}`;
    const indexable = shouldIndexPath(pathname || '/');

    document.title = page.title;
    upsertMeta('name', 'description', page.description);
    upsertMeta('name', 'keywords', page.keywords);
    upsertMeta('name', 'robots', indexable ? 'index,follow,max-image-preview:large' : 'noindex,nofollow');
    upsertMeta('property', 'og:title', page.title);
    upsertMeta('property', 'og:description', page.description);
    upsertMeta('property', 'og:url', url);
    upsertMeta('property', 'og:type', 'website');
    upsertMeta('property', 'og:site_name', SITE_NAME);
    upsertMeta('name', 'twitter:title', page.title);
    upsertMeta('name', 'twitter:description', page.description);
    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertCanonical(url);

    upsertJsonLd('org', {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SITE_NAME,
      url: BASE_URL,
      logo: `${BASE_URL}/favicon.ico`
    });

    upsertJsonLd('software', {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: SITE_NAME,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: BASE_URL,
      description: page.description
    });
  }, [currentPageName, pathname]);

  return null;
}
