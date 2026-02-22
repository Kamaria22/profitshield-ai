import React, { useEffect, useMemo, useRef, useState } from "react";
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
  { id: "1080p", label: "Full HD (1920x1080)" },
  { id: "720p", label: "HD (1280x720)" },
  { id: "shopify", label: "Shopify App Store" },
  { id: "thumb", label: "Thumbnail (JPEG)" },
];

function safeMsg(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
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
    return true;
  }
}

function parseJsonSafely(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function DemoVideoGeneratorFixed({ resolver = {} }) {
  // ✅ ONE embedded declaration (ONLY ONCE)
  const embedded = useMemo(() => {
    if (typeof window === "undefined") return false;
    const hasHost = new URLSearchParams(window.location.search).has("host");
    return hasHost || isIframeEmbedded();
  }, []);

  let resolverCheck = null;
  let isResolved = false;
  let tenantId = null;
  let storeKey = null;

  try {
    resolverCheck = requireResolved(resolver);
    isResolved = resolverCheck?.ok === true;
    tenantId = resolverCheck?.tenantId || null;
    storeKey = resolverCheck?.storeKey || resolverCheck?.store_key || null;
  } catch {
    isResolved = false;
    tenantId = null;
    storeKey = null;
  }

  const { hasPermission } = usePermissions() || {};
  void hasPermission;

  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [downloadingVariant, setDownloadingVariant] = useState(null);

  // We will track what formats are actually available for THIS job
  const [availableFormats, setAvailableFormats] = useState(null);

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
          setJobStatus(data.job.status || null);

          // try to infer available formats if provided
          const af =
            data.job.availableFormats ||
            data.job.available_formats ||
            data.job.outputs?.availableFormats ||
            data.job.outputs?.formats ||
            null;

          if (Array.isArray(af)) setAvailableFormats(af);
        }
      } catch (err) {
        console.warn("[DV] Failed to load recent job:", err);
      }
    };

    loadRecent();
  }, [isResolved, tenantId]);

  const statusMutation = useMutation({
    mutationFn: async (jobIdVal) => {
      // ✅ IMPORTANT: always pass { job_id }, not { jobId }
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

  const applyStatusResult = (result) => {
    const status = result?.status || result?.job?.status || null;
    if (status) setJobStatus(status);

    const af =
      result?.availableFormats ||
      result?.available_formats ||
      result?.job?.availableFormats ||
      result?.job?.available_formats ||
      result?.outputs?.availableFormats ||
      result?.outputs?.formats ||
      null;

    if (Array.isArray(af)) setAvailableFormats(af);
  };

  const startPolling = (jobIdVal) => {
    stopPolling();
    pollCountRef.current = 0;

    const pollOnce = async () => {
      try {
        const result = await statusMutation.mutateAsync(jobIdVal);
        applyStatusResult(result);

        const status = result?.status || result?.job?.status;
        if (status === "completed" || status === "failed") {
          stopPolling();
          return;
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
      console.log("[DV] Generate success payload:", data);

      const newJobId = data?.jobId || data?.job_id || data?.job?.id || null;
      if (newJobId) {
        setJobId(newJobId);
        setJobStatus("queued");
        setAvailableFormats(null);
        startPolling(newJobId);
        toast.success("Video generation started");
      } else {
        toast.error("Generation started but no jobId returned");
      }
    },
    onError: (err) => {
      console.error("[DV] Generation error (FULL):", err);
      toast.error("Generation failed", { description: safeMsg(err) });
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
      console.log("[DV] Refresh result:", result);
      applyStatusResult(result);

      const status = result?.status || result?.job?.status;
      if (status === "completed") toast.success("Video ready");
      else if (status === "failed") toast.error("Generation failed");
      else toast.info("Status updated", { description: status || "unknown" });
    } catch (err) {
      // ✅ FIX: log full object
      console.error("[DV] Refresh error (FULL):", err);
      toast.error("Failed to refresh status", { description: safeMsg(err) });
    }
  };

  const buildHeaders = () => {
    const headers = { "Content-Type": "application/json" };
    if (embedded && shopifyToken) headers["Authorization"] = `Bearer ${shopifyToken}`;
    return headers;
  };

  const isVariantAvailable = (format) => {
    if (!availableFormats) return true; // unknown → allow attempt
    return availableFormats.includes(format);
  };

  const downloadByBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);

    // In embedded iframes, direct "download" can be flaky. We try both:
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();

    // fallback open
    try {
      if (embedded) window.open(url, "_blank", "noopener,noreferrer");
    } catch {}

    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  const tryGetDirectUrlFromBackend = async ({ jobIdVal, format }) => {
    // OPTIONAL: if you later add/rename a function that returns { url }
    // This is safe because we catch errors and fallback to proxy.
    const fnNamesToTry = [
      "demoVideoGetDownloadUrl",
      "demoVideoGetDownloadURL",
      "demoVideoGetUrl",
      "demoVideoGetURL",
    ];

    for (const fn of fnNamesToTry) {
      try {
        const { data } = await base44.functions.invoke(fn, {
          job_id: jobIdVal,
          format,
        });

        const url = data?.url || data?.downloadUrl || data?.download_url || null;
        if (url && typeof url === "string") return url;
      } catch (e) {
        // ignore, try next
      }
    }
    return null;
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
      toast.error("Video not ready", { description: `Current status: ${jobStatus || "unknown"}` });
      return;
    }

    // If we know this output doesn't exist, don't pretend
    if (availableFormats && !isVariantAvailable(format)) {
      toast.error("Format not available for this job", {
        description: `Available: ${availableFormats.join(", ")}`,
      });
      return;
    }

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

    setDownloadingVariant(format);

    try {
      // 1) Try a direct URL function first (if present)
      const directUrl = await tryGetDirectUrlFromBackend({ jobIdVal: jobId, format });
      if (directUrl) {
        console.log("[DV] Direct URL obtained:", directUrl);
        window.open(directUrl, "_blank", "noopener,noreferrer");
        toast.success("Download opened", { description: "Direct file URL opened in a new tab." });
        return;
      }

      // 2) Fallback to proxy download (your current path)
      const headers = buildHeaders();
      console.log("[DV] Proxy download start", { jobId, format, embedded, tokenLen: shopifyToken?.length || 0 });

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

      const ct = res.headers.get("content-type") || "";
      console.log("[DV] Proxy response:", { status: res.status, ct });

      if (res.status === 401) {
        const j = await res.json().catch(() => ({}));
        toast.error("Unauthorized", { description: j?.error || j?.message || "Unauthorized" });
        return;
      }

      if (!res.ok) {
        const raw = await res.text().catch(() => "");
        const j = parseJsonSafely(raw);
        const msg = j?.error || j?.message || raw || `HTTP ${res.status}`;

        // if backend tells you it doesn't exist for this variant, surface it clearly
        if (res.status === 404 && (msg || "").toLowerCase().includes("url not available")) {
          toast.error("This format wasn’t generated for this job", {
            description: msg,
          });
        } else {
          toast.error("Download failed", { description: String(msg).slice(0, 180) });
        }

        console.error("[DV] ✗ Download HTTP error:", res.status, raw);
        return;
      }

      // If it's JSON, treat it as an error (proxy sometimes returns JSON payload)
      if (ct.includes("application/json")) {
        const raw = await res.text().catch(() => "");
        const j = parseJsonSafely(raw);
        toast.error("Download returned JSON", {
          description: (j?.error || j?.message || raw).slice(0, 180),
        });
        console.error("[DV] ✗ JSON instead of file:", raw);
        return;
      }

      const blob = await res.blob();
      const minSize = format === "thumb" ? 500 : 1000;
      if (blob.size < minSize) {
        toast.error("File too small", { description: `${blob.size} bytes` });
        return;
      }

      const filename =
        format === "1080p"
          ? "ProfitShieldAI-demo-1080p.mp4"
          : format === "720p"
          ? "ProfitShieldAI-demo-720p.mp4"
          : format === "shopify"
          ? "ProfitShieldAI-app-store-1600x900.mp4"
          : "ProfitShieldAI-thumb.jpg";

      downloadByBlob(blob, filename);

      const sizeMB = (blob.size / 1_000_000).toFixed(2);
      toast.success("Download started", { description: `${filename} • ${sizeMB}MB` });
    } catch (err) {
      const isTimeout = err?.name === "AbortError" || String(err?.message || "").includes("timeout");
      toast.error("Download error", {
        description: isTimeout ? "Request timed out. Try again." : safeMsg(err),
      });
      console.error("[DV] Download error (FULL):", err);
    } finally {
      setDownloadingVariant(null);
    }
  };

  const handleGenerate = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();

    // IMPORTANT: 500 is backend. We still send the cleanest payload possible.
    // If your backend requires tenant_id always, we pass it when we have it.
    const payload = {
      tenant_id: tenantId || null,
      store_key: storeKey || null,
      mode: useDemoData ? "demo" : "real",
      version: selectedVersion,
      options: {
        voiceover: includeVoiceover,
        music: includeMusic,
      },
      // helpful context for server-side routing
      embedded,
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
                <p className="text-emerald-800">
                  ✓ Shopify authentication: Ready ({shopifyToken.length} bytes)
                </p>
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

              {Array.isArray(availableFormats) && availableFormats.length > 0 && (
                <div className="text-xs text-slate-600 mt-1">
                  Available formats: {availableFormats.join(", ")}
                </div>
              )}

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
                {VARIANTS.map((v) => {
                  const disabled =
                    downloadingVariant === v.id ||
                    (Array.isArray(availableFormats) && !isVariantAvailable(v.id));

                  return (
                    <Button
                      type="button"
                      key={v.id}
                      onClick={(e) => downloadVariant(v.id, e)}
                      disabled={disabled}
                      variant="outline"
                      size="sm"
                      className="flex-col h-auto py-2"
                      title={
                        Array.isArray(availableFormats) && !isVariantAvailable(v.id)
                          ? `Not generated. Available: ${availableFormats.join(", ")}`
                          : ""
                      }
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
                  );
                })}
              </div>
            </div>
          )}

          <AdvancedDownloadOptions
            embedded={embedded}
            shopifyToken={shopifyToken}
            tokenLoading={tokenLoading}
            tokenError={tokenError}
            jobId={jobId}
            jobStatus={jobStatus}
            availableFormats={availableFormats}
            onDownload={(format) => downloadVariant(format)}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default DemoVideoGeneratorFixed;