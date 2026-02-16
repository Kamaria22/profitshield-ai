import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePlatformResolver, RESOLVER_STATUS } from '@/components/usePlatformResolver';
import { createPageUrl } from '@/components/platformContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Store, ShoppingBag, Package, RefreshCw, AlertTriangle,
  CheckCircle, XCircle, ArrowRight, Loader2
} from 'lucide-react';

const PLATFORM_CONFIG = {
  shopify: {
    name: 'Shopify',
    icon: ShoppingBag,
    color: 'bg-green-100 text-green-700 border-green-200',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600'
  },
  woocommerce: {
    name: 'WooCommerce',
    icon: Package,
    color: 'bg-purple-100 text-purple-700 border-purple-200',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600'
  },
  bigcommerce: {
    name: 'BigCommerce',
    icon: Store,
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600'
  }
};

export default function SelectStore() {
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    status, 
    availableStores, 
    selectStore, 
    user,
    reason 
  } = usePlatformResolver();

  // Get return URL from query params or default to home
  const urlParams = new URLSearchParams(location.search);
  const returnTo = urlParams.get('return') || 'Home';

  const handleSelectStore = async (integration) => {
    await selectStore(integration);
    
    // Build URL with context and navigate
    const url = createPageUrl(returnTo, `?platform=${integration.platform}&store=${integration.store_key}`);
    navigate(url);
  };

  // If already resolved, redirect
  if (status === RESOLVER_STATUS.RESOLVED) {
    const url = createPageUrl(returnTo, location.search);
    navigate(url);
    return null;
  }

  // Loading state
  if (status === RESOLVER_STATUS.RESOLVING) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto mb-4" />
          <p className="text-slate-500">Loading stores...</p>
        </div>
      </div>
    );
  }

  const hasConnectedStores = availableStores.some(s => s.status === 'connected');
  const connectedStores = availableStores.filter(s => s.status === 'connected');
  const disconnectedStores = availableStores.filter(s => s.status !== 'connected');

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Store className="w-6 h-6 text-emerald-600" />
          </div>
          <CardTitle className="text-xl">Select a Store</CardTitle>
          <CardDescription>
            {reason === 'multiple_stores' 
              ? 'You have multiple stores connected. Please select one to continue.'
              : reason === 'no_active_integrations'
              ? 'No active store connections found. Please reconnect a store.'
              : 'Please select or connect a store to continue.'}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Connected Stores */}
          {connectedStores.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Connected Stores</p>
              {connectedStores.map((integration) => {
                const config = PLATFORM_CONFIG[integration.platform] || PLATFORM_CONFIG.shopify;
                const Icon = config.icon;
                
                return (
                  <button
                    key={integration.id}
                    onClick={() => handleSelectStore(integration)}
                    className="w-full p-4 rounded-lg border-2 border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all text-left flex items-center gap-4"
                  >
                    <div className={`p-2 rounded-lg ${config.iconBg}`}>
                      <Icon className={`w-5 h-5 ${config.iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 truncate">
                        {integration.store_name || integration.store_key}
                      </p>
                      <p className="text-sm text-slate-500 truncate">
                        {integration.store_key}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={config.color}>
                        {config.name}
                      </Badge>
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Disconnected Stores */}
          {disconnectedStores.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-500">Disconnected Stores</p>
              {disconnectedStores.map((integration) => {
                const config = PLATFORM_CONFIG[integration.platform] || PLATFORM_CONFIG.shopify;
                const Icon = config.icon;
                
                return (
                  <div
                    key={integration.id}
                    className="w-full p-4 rounded-lg border border-slate-200 bg-slate-50 flex items-center gap-4"
                  >
                    <div className="p-2 rounded-lg bg-slate-100">
                      <Icon className="w-5 h-5 text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-600 truncate">
                        {integration.store_name || integration.store_key}
                      </p>
                      <p className="text-sm text-slate-400 truncate">
                        {integration.store_key}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-slate-500">
                        {integration.status}
                      </Badge>
                      <XCircle className="w-4 h-4 text-slate-400" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* No Stores Message */}
          {availableStores.length === 0 && (
            <div className="text-center py-8">
              <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-4" />
              <p className="text-slate-600 mb-4">No stores found for your account.</p>
              <Button 
                onClick={() => navigate(createPageUrl('Integrations', location.search))}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                Connect a Store
              </Button>
            </div>
          )}

          {/* Connect New Store */}
          {availableStores.length > 0 && (
            <div className="pt-4 border-t">
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => navigate(createPageUrl('Integrations', location.search))}
              >
                <Store className="w-4 h-4 mr-2" />
                Connect Another Store
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}