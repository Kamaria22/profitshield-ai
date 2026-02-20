import React, { useState } from 'react';
import { Download, Settings2, Film } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function AdvancedDownloadOptions({ onDownload }) {
  const [options, setOptions] = useState({
    format: '1080p',
    includeWatermark: false,
    compressionLevel: 'balanced',
    fileNaming: 'default'
  });

  const handleDownload = () => {
    if (onDownload) {
      onDownload(options);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-blue-600" />
          Advanced Download Options
        </CardTitle>
        <CardDescription>
          Customize video export settings
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Video Quality</Label>
          <Select 
            value={options.format} 
            onValueChange={(val) => setOptions({ ...options, format: val })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1080p">
                <div className="flex items-center gap-2">
                  <Film className="w-4 h-4" />
                  <span>1080p (Full HD)</span>
                </div>
              </SelectItem>
              <SelectItem value="720p">
                <div className="flex items-center gap-2">
                  <Film className="w-4 h-4" />
                  <span>720p (HD)</span>
                </div>
              </SelectItem>
              <SelectItem value="shopify">
                <div className="flex items-center gap-2">
                  <Film className="w-4 h-4" />
                  <span>Shopify Optimized</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Compression</Label>
          <Select 
            value={options.compressionLevel} 
            onValueChange={(val) => setOptions({ ...options, compressionLevel: val })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="high">High Quality (larger file)</SelectItem>
              <SelectItem value="balanced">Balanced (recommended)</SelectItem>
              <SelectItem value="optimized">Optimized (smaller file)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>File Naming</Label>
          <Select 
            value={options.fileNaming} 
            onValueChange={(val) => setOptions({ ...options, fileNaming: val })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">ProfitShieldAI-[format].mp4</SelectItem>
              <SelectItem value="dated">ProfitShield-[date]-[format].mp4</SelectItem>
              <SelectItem value="custom">Custom naming</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between py-2">
          <Label htmlFor="watermark" className="cursor-pointer">
            Include Watermark
          </Label>
          <Switch
            id="watermark"
            checked={options.includeWatermark}
            onCheckedChange={(checked) => setOptions({ ...options, includeWatermark: checked })}
          />
        </div>

        <Button onClick={handleDownload} className="w-full">
          <Download className="w-4 h-4 mr-2" />
          Download with Settings
        </Button>
      </CardContent>
    </Card>
  );
}