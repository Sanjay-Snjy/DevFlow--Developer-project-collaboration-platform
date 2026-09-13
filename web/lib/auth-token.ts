'use client';

/**
 * Bridge between the imperative fetch layer (lib/api.ts) and Clerk's React context.
 * AuthBridgeProvider registers Clerk's getToken; the api wrapper calls it before
 * each request so every call carries a fresh, verified session JWT.
 */

type TokenGetter = () => Promise<string | null>;

let getTokenFn: TokenGetter | null = null;

export function registerTokenGetter(fn: TokenGetter | null) {
  getTokenFn = fn;
}

export async function getAuthToken(): Promise<string | null> {
  if (!getTokenFn) return null;
  try {
    return await getTokenFn();
  } catch {
    return null;
  }
}
