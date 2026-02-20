import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { requireResolved } from '@/components/usePlatformResolver';
import { usePermissions } from '@/components/usePermissions';
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

  // Download handler
  const downloadVariant = async (format) => {
    if (downloadingVariant || !jobId) return;
    
    setDownloadingVariant(format);

    try {
      const res = await fetch('/api/functions/demoVideoProxyDownload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ jobId, format })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = format === '1080p' ? 'ProfitShieldAI-demo-1080p.mp4'
                 : format === '720p' ? 'ProfitShieldAI-demo-720p.mp4'
                 : format === 'shopify' ? 'ProfitShieldAI-app-store.mp4'
                 : 'ProfitShieldAI-thumb.jpg';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);

      toast.success(`Downloaded ${format}`);
    } catch (err) {
      toast.error('Download failed: ' + err.message);
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

  const isGenerating = generateMutation.isPending;
  const isReady = jobStatus === 'completed';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Demo Video Generator</CardTitle>
        <CardDescription>
          Generate marketing videos for your ProfitShield AI app
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

            {/* Download Buttons */}
            {isReady && (
              <div className="space-y-3">
                <Label>Download Formats</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {VARIANTS.map(variant => {
                    const isDownloading = downloadingVariant === variant.id;

                    return (
                      <Button
                        key={variant.id}
                        type="button"
                        onClick={() => downloadVariant(variant.id)}
                        disabled={isDownloading}
                        variant="outline"
                        className="h-auto py-3 px-4 justify-start"
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex-1 text-left">
                            <div className="font-semibold text-sm">
                              {variant.label}
                            </div>
                            <div className="text-xs text-slate-600 font-normal">
                              {variant.description}
                            </div>
                          </div>
                          {isDownloading ? (
                            <Loader2 className="w-4 h-4 animate-spin ml-3" />
                          ) : (
                            <Download className="w-4 h-4 ml-3" />
                          )}
                        </div>
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}