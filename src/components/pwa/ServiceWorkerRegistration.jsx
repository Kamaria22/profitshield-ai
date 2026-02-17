import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Download, RefreshCw } from 'lucide-react';

export function useServiceWorker() {
  const [registration, setRegistration] = useState(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      setIsInstalled(true);
    }

    // Listen for install prompt
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    // Listen for app installed
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      toast.success('ProfitShield installed successfully!');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          setRegistration(reg);
          
          // Check for updates
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setUpdateAvailable(true);
                toast.info('App update available!', {
                  action: {
                    label: 'Update',
                    onClick: () => updateApp()
                  }
                });
              }
            });
          });
        })
        .catch((error) => {
          console.warn('Service worker registration failed:', error);
        });

      // Handle controller change (new SW activated)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const installApp = async () => {
    if (!installPrompt) return false;
    
    try {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      
      if (outcome === 'accepted') {
        setInstallPrompt(null);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Install failed:', error);
      return false;
    }
  };

  const updateApp = () => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  };

  return {
    registration,
    updateAvailable,
    installPrompt,
    isInstalled,
    installApp,
    updateApp
  };
}

export function InstallAppBanner() {
  const { installPrompt, isInstalled, installApp } = useServiceWorker();
  const [dismissed, setDismissed] = useState(() => {
    try {
      const dismissedAt = localStorage.getItem('pwa_install_dismissed');
      if (dismissedAt) {
        // Show again after 7 days
        return Date.now() - parseInt(dismissedAt) < 7 * 24 * 60 * 60 * 1000;
      }
      return false;
    } catch {
      return false;
    }
  });

  if (isInstalled || !installPrompt || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('pwa_install_dismissed', String(Date.now()));
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50 animate-in slide-in-from-bottom-4">
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-4 rounded-xl shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-white/20 rounded-lg">
            <Download className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="font-semibold">Install ProfitShield</p>
            <p className="text-sm text-emerald-100 mt-1">Get instant access with offline support</p>
            <div className="flex gap-2 mt-3">
              <Button 
                size="sm" 
                variant="secondary"
                className="bg-white text-emerald-700 hover:bg-emerald-50"
                onClick={installApp}
              >
                Install Now
              </Button>
              <Button 
                size="sm" 
                variant="ghost"
                className="text-white hover:bg-white/20"
                onClick={handleDismiss}
              >
                Later
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function UpdateAvailableBanner() {
  const { updateAvailable, updateApp } = useServiceWorker();

  if (!updateAvailable) return null;

  return (
    <div className="fixed top-16 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50 animate-in slide-in-from-top-4">
      <div className="bg-blue-600 text-white p-3 rounded-xl shadow-2xl">
        <div className="flex items-center gap-3">
          <RefreshCw className="w-5 h-5" />
          <div className="flex-1">
            <p className="font-medium text-sm">Update available</p>
          </div>
          <Button 
            size="sm" 
            variant="secondary"
            className="bg-white text-blue-700 hover:bg-blue-50"
            onClick={updateApp}
          >
            Update
          </Button>
        </div>
      </div>
    </div>
  );
}

export default useServiceWorker;