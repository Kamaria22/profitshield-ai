import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Download } from "lucide-react";

export default function AdvancedDownloadOptions({
  disabled,
  downloading,
  onDownload,
}) {
  const [format, setFormat] = useState("1080p");
  const [directExternal, setDirectExternal] = useState(false);

  const canClick = useMemo(() => !disabled && !downloading && !!onDownload, [
    disabled,
    downloading,
    onDownload,
  ]);

  return (
    <div className="pt-4 border-t space-y-3">
      <div className="text-sm font-medium">Advanced Download</div>

      <div className="space-y-2">
        <Label>Format</Label>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
        >
          <option value="1080p">Full HD (1920x1080)</option>
          <option value="720p">HD (1280x720)</option>
          <option value="shopify">Shopify App Store</option>
          <option value="thumb">Thumbnail (JPEG)</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <Switch checked={directExternal} onCheckedChange={setDirectExternal} />
        <Label>Use direct external download (top-level)</Label>
      </div>

      <Button
        className="w-full"
        variant="outline"
        disabled={!canClick}
        onClick={() => onDownload(format, { directExternal })}
      >
        {downloading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Downloading...
          </>
        ) : (
          <>
            <Download className="w-4 h-4 mr-2" />
            Download with Settings
          </>
        )}
      </Button>
    </div>
  );
}