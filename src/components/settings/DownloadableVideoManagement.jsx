import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { RefreshCw, Download, Trash2, Copy } from "lucide-react";

/**
 * Downloadable Video Management (client-side)
 * - Persists job history in localStorage (per-tenant)
 * - Lets user refresh job status and re-download variants
 *
 * Requires:
 *  - props.tenantId (string|null)
 *  - props.jobs: optional (array) current job list from parent (if you maintain it there)
 *  - props.onSelectJob(job): called when user clicks "Use"
 *  - props.onRefreshJob(jobId): async => returns { status, outputs? }
 *  - props.onDownload(jobId, format): triggers download for a stored job
 */

function safeJsonParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

function storageKey(tenantId) {
  return `ps_demoVideo_jobs_v1:${tenantId || "demo"}`;
}

export function saveJobToHistory(tenantId, job) {
  if (!job?.id) return;
  const key = storageKey(tenantId);

  const existing = safeJsonParse(localStorage.getItem(key) || "[]", []);
  const now = new Date().toISOString();

  // de-dupe by id, newest first
  const merged = [
    { ...job, updatedAt: now, createdAt: job.createdAt || now },
    ...existing.filter((j) => j?.id !== job.id),
  ].slice(0, 25);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(key);
    setItems(safeJsonParse(raw || "[]", []));
  }, [key]);

  const persist = (next) => {
    setItems(next);
    localStorage.setItem(key, JSON.stringify(next));
  };

  const removeJob = (jobId) => {
    persist(items.filter((j) => j?.id !== jobId));
    toast.success("Removed from history");
  };

  const clearAll = () => {
    persist([]);
    toast.success("Cleared history");
  };

  const refreshOne = async (jobId) => {
    if (!onRefreshJob) return;
    setBusyId(jobId);
    try {
      const data = await onRefreshJob(jobId); // expect {status, outputs?}
      const next = items.map((j) =>
        j?.id === jobId
          ? {
              ...j,
              status: data?.status || j.status,
              outputs: data?.outputs ?? j.outputs,
              updatedAt: new Date().toISOString(),
            }
          : j
      );
      persist(next);
      toast.success("Status refreshed", { description: data?.status || "ok" });
    } catch (e) {
      console.error("[DVM] refresh error:", e);
      toast.error("Refresh failed", { description: e?.message || "Unknown error" });
    } finally {
      setBusyId(null);
    }
  };

  const copyJobId = async (jobId) => {
    try {
      await navigator.clipboard.writeText(jobId);
      toast.success("Job ID copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const variants = [
    { id: "1080p", label: "1080p" },
    { id: "720p", label: "720p" },
    { id: "shopify", label: "Shopify" },
    { id: "thumb", label: "Thumb" },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Downloadable Video Management</CardTitle>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={clearAll} disabled={items.length === 0}>
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
            {items.map((j) => (
              <div
                key={j.id}
                className="rounded-lg border bg-white p-3 flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      Job: {String(j.id).slice(0, 10)}…
                    </div>
                    <div className="text-xs text-slate-500">
                      Updated: {j.updatedAt ? new Date(j.updatedAt).toLocaleString() : "—"}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant={j.status === "completed" ? "default" : "outline"}>
                      {j.status || "unknown"}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onSelectJob?.(j)}
                  >
                    Use
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => copyJobId(j.id)}
                  >
                    <Copy className="w-4 h-4 mr-1" />
                    Copy ID
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => refreshOne(j.id)}
                    disabled={busyId === j.id}
                  >
                    <RefreshCw className={`w-4 h-4 mr-1 ${busyId === j.id ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => removeJob(j.id)}
                  >
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
                      variant="secondary"
                      onClick={() => onDownload?.(j.id, v.id)}
                      disabled={j.status !== "completed"}
                    >
                      <Download className="w-4 h-4 mr-1" />
                      {v.label}
                    </Button>
                  ))}
                </div>

                {j.status !== "completed" && (
                  <div className="text-xs text-slate-500">
                    Downloads enabled when status is <b>completed</b>.
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}