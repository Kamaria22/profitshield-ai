import React, { useState, useEffect } from 'react';
import HolographicCard from '@/components/quantum/HolographicCard';
import QuantumButton from '@/components/quantum/QuantumButton';
import { Badge } from '@/components/ui/badge';
import { Monitor, Download, Check, Smartphone, Zap } from 'lucide-react';

export default function DownloadPage() {
  const [os, setOs] = useState('unknown');
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Detect OS
    const platform = navigator.platform.toLowerCase();
    if (platform.includes('mac')) setOs('macos');
    else if (platform.includes('win')) setOs('windows');
    else if (platform.includes('linux')) setOs('linux');

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
    }
  }, []);

  const handleInstall = () => {
    // Trigger PWA install if available
    if (window.deferredPrompt) {
      window.deferredPrompt.prompt();
    } else {
      alert('Install instructions: Click the install button in your browser address bar');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center">
            <Monitor className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent mb-4">
            ProfitShield Desktop
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto">
            Install ProfitShield AI as a desktop app for faster access, offline support, and native performance
          </p>
        </div>

        {installed && (
          <div className="mb-8 text-center">
            <Badge className="bg-emerald-500/20 text-emerald-400 px-4 py-2">
              <Check className="w-4 h-4 mr-2" />
              Already Installed
            </Badge>
          </div>
        )}

        {/* Installation */}
        <HolographicCard glow scanline className="p-8 mb-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-4">
              Install for {os === 'macos' ? 'macOS' : os === 'windows' ? 'Windows' : os === 'linux' ? 'Linux' : 'Your Platform'}
            </h2>
            <p className="text-slate-400 mb-6">
              One-click installation, no download required
            </p>
            <QuantumButton
              size="lg"
              onClick={handleInstall}
              icon={Download}
              disabled={installed}
            >
              {installed ? 'Already Installed' : 'Install Now'}
            </QuantumButton>
          </div>
        </HolographicCard>

        {/* Instructions */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <HolographicCard className="p-6">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                <span className="text-2xl font-bold text-cyan-400">1</span>
              </div>
              <h3 className="font-bold text-white mb-2">Chrome / Edge</h3>
              <p className="text-sm text-slate-400">
                Click the install icon in the address bar or use the button above
              </p>
            </div>
          </HolographicCard>

          <HolographicCard className="p-6">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <span className="text-2xl font-bold text-purple-400">2</span>
              </div>
              <h3 className="font-bold text-white mb-2">Safari (macOS)</h3>
              <p className="text-sm text-slate-400">
                Click Share → Add to Dock for desktop access
              </p>
            </div>
          </HolographicCard>

          <HolographicCard className="p-6">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <span className="text-2xl font-bold text-emerald-400">3</span>
              </div>
              <h3 className="font-bold text-white mb-2">Mobile</h3>
              <p className="text-sm text-slate-400">
                Add to Home Screen for app-like experience
              </p>
            </div>
          </HolographicCard>
        </div>

        {/* Features */}
        <HolographicCard glow className="p-8">
          <h2 className="text-2xl font-bold text-cyan-400 mb-6">Desktop Features</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              { icon: Zap, title: 'Lightning Fast', desc: 'Native performance with instant loading' },
              { icon: Monitor, title: 'Desktop Native', desc: 'Dedicated app window with OS integration' },
              { icon: Download, title: 'Offline Ready', desc: 'Access your data even without internet' },
              { icon: Smartphone, title: 'Seamless Sync', desc: 'Continue where you left off on any device' }
            ].map((feature, i) => {
              const Icon = feature.icon;
              return (
                <div key={i} className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white mb-1">{feature.title}</h3>
                    <p className="text-sm text-slate-400">{feature.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </HolographicCard>
      </div>
    </div>
  );
}