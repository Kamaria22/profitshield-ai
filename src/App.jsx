import { useEffect, useMemo, useState } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AUTH_REDIRECT_TTL_MS = 15000;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  const location = useLocation();
  const [redirectBlocked, setRedirectBlocked] = useState(false);
  const isEmbedded = useMemo(() => {
    const p = new URLSearchParams(location.search || '');
    return !!(p.get('shop') && (p.get('host') || p.get('embedded') === '1'));
  }, [location.search]);
  const isBareRootEntry = useMemo(() => {
    const p = new URLSearchParams(location.search || '');
    return location.pathname === '/' && !p.get('shop') && !p.get('host');
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (authError?.type !== 'auth_required') return;
    if (isEmbedded) return;
    if (isBareRootEntry) {
      setRedirectBlocked(true);
      return;
    }

    const pathKey = `${location.pathname}${location.search}`;
    const storageKey = `profitshield_auth_redirect:${pathKey}`;
    const now = Date.now();

    try {
      const last = Number(sessionStorage.getItem(storageKey) || 0);
      if (last && now - last < AUTH_REDIRECT_TTL_MS) {
        setRedirectBlocked(true);
        return;
      }
      sessionStorage.setItem(storageKey, String(now));
    } catch {
      // Ignore storage failures and proceed with a single redirect attempt.
    }

    setRedirectBlocked(false);
    navigateToLogin();
  }, [authError?.type, isEmbedded, isBareRootEntry, location.pathname, location.search, navigateToLogin]);

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      if (redirectBlocked) {
        return (
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <div className="text-sm text-slate-600">Authentication retry paused to prevent redirect loop. Refresh to try again.</div>
          </div>
        );
      }
      return (
        <div className="fixed inset-0 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
        </div>
      );
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/support/contact" element={
        <LayoutWrapper currentPageName="SupportContact">
          <Pages.SupportContact />
        </LayoutWrapper>
      } />
      <Route path="/admin/email" element={
        <LayoutWrapper currentPageName="AdminEmailCenter">
          <Pages.AdminEmailCenter />
        </LayoutWrapper>
      } />
      <Route path="/dashboard" element={
        <LayoutWrapper currentPageName="Home">
          <Pages.Home />
        </LayoutWrapper>
      } />
      <Route path="/ai-insights" element={
        <LayoutWrapper currentPageName="AIInsights">
          <Pages.AIInsights />
        </LayoutWrapper>
      } />
      <Route path="/orders" element={
        <LayoutWrapper currentPageName="Orders">
          <Pages.Orders />
        </LayoutWrapper>
      } />
      <Route path="/products" element={
        <LayoutWrapper currentPageName="Products">
          <Pages.Products />
        </LayoutWrapper>
      } />
      <Route path="/customers" element={
        <LayoutWrapper currentPageName="Customers">
          <Pages.Customers />
        </LayoutWrapper>
      } />
      <Route path="/shipping" element={
        <LayoutWrapper currentPageName="Shipping">
          <Pages.Shipping />
        </LayoutWrapper>
      } />
      <Route path="/tasks" element={
        <LayoutWrapper currentPageName="Tasks">
          <Pages.Tasks />
        </LayoutWrapper>
      } />
      <Route path="/alerts" element={
        <LayoutWrapper currentPageName="Alerts">
          <Pages.Alerts />
        </LayoutWrapper>
      } />
      <Route path="/referrals" element={
        <LayoutWrapper currentPageName="Referrals">
          <Pages.Referrals />
        </LayoutWrapper>
      } />
      <Route path="/billing" element={
        <LayoutWrapper currentPageName="Billing">
          <Pages.Billing />
        </LayoutWrapper>
      } />
      <Route path="/integrations" element={
        <LayoutWrapper currentPageName="Integrations">
          <Pages.Integrations />
        </LayoutWrapper>
      } />
      <Route path="/intelligence" element={
        <LayoutWrapper currentPageName="Intelligence">
          <Pages.Intelligence />
        </LayoutWrapper>
      } />
      <Route path="/settings" element={
        <LayoutWrapper currentPageName="Settings">
          <Pages.Settings />
        </LayoutWrapper>
      } />
      <Route path="/helpcenter" element={
        <LayoutWrapper currentPageName="HelpCenter">
          <Pages.HelpCenter />
        </LayoutWrapper>
      } />
      <Route path="/pnl-analytics" element={
        <LayoutWrapper currentPageName="PnLAnalytics">
          <Pages.PnLAnalytics />
        </LayoutWrapper>
      } />
      <Route path="/embedded-entry" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      <Route path="/api/functions/embeddedEntryGuard" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <NavigationTracker />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
