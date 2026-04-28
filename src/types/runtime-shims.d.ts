declare module "@tanstack/react-query" {
  export const useQuery: any;
  export const useMutation: any;
  export const useQueryClient: any;
  export const useInfiniteQuery: any;
  export const useSuspenseQuery: any;
  export const QueryClient: any;
}

declare module "recharts" {
  export const ResponsiveContainer: any;
  export const PieChart: any;
  export const Pie: any;
  export const Cell: any;
  export const Tooltip: any;
  export const LineChart: any;
  export const Line: any;
  export const CartesianGrid: any;
  export const XAxis: any;
  export const YAxis: any;
  export const AreaChart: any;
  export const Area: any;
  export const BarChart: any;
  export const Bar: any;
  export const Legend: any;
}

declare module "@shopify/app-bridge" {
  export interface AppConfigV2 {
    shopOrigin?: string;
  }
}

declare global {
  interface Window {
    __SHOPIFY_API_KEY__?: string;
    base44?: any;
    Capacitor?: any;
  }
}

export {};
