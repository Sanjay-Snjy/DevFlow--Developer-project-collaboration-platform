import { SignUp } from '@clerk/nextjs';
import { AuthCardShell } from '@/components/auth-card-shell';

export default function RegisterPage() {
  return (
    <AuthCardShell title="Create your account" sub="Start planning with your team in minutes.">
      <SignUp
        signInUrl="/login"
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
