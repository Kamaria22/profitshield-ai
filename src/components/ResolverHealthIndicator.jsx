import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { usePlatformResolver, RESOLVER_STATUS, requireResolved } from '@/components/usePlatformResolver';
import { createPageUrl } from '@/components/platformContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, AlertTriangle, XCircle, Loader2 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const STATUS_CONFIG = {
  [RESOLVER_STATUS.RESOLVED]: {
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200',
    icon: CheckCircle,
    iconColor: 'text-emerald-600',
    label: 'Connected'
  },
  [RESOLVER_STATUS.NEEDS_SELECTION]: {
    color: 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200',
    icon: AlertTriangle,
    iconColor: 'text-amber-600',
    label: 'Select Store'
  },
  [RESOLVER_STATUS.ERROR]: {
    color: 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200',
    icon: XCircle,
    iconColor: 'text-red-600',
    label: 'No Store'
  },
  [RESOLVER_STATUS.RESOLVING]: {
    color: 'bg-slate-100 text-slate-600 border-slate-200',
    icon: Loader2,
    iconColor: 'text-slate-500',
    label: 'Loading'
  }
};

const PLATFORM_NAMES = {
  shopify: 'Shopify',
  woocommerce: 'WooCommerce',
  bigcommerce: 'BigCommerce',
  magento: 'Magento',
  stripe: 'Stripe'
};

/**
 * ResolverHealthIndicator - Accessible chip showing resolver status
 * Routes: RESOLVED->Orders, NEEDS_SELECTION->SelectStore, ERROR->Integrations
 */
export default function ResolverHealthIndicator() {
  const location = useLocation();
  const resolver = usePlatformResolver();
  const resolverCheck = requireResolved(resolver);
  
  // Safe access with defaults
  const status = resolver?.status || RESOLVER_STATUS.RESOLVING;
  const platform = resolver?.platform || null;
  const storeKey = resolver?.storeKey || null;
  const integration = resolver?.integration || null;
  const reason = resolver?.reason || null;
  const isResolved = resolverCheck.ok;
  
  const config = STATUS_CONFIG[status] || STATUS_CONFIG[RESOLVER_STATUS.ERROR];
  const Icon = config.icon;
  const isLoading = status === RESOLVER_STATUS.RESOLVING;
  
  // Don't render during initial load
  if (status === RESOLVER_STATUS.RESOLVING) {
    return null;
  }
  
  // Display text based on status
  const getDisplayText = () => {
    if (isResolved && platform) {
      const platformName = PLATFORM_NAMES[platform] || platform;
      const storeName = integration?.store_name || storeKey || 'Store';
      // Truncate long store names
      const truncatedStore = storeName.length > 20 ? storeName.substring(0, 17) + '...' : storeName;
      return `${platformName}: ${truncatedStore}`;
    }
    return config.label;
  };
  
  // Tooltip text with context
  const getTooltipText = () => {
    if (isResolved) {
      return `Connected to ${integration?.store_name || storeKey} - Click to view orders`;
    }
    if (status === RESOLVER_STATUS.NEEDS_SELECTION) {
      return 'Multiple stores available - Click to select';
    }
    if (reason === 'missing_host_in_embedded') {
      return 'Missing host parameter in Shopify embedded mode';
    }
    if (reason === 'integration_tenant_mismatch') {
      return 'Integration configuration error - Click to fix';
    }
    if (reason === 'duplicate_store_key') {
      return 'Duplicate store configuration detected';
    }
    return 'No store connected - Click to configure';
  };
  
  // Determine navigation target
  const getTargetPage = () => {
    if (isResolved) return 'Orders';
    if (status === RESOLVER_STATUS.NEEDS_SELECTION) return 'SelectStore';
    return 'Integrations';
  };
  
  const targetUrl = createPageUrl(getTargetPage(), location.search);
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link 
            to={targetUrl}
            role="button"
            aria-label={`Resolver status: ${status}. ${getTooltipText()}`}
            className="focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 rounded-md"
          >
            <Badge 
              variant="outline" 
              className={`${config.color} cursor-pointer transition-all text-xs max-w-[200px] px-2.5 py-1`}
            >
              <Icon 
                className={`w-3.5 h-3.5 mr-1.5 flex-shrink-0 ${config.iconColor} ${isLoading ? 'animate-spin' : ''}`} 
                aria-hidden="true"
              />
              <span className="truncate font-medium">{getDisplayText()}</span>
            </Badge>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs max-w-[200px]">{getTooltipText()}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}