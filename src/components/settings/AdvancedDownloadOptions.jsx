import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

const VARIANTS = [
  { id: "1080p", label: "Full HD (1920x1080)" },
  { id: "720p", label: "HD (1280x720)" },
  { id: "shopify", label: "Shopify App Store" },
  { id: "thumb", label: "Thumbnail (JPEG)" },
];

export default function AdvancedDownloadOptions({
  jobId,
  jobStatus,
  outputs,
  embedded,
  shopifyToken,
  tokenLoading,
  tokenError,
  tenantId,
  onDownload,
}) {
  const [format, setFormat] = useState("1080p");
  const [directExternal, setDirectExternal] = useState(false);
  const [busy, setBusy] = useState(false);

  const available = useMemo(() => {
    const keys = outputs && typeof outputs === "object" ? Object.keys(outputs) : [];
    return new Set(keys);
  }, [outputs]);

  const canDownload = !!jobId && jobStatus === "completed" && !!onDownload;

  const handleDownloadWithSettings = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();

    if (!canDownload) {
      toast.error("Video not ready", { description: `Current status: ${jobStatus || "unknown"}` });
      return;
    }

    if (embedded && !shopifyToken) {
      const reason =
        tokenError || (tokenLoading ? "Still initializing Shopify auth..." : "Token retrieval failed");
      toast.error("Shopify auth not initialized", { description: reason });
      return;
    }

    setBusy(true);
    try {
      await onDownload(format, e, { directExternal });
    } finally {
      setBusy(false);
    }
  };

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
          {VARIANTS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>

        {/* optional helper */}
        {jobStatus === "completed" && outputs && (
          <div className="text-xs text-slate-600">
            Available URLs:{" "}
            {available.size ? Array.from(available).join(", ") : "none (backend must populate outputs)"}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm font-medium">Use direct external download (top-level)</div>
          <div className="text-xs text-slate-500">
            Uses the stored output URL directly (may be blocked in embedded iframes).
          </div>
        </div>
        <Switch checked={directExternal} onCheckedChange={setDirectExternal} />
      </div>

      <Button
        type="button"
        onClick={handleDownloadWithSettings}
        disabled={!canDownload || busy}
        className="w-full"
        variant="outline"
      >
        {busy ? (
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