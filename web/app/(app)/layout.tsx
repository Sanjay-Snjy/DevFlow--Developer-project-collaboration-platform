'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth as useClerkAuth } from '@clerk/nextjs';
import { AppShell } from '@/components/layout/app-shell';

/**
 * Protected layout gate.
 *
 * We gate on Clerk's own `isLoaded` / `isSignedIn` rather than the backend
 * `/auth/me` response.  This avoids an infinite redirect loop:
 *   /dashboard → backend down → authed=false → /login
 *   /login → Clerk sees signed-in session → /dashboard → …
 *
 * The backend auth data (user profile, workspaces) is loaded separately by
 * `useAuth()` inside `AppShell` and individual pages.
 */
export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useClerkAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace('/login');
  }, [isLoaded, isSignedIn, router]);

  // Wait for Clerk to hydrate before deciding
  if (!isLoaded || !isSignedIn) {
    return (
      <div className="center-box" style={{ minHeight: '100vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  // Clerk says signed in – show the app shell immediately.
  // Backend data (useAuth) will load inside AppShell / pages.
  return <AppShell>{children}</AppShell>;
}
