import React, { useEffect, useState } from 'react';
import { X, Download, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { detectDevice } from '@/components/mobile/DeviceDetector';

/**
 * MOBILE APP BANNER
 * Smart banner that detects mobile device and shows app store download
 */
export default function MobileAppBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const [platform, setPlatform] = useState(null);

  useEffect(() => {
    // Never show app-store banner inside Shopify embedded app iframe.
    try {
      const params = new URLSearchParams(window.location.search || '');
      const isEmbedded = !!(params.get('shop') && (params.get('host') || params.get('embedded') === '1'));
      if (isEmbedded) return;
    } catch {}

    // Check if already dismissed
    const dismissed = Number(localStorage.getItem('mobile_banner_dismissed') || 0);
    const DISMISS_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
    if (dismissed && (Date.now() - dismissed) < DISMISS_TTL) return;
    if (dismissed && (Date.now() - dismissed) >= DISMISS_TTL) {
      localStorage.removeItem('mobile_banner_dismissed');
    }

    const device = detectDevice();
    // Show install banner only on phones (not tablets/desktop).
    if (!device.isMobile || device.isTablet) return;

    if (device.isIOS) {
      setPlatform('ios');
      setIsVisible(true);
    } else if (device.isAndroid) {
      setPlatform('android');
      setIsVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('mobile_banner_dismissed', Date.now().toString());
  };

  const handleDownload = () => {
    if (platform === 'ios') {
      window.location.href = 'https://apps.apple.com/app/profitshield-ai/id6741820887';
    } else if (platform === 'android') {
      window.location.href = 'https://play.google.com/store/apps/details?id=ai.profitshield.app';
    }
  };

  if (!isVisible || !platform) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-r from-cyan-600 to-purple-600 text-white shadow-2xl animate-slide-up pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center flex-shrink-0">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <p className="font-bold text-sm">Get the ProfitShield App</p>
            <p className="text-xs text-white/80">
              {platform === 'ios' ? 'Download from App Store' : 'Get it on Google Play'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleDownload}
            className="bg-white text-cyan-600 hover:bg-white/90 font-bold"
          >
            <Download className="w-4 h-4 mr-1" />
            Install
          </Button>
          <button
            onClick={handleDismiss}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            aria-label="Dismiss banner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
