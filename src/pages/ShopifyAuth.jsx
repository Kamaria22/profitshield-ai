import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Shield, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import createApp from '@shopify/app-bridge';
import { Redirect } from '@shopify/app-bridge/actions';

function redirectWithAppBridge(url) {
  try {
    const params = new URLSearchParams(window.location.search);
    const host = params.get('host');
    const shop = params.get('shop');
    const apiKey = window.__SHOPIFY_API_KEY__;
    if (!host || !apiKey) throw new Error('Missing embedded host/apiKey');
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

export default function ShopifyAuth() {
  const [status, setStatus] = useState('loading'); // loading | redirecting | error
  const [error, setError] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shop = params.get('shop');

    if (!shop) {
      setError('Missing shop parameter. Please go back and try again.');
      setStatus('error');
      return;
    }

    async function startOAuth() {
      try {
        setStatus('loading');
        const response = await base44.functions.invoke('shopifyAuth', {
          action: 'install',
          shop
        });
        const installUrl = response?.data?.install_url;
        if (!installUrl) throw new Error('No install URL returned from server.');
        setStatus('redirecting');
        if (!redirectWithAppBridge(installUrl)) {
          window.location.assign(installUrl);
        }
      } catch (e) {
        setError(e.message || 'Failed to start Shopify OAuth.');
        setStatus('error');
      }
    }

    startOAuth();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center max-w-sm px-6">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto mb-5 shadow-lg">
          <Shield className="w-7 h-7 text-white" />
        </div>

        {(status === 'loading' || status === 'redirecting') && (
          <>
            <h1 className="text-xl font-bold text-white mb-2">
              {status === 'redirecting' ? 'Redirecting to Shopify...' : 'Connecting to Shopify...'}
            </h1>
            <p className="text-slate-400 text-sm mb-4">
              {status === 'redirecting'
                ? 'You will be redirected to authorize ProfitShield on your Shopify store.'
                : 'Generating your secure authorization link.'}
            </p>
            <Loader2 className="w-6 h-6 animate-spin text-indigo-400 mx-auto" />
          </>
        )}

        {status === 'error' && (
          <>
            <div className="flex items-center justify-center gap-2 text-red-400 mb-3">
              <AlertCircle className="w-5 h-5" />
              <h1 className="text-lg font-bold">Connection Failed</h1>
            </div>
            <p className="text-slate-400 text-sm mb-5">{error}</p>
            <Button onClick={() => window.history.back()} variant="outline">
              Go Back
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
