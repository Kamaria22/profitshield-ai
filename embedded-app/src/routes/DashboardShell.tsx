import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

const CONTEXT_KEY = 'profitshield_embedded_ctx';

export default function DashboardShell() {
  const location = useLocation();

  const context = useMemo(() => {
    try {
      const raw = sessionStorage.getItem(CONTEXT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const shop = new URLSearchParams(location.search).get('shop');

  return (
    <main style={{ fontFamily: 'system-ui, -apple-system, sans-serif', padding: 24 }}>
      <h1 style={{ marginBottom: 8 }}>ProfitShield Dashboard</h1>
      <p style={{ marginTop: 0, color: '#444' }}>
        Embedded frontend scaffold is active.
      </p>
      <div style={{ marginTop: 16, padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
        <div><strong>shop:</strong> {shop || context?.shop_domain || 'unknown'}</div>
        <div><strong>tenant_id:</strong> {context?.tenant_id || 'missing'}</div>
        <div><strong>integration_id:</strong> {context?.integration_id || 'missing'}</div>
      </div>
    </main>
  );
}
