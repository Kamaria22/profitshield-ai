import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import QuantumButton from '@/components/quantum/QuantumButton';
import { Download, X } from 'lucide-react';

/**
 * PWA INSTALL PROMPT
 * Captures beforeinstallprompt and shows install button
 */
export default function InstallPrompt({ userId }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem('pwa_install_dismissed') === 'true';
  });

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      toast.success('App installed successfully!');
      
      // Track installation
      if (userId) {
        await base44.functions.invoke('stateManager', {
          action: 'mark_desktop_installed',
          user_id: userId
        }).catch(() => {});
      }
    }

    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('pwa_install_dismissed', 'true');
  };

  if (!deferredPrompt || dismissed) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <div className="backdrop-blur-xl bg-slate-900/90 border border-cyan-500/30 rounded-xl p-4 shadow-2xl">
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 text-slate-400 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center flex-shrink-0">
            <Download className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-white mb-1">Install Desktop App</h3>
            <p className="text-sm text-slate-400 mb-3">
              Get faster access and work offline
            </p>
            <QuantumButton
              size="sm"
              onClick={handleInstall}
              icon={Download}
            >
              Install Now
            </QuantumButton>
          </div>
        </div>
      </div>
    </div>
  );
}