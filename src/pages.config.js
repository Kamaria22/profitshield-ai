import { lazy } from 'react';

const AIInsights = lazy(() => import('./pages/AIInsights'));
const AIModelGovernance = lazy(() => import('./pages/AIModelGovernance'));
const Achievements = lazy(() => import('./pages/Achievements'));
const AdminEmailCenter = lazy(() => import('./pages/AdminEmailCenter'));
const Alerts = lazy(() => import('./pages/Alerts'));
const AppStoreListing = lazy(() => import('./pages/AppStoreListing'));
const AppStoreSubmission = lazy(() => import('./pages/AppStoreSubmission'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const Billing = lazy(() => import('./pages/Billing'));
const CookiePolicy = lazy(() => import('./pages/CookiePolicy'));
const Customers = lazy(() => import('./pages/Customers'));
const DataCompliance = lazy(() => import('./pages/DataCompliance'));
const DataProcessingAgreement = lazy(() => import('./pages/DataProcessingAgreement'));
const Download = lazy(() => import('./pages/Download'));
const Embedded = lazy(() => import('./pages/Embedded'));
const FounderDashboard = lazy(() => import('./pages/FounderDashboard'));
const GitHubPullRequests = lazy(() => import('./pages/GitHubPullRequests'));
const HelpCenter = lazy(() => import('./pages/HelpCenter'));
const Home = lazy(() => import('./pages/Home'));
const Install = lazy(() => import('./pages/Install'));
const Integrations = lazy(() => import('./pages/Integrations'));
const Intelligence = lazy(() => import('./pages/Intelligence'));
const NativeBuildGuide = lazy(() => import('./pages/NativeBuildGuide'));
const NativeHealth = lazy(() => import('./pages/NativeHealth'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Orders = lazy(() => import('./pages/Orders'));
const PatchReview = lazy(() => import('./pages/PatchReview'));
const PerformanceAudit = lazy(() => import('./pages/PerformanceAudit'));
const PnLAnalytics = lazy(() => import('./pages/PnLAnalytics'));
const Pricing = lazy(() => import('./pages/Pricing'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const Products = lazy(() => import('./pages/Products'));
const Referrals = lazy(() => import('./pages/Referrals'));
const ResolverTestHarness = lazy(() => import('./pages/ResolverTestHarness'));
const ReviewerProof = lazy(() => import('./pages/ReviewerProof'));
const SelectStore = lazy(() => import('./pages/SelectStore'));
const SelfHealingCenter = lazy(() => import('./pages/SelfHealingCenter'));
const Settings = lazy(() => import('./pages/Settings'));
const Shipping = lazy(() => import('./pages/Shipping'));
const ShopifyAuth = lazy(() => import('./pages/ShopifyAuth'));
const ShopifyCallback = lazy(() => import('./pages/ShopifyCallback'));
const ShopifyOnboarding = lazy(() => import('./pages/ShopifyOnboarding'));
const SupportInbox = lazy(() => import('./pages/SupportInbox'));
const SupportContact = lazy(() => import('./pages/SupportContact'));
const SystemHealth = lazy(() => import('./pages/SystemHealth'));
const Tasks = lazy(() => import('./pages/Tasks'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const VideoJobs = lazy(() => import('./pages/VideoJobs'));
const __Layout = lazy(() => import('./Layout.jsx'));

export const PAGES = {
  AIInsights,
  AIModelGovernance,
  Achievements,
  AdminEmailCenter,
  Alerts,
  AppStoreListing,
  AppStoreSubmission,
  AuditLogs,
  Billing,
  CookiePolicy,
  Customers,
  DataCompliance,
  DataProcessingAgreement,
  Download,
  Embedded,
  FounderDashboard,
  GitHubPullRequests,
  HelpCenter,
  Home,
  Install,
  Integrations,
  Intelligence,
  NativeBuildGuide,
  NativeHealth,
  Onboarding,
  Orders,
  PatchReview,
  PerformanceAudit,
  PnLAnalytics,
  Pricing,
  PrivacyPolicy,
  Products,
  Referrals,
  ResolverTestHarness,
  ReviewerProof,
  SelectStore,
  SelfHealingCenter,
  Settings,
  Shipping,
  ShopifyAuth,
  ShopifyCallback,
  ShopifyOnboarding,
  SupportInbox,
  SupportContact,
  SystemHealth,
  Tasks,
  TermsOfService,
  VideoJobs,
};

export const pagesConfig = {
  mainPage: 'Home',
  Pages: PAGES,
  Layout: __Layout,
};
