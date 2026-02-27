/**
 * CAPACITOR NATIVE BUILD GUIDE
 * Admin-only reference component with exact commands to build native iOS/Android apps.
 */
import React, { useState } from 'react';
import { Terminal, Copy, Check, Smartphone, Monitor, Package } from 'lucide-react';

function CodeBlock({ code, label }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mb-4">
      {label && <p className="text-xs text-slate-400 mb-1">{label}</p>}
      <div className="relative bg-slate-900 rounded-lg overflow-hidden">
        <pre className="p-4 text-sm text-emerald-400 overflow-x-auto">{code}</pre>
        <button
          onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="absolute top-2 right-2 p-1.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-300"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
        </button>
      </div>
    </div>
  );
}

export default function CapacitorSetupGuide() {
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="flex items-center gap-3 mb-6">
        <Terminal className="w-6 h-6 text-emerald-500" />
        <h2 className="text-xl font-bold text-slate-900">Native App Build Instructions</h2>
      </div>

      <section>
        <h3 className="text-lg font-semibold text-slate-800 mb-3 flex items-center gap-2">
          <Package className="w-5 h-5 text-cyan-600" /> Step 1: Install Capacitor
        </h3>
        <CodeBlock
          label="Install Capacitor core and CLI"
          code={`npm install @capacitor/core @capacitor/cli
npm install @capacitor/ios @capacitor/android
npm install @capacitor/push-notifications @capacitor/app @capacitor/storage @capacitor/biometrics`}
        />
      </section>

      <section>
        <h3 className="text-lg font-semibold text-slate-800 mb-3">Step 2: Create capacitor.config.json in project root</h3>
        <CodeBlock
          code={`{
  "appId": "ai.profitshield.app",
  "appName": "ProfitShield AI",
  "webDir": "dist",
  "server": {
    "url": "https://profitshield.base44.app",
    "cleartext": false
  },
  "ios": {
    "contentInset": "always",
    "preferredContentMode": "mobile"
  },
  "android": {
    "allowMixedContent": false,
    "webContentsDebuggingEnabled": false
  },
  "plugins": {
    "PushNotifications": {
      "presentationOptions": ["badge", "sound", "alert"]
    },
    "SplashScreen": {
      "launchShowDuration": 2000,
      "backgroundColor": "#0f172a",
      "androidSplashResourceName": "splash"
    }
  }
}`}
        />
      </section>

      <section>
        <h3 className="text-lg font-semibold text-slate-800 mb-3 flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-cyan-600" /> Step 3: Add Platforms
        </h3>
        <CodeBlock
          label="Build the web app first, then add native platforms"
          code={`npm run build
npx cap add ios
npx cap add android
npx cap sync`}
        />
      </section>

      <section>
        <h3 className="text-lg font-semibold text-slate-800 mb-3 flex items-center gap-2">
          <Monitor className="w-5 h-5 text-purple-600" /> Step 4: Open in Xcode / Android Studio
        </h3>
        <CodeBlock
          label="Open iOS project in Xcode"
          code={`npx cap open ios`}
        />
        <CodeBlock
          label="Open Android project in Android Studio"
          code={`npx cap open android`}
        />
      </section>

      <section>
        <h3 className="text-lg font-semibold text-slate-800 mb-3">Step 5: iOS App Store Submission</h3>
        <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-700 space-y-2">
          <p>1. Open <code className="bg-slate-200 px-1 rounded">ios/App/App.xcworkspace</code> in Xcode</p>
          <p>2. Set Team to your Apple Developer account</p>
          <p>3. Set Bundle Identifier to <code className="bg-slate-200 px-1 rounded">ai.profitshield.app</code></p>
          <p>4. Select "Any iOS Device" as target</p>
          <p>5. Product → Archive</p>
          <p>6. Distribute App → App Store Connect → Upload</p>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-slate-800 mb-3">Step 6: Android Google Play Submission</h3>
        <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-700 space-y-2">
          <p>1. Open <code className="bg-slate-200 px-1 rounded">android/</code> in Android Studio</p>
          <p>2. Build → Generate Signed Bundle/APK → Android App Bundle</p>
          <p>3. Create keystore (keep this safe — you need it forever)</p>
          <p>4. Upload AAB to Google Play Console → Production track</p>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-slate-800 mb-3">Step 7: Push Notifications Setup</h3>
        <CodeBlock
          label="Firebase (Android FCM) — install google-services.json in android/app/"
          code={`# Get google-services.json from Firebase Console
# Get GoogleService-Info.plist from Firebase Console for iOS
# Place them in the correct directories after cap add ios/android`}
        />
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          <strong>Required:</strong> Apple Push Notification Certificate (.p8 key) from Apple Developer Console.
          Upload to Firebase Console → Project Settings → Cloud Messaging → APNs Auth Key.
        </div>
      </section>
    </div>
  );
}