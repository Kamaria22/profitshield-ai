/**
 * NATIVE HEALTH CHECK ROUTE — /NativeHealth
 * Shows native app readiness: push, deep link, biometric, version
 */
import React, { useEffect, useState } from 'react';
import { Smartphone, CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const APP_VERSION = '1.0.0';
const BUILD = '100';
const DEEP_LINK_SCHEME = 'profitshield://';
const APP_ID = 'com.profitshield.app';

function Row({ label, status, detail }) {
  const icon =
    status === 'ok' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> :
    status === 'warn' ? <AlertCircle className="w-4 h-4 text-amber-500" /> :
    status === 'loading' ? <Loader2 className="w-4 h-4 text-slate-400 animate-spin" /> :
    <XCircle className="w-4 h-4 text-red-500" />;

  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
      {icon}
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {detail && <p className="text-xs text-slate-500">{detail}</p>}
      </div>
    </div>
  );
}

export default function NativeHealth() {
  const [biometric, setBiometric] = useState('loading');
  const [pushSupported, setPushSupported] = useState('loading');
  const [isNative, setIsNative] = useState('loading');
  const [deepLink, setDeepLink] = useState('ok');
  const [platform, setPlatform] = useState('web');

  useEffect(() => {
    // Biometric
    (async () => {
      try {
        if (window.PublicKeyCredential) {
          const ok = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          setBiometric(ok ? 'ok' : 'warn');
        } else {
          setBiometric('fail');
        }
      } catch { setBiometric('fail'); }
    })();

    // Push Notifications
    (async () => {
      try {
        if ('Notification' in window) {
          const perm = Notification.permission;
          setPushSupported(perm === 'granted' ? 'ok' : perm === 'denied' ? 'fail' : 'warn');
        } else {
          setPushSupported('fail');
        }
      } catch { setPushSupported('fail'); }
    })();

    // Native detection (Capacitor sets window.Capacitor)
    const cap = (window).Capacitor;
    if (cap?.isNativePlatform?.()) {
      setIsNative('ok');
      setPlatform(cap.getPlatform?.() || 'native');
    } else if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsNative('warn');
      setPlatform('pwa');
    } else {
      setIsNative('warn');
      setPlatform('web');
    }
  }, []);

  const ua = navigator.userAgent;
  const isMobile = /iPhone|iPad|Android/.test(ua);

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Smartphone className="w-7 h-7 text-emerald-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Native App Health</h1>
          <p className="text-sm text-slate-500">App ID: {APP_ID} · v{APP_VERSION} ({BUILD})</p>
        </div>
        <Badge className="ml-auto capitalize" variant="outline">{platform}</Badge>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Runtime Checks</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Row
            label="App Version"
            status="ok"
            detail={`v${APP_VERSION} · Build ${BUILD}`}
          />
          <Row
            label="Platform"
            status="ok"
            detail={platform === 'native' ? 'Running inside Capacitor native shell' : platform === 'pwa' ? 'Installed as PWA (standalone mode)' : 'Running in browser'}
          />
          <Row
            label="Native Shell (Capacitor)"
            status={isNative}
            detail={isNative === 'ok' ? 'Capacitor detected' : 'Not running inside Capacitor — web browser only'}
          />
          <Row
            label="Biometric Authentication"
            status={biometric}
            detail={
              biometric === 'ok' ? 'Platform authenticator available (Face ID / Touch ID / Fingerprint)' :
              biometric === 'warn' ? 'No platform authenticator detected on this device' :
              'WebAuthn not supported'
            }
          />
          <Row
            label="Push Notifications"
            status={pushSupported}
            detail={
              pushSupported === 'ok' ? 'Notifications permission granted' :
              pushSupported === 'warn' ? 'Permission not yet requested — will prompt on first alert' :
              'Notifications blocked — user must enable in device settings'
            }
          />
          <Row
            label="Deep Link Scheme"
            status={deepLink}
            detail={`${DEEP_LINK_SCHEME} registered in capacitor.config.ts`}
          />
          <Row
            label="Device Type"
            status="ok"
            detail={isMobile ? 'Mobile device detected' : 'Desktop device'}
          />
          <Row
            label="Secure Context (HTTPS)"
            status={window.isSecureContext ? 'ok' : 'fail'}
            detail={window.isSecureContext ? 'Running over HTTPS' : 'Not secure — biometric and push will not work'}
          />
        </CardContent>
      </Card>

      <div className="mt-6 p-4 bg-slate-50 rounded-lg text-xs text-slate-500 font-mono space-y-1">
        <p>User Agent: {ua.slice(0, 80)}...</p>
        <p>Screen: {window.screen.width}×{window.screen.height} @ {window.devicePixelRatio}x</p>
        <p>Online: {navigator.onLine ? 'Yes' : 'No'}</p>
      </div>
    </div>
  );
}