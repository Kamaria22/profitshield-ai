import React from "react";
import { base44 } from "@/api/base44Client";

// 1) Global runtime error capture
export function installFrontendGuardian(tenantId) {
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
          payload: incident.payload || null,
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