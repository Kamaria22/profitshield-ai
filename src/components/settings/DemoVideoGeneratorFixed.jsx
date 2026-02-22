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
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const VARIANTS = [
  { id: "1080p", label: "Full HD (1920x1080)", description: "YouTube, marketing materials" },
  { id: "720p", label: "HD (1280x720)", description: "Web, social media" },
  { id: "shopify", label: "Shopify App Store", description: "App marketplace preview" },
  { id: "thumb", label: "Thumbnail (JPEG)", description: "Preview image" },
];

function extractErrorMessage(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;

  // Common shapes we see from fetch wrappers / sdk wrappers / react-query
  return (
    err?.message ||
    err?.data?.error ||
    err?.data?.message ||
    err?.response?.data?.error ||
    err?.response?.data?.message ||
    err?.error ||
    err?.toString?.() ||
    "Unknown error"
  );
}

function isIframeEmbedded() {
  try {
    if (typeof window === "undefined") return false;
    return window.top !== window.self;
  } catch {
    // cross-origin access throws => still embedded
    return true;
  }
}

function DemoVideoGeneratorFixed({ resolver = {} }) {
  // ✅ ONE embedded declaration (ONLY ONCE)
  // Use BOTH heuristics: host param + iframe detection
  const embedded =
    typeof window !== "undefined" &&
    (new URLSearchParams(window.location.search).has("host") || isIframeEmbedded());

  let resolverCheck = null;
  let isResolved = false;
  let tenantId = null;

  try {
    resolverCheck = requireResolved(resolver);
    isResolved = resolverCheck?.ok === true;
    tenantId = resolverCheck?.tenantId;
  } catch {
    isResolved = false;
    tenantId = null;
  }

  const { hasPermission } = usePermissions() || {};
  void hasPermission;

  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [downloadingVariant, setDownloadingVariant] = useState(null);

  const [selectedVersion, setSelectedVersion] = useState("90s");
  const [includeVoiceover, setIncludeVoiceover] = useState(true);
  const [includeMusic, setIncludeMusic] = useState(true);
  const [useDemoData, setUseDemoData] = useState(true);

  const pollIntervalRef = useRef(null);
  const pollCountRef = useRef(0);

  const { token: shopifyToken, loading: tokenLoading, error: tokenError } =
    useAppBridgeToken();

  // Load recent job on mount
  useEffect(() => {
    const loadRecent = async () => {
      if (!isResolved || !tenantId) return;

      try {
        const { data } = await base44.functions.invoke("demoVideoLoadRecent", {
          tenant_id: tenantId,
        });
        if (data?.job) {
          setJobId(data.job.id);
          setJobStatus(data.job.status);
        }
      } catch (err) {
        console.warn("[DV] Failed to load recent job:", err);
      }
    };

    loadRecent();
  }, [isResolved, tenantId]);

  const statusMutation = useMutation({
    mutationFn: async (jobIdVal) => {
      const { data } = await base44.functions.invoke("demoVideoGetStatus", {
        job_id: jobIdVal,
      });
      return data;
    },
  });

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearTimeout(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const startPolling = (jobIdVal) => {
    stopPolling();
    pollCountRef.current = 0;

    const pollOnce = async () => {
      try {
        const result = await statusMutation.mutateAsync(jobIdVal);
        if (result?.status) {
          setJobStatus(result.status);
          if (result.status === "completed" || result.status === "failed") {
            stopPolling();
            return;
          }
        }
      } catch (err) {
        console.warn("[DV] Poll error:", err);
      }

      pollCountRef.current += 1;
      const next =
        pollCountRef.current < 5 ? 2000 : pollCountRef.current < 15 ? 3000 : 5000;

      pollIntervalRef.current = setTimeout(pollOnce, next);
    };

    pollOnce();
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

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
        toast.error("Generation started but no jobId returned");
      }
    },
    onError: (err) => {
      console.error("[DV] Generation error:", err);
      toast.error("Generation failed", { description: extractErrorMessage(err) });
    },
  });

  // Fetch with timeout
  const fetchWithTimeout = async (url, options = {}, timeoutMs = 30000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(id);
    }
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
      const result = await statusMutation.mutateAsync(jobId);
      setJobStatus(result?.status || null);

      if (result?.status === "completed") toast.success("Video ready");
      else if (result?.status === "failed") toast.error("Generation failed");
      else toast.info("Status updated", { description: result?.status || "unknown" });
    } catch (err) {
      // ✅ FIX: log the full object + show meaningful toast
      console.error("[DV] Refresh error:", err);
      toast.error("Failed to refresh status", { description: extractErrorMessage(err) });
    }
  };

  const triggerDownload = (blobUrl, filename) => {
    // In embedded iframes, "download" can be blocked. We try both:
    // 1) normal download attribute
    // 2) open in a new tab as a fallback
    try {
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      a.rel = "noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      console.warn("[DV] a.click download failed:", e);
    }

    try {
      if (embedded) {
        // fallback: open in new tab (Shopify Admin often allows this)
        window.open(blobUrl, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      console.warn("[DV] window.open fallback failed:", e);
    }
  };

  const downloadVariant = async (format, e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();

    console.log("[DV] Download clicked", { format, jobId, jobStatus, embedded });

    if (downloadingVariant) return;

    if (!jobId) {
      toast.error("No video generated", { description: 'Click "Generate Demo Video" first.' });
      return;
    }

    if (jobStatus !== "completed") {
      toast.error("Video not ready", {
        description: `Current status: ${jobStatus || "unknown"}`,
      });
      return;
    }

    // ✅ Block with a clear message if embedded but token missing
    if (embedded && !shopifyToken) {
      const reason =
        tokenError || (tokenLoading ? "Still initializing Shopify auth..." : "Token retrieval failed");

      toast.error("Shopify auth not initialized", { description: reason, duration: 5000 });

      console.error("[DV-DL] ✗ BLOCKED: embedded=true but shopifyToken empty", {
        tokenLoading,
        tokenError,
        embedded,
      });

      return;
    }

    console.log("[DV] Download start", {
      jobId,
      format,
      embedded,
      tokenLen: shopifyToken?.length || 0,
    });

    setDownloadingVariant(format);

    try {
      const headers = { "Content-Type": "application/json" };

      if (embedded && shopifyToken) {
        headers["Authorization"] = `Bearer ${shopifyToken}`;
        console.log("[DV] ✓ Shopify bearer token attached, len=", shopifyToken.length);
      }

      const res = await fetchWithTimeout(
        "/api/functions/demoVideoProxyDownload",
        {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({ jobId, format }),
        },
        60000
      );

      console.log("[DV] Response:", {
        status: res.status,
        contentType: res.headers.get("content-type"),
        contentLength: res.headers.get("content-length"),
      });

      if (res.status === 401) {
        const errorData = await res.json().catch(() => ({}));
        const msg = errorData?.error || errorData?.message || "Unauthorized";
        console.error("[DV] ✗ 401:", msg, errorData);
        toast.error("Unauthorized", { description: msg });
        return;
      }

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        console.error("[DV] ✗ HTTP", res.status, errorText);
        toast.error("Download failed", {
          description: errorText.slice(0, 160) || `HTTP ${res.status}`,
        });
        return;
      }

      const contentType = res.headers.get("content-type") || "";
      const blob = await res.blob();

      // Reject JSON masquerading as a file
      if (contentType.includes("application/json") || blob.type.includes("json")) {
        const errorText = await blob.text().catch(() => "");
        console.error("[DV] ✗ Got JSON instead of file:", errorText);
        toast.error("Download returned JSON", { description: errorText.slice(0, 160) });
        return;
      }

      const minSize = format === "thumb" ? 500 : 1000;
      if (blob.size < minSize) {
        console.error("[DV] ✗ File too small:", blob.size);
        toast.error("File too small", { description: `${blob.size} bytes` });
        return;
      }

      // Basic MP4 signature check
      if (format !== "thumb") {
        const header = await blob.slice(0, 12).arrayBuffer();
        const view = new Uint8Array(header);
        const ftypIndex = new TextDecoder().decode(view).indexOf("ftyp");
        if (ftypIndex === -1) {
          console.error("[DV] ✗ Invalid MP4: no ftyp");
          toast.error("Invalid MP4", { description: "Missing ftyp signature" });
          return;
        }
      }

      const blobUrl = URL.createObjectURL(blob);
      const filename =
        format === "1080p"
          ? "ProfitShieldAI-demo-1080p.mp4"
          : format === "720p"
          ? "ProfitShieldAI-demo-720p.mp4"
          : format === "shopify"
          ? "ProfitShieldAI-app-store-1600x900.mp4"
          : "ProfitShieldAI-thumb.jpg";

      triggerDownload(blobUrl, filename);

      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 30_000);

      const sizeMB = (blob.size / 1_000_000).toFixed(2);
      toast.success("Download started", { description: `${filename} • ${sizeMB}MB` });
    } catch (err) {
      const isTimeout = err?.name === "AbortError" || String(err?.message || "").includes("timeout");
      const msg = isTimeout ? "Request timed out. Try again." : extractErrorMessage(err);
      console.error("[DV] Download error:", err);
      toast.error("Download error", { description: msg });
    } finally {
      setDownloadingVariant(null);
    }
  };

  const handleGenerate = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();

    console.log("[DV] Generate clicked", { embedded, tenantId, useDemoData });

    const payload = {
      tenant_id: useDemoData ? null : tenantId,
      mode: useDemoData ? "demo" : "real",
      version: selectedVersion,
      options: { voiceover: includeVoiceover, music: includeMusic },
    };

    generateMutation.mutate(payload);
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
          <CardDescription>Generate demo videos for your app listing</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {embedded && (
            <div
              className={`p-3 rounded-lg text-sm ${
                shopifyToken
                  ? "bg-emerald-50 border border-emerald-200"
                  : "bg-amber-50 border border-amber-200"
              }`}
            >
              {shopifyToken ? (
                <p className="text-emerald-800">
                  ✓ Shopify authentication: Ready ({shopifyToken.length} bytes)
                </p>
              ) : (
                <p className="text-amber-800">
                  {tokenLoading
                    ? "⏳ Initializing Shopify auth..."
                    : `✗ ${tokenError || "No token"}`}
                </p>
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

          {jobId && (
            <div className="p-4 rounded-lg bg-slate-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">Job: {jobId.slice(0, 8)}...</p>
                <Badge variant={jobStatus === "completed" ? "default" : "outline"}>
                  {jobStatus}
                </Badge>
              </div>

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleRefreshStatus}
                className="mt-2"
              >
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

          <AdvancedDownloadOptions />
        </CardContent>
      </Card>
    </div>
  );
}

export default DemoVideoGeneratorFixed;