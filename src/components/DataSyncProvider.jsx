import { useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { invokeWithRetry } from "@/lib/safeApi";

export function DataSyncProvider({ tenantId, children }) {
  useEffect(() => {
    if (!tenantId) return;

    let interval;

    async function startSync() {
      try {
        // Ensure Shopify integration is healthy
        await base44.functions.invoke("shopifyConnectionManager", {
          action: "run_watchdog",
          tenant_id: tenantId,
        });

        // Process webhook queue
        await invokeWithRetry("processWebhookQueue", {
          action: "process",
        });
      } catch (e) {
        console.warn("[DataSyncProvider] Sync error, retrying:", e?.message);
      }

      interval = setTimeout(startSync, 20000); // every 20 seconds
    }

    startSync();

    return () => clearTimeout(interval);
  }, [tenantId]);

  return children;
}
