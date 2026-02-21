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

    // ✅ Define embedded INSIDE this function so it always exists
    const embedded =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("host");

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

// ✅ Define embedded BEFORE using it anywhere
const embedded =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("host");

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
        '/api/functions/demoVideoProxyDownload',
        {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ jobId, format })
        },
        30000
      );

      console.log('[DV] Response:', {
        status: res.status,
        contentType: res.headers.get('content-type'),
        contentLength: res.headers.get('content-length')
      });

      // Auth error
      if (res.status === 401) {
        const errorData = await res.json().catch(() => ({}));
        const msg = errorData.error || 'Unauthorized';
        console.error('[DV] ✗ 401 Auth error:', msg);
        toast.error('Unauthorized', { description: msg });
        setDownloadingVariant(null);
        return;
      }

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        console.error('[DV] ✗ HTTP', res.status, errorText);
        toast.error('Download failed', {
          description: errorText.slice(0, 160) || `HTTP ${res.status}`
        });
        setDownloadingVariant(null);
        return;
      }

      const contentType = res.headers.get('content-type') || '';
      const blob = await res.blob();

      // Reject JSON masquerading as a file
      if (contentType.includes('application/json') || blob.type.includes('json')) {
        const errorText = await blob.text().catch(() => '');
        console.error('[DV] ✗ Got JSON instead of file:', errorText);
        toast.error('Download returned JSON', { description: errorText.slice(0, 160) });
        setDownloadingVariant(null);
        return;
      }

      console.log('[DV] ✓ Blob received:', { size: blob.size, type: blob.type });

      // Verify min size
      const minSize = format === 'thumb' ? 500 : 1000;
      if (blob.size < minSize) {
        console.error('[DV] ✗ File too small:', blob.size);
        toast.error('File too small', { description: `${blob.size} bytes` });
        setDownloadingVariant(null);
        return;
      }

      // Verify MP4
      if (format !== 'thumb') {
        const header = await blob.slice(0, 12).arrayBuffer();
        const view = new Uint8Array(header);
        const ftypIndex = new TextDecoder().decode(view).indexOf('ftyp');

        if (ftypIndex === -1) {
          console.error('[DV] ✗ Invalid MP4: no ftyp');
          toast.error('Invalid MP4', { description: 'Missing ftyp signature' });
          setDownloadingVariant(null);
          return;
        }
      }

      console.log('[DV] ✓ Valid file:', { format, size: blob.size });

      // Download
      const url = URL.createObjectURL(blob);
      const filename =
        format === '1080p'
          ? 'ProfitShieldAI-demo-1080p.mp4'
          : format === '720p'
            ? 'ProfitShieldAI-demo-720p.mp4'
            : format === 'shopify'
              ? 'ProfitShieldAI-app-store-1600x900.mp4'
              : 'ProfitShieldAI-thumb.jpg';

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 100);

      const sizeMB = (blob.size / 1_000_000).toFixed(2);
      toast.success('Download complete', {
        description: `${filename} • ${sizeMB}MB`
      });
    } catch (err) {
      const isTimeout = err?.name === 'AbortError' || String(err?.message).includes('timeout');
      const msg = isTimeout ? 'Request timed out. Try again.' : (err?.message || 'Unknown error');

      console.error('[DV] ✗ Download error:', err);
      toast.error('Download error', { description: msg });
    } finally {
      setDownloadingVariant(null);
    }
  };

  // Generate handler
  const handleGenerate = () => {
    const payload = {
      tenant_id: useDemoData ? null : tenantId,
      mode: useDemoData ? 'demo' : 'real',
      version: selectedVersion,
      options: {
        voiceover: includeVoiceover,
        music: includeMusic
      }
    };

    generateMutation.mutate(payload);
  };

  // Refresh status
  const handleRefreshStatus = async () => {
    if (!jobId) return;

    try {
      const result = await statusMutation.mutateAsync(jobId);
      setJobStatus(result.status);

      if (result.status === 'completed') {
        toast.success('Video ready');
      } else if (result.status === 'failed') {
        toast.error('Generation failed');
      } else if (result.status === 'rendering') {
        startPolling(jobId);
        toast.info('Still rendering...');
      }
    } catch (err) {
      toast.error('Failed to refresh status');
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
          <CardDescription>
            Generate beautiful demo videos for your app listing
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Auth status for embedded */}
          {embedded && (
            <div
              className={`p-3 rounded-lg text-sm ${
                shopifyToken
                  ? 'bg-emerald-50 border border-emerald-200'
                  : 'bg-amber-50 border border-amber-200'
              }`}
            >
              {shopifyToken ? (
                <p className="text-emerald-800">
                  ✓ Shopify authentication: Ready ({shopifyToken.length} bytes)
                </p>
              ) : (
                <p className="text-amber-800">
                  {tokenLoading ? '⏳ Initializing Shopify auth...' : `✗ ${tokenError || 'No token'}`}
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

          {/* Generate Button */}
          <Button
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
              'Generate Demo Video'
            )}
          </Button>

          {/* Job Status */}
          {jobId && (
            <div className="p-4 rounded-lg bg-slate-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">Job: {jobId.slice(0, 8)}...</p>
                <Badge variant={jobStatus === 'completed' ? 'default' : 'outline'}>
                  {jobStatus}
                </Badge>
              </div>

              {jobStatus === 'rendering' && (
                <div className="text-xs text-slate-600">Rendering in progress...</div>
              )}

              <Button
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

          {/* Download Section */}
          {jobId && jobStatus === 'completed' && (
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

          {/* Advanced */}
          <AdvancedDownloadOptions />
        </CardContent>
      </Card>
    </div>
  );
}

export default DemoVideoGenerator;