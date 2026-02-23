import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Video, Download, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function VideoJobNotifications() {
  const [lastChecked, setLastChecked] = useState(Date.now());

  useEffect(() => {
    const checkForUpdates = async () => {
      try {
        const jobs = await base44.entities.DemoVideoJob.filter({
          updated_date: { $gte: new Date(lastChecked).toISOString() }
        }, '-updated_date', 10);

        jobs.forEach(job => {
          if (job.status === 'completed' && new Date(job.updated_date) > new Date(lastChecked)) {
            toast.success(
              <div>
                <p className="font-medium">Video Generated Successfully!</p>
                <p className="text-sm text-slate-600 mt-1">Job #{job.id.slice(0, 8)} is ready to download</p>
              </div>,
              {
                icon: <CheckCircle2 className="w-5 h-5 text-green-600" />,
                duration: 8000,
                action: {
                  label: 'View',
                  onClick: () => window.location.href = '/VideoJobs',
                },
              }
            );
          } else if (job.status === 'failed' && new Date(job.updated_date) > new Date(lastChecked)) {
            toast.error(
              <div>
                <p className="font-medium">Video Generation Failed</p>
                <p className="text-sm text-slate-600 mt-1">Job #{job.id.slice(0, 8)}: {job.error_message}</p>
              </div>,
              {
                icon: <XCircle className="w-5 h-5 text-red-600" />,
                duration: 10000,
                action: {
                  label: 'Retry',
                  onClick: async () => {
                    await base44.entities.DemoVideoJob.update(job.id, {
                      status: 'queued',
                      error_message: null,
                      retry_count: (job.retry_count || 0) + 1,
                    });
                    toast.success('Job queued for retry');
                  },
                },
              }
            );
          }
        });

        setLastChecked(Date.now());
      } catch (err) {
        console.error('[VideoJobNotifications] Error:', err);
      }
    };

    const interval = setInterval(checkForUpdates, 10000);
    return () => clearInterval(interval);
  }, [lastChecked]);

  return null;
}