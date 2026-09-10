'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks';
import { AppShell } from '@/components/layout/app-shell';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { authed, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !authed) router.replace('/login');
  }, [authed, isLoading, router]);

  if (isLoading || !authed) {
    return (
      <div className="center-box" style={{ minHeight: '100vh' }}>
        <div className="spinner" />
      </div>
    );
  }
  return <AppShell>{children}</AppShell>;
}
