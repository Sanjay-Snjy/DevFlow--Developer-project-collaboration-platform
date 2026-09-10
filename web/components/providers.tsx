'use client';

import { SWRConfig } from 'swr';
import { SocketProvider } from '@/lib/hooks';
import { ToastProvider } from '@/components/ui';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ revalidateOnFocus: false, dedupingInterval: 1200, errorRetryCount: 2 }}>
      <ToastProvider>
        <SocketProvider>{children}</SocketProvider>
      </ToastProvider>
    </SWRConfig>
  );
}
