import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

/**
 * OFFLINE INDICATOR
 * Shows banner when offline, auto-recovers when online
 */
export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showRecovery, setShowRecovery] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowRecovery(true);
      setTimeout(() => setShowRecovery(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowRecovery(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline && !showRecovery) return null;

  return (
    <div className="fixed top-16 left-0 right-0 z-40 px-4">
      <div className="max-w-7xl mx-auto">
        <Alert className={
          isOnline
            ? 'bg-emerald-500/10 border-emerald-500/30'
            : 'bg-amber-500/10 border-amber-500/30'
        }>
          {isOnline ? (
            <Wifi className="w-4 h-4 text-emerald-400" />
          ) : (
            <WifiOff className="w-4 h-4 text-amber-400" />
          )}
          <AlertDescription className={isOnline ? 'text-emerald-300' : 'text-amber-300'}>
            {isOnline ? 'Back online • Syncing data...' : 'Offline • Reconnecting...'}
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}