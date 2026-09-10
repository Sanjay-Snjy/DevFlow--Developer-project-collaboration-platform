'use client';

import React from 'react';
import { SignedIn, SignedOut } from '@clerk/nextjs';

export interface ShowProps {
  when: 'signed-in' | 'signed-out';
  children: React.ReactNode;
}

/**
 * Conditional rendering component matching Clerk's auth control patterns.
 */
export function Show({ when, children }: ShowProps) {
  if (when === 'signed-in') {
    return <SignedIn>{children}</SignedIn>;
  }
  if (when === 'signed-out') {
    return <SignedOut>{children}</SignedOut>;
  }
  return null;
}
