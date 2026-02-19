import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Apple, PlayCircle, Chrome, Shield } from 'lucide-react';

/**
 * APP STORE DEPLOYMENT LINKS
 * 
 * For deploying to app stores:
 * 
 * SHOPIFY APP STORE:
 * 1. Create app listing at partners.shopify.com
 * 2. Set OAuth redirect: https://[your-domain]/shopifyAuth
 * 3. Configure app embed
 * 
 * PWA (iOS/Android):
 * This app is already a PWA and can be installed directly:
 * - iOS: Tap Share > Add to Home Screen
 * - Android: Tap menu > Install app
 * 
 * For native app stores (requires additional build):
 * - Use Capacitor or similar to wrap PWA
 * - Submit to Apple App Store / Google Play
 */

export default function AppStoreLinks() {
  const appUrl = window.location.origin;
  const isInstallable = 'serviceWorker' in navigator;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-emerald-600" />
          <h3 className="font-semibold">ProfitShield AI</h3>
        </div>
        <p className="text-sm text-slate-500">Available everywhere</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* PWA Install */}
        <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg border border-emerald-200">
          <div className="flex items-center gap-3 mb-2">
            <Chrome className="w-6 h-6 text-emerald-600" />
            <div>
              <p className="font-medium text-sm">Install as App</p>
              <p className="text-xs text-slate-600">Works offline • Native feel</p>
            </div>
          </div>
          {isInstallable && (
            <p className="text-xs text-emerald-700">
              ✓ This app can be installed on your device
            </p>
          )}
        </div>

        {/* Shopify App Store */}
        <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-6 h-6 bg-green-600 rounded flex items-center justify-center text-white font-bold text-xs">
              S
            </div>
            <div>
              <p className="font-medium text-sm">Shopify App Store</p>
              <p className="text-xs text-slate-600">Direct integration</p>
            </div>
          </div>
          <Button 
            size="sm" 
            variant="outline" 
            className="w-full mt-2"
            onClick={() => window.open('https://apps.shopify.com', '_blank')}
          >
            View Listing
          </Button>
        </div>

        {/* Mobile Apps */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-slate-50 rounded-lg border text-center">
            <Apple className="w-6 h-6 mx-auto mb-1 text-slate-600" />
            <p className="text-xs font-medium">iOS App</p>
            <p className="text-xs text-slate-400">Coming Soon</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border text-center">
            <PlayCircle className="w-6 h-6 mx-auto mb-1 text-slate-600" />
            <p className="text-xs font-medium">Android App</p>
            <p className="text-xs text-slate-400">Coming Soon</p>
          </div>
        </div>

        <div className="text-xs text-slate-400 text-center pt-2 border-t">
          <p>Protected by ProfitShield AI™</p>
          <p>© 2026 All Rights Reserved</p>
        </div>
      </CardContent>
    </Card>
  );
}