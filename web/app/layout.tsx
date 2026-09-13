import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { themeInitScript } from '@/lib/theme';

export const metadata: Metadata = {
  title: { default: 'DevFlow', template: '%s · DevFlow' },
  description: 'Developer project & collaboration platform — workspaces, boards, issues, sprints, GitHub and AI.',
};

export const viewport: Viewport = { themeColor: '#0a0c11' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript() }} />
      </head>
      <body>
        <ClerkProvider
          // Keep client-side redirects pointing at the app's own auth pages. Without these
          // Clerk falls back to /sign-in and /sign-up.
          signInUrl="/login"
          signUpUrl="/register"
          appearance={{
            layout: {
              unsafe_disableDevelopmentModeWarnings: true,
            },
            elements: {
              footer: { display: 'none' },
              userButtonPopoverFooter: { display: 'none' },
            },
          }}
        >
          <Providers>{children}</Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}