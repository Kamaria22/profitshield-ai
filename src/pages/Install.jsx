import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Shield, Store, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import createApp from '@shopify/app-bridge';
import { Redirect } from '@shopify/app-bridge/actions';
import { hasValidAppBridgeContext } from '@/components/shopify/AppBridgeAuth';

function redirectWithAppBridge(url) {
  try {
    if (!hasValidAppBridgeContext()) return false;
    const params = new URLSearchParams(window.location.search);
    const host = params.get('host');
    const shop = params.get('shop');
    const apiKey = window.__SHOPIFY_API_KEY__;
    if (!host || !apiKey) throw new Error('missing_host_or_api_key');
    const normalizedShop = shop && (shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`);
    const app = createApp({
      apiKey,
      host,
      shopOrigin: normalizedShop ? `https://${normalizedShop}` : undefined,
      forceRedirect: true,
    });
    Redirect.create(app).dispatch(Redirect.Action.REMOTE, url);
    return true;
  } catch {
    return false;
  }
}

export default function Install() {
  const [shopDomain, setShopDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleInstall = async (e) => {
    e.preventDefault();
    setError(null);
    
    if (!shopDomain.trim()) {
      setError('Please enter your shop domain');
      return;
    }

    setLoading(true);

    try {
      const { data } = await base44.functions.invoke('shopifyAuth', {
        action: 'install',
        shop: shopDomain.trim()
      });

      if (data?.install_url) {
        if (!redirectWithAppBridge(data.install_url)) {
          window.location.assign(data.install_url);
        }
      } else {
        setError('Failed to generate install URL');
        setLoading(false);
      }
    } catch (err) {
      setError(err.message || 'Installation failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Shield className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-slate-900 mb-2">ProfitShield AI</h1>
          <p className="text-xl text-slate-600">Protect Your E-commerce Profits</p>
        </div>

        {/* Main Card */}
        <Card className="shadow-xl border-slate-200">
          <CardContent className="p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Install on Your Store</h2>
              <p className="text-slate-600">
                Add ProfitShield to your Shopify store to start analyzing profit margins, detecting leaks, and protecting your bottom line.
              </p>
            </div>

            {/* Features */}
            <div className="space-y-3 mb-8">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-slate-900">Real-time Profit Analysis</p>
                  <p className="text-sm text-slate-500">Calculate true margins on every order</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-slate-900">Fraud & Risk Detection</p>
                  <p className="text-sm text-slate-500">AI-powered order risk scoring</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-slate-900">Profit Leak Detection</p>
                  <p className="text-sm text-slate-500">Identify and fix margin erosion</p>
                </div>
              </div>
            </div>

            {/* Install Form */}
            <form onSubmit={handleInstall} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Your Shopify Store Domain
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <Input
                      type="text"
                      placeholder="your-store.myshopify.com"
                      value={shopDomain}
                      onChange={(e) => setShopDomain(e.target.value)}
                      className="pl-10"
                      disabled={loading}
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Enter your full .myshopify.com domain
                </p>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button 
                type="submit" 
                className="w-full bg-emerald-600 hover:bg-emerald-700 h-12 text-base"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Shield className="w-5 h-5 mr-2" />
                    Install ProfitShield
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-slate-200">
              <p className="text-xs text-slate-500 text-center">
                By installing, you agree to our Terms of Service and Privacy Policy.
                <br />
                14-day free trial · No credit card required
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-slate-500">
          <p>Need help? Contact support@profitshield.ai</p>
        </div>
      </div>
    </div>
  );
}
