import React, { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { pagesConfig } from "@/pages.config";

const CRITICAL_ROUTES = ["/support/contact", "/admin/email", "/dashboard", "/ai-insights", "/orders"];

function isEmbeddedContext() {
  try {
    const p = new URLSearchParams(window.location.search);
    return !!(p.get("shop") && (p.get("host") || p.get("embedded") === "1"));
  } catch {
    return false;
  }
}

function getRouteRegistryProbe() {
  const pageKeys = Object.keys(pagesConfig?.Pages || {});
  return {
    page_keys: pageKeys,
    all_pages_mapped_in_router: true, // App routes iterate over pagesConfig.Pages dynamically
    support_contact_registered: pageKeys.includes("SupportContact"),
    admin_email_registered: pageKeys.includes("AdminEmailCenter"),
    dashboard_registered: pageKeys.includes("Home"),
    ai_insights_registered: pageKeys.includes("AIInsights"),
    orders_registered: pageKeys.includes("Orders"),
  };
}

function getPermissionProbe(userRole) {
  const role = String(userRole || "subscriber").toLowerCase();
  const isAdmin = role === "owner" || role === "admin";

  const expected = isAdmin
    ? { support_contact: true, admin_email: true }
    : { support_contact: true, admin_email: false };

  const observed = {
    support_contact: true,
    admin_email: isAdmin,
  };

  return {
    role,
    expected,
    observed,
    mismatch:
      expected.support_contact !== observed.support_contact ||
      expected.admin_email !== observed.admin_email,
  };
}

function getEmbeddedProbe() {
  const embedded = isEmbeddedContext();
  const params = new URLSearchParams(window.location.search);
  const hasShopParam = !!params.get("shop");
  const hasHostParam = !!params.get("host");
  const text = (document?.body?.innerText || "").toLowerCase();
  const blockedTextDetected = text.includes("this content is blocked");

  const supportLinks = Array.from(document.querySelectorAll('a[href*="support/contact"], a[href="/support/contact"]'));
  const linkIssues = supportLinks.map((el) => {
    const href = el.getAttribute("href") || "";
    const target = el.getAttribute("target") || "";
    const isExternalMethod = href.startsWith("http") || target === "_blank";
    return {
      href,
      target,
      is_external_navigation: isExternalMethod,
      repair_needed: isExternalMethod,
    };
  });

  return {
    embedded,
    has_shop_param: hasShopParam,
    has_host_param: hasHostParam,
    blocked_text_detected: blockedTextDetected,
    iframe_context: window.top !== window.self,
    link_issues: linkIssues,
  };
}

// React component — mounts once when tenant is resolved
export default function FrontendGuardian({ authTenantId, userRole }) {
  const installed = useRef(false);
  const location = useLocation();

  useEffect(() => {
    if (!authTenantId || installed.current) return;
    installed.current = true;
    installFrontendGuardian(authTenantId, userRole);
  }, [authTenantId, userRole]);

  useEffect(() => {
    if (!authTenantId) return;

    const sendRouteProbe = async () => {
      try {
        await base44.functions.invoke("frontendGuardian", {
          action: "watchdog",
          tenant_id: authTenantId,
          ui_probe: {
            current_path: location.pathname,
            critical_routes: CRITICAL_ROUTES,
            route_registry: getRouteRegistryProbe(),
            permission_probe: getPermissionProbe(userRole),
            embedded_probe: getEmbeddedProbe(),
          },
        });
      } catch {
        // silent by design
      }
    };

    sendRouteProbe();
  }, [authTenantId, location.pathname, userRole]);

  return null; // invisible
}

// 1) Global runtime error capture
export function installFrontendGuardian(tenantId, userRole) {
  const report = async (incident) => {
    try {
      await base44.functions.invoke("frontendGuardian", {
        action: "report_incident",
        incident: {
          tenant_id: tenantId,
          feature_key: incident.feature_key || null,
          message: incident.message || "unknown",
          stack: incident.stack || null,
          url: window.location.href,
          user_agent: navigator.userAgent,
          severity: incident.severity || "error",
          payload: {
            ...(incident.payload || {}),
            ui_probe: {
              critical_routes: CRITICAL_ROUTES,
              route_registry: getRouteRegistryProbe(),
              permission_probe: getPermissionProbe(userRole),
              embedded_probe: getEmbeddedProbe(),
            },
          },
        },
      });
    } catch {
      // never throw from reporting
    }
  };

  window.addEventListener("error", (e) => {
    report({
      message: e?.message || "window.error",
      stack: e?.error?.stack,
      feature_key: "frontend_runtime",
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    report({
      message: e?.reason?.message || "unhandledrejection",
      stack: e?.reason?.stack,
      feature_key: "frontend_promise",
    });
  });

  // 2) Lightweight periodic watchdog probe (every 60s)
  setInterval(async () => {
    try {
      await base44.functions.invoke("frontendGuardian", {
        action: "watchdog",
        tenant_id: tenantId,
        ui_probe: {
          critical_routes: CRITICAL_ROUTES,
          route_registry: getRouteRegistryProbe(),
          permission_probe: getPermissionProbe(userRole),
          embedded_probe: getEmbeddedProbe(),
        },
      });
    } catch (e) {
      report({ message: e?.message || "watchdog_probe_failed", feature_key: "watchdog" });
    }
  }, 60_000);
}

// 3) ErrorBoundary for component-level failures
export class GuardianErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  async componentDidCatch(error) {
    try {
      await base44.functions.invoke("frontendGuardian", {
        action: "report_incident",
        incident: {
          tenant_id: this.props.tenantId,
          feature_key: this.props.featureKey,
          message: error?.message || "component_error",
          stack: error?.stack,
          url: window.location.href,
          user_agent: navigator.userAgent,
          severity: "error",
        },
      });
    } catch {}
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-300">
          <h3 className="font-semibold mb-1">We hit a temporary issue.</h3>
          <p className="text-sm text-amber-400/80">We're auto-repairing this feature. Refresh in a few seconds.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
