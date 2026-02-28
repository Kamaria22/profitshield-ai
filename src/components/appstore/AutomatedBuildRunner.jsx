/**
 * AUTOMATED NATIVE BUILD RUNNER
 * Admin-only. Generates platform-specific build scripts and validates config.
 */
import React, { useState } from 'react';
import { Copy, Check, Terminal, Apple, Smartphone, Package, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const APP_ID = 'com.profitshield.app';
const APP_NAME = 'ProfitShield AI';
const WEB_URL = 'https://profitshield.base44.app';
const VERSION = '1.0.0';

function CodeBlock({ code, label }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative rounded-lg bg-slate-900 text-slate-100 text-xs font-mono overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
        <span className="text-slate-400">{label}</span>
        <button onClick={copy} className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors">
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto whitespace-pre leading-relaxed">{code}</pre>
    </div>
  );
}

function Step({ num, title, children, badge }) {
  const [open, setOpen] = useState(num === 1);
  return (
    <Card className="border-slate-200">
      <button
        className="w-full text-left px-4 py-3 flex items-center gap-3"
        onClick={() => setOpen(o => !o)}
      >
        <span className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 text-sm font-bold flex items-center justify-center flex-shrink-0">{num}</span>
        <span className="font-medium text-slate-900 flex-1">{title}</span>
        {badge && <Badge variant="outline" className="text-xs">{badge}</Badge>}
        {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>
      {open && <CardContent className="pt-0 space-y-3">{children}</CardContent>}
    </Card>
  );
}

const INSTALL_SCRIPT = `#!/bin/bash
# ProfitShield Native Build — Prerequisites
set -e

echo "Installing Capacitor..."
npm install @capacitor/core @capacitor/cli
npm install @capacitor/ios @capacitor/android
npm install @capacitor/push-notifications @capacitor/app @capacitor/splash-screen

echo "Done. Next: run build-ios.sh or build-android.sh"`;

const BUILD_IOS_SCRIPT = `#!/bin/bash
# ProfitShield iOS Build Script
set -e

echo "Building web assets..."
npm run build

echo "Syncing to iOS..."
npx cap sync ios

echo "Opening Xcode..."
npx cap open ios

echo ""
echo "In Xcode:"
echo "  1. Select your Team in Signing & Capabilities"
echo "  2. Verify Bundle ID = ${APP_ID}"
echo "  3. Product > Archive"
echo "  4. Distribute App > App Store Connect > Upload"`;

const BUILD_ANDROID_SCRIPT = `#!/bin/bash
# ProfitShield Android Build Script
set -e

echo "Building web assets..."
npm run build

echo "Syncing to Android..."
npx cap sync android

echo "Opening Android Studio..."
npx cap open android

echo ""
echo "In Android Studio:"
echo "  1. Build > Generate Signed Bundle/APK"
echo "  2. Choose Android App Bundle (.aab)"
echo "  3. Create or select keystore"
echo "  4. Build release variant"
echo "  5. Upload .aab to Google Play Console"`;

const CAPACITOR_CONFIG = `// capacitor.config.ts
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: '${APP_ID}',
  appName: '${APP_NAME}',
  webDir: 'dist',
  server: {
    url: '${WEB_URL}',
    cleartext: false,
    androidScheme: 'https'
  },
  ios: {
    scheme: 'profitshield',
    backgroundColor: '#0f172a'
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#0f172a'
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    },
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0f172a',
      showSpinner: false
    }
  }
};

export default config;`;

const PLIST_DEEP_LINK = `<!-- Add to ios/App/App/Info.plist inside <dict> -->
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLName</key>
    <string>${APP_ID}</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>profitshield</string>
    </array>
  </dict>
</array>`;

const ANDROID_INTENT = `<!-- Add to android/app/src/main/AndroidManifest.xml inside <activity> -->
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="profitshield" />
</intent-filter>`;

const CHECKLIST_ITEMS = [
  { label: 'Apple Developer Account ($99/yr)', url: 'https://developer.apple.com/programs/' },
  { label: 'Google Play Console Account ($25 one-time)', url: 'https://play.google.com/console' },
  { label: 'App icon 1024×1024 PNG (no alpha)', url: null },
  { label: 'iOS screenshots: 6.7", 5.5", 12.9" iPad', url: null },
  { label: 'Android screenshots: phone + 7" tablet', url: null },
  { label: 'APNs .p8 key (for iOS push notifications)', url: 'https://developer.apple.com/account/resources/authkeys/list' },
  { label: 'google-services.json (for Android FCM)', url: 'https://console.firebase.google.com' },
  { label: 'Privacy Policy URL live', url: `${WEB_URL}/?page=PrivacyPolicy` },
  { label: 'Support email configured', url: null },
];

export default function AutomatedBuildRunner() {
  const [checked, setChecked] = useState({});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Terminal className="w-7 h-7 text-slate-700" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Automated Native Build</h1>
          <p className="text-sm text-slate-500">App ID: {APP_ID} · v{VERSION}</p>
        </div>
      </div>

      {/* Pre-flight Checklist */}
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Pre-flight Checklist
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {CHECKLIST_ITEMS.map((item, i) => (
            <label key={i} className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={!!checked[i]}
                onChange={e => setChecked(c => ({ ...c, [i]: e.target.checked }))}
                className="w-4 h-4 accent-emerald-600 rounded"
              />
              <span className={`text-sm ${checked[i] ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                {item.label}
              </span>
              {item.url && (
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-600 hover:underline ml-auto">
                  Open ↗
                </a>
              )}
            </label>
          ))}
          <div className="mt-3 pt-3 border-t border-amber-200">
            <p className="text-xs text-amber-700">
              {Object.values(checked).filter(Boolean).length}/{CHECKLIST_ITEMS.length} items completed
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Steps */}
      <Step num={1} title="Install Capacitor dependencies" badge="Run once">
        <p className="text-sm text-slate-600">Run this in your project root after cloning the repo locally.</p>
        <CodeBlock label="install-capacitor.sh" code={INSTALL_SCRIPT} />
      </Step>

      <Step num={2} title="Capacitor configuration" badge="capacitor.config.ts">
        <p className="text-sm text-slate-600">Create this file in your project root (already committed in this app).</p>
        <CodeBlock label="capacitor.config.ts" code={CAPACITOR_CONFIG} />
      </Step>

      <Step num={3} title="iOS Build & Submit" badge="Requires Mac + Xcode">
        <div className="flex items-center gap-2 mb-2">
          <Apple className="w-4 h-4" />
          <p className="text-sm font-medium text-slate-700">Requires: Mac, Xcode 15+, Apple Developer account</p>
        </div>
        <CodeBlock label="build-ios.sh" code={BUILD_IOS_SCRIPT} />
        <p className="text-sm font-medium text-slate-700 mt-3">Deep Link — add to Info.plist:</p>
        <CodeBlock label="ios/App/App/Info.plist" code={PLIST_DEEP_LINK} />
      </Step>

      <Step num={4} title="Android Build & Submit" badge="Requires Android Studio">
        <div className="flex items-center gap-2 mb-2">
          <Smartphone className="w-4 h-4" />
          <p className="text-sm font-medium text-slate-700">Requires: Android Studio, Google Play Console account</p>
        </div>
        <CodeBlock label="build-android.sh" code={BUILD_ANDROID_SCRIPT} />
        <p className="text-sm font-medium text-slate-700 mt-3">Deep Link — add to AndroidManifest.xml:</p>
        <CodeBlock label="AndroidManifest.xml" code={ANDROID_INTENT} />
      </Step>

      <Step num={5} title="Push Notifications Setup" badge="APNs + FCM">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="font-medium text-sm mb-2 flex items-center gap-1.5"><Apple className="w-4 h-4" /> iOS (APNs)</p>
            <ol className="text-xs text-slate-600 space-y-1 list-decimal list-inside">
              <li>Apple Developer → Certificates → Keys</li>
              <li>Create key with "Apple Push Notifications service (APNs)"</li>
              <li>Download .p8 file</li>
              <li>Set APNS_KEY_ID, APNS_TEAM_ID, APNS_AUTH_KEY secrets</li>
              <li>In Xcode: Signing & Capabilities → + Push Notifications</li>
            </ol>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="font-medium text-sm mb-2 flex items-center gap-1.5"><Smartphone className="w-4 h-4" /> Android (FCM)</p>
            <ol className="text-xs text-slate-600 space-y-1 list-decimal list-inside">
              <li>Firebase Console → Add Project</li>
              <li>Add Android app with package {APP_ID}</li>
              <li>Download google-services.json</li>
              <li>Place in android/app/google-services.json</li>
              <li>Set FIREBASE_SERVER_KEY secret</li>
            </ol>
          </div>
        </div>
      </Step>

      <Step num={6} title="App Store Listing Assets" badge="Required for submission">
        <div className="grid md:grid-cols-2 gap-4 text-sm text-slate-600">
          <div>
            <p className="font-medium text-slate-800 mb-2">🍎 iOS Required</p>
            <ul className="space-y-1 text-xs">
              <li>• iPhone 6.7" screenshots (1290×2796)</li>
              <li>• iPhone 5.5" screenshots (1242×2208)</li>
              <li>• iPad 12.9" screenshots (2048×2732)</li>
              <li>• App icon: 1024×1024 PNG (no alpha, no transparency)</li>
              <li>• App description (up to 4000 chars)</li>
              <li>• Keywords (up to 100 chars)</li>
              <li>• Support URL + Marketing URL</li>
              <li>• Privacy Policy URL</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-slate-800 mb-2">🤖 Android Required</p>
            <ul className="space-y-1 text-xs">
              <li>• Phone screenshots min 2 (1080×1920)</li>
              <li>• 7" tablet screenshots</li>
              <li>• Feature graphic (1024×500)</li>
              <li>• Hi-res icon: 512×512 PNG</li>
              <li>• Short description (80 chars)</li>
              <li>• Full description (4000 chars)</li>
              <li>• Content rating completed</li>
              <li>• Data safety form filled</li>
            </ul>
          </div>
        </div>
      </Step>
    </div>
  );
}