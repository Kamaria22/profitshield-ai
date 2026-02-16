import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { usePlatformResolver, RESOLVER_STATUS } from '@/components/usePlatformResolver';
import { createPageUrl } from '@/components/platformContext';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertTriangle, XCircle, Loader2 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const STATUS_CONFIG = {
  [RESOLVER_STATUS.RESOLVED]: {
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    icon: CheckCircle,
    iconColor: 'text-emerald-600'
  },
  [RESOLVER_STATUS.NEEDS_SELECTION]: {
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    icon: AlertTriangle,
    iconColor: 'text-amber-600'
  },
  [RESOLVER_STATUS.ERROR]: {
    color: 'bg-red-100 text-red-700 border-red-200',
    icon: XCircle,
    iconColor: 'text-red-600'
  },
  [RESOLVER_STATUS.RESOLVING]: {
    color: 'bg-slate-100 text-slate-600 border-slate-200',
    icon: Loader2,
    iconColor: 'text-slate-500'
  }
};

const PLATFORM_NAMES = {
  shopify: 'Shopify',
  woocommerce: 'WooCommerce',
  bigcommerce: 'BigCommerce'
};

export default function ResolverHealthIndicator() {
  const location = useLocation();
  const resolver = usePlatformResolver();
  
  const status = resolver?.status || RESOLVER_STATUS.RESOLVING;
  const platform = resolver?.platform || null;
  const storeKey = resolver?.storeKey || null;
  const integration = resolver?.integration || null;
  const reason = resolver?.reason || null;
  
  const config = STATUS_CONFIG[status] || STATUS_CONFIG[RESOLVER_STATUS.ERROR];
  const Icon = config.icon;
  const isLoading = status === RESOLVER_STATUS.RESOLVING;
  
  // Don't show in RESOLVING state for more than a moment
  if (status === RESOLVER_STATUS.RESOLVING) {
    return null;
  }
  
  const getDisplayText = () => {
    if (status === RESOLVER_STATUS.RESOLVED) {
      const platformName = PLATFORM_NAMES[platform] || platform;
      const storeName = integration?.store_name || storeKey;
      return `${platformName}: ${storeName}`;
    }
    if (status === RESOLVER_STATUS.NEEDS_SELECTION) {
      return 'Select Store';
    }
    return 'No Store';
  };
  
  const getTooltipText = () => {
    if (status === RESOLVER_STATUS.RESOLVED) {
      return `Connected to ${integration?.store_name || storeKey}`;
    }
    if (status === RESOLVER_STATUS.NEEDS_SELECTION) {
      return 'Multiple stores available - click to select';
    }
    if (reason === 'missing_host_in_embedded') {
      return 'Missing host parameter in Shopify embedded mode';
    }
    if (reason === 'integration_tenant_mismatch') {
      return 'Integration configuration error';
    }
    return 'No store connected - click to configure';
  };
  
  const content = (
    <Badge 
      variant="outline" 
      className={`${config.color} cursor-pointer hover:opacity-80 transition-opacity text-xs max-w-[180px]`}
    >
      <Icon className={`w-3 h-3 mr-1 flex-shrink-0 ${config.iconColor} ${isLoading ? 'animate-spin' : ''}`} />
      <span className="truncate">{getDisplayText()}</span>
    </Badge>
  );
  
  // If error or needs selection, make it clickable to Integrations
  if (status !== RESOLVER_STATUS.RESOLVED) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link to={createPageUrl(status === RESOLVER_STATUS.NEEDS_SELECTION ? 'SelectStore' : 'Integrations', location.search)}>
              {content}
            </Link>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">{getTooltipText()}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {content}
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{getTooltipText()}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}