import React, { useState, useEffect } from 'react';
import { Download, Monitor, Smartphone, Globe, Zap, Shield, Check, Play, QrCode } from 'lucide-react';
import HolographicCard from '@/components/quantum/HolographicCard';
import QuantumButton from '@/components/quantum/QuantumButton';
import { detectDevice } from '@/components/mobile/DeviceDetector';
import { APP_CONFIG } from '@/components/mobile/appConfig';
import { Badge } from '@/components/ui/badge';
import LegalFooter from '@/components/legal/LegalFooter';

// Apple icon inline (lucide doesn't include it)
const AppleIcon = () => (
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
  </svg>
);

export default function DownloadPage() {
  const [device, setDevice] = useState(null);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isPWAInstalled, setIsPWAInstalled] = useState(false);

  useEffect(() => {
    const d = detectDevice();
    setDevice(d);
    setIsPWAInstalled(d.isPWAInstalled);

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handlePWAInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    }
  };

  const features = [
    { icon: Shield, text: 'Real-time fraud protection on the go' },
    { icon: Zap, text: 'Instant push notifications' },
    { icon: Globe, text: 'Full offline functionality' },
    { icon: Monitor, text: 'Seamless sync across all devices' }
  ];

  const qrTarget = device?.isIOS
    ? APP_CONFIG.qrCode.ios(200)
    : device?.isAndroid
    ? APP_CONFIG.qrCode.android(200)
    : APP_CONFIG.qrCode.web(200);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="max-w-6xl mx-auto px-6 py-12">

        {/* Hero */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500/20 rounded-full mb-6">
            <Smartphone className="w-4 h-4 text-cyan-400" />
            <span className="text-sm text-cyan-400 font-medium">Available on All Platforms</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 mb-6">
            Download ProfitShield
          </h1>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto">
            Take your business intelligence everywhere. Install ProfitShield on mobile, desktop, or web.
          </p>
          {isPWAInstalled && (
            <div className="mt-4">
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 px-4 py-2">
                <Check className="w-4 h-4 mr-2" />
                App Already Installed
              </Badge>
            </div>
          )}
        </div>

        {/* Platform Grid */}
        <div className="grid gap-6 md:grid-cols-3 mb-12">
          {/* iOS */}
          <HolographicCard className="p-6 hover:scale-105 transition-all duration-300 cursor-pointer group">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform text-cyan-400">
                <AppleIcon />
              </div>
              <h3 className="text-xl font-bold text-white mb-1">iOS App</h3>
              <p className="text-sm text-slate-400 mb-4">iPhone & iPad — iOS 16+</p>
              <QuantumButton
                onClick={() => window.open(APP_CONFIG.appStore.ios.url, '_blank', 'noopener,noreferrer')}
                className="w-full"
                size="sm"
              >
                App Store
              </QuantumButton>
            </div>
          </HolographicCard>

          {/* Android */}
          <HolographicCard className="p-6 hover:scale-105 transition-all duration-300 cursor-pointer group">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                <Play className="w-8 h-8 text-emerald-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-1">Android App</h3>
              <p className="text-sm text-slate-400 mb-4">All Android — 10+</p>
              <QuantumButton
                onClick={() => window.open(APP_CONFIG.appStore.android.url, '_blank', 'noopener,noreferrer')}
                className="w-full"
                size="sm"
              >
                Google Play
              </QuantumButton>
            </div>
          </HolographicCard>

          {/* Desktop */}
          <HolographicCard className="p-6 hover:scale-105 transition-all duration-300 cursor-pointer group">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                <Monitor className="w-8 h-8 text-purple-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-1">Desktop App</h3>
              <p className="text-sm text-slate-400 mb-4">Windows, Mac, Linux</p>
              <QuantumButton
                className="w-full"
                size="sm"
                onClick={handlePWAInstall}
                disabled={isPWAInstalled || !deferredPrompt}
              >
                <Download className="w-4 h-4 mr-1" />
                {isPWAInstalled ? 'Installed ✓' : 'Install'}
              </QuantumButton>
            </div>
          </HolographicCard>
        </div>

        {/* Features */}
        <HolographicCard glow className="p-8 mb-12">
          <h2 className="text-2xl font-bold text-center text-cyan-400 mb-8">Why Download ProfitShield?</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <div key={i} className="text-center group">
                  <div className="w-12 h-12 bg-cyan-500/10 rounded-lg flex items-center justify-center mx-auto mb-3 group-hover:bg-cyan-500/20 transition-colors">
                    <Icon className="w-6 h-6 text-cyan-400" />
                  </div>
                  <p className="text-sm text-slate-300">{feature.text}</p>
                </div>
              );
            })}
          </div>
        </HolographicCard>

        {/* QR Codes */}
        <div className="grid md:grid-cols-2 gap-6">
          <HolographicCard scanline className="p-8">
            <div className="text-center">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center justify-center gap-2">
                <QrCode className="w-5 h-5 text-cyan-400" />
                Scan to Install
              </h3>
              <div className="w-52 h-52 bg-white rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-2xl overflow-hidden">
                <img
                  src={qrTarget}
                  alt="QR Code for ProfitShield download"
                  className="w-48 h-48"
                  loading="lazy"
                />
              </div>
              <p className="text-sm text-slate-400">Scan with your phone's camera</p>
            </div>
          </HolographicCard>

          <HolographicCard className="p-8">
            <h3 className="text-xl font-bold text-white mb-4">Quick Install Guide</h3>
            <div className="space-y-4">
              {[
                { n: '1', color: 'cyan', title: 'Chrome / Edge (Desktop)', desc: 'Click the install icon in the address bar' },
                { n: '2', color: 'purple', title: 'Safari (Mac)', desc: 'Share → Add to Dock' },
                { n: '3', color: 'emerald', title: 'Mobile Browser', desc: 'Share → Add to Home Screen' },
              ].map(item => (
                <div key={item.n} className="flex items-start gap-3">
                  <div className={`w-8 h-8 bg-${item.color}-500/20 rounded-lg flex items-center justify-center flex-shrink-0`}>
                    <span className={`text-sm font-bold text-${item.color}-400`}>{item.n}</span>
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">{item.title}</p>
                    <p className="text-xs text-slate-400">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </HolographicCard>
        </div>

      </div>
      <LegalFooter />
    </div>
  );
}
