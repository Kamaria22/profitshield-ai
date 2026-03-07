import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: (failureCount, error) => {
				const status = error?.status || error?.response?.status;
				if (status === 401 || status === 403 || status === 404) return false;
				return failureCount < 2;
			},
			retryDelay: (attempt) => Math.min(3000, 300 * 2 ** attempt),
		},
	},
});
