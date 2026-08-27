'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useNetwork } from '@/app/lib/providers/NetworkStatusProvider';
import { isNetworkError } from '@/app/lib/utils/errorHandler';

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const { setDegraded, setApiOnline, checkApiStatus } = useNetwork();
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
            refetchOnReconnect: true,
            retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
            throwOnError: (error) => {
              if (isNetworkError(error)) {
                setDegraded(true);
                setApiOnline(false);
              }
              return false;
            },
          },
        },
      }),
  );

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        client.invalidateQueries({
          predicate: (query) => {
            const age = Date.now() - (query.state.dataUpdatedAt || 0);
            return age > 30000;
          },
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
