import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Shield, Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import createApp from '@shopify/app-bridge';
import { Redirect } from '@shopify/app-bridge/actions';

function redirectWithAppBridge(url) {
  try {
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
    Redirect.create(app).dispatch(Redirect.Action.APP, url);
    return true;
  } catch {
    return false;
  }
}

export default function ShopifyCallback() {
  const [status, setStatus] = useState('processing');
  const [error, setError] = useState(null);

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const shop = urlParams.get('shop');
      const state = urlParams.get('state');

      if (!code || !shop) {
        setError('Missing authorization code or shop domain');
        setStatus('error');
        return;
      }

      setStatus('exchanging');
      console.log('[ShopifyCallback] OAuth callback received — shop:', shop);

      // Exchange code for access token
      const { data } = await base44.functions.invoke('shopifyAuth', {
        action: 'callback',
        shop,
        code,
        state
      });

      if (data?.success) {
        // Verify token was actually saved
        const tokenSaved = !!(data.tenant_id);
        console.log('[ShopifyCallback] callback success — tenant_id:', data.tenant_id,
          '| shop_domain:', data.shop_domain,
          '| token_saved:', tokenSaved);

        setStatus('success');

        // Use redirect_url from backend (includes shop context)
        // Fallback to Home if not provided
        setTimeout(() => {
          const redirectUrl = data.redirect_url || '/Home';
          console.log('[ShopifyCallback] Redirecting to:', redirectUrl);
          try {
            if (!redirectWithAppBridge(redirectUrl)) {
              window.location.assign(redirectUrl);
            }
          } catch (err) {
            // Final fallback
            console.warn('[ShopifyCallback] redirect failed, opening new tab:', err.message);
            window.open(redirectUrl, '_blank', 'noopener,noreferrer');
          }
        }, 800);
      } else {
        const errMsg = data?.error || 'Installation failed';
        console.error('[ShopifyCallback] callback failure — shop:', shop, '| error:', errMsg);
        setError(errMsg);
        setStatus('error');
      }
    } catch (err) {
      console.error('[ShopifyCallback] Exception during callback:', err.message);
      setError(err.message || 'Failed to complete installation');
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Shield className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">ProfitShield AI</h1>
        </div>

        <Card className="shadow-xl">
          <CardContent className="p-8 text-center">
            {status === 'processing' && (
              <>
                <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-slate-900 mb-2">
                  Connecting to Shopify...
                </h2>
                <p className="text-slate-600">Please wait while we set up your account</p>
              </>
            )}

            {status === 'exchanging' && (
              <>
                <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-slate-900 mb-2">
                  Completing Installation...
                </h2>
                <p className="text-slate-600">Configuring your profit protection</p>
              </>
            )}

            {status === 'success' && (
              <>
                <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-6 h-6 text-emerald-600" />
                </div>
                <h2 className="text-xl font-semibold text-slate-900 mb-2">
                  Installation Complete!
                </h2>
                <p className="text-slate-600">Redirecting to your dashboard...</p>
              </>
            )}

            {status === 'error' && (
              <>
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
                <p className="text-sm text-slate-600">
                  Please try again or contact support if the issue persists.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
