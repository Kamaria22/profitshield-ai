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
  const { 
    status, 
    integration, 
    availableStores, 
    selectStore,
    platform,
    storeKey
  } = usePlatformResolver();

  // Only show if resolved and there are multiple stores
  if (status !== RESOLVER_STATUS.RESOLVED || availableStores.length <= 1) {
    return null;
  }

  const currentStore = integration;
  const CurrentIcon = PLATFORM_ICONS[platform] || Store;
  const connectedStores = availableStores.filter(s => s.status === 'connected');

  const handleSwitchStore = async (store) => {
    if (store.id === currentStore?.id) return;
    
    await selectStore(store);
    
    // Reload current page with new context
    const url = createPageUrl(
      location.pathname.replace('/', '') || 'Home',
      `?platform=${store.platform}&store=${store.store_key}`
    );
    navigate(url);
    window.location.reload(); // Force reload to reset all queries
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 max-w-[200px]">
          <CurrentIcon className={`w-4 h-4 ${PLATFORM_COLORS[platform]}`} />
          <span className="truncate">
            {currentStore?.store_name || storeKey}
          </span>
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Switch Store</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {connectedStores.map((store) => {
          const Icon = PLATFORM_ICONS[store.platform] || Store;
          const isActive = store.id === currentStore?.id;
          
          return (
            <DropdownMenuItem
              key={store.id}
              onClick={() => handleSwitchStore(store)}
              className="cursor-pointer"
            >
              <Icon className={`w-4 h-4 mr-2 ${PLATFORM_COLORS[store.platform]}`} />
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium">
                  {store.store_name || store.store_key}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {store.platform}
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