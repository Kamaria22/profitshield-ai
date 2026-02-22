import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

const OPTIONS = [
  { value: "1080p", label: "Full HD (1920x1080)" },
  { value: "720p", label: "HD (1280x720)" },
  { value: "shopify", label: "Shopify App Store" },
  { value: "thumb", label: "Thumbnail (JPEG)" },
];

export default function AdvancedDownloadOptions({
  embedded,
  shopifyToken,
  tokenLoading,
  tokenError,
  jobId,
  jobStatus,
  availableFormats,
  onDownload,
}) {
  const [format, setFormat] = useState("1080p");
  const [useDirectExternal, setUseDirectExternal] = useState(false);

  const formatAvailable = useMemo(() => {
    if (!Array.isArray(availableFormats)) return true;
    return availableFormats.includes(format);
  }, [availableFormats, format]);

  const handleDownloadWithSettings = () => {
    if (!jobId) {
      toast.error("No job yet", { description: 'Generate a video first.' });
      return;
    }
    if (jobStatus !== "completed") {
      toast.error("Video not ready", { description: `Current status: ${jobStatus || "unknown"}` });
      return;
    }

    if (Array.isArray(availableFormats) && !formatAvailable) {
      toast.error("Format not available for this job", {
        description: `Available: ${availableFormats.join(", ")}`,
      });
      return;
    }

    if (embedded && !shopifyToken) {
      const reason =
        tokenError || (tokenLoading ? "Still initializing Shopify auth..." : "Token retrieval failed");
      toast.error("Shopify auth not initialized", { description: reason, duration: 5000 });
      return;
    }

    // “Use direct external download” is a UI setting — real behavior depends on server.
    // We still call onDownload(format) to ensure it actually downloads.
    if (useDirectExternal) {
      toast.info("Direct external mode enabled", {
        description: "If Shopify blocks iframe downloads, we’ll open in a new tab when possible.",
      });
    }

    if (typeof onDownload === "function") {
      onDownload(format);
    } else {
      toast.error("Advanced download not wired", { description: "onDownload handler missing." });
    }
  };

  return (
    <Card className="border-slate-200">
      <CardContent className="pt-4 space-y-4">
        <div className="text-sm font-medium">Advanced Download</div>

        <div className="space-y-2">
          <Label>Format</Label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
          >
            {OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {Array.isArray(availableFormats) && !formatAvailable && (
            <div className="text-xs text-amber-700">
              This format wasn’t generated for this job. Available: {availableFormats.join(", ")}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Switch checked={useDirectExternal} onCheckedChange={setUseDirectExternal} />
          <Label>Use direct external download (top-level)</Label>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleDownloadWithSettings}
          disabled={!jobId || jobStatus !== "completed"}
        >
          Download with Settings
        </Button>
      </CardContent>
    </Card>
  );
}