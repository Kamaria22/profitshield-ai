import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { requireResolved } from '@/components/usePlatformResolver';
import { 
  Video, 
  Download, 
  Play, 
  FileText, 
  Image as ImageIcon, 
  Loader2,
  CheckCircle,
  AlertCircle,
  Sparkles,
  Clock,
  Film,
  Store,
  Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/components/platformContext';
import { toast } from 'sonner';

export default function DemoVideoGenerator({ resolver = {} }) {
  // Safe resolver check - works with or without store connection
  let tenantId = null;
  let isResolved = false;
  try {
    const resolverCheck = requireResolved(resolver);
    tenantId = resolverCheck.tenantId;
    isResolved = true;
  } catch (e) {
    // Not resolved - will use demo data
    isResolved = false;
  }

  const [selectedVersion, setSelectedVersion] = useState('90s');
  const [includeVoiceover, setIncludeVoiceover] = useState(true);
  const [includeMusic, setIncludeMusic] = useState(true);
  const [useDemoData, setUseDemoData] = useState(!isResolved);
  const [generatedVideo, setGeneratedVideo] = useState(null);

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
      id: '2m',
      name: '2-Minute Investor Pitch',
      duration: '2:00',
      description: 'Market opportunity and growth metrics for investors',
      target: 'VCs and strategic partners',
      icon: '💼'
    }
  ];

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data } = await base44.functions.invoke('demoVideoGenerator', {
        tenantId: useDemoData ? null : tenantId,
        version: selectedVersion,
        includeVoiceover,
        includeMusic,
        useDemoData
      });
      return data;
    },
    onSuccess: (data) => {
      if (!data.success) {
        throw new Error(data.message || 'Generation failed');
      }
      setGeneratedVideo(data);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to generate video');
    }
  });

  const handleGenerate = () => {
    setGeneratedVideo(null);
    generateMutation.mutate();
  };

  const downloadFile = (url, filename) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
              <Film className="w-6 h-6 text-white" />
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
                  <p className="text-xs text-slate-500">Ambient tech soundtrack</p>
                </div>
                <Switch
                  id="music"
                  checked={includeMusic}
                  onCheckedChange={setIncludeMusic}
                />
              </div>
            </div>
          </div>

          {/* Info Alert */}
          <Alert>
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <AlertDescription className="text-sm">
              <strong>Fully Automated:</strong> This generates sanitized demo data, AI-written script, 
              professional voiceover, animated UI walkthrough, and exports in multiple formats.
            </AlertDescription>
          </Alert>

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
            onClick={handleGenerate}
            disabled={generateMutation.isPending}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
            size="lg"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Generating Demo Video...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 mr-2" />
                Generate Demo Video
              </>
            )}
          </Button>

          {/* Error Display */}
          {generateMutation.isError && (
            <Alert variant="destructive">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>
                {generateMutation.error?.message || 'Failed to generate video. Please try again.'}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Generated Video Results */}
      {generatedVideo && (
        <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-6 h-6 text-emerald-600" />
              <CardTitle className="text-emerald-900">Video Generated Successfully!</CardTitle>
            </div>
            <CardDescription className="text-emerald-700">
              Your demo video is ready for download in multiple formats
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="video" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="video">Video Files</TabsTrigger>
                <TabsTrigger value="script">Script</TabsTrigger>
                <TabsTrigger value="data">Demo Data</TabsTrigger>
              </TabsList>

              <TabsContent value="video" className="space-y-4 mt-4">
                {/* Video Preview */}
                <div className="aspect-video bg-slate-900 rounded-lg overflow-hidden relative">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Play className="w-16 h-16 text-white/50" />
                  </div>
                  <img 
                    src={generatedVideo.video?.thumbnail} 
                    alt="Video thumbnail"
                    className="w-full h-full object-cover opacity-50"
                    onError={(e) => e.target.style.display = 'none'}
                  />
                </div>

                {/* Download Options */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => downloadFile(generatedVideo.downloads?.video_1080p, 'demo_1080p.mp4')}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download 1920x1080 (Full HD)
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => downloadFile(generatedVideo.downloads?.video_720p, 'demo_720p.mp4')}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download 1280x720 (HD)
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => downloadFile(generatedVideo.downloads?.video_shopify, 'demo_shopify.mp4')}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download 1600x900 (Shopify App Store)
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => downloadFile(generatedVideo.downloads?.thumbnail_png, 'thumbnail.png')}
                  >
                    <ImageIcon className="w-4 h-4 mr-2" />
                    Download Thumbnail
                  </Button>
                </div>

                {/* Video Info */}
                <div className="grid grid-cols-3 gap-4 p-4 bg-white rounded-lg">
                  <div>
                    <p className="text-xs text-slate-500">Duration</p>
                    <p className="text-lg font-semibold text-slate-900">{generatedVideo.video?.duration}s</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Scenes</p>
                    <p className="text-lg font-semibold text-slate-900">{generatedVideo.script?.scenes}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Version</p>
                    <p className="text-lg font-semibold text-slate-900 uppercase">{generatedVideo.video?.version}</p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="script" className="space-y-4 mt-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900">{generatedVideo.script?.fullScript?.title}</h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadFile(generatedVideo.downloads?.script_txt, 'script.txt')}
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      Download Script
                    </Button>
                  </div>

                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {generatedVideo.script?.fullScript?.scenes?.map((scene, idx) => (
                      <div key={idx} className="p-4 bg-white rounded-lg border border-slate-200">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline">{scene.timestamp}</Badge>
                          <span className="font-medium text-slate-900">{scene.scene}</span>
                        </div>
                        <p className="text-sm text-slate-600 mb-2">{scene.voiceover}</p>
                        <p className="text-xs text-slate-500 italic">Visual: {scene.visual}</p>
                      </div>
                    ))}
                  </div>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => downloadFile(generatedVideo.downloads?.captions_srt, 'captions.srt')}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download SRT Captions
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="data" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-white rounded-lg">
                    <p className="text-xs text-slate-500 mb-1">Revenue</p>
                    <p className="text-xl font-bold text-slate-900">
                      ${generatedVideo.dataset?.metrics?.totalRevenue?.toFixed(2) || '0.00'}
                    </p>
                  </div>
                  <div className="p-4 bg-white rounded-lg">
                    <p className="text-xs text-slate-500 mb-1">Net Profit</p>
                    <p className="text-xl font-bold text-emerald-600">
                      ${generatedVideo.dataset?.metrics?.totalProfit?.toFixed(2) || '0.00'}
                    </p>
                  </div>
                  <div className="p-4 bg-white rounded-lg">
                    <p className="text-xs text-slate-500 mb-1">Margin</p>
                    <p className="text-xl font-bold text-slate-900">
                      {generatedVideo.dataset?.metrics?.margin || '0'}%
                    </p>
                  </div>
                  <div className="p-4 bg-white rounded-lg">
                    <p className="text-xs text-slate-500 mb-1">Profit Score</p>
                    <p className="text-xl font-bold text-purple-600">
                      {generatedVideo.dataset?.metrics?.profitIntegrityScore || '0'}/100
                    </p>
                  </div>
                </div>

                <Alert>
                  <AlertDescription className="text-sm">
                    All sensitive data has been sanitized for demo use. Customer emails masked, 
                    store names replaced, and billing data zeroed out.
                  </AlertDescription>
                </Alert>
              </TabsContent>
            </Tabs>

            {generatedVideo.note && (
              <Alert className="mt-4">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <AlertDescription className="text-sm text-amber-800">
                  {generatedVideo.note}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}