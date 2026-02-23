import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Video, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  RefreshCw,
  X,
  Download,
  AlertCircle,
  Share2
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import ShareVideoDialog from '@/components/video/ShareVideoDialog';
import VideoJobNotifications from '@/components/notifications/VideoJobNotifications';

const statusConfig = {
  queued: { icon: Clock, color: 'bg-blue-100 text-blue-700', label: 'Queued' },
  rendering: { icon: Loader2, color: 'bg-yellow-100 text-yellow-700', label: 'Rendering', spin: true },
  completed: { icon: CheckCircle2, color: 'bg-green-100 text-green-700', label: 'Completed' },
  failed: { icon: XCircle, color: 'bg-red-100 text-red-700', label: 'Failed' },
  cancelled: { icon: X, color: 'bg-gray-100 text-gray-700', label: 'Cancelled' },
};

export default function VideoJobs() {
  const queryClient = useQueryClient();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareVideoUrl, setShareVideoUrl] = useState('');
  const [shareJobId, setShareJobId] = useState('');

  const { data: jobs = [], isLoading, refetch } = useQuery({
    queryKey: ['videoJobs'],
    queryFn: async () => {
      const jobs = await base44.entities.DemoVideoJob.list('-created_date', 50);
      return jobs || [];
    },
    refetchInterval: autoRefresh ? 5000 : false,
  });

  const retryMutation = useMutation({
    mutationFn: async (jobId) => {
      const job = await base44.entities.DemoVideoJob.get(jobId);
      await base44.entities.DemoVideoJob.update(jobId, {
        status: 'queued',
        retry_count: (job.retry_count || 0) + 1,
        error_message: null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videoJobs'] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (jobId) => {
      await base44.entities.DemoVideoJob.update(jobId, { status: 'cancelled' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videoJobs'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (jobId) => {
      await base44.entities.DemoVideoJob.delete(jobId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videoJobs'] });
    },
  });

  const queuedCount = jobs.filter(j => j.status === 'queued').length;
  const renderingCount = jobs.filter(j => j.status === 'rendering').length;
  const completedCount = jobs.filter(j => j.status === 'completed').length;
  const failedCount = jobs.filter(j => j.status === 'failed').length;

  const handleDownload = async (format, jobId) => {
    try {
      const response = await base44.functions.invoke('demoVideoProxyDownload', {
        jobId,
        format
      });

      // If response contains a URL for redirect mode (demo videos)
      if (response.data?.mode === 'redirect' && response.data?.url) {
        const a = document.createElement('a');
        a.href = response.data.url;
        a.download = response.data.filename || `ProfitShieldAI-${format}.mp4`;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast.success('Download started');
        return;
      }

      // Otherwise handle as blob (real mode videos)
      const blob = new Blob([response.data], { 
        type: format === 'thumb' ? 'image/jpeg' : 'video/mp4' 
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = format === 'thumb' ? 'ProfitShieldAI-thumb.jpg' : `ProfitShieldAI-${format}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Download started');
    } catch (err) {
      toast.error('Download failed: ' + (err.message || 'Unknown error'));
    }
  };

  const handleShare = (videoUrl, jobId) => {
    setShareVideoUrl(videoUrl);
    setShareJobId(jobId);
    setShareDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <VideoJobNotifications />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Video Jobs</h1>
          <p className="text-slate-500 mt-1">Manage and monitor video generation tasks</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="autoRefresh"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="autoRefresh" className="text-sm text-slate-600">Auto-refresh</label>
          </div>
          <Button onClick={() => refetch()} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Queued</p>
                <p className="text-2xl font-bold text-blue-600">{queuedCount}</p>
              </div>
              <Clock className="w-8 h-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Rendering</p>
                <p className="text-2xl font-bold text-yellow-600">{renderingCount}</p>
              </div>
              <Loader2 className="w-8 h-8 text-yellow-400 animate-spin" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Completed</p>
                <p className="text-2xl font-bold text-green-600">{completedCount}</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Failed</p>
                <p className="text-2xl font-bold text-red-600">{failedCount}</p>
              </div>
              <XCircle className="w-8 h-8 text-red-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Jobs List */}
      <div className="space-y-4">
        {jobs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Video className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No video jobs yet</p>
            </CardContent>
          </Card>
        ) : (
          jobs.map((job) => {
            const config = statusConfig[job.status] || statusConfig.queued;
            const Icon = config.icon;

            return (
              <Card key={job.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge className={config.color}>
                          <Icon className={`w-3 h-3 mr-1 ${config.spin ? 'animate-spin' : ''}`} />
                          {config.label}
                        </Badge>
                        <Badge variant="outline" className="capitalize">{job.mode}</Badge>
                        <Badge variant="outline">{job.version}</Badge>
                      </div>
                      <CardTitle className="text-lg">Job #{job.id.slice(0, 8)}</CardTitle>
                      <CardDescription className="mt-1">
                        Created {format(new Date(job.created_date), 'MMM d, yyyy HH:mm')}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {job.status === 'failed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => retryMutation.mutate(job.id)}
                          disabled={retryMutation.isPending}
                        >
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Retry
                        </Button>
                      )}
                      {job.status === 'queued' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => cancelMutation.mutate(job.id)}
                          disabled={cancelMutation.isPending}
                        >
                          <X className="w-4 h-4 mr-2" />
                          Cancel
                        </Button>
                      )}
                      {(job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(job.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Progress Bar */}
                  {(job.status === 'queued' || job.status === 'rendering') && (
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-slate-600">Progress</span>
                        <span className="text-sm font-medium text-slate-900">{job.progress || 0}%</span>
                      </div>
                      <Progress value={job.progress || 0} className="h-2" />
                    </div>
                  )}

                  {/* Error Message */}
                  {job.status === 'failed' && job.error_message && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-red-900">Error</p>
                        <p className="text-sm text-red-700 mt-1">{job.error_message}</p>
                        {job.retry_count > 0 && (
                          <p className="text-xs text-red-600 mt-1">Retry attempts: {job.retry_count}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Download Buttons */}
                  {job.status === 'completed' && job.outputs && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-medium text-slate-900">Available Downloads</p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleShare(job.outputs['1080p']?.url || job.outputs['720p']?.url, job.id)}
                          className="gap-2"
                        >
                          <Share2 className="w-3 h-3" />
                          Share
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {Object.entries(job.outputs).map(([format, output]) => {
                          if (!output?.url) return null;
                          return (
                            <Button
                              key={format}
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownload(format, job.id)}
                              className="w-full"
                            >
                              <Download className="w-3 h-3 mr-2" />
                              {format === '1080p' ? '1080p' : format === '720p' ? '720p' : format === 'shopify' ? 'Shopify' : 'Thumb'}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Job Details */}
                  <div className="mt-4 pt-4 border-t border-slate-200">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-slate-500">Tenant ID</p>
                        <p className="font-medium text-slate-900 truncate">{job.tenant_id || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Integration ID</p>
                        <p className="font-medium text-slate-900 truncate">{job.integration_id || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Options</p>
                        <p className="font-medium text-slate-900">
                          {job.options?.music && '🎵 '}
                          {job.options?.voiceover && '🎤 '}
                          {!job.options?.music && !job.options?.voiceover && 'None'}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Updated</p>
                        <p className="font-medium text-slate-900">{format(new Date(job.updated_date), 'HH:mm:ss')}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <ShareVideoDialog
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        videoUrl={shareVideoUrl}
        jobId={shareJobId}
      />
    </div>
  );
}