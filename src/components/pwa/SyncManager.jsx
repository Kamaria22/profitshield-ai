import React, { useEffect, useCallback, useState, createContext, useContext } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useNotifications } from './NotificationManager';
import { Cloud, CloudOff, RefreshCw, Check, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const SyncContext = createContext(null);

export function useSyncManager() {
  return useContext(SyncContext);
}

export function SyncProvider({ children, tenantId }) {
  const queryClient = useQueryClient();
  const notifications = useNotifications();
  const [syncStatus, setSyncStatus] = useState('idle'); // idle, syncing, synced, error, offline
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingChanges, setPendingChanges] = useState(0);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setSyncStatus('idle');
      // Trigger sync when coming back online
      triggerSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-sync on login/mount
  useEffect(() => {
    if (tenantId && isOnline) {
      triggerSync();
    }
  }, [tenantId, isOnline]);

  // Set up real-time subscriptions for auto-sync
  useEffect(() => {
    if (!tenantId) return;

    const subscriptions = [];

    // Subscribe to order changes
    try {
      const orderUnsub = base44.entities.Order.subscribe((event) => {
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        if (event.type === 'create') {
          notifications?.sendNotification('New Order', {
            body: `Order received`,
            channel: 'sync_status'
          });
        }
      });
      subscriptions.push(orderUnsub);
    } catch (e) {
      console.warn('Order subscription failed:', e);
    }

    // Subscribe to alert changes
    try {
      const alertUnsub = base44.entities.Alert.subscribe((event) => {
        queryClient.invalidateQueries({ queryKey: ['alerts'] });
        if (event.type === 'create' && event.data) {
          const severity = event.data.severity || 'normal';
          notifications?.sendNotification(`New ${severity} Alert`, {
            body: event.data.title || 'New alert requires attention',
            channel: severity === 'critical' ? 'alert_critical' : severity === 'high' ? 'alert_high' : 'alert_normal'
          });
        }
      });
      subscriptions.push(alertUnsub);
    } catch (e) {
      console.warn('Alert subscription failed:', e);
    }

    // Subscribe to fraud ring detection
    try {
      const fraudUnsub = base44.entities.FraudRing.subscribe((event) => {
        if (event.type === 'create') {
          queryClient.invalidateQueries({ queryKey: ['fraudRings'] });
          notifications?.sendNotification('Fraud Ring Detected!', {
            body: `New fraud ring affecting ${event.data?.total_merchants_affected || 'multiple'} merchants`,
            channel: 'fraud_detected',
            requireInteraction: true
          });
        }
      });
      subscriptions.push(fraudUnsub);
    } catch (e) {
      console.warn('Fraud ring subscription failed:', e);
    }

    // Subscribe to churn predictions
    try {
      const churnUnsub = base44.entities.ChurnPrediction.subscribe((event) => {
        if (event.type === 'create' || event.type === 'update') {
          if (event.data?.risk_level === 'critical' || event.data?.risk_level === 'high') {
            queryClient.invalidateQueries({ queryKey: ['churn'] });
            notifications?.sendNotification('Churn Risk Alert', {
              body: `High churn risk detected - ${event.data.churn_probability}% probability`,
              channel: 'churn_risk'
            });
          }
        }
      });
      subscriptions.push(churnUnsub);
    } catch (e) {
      console.warn('Churn subscription failed:', e);
    }

    // Subscribe to revenue anomalies
    try {
      const anomalyUnsub = base44.entities.RevenueAnomaly.subscribe((event) => {
        if (event.type === 'create') {
          queryClient.invalidateQueries({ queryKey: ['revenueAnomalies'] });
          notifications?.sendNotification('Revenue Anomaly Detected', {
            body: event.data?.metric_name ? `${event.data.metric_name} changed by ${event.data.change_percentage?.toFixed(1)}%` : 'Unusual revenue pattern detected',
            channel: 'revenue_anomaly'
          });
        }
      });
      subscriptions.push(anomalyUnsub);
    } catch (e) {
      console.warn('Anomaly subscription failed:', e);
    }

    // Subscribe to data access anomalies (security)
    try {
      const securityUnsub = base44.entities.DataAccessAnomaly.subscribe((event) => {
        if (event.type === 'create' && (event.data?.severity === 'critical' || event.data?.severity === 'high')) {
          queryClient.invalidateQueries({ queryKey: ['security'] });
          notifications?.sendNotification('Security Alert!', {
            body: `${event.data.anomaly_type?.replace(/_/g, ' ')} detected in ${event.data.region_code}`,
            channel: 'alert_critical',
            requireInteraction: true
          });
        }
      });
      subscriptions.push(securityUnsub);
    } catch (e) {
      console.warn('Security subscription failed:', e);
    }

    return () => {
      subscriptions.forEach(unsub => {
        try { unsub(); } catch (e) {}
      });
    };
  }, [tenantId, queryClient, notifications]);

  // Periodic sync (every 5 minutes when online)
  useEffect(() => {
    if (!tenantId || !isOnline) return;

    const interval = setInterval(() => {
      triggerSync(true); // Silent sync
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [tenantId, isOnline]);

  // Sync on visibility change (when user returns to tab/app)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && tenantId && isOnline) {
        // Only sync if last sync was more than 1 minute ago
        if (!lastSyncTime || Date.now() - lastSyncTime > 60000) {
          triggerSync(true);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [tenantId, isOnline, lastSyncTime]);

  const triggerSync = useCallback(async (silent = false) => {
    if (!tenantId || !isOnline) return;

    setSyncStatus('syncing');

    try {
      // Invalidate all relevant queries to refresh data
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['orders'] }),
        queryClient.invalidateQueries({ queryKey: ['alerts'] }),
        queryClient.invalidateQueries({ queryKey: ['profitLeaks'] }),
        queryClient.invalidateQueries({ queryKey: ['tenantSettings'] }),
        queryClient.invalidateQueries({ queryKey: ['syncJobs'] })
      ]);

      setSyncStatus('synced');
      setLastSyncTime(Date.now());
      setPendingChanges(0);

      if (!silent) {
        notifications?.sendNotification('Sync Complete', {
          body: 'All data is up to date',
          channel: 'sync_status',
          silent: true
        });
      }

      // Reset to idle after 3 seconds
      setTimeout(() => {
        setSyncStatus(prev => prev === 'synced' ? 'idle' : prev);
      }, 3000);

    } catch (error) {
      console.error('Sync failed:', error);
      setSyncStatus('error');
      
      if (!silent) {
        toast.error('Sync failed. Will retry automatically.');
      }
    }
  }, [tenantId, isOnline, queryClient, notifications]);

  const value = {
    syncStatus,
    lastSyncTime,
    isOnline,
    pendingChanges,
    triggerSync
  };

  return (
    <SyncContext.Provider value={value}>
      {children}
    </SyncContext.Provider>
  );
}

// Sync Status Indicator Component
export function SyncStatusIndicator({ compact = false }) {
  const sync = useSyncManager();
  if (!sync) return null;

  const { syncStatus, isOnline, lastSyncTime, triggerSync } = sync;

  const statusConfig = {
    idle: { icon: Cloud, color: 'text-slate-400', label: 'Synced' },
    syncing: { icon: RefreshCw, color: 'text-blue-500', label: 'Syncing...', animate: true },
    synced: { icon: Check, color: 'text-emerald-500', label: 'Up to date' },
    error: { icon: AlertCircle, color: 'text-red-500', label: 'Sync error' },
    offline: { icon: CloudOff, color: 'text-amber-500', label: 'Offline' }
  };

  const config = statusConfig[syncStatus] || statusConfig.idle;
  const Icon = config.icon;

  if (compact) {
    return (
      <button 
        onClick={() => triggerSync()}
        className={`p-1.5 rounded-lg hover:bg-slate-100 transition-colors ${config.color}`}
        title={config.label}
        disabled={syncStatus === 'syncing' || !isOnline}
      >
        <Icon className={`w-4 h-4 ${config.animate ? 'animate-spin' : ''}`} />
      </button>
    );
  }

  return (
    <Badge 
      variant="outline" 
      className={`gap-1.5 cursor-pointer hover:bg-slate-50 ${config.color}`}
      onClick={() => triggerSync()}
    >
      <Icon className={`w-3 h-3 ${config.animate ? 'animate-spin' : ''}`} />
      <span className="text-xs">{config.label}</span>
    </Badge>
  );
}

export default SyncProvider;