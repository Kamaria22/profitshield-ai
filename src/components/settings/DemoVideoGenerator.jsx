import React, { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { requireResolved } from '@/components/usePlatformResolver';
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
  RefreshCw
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

const POLLING_INTERVAL = 2000; // 2s initial
const MAX_WAIT_TIME = 120000; // 120s max wait
const POLLING_TIMEOUT = 180000; // 3m hard timeout

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

  const [selectedVersion, setSelectedVersion] = useState('90s');
  const [includeVoiceover, setIncludeVoiceover] = useState(true);
  const [includeMusic, setIncludeMusic] = useState(true);
  const [useDemoData, setUseDemoData] = useState(!isResolved);
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [generatedVideo, setGeneratedVideo] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pollWaitTime, setPollWaitTime] = useState(0);
  const [recentJobs, setRecentJobs] = useState([]);
  const pollIntervalRef = useRef(null);
  const startTimeRef = useRef(null);

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

  // Phase 1: Create job (fast, returns immediately with script+data)
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
      if (!data.ok) {
        throw new Error(data.message || 'Job creation failed');
      }
      setJobId(data.jobId);
      setJobStatus('queued');
      setGeneratedVideo(data.phase1Data);
      startTimeRef.current = Date.now();
      setPollWaitTime(0);
      
      // Auto-start Phase 2 rendering
      startRenderingMutation.mutate({ jobId: data.jobId });
      
      // Start polling for render completion
      setIsPolling(true);
      toast.success('Script generated! Video rendering started...');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create generation job');
      console.warn('[DemoVideoGenerator] Job creation error:', error);
    }
  });

  // Phase 2: Start rendering (async, returns immediately)
  const startRenderingMutation = useMutation({
    mutationFn: async ({ jobId: jid }) => {
      const { data } = await base44.functions.invoke('demoVideoRenderPhase2', {
        jobId: jid
      });
      return data;
    },
    onSuccess: () => {
      // Rendering started, polling will track progress
    },
    onError: (error) => {
      console.warn('[DemoVideoGenerator] Render start error:', error.message);
      toast.error('Failed to start rendering');
    }
  });

  // Poll status with resilient exponential backoff
  const statusMutation = useMutation({
    mutationFn: async (jid) => {
      console.log('[DemoVideoGenerator] Polling job:', jid);
      const { data } = await base44.functions.invoke('demoVideoGetStatus', {
        jobId: jid
      });
      console.log('[DemoVideoGenerator] Poll response - status:', data.status, 'outputs:', data.outputs);
      return data;
    },
    onSuccess: (data) => {
      if (data.ok) {
        console.log('[DemoVideoGenerator] Status update:', data.status);
        setJobStatus(data.status);
        const elapsed = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
        setPollWaitTime(elapsed);

        if (data.status === 'completed') {
          console.log('[DemoVideoGenerator] ✓ Job completed with outputs:', data.outputs);
          // Keep outputs nested in generatedVideo object
          setGeneratedVideo(prev => ({
            ...(prev || {}),
            status: 'completed',
            progress: 100,
            outputs: data.outputs || {},
            errorMessage: data.errorMessage
          }));
          setIsPolling(false);
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          
          if (data.outputs?.mp4_1080_url || data.outputs?.mp4_720_url) {
            toast.success('Video rendering complete! Ready to download.');
          } else {
            toast.info('Job complete. MP4 rendering requires Shotstack API key.');
          }
          
          // Add to recent jobs
          setRecentJobs(prev => [
            { jobId: data.jobId, version: data.version, status: 'completed', createdAt: new Date() },
            ...prev.slice(0, 4)
          ]);
        } else if (data.status === 'failed') {
          console.error('[DemoVideoGenerator] ✗ Job failed:', data.errorMessage);
          setIsPolling(false);
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          toast.error(data.errorMessage || 'Rendering failed');
        }
      }
    },
    onError: (error) => {
      console.error('[DemoVideoGenerator] Status poll error:', error.message);
    }
  });

  // Smart polling with exponential backoff + hard timeout
  useEffect(() => {
    if (!isPolling || !jobId) return;
    
    let currentInterval = POLLING_INTERVAL;
    let pollCount = 0;
    
    const doPoll = async () => {
      pollCount++;
      const elapsed = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
      console.log(`[DemoVideoGenerator] Poll #${pollCount} @ ${Math.round(elapsed / 1000)}s`);
      
      // Hard timeout at 3 min
      if (elapsed > POLLING_TIMEOUT) {
        console.error('[DemoVideoGenerator] Hard timeout (3min) reached');
        setIsPolling(false);
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        toast.error('Rendering timed out after 3 minutes. Please check back later.');
        return;
      }
      
      // Exponential backoff: increase interval after 60s
      if (elapsed > 60000 && pollCount > 15) {
        currentInterval = Math.min(10000, currentInterval + 2000);
        console.log(`[DemoVideoGenerator] Backoff increased to ${currentInterval}ms`);
      }
      
      statusMutation.mutate(jobId);
    };
    
    // Initial poll immediately
    doPoll();
    
    // Then set interval
    pollIntervalRef.current = setInterval(doPoll, currentInterval);
    
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [isPolling, jobId, statusMutation]);

  return (
    <div className="space-y-6">
      {/* Main Generator Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Film className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <CardTitle>Demo Video Generator</CardTitle>
              <CardDescription>
                Create production-ready demo videos with AI-generated scripts and real metrics
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Version Selection */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Select Video Version</Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {versions.map((version) => (
                <button
                  key={version.id}
                  onClick={() => setSelectedVersion(version.id)}
                  className={`
                    relative p-4 rounded-lg border-2 transition-all text-left
                    ${selectedVersion === version.id 
                      ? 'border-emerald-500 bg-emerald-50 shadow-md' 
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                    }
                  `}
                >
                  {selectedVersion === version.id && (
                    <CheckCircle className="absolute top-3 right-3 w-5 h-5 text-emerald-600" />
                  )}
                  <div className="text-3xl mb-2">{version.icon}</div>
                  <h3 className="font-semibold text-slate-900 mb-1">{version.name}</h3>
                  <p className="text-xs text-slate-500 mb-2">{version.description}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      <Clock className="w-3 h-3 mr-1" />
                      {version.duration}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Options */}
          <div className="space-y-3 p-4 bg-slate-50 rounded-lg">
            <Label className="text-base font-semibold">Video Options</Label>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="voiceover">AI Voiceover</Label>
                  <p className="text-xs text-slate-500">Professional AI-generated narration</p>
                </div>
                <Switch
                  id="voiceover"
                  checked={includeVoiceover}
                  onCheckedChange={setIncludeVoiceover}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="music">Background Music</Label>
                  <p className="text-xs text-slate-500">Royalty-free background music</p>
                </div>
                <Switch
                  id="music"
                  checked={includeMusic}
                  onCheckedChange={setIncludeMusic}
                />
              </div>
            </div>
          </div>

          {/* Data Source Selector */}
          {isResolved && (
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Store className="w-5 h-5 text-slate-600" />
                <div>
                  <p className="text-sm font-medium text-slate-900">Use real store metrics</p>
                  <p className="text-xs text-slate-500">Generate video with your actual data</p>
                </div>
              </div>
              <Switch checked={!useDemoData} onCheckedChange={(val) => setUseDemoData(!val)} />
            </div>
          )}

          {/* Store Connection Warning */}
          {!isResolved && (
            <Alert className="border-blue-200 bg-blue-50">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <AlertDescription className="text-blue-900">
                <strong>Demo Mode Active:</strong> No store connected. Video will use sanitized sample data.
                <Link to={createPageUrl('Integrations')} className="ml-2 underline font-medium">
                  Connect Store
                </Link>
              </AlertDescription>
            </Alert>
          )}

          {useDemoData && isResolved && (
            <Alert className="border-amber-200 bg-amber-50">
              <Info className="w-4 h-4 text-amber-600" />
              <AlertDescription className="text-amber-900">
                Using demo data mode. Toggle above to use your real store metrics.
              </AlertDescription>
            </Alert>
          )}

          {/* Generate Button */}
          <Button
            onClick={() => {
              setGeneratedVideo(null);
              setJobId(null);
              setJobStatus(null);
              setPollWaitTime(0);
              createJobMutation.mutate();
            }}
            disabled={createJobMutation.isPending || isPolling}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
            size="lg"
          >
            {createJobMutation.isPending ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Creating Job...
              </>
            ) : isPolling ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Rendering... ({Math.round(pollWaitTime / 1000)}s)
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 mr-2" />
                Generate Demo Video
              </>
            )}
          </Button>

          {/* Job Status Display with Progress */}
          {jobId && isPolling && (
            <div className="space-y-4 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-medium text-slate-900">Video Generation Progress</p>
                  <p className="text-xs text-slate-600">{Math.round(pollWaitTime / 1000)}s elapsed</p>
                </div>
                
                {/* Progress Timeline */}
                <div className="flex gap-2 text-xs">
                  <div className={`flex-1 text-center py-2 rounded ${jobStatus ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-600'}`}>
                    <p className="font-medium">1. Script</p>
                    <p className="text-xs">&lt;1s</p>
                  </div>
                  <div className={`flex-1 text-center py-2 rounded ${jobStatus && jobStatus !== 'queued' ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-600'}`}>
                    <p className="font-medium">2. Data</p>
                    <p className="text-xs">&lt;1s</p>
                  </div>
                  <div className={`flex-1 text-center py-2 rounded ${jobStatus === 'rendering' || jobStatus === 'completed' ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-600'}`}>
                    <p className="font-medium">3. Render</p>
                    <p className="text-xs">1-10s</p>
                  </div>
                  <div className={`flex-1 text-center py-2 rounded ${jobStatus === 'completed' ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-600'}`}>
                    <p className="font-medium">4. Ready</p>
                    <p className="text-xs">Download</p>
                  </div>
                </div>

                {jobStatus === 'queued' && (
                  <Alert className="border-blue-200 bg-blue-50 mt-2">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <AlertDescription className="text-blue-900">
                      Generating script and demo data...
                    </AlertDescription>
                  </Alert>
                )}
                
                {jobStatus === 'rendering' && (
                  <Alert className="border-amber-200 bg-amber-50 mt-2">
                    <Loader2 className="w-4 h-4 text-amber-600 animate-spin" />
                    <AlertDescription className="text-amber-900">
                      Video rendering in progress. You can leave and check back later.
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              {pollWaitTime > MAX_WAIT_TIME && jobStatus !== 'completed' && (
                <div className="flex gap-2">
                  <Button 
                    size="sm"
                    variant="outline"
                    onClick={() => setIsPolling(false)}
                    className="flex-1"
                  >
                    <X className="w-4 h-4 mr-1" />
                    Stop waiting
                  </Button>
                  <Button 
                    size="sm"
                    variant="ghost"
                    onClick={() => statusMutation.mutate(jobId)}
                    className="flex-1"
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    Check status
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Rendering Progress */}
          {isPolling && jobStatus && jobStatus !== 'completed' && jobStatus !== 'failed' && (
            <div className="space-y-2 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 text-sm font-medium text-blue-900">
                <Loader2 className="w-4 h-4 animate-spin" />
                Rendering in progress... ({jobStatus})
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(10, (generatedVideo?.progress || 0))}%` }}
                />
              </div>
              <p className="text-xs text-blue-700">
                {pollWaitTime > 0 && `Elapsed: ${Math.round(pollWaitTime / 1000)}s`}
              </p>
            </div>
          )}

          {/* Completion Alert */}
          {generatedVideo?.errorMessage && (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <AlertDescription className="text-amber-900">
                {generatedVideo.errorMessage}
              </AlertDescription>
            </Alert>
          )}

          {/* Error Display */}
          {createJobMutation.isError && (
            <Alert variant="destructive">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>
                {createJobMutation.error?.message || 'Failed to create job. Please try again.'}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Recent Jobs */}
      {recentJobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-slate-600" />
              Recent Renders
            </CardTitle>
            <CardDescription>Check status of previous jobs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentJobs.map((job, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Film className="w-5 h-5 text-slate-600" />
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {job.version} - {new Date(job.createdAt).toLocaleTimeString()}
                      </p>
                      <Badge variant="outline" className="text-xs capitalize">{job.status}</Badge>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => statusMutation.mutate(job.jobId)}>
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Generated Video Results */}
      {generatedVideo && (
        <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-6 h-6 text-emerald-600" />
              <CardTitle className="text-emerald-900">
                {jobStatus === 'completed' ? 'Video Generated Successfully!' : 'Script & Data Ready'}
              </CardTitle>
            </div>
            <CardDescription className="text-emerald-700">
              {jobStatus === 'completed' ? 'Your demo video is ready for download in multiple formats' : 'Script and demo data available. MP4 rendering in progress...'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="video" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="video">Video Files</TabsTrigger>
                <TabsTrigger value="data">Data</TabsTrigger>
              </TabsList>

              <TabsContent value="video" className="space-y-4 mt-4">
                {!generatedVideo.outputs?.mp4_1080_url && !generatedVideo.outputs?.mp4_720_url ? (
                  <Alert className="border-amber-200 bg-amber-50">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <AlertDescription className="text-amber-900">
                      <strong>Video files not ready yet.</strong> Script and demo data are available. Check back in a moment or refresh to download MP4 files once Shotstack rendering completes.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-3">
                    {generatedVideo.outputs?.mp4_1080_url && (
                      <Button 
                        variant="outline" 
                        className="w-full justify-start"
                        asChild
                      >
                        <a 
                          href={generatedVideo.outputs.mp4_1080_url} 
                          download="demo-video-1080p.mp4"
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download 1920x1080 (Full HD)
                        </a>
                      </Button>
                    )}
                    {generatedVideo.outputs?.mp4_720_url && (
                      <Button 
                        variant="outline" 
                        className="w-full justify-start"
                        asChild
                      >
                        <a 
                          href={generatedVideo.outputs.mp4_720_url} 
                          download="demo-video-720p.mp4"
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download 1280x720 (HD)
                        </a>
                      </Button>
                    )}
                    {generatedVideo.outputs?.mp4_shopify_url && (
                      <Button 
                        variant="outline" 
                        className="w-full justify-start"
                        asChild
                      >
                        <a 
                          href={generatedVideo.outputs.mp4_shopify_url} 
                          download="demo-video-shopify.mp4"
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download 1600x900 (Shopify App Store)
                        </a>
                      </Button>
                    )}
                    {generatedVideo.outputs?.thumbnail_url && (
                      <Button 
                        variant="outline" 
                        className="w-full justify-start"
                        asChild
                      >
                        <a 
                          href={generatedVideo.outputs.thumbnail_url} 
                          download="demo-video-thumb.jpg"
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ImageIcon className="w-4 h-4 mr-2" />
                          Download Thumbnail
                        </a>
                      </Button>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="data" className="space-y-4 mt-4">
                <div className="p-4 bg-white rounded-lg border border-slate-200">
                  <p className="text-sm text-slate-600 mb-3">Demo data used for video generation:</p>
                  <pre className="text-xs bg-slate-50 p-3 rounded overflow-auto max-h-48">
                    {JSON.stringify(generatedVideo.dataset, null, 2)}
                  </pre>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}