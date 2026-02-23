// src/components/settings/DownloadableVideoManagement.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { RefreshCw, Download, Trash2, Copy, PauseCircle } from "lucide-react";

/**
 * Downloadable Video Management (FAST MODE)
 * - Persists job history in localStorage (per-tenant)
 * - "Auto-Refresh" polls until completed (fast backoff)
 * - Download buttons work even when not completed:
 *    -> will auto-refresh and auto-download once ready
 *
 * Requires:
 *  - props.tenantId (string|null)
 *  - props.onSelectJob(job)
 *  - props.onRefreshJob(jobId): async => returns { status, outputs? }
 *  - props.onDownload(jobId, format): triggers download for a jobId + format
 */

function safeJsonParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

function storageKey(tenantId) {
  return `ps_demoVideo_jobs_v2:${tenantId || "demo"}`;
}

export function saveJobToHistory(tenantId, job) {
  if (!job?.id) return;
  if (typeof window === "undefined") return;

  const key = storageKey(tenantId);
  const existing = safeJsonParse(localStorage.getItem(key) || "[]", []);
  const now = new Date().toISOString();

  const merged = [
    { ...job, updatedAt: now, createdAt: job.createdAt || now },
    ...existing.filter((j) => j?.id !== job.id),
  ].slice(0, 50);

  localStorage.setItem(key, JSON.stringify(merged));
}

export default function DownloadableVideoManagement({
  tenantId,
  onSelectJob,
  onRefreshJob,
  onDownload,
}) {
  const key = useMemo(() => storageKey(tenantId), [tenantId]);

  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState(null);

  // Auto-refresh state
  const timersRef = useRef(new Map()); // jobId -> timeoutId
  const desiredDownloadRef = useRef(new Map()); // jobId -> format string
  const [autoIds, setAutoIds] = useState([]); // for UI only

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(key);
    setItems(safeJsonParse(raw || "[]", []));
  }, [key]);

  useEffect(() => {
    return () => {
      // cleanup timers on unmount
      for (const t of timersRef.current.values()) clearTimeout(t);
      timersRef.current.clear();
      desiredDownloadRef.current.clear();
    };
  }, []);

  const persist = (next) => {
    setItems(next);
    if (typeof window !== "undefined") localStorage.setItem(key, JSON.stringify(next));
  };

  const updateJob = (jobId, patch) => {
    persist(
      items.map((j) => (j?.id === jobId ? { ...j, ...patch, updatedAt: new Date().toISOString() } : j))
    );
  };

  const removeJob = (jobId) => {
    stopAuto(jobId);
    persist(items.filter((j) => j?.id !== jobId));
    toast.success("Removed from history");
  };

  const clearAll = () => {
    for (const j of items) stopAuto(j?.id);
    persist([]);
    toast.success("Cleared history");
  };

  const copyJobId = async (jobId) => {
    try {
      await navigator.clipboard.writeText(jobId);
      toast.success("Job ID copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const isReady = (status) => status === "completed";

  const variants = [
    { id: "1080p", label: "1080p" },
    { id: "720p", label: "720p" },
    { id: "shopify", label: "Shopify" },
    { id: "thumb", label: "Thumb" },
  ];

  const startAuto = (jobId) => {
    if (!onRefreshJob) return;

    // already running
    if (timersRef.current.has(jobId)) return;

    setAutoIds((prev) => (prev.includes(jobId) ? prev : [...prev, jobId]));

    let attempt = 0;

    const tick = async () => {
      try {
        const data = await onRefreshJob(jobId); // {status, outputs?}
        const nextStatus = data?.status || "unknown";

        updateJob(jobId, {
          status: nextStatus,
          outputs: data?.outputs,
        });

        // If completed: stop auto + auto-download if requested
        if (isReady(nextStatus)) {
          stopAuto(jobId);

          const desired = desiredDownloadRef.current.get(jobId);
          if (desired) {
            desiredDownloadRef.current.delete(jobId);
            // Fire download immediately
            try {
              onDownload?.(jobId, desired);
              toast.success("Ready — downloading now", { description: desired });
            } catch (e) {
              toast.error("Download trigger failed", { description: e?.message || "Unknown error" });
            }
          } else {
            toast.success("Video ready", { description: "Downloads enabled" });
          }
          return;
        }

        // still not ready -> schedule next fast
        attempt += 1;
      } catch (e) {
        console.error("[DVM] auto-refresh error:", e);
        attempt += 1;
      }

      // Fastest safe polling:
      // 0–10 attempts: 1500ms
      // 11–30: 2500ms
      // 31+: 5000ms
      const delay = attempt <= 10 ? 1500 : attempt <= 30 ? 2500 : 5000;

      const t = setTimeout(tick, delay);
      timersRef.current.set(jobId, t);
    };

    // start immediately
    tick();
  };

  const stopAuto = (jobId) => {
    const t = timersRef.current.get(jobId);
    if (t) clearTimeout(t);
    timersRef.current.delete(jobId);
    desiredDownloadRef.current.delete(jobId);
    setAutoIds((prev) => prev.filter((x) => x !== jobId));
  };

  const refreshOnce = async (jobId) => {
    if (!onRefreshJob) return;
    setBusyId(jobId);
    try {
      const data = await onRefreshJob(jobId);
      updateJob(jobId, {
        status: data?.status || "unknown",
        outputs: data?.outputs,
      });
      toast.success("Status refreshed", { description: data?.status || "ok" });
    } catch (e) {
      console.error("[DVM] refresh error:", e);
      toast.error("Refresh failed", { description: e?.message || "Unknown error" });
    } finally {
      setBusyId(null);
    }
  };

  const fastDownload = (jobId, format, status) => {
    // If ready -> download now
    if (isReady(status)) {
      onDownload?.(jobId, format);
      return;
    }

    // Not ready -> set desired + start auto
    desiredDownloadRef.current.set(jobId, format);
    startAuto(jobId);

    toast.info("Finalizing…", {
      description: `Auto-refreshing until ready, then downloading ${format}.`,
      duration: 3500,
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Downloadable Video Management</CardTitle>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clearAll}
            disabled={items.length === 0}
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Clear
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <div className="text-sm text-slate-600">
            No saved jobs yet. Generate a demo video and it will appear here.
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((j) => {
              const running = autoIds.includes(j.id);
              const status = j.status || "unknown";

              return (
                <div key={j.id} className="rounded-lg border bg-white p-3 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">Job: {String(j.id).slice(0, 12)}…</div>
                      <div className="text-xs text-slate-500">
                        Updated: {j.updatedAt ? new Date(j.updatedAt).toLocaleString() : "—"}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant={status === "completed" ? "default" : "outline"}>{status}</Badge>
                      {running && (
                        <Badge variant="secondary">
                          <span className="inline-flex items-center gap-1">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            auto
                          </span>
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => onSelectJob?.(j)}>
                      Use
                    </Button>

                    <Button type="button" size="sm" variant="outline" onClick={() => copyJobId(j.id)}>
                      <Copy className="w-4 h-4 mr-1" />
                      Copy ID
                    </Button>

                    {!running ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => refreshOnce(j.id)}
                          disabled={busyId === j.id}
                        >
                          <RefreshCw className={`w-4 h-4 mr-1 ${busyId === j.id ? "animate-spin" : ""}`} />
                          Refresh
                        </Button>

                        <Button type="button" size="sm" variant="default" onClick={() => startAuto(j.id)}>
                          <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                          Auto-Refresh
                        </Button>
                      </>
                    ) : (
                      <Button type="button" size="sm" variant="outline" onClick={() => stopAuto(j.id)}>
                        <PauseCircle className="w-4 h-4 mr-1" />
                        Stop
                      </Button>
                    )}

                    <Button type="button" size="sm" variant="outline" onClick={() => removeJob(j.id)}>
                      <Trash2 className="w-4 h-4 mr-1" />
                      Remove
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {variants.map((v) => (
                      <Button
                        key={v.id}
                        type="button"
                        size="sm"
                        variant={isReady(status) ? "secondary" : "outline"}
                        onClick={() => fastDownload(j.id, v.id, status)}
                      >
                        <Download className="w-4 h-4 mr-1" />
                        {v.label}
                      </Button>
                    ))}
                  </div>

                  {!isReady(status) && (
                    <div className="text-xs text-slate-500">
                      Status is <b>{status}</b>. Click a variant to auto-refresh and auto-download when ready.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}