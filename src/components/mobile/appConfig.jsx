/**
 * CENTRAL APP CONFIGURATION
 * Single source of truth for all app store URLs, app identity, and contact info.
 * Update these values after submitting to the app stores.
 */
export const APP_CONFIG = {
  name: 'ProfitShield AI',
  tagline: 'AI-powered fraud protection & profit intelligence',
  bundleId: 'ai.profitshield.app',
  webUrl: 'https://profit-shield-ai.base44.app',
  supportUrl: 'https://profit-shield-ai.base44.app/?page=Support',
  marketingUrl: 'https://profit-shield-ai.base44.app',
  privacyUrl: 'https://profit-shield-ai.base44.app/?page=PrivacyPolicy',
  termsUrl: 'https://profit-shield-ai.base44.app/?page=TermsOfService',
  cookiesUrl: 'https://profit-shield-ai.base44.app/?page=CookiePolicy',
  dpaUrl: 'https://profit-shield-ai.base44.app/?page=DataProcessingAgreement',
  contactEmail: 'support@profitshield-ai.com',
  legalEmail: 'legal@profitshield.ai',
  privacyEmail: 'privacy@profitshield.ai',

  appStore: {
    ios: {
      // Replace with real URL after App Store submission
      url: 'https://apps.apple.com/app/profitshield-ai/id6741820887',
      bundleId: 'ai.profitshield.app',
      // Deep link scheme
      scheme: 'profitshield'
    },
    android: {
      // Replace with real URL after Google Play submission
      url: 'https://play.google.com/store/apps/details?id=ai.profitshield.app',
      packageName: 'ai.profitshield.app',
      scheme: 'profitshield'
    }
  },

  // QR code generation using free qrserver.com API
  qrCode: {
    web: (size = 200) =>
      `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent('https://profit-shield-ai.base44.app')}&color=06b6d4&bgcolor=ffffff&ecc=M`,
    ios: (size = 200) =>
      `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent('https://apps.apple.com/app/profitshield-ai/id6741820887')}&color=06b6d4&bgcolor=ffffff&ecc=M`,
    android: (size = 200) =>
      `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent('https://play.google.com/store/apps/details?id=ai.profitshield.app')}&color=06b6d4&bgcolor=ffffff&ecc=M`,
  }
};

// Deep link route map
export const DEEP_LINK_ROUTES = {
  'alerts': 'Alerts',
  'orders': 'Orders',
  'dashboard': 'Home',
  'settings': 'Settings',
  'integrations': 'Integrations',
  'pricing': 'Pricing',
  'download': 'Download',
};
