import Link from 'next/link';

/** Shared chrome around Clerk's <SignIn>/<SignUp> cards on the (auth) pages. */
export function AuthCardShell({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  const isRegister = title.startsWith('Create');
  return (
    <div className="stack" style={{ width: '100%', maxWidth: 420 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 22 }}>{title}</h2>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 13.5 }}>{sub}</p>
      </div>
      {children}
      <div className="muted" style={{ textAlign: 'center', fontSize: 12.5 }}>
        {isRegister ? 'Already have an account? ' : 'Need an account? '}
        <Link href={isRegister ? '/login' : '/register'} style={{ color: 'var(--accent)' }}>
          {isRegister ? 'Sign in' : 'Create one'}
        </Link>
      </div>
    </div>
  );
}
