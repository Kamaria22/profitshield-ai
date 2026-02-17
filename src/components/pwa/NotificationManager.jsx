import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { base44 } from '@/api/base44Client';
import { Bell, BellOff, Volume2, VolumeX, Settings, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { toast } from 'sonner';

// Notification sounds (base64 encoded short sounds)
const NOTIFICATION_SOUNDS = {
  alert_critical: '/sounds/critical.mp3',
  alert_high: '/sounds/alert.mp3',
  alert_normal: '/sounds/notification.mp3',
  sync_complete: '/sounds/success.mp3',
  fraud_detected: '/sounds/warning.mp3',
  churn_risk: '/sounds/churn.mp3',
  revenue_anomaly: '/sounds/anomaly.mp3'
};

// Default notification preferences
const DEFAULT_PREFERENCES = {
  enabled: true,
  soundEnabled: true,
  soundVolume: 0.7,
  channels: {
    critical_alerts: { enabled: true, sound: true },
    high_priority: { enabled: true, sound: true },
    fraud_detection: { enabled: true, sound: true },
    churn_alerts: { enabled: true, sound: true },
    revenue_anomalies: { enabled: true, sound: true },
    sync_status: { enabled: true, sound: false },
    system_updates: { enabled: true, sound: false }
  }
};

const NotificationContext = createContext(null);

export function useNotifications() {
  return useContext(NotificationContext);
}

export function NotificationProvider({ children }) {
  const [preferences, setPreferences] = useState(() => {
    try {
      const saved = localStorage.getItem('profitshield_notification_prefs');
      return saved ? { ...DEFAULT_PREFERENCES, ...JSON.parse(saved) } : DEFAULT_PREFERENCES;
    } catch {
      return DEFAULT_PREFERENCES;
    }
  });
  const [permission, setPermission] = useState('default');
  const [isOpen, setIsOpen] = useState(false);

  // Check notification permission
  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  // Save preferences
  useEffect(() => {
    localStorage.setItem('profitshield_notification_prefs', JSON.stringify(preferences));
  }, [preferences]);

  // Request notification permission
  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      toast.error('Notifications not supported on this device');
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === 'granted') {
        toast.success('Notifications enabled!');
        return true;
      } else {
        toast.error('Notification permission denied');
        return false;
      }
    } catch (error) {
      console.error('Permission request failed:', error);
      return false;
    }
  }, []);

  // Play notification sound
  const playSound = useCallback((soundType) => {
    if (!preferences.soundEnabled) return;
    
    try {
      // Create audio context for web audio API (works better on mobile)
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        const audioCtx = new AudioContext();
        
        // Generate a simple tone based on sound type
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        // Different frequencies for different alert types
        const frequencies = {
          alert_critical: [800, 600, 800],
          alert_high: [600, 400],
          alert_normal: [440],
          sync_complete: [523, 659],
          fraud_detected: [300, 200, 300],
          churn_risk: [400, 300],
          revenue_anomaly: [500, 400, 500]
        };
        
        const freqs = frequencies[soundType] || [440];
        let time = audioCtx.currentTime;
        
        freqs.forEach((freq, i) => {
          oscillator.frequency.setValueAtTime(freq, time + i * 0.15);
        });
        
        gainNode.gain.setValueAtTime(preferences.soundVolume * 0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + freqs.length * 0.15 + 0.1);
        
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + freqs.length * 0.15 + 0.2);
      }
    } catch (error) {
      console.warn('Could not play sound:', error);
    }
  }, [preferences.soundEnabled, preferences.soundVolume]);

  // Send notification
  const sendNotification = useCallback(async (title, options = {}) => {
    const { 
      body, 
      icon = '/icon-192.png', 
      badge = '/icon-72.png',
      tag,
      channel = 'alert_normal',
      data,
      requireInteraction = false,
      silent = false
    } = options;

    // Check channel preferences
    const channelKey = channel.replace('alert_', '') + '_alerts';
    const channelPrefs = preferences.channels[channelKey] || preferences.channels.system_updates;
    
    if (!preferences.enabled || !channelPrefs?.enabled) {
      return null;
    }

    // Play sound if enabled for this channel
    if (channelPrefs?.sound && !silent) {
      playSound(channel);
    }

    // Send browser/system notification
    if (permission === 'granted' && 'Notification' in window) {
      try {
        // Use service worker for persistent notifications if available
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          const registration = await navigator.serviceWorker.ready;
          await registration.showNotification(title, {
            body,
            icon,
            badge,
            tag,
            data,
            requireInteraction,
            silent: silent || !channelPrefs?.sound,
            vibrate: channelPrefs?.sound ? [200, 100, 200] : undefined,
            actions: [
              { action: 'view', title: 'View' },
              { action: 'dismiss', title: 'Dismiss' }
            ]
          });
        } else {
          // Fallback to regular notification
          new Notification(title, { body, icon, tag, silent: silent || !channelPrefs?.sound });
        }
        return true;
      } catch (error) {
        console.error('Failed to send notification:', error);
      }
    }

    // Always show in-app toast
    const toastFn = channel.includes('critical') ? toast.error : 
                    channel.includes('high') || channel.includes('fraud') ? toast.warning : 
                    toast.info;
    toastFn(title, { description: body });
    
    return true;
  }, [permission, preferences, playSound]);

  // Update preferences
  const updatePreferences = useCallback((updates) => {
    setPreferences(prev => ({ ...prev, ...updates }));
  }, []);

  const updateChannelPreference = useCallback((channel, updates) => {
    setPreferences(prev => ({
      ...prev,
      channels: {
        ...prev.channels,
        [channel]: { ...prev.channels[channel], ...updates }
      }
    }));
  }, []);

  // Toggle all sounds
  const toggleSound = useCallback(() => {
    setPreferences(prev => ({ ...prev, soundEnabled: !prev.soundEnabled }));
  }, []);

  // Toggle all notifications
  const toggleNotifications = useCallback(() => {
    setPreferences(prev => ({ ...prev, enabled: !prev.enabled }));
  }, []);

  const value = {
    preferences,
    permission,
    requestPermission,
    sendNotification,
    updatePreferences,
    updateChannelPreference,
    toggleSound,
    toggleNotifications,
    playSound
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

// Notification Settings Panel Component
export function NotificationSettingsButton() {
  const notifications = useNotifications();
  if (!notifications) return null;

  const { 
    preferences, 
    permission, 
    requestPermission, 
    toggleSound, 
    toggleNotifications,
    updateChannelPreference,
    playSound
  } = notifications;

  const channelLabels = {
    critical_alerts: { label: 'Critical Alerts', description: 'Urgent issues requiring immediate attention' },
    high_priority: { label: 'High Priority', description: 'Important alerts and warnings' },
    fraud_detection: { label: 'Fraud Detection', description: 'Suspicious activity and fraud rings' },
    churn_alerts: { label: 'Churn Risk', description: 'Customer churn predictions' },
    revenue_anomalies: { label: 'Revenue Anomalies', description: 'Unusual revenue or margin changes' },
    sync_status: { label: 'Sync Status', description: 'Data synchronization updates' },
    system_updates: { label: 'System Updates', description: 'App updates and maintenance' }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative"
          aria-label="Notification settings"
        >
          {preferences.enabled ? (
            <Bell className="w-5 h-5" />
          ) : (
            <BellOff className="w-5 h-5 text-slate-400" />
          )}
          {preferences.enabled && permission === 'granted' && (
            <span className="absolute top-1 right-1 w-2 h-2 bg-emerald-500 rounded-full" />
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Notification Settings
          </SheetTitle>
          <SheetDescription>
            Manage alerts and notification sounds
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Permission Status */}
          {permission !== 'granted' && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-amber-800">Enable Notifications</p>
                    <p className="text-sm text-amber-600">Allow push notifications</p>
                  </div>
                  <Button size="sm" onClick={requestPermission}>
                    Enable
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Master Toggles */}
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-3">
                {preferences.enabled ? <Bell className="w-5 h-5 text-emerald-600" /> : <BellOff className="w-5 h-5 text-slate-400" />}
                <div>
                  <p className="font-medium">All Notifications</p>
                  <p className="text-xs text-slate-500">Master toggle for all alerts</p>
                </div>
              </div>
              <Switch 
                checked={preferences.enabled} 
                onCheckedChange={toggleNotifications}
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-3">
                {preferences.soundEnabled ? <Volume2 className="w-5 h-5 text-emerald-600" /> : <VolumeX className="w-5 h-5 text-slate-400" />}
                <div>
                  <p className="font-medium">Alert Sounds</p>
                  <p className="text-xs text-slate-500">Play sound with notifications</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => playSound('alert_normal')}
                  disabled={!preferences.soundEnabled}
                >
                  Test
                </Button>
                <Switch 
                  checked={preferences.soundEnabled} 
                  onCheckedChange={toggleSound}
                />
              </div>
            </div>
          </div>

          {/* Channel Settings */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Notification Channels</h3>
            {Object.entries(channelLabels).map(([key, { label, description }]) => (
              <div key={key} className="p-3 border rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{label}</p>
                    <p className="text-xs text-slate-500">{description}</p>
                  </div>
                  <Switch 
                    checked={preferences.channels[key]?.enabled ?? true}
                    onCheckedChange={(checked) => updateChannelPreference(key, { enabled: checked })}
                    disabled={!preferences.enabled}
                  />
                </div>
                {preferences.channels[key]?.enabled && (
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Volume2 className="w-3 h-3" /> Sound
                    </span>
                    <Switch 
                      checked={preferences.channels[key]?.sound ?? true}
                      onCheckedChange={(checked) => updateChannelPreference(key, { sound: checked })}
                      disabled={!preferences.enabled || !preferences.soundEnabled}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Install App Prompt */}
          <Card className="border-emerald-200 bg-emerald-50">
            <CardContent className="pt-4">
              <div className="text-center">
                <p className="font-medium text-emerald-800 mb-1">Install ProfitShield</p>
                <p className="text-sm text-emerald-600 mb-3">Get the full app experience with offline access</p>
                <p className="text-xs text-slate-500">
                  iOS: Tap Share → Add to Home Screen<br />
                  Android: Tap Menu → Install App<br />
                  Desktop: Click install icon in address bar
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default NotificationProvider;