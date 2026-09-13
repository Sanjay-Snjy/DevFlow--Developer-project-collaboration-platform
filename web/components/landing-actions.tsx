'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SignInButton, SignUpButton, UserButton, useAuth as useClerkAuth } from '@clerk/nextjs';

/**
 * Landing page auth calls-to-action.
 *
 * These must render the signed-out CTAs immediately — even before Clerk's JS has loaded,
 * and even if it never loads. Returning `null` while `!isLoaded` meant any Clerk
 * misconfiguration (missing/placeholder NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, a blocked
 * Clerk CDN, offline visitor) made "Sign in" / "Start free" vanish with no error. The
 * signed-in state now only *upgrades* the CTA once Clerk confirms a session.
 *
 * Auth happens in Clerk's modal (mode="modal") rather than by navigating to /login or
 * /register, so visitors never leave the landing page. Clerk's <SignInButton>/<SignUpButton>
 * are wrapped in `renderWhileLoading`, so the styled <button> child is rendered immediately
 * even before Clerk's JS loads.
 */
export function LandingHeroActions() {
  const { isSignedIn, isLoaded } = useClerkAuth();

  if (isLoaded && isSignedIn) {
    return (
      <Link href="/dashboard" className="btn btn-primary btn-xl" style={{ cursor: 'pointer' }}>
        Go to dashboard <ArrowRight style={{ width: 15, height: 15 }} />
      </Link>
    );
  }

  return (
    <>
      <SignUpButton mode="modal" fallbackRedirectUrl="/dashboard">
        <button type="button" className="btn btn-primary btn-xl">
          Start free <ArrowRight style={{ width: 15, height: 15 }} />
        </button>
      </SignUpButton>
      <SignInButton mode="modal" fallbackRedirectUrl="/dashboard">
        <button type="button" className="btn btn-xl">Sign in</button>
      </SignInButton>
    </>
  );
}

export function LandingNavActions() {
  const { isSignedIn, isLoaded } = useClerkAuth();

  if (isLoaded && isSignedIn) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href="/dashboard" className="btn btn-primary btn-sm">Dashboard</Link>
        <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: { width: 34, height: 34 } } }} />
      </div>
    );
  }

  return (
    <>
      <SignInButton mode="modal" fallbackRedirectUrl="/dashboard">
        <button type="button" className="btn btn-ghost">Sign in</button>
      </SignInButton>
      <SignUpButton mode="modal" fallbackRedirectUrl="/dashboard">
        <button type="button" className="btn btn-primary btn-sm">Get started</button>
      </SignUpButton>
    </>
  );
}