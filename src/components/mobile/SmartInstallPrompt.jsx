import React, { useEffect, useState } from 'react';
import { X, Download, Smartphone, Monitor } from 'lucide-react';
import QuantumButton from '@/components/quantum/QuantumButton';
import HolographicCard from '@/components/quantum/HolographicCard';
import { detectDevice, getRecommendedDownload } from './DeviceDetector';

/**
 * SMART INSTALL PROMPT
 * Detects device and shows the best installation option
 */
export default function SmartInstallPrompt({ onInstall, onDismiss }) {
  const [device, setDevice] = useState(null);
  const [recommended, setRecommended] = useState(null);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    const detected = detectDevice();
    setDevice(detected);
    setRecommended(getRecommendedDownload());

    // Listen for PWA install prompt
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (recommended?.type === 'pwa' && deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        onInstall?.();
      }
      setDeferredPrompt(null);
    } else if (recommended?.url) {
      window.open(recommended.url, '_blank');
      onInstall?.();
    }
  };

  if (!recommended) return null;

  const Icon = recommended.type === 'ios' || recommended.type === 'android' ? Smartphone : Monitor;

  return (
    <HolographicCard glow className="fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-96 z-40 p-6 animate-slide-up">
      <button
        onClick={onDismiss}
        className="absolute top-3 right-3 p-1 hover:bg-white/10 rounded-lg transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4 text-slate-400" />
      </button>

      <div className="flex items-start gap-4 mb-4">
        <div className="w-12 h-12 bg-gradient-to-br from-cyan-500/20 to-purple-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
          <Icon className="w-6 h-6 text-cyan-400" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white mb-1">
            Install ProfitShield
          </h3>
          <p className="text-sm text-slate-400">
            {recommended.type === 'ios' && 'Get the full iOS experience'}
            {recommended.type === 'android' && 'Get the full Android experience'}
            {recommended.type === 'desktop' && 'Install for quick access'}
            {recommended.type === 'pwa' && 'Install for offline access'}
          </p>
        </div>
      </div>

      <QuantumButton onClick={handleInstall} className="w-full" icon={Download}>
        {recommended.label}
      </QuantumButton>
    </HolographicCard>
  );
}