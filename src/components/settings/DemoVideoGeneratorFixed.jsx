// /app/src/components/settings/DemoVideoGeneratorFixed.jsx
import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { requireResolved } from "@/components/usePlatformResolver";
import { usePermissions } from "@/components/usePermissions";
import { useAppBridgeToken } from "@/components/shopify/AppBridgeAuth";

import AdvancedDownloadOptions from "./AdvancedDownloadOptions";
import { Download, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const VARIANTS = [
  { id: "1080p", label: "Full HD (1920x1080)" },
  { id: "720p", label: "HD (1280x720)" },
  { id: "shopify", label: "Shopify App Store (1600x900)" },
  { id: "thumb", label: "Thumbnail (JPEG)" },
];

// Safe helper (never throws)
function isEmbeddedShopify() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("host");
}

// Fetch with timeout
async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export default function DemoVideoGeneratorFixed({ resolver = {} }) {
  // ✅ ONE embedded declaration (ONLY ONCE) — top-level inside component
  const embedded = isEmbeddedShopify();

  let isResolved = false;
  let tenantId = null;

  try {
    const resolverCheck = requireResolved(resolver);
    isResolved = resolverCheck?.ok === true;
    tenantId = resolverCheck?.tenantId || null;
  } catch (e) {
    isResolved = false;
    tenantId = null;
  }

  // Permissions (optional)
  usePermissions(); // keep to preserve existing app behavior

  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [downloadingVariant, setDownloadingVariant] = useState(null);

  const [selectedVersion, setSelectedVersion] = useState("90s");
  const [includeVoiceover, setIncludeVoiceover] = useState(true);
  const [includeMusic, setIncludeMusic] = useState(true);
  const [useDemoData, setUseDemoData] = useState(true);

  const pollIntervalRef = useRef(null);
  const pollCountRef = useRef(0);

  // Shopify session token (only needed when embedded)
  const { token: shopifyToken, loading: tokenLoading, error: tokenError } = useAppBridgeToken();

  // Load recent job on mount
  useEffect(() => {
    const loadRecent = async () => {
      if (!isResolved || !tenantId) return;
      try {
        const { data } = await base44.functions.invoke("demoVideoLoadRecent", { tenant_id: tenantId });
        if (data?.job) {
          setJobId(data.job.id);
          setJobStatus(data.job.status);
        }
      } catch (err) {
        console.warn("Failed to load recent job:", err?.message || err);
      }
    };
    loadRecent();
  }, [isResolved, tenantId]);

  // Generate
  const generateMutation = useMutation({
    mutationFn: async (payload) => {
      const { data } = await base44.functions.invoke("demoVideoGenerator", payload);
      return data;
    },
    onSuccess: (data) => {
      if (data?.jobId) {
        setJobId(data.jobId);
        setJobStatus("queued");
        startPolling(data.jobId);
        toast.success("Video generation started");
      } else {
        toast.error("Generation failed", { description: "No jobId returned" });
      }
    },
    onError: (err) => toast.error("Generation failed", { description: err?.message || "Unknown error" }),
  });

  // Status
  const statusMutation = useMutation({
    mutationFn: async (jobIdVal) => {
      const { data } = await base44.functions.invoke("demoVideoGetStatus", { job_id: jobIdVal });
      return data;
    },
  });

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearTimeout(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  useEffect(() => stopPolling, []);

  const startPolling = (jobIdVal) => {
    stopPolling();
    pollCountRef.current = 0;

    const poll = async () => {
      try {
        const result = await statusMutation.mutateAsync(jobIdVal);
        if (result?.status) {
          setJobStatus(result.status);
          if (result.status === "completed" || result.status === "failed") {
            stopPolling();
          }
        }
      } catch (err) {
        console.warn("Poll error:", err);
      }
      pollCountRef.current += 1;
    };

    const getInterval = () => {
      if (pollCountRef.current < 5) return 2000;
      if (pollCountRef.current < 15) return 3000;
      return 5000;
    };

    const scheduleNext = () => {
      pollIntervalRef.current = setTimeout(() => {
        poll().then(scheduleNext);
      }, getInterval());
    };

    poll().then(scheduleNext);
  };

  const handleGenerate = () => {
    const payload = {
      tenant_id: useDemoData ? null : tenantId,
      mode: useDemoData ? "demo" : "real",
      version: selectedVersion,
      options: { voiceover: includeVoiceover, music: includeMusic },
    };
    generateMutation.mutate(payload);
  };

  const handleRefreshStatus = async () => {
    if (!jobId) return;
    try {
      const result = await statusMutation.mutateAsync(jobId);
      setJobStatus(result?.status || null);

      if (result?.status === "completed") toast.success("Video ready");
      else if (result?.status === "failed") toast.error("Generation failed");
      else toast.info("Still processing...");
    } catch (err) {
      toast.error("Failed to refresh status");
    }
  };

  // Download
  const downloadVariant = async (format) => {
    if (downloadingVariant) return;

    if (!jobId) {
      toast.error("No video generated", { description: 'Click "Generate Demo Video" first.' });
      return;
    }

    if (jobStatus !== "completed") {
      toast.error("Video not ready", { description: `Current status: ${jobStatus || "unknown"}` });
      return;
    }

    // ✅ Only block download when embedded and token missing
    if (embedded && !shopifyToken) {
      const reason = tokenError || (tokenLoading ? "Still initializing Shopify auth..." : "Token retrieval failed");
      toast.error("Shopify auth not initialized", { description: reason, duration: 5000 });
      return;
    }

    console.log("[DV] Download start", { jobId, format, embedded, tokenLen: shopifyToken?.length || 0 });
    setDownloadingVariant(format);

    try {
      const headers = { "Content-Type": "application/json" };

      if (embedded && shopifyToken) {
        headers["Authorization"] = `Bearer ${shopifyToken}`;
      }

      const res = await fetchWithTimeout(
        "/api/functions/demoVideoProxyDownload",
        {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({ jobId, format }),
        },
        30000
      );

      if (res.status === 401) {
        const errorData = await res.json().catch(() => ({}));
        toast.error("Unauthorized", { description: errorData?.error || "Unauthorized" });
        return;
      }

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        toast.error("Download failed", { description: errorText.slice(0, 160) || `HTTP ${res.status}` });
        return;
      }

      const contentType = res.headers.get("content-type") || "";
      const blob = await res.blob();

      // Reject JSON masquerading as a file
      if (contentType.includes("application/json") || blob.type.includes("json")) {
        const errorText = await blob.text().catch(() => "");
        toast.error("Download returned JSON", { description: errorText.slice(0, 160) });
        return;
      }

      const minSize = format === "thumb" ? 500 : 1000;
      if (blob.size < minSize) {
        toast.error("File too small", { description: `${blob.size} bytes` });
        return;
      }

      // Basic MP4 sanity check (except thumb)
      if (format !== "thumb") {
        const header = await blob.slice(0, 12).arrayBuffer();
        const view = new Uint8Array(header);
        const txt = new TextDecoder().decode(view);
        if (!txt.includes("ftyp")) {
          toast.error("Invalid MP4", { description: "Missing ftyp signature" });
          return;
        }
      }

      const url = URL.createObjectURL(blob);
      const filename =
        format === "1080p"
          ? "ProfitShieldAI-demo-1080p.mp4"
          : format === "720p"
          ? "ProfitShieldAI-demo-720p.mp4"
          : format === "shopify"
          ? "ProfitShieldAI-app-store-1600x900.mp4"
          : "ProfitShieldAI-thumb.jpg";

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 100);

      toast.success("Download complete", { description: filename });
    } catch (err) {
      const isTimeout = err?.name === "AbortError" || String(err?.message).includes("timeout");
      toast.error("Download error", { description: isTimeout ? "Request timed out. Try again." : err?.message || "Unknown error" });
    } finally {
      setDownloadingVariant(null);
    }
  };

  if (!isResolved) {
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
          <CardDescription>Generate beautiful demo videos for your app listing</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Auth status */}
          {embedded && (
            <div
              className={`p-3 rounded-lg text-sm ${
                shopifyToken ? "bg-emerald-50 border border-emerald-200" : "bg-amber-50 border border-amber-200"
              }`}
            >
              {shopifyToken ? (
                <p className="text-emerald-800">✓ Shopify authentication: Ready ({shopifyToken.length} bytes)</p>
              ) : (
                <p className="text-amber-800">{tokenLoading ? "⏳ Initializing Shopify auth..." : `✗ ${tokenError || "No token"}`}</p>
              )}
            </div>
          )}

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

          <Button onClick={handleGenerate} disabled={generateMutation.isPending} className="w-full bg-emerald-600 hover:bg-emerald-700">
            {generateMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              "Generate Demo Video"
            )}
          </Button>

          {jobId && (
            <div className="p-4 rounded-lg bg-slate-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">Job: {jobId.slice(0, 8)}...</p>
                <Badge variant={jobStatus === "completed" ? "default" : "outline"}>{jobStatus}</Badge>
              </div>

              <Button size="sm" variant="outline" onClick={handleRefreshStatus} className="mt-2">
                <RefreshCw className="w-3 h-3 mr-1" />
                Refresh
              </Button>
            </div>
          )}

          {jobId && jobStatus === "completed" && (
            <div className="space-y-3 pt-4 border-t">
              <p className="text-sm font-medium">Download Video</p>
              <div className="grid grid-cols-2 gap-2">
                {VARIANTS.map((v) => (
                  <Button
                    key={v.id}
                    onClick={() => downloadVariant(v.id)}
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

          <AdvancedDownloadOptions />
        </CardContent>
      </Card>
    </div>
  );
}