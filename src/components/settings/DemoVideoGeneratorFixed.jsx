import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { requireResolved } from '@/components/usePlatformResolver';
import { usePermissions } from '@/components/usePermissions';
import { useAppBridgeToken } from '@/components/shopify/AppBridgeAuth';
import AIScriptingAssistant from './AIScriptingAssistant';
import AdvancedDownloadOptions from './AdvancedDownloadOptions';
import {
  Download,
  Loader2,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

const VARIANTS = [
  { id: '1080p', label: 'Full HD (1920x1080)', description: 'YouTube, marketing materials' },
  { id: '720p', label: 'HD (1280x720)', description: 'Web, social media' },
  { id: 'shopify', label: 'Shopify App Store', description: 'App marketplace preview' },
  { id: 'thumb', label: 'Thumbnail (JPEG)', description: 'Preview image' }
];

function DemoVideoGenerator({ resolver = {} }) {
  let resolverCheck = null;
  let isResolved = false;
  let tenantId = null;

  try {
    resolverCheck = requireResolved(resolver);
    isResolved = resolverCheck?.ok === true;
    tenantId = resolverCheck?.tenantId;
  } catch (e) {
    isResolved = false;
    tenantId = null;
  }

  const { hasPermission } = usePermissions() || {};

  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [downloadingVariant, setDownloadingVariant] = useState(null);
  const [selectedVersion, setSelectedVersion] = useState('90s');
  const [includeVoiceover, setIncludeVoiceover] = useState(true);
  const [includeMusic, setIncludeMusic] = useState(true);
  const [useDemoData, setUseDemoData] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testResults, setTestResults] = useState(null);

  const pollIntervalRef = useRef(null);
  const pollStartRef = useRef(null);
  const pollCountRef = useRef(0);

  // ✅ ONE place to calculate "embedded" so it’s never undefined
  const embedded =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('host');

  // Real Shopify App Bridge authentication
  const { token: shopifyToken, loading: tokenLoading, error: tokenError } = useAppBridgeToken();

  // Load recent job on mount
  useEffect(() => {
    const loadRecent = async () => {
      if (!isResolved || !tenantId) return;

      try {
        const { data } = await base44.functions.invoke('demoVideoLoadRecent', { tenant_id: tenantId });
        if (data?.job) {
          setJobId(data.job.id);
          setJobStatus(data.job.status);
        }
      } catch (err) {
        console.warn('Failed to load recent job:', err.message);
      }
    };

    loadRecent();
  }, [isResolved, tenantId]);

  // Generate mutation
  const generateMutation = useMutation({
    mutationFn: async (payload) => {
      const { data } = await base44.functions.invoke('demoVideoGenerator', payload);
      return data;
    },
    onSuccess: (data) => {
      if (data?.jobId) {
        setJobId(data.jobId);
        setJobStatus('queued');
        startPolling(data.jobId);
        toast.success('Video generation started');
      }
    },
    onError: (err) => {
      toast.error('Generation failed: ' + err.message);
    },
  });

  // Status mutation
  const statusMutation = useMutation({
    mutationFn: async (jobIdVal) => {
      const { data } = await base44.functions.invoke('demoVideoGetStatus', { job_id: jobIdVal });
      return data;
    },
  });

  // Polling logic
  const startPolling = (jobIdVal) => {
    if (pollIntervalRef.current) clearTimeout(pollIntervalRef.current);
    pollStartRef.current = Date.now();
    pollCountRef.current = 0;

    const poll = async () => {
      try {
        const result = await statusMutation.mutateAsync(jobIdVal);
        if (result?.status) {
          setJobStatus(result.status);
          if (result.status === 'completed' || result.status === 'failed') {
            stopPolling();
          }
        }
      } catch (err) {
        console.warn('Poll error:', err);
      }

      pollCountRef.current++;
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

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearTimeout(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

   // ✅ ONE embedded declaration (ONLY ONCE) — keep this near the top of your component
const embedded =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("host");

// Download handler - STRICT Shopify auth requirement
const downloadVariant = async (format) => {
  if (downloadingVariant) return;

  if (!jobId) {
    toast.error("No video generated", {
      description: 'Click "Generate Demo Video" first.',
    });
    return;
  }

  if (jobStatus !== "completed") {
    toast.error("Video not ready", {
      description: `Current status: ${jobStatus || "unknown"}`,
    });
    return;
  }

  // ✅ FIX: prevent crash + give a clear message if embedded but token missing
  if (embedded && !shopifyToken) {
    const reason =
      tokenError ||
      (tokenLoading ? "Still initializing Shopify auth..." : "Token retrieval failed");

    toast.error("Shopify auth not initialized", {
      description: reason,
      duration: 5000,
    });

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

    // Attach Shopify bearer token if embedded (REQUIRED)
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
      30000
    );

    console.log("[DV] Response:", {
      status: res.status,
      contentType: res.headers.get("content-type"),
      contentLength: res.headers.get("content-length"),
    });

    // Auth error
    if (res.status === 401) {
      const errorData = await res.json().catch(() => ({}));
      const msg = errorData.error || "Unauthorized";
      console.error("[DV] ✗ 401 Auth error:", msg);
      toast.error("Unauthorized", { description: msg });
      setDownloadingVariant(null);
      return;
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      console.error("[DV] ✗ HTTP", res.status, errorText);
      toast.error("Download failed", {
        description: errorText.slice(0, 160) || `HTTP ${res.status}`,
      });
      setDownloadingVariant(null);
      return;
    }

    const contentType = res.headers.get("content-type") || "";
    const blob = await res.blob();

    // Reject JSON masquerading as a file
    if (contentType.includes("application/json") || blob.type.includes("json")) {
      const errorText = await blob.text().catch(() => "");
      console.error("[DV] ✗ Got JSON instead of file:", errorText);
      toast.error("Download returned JSON", { description: errorText.slice(0, 160) });
      setDownloadingVariant(null);
      return;
    }

    console.log("[DV] ✓ Blob received:", { size: blob.size, type: blob.type });

    // Verify min size
    const minSize = format === "thumb" ? 500 : 1000;
    if (blob.size < minSize) {
      console.error("[DV] ✗ File too small:", blob.size);
      toast.error("File too small", { description: `${blob.size} bytes` });
      setDownloadingVariant(null);
      return;
    }

    // Verify MP4
    if (format !== "thumb") {
      const header = await blob.slice(0, 12).arrayBuffer();
      const view = new Uint8Array(header);
      const ftypIndex = new TextDecoder().decode(view).indexOf("ftyp");

      if (ftypIndex === -1) {
        console.error("[DV] ✗ Invalid MP4: no ftyp");
        toast.error("Invalid MP4", { description: "Missing ftyp signature" });
        setDownloadingVariant(null);
        return;
      }
    }

    console.log("[DV] ✓ Valid file:", { format, size: blob.size });

    // Download
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

    const sizeMB = (blob.size / 1_000_000).toFixed(2);
    toast.success("Download complete", {
      description: `${filename} • ${sizeMB}MB`,
    });
  } catch (err) {
    const isTimeout =
      err?.name === "AbortError" || String(err?.message).includes("timeout");
    const msg = isTimeout
      ? "Request timed out. Try again."
      : err?.message || "Unknown error";

    console.error("[DV] ✗ Download error:", err);
    toast.error("Download error", { description: msg });
  } finally {
    setDownloadingVariant(null);
  }
};erator;