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

  // Download video with iframe-safe handling
  const downloadVideo = useCallback(async (jid, variant) => {
    try {
      setIsDownloading(true);
      console.log(`[DemoVideoGenerator] Downloading ${variant} for job ${jid}`);
      
      // Try direct download endpoint
      try {
        const { data } = await base44.functions.invoke('demoVideoDownload', {
          jobId: jid,
          variant: variant
        });

        if (data?.method === 'redirect' && data?.downloadUrl) {
          window.open(data.downloadUrl, '_blank', 'noopener,noreferrer');
          toast.success(`Opening ${variant} download...`);
          return;
        }
      } catch (e) {
        console.warn('[DemoVideoGenerator] Direct download failed, trying proxy:', e.message);
      }

      // Fallback: proxy download
      const { data: proxyData } = await base44.functions.invoke('demoVideoProxyDownload', {
        jobId: jid,
        format: variant
      });

      if (proxyData && typeof proxyData === 'object' && proxyData.byteLength > 100) {
        const blob = new Blob([proxyData], { type: getMimeType(variant) });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = getFileName(variant);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 100);
        toast.success(`${variant} downloaded!`);
      } else {
        throw new Error('No valid video data');
      }
    } catch (error) {
      console.error('[DemoVideoGenerator] Download error:', error);
      toast.error(`Download failed: ${error.message}`);
    } finally {
      setIsDownloading(false);
    }
  }, []);

  const getFileName = (format) => {
    const fileMap = {
      '1080p': 'ProfitShieldAI-demo-1080p.mp4',
      '720p': 'ProfitShieldAI-demo-720p.mp4',
      'shopify': 'ProfitShieldAI-app-store.mp4',
      'thumb': 'ProfitShieldAI-thumb.jpg'
    };
    return fileMap[format] || 'demo-video.mp4';
  };

  const getMimeType = (format) => {
    return format === 'thumb' ? 'image/jpeg' : 'video/mp4';
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

  // Poll status
  const statusMutation = useMutation({
    mutationFn: async (jid) => {
      console.log('[DemoVideoGenerator] Polling job:', jid);
      const { data } = await base44.functions.invoke('demoVideoGetStatus', {
        jobId: jid
      });
      return data;
    },
    onSuccess: (data) => {
      if (!data.ok) return;
      
      console.log('[DemoVideoGenerator] Status:', data.status, 'outputs:', Object.keys(data.outputs || {}));
      setJobStatus(data.status);
      const elapsed = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
      setPollWaitTime(elapsed);

      if (data.status === 'completed' && data.outputs) {
        console.log('[DemoVideoGenerator] ✓ Completed with outputs');
        setGeneratedVideo(prev => ({
          ...(prev || {}),
          status: 'completed',
          progress: 100,
          outputs: data.outputs
        }));
        setDownloadLinks(data.outputs);
        setIsPolling(false);
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        toast.success('Video rendering complete!');
      } else if (data.status === 'failed') {
        console.error('[DemoVideoGenerator] ✗ Failed:', data.errorMessage);
        setIsPolling(false);
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        toast.error(data.errorMessage || 'Rendering failed');
      }
    },
    onError: (error) => {
      console.error('[DemoVideoGenerator] Poll error:', error.message);
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
    { id: '1080p', label: 'Full HD (1920x1080)', description: 'YouTube, marketing materials' },
    { id: '720p', label: 'HD (1280x720)', description: 'Web, social media' },
    { id: 'shopify', label: 'Shopify App Store (1600x900)', description: 'App marketplace' },
    { id: 'thumb', label: 'Thumbnail (JPEG)', description: 'Preview image' }
  ];

  const isReady = jobStatus === 'completed' && downloadLinks && Object.keys(downloadLinks).length > 0;

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

      {/* Download Card */}
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
              <Label className="text-slate-900 font-semibold">Video Files</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {renderVariants.map(variant => (
                  <Button
                    key={variant.id}
                    onClick={() => downloadVideo(jobId, variant.id)}
                    disabled={isDownloading}
                    variant="outline"
                    className="justify-start text-left h-auto py-3 border-green-300 hover:bg-green-100"
                  >
                    <div className="text-left flex-1">
                      <div className="font-semibold text-sm">Download {variant.label}</div>
                      <div className="text-xs text-slate-600">{variant.description}</div>
                    </div>
                    <Download className="w-4 h-4 ml-2 flex-shrink-0" />
                  </Button>
                ))}
              </div>

              {/* Fallback: Show links if available */}
              {downloadLinks && Object.keys(downloadLinks).length > 0 && (
                <div className="pt-3 border-t border-green-200">
                  <Label className="text-xs text-slate-600">Direct Links</Label>
                  <div className="space-y-1 mt-2">
                    {Object.entries(downloadLinks).map(([key, url]) => (
                      url && (
                        <div key={key} className="flex items-center gap-2 text-xs">
                          <span className="text-slate-600 capitalize">{key}:</span>
                          {url.startsWith('http') ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-600 hover:underline break-all"
                            >
                              {url.substring(0, 50)}...
                            </a>
                          ) : (
                            <span className="text-slate-600 break-all">{url.substring(0, 50)}...</span>
                          )}
                        </div>
                      )
                    ))}
                  </div>
                </div>
              )}
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