import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { requireResolved } from '@/components/usePlatformResolver';
import { usePermissions } from '@/components/usePermissions';
import { getShopifySessionToken, isEmbedded } from '@/components/utils/shopifyAuth';
import AIScriptingAssistant from './AIScriptingAssistant';
import AdvancedDownloadOptions from './AdvancedDownloadOptions';
import { 
  Download, 
  Loader2,
  CheckCircle,
  AlertCircle,
  Sparkles,
  Clock,
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

// ✅ Overlay diagnostic helper
function closestBlockingOverlay(el) {
  let cur = el;
  while (cur && cur !== document.documentElement) {
    const cs = window.getComputedStyle(cur);
    const isFixedFull =
      cs.position === 'fixed' &&
      (cs.inset === '0px' || (cs.top === '0px' && cs.left === '0px')) &&
      (cs.width === '100%' || cs.right === '0px') &&
      (cs.height === '100%' || cs.bottom === '0px');
    const blocksClicks = cs.pointerEvents !== 'none' && cs.visibility !== 'hidden' && cs.display !== 'none';
    const z = Number(cs.zIndex || 0);

    if (isFixedFull && blocksClicks && z >= 20) return cur;
    cur = cur.parentElement;
  }
  return null;
}

function safeStringifyStyle(el) {
  const cs = window.getComputedStyle(el);
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    className: el.className || null,
    position: cs.position,
    pointerEvents: cs.pointerEvents,
    zIndex: cs.zIndex,
    inset: cs.inset,
    top: cs.top,
    left: cs.left,
    width: cs.width,
    height: cs.height,
    opacity: cs.opacity,
  };
}

export default function DemoVideoGenerator({ resolver = {} }) {
  let tenantId = null;
  let isResolved = false;
  try {
    const resolverCheck = requireResolved(resolver);
    tenantId = resolverCheck.tenantId;
    isResolved = true;
  } catch (e) {
    isResolved = false;
  }

  const permissionsData = usePermissions() || {};
  const isOwner = permissionsData.role === 'admin' || permissionsData.role === 'owner';

  const [selectedVersion, setSelectedVersion] = useState('90s');
  const [includeVoiceover, setIncludeVoiceover] = useState(true);
  const [includeMusic, setIncludeMusic] = useState(true);
  const [useDemoData, setUseDemoData] = useState(!isResolved);
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [downloadingVariant, setDownloadingVariant] = useState(null);
  const [testResults, setTestResults] = useState(null);
  
  const pollIntervalRef = useRef(null);
  const pollStartRef = useRef(null);
  const pollCountRef = useRef(0);

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
    }
  });

  // Status mutation
  const statusMutation = useMutation({
    mutationFn: async (jid) => {
      const { data } = await base44.functions.invoke('demoVideoGetStatus', { jobId: jid });
      return data;
    }
  });

  // Polling logic with backoff
  const startPolling = (jid) => {
    stopPolling();
    pollStartRef.current = Date.now();
    pollCountRef.current = 0;
    
    const poll = async () => {
      if (Date.now() - pollStartRef.current > 120000) {
        stopPolling();
        toast.error('Polling timeout - click Refresh to check status');
        return;
      }

      try {
        const result = await statusMutation.mutateAsync(jid);
        setJobStatus(result.status);
        
        if (result.status === 'completed') {
          stopPolling();
          toast.success('Video ready for download');
        } else if (result.status === 'failed') {
          stopPolling();
          toast.error('Video generation failed');
        }
      } catch (err) {
        console.warn('Poll error:', err);
      }

      pollCountRef.current++;
    };

    // Backoff: 2s → 3s → 5s
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

  // ✅ Global pointer event capture to diagnose/fix overlay clicks
  useEffect(() => {
    const handler = (ev) => {
      try {
        const x = ev.clientX;
        const y = ev.clientY;
        const topEl = document.elementFromPoint(x, y);

        if (topEl && !(topEl instanceof HTMLButtonElement) && !topEl.closest('button')) {
          const overlay = closestBlockingOverlay(topEl);
          if (overlay) {
            console.warn('[DV][CLICK-BLOCKED] Overlay detected. Disabling pointer-events.', {
              at: { x, y },
              topEl: safeStringifyStyle(topEl),
              overlay: safeStringifyStyle(overlay),
            });
            overlay.style.pointerEvents = 'none';
            overlay.style.outline = '2px solid rgba(255,0,0,0.35)';
          }
        }
      } catch (e) {
        // Never crash UI
      }
    };

    window.addEventListener('pointerdown', handler, true);
    return () => window.removeEventListener('pointerdown', handler, true);
  }, []);

  // Fetch with timeout + abort controller
  const fetchWithTimeout = async (url, options = {}, timeoutMs = 30000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
    
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      return res;
    } finally {
      clearTimeout(id);
    }
  };

  // Download handler - Shopify iframe safe, QuickTime compatible, timeout-protected
  const downloadVariant = async (format) => {
    if (downloadingVariant) return;
    
    if (!jobId) {
      toast.error('No video generated', { description: 'Click "Generate Demo Video" first.' });
      return;
    }
    
    if (jobStatus !== 'completed') {
      toast.error('Video not ready', { description: `Current status: ${jobStatus || 'unknown'}` });
      return;
    }
    
    console.info('[DV] click', { jobId, format });
    setDownloadingVariant(format);

    try {
      const headers = { 'Content-Type': 'application/json' };
      const embedded = isEmbedded();
      const token = embedded ? await getShopifySessionToken({ timeoutMs: 5000 }) : null;
      
      if (embedded) {
        if (!token) {
          toast.error('No Shopify session token available');
          setDownloadingVariant(null);
          return;
        }
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const res = await fetchWithTimeout('/api/functions/demoVideoProxyDownload', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ jobId, format })
      }, 30000);

      console.info('[DV] proxy-response', { 
        status: res.status,
        contentType: res.headers.get('content-type'),
        contentLength: res.headers.get('content-length')
      });

      // Handle auth errors explicitly
      if (res.status === 401) {
        const errorData = await res.json().catch(() => ({}));
        const msg = errorData.error || 'Unauthorized';
        console.error('[DV] Auth error:', msg);
        toast.error('Unauthorized download', { 
          description: embedded ? 'Session expired. Please reload the app.' : msg 
        });
        setDownloadingVariant(null);
        return;
      }

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        console.error('[DV] download error', { status: res.status, errorText });
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
        console.error('[DV] Received JSON instead of file:', errorText);
        toast.error('Download returned JSON, not a file', { 
          description: errorText.slice(0, 160) 
        });
        setDownloadingVariant(null);
        return;
      }

      console.info('[DV] blob', { size: blob.size, type: blob.type });

      // Verify minimum file size
      const minSize = format === 'thumb' ? 500 : 1000;
      if (blob.size < minSize) {
        console.error('[DV] File too small:', blob.size, 'bytes');
        toast.error('Download failed', { 
          description: `File too small (${blob.size} bytes)` 
        });
        setDownloadingVariant(null);
        return;
      }

      // Verify MP4 signature for video files
      if (format !== 'thumb') {
        const header = await blob.slice(0, 12).arrayBuffer();
        const view = new Uint8Array(header);
        const ftypIndex = new TextDecoder().decode(view).indexOf('ftyp');
        
        if (ftypIndex === -1) {
          console.error('[DV] Invalid MP4: missing ftyp signature');
          toast.error('Download failed', { description: 'Invalid MP4 file' });
          setDownloadingVariant(null);
          return;
        }
      }

      console.log('[DV] ✓ Valid file:', { format, size: blob.size, type: blob.type });

      const url = URL.createObjectURL(blob);
      const filename = format === '1080p' ? 'ProfitShieldAI-demo-1080p.mp4'
                     : format === '720p' ? 'ProfitShieldAI-demo-720p.mp4'
                     : format === 'shopify' ? 'ProfitShieldAI-app-store-1600x900.mp4'
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
      const msg = isTimeout 
        ? 'Request timed out. Try refresh or check network.' 
        : (err?.message || 'Unknown error');
      
      console.error('[DV] Download error:', err);
      toast.error('Download error', { description: msg });
      // Don't rethrow - prevents DevTools pause spiral
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

  // Self-test function
  const runSelfTest = async () => {
    if (!jobId) return;
    
    console.info('[DV-TEST] ===== SELF TEST START =====');
    setTestResults({ running: true, tests: [] });
    
    const embedded = isEmbedded();
    const token = embedded ? await getShopifySessionToken({ timeoutMs: 5000 }) : null;
    
    if (embedded && !token) {
      toast.error('No Shopify session token available for test');
      setTestResults({ running: false, tests: [] });
      return;
    }
    
    const results = [];
    
    for (const variant of VARIANTS) {
      console.info(`[DV-TEST] Testing ${variant.id}...`);
      
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (embedded) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        
        const res = await fetchWithTimeout('/api/functions/demoVideoProxyDownload', {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ jobId, format: variant.id })
        }, 15000);

        const status = res.status;
        const contentType = res.headers.get('content-type');
        const contentLength = res.headers.get('content-length');
        
        const blob = res.ok ? await res.blob() : null;
        
        const pass = res.ok && blob && blob.size > 10000;
        
        results.push({
          variant: variant.id,
          pass,
          status,
          contentType,
          contentLength: blob ? blob.size : parseInt(contentLength || '0'),
          error: res.ok ? null : await res.text()
        });
        
        console.info(`[DV-TEST] ${variant.id}: ${pass ? '✓ PASS' : '✗ FAIL'}`);
        
      } catch (err) {
        results.push({
          variant: variant.id,
          pass: false,
          error: err.message
        });
        console.error(`[DV-TEST] ${variant.id}: ✗ FAIL -`, err.message);
      }
    }
    
    setTestResults({ running: false, tests: results });
    
    const allPass = results.every(r => r.pass);
    console.info(`[DV-TEST] ===== RESULT: ${allPass ? 'ALL PASS ✓' : 'SOME FAILED ✗'} =====`);
    
    if (allPass) {
      toast.success('All tests passed ✓');
    } else {
      toast.error('Some tests failed - check console');
    }
  };

  const isGenerating = generateMutation.isPending;
  const isReady = jobStatus === 'completed';

  return (
    <div className="space-y-6">
      {/* AI Scripting Assistant */}
      <AIScriptingAssistant 
        onScriptGenerated={(script) => {
          console.log('[DV] AI Script generated:', script);
          toast.success('Script ready! Use it to customize your video generation.');
        }}
      />

      {/* Advanced Download Options */}
      {jobId && jobStatus === 'completed' && (
        <AdvancedDownloadOptions 
          onDownload={(opts) => {
            console.log('[DV] Advanced download:', opts);
            downloadVariant(opts.format);
          }}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-600" />
            AI Demo Video Generator
          </CardTitle>
          <CardDescription>
            Generate professional demo videos powered by AI
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
        {/* Version Selection */}
        <div className="space-y-2">
          <Label>Video Length</Label>
          <div className="flex gap-2">
            {['60s', '90s', '120s'].map(v => (
              <Button
                key={v}
                variant={selectedVersion === v ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedVersion(v)}
                disabled={isGenerating}
              >
                {v}
              </Button>
            ))}
          </div>
        </div>

        {/* Options */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="voiceover">Include Voiceover</Label>
            <Switch
              id="voiceover"
              checked={includeVoiceover}
              onCheckedChange={setIncludeVoiceover}
              disabled={isGenerating}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="music">Include Music</Label>
            <Switch
              id="music"
              checked={includeMusic}
              onCheckedChange={setIncludeMusic}
              disabled={isGenerating}
            />
          </div>

          {isResolved && (
            <div className="flex items-center justify-between">
              <Label htmlFor="demo">Use Demo Data</Label>
              <Switch
                id="demo"
                checked={useDemoData}
                onCheckedChange={setUseDemoData}
                disabled={isGenerating}
              />
            </div>
          )}
        </div>

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="w-full"
          size="lg"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Generate Video
            </>
          )}
        </Button>

        {/* Status */}
        {jobId && (
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {jobStatus === 'completed' ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : jobStatus === 'failed' ? (
                  <AlertCircle className="w-4 h-4 text-red-600" />
                ) : (
                  <Clock className="w-4 h-4 text-blue-600" />
                )}
                <span className="text-sm font-medium capitalize">{jobStatus || 'Unknown'}</span>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshStatus}
                disabled={statusMutation.isPending}
              >
                {statusMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
              </Button>
            </div>

            {/* Download Buttons — CLICK-SAFE (forced above overlays) */}
            {isReady && (
              <div className="space-y-3 relative z-[9999]">
                <Label>Download Formats</Label>
                <div className="space-y-3 relative z-[9999]">
                  {VARIANTS.map((variant) => {
                    const isDownloading = downloadingVariant === variant.id;

                    return (
                      <Button
                        key={variant.id}
                        type="button"
                        variant="outline"
                        className="w-full justify-between h-auto py-4 text-left relative z-[9999] pointer-events-auto"
                        disabled={isDownloading}
                        onPointerDownCapture={() => console.info('[DV][BTN] pointerdown', variant.id)}
                        onClick={() => downloadVariant(variant.id)}
                      >
                        <div className="flex-1">
                          <div className="font-semibold">{variant.label}</div>
                          <div className="text-sm text-slate-500">{variant.description}</div>
                        </div>

                        {isDownloading ? (
                          <Loader2 className="w-4 h-4 animate-spin text-emerald-600 ml-3" />
                        ) : (
                          <Download className="w-4 h-4 text-emerald-600 ml-3" />
                        )}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* Self-Test Panel — also forced above overlays */}
            {isReady && (
              <div className="pt-4 border-t space-y-3 relative z-[9999] pointer-events-auto">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  className="relative z-[9999] pointer-events-auto"
                  onPointerDownCapture={() => console.info('[DV][BTN] pointerdown', 'self-test')}
                  onClick={() => runSelfTest()}
                  disabled={downloadingVariant || testResults?.running}
                >
                  {testResults?.running ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin mr-2" />
                      Running Test...
                    </>
                  ) : (
                    'Run Download Test'
                  )}
                </Button>

                {testResults && !testResults.running && (
                  <div className="text-xs space-y-1 bg-slate-50 p-3 rounded">
                    {testResults.tests.map((t, i) => (
                      <div key={i} className={t.pass ? 'text-green-700' : 'text-red-700'}>
                        {t.pass ? '✓' : '✗'} {t.variant}: {t.pass ? `${(t.contentLength / 1_000_000).toFixed(2)}MB` : t.error}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  </div>
  );
}