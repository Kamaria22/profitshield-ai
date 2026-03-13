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
  PrivacyPolicy: {
    title: 'Privacy Policy | ProfitShield AI',
    description: 'Learn how ProfitShield AI collects, uses, and safeguards merchant and customer data.',
    keywords: 'privacy policy, data protection, shopify app privacy'
  },
  TermsOfService: {
    title: 'Terms of Service | ProfitShield AI',
    description: 'Read the terms governing use of ProfitShield AI and Shopify embedded app services.',
    keywords: 'terms of service, ecommerce software terms, shopify app terms'
  },
  CookiePolicy: {
    title: 'Cookie Policy | ProfitShield AI',
    description: 'See how ProfitShield AI uses cookies and similar technologies for app operation and analytics.',
    keywords: 'cookie policy, ecommerce app cookies, privacy notice'
  },
  RefundPolicy: {
    title: 'Refund Policy | ProfitShield AI',
    description: 'Understand refund eligibility, billing windows, and support channels for ProfitShield AI plans.',
    keywords: 'refund policy, subscription refunds, shopify app billing'
  },
  ComplianceNotice: {
    title: 'GDPR & CCPA Compliance Notice | ProfitShield AI',
    description: 'Compliance notice for GDPR and CCPA rights, requests, and data handling practices.',
    keywords: 'gdpr, ccpa, compliance notice, data subject rights'
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
    '/refundpolicy',
    '/compliancenotice',
    '/appstorelisting'
  ]);
  const normalized = pathname.toLowerCase();
  return indexablePublicPaths.has(normalized);
}

function isEmbeddedRuntime() {
  if (typeof window === 'undefined') return false;
  try {
    const p = new URLSearchParams(window.location.search);
    return !!(
      p.get('embedded') === '1' ||
      p.get('host') ||
      p.get('shop') ||
      p.get('hmac') ||
      p.get('id_token') ||
      p.get('session')
    );
  } catch {
    return false;
  }
}

export default function SeoMeta({ currentPageName, pathname }) {
  useEffect(() => {
    const page = PAGE_SEO[currentPageName] || {
      title: 'ProfitShield AI | Shopify Profit Intelligence & Fraud Protection',
      description: 'AI-powered fraud detection, profit analytics, and automated risk protection for Shopify merchants.',
      keywords: 'shopify app, ecommerce analytics, fraud prevention, profit intelligence'
    };
    const url = `${BASE_URL}${pathname || '/'}`;
    const indexable = shouldIndexPath(pathname || '/') && !isEmbeddedRuntime();

    document.title = page.title;
    upsertMeta('name', 'description', page.description);
    upsertMeta('name', 'keywords', page.keywords);
    upsertMeta('name', 'robots', indexable ? 'index,follow,max-image-preview:large' : 'noindex,nofollow');
    upsertMeta('property', 'og:title', page.title);
    upsertMeta('property', 'og:description', page.description);
    upsertMeta('property', 'og:url', url);
    upsertMeta('property', 'og:type', 'website');
    upsertMeta('property', 'og:site_name', SITE_NAME);
    upsertMeta('property', 'og:image', `${BASE_URL}/favicon.svg`);
    upsertMeta('property', 'og:image:alt', 'ProfitShield AI logo');
    upsertMeta('name', 'twitter:title', page.title);
    upsertMeta('name', 'twitter:description', page.description);
    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:image', `${BASE_URL}/favicon.svg`);
    upsertMeta('name', 'twitter:site', '@ProfitShieldAI');
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

    upsertJsonLd('website', {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      url: BASE_URL,
      potentialAction: {
        '@type': 'SearchAction',
        target: `${BASE_URL}/helpcenter?query={search_term_string}`,
        'query-input': 'required name=search_term_string'
      }
    });
  }, [currentPageName, pathname]);

  return null;
}
