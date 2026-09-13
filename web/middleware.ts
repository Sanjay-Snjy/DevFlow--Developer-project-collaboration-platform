import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Everything not listed here requires a signed-in Clerk session.
//
// The Clerk component routes must be public AND matched as a subtree. <SignIn>/<SignUp> are
// rendered from catch-all segments (app/(auth)/login/[[...rest]], .../register/[[...rest]])
// and Clerk throws "component is not configured correctly" if middleware protects any path
// underneath them — so they use ":path*" rather than an exact match.
const isPublicRoute = createRouteMatcher([
  "/",
  "/login/:path*",
  "/register/:path*",
  // Kept as aliases for Clerk's default env-derived URLs.
  "/sign-in/:path*",
  "/sign-up/:path*",
  "/invitations/:path*",
  "/api/github/callback",
]);

export default clerkMiddleware(
  async (auth, req) => {
    if (!isPublicRoute(req)) {
      await auth.protect();
    }
  },
  // Pin the redirect target in code so auth.protect() always lands on this app's own
  // sign-in page instead of depending on NEXT_PUBLIC_CLERK_SIGN_IN_URL being set.
  { signInUrl: "/login", signUpUrl: "/register" }
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
