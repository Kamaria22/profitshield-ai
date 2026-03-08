import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Share2, Copy, CheckCircle2, Facebook, Twitter, Linkedin, Mail } from 'lucide-react';
import { toast } from 'sonner';

export default function ShareVideoDialog({ open, onOpenChange, videoUrl, jobId }) {
  const [copied, setCopied] = useState(false);

  const shareUrl = videoUrl || '';
  const shareText = `Check out my ProfitShield AI demo video!`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Failed to copy link');
    }
  };

  const shareToSocial = (platform) => {
    let url = '';
    switch (platform) {
      case 'twitter':
        url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
        break;
      case 'facebook':
        url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
        break;
      case 'linkedin':
        url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
        break;
      case 'email':
        url = `mailto:?subject=${encodeURIComponent('Check out this video')}&body=${encodeURIComponent(`${shareText}\n\n${shareUrl}`)}`;
        break;
    }
    
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer,width=600,height=400');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5" />
            Share Video
          </DialogTitle>
          <DialogDescription>
            Share your video on social media or copy the link
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Copy Link */}
          <div>
            <Label htmlFor="share-link">Video Link</Label>
            <div className="flex gap-2 mt-2">
              <Input
                id="share-link"
                value={shareUrl}
                readOnly
                className="flex-1"
              />
              <Button
                onClick={handleCopyLink}
                variant="outline"
                size="icon"
              >
                {copied ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Social Share Buttons */}
          <div>
            <Label>Share on Social Media</Label>
            <div className="grid grid-cols-4 gap-2 mt-2">
              <Button
                onClick={() => shareToSocial('twitter')}
                variant="outline"
                className="flex flex-col gap-1 h-auto py-3"
              >
                <Twitter className="w-5 h-5 text-blue-400" />
                <span className="text-xs">Twitter</span>
              </Button>
              <Button
                onClick={() => shareToSocial('facebook')}
                variant="outline"
                className="flex flex-col gap-1 h-auto py-3"
              >
                <Facebook className="w-5 h-5 text-blue-600" />
                <span className="text-xs">Facebook</span>
              </Button>
              <Button
                onClick={() => shareToSocial('linkedin')}
                variant="outline"
                className="flex flex-col gap-1 h-auto py-3"
              >
                <Linkedin className="w-5 h-5 text-blue-700" />
                <span className="text-xs">LinkedIn</span>
              </Button>
              <Button
                onClick={() => shareToSocial('email')}
                variant="outline"
                className="flex flex-col gap-1 h-auto py-3"
              >
                <Mail className="w-5 h-5 text-slate-600" />
                <span className="text-xs">Email</span>
              </Button>
            </div>
          </div>

          {/* Direct Download Option */}
          <div>
            <Button
              onClick={() => {
                const a = document.createElement('a');
                a.href = shareUrl;
                a.download = `ProfitShieldAI-${jobId?.slice(0, 8)}.mp4`;
                a.target = '_blank';
                document.body.appendChild(a);
                a.click();
                a.remove();
                toast.success('Download started');
              }}
              className="w-full"
              variant="outline"
            >
              Download Video
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
