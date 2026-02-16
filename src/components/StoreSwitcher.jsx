import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePlatformResolver, RESOLVER_STATUS } from '@/components/usePlatformResolver';
import { createPageUrl } from '@/components/platformContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Store, ShoppingBag, Package, ChevronDown, Check, Plus } from 'lucide-react';

const PLATFORM_ICONS = {
  shopify: ShoppingBag,
  woocommerce: Package,
  bigcommerce: Store
};

const PLATFORM_COLORS = {
  shopify: 'text-green-600',
  woocommerce: 'text-purple-600',
  bigcommerce: 'text-blue-600'
};

export default function StoreSwitcher() {
  const navigate = useNavigate();
  const location = useLocation();
  const resolver = usePlatformResolver();
  
  // Safe destructure with defaults
  const status = resolver?.status || RESOLVER_STATUS.RESOLVING;
  const integration = resolver?.integration || null;
  const platform = resolver?.platform || null;
  const storeKey = resolver?.storeKey || null;
  const selectStore = resolver?.selectStore;
  
  // SAFE: Always treat availableStores as array
  const availableStores = Array.isArray(resolver?.availableStores) ? resolver.availableStores : [];
  const connectedStores = availableStores.filter(s => s?.status === 'connected');

  // Only show if resolved and there are multiple stores
  if (status !== RESOLVER_STATUS.RESOLVED || connectedStores.length <= 1) {
    return null;
  }

  const currentStore = integration;
  const CurrentIcon = PLATFORM_ICONS[platform] || Store;

  const handleSwitchStore = async (store) => {
    if (!store || store.id === currentStore?.id) return;
    
    // Call resolver's selectStore
    if (selectStore) {
      await selectStore(store);
    }
    
    // Get current page name from pathname
    const pathParts = location.pathname.split('/').filter(Boolean);
    const currentPage = pathParts[0] || 'home';
    
    // Build URL with new store context using createPageUrl with overrides
    const url = createPageUrl(currentPage, location.search, {
      platform: store.platform,
      storeKey: store.store_key
    });
    
    navigate(url);
    
    // Force reload to reset all queries with new context
    window.location.reload();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 max-w-[200px]">
          <CurrentIcon className={`w-4 h-4 ${PLATFORM_COLORS[platform] || ''}`} />
          <span className="truncate">
            {currentStore?.store_name || storeKey || 'Select Store'}
          </span>
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Switch Store</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {connectedStores.map((store) => {
          if (!store) return null;
          const Icon = PLATFORM_ICONS[store.platform] || Store;
          const isActive = store.id === currentStore?.id;
          
          return (
            <DropdownMenuItem
              key={store.id}
              onClick={() => handleSwitchStore(store)}
              className="cursor-pointer"
            >
              <Icon className={`w-4 h-4 mr-2 ${PLATFORM_COLORS[store.platform] || ''}`} />
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium">
                  {store.store_name || store.store_key || 'Unknown Store'}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {store.platform || 'unknown'}
                </p>
              </div>
              {isActive && <Check className="w-4 h-4 text-emerald-600 ml-2" />}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          onClick={() => navigate(createPageUrl('Integrations', location.search))}
          className="cursor-pointer"
        >
          <Plus className="w-4 h-4 mr-2" />
          Connect New Store
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}