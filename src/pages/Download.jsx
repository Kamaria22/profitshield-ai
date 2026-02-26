import React, { useState, useEffect } from 'react';
import { Download, Monitor, Smartphone, Globe, Zap, Shield, Check, Apple, Play, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import HolographicCard from '@/components/quantum/HolographicCard';
import QuantumButton from '@/components/quantum/QuantumButton';
import AppStoreButtons from '@/components/mobile/AppStoreButtons';
import { detectDevice, getRecommendedDownload } from '@/components/mobile/DeviceDetector';
import { Badge } from '@/components/ui/badge';

export default function DownloadPage() {
  const [device, setDevice] = useState(null);
  const [recommended, setRecommended] = useState(null);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    setDevice(detectDevice());
    setRecommended(getRecommendedDownload());

    // Capture PWA install prompt
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
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('PWA installed');
      }
      setDeferredPrompt(null);
    }
  };

  const features = [
    { icon: Shield, text: 'Real-time fraud protection on the go' },
    { icon: Zap, text: 'Instant push notifications' },
    { icon: Globe, text: 'Full offline functionality' },
    { icon: Monitor, text: 'Seamless sync across all devices' }
  ];

  const isPWAInstalled = device?.isPWAInstalled;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500/20 rounded-full mb-6 animate-pulse">
            <Smartphone className="w-4 h-4 text-cyan-400" />
            <span className="text-sm text-cyan-400 font-medium">Available on All Platforms</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 mb-6">
            Download ProfitShield
          </h1>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto">
            Take your business intelligence everywhere. Install ProfitShield on mobile, desktop, or web.
          </p>
        </div>

        {isPWAInstalled && (
          <div className="text-center mb-8">
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 px-4 py-2">
              <Check className="w-4 h-4 mr-2" />
              App Already Installed
            </Badge>
          </div>
        )}

        {/* Recommended Download - Smart detection */}
        {recommended && !isPWAInstalled && (
          <HolographicCard glow scanline className="mb-12 p-8 text-center">
            <Badge className="mb-4 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 text-cyan-400 border-cyan-500/30 animate-pulse">
              ⚡ Recommended for {device?.isIOS ? 'iOS' : device?.isAndroid ? 'Android' : device?.isMacOS ? 'macOS' : device?.isWindows ? 'Windows' : 'Your Device'}
            </Badge>
            <h2 className="text-3xl font-bold text-white mb-6">
              {recommended.label}
            </h2>
            {(device?.isIOS || device?.isAndroid) ? (
              <AppStoreButtons />
            ) : (
              <QuantumButton
                size="lg"
                onClick={handlePWAInstall}
                icon={Download}
                className="mx-auto"
              >
                Install Desktop App
              </QuantumButton>
            )}
          </HolographicCard>
        )}

        {/* Platform Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-12">
          {/* iOS */}
          <HolographicCard className="p-6 hover:scale-105 transition-all duration-300 cursor-pointer group">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                <Apple className="w-8 h-8 text-cyan-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">iOS App</h3>
              <p className="text-sm text-slate-400 mb-4">
                iPhone & iPad
              </p>
              <QuantumButton
                onClick={() => window.open('https://apps.apple.com/app/profitshield', '_blank')}
                className="w-full"
                size="sm"
              >
                <Apple className="w-4 h-4 mr-2" />
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
              <h3 className="text-xl font-bold text-white mb-2">Android App</h3>
              <p className="text-sm text-slate-400 mb-4">
                All Android Devices
              </p>
              <QuantumButton
                onClick={() => window.open('https://play.google.com/store/apps/details?id=com.profitshield.app', '_blank')}
                className="w-full"
                size="sm"
              >
                <Play className="w-4 h-4 mr-2" />
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
              <h3 className="text-xl font-bold text-white mb-2">Desktop App</h3>
              <p className="text-sm text-slate-400 mb-4">
                Windows, Mac, Linux
              </p>
              <QuantumButton 
                className="w-full"
                size="sm"
                onClick={handlePWAInstall}
                disabled={!deferredPrompt && !isPWAInstalled}
              >
                <Download className="w-4 h-4 mr-2" />
                {isPWAInstalled ? 'Installed' : 'Install'}
              </QuantumButton>
            </div>
          </HolographicCard>
        </div>

        {/* Features Grid */}
        <HolographicCard glow className="p-8 mb-12">
          <h2 className="text-2xl font-bold text-center text-cyan-400 mb-8">
            Why Download ProfitShield?
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <div key={i} className="text-center group">
                  <div className="w-12 h-12 bg-cyan-500/10 rounded-lg flex items-center justify-center mx-auto mb-3 group-hover:bg-cyan-500/20 transition-colors">
                    <Icon className="w-6 h-6 text-cyan-400 group-hover:scale-110 transition-transform" />
                  </div>
                  <p className="text-sm text-slate-300">{feature.text}</p>
                </div>
              );
            })}
          </div>
        </HolographicCard>

        {/* QR Code & Mobile Instructions */}
        <div className="grid md:grid-cols-2 gap-6">
          <HolographicCard scanline className="p-8">
            <div className="text-center">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center justify-center gap-2">
                <QrCode className="w-5 h-5 text-cyan-400" />
                Scan to Download
              </h3>
              <div className="w-48 h-48 bg-gradient-to-br from-white to-slate-100 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-2xl">
                <div className="text-slate-400 text-sm">QR Code</div>
              </div>
              <p className="text-sm text-slate-400">
                Scan with your phone's camera to install instantly
              </p>
            </div>
          </HolographicCard>

          <HolographicCard className="p-8">
            <h3 className="text-xl font-bold text-white mb-4">Quick Install Guide</h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-cyan-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-cyan-400">1</span>
                </div>
                <div>
                  <p className="text-white font-medium">Chrome / Edge</p>
                  <p className="text-sm text-slate-400">Click install icon in address bar</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-purple-400">2</span>
                </div>
                <div>
                  <p className="text-white font-medium">Safari (Mac)</p>
                  <p className="text-sm text-slate-400">Share → Add to Dock</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-emerald-400">3</span>
                </div>
                <div>
                  <p className="text-white font-medium">Mobile</p>
                  <p className="text-sm text-slate-400">Add to Home Screen from browser menu</p>
                </div>
              </div>
            </div>
          </HolographicCard>
        </div>
      </div>
    </div>
  );
}