/**
 * Global App Context
 * Controls which features are visible based on deployment context.
 *
 * "shopify_public" — Shopify App Store installs (merchants see only core features)
 * "internal"       — Founder/admin-only mode (all features visible)
 */

// Detect context: Shopify installs come in via the /shopify or ?shop= params
function detectAppContext() {
  if (typeof window === 'undefined') return 'shopify_public';
  const params = new URLSearchParams(window.location.search);
  const host = window.location.hostname;

  // If installed via Shopify OAuth flow (has ?shop= or ?hmac=)
  if (params.get('shop') || params.get('hmac') || params.get('embedded')) {
    return 'shopify_public';
  }

  // Allow override via localStorage (for founder testing)
  const override = localStorage.getItem('ps_app_context');
  if (override === 'internal' || override === 'shopify_public') return override;

  // Default: internal for the base44 app domain (founder-only)
  return 'internal';
}

export const APP_CONTEXT = detectAppContext();

export const IS_SHOPIFY_PUBLIC = APP_CONTEXT === 'shopify_public';
export const IS_INTERNAL = APP_CONTEXT === 'internal';

// Items that are ONLY shown in internal mode (never to public Shopify users)
export const INTERNAL_ONLY_PAGES = [
  'Achievements',
  'Referrals',
  'Download',
  'FounderDashboard',
  'VideoJobs',
  'AppStoreListing',
  'NativeBuildGuide',
  'AppStoreSubmission',
  'ResolverTestHarness',
  'SystemHealth',
  'AuditLogs',
  'SupportInbox',
];

// Pages that require admin role regardless of context
export const ADMIN_ONLY_PAGES = [
  'FounderDashboard',
  'VideoJobs',
  'AppStoreListing',
  'NativeBuildGuide',
  'AppStoreSubmission',
  'AuditLogs',
  'SupportInbox',
  'SystemHealth',
  'ReviewerProof',
  'GitHubPullRequests',
  'PatchReview',
  'SelfHealingCenter',
];

export function canAccessPage(pageName, userRole, appContext = APP_CONTEXT) {
  const isAdmin = userRole === 'admin' || userRole === 'owner';

  // Admin-only pages — block non-admins always
  if (ADMIN_ONLY_PAGES.includes(pageName) && !isAdmin) return false;

  // Internal-only pages — block in shopify_public context
  if (INTERNAL_ONLY_PAGES.includes(pageName) && appContext === 'shopify_public') return false;

  return true;
}