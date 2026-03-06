import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

function hasRequiredParams(search: string) {
  const params = new URLSearchParams(search);
  return !!(params.get('shop') && params.get('host') && params.get('embedded') === '1');
}

export default function EmbeddedEntry() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (hasRequiredParams(location.search)) {
      navigate(`/auth/loading${location.search}`, { replace: true });
    }
  }, [location.search, navigate]);

  return (
    <main style={{ fontFamily: 'system-ui, -apple-system, sans-serif', padding: 24 }}>
      <h1 style={{ marginBottom: 8 }}>ProfitShield Embedded Entry</h1>
      <p style={{ margin: 0, color: '#444' }}>
        Missing required Shopify embedded parameters (`shop`, `host`, `embedded=1`).
      </p>
    </main>
  );
}
