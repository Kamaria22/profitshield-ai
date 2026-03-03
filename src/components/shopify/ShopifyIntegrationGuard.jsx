import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ShopifyIntegrationGuard({ tenantId, children }) {
  const [state, setState] = useState({ loading: true, ok: false, needsReconnect: false, message: "" });

  const safeTenantId = useMemo(() => tenantId || null, [tenantId]);

  useEffect(() => {
    let alive = true;

    async function run() {
      if (!safeTenantId) {
        if (alive) setState({ loading: false, ok: false, needsReconnect: false, message: "Missing tenant context" });
        return;
      }

      if (alive) setState((s) => ({ ...s, loading: true }));

      try {
        // 1) quick health check: token + api reachable
        const r = await base44.functions.invoke("shopifyConnectionManager", {
          action: "heal_token",
          tenant_id: safeTenantId,
        });

        if (!alive) return;

        if (r?.data?.needs_reconnect) {
          setState({ loading: false, ok: false, needsReconnect: true, message: "Reconnect Shopify to continue" });
          return;
        }

        // 2) ensure webhooks exist (idempotent)
        await base44.functions.invoke("shopifyConnectionManager", {
          action: "reconcile_webhooks",
          tenant_id: safeTenantId,
        });

        if (!alive) return;
        setState({ loading: false, ok: true, needsReconnect: false, message: "" });
      } catch (e) {
        if (!alive) return;
        setState({
          loading: false,
          ok: false,
          needsReconnect: false,
          message: "Integration temporarily unavailable. Retrying automatically…",
        });
        // auto-retry
        setTimeout(() => alive && run(), 2500);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [safeTenantId]);

  if (state.loading) {
    return (
      <div className="flex items-center justify-center p-8 border border-slate-200 rounded-lg bg-slate-50">
        <Loader2 className="w-5 h-5 mr-2 animate-spin text-slate-500" />
        <span className="text-slate-600">Connecting to Shopify…</span>
      </div>
    );
  }

  if (state.needsReconnect) {
    return (
      <div className="p-6 border border-amber-200 rounded-lg bg-amber-50">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 mt-0.5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-amber-900 mb-3">{state.message}</p>
            <Button
              onClick={() =>
                base44.functions.invoke("shopifyAuth", { action: "start_oauth", tenant_id: safeTenantId })
              }
              className="bg-amber-600 hover:bg-amber-700"
            >
              Reconnect Shopify
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!state.ok) {
    return (
      <div className="p-6 border border-red-200 rounded-lg bg-red-50">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 mt-0.5 text-red-600 flex-shrink-0" />
          <p className="text-red-700">{state.message}</p>
        </div>
      </div>
    );
  }

  return children;
}