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
  { id: "1080p", label: "Full HD (1920x1080)", description: "YouTube, marketing materials" },
  { id: "720p", label: "HD (1280x720)", description: "Web, social media" },
  { id: "shopify", label: "Shopify App Store", description: "App marketplace preview" },
  { id: "thumb", label: "Thumbnail (JPEG)", description: "Preview image" },
];

function isEmbedded() {
  if (typeof window === "undefined") return false;
  // For Shopify embedded, host param is present in query string
  return new URLSearchParams(window.location.search).has("host");
}

function safeErr(err) {
  return {
    name: err?.name,
    message: err?.message,
    stack: err?.stack,
    raw: err,
  };
}

export default function DemoVideoGeneratorFixed({ resolver = {} }) {
  // ✅ ONE embedded declaration (ONLY ONCE)
  const embedded = isEmbedded();

  let resolverCheck = null;
  let isResolved = false;
  let tenantId = null;

  try {
    resolverCheck = requireResolved(resolver);
    isResolved = resolverCheck?.ok === true;
    tenantId = resolverCheck?.tenantId || null;
  } catch {
    isResolved = false;
    tenantId = null;
  }

  const { hasPermission } = usePermissions() || {};
  void hasPermission;

  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [outputs, setOutputs] = useState({});
  const [downloadingVariant, setDownloadingVariant] = useState(null);

  const [selectedVersion, setSelectedVersion] = useState("90s");
  const [includeVoiceover, setIncludeVoiceover] = useState(true);
  const [includeMusic, setIncludeMusic] = useState(true);
  const [useDemoData, setUseDemoData] = useState(true);

  const pollIntervalRef = useRef(null);
  const pollCountRef = useRef(0);

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
          setOutputs(data.job.outputs || data.job.outputUrls || {});
        }
      } catch (err) {
        console.warn("[DV] loadRecent error:", safeErr(err));
      }
    };
    loadRecent();
  }, [isResolved, tenantId]);

  const statusMutation = useMutation({
    mutationFn: async (jobIdVal) => {
      const { data } = await base44.functions.invoke("demoVideoGetStatus", {
        job_id: jobIdVal,
        tenant_id: tenantId || null,
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
          setOutputs(result.outputs || {});
          if (result.status === "completed" || result.status === "failed") {
            stopPolling();
            return;
          }
        }
      } catch (err) {
        console.warn("[DV] poll error:", safeErr(err));
      }

      pollCountRef.current += 1;
      const next = pollCountRef.current < 5 ? 2000 : pollCountRef.current < 15 ? 3000 : 5000;
      pollIntervalRef.current = setTimeout(pollOnce, next);
    };

    pollOnce();
  };

  useEffect(() => stopPolling, []);

  const generateMutation = useMutation({
    mutationFn: async (payload) => {
      const { data } = await base44.functions.invoke("demoVideoGenerator", payload);
      return data;
    },
    onSuccess: (data) => {
      if (data?.jobId) {
        setJobId(data.jobId);
        setJobStatus(data.status || "queued");
        setOutputs(data.outputs || {});
        startPolling(data.jobId);
        toast.success("Video generation started");
      } else {
        toast.error("Generation started but no jobId returned");
      }
    },
    onError: (err) => {
      console.error("[DV] Generation error (FULL):", safeErr(err));
      toast.error("Generation failed", { description: err?.message || "Unknown error" });
    },
  });

  // Fetch with timeout
  const fetchWithTimeout = async (url, options = {}, timeoutMs = 60000) => {
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
      setOutputs(result?.outputs || {});

      if (result?.status === "completed") toast.success("Video ready");
      else if (result?.status === "failed") toast.error("Generation failed");
      else toast.info("Status updated", { description: result?.status || "unknown" });
    } catch (err) {
      console.error("[DV] Refresh error:", err);
      toast.error("Failed to refresh status", { description: err?.message || "Unknown error" });
    }
  };

  const downloadVariant = async (format, e, opts = {}) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();

    if (downloadingVariant) return;

    if (!jobId) {
      toast.error("No video generated", { description: 'Click "Generate Demo Video" first.' });
      return;
    }

    if (jobStatus !== "completed") {
      toast.error("Video not ready", { description: `Current status: ${jobStatus || "unknown"}` });
      return;
    }

    // Shopify embedded: require token
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
      directExternal: !!opts.directExternal,
    });

    setDownloadingVariant(format);

    try {
      // If direct external is requested and we have a URL, use it (top-level only)
      const directUrl =
        opts.directExternal && outputs && typeof outputs === "object" ? outputs?.[format] : null;

      if (directUrl) {
        // download using top-level navigation trick
        const a = document.createElement("a");
        a.href = directUrl;
        a.target = "_blank";
        a.rel = "noreferrer";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => a.remove(), 50);
        toast.success("Opened external download", { description: "If blocked, use proxy download." });
        return;
      }

      const headers = { "Content-Type": "application/json" };

      // Attach Shopify bearer token if embedded
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
          body: JSON.stringify({ jobId, format, tenantId: tenantId || null }),
        },
        60000
      );

      const contentType = res.headers.get("content-type");
      const maybeJson = contentType && contentType.includes("application/json");

      // If backend returns error JSON, surface it
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("[DV] ✗ Download error:", res.status, text);
        toast.error("Download failed", { description: text.slice(0, 220) || `HTTP ${res.status}` });

        // If this is "URL not available", trigger a refresh to pull updated outputs
        if (text.includes("URL not available")) {
          try {
            const st = await statusMutation.mutateAsync(jobId);
            setJobStatus(st?.status || jobStatus);
            setOutputs(st?.outputs || outputs);
          } catch {}
        }
        return;
      }

      // Prefer blob for actual file
      const blob = await res.blob();

      // Reject JSON masquerading as file
      if (maybeJson || blob.type.includes("json")) {
        const errorText = await blob.text().catch(() => "");
        console.error("[DV] ✗ Got JSON instead of file:", errorText);
        toast.error("Download returned JSON", { description: errorText.slice(0, 220) });
        return;
      }

      // Size sanity
      const minSize = format === "thumb" ? 500 : 1000;
      if (blob.size < minSize) {
        toast.error("File too small", { description: `${blob.size} bytes` });
        return;
      }

      // MP4 signature check
      if (format !== "thumb") {
        const header = await blob.slice(0, 16).arrayBuffer();
        const view = new Uint8Array(header);
        const s = new TextDecoder().decode(view);
        if (!s.includes("ftyp")) {
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
      }, 200);

      toast.success("Download complete", {
        description: `${filename} • ${(blob.size / 1_000_000).toFixed(2)}MB`,
      });
    } catch (err) {
      const isTimeout = err?.name === "AbortError" || String(err?.message).includes("timeout");
      console.error("[DV] Download error (FULL):", safeErr(err));
      toast.error("Download error", {
        description: isTimeout ? "Request timed out. Try again." : err?.message || "Unknown error",
      });
    } finally {
      setDownloadingVariant(null);
    }
  };

  const handleGenerate = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();

    const payload = {
      tenant_id: useDemoData ? null : tenantId,
      mode: useDemoData ? "demo" : "real",
      version: selectedVersion,
      options: { voiceover: includeVoiceover, music: includeMusic },
    };

    console.log("[DV] Generate clicked", payload);
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
                <p className="text-emerald-800">✓ Shopify authentication: Ready ({shopifyToken.length} bytes)</p>
              ) : (
                <p className="text-amber-800">
                  {tokenLoading ? "⏳ Initializing Shopify auth..." : `✗ ${tokenError || "No token"}`}
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
                <p className="text-sm font-medium">Job: {String(jobId).slice(0, 8)}...</p>
                <Badge variant={jobStatus === "completed" ? "default" : "outline"}>{jobStatus}</Badge>
              </div>

              <Button type="button" size="sm" variant="outline" onClick={handleRefreshStatus} className="mt-2">
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

          {/* ✅ Make "Advanced Download" actually work */}
          <AdvancedDownloadOptions
            jobId={jobId}
            jobStatus={jobStatus}
            outputs={outputs}
            embedded={embedded}
            shopifyToken={shopifyToken}
            tokenLoading={tokenLoading}
            tokenError={tokenError}
            tenantId={tenantId}
            onDownload={(format, e, opts) => downloadVariant(format, e, opts)}
          />
        </CardContent>
      </Card>
    </div>
  );
}