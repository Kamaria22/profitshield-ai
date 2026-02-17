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

  // Monitor online status - with defensive checks
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setSyncStatus('idle');
      // Trigger sync when coming back online (with delay to avoid race)
      if (tenantId) {
        setTimeout(() => triggerSync(true), 1000);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus('offline');
    };

    // Check initial online status
    if (typeof navigator !== 'undefined') {
      setIsOnline(navigator.onLine);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [tenantId]);

  // Auto-sync on login/mount - with debounce to prevent excessive calls
  useEffect(() => {
    if (tenantId && isOnline) {
      // Small delay to allow other hooks to settle
      const timer = setTimeout(() => triggerSync(true), 500);
      return () => clearTimeout(timer);
    }
  }, [tenantId]);

  // Set up real-time subscriptions for auto-sync - with defensive error handling
  useEffect(() => {
    if (!tenantId) return;

    const subscriptions = [];

    // Helper to safely subscribe
    const safeSubscribe = (entityName, handler) => {
      try {
        if (base44.entities[entityName]?.subscribe) {
          const unsub = base44.entities[entityName].subscribe(handler);
          if (typeof unsub === 'function') {
            subscriptions.push(unsub);
          }
        }
      } catch (e) {
        // Silently ignore subscription failures - non-critical
      }
    };

    // Subscribe to order changes
    safeSubscribe('Order', (event) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      if (event?.type === 'create' && notifications?.sendNotification) {
        notifications.sendNotification('New Order', {
          body: 'Order received',
          channel: 'sync_status'
        });
      }
    });

    // Subscribe to alert changes
    safeSubscribe('Alert', (event) => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      if (event?.type === 'create' && event?.data && notifications?.sendNotification) {
        const severity = event.data.severity || 'normal';
        notifications.sendNotification(`New ${severity} Alert`, {
          body: event.data.title || 'New alert requires attention',
          channel: severity === 'critical' ? 'alert_critical' : severity === 'high' ? 'alert_high' : 'alert_normal'
        });
      }
    });

    // Subscribe to fraud ring detection
    safeSubscribe('FraudRing', (event) => {
      if (event?.type === 'create') {
        queryClient.invalidateQueries({ queryKey: ['fraudRings'] });
        if (notifications?.sendNotification) {
          notifications.sendNotification('Fraud Ring Detected!', {
            body: `New fraud ring affecting ${event.data?.total_merchants_affected || 'multiple'} merchants`,
            channel: 'fraud_detected',
            requireInteraction: true
          });
        }
      }
    });

    // Subscribe to churn predictions
    safeSubscribe('ChurnPrediction', (event) => {
      if ((event?.type === 'create' || event?.type === 'update') && 
          (event?.data?.risk_level === 'critical' || event?.data?.risk_level === 'high')) {
        queryClient.invalidateQueries({ queryKey: ['churn'] });
        if (notifications?.sendNotification) {
          notifications.sendNotification('Churn Risk Alert', {
            body: `High churn risk detected - ${event.data.churn_probability}% probability`,
            channel: 'churn_risk'
          });
        }
      }
    });

    // Subscribe to revenue anomalies
    safeSubscribe('RevenueAnomaly', (event) => {
      if (event?.type === 'create') {
        queryClient.invalidateQueries({ queryKey: ['revenueAnomalies'] });
        if (notifications?.sendNotification) {
          const body = event.data?.metric_name 
            ? `${event.data.metric_name} changed by ${event.data.change_percentage?.toFixed(1)}%` 
            : 'Unusual revenue pattern detected';
          notifications.sendNotification('Revenue Anomaly Detected', {
            body,
            channel: 'revenue_anomaly'
          });
        }
      }
    });

    // Subscribe to data access anomalies (security)
    safeSubscribe('DataAccessAnomaly', (event) => {
      if (event?.type === 'create' && (event?.data?.severity === 'critical' || event?.data?.severity === 'high')) {
        queryClient.invalidateQueries({ queryKey: ['security'] });
        if (notifications?.sendNotification) {
          notifications.sendNotification('Security Alert!', {
            body: `${event.data.anomaly_type?.replace(/_/g, ' ') || 'Anomaly'} detected in ${event.data.region_code || 'region'}`,
            channel: 'alert_critical',
            requireInteraction: true
          });
        }
      }
    });

    return () => {
      subscriptions.forEach(unsub => {
        try { if (typeof unsub === 'function') unsub(); } catch (e) {}
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
    // Defensive: check all prerequisites
    if (!tenantId || !isOnline || !queryClient) return;

    // Prevent concurrent syncs
    if (syncStatus === 'syncing') return;

    setSyncStatus('syncing');

    try {
      // Invalidate all relevant queries to refresh data - with individual error handling
      const invalidations = [
        queryClient.invalidateQueries({ queryKey: ['orders'] }).catch(() => null),
        queryClient.invalidateQueries({ queryKey: ['alerts'] }).catch(() => null),
        queryClient.invalidateQueries({ queryKey: ['profitLeaks'] }).catch(() => null),
        queryClient.invalidateQueries({ queryKey: ['tenantSettings'] }).catch(() => null),
        queryClient.invalidateQueries({ queryKey: ['syncJobs'] }).catch(() => null)
      ];
      
      await Promise.all(invalidations);

      setSyncStatus('synced');
      setLastSyncTime(Date.now());
      setPendingChanges(0);

      if (!silent && notifications?.sendNotification) {
        notifications.sendNotification('Sync Complete', {
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
      
      // Auto-recover after error
      setTimeout(() => {
        setSyncStatus(prev => prev === 'error' ? 'idle' : prev);
      }, 5000);
    }
  }, [tenantId, isOnline, queryClient, notifications, syncStatus]);

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