/**
 * React Query default configurations
 * Enterprise-grade query settings for performance under load
 * 
 * TUNED FOR SCALE:
 * - heavyList: 3m staleTime prevents 1000-row refetches
 * - realtime: 15s staleTime for near-instant updates
 * - config: 15m+ staleTime for settings that rarely change
 * - aggregates: 5m for cached dashboard totals
 */

export const queryDefaults = {
  // For most queries
  standard: {
    staleTime: 30 * 1000,           // 30 seconds
    gcTime: 10 * 60 * 1000,         // 10 minutes (renamed from cacheTime)
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  },
  
  // For heavy lists (orders, products, etc.) - TUNED FOR SCALE
  heavyList: {
    staleTime: 3 * 60 * 1000,       // 3 minutes (tuned up from 1m)
    gcTime: 20 * 60 * 1000,         // 20 minutes (tuned up from 15m)
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    placeholderData: (previousData) => previousData, // Keep previous data during refetch
  },
  
  // For real-time data (alerts, notifications)
  realtime: {
    staleTime: 15 * 1000,           // 15 seconds (tuned up from 10s)
    gcTime: 5 * 60 * 1000,          // 5 minutes
    retry: 2,
    refetchOnWindowFocus: true,
    refetchInterval: 30 * 1000,     // Poll every 30s
  },
  
  // For settings/config (rarely changes) - TUNED FOR SCALE
  config: {
    staleTime: 15 * 60 * 1000,      // 15 minutes (tuned up from 5m)
    gcTime: 60 * 60 * 1000,         // 1 hour (tuned up from 30m)
    retry: 1,
    refetchOnWindowFocus: false,
  },
  
  // For auth/user data
  auth: {
    staleTime: 2 * 60 * 1000,       // 2 minutes
    gcTime: 10 * 60 * 1000,         // 10 minutes
    retry: 0,                        // Don't retry auth failures
    refetchOnWindowFocus: false,
  },
  
  // For dashboard aggregates (computed metrics, cached) - NEW
  aggregates: {
    staleTime: 5 * 60 * 1000,       // 5 minutes
    gcTime: 30 * 60 * 1000,         // 30 minutes
    retry: 1,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  },
  
  // For sync jobs / audit logs (recent activity) - NEW
  activity: {
    staleTime: 60 * 1000,           // 1 minute
    gcTime: 5 * 60 * 1000,          // 5 minutes
    retry: 1,
    refetchOnWindowFocus: true,
  }
};

/**
 * Selector helpers to minimize rerenders
 */
export const selectors = {
  // Only return IDs from a list
  ids: (data) => data?.map(item => item.id) || [],
  
  // Return count only
  count: (data) => Array.isArray(data) ? data.length : 0,
  
  // Return first item
  first: (data) => Array.isArray(data) ? data[0] : data,
  
  // Return boolean for existence
  exists: (data) => Array.isArray(data) ? data.length > 0 : !!data,
};

export default queryDefaults;