import { SignIn } from '@clerk/nextjs';
import { AuthCardShell } from '@/components/auth-card-shell';

export default function SignInPage() {
  return (
    <AuthCardShell title="Welcome back" sub="Sign in to your DevFlow workspace.">
      <SignIn
        signUpUrl="/register"
        fallbackRedirectUrl="/dashboard"
        appearance={{
          elements: {
            rootBox: { width: '100%' },
            card: { width: '100%', boxShadow: 'none', border: '1px solid var(--border)', background: 'var(--bg-2)' },
          },
        }}
      />
    </AuthCardShell>
  );
}
