'use client';

import { useEffect } from 'react';
import { useAuth as useClerkAuth } from '@clerk/nextjs';
import { SWRConfig } from 'swr';
import { registerTokenGetter } from '@/lib/auth-token';
import { SocketProvider } from '@/lib/hooks';
import { ToastProvider } from '@/components/ui';

/** Registers Clerk's token getter with the imperative fetch layer (lib/api.ts). */
function AuthBridge({ children }: { children: React.ReactNode }) {
  const { getToken } = useClerkAuth();

  useEffect(() => {
    registerTokenGetter(() => getToken());
    return () => registerTokenGetter(null);
  }, [getToken]);

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ revalidateOnFocus: false, dedupingInterval: 1200, errorRetryCount: 2 }}>
      <ToastProvider>
        <AuthBridge>
          <SocketProvider>{children}</SocketProvider>
        </AuthBridge>
      </ToastProvider>
    </SWRConfig>
  );
}
