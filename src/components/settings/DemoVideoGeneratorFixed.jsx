// src/components/settings/DemoVideoGeneratorFixed.jsx
import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { requireResolved } from "@/components/usePlatformResolver";
import { usePermissions } from "@/components/usePermissions";
import { useAppBridgeToken } from "@/components/shopify/AppBridgeAuth";
import AdvancedDownloadOptions from "./AdvancedDownloadOptions";
import { Download, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const VARIANTS = [
  { id: "1080p", label: "Full HD (1920x1080)", description: "YouTube, marketing materials" },
  { id: "720p", label: "HD (1280x720)", description: "Web, social media" },
  { id: "shopify", label: "Shopify App Store", description: "App marketplace preview" },
  { id: "thumb", label: "Thumbnail (JPEG)", description: "Preview image" }
];

// ---- helpers
function isEmbedded() {
  if (typeof window === "undefined") return false;
  try {
    // Your app uses ?host= when embedded
    return new URLSearchParams(window.location.search).has("host");
  } catch {
    return false;
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 60000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

function b64ToBlob(base64, contentType = "application/octet-stream") {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  return new Blob([new Uint8Array(byteNumbers)], { type: contentType });
}

function filenameForVariant(format) {
  if (format === "1080p") return "ProfitShieldAI-demo-1080p.mp4";
  if (format === "720p") return "ProfitShieldAI-demo-720p.mp4";
  if (format === "shopify") return "ProfitShieldAI-app-store-1600x900.mp4";
  return "ProfitShieldAI-thumb.jpg";
}

async function mp4LooksValid(blob) {
  // Basic "ftyp" check
  const header = await blob.slice(0, 16).arrayBuffer();
  const view = new Uint8Array(header);
  const s = new TextDecoder().decode(view);
  return s.includes("ftyp");
}

function triggerBrowserDownload(blob, filename) {
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 200);
}

// ---- component
export default function DemoVideoGeneratorFixed({ resolver = {} }) {
  // ✅ ONE embedded declaration (ONLY ONCE) — never redeclare
  const embedded = isEmbedded();

  let resolverCheck = null;
  let resolvedOk = false;
  let tenantId = null;

  try {
    resolverCheck = requireResolved(resolver);
    resolvedOk = resolverCheck?.ok === true;
    tenantId = resolverCheck?.tenantId || null;
  } catch {
    resolvedOk = false;
    tenantId = null;
  }

  const { hasPermission } = usePermissions() || {};
  void hasPermission;

  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [downloadingVariant, setDownloadingVariant] = useState(null);

  // keep latest outputs from status responses (some backends return variant URLs or base64 here)
  const [outputs, setOutputs] = useState(null);

  const [selectedVersion, setSelectedVersion] = useState("90s");
  const [includeVoiceover, setIncludeVoiceover] = useState(true);
  const [includeMusic, setIncludeMusic] = useState(true);
  const [useDemoData, setUseDemoData] = useState(true);

  const pollTimerRef = useRef(null);
  const pollCountRef = useRef(0);

  const { token: shopifyToken, loading: tokenLoading, error: tokenError } = useAppBridgeToken();

  // Load recent job on mount
  useEffect(() => {
    const loadRecent = async () => {
      if (!resolvedOk || !tenantId) return;

      try {
        const { data } = await base44.functions.invoke("demoVideoLoadRecent", { tenant_id: tenantId });
        if (data?.job) {
          setJobId(data.job.id);
          setJobStatus(data.job.status);
          if (data.job.outputs) setOutputs(data.job.outputs);
        }
      } catch (err) {
        console.warn("[DV] Failed to load recent job:", err?.message || err);
      }
    };

    loadRecent();
  }, [resolvedOk, tenantId]);

  const generateMutation = useMutation({
    mutationFn: async (payload) => {
      const { data } = await base44.functions.invoke("demoVideoGenerator", payload);
      return data;
    },
    onSuccess: (data) => {
      if (data?.jobId) {
        setJobId(data.jobId);
        setJobStatus("queued");
        toast.success("Video generation started");
        startPolling(data.jobId);
      } else {
        toast.error("Generation started but no jobId returned");
      }
    },
    onError: (err) => {
      console.error("[DV] Generation error (FULL):", err);
      toast.error("Generation failed", { description: err?.message || "Unknown error" });
    }
  });

  const statusMutation = useMutation({
    mutationFn: async (jobIdVal) => {
      const { data } = await base44.functions.invoke("demoVideoGetStatus", { job_id: jobIdVal });
      return data;
    }
  });

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const startPolling = (jobIdVal) => {
    stopPolling();
    pollCountRef.current = 0;

    const pollOnce = async () => {
      try {
        const st = await statusMutation.mutateAsync(jobIdVal);
        if (st?.status) setJobStatus(st.status);
        if (st?.outputs) setOutputs(st.outputs);

        if (st?.status === "completed" || st?.status === "failed") {
          stopPolling();
          return;
        }
      } catch (err) {
        console.warn("[DV] Poll error:", err);
      }

      pollCountRef.current += 1;
      const next = pollCountRef.current < 5 ? 2000 : pollCountRef.current < 15 ? 3000 : 5000;
      pollTimerRef.current = setTimeout(pollOnce, next);
    };

    pollOnce();
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  const handleGenerate = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();

    console.log("[DV] Generate clicked", { embedded, tenantId, useDemoData });

    const payload = {
      tenant_id: useDemoData ? null : tenantId,
      mode: useDemoData ? "demo" : "real",
      version: selectedVersion,
      options: { voiceover: includeVoiceover, music: includeMusic }
    };

    generateMutation.mutate(payload);
  };

  const handleRefreshStatus = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();

    if (!jobId) {
      toast.error("No job to refresh");
      return;
    }

    console.log("[DV] Refresh clicked", { jobId });

    try {
      const st = await statusMutation.mutateAsync(jobId);
      setJobStatus(st?.status || null);
      if (st?.outputs) setOutputs(st.outputs);

      if (st?.status === "completed") toast.success("Video ready");
      else if (st?.status === "failed") toast.error("Generation failed");
      else toast.info("Status updated", { description: st?.status || "unknown" });
    } catch (err) {
      // ✅ log full object (fix you asked for)
      console.error("[DV] Refresh error:", err);
      toast.error("Failed to refresh status", { description: err?.message || "Unknown error" });
    }
  };

  /**
   * Download strategy:
   * 1) Call /api/functions/demoVideoProxyDownload (server should validate Shopify JWT and return either:
   *    - { base64, contentType, filename } JSON, OR
   *    - direct file stream (blob)
   * 2) If it returns JSON with base64 => decode and download.
   * 3) If it returns 404 "URL not available ..." => auto-refresh status (to update outputs), then tell user.
   * 4) If embedded and token missing => show clear toast and do not crash.
   * 5) Never redeclare `filename` / `a`.
   */
  const downloadVariant = async (format, e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();

    if (downloadingVariant) return;

    console.log("[DV] Download clicked", { format, jobId, jobStatus, embedded });

    if (!jobId) {
      toast.error("No video generated", { description: 'Click "Generate Demo Video" first.' });
      return;
    }

    if (jobStatus !== "completed") {
      toast.error("Video not ready", { description: `Current status: ${jobStatus || "unknown"}` });
      return;
    }

    // embedded auth block
    if (embedded && !shopifyToken) {
      const reason =
        tokenError || (tokenLoading ? "Still initializing Shopify auth..." : "Token retrieval failed");

      toast.error("Shopify auth not initialized", { description: reason, duration: 5000 });
      console.error("[DV-DL] ✗ BLOCKED: embedded=true but shopifyToken empty", {
        tokenLoading,
        tokenError,
        embedded
      });
      return;
    }

    setDownloadingVariant(format);

    try {
      const headers = { "Content-Type": "application/json" };
      if (embedded && shopifyToken) {
        headers.Authorization = `Bearer ${shopifyToken}`;
        console.log("[DV] ✓ Shopify bearer token attached, len=", shopifyToken.length);
      }

      const res = await fetchWithTimeout(
        "/api/functions/demoVideoProxyDownload",
        {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({ jobId, format })
        },
        60000
      );

      const contentType = res.headers.get("content-type") || "";
      console.log("[DV] Response:", {
        status: res.status,
        contentType,
        contentLength: res.headers.get("content-length")
      });

      // ---- handle non-OK first by reading text (better debugging)
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("[DV] ✗ Download error:", res.status, text);

        // common backend message: URL not available for 1080p
        if (res.status === 404 && text.includes("URL not available")) {
          toast.error("Not ready yet", { description: text.slice(0, 220) });

          // auto-refresh status to pull updated outputs (in case backend just finished)
          try {
            const st = await statusMutation.mutateAsync(jobId);
            if (st?.status) setJobStatus(st.status);
            if (st?.outputs) setOutputs(st.outputs);
          } catch {}

          return;
        }

        if (res.status === 401 && text.includes("JWT verification failed")) {
          toast.error("Unauthorized", { description: text.slice(0, 220) });
          return;
        }

        toast.error("Download failed", { description: text.slice(0, 220) || `HTTP ${res.status}` });
        return;
      }

      // ---- OK response: could be JSON(base64) OR a file stream
      // If JSON, parse it. If parse fails, treat as blob.
      let downloadedBlob = null;
      let downloadedName = filenameForVariant(format);

      if (contentType.includes("application/json")) {
        const data = await res.json().catch(() => null);
        if (!data) {
          toast.error("Download failed", { description: "Invalid JSON response" });
          return;
        }

        // base64 payload
        if (data.base64) {
          downloadedBlob = b64ToBlob(data.base64, data.contentType || "application/octet-stream");
          downloadedName = data.filename || downloadedName;
        } else if (data.url) {
          // optional: backend could return URL; fetch it top-level
          const urlRes = await fetchWithTimeout(data.url, { method: "GET" }, 60000);
          if (!urlRes.ok) {
            const t = await urlRes.text().catch(() => "");
            toast.error("Direct download failed", { description: t.slice(0, 220) || `HTTP ${urlRes.status}` });
            return;
          }
          downloadedBlob = await urlRes.blob();
          downloadedName = data.filename || downloadedName;
        } else {
          toast.error("Download failed", { description: "No base64/url in response" });
          return;
        }
      } else {
        // file stream
        downloadedBlob = await res.blob();
      }

      if (!downloadedBlob) {
        toast.error("Download failed", { description: "No file data returned" });
        return;
      }

      // Size sanity
      const minSize = format === "thumb" ? 500 : 1000;
      if (downloadedBlob.size < minSize) {
        toast.error("File too small", { description: `${downloadedBlob.size} bytes` });
        return;
      }

      // MP4 signature check (non-thumb)
      if (format !== "thumb") {
        const ok = await mp4LooksValid(downloadedBlob);
        if (!ok) {
          toast.error("Invalid MP4", { description: "Missing ftyp signature" });
          return;
        }
      }

      triggerBrowserDownload(downloadedBlob, downloadedName);

      const sizeMB = (downloadedBlob.size / 1_000_000).toFixed(2);
      toast.success("Download complete", { description: `${downloadedName} • ${sizeMB}MB` });
    } catch (err) {
      const isTimeout = err?.name === "AbortError" || String(err?.message).includes("timeout");
      console.error("[DV] Download error:", err);
      toast.error("Download error", {
        description: isTimeout ? "Request timed out. Try again." : err?.message || "Unknown error"
      });
    } finally {
      setDownloadingVariant(null);
    }
  };

  if (!resolvedOk) {
    return (
      <Card className="bg-slate-50">
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">Store not connected</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            Demo Video Generator
          </CardTitle>
          <CardDescription>Generate demo videos for your app listing</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Embedded auth status */}
          {embedded && (
            <div
              className={`p-3 rounded-lg text-sm ${
                shopifyToken
                  ? "bg-emerald-50 border border-emerald-200"
                  : "bg-amber-50 border border-amber-200"
              }`}
            >
              {shopifyToken ? (
                <p className="text-emerald-800">✓ Shopify authentication: Ready ({shopifyToken.length} bytes)</p>
              ) : (
                <p className="text-amber-800">
                  {tokenLoading ? "⏳ Initializing Shopify auth..." : `✗ ${tokenError || "No token"}`}
                </p>
              )}
            </div>
          )}

          {/* Options */}
          <div className="space-y-4">
            <div>
              <Label>Video Length</Label>
              <select
                value={selectedVersion}
                onChange={(e) => setSelectedVersion(e.target.value)}
                className="mt-2 w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="60s">60 seconds</option>
                <option value="90s">90 seconds (default)</option>
                <option value="120s">120 seconds</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={includeVoiceover} onCheckedChange={setIncludeVoiceover} />
              <Label>Include voiceover narration</Label>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={includeMusic} onCheckedChange={setIncludeMusic} />
              <Label>Include background music</Label>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={useDemoData} onCheckedChange={setUseDemoData} />
              <Label>Use demo data (or real store data)</Label>
            </div>
          </div>

          {/* Generate */}
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={generateMutation.isPending}
            className="w-full bg-emerald-600 hover:bg-emerald-700"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              "Generate Demo Video"
            )}
          </Button>

          {/* Status */}
          {jobId && (
            <div className="p-4 rounded-lg bg-slate-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">Job: {jobId.slice(0, 8)}...</p>
                <Badge variant={jobStatus === "completed" ? "default" : "outline"}>{jobStatus}</Badge>
              </div>

              <Button type="button" size="sm" variant="outline" onClick={handleRefreshStatus} className="mt-2">
                <RefreshCw className="w-3 h-3 mr-1" />
                Refresh
              </Button>
            </div>
          )}

          {/* Download */}
          {jobId && jobStatus === "completed" && (
            <div className="space-y-3 pt-4 border-t">
              <p className="text-sm font-medium">Download Video</p>
              <div className="grid grid-cols-2 gap-2">
                {VARIANTS.map((v) => (
                  <Button
                    type="button"
                    key={v.id}
                    onClick={(e) => downloadVariant(v.id, e)}
                    disabled={downloadingVariant === v.id}
                    variant="outline"
                    size="sm"
                    className="flex-col h-auto py-2"
                  >
                    {downloadingVariant === v.id ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mb-1" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mb-1" />
                        {v.label}
                      </>
                    )}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Advanced */}
          <AdvancedDownloadOptions embedded={embedded} jobId={jobId} jobStatus={jobStatus} outputs={outputs} />
        </CardContent>
      </Card>
    </div>
  );
}