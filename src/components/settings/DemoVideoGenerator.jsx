import React, { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { requireResolved } from '@/components/usePlatformResolver';
import { usePermissions } from '@/components/usePermissions';
import { healthAgent } from '@/components/health/HealthAgent';
import { downloadViaProxy } from '@/components/health/download';
import { refreshRemoteConfig } from '@/components/health/remoteConfig';
import { 
  Download, 
  Loader2,
  CheckCircle,
  AlertCircle,
  Sparkles,
  Clock,
  Film,
  RefreshCw,
  Settings,
  TrendingUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';

const POLLING_INTERVAL = 2000;
const MAX_POLL_TIME = 180000;

// STANDARDIZED FORMATS - must match backend exactly (no more 1600x900)
const RENDER_VARIANTS = [
  { id: '1080p', label: 'Full HD (1920x1080)', description: 'YouTube, marketing materials' },
  { id: '720p', label: 'HD (1280x720)', description: 'Web, social media' },
  { id: 'shopify', label: 'Shopify App Store', description: 'App marketplace preview' },
  { id: 'thumb', label: 'Thumbnail (JPEG)', description: 'Preview image' }
];

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
  const [downloadLinks, setDownloadLinks] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const [downloadingVariant, setDownloadingVariant] = useState(null);
  
  const pollIntervalRef = useRef(null);
  const pollStartTimeRef = useRef(null);

  // Load cached job on mount
  useEffect(() => {
    const loadCached = async () => {
      if (!isResolved || !tenantId) return;
      
      try {
        const { data } = await base44.functions.invoke('demoVideoLoadRecent', { tenant_id: tenantId });
        if (data?.job) {
          setJobId(data.job.id);
          setJobStatus(data.job.status);
          if (data.job.status === 'completed' && data.job.outputs) {
            setDownloadLinks(data.job.outputs);
          }
        }
      } catch (err) {
        console.warn('Failed to load cached job:', err.message);
      }
    };
    
    loadCached();
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
        setDownloadLinks(null);
        startPolling(data.jobId);
        toast.success('Video generation started!');
      }
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to start generation');
    }
  });

  // Status polling mutation
  const statusMutation = useMutation({
    mutationFn: async (jid) => {
      const { data } = await base44.functions.invoke('demoVideoGetStatus', { jobId: jid });
      return data;
    }
  });

  const startPolling = useCallback((jid) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    
    setIsPolling(true);
    pollStartTimeRef.current = Date.now();

    const poll = async () => {
      if (Date.now() - pollStartTimeRef.current > MAX_POLL_TIME) {
        clearInterval(pollIntervalRef.current);
        setIsPolling(false);
        toast.error('Polling timeout - refresh to check status');
        return;
      }

      try {
        const result = await statusMutation.mutateAsync(jid);
        
        if (result?.status) {
          setJobStatus(result.status);
          
          if (result.status === 'completed' && result.outputs) {
            setDownloadLinks(result.outputs);
            clearInterval(pollIntervalRef.current);
            setIsPolling(false);
            toast.success('Video ready for download!');
          } else if (result.status === 'failed') {
            clearInterval(pollIntervalRef.current);
            setIsPolling(false);
            toast.error('Video generation failed');
          }
        }
      } catch (err) {
        console.warn('Poll error:', err.message);
      }
    };

    pollIntervalRef.current = setInterval(poll, POLLING_INTERVAL);
    poll();
  }, [statusMutation]);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const handleGenerate = () => {
    const payload = {
      version: selectedVersion,
      options: {
        voiceover: includeVoiceover,
        music: includeMusic
      }
    };

    if (useDemoData || !isResolved) {
      payload.mode = 'demo';
    } else {
      payload.mode = 'real';
      payload.tenant_id = tenantId;
    }

    generateMutation.mutate(payload);
  };

  const getDownloadUrl = useCallback((variantId) => {
    if (!downloadLinks) return null;
    
    const variant = RENDER_VARIANTS.find(v => v.id === variantId);
    if (!variant) return null;

    // Check urlKey in outputs
    const url = downloadLinks[variant.urlKey];
    if (url && typeof url === 'string' && url.startsWith('http')) {
      return url;
    }

    return null;
  }, [downloadLinks]);

  const handleDownload = async (variantId) => {
    if (downloadingVariant || !jobId) return;

    console.info('===== UI DOWNLOAD BUTTON CLICKED =====');
    console.info('Variant:', variantId);
    console.info('JobId:', jobId);
    console.info('Element type: <button> with onClick handler');
    console.info('======================================');

    setDownloadingVariant(variantId);

    try {
      const cfg = await refreshRemoteConfig();
      const filename =
        variantId === '1080p'
          ? 'ProfitShieldAI-demo-1080p.mp4'
          : variantId === '720p'
          ? 'ProfitShieldAI-demo-720p.mp4'
          : variantId === 'shopify'
          ? 'ProfitShieldAI-app-store.mp4'
          : 'ProfitShieldAI-thumb.jpg';

      console.info(`[DemoVideo] Calling downloadViaProxy...`);

      const proof = await downloadViaProxy({ jobId, variant: variantId, filename });

      if (!proof.ok || (proof.bytes || 0) < cfg.minValidDownloadBytes) {
        await healthAgent.report('error', 'Download proof failed', undefined, {
          feature: 'demo_video',
          variant: variantId,
          reason: proof.error || 'unknown',
        });
        toast.error('Download failed', { description: proof.error || 'Unknown error' });
        return;
      }

      console.info(`[DemoVideo] ✓ Download complete: ${variantId} (${proof.bytes} bytes)`);
      toast.success('Download started', { description: `${variantId} • ${proof.bytes} bytes` });
    } catch (err) {
      console.error('Download error:', err);
      await healthAgent.report('error', 'Download exception', err?.stack, {
        feature: 'demo_video',
        variant: variantId,
      });
      toast.error('Download failed: ' + err.message);
    } finally {
      setDownloadingVariant(null);
    }
  };

  const handleRefreshStatus = async () => {
    if (!jobId) return;
    
    try {
      const result = await statusMutation.mutateAsync(jobId);
      
      if (result?.status) {
        setJobStatus(result.status);
        
        if (result.status === 'completed' && result.outputs) {
          setDownloadLinks(result.outputs);
          console.info('[DemoVideo] Job completed, outputs available:', Object.keys(result.outputs));
          toast.success('Status refreshed - ready for download');
        } else if (result.status === 'failed') {
          toast.error('Video generation failed');
        } else {
          toast.info(`Status: ${result.status}`);
          if (!isPolling && result.status !== 'completed' && result.status !== 'failed') {
            startPolling(jobId);
          }
        }
      }
    } catch (err) {
      toast.error('Failed to refresh status');
    }
  };

  const runSyntheticCheck = async () => {
    if (!jobId) return;

    console.info('[DemoVideo] Running synthetic check...');
    
    const synthetic = await healthAgent.runDemoVideoSyntheticCheck({
      jobId,
      fetchStatus: async () => {
        const result = await statusMutation.mutateAsync(jobId);
        return result;
      },
      tryProxyDownload: async (variant) => {
        const filename = 'synthetic-test.mp4';
        const proof = await downloadViaProxy({ jobId, variant, filename });
        return proof;
      },
    });

    if (synthetic.pass) {
      toast.success('Synthetic check PASSED', { 
        description: `Download validated: ${synthetic.proxyProof?.bytes || 0} bytes` 
      });
    } else {
      toast.error('Synthetic check FAILED', { 
        description: synthetic.pollResult?.note || 'Unknown issue' 
      });
    }
  };

  const isGenerating = generateMutation.isPending || (isPolling && (jobStatus === 'queued' || jobStatus === 'rendering'));
  const isReady = jobStatus === 'completed' && downloadLinks;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Film className="w-5 h-5" />
          Demo Video Generator
        </CardTitle>
        <CardDescription>
          Generate a professional demo video showcasing your store's performance
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Version Selection */}
        <div className="space-y-3">
          <Label>Video Length</Label>
          <div className="grid grid-cols-3 gap-2">
            {['60s', '90s', '120s'].map((ver) => (
              <button
                key={ver}
                onClick={() => setSelectedVersion(ver)}
                disabled={isGenerating}
                className={`
                  px-4 py-2 rounded-lg border-2 transition-all
                  ${selectedVersion === ver 
                    ? 'border-blue-500 bg-blue-50 text-blue-700' 
                    : 'border-slate-200 hover:border-slate-300'
                  }
                  ${isGenerating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                {ver}
              </button>
            ))}
          </div>
        </div>

        {/* Options */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="voiceover">Include AI Voiceover</Label>
            <Switch 
              id="voiceover"
              checked={includeVoiceover} 
              onCheckedChange={setIncludeVoiceover}
              disabled={isGenerating}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="music">Include Background Music</Label>
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

        {/* Status Display */}
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

            {/* Download Buttons */}
            {isReady && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Download Formats</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={runSyntheticCheck}
                    className="text-xs"
                  >
                    Run Proof Check
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {RENDER_VARIANTS.map(variant => {
                    const isDownloading = downloadingVariant === variant.id;

                    return (
                      <button
                        key={variant.id}
                        onClick={() => handleDownload(variant.id)}
                        disabled={isDownloading}
                        className={`
                          flex items-center justify-between w-full
                          px-4 py-3 rounded-lg border-2
                          text-left transition-all
                          border-green-300 bg-white hover:bg-green-50 hover:border-green-400 cursor-pointer
                          ${isDownloading ? 'opacity-50' : ''}
                        `}
                      >
                        <div className="flex-1">
                          <div className="font-semibold text-sm text-slate-900">
                            {variant.label}
                          </div>
                          <div className="text-xs text-slate-600">
                            {variant.description}
                          </div>
                          <div className="text-xs text-emerald-600 mt-1">
                            ✓ Proxy download enabled
                          </div>
                        </div>
                        {isDownloading ? (
                          <Loader2 className="w-4 h-4 animate-spin text-green-600" />
                        ) : (
                          <Download className="w-4 h-4 text-green-600" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Info Alert */}
        {!isOwner && (
          <Alert>
            <Settings className="w-4 h-4" />
            <AlertDescription>
              Demo video generation is available for store owners
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}