/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import AIInsights from './pages/AIInsights';
import AIModelGovernance from './pages/AIModelGovernance';
import Achievements from './pages/Achievements';
import Alerts from './pages/Alerts';
import AppStoreListing from './pages/AppStoreListing';
import AppStoreSubmission from './pages/AppStoreSubmission';
import AuditLogs from './pages/AuditLogs';
import Billing from './pages/Billing';
import CookiePolicy from './pages/CookiePolicy';
import Customers from './pages/Customers';
import DataCompliance from './pages/DataCompliance';
import DataProcessingAgreement from './pages/DataProcessingAgreement';
import Download from './pages/Download';
import FounderDashboard from './pages/FounderDashboard';
import Home from './pages/Home';
import Install from './pages/Install';
import Integrations from './pages/Integrations';
import Intelligence from './pages/Intelligence';
import NativeBuildGuide from './pages/NativeBuildGuide';
import NativeHealth from './pages/NativeHealth';
import Onboarding from './pages/Onboarding';
import Orders from './pages/Orders';
import PerformanceAudit from './pages/PerformanceAudit';
import PnLAnalytics from './pages/PnLAnalytics';
import Pricing from './pages/Pricing';
import PrivacyPolicy from './pages/PrivacyPolicy';
import Products from './pages/Products';
import Referrals from './pages/Referrals';
import ResolverTestHarness from './pages/ResolverTestHarness';
import SelectStore from './pages/SelectStore';
import Settings from './pages/Settings';
import Shipping from './pages/Shipping';
import ShopifyCallback from './pages/ShopifyCallback';
import SystemHealth from './pages/SystemHealth';
import Tasks from './pages/Tasks';
import TermsOfService from './pages/TermsOfService';
import VideoJobs from './pages/VideoJobs';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AIInsights": AIInsights,
    "AIModelGovernance": AIModelGovernance,
    "Achievements": Achievements,
    "Alerts": Alerts,
    "AppStoreListing": AppStoreListing,
    "AppStoreSubmission": AppStoreSubmission,
    "AuditLogs": AuditLogs,
    "Billing": Billing,
    "CookiePolicy": CookiePolicy,
    "Customers": Customers,
    "DataCompliance": DataCompliance,
    "DataProcessingAgreement": DataProcessingAgreement,
    "Download": Download,
    "FounderDashboard": FounderDashboard,
    "Home": Home,
    "Install": Install,
    "Integrations": Integrations,
    "Intelligence": Intelligence,
    "NativeBuildGuide": NativeBuildGuide,
    "NativeHealth": NativeHealth,
    "Onboarding": Onboarding,
    "Orders": Orders,
    "PerformanceAudit": PerformanceAudit,
    "PnLAnalytics": PnLAnalytics,
    "Pricing": Pricing,
    "PrivacyPolicy": PrivacyPolicy,
    "Products": Products,
    "Referrals": Referrals,
    "ResolverTestHarness": ResolverTestHarness,
    "SelectStore": SelectStore,
    "Settings": Settings,
    "Shipping": Shipping,
    "ShopifyCallback": ShopifyCallback,
    "SystemHealth": SystemHealth,
    "Tasks": Tasks,
    "TermsOfService": TermsOfService,
    "VideoJobs": VideoJobs,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};