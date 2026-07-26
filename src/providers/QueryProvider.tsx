/**
 * TanStack Query provider.
 * Wraps the app so every feature can use useQuery / useMutation.
 * DevTools are included only in development builds.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import type { ReactNode } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale immediately — verification results should always be fresh
      staleTime: 0,
      // Retry once on failure (network hiccup); no retry if 4xx
      retry: (failureCount, error) => {
        if (error instanceof Error && error.message.includes("422")) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
