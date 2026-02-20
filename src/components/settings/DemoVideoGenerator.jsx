import React, { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { requireResolved } from '@/components/usePlatformResolver';
import { usePermissions } from '@/components/usePermissions';
import { 
  Download, 
  Image as ImageIcon, 
  Loader2,
  CheckCircle,
  AlertCircle,
  Sparkles,
  Clock,
  Film,
  Store,
  Info,
  X,
  RefreshCw,
  Settings,
  TrendingUp,
  Copy,
  ExternalLink,
  Lock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { createPageUrl } from '@/components/platformContext';
import { toast } from 'sonner';

const POLLING_INTERVAL = 2000;
const MAX_WAIT_TIME = 120000;
const POLLING_TIMEOUT = 180000;

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
  const [generatedVideo, setGeneratedVideo] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pollWaitTime, setPollWaitTime] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadLinks, setDownloadLinks] = useState({});
  const pollIntervalRef = useRef(null);
  const startTimeRef = useRef(null);
  const [loadedFromCache, setLoadedFromCache] = useState(false);

  // AUTHENTICATED DOWNLOAD: Proof-based implementation with logging
  const downloadVideo = useCallback(async (jid, variant) => {
    if (!jid || !variant) {
      console.error('[DemoVideo] Invalid download request:', { jid, variant });
      toast.error('Invalid download request - missing jobId or variant');
      return;
    }
    
    try {
      setIsDownloading(true);
      
      // PROOF A: Log download click
      console.info('[DemoVideo] download-click', { 
        variant, 
        jobId: jid,
        timestamp: new Date().toISOString()
      });

      // Get the URL from downloadLinks state
      const urlKey = {
        '1080p': 'mp4_1080_url',
        '720p': 'mp4_720_url',
        '1600x900': 'mp4_shopify_url',
        'thumbnail': 'thumbnail_url'
      }[variant];

      const directUrl = downloadLinks?.[urlKey];
      
      // If URL is external (Shotstack), use top-level navigation for iframe compatibility
      if (directUrl && (directUrl.startsWith('http://') || directUrl.startsWith('https://'))) {
        console.info('[DemoVideo] download-external-url', { variant, url: directUrl });
        const targetWindow = window.top ?? window;
        targetWindow.location.href = directUrl;
        toast.success(`${variant.toUpperCase()} download started!`);
        setIsDownloading(false);
        return;
      }
      
      // Otherwise use proxy endpoint
      console.info('[DemoVideo] download-via-proxy', { variant, jobId: jid });
      const response = await base44.functions.invoke('demoVideoProxyDownload', {
        jobId: jid,
        format: variant
      });
      
      // PROOF B: Validate response
      if (!response || !response.data) {
        console.error('[DemoVideo] No data in response:', response);
        throw new Error('No data received from download endpoint');
      }
      
      console.info('[DemoVideo] Received response:', {
        dataType: typeof response.data,
        dataSize: response.data instanceof ArrayBuffer ? response.data.byteLength : 
                  response.data instanceof Blob ? response.data.size : 
                  'unknown',
        status: response.status
      });
      
      // Handle response - could be ArrayBuffer or Blob
      let blob;
      if (response.data instanceof Blob) {
        blob = response.data;
      } else if (response.data instanceof ArrayBuffer) {
        const mimeType = variant === 'thumbnail' ? 'image/jpeg' : 'video/mp4';
        blob = new Blob([response.data], { type: mimeType });
      } else {
        throw new Error('Invalid response data type');
      }
      
      const url = window.URL.createObjectURL(blob);
      const filename = getFileName(variant);
      
      console.info('[DemoVideo] download-url', { 
        variant, 
        url: url.slice(0, 60) + '...',
        filename,
        blobSize: blob.size
      });
      
      // Create temporary download link
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      
      // PROOF C: Trigger download
      console.info('[DemoVideo] Triggering download for:', filename);
      a.click();
      
      // Cleanup
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        console.info('[DemoVideo] ✓ Download complete:', variant);
        toast.success(`${variant.replace('mp4_', '').toUpperCase()} download started!`);
        setIsDownloading(false);
      }, 100);
      
    } catch (error) {
      console.error('[DemoVideo] Download error:', {
        variant,
        jobId: jid,
        error: error.message,
        stack: error.stack
      });
      
      toast.error(`Download failed: ${error.message || 'Unknown error'}`, {
        description: `Variant: ${variant}, Job: ${jid.slice(0, 8)}...`
      });
      setIsDownloading(false);
    }
  }, []);

  const getFileName = (format) => {
    const fileMap = {
      'mp4_1080': 'ProfitShieldAI-demo-1080p.mp4',
      'mp4_720': 'ProfitShieldAI-demo-720p.mp4',
      'mp4_shopify': 'ProfitShieldAI-app-store.mp4',
      'thumbnail': 'ProfitShieldAI-thumb.jpg'
    };
    return fileMap[format] || 'demo-video.mp4';
  };

  const getMimeType = (format) => {
    return format === 'thumbnail' ? 'image/jpeg' : 'video/mp4';
  };

  const versions = [
    {
      id: '60s',
      name: '60-Second App Store',
      duration: '1:00',
      description: 'Quick value proposition for Shopify App Store',
      target: 'E-commerce merchants',
      icon: '🛍️'
    },
    {
      id: '90s',
      name: '90-Second Product Hunt',
      duration: '1:30',
      description: 'Problem-solution-benefit flow for Product Hunt',
      target: 'Tech-savvy early adopters',
      icon: '🚀'
    },
    {
      id: '120s',
      name: '2-Minute Investor Pitch',
      duration: '2:00',
      description: 'Market opportunity and growth metrics for investors',
      target: 'VCs and strategic partners',
      icon: '💼'
    }
  ];

  // Phase 1: Create job
  const createJobMutation = useMutation({
    mutationFn: async () => {
      const { data } = await base44.functions.invoke('demoVideoGeneratePhase1', {
        tenantId: useDemoData ? null : tenantId,
        version: selectedVersion,
        includeVoiceover,
        includeMusic,
        useDemoData
      });
      return data;
    },
    onSuccess: (data) => {
      if (!data.ok) throw new Error(data.message || 'Job creation failed');
      setJobId(data.jobId);
      setJobStatus('queued');
      setGeneratedVideo(data.phase1Data);
      startTimeRef.current = Date.now();
      setPollWaitTime(0);
      
      // Auto-start Phase 2
      startRenderingMutation.mutate({ jobId: data.jobId });
      setIsPolling(true);
      toast.success('Script & data generated! Video rendering started...');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create job');
    }
  });

  // Phase 2: Start rendering
  const startRenderingMutation = useMutation({
    mutationFn: async ({ jobId: jid }) => {
      const { data } = await base44.functions.invoke('demoVideoRenderPhase2', {
        jobId: jid
      });
      return data;
    },
    onError: (error) => {
      console.warn('[DemoVideoGenerator] Render start error:', error.message);
    }
  });

  // Poll status - PROOF-BASED with validation
  const statusMutation = useMutation({
    mutationFn: async (jid) => {
      console.log('[DemoVideoGenerator] Polling job:', jid);
      const { data } = await base44.functions.invoke('demoVideoGetStatus', {
        jobId: jid
      });
      return data;
    },
    onSuccess: (data) => {
      if (!data.ok) {
        console.warn('[DemoVideoGenerator] Status check returned not ok:', data);
        return;
      }
      
      console.log('[DemoVideoGenerator] Status:', data.status, 'outputs:', Object.keys(data.outputs || {}));
      setJobStatus(data.status);
      const elapsed = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
      setPollWaitTime(elapsed);

      if (data.status === 'completed') {
        // VALIDATION: Ensure outputs exist and are non-empty
        if (!data.outputs || Object.keys(data.outputs).length === 0) {
          console.error('[DemoVideoGenerator] ✗ Completed but no outputs!', {
            status: data.status,
            hasOutputs: !!data.outputs,
            outputKeys: data.outputs ? Object.keys(data.outputs) : []
          });
          toast.error('Video completed but download links missing - please refresh');
          setIsPolling(false);
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          return;
        }

        // Validate each output URL is non-empty
        const outputEntries = Object.entries(data.outputs);
        const validOutputs = outputEntries.filter(([key, url]) => url && typeof url === 'string' && url.length > 0);
        
        console.log('[DemoVideoGenerator] ✓ Completed with outputs:', {
          total: outputEntries.length,
          valid: validOutputs.length,
          keys: validOutputs.map(([k]) => k)
        });

        if (validOutputs.length === 0) {
          console.error('[DemoVideoGenerator] ✗ All output URLs are empty!');
          toast.error('Download links are invalid - please regenerate');
          return;
        }

        setGeneratedVideo(prev => ({
          ...(prev || {}),
          status: 'completed',
          progress: 100,
          outputs: data.outputs
        }));
        setDownloadLinks(data.outputs);
        setIsPolling(false);
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        
        toast.success(`Video rendering complete! ${validOutputs.length} formats available`, {
          description: 'Click download buttons below'
        });
      } else if (data.status === 'failed') {
        console.error('[DemoVideoGenerator] ✗ Failed:', data.errorMessage);
        setIsPolling(false);
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        toast.error(data.errorMessage || 'Rendering failed');
      }
    },
    onError: (error) => {
      console.error('[DemoVideoGenerator] Poll error:', error.message);
      toast.error(`Status check failed: ${error.message}`);
    }
  });

  // Smart polling
  useEffect(() => {
    if (!isPolling || !jobId) return;
    
    let currentWaitTime = 0;
    const timeoutId = setTimeout(() => {
      // Initial poll
      statusMutation.mutate(jobId);
      
      // Then set interval
      pollIntervalRef.current = setInterval(() => {
        currentWaitTime += POLLING_INTERVAL;
        if (currentWaitTime > POLLING_TIMEOUT) {
          console.warn('[DemoVideoGenerator] Polling timeout');
          setIsPolling(false);
          clearInterval(pollIntervalRef.current);
          toast.error('Rendering timed out');
          return;
        }
        statusMutation.mutate(jobId);
      }, POLLING_INTERVAL);
    }, 500);

    return () => {
      clearTimeout(timeoutId);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [isPolling, jobId, statusMutation]);

  const renderVariants = [
    { id: '1080p', urlKey: 'mp4_1080_url', label: 'Full HD (1920x1080)', description: 'YouTube, marketing materials' },
    { id: '720p', urlKey: 'mp4_720_url', label: 'HD (1280x720)', description: 'Web, social media' },
    { id: '1600x900', urlKey: 'mp4_shopify_url', label: 'Shopify App Store (1600x900)', description: 'App marketplace' },
    { id: 'thumbnail', urlKey: 'thumbnail_url', label: 'Thumbnail (JPEG)', description: 'Preview image' }
  ];

  const isReady = jobStatus === 'completed' && downloadLinks && Object.keys(downloadLinks).length > 0;

  // PHASE 4: Load recent job on mount (if any)
  useEffect(() => {
    if (!loadedFromCache && !jobId) {
      console.log('[DemoVideo] Loading recent job from cache...');
      base44.functions.invoke('demoVideoLoadRecent', {})
        .then(({ data }) => {
          if (data.ok && data.job) {
            console.log('[DemoVideo] ✓ Loaded cached job:', data.job.id, 'status:', data.job.status);
            setJobId(data.job.id);
            setJobStatus(data.job.status);
            if (data.job.outputs) {
              setDownloadLinks(data.job.outputs);
            }
            if (data.job.status === 'rendering' || data.job.status === 'queued') {
              setIsPolling(true);
            }
          }
          setLoadedFromCache(true);
        })
        .catch(err => {
          console.warn('[DemoVideo] Failed to load cached job:', err.message);
          setLoadedFromCache(true);
        });
    }
  }, [loadedFromCache, jobId]);

  return (
    <div className="space-y-6">
      {/* Main Generation Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Film className="w-5 h-5" />
                Demo Video Generator
              </CardTitle>
              <CardDescription>
                Create professional marketing videos for different platforms
              </CardDescription>
            </div>
            {isReady && <Badge className="bg-green-100 text-green-800">Ready</Badge>}
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Mode Selection */}
          <div className="space-y-4">
            <Label>Video Content</Label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={useDemoData}
                  onChange={() => setUseDemoData(true)}
                  disabled={createJobMutation.isPending}
                />
                <span>Demo Data (Sample metrics)</span>
              </label>
              {isResolved && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={!useDemoData}
                    onChange={() => setUseDemoData(false)}
                    disabled={createJobMutation.isPending}
                  />
                  <span>Real Data (Your store)</span>
                </label>
              )}
            </div>
          </div>

          {/* Version Selection */}
          <div className="space-y-3">
            <Label>Video Version</Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {versions.map(v => (
                <label
                  key={v.id}
                  className={`p-3 border rounded-lg cursor-pointer transition ${
                    selectedVersion === v.id ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'
                  } ${createJobMutation.isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <input
                    type="radio"
                    value={v.id}
                    checked={selectedVersion === v.id}
                    onChange={(e) => setSelectedVersion(e.target.value)}
                    disabled={createJobMutation.isPending}
                    className="mb-2"
                  />
                  <div className="font-semibold text-sm">{v.icon} {v.name}</div>
                  <div className="text-xs text-slate-600">{v.duration} • {v.target}</div>
                </label>
              ))}
            </div>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <Label>Options</Label>
            <div className="space-y-2">
              <label className="flex items-center gap-3">
                <Switch
                  checked={includeVoiceover}
                  onCheckedChange={setIncludeVoiceover}
                  disabled={createJobMutation.isPending}
                />
                <span className="text-sm">Include voiceover narration</span>
              </label>
              <label className="flex items-center gap-3">
                <Switch
                  checked={includeMusic}
                  onCheckedChange={setIncludeMusic}
                  disabled={createJobMutation.isPending}
                />
                <span className="text-sm">Include background music</span>
              </label>
            </div>
          </div>

          {/* Generate Button */}
          <Button
            onClick={() => createJobMutation.mutate()}
            disabled={createJobMutation.isPending || isPolling}
            className="w-full bg-emerald-600 hover:bg-emerald-700"
            size="lg"
          >
            {createJobMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating job...
              </>
            ) : isPolling ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Rendering... ({Math.round(pollWaitTime / 1000)}s)
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Video
              </>
            )}
          </Button>

          {/* Status */}
          {jobStatus && (
            <Alert>
              <AlertDescription className="flex items-center justify-between">
                <span>
                  {jobStatus === 'completed' ? '✓ Video rendering complete!' : 
                   jobStatus === 'failed' ? '✗ Rendering failed' :
                   `• ${jobStatus.charAt(0).toUpperCase() + jobStatus.slice(1)}`}
                </span>
                {isPolling && <Loader2 className="w-4 h-4 animate-spin" />}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Download Card - PROOF-BASED IMPLEMENTATION */}
      {isReady && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-900">
              <CheckCircle className="w-5 h-5" />
              Video Generated Successfully!
            </CardTitle>
            <CardDescription className="text-green-800">
              Your demo video is ready for download in multiple formats
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-slate-900 font-semibold">Video Files</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => statusMutation.mutate(jobId)}
                  disabled={statusMutation.isPending}
                  className="text-xs"
                >
                  {statusMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  ) : (
                    <RefreshCw className="w-3 h-3 mr-1" />
                  )}
                  Refresh Status
                </Button>
              </div>

              {/* PROOF: Each button has data-testid, proper onClick, cursor-pointer */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3" role="list">
                {renderVariants.map(variant => {
                  // Validate URL exists
                  const hasUrl = downloadLinks && downloadLinks[variant.id];
                  
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      onClick={() => downloadVideo(jobId, variant.id)}
                      disabled={isDownloading || !hasUrl}
                      data-testid={`download-${variant.id.replace('mp4_', '').replace('_', '-')}`}
                      aria-label={`Download ${variant.label}`}
                      className={`
                        flex items-center justify-between w-full
                        px-4 py-3 rounded-lg border-2
                        text-left transition-all
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2
                        ${hasUrl 
                          ? 'border-green-300 bg-white hover:bg-green-50 hover:border-green-400 cursor-pointer' 
                          : 'border-slate-200 bg-slate-50 cursor-not-allowed opacity-60'
                        }
                        ${isDownloading ? 'opacity-50 cursor-wait' : ''}
                      `}
                      role="listitem"
                    >
                      <div className="flex-1">
                        <div className="font-semibold text-sm text-slate-900">
                          Download {variant.label}
                        </div>
                        <div className="text-xs text-slate-600">
                          {variant.description}
                        </div>
                        {!hasUrl && (
                          <div className="text-xs text-red-600 mt-1">
                            URL not available - try refreshing
                          </div>
                        )}
                      </div>
                      {isDownloading ? (
                        <Loader2 className="w-4 h-4 animate-spin text-green-600 flex-shrink-0" />
                      ) : hasUrl ? (
                        <Download className="w-4 h-4 text-green-600 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Tip: Download location */}
              <div className="pt-3 border-t border-green-200">
                <p className="text-xs text-slate-600">
                  Files download directly to your device. Check your browser's downloads folder.
                </p>
                {jobId && (
                  <p className="text-xs text-slate-500 mt-1">
                    Job ID: {jobId.slice(0, 8)}...
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ERROR STATE: URLs Missing Despite Completion */}
      {jobStatus === 'completed' && (!downloadLinks || Object.keys(downloadLinks).length === 0) && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-900">
              <AlertCircle className="w-5 h-5" />
              Download URLs Missing
            </CardTitle>
            <CardDescription className="text-red-800">
              Video rendering completed but download links are not available
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-sm text-red-900">
                Job status: {jobStatus}
              </p>
              <p className="text-sm text-red-900">
                Job ID: {jobId || 'unknown'}
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  console.error('[DemoVideo] Regenerating due to missing URLs');
                  statusMutation.mutate(jobId);
                }}
                className="border-red-300 text-red-700 hover:bg-red-100"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh & Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Owner-Only: Customization Panel */}
      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Lock className="w-4 h-4" />
              Advanced Video Customization
              <Badge className="ml-auto text-xs">Owner Only</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <p className="text-slate-600">Customize brand colors, logos, messaging, and transitions for your videos.</p>
              <Button variant="outline" size="sm" disabled className="w-full">
                <Settings className="w-4 h-4 mr-2" />
                Open Customization Editor
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Owner-Only: Analytics */}
      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp className="w-4 h-4" />
              Video Performance Analytics
              <Badge className="ml-auto text-xs">Owner Only</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <p className="text-slate-600">Track views, engagement, conversion metrics for each video version.</p>
              <Button variant="outline" size="sm" disabled className="w-full">
                <TrendingUp className="w-4 h-4 mr-2" />
                View Analytics Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}