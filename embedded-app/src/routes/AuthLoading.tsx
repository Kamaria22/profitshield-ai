import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { exchangeShopifySession } from '../lib/sessionExchange';
import { getSessionTokenOrNull, getShopDomainFromUrl } from '../lib/appBridge';

type Phase = 'initializing' | 'sessionExchange' | 'error';

const CONTEXT_KEY = 'profitshield_embedded_ctx';

export default function AuthLoading() {
  const navigate = useNavigate();
  const location = useLocation();
  const [phase, setPhase] = useState<Phase>('initializing');
  const [message, setMessage] = useState('Initializing embedded app context...');

  useEffect(() => {
    let active = true;

    (async () => {
      const shop = getShopDomainFromUrl();
      if (!shop) {
        if (active) {
          setPhase('error');
          setMessage('Missing shop parameter. Open this app from Shopify Admin.');
        }
        return;
      }

      const token = await getSessionTokenOrNull();
      if (!active) return;

      setPhase('sessionExchange');
      setMessage('Authenticating with Shopify...');

      const data = await exchangeShopifySession({ shop, sessionToken: token });
      if (!active) return;

      if (data?.authenticated && data?.tenant_id) {
        sessionStorage.setItem(
          CONTEXT_KEY,
          JSON.stringify({
            shop_domain: data.shop_domain || shop,
            tenant_id: data.tenant_id,
            integration_id: data.integration_id || null,
            ts: Date.now(),
          })
        );
        navigate(`/dashboard${location.search}`, { replace: true });
        return;
      }

      if (data?.install_required) {
        setPhase('error');
        setMessage('Shop is not installed yet. Complete Shopify app install first.');
        return;
      }

      setPhase('error');
      setMessage(data?.error || 'Shopify authentication failed.');
    })();

    return () => {
      active = false;
    };
  }, [location.search, navigate]);

  return (
    <main style={{ fontFamily: 'system-ui, -apple-system, sans-serif', padding: 24 }}>
      <h1 style={{ marginBottom: 8 }}>ProfitShield AI</h1>
      <p style={{ marginTop: 0, color: '#444' }}>{message}</p>
      <small style={{ color: '#666' }}>Phase: {phase}</small>
    </main>
  );
}
