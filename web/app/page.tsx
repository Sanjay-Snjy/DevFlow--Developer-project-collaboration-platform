import Link from 'next/link';
import { SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';
import { Show } from '@/components/clerk-show';
import { LogoIcon } from '@/components/ui/logo-icon';
import {
  ArrowRight,
  Boxes,
  Bug,
  CheckCircle2,
  FolderKanban,
  GitPullRequest,
  KanbanSquare,
  Sparkles,
  Zap,
} from 'lucide-react';

export default function HomePage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* Navigation Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 32px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-2)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LogoIcon size={30} />
          <span className="logo-word" style={{ fontSize: 18 }}>DevFlow</span>
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="btn btn-ghost" style={{ cursor: 'pointer' }}>
                Sign In
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="btn btn-primary" style={{ cursor: 'pointer' }}>
                Sign Up
              </button>
            </SignUpButton>
          </Show>

          <Show when="signed-in">
            <Link
              href="/dashboard"
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              Go to Dashboard <ArrowRight style={{ width: 15, height: 15 }} />
            </Link>
            <UserButton afterSignOutUrl="/" />
          </Show>
        </nav>
      </header>

      {/* Hero Section */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <section
          style={{
            maxWidth: 880,
            textAlign: 'center',
            padding: '80px 24px 60px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div
            className="badge badge-accent"
            style={{ marginBottom: 20, padding: '4px 12px', fontSize: 12 }}
          >
            <Zap style={{ width: 13, height: 13 }} /> All-in-one developer workspace
          </div>

          <h1
            style={{
              fontSize: 'clamp(32px, 5vw, 54px)',
              lineHeight: 1.15,
              fontWeight: 800,
              letterSpacing: '-0.03em',
              marginBottom: 20,
            }}
          >
            Ship better software,{' '}
            <span
              style={{
                background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              together.
            </span>
          </h1>

          <p
            style={{
              fontSize: 'clamp(16px, 2vw, 19px)',
              color: 'var(--text-2)',
              maxWidth: 680,
              lineHeight: 1.6,
              marginBottom: 36,
            }}
          >
            DevFlow combines real-time Kanban boards, issue & sprint tracking, GitHub integrations,
            and AI-assisted task workflows into a single high-performance workspace.
          </p>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Show when="signed-out">
              <SignUpButton mode="modal">
                <button
                  className="btn btn-primary btn-lg"
                  style={{ fontSize: 15, padding: '12px 28px', cursor: 'pointer' }}
                >
                  Get Started Free
                </button>
              </SignUpButton>
              <SignInButton mode="modal">
                <button
                  className="btn btn-lg"
                  style={{ fontSize: 15, padding: '12px 28px', cursor: 'pointer' }}
                >
                  Sign In
                </button>
              </SignInButton>
            </Show>

            <Show when="signed-in">
              <Link
                href="/dashboard"
                className="btn btn-primary btn-lg"
                style={{ fontSize: 15, padding: '12px 28px', display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                Launch Workspace <ArrowRight style={{ width: 16, height: 16 }} />
              </Link>
            </Show>
          </div>
        </section>

        {/* Feature Highlights Grid */}
        <section
          style={{
            maxWidth: 1100,
            width: '100%',
            padding: '0 24px 80px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 20,
          }}
        >
          <div className="card card-pad" style={{ background: 'var(--bg-2)' }}>
            <div style={{ color: 'var(--accent)', marginBottom: 12 }}>
              <KanbanSquare style={{ width: 28, height: 28 }} />
            </div>
            <h3 style={{ fontSize: 16, marginBottom: 6 }}>Kanban & Sprints</h3>
            <p style={{ color: 'var(--text-2)', fontSize: 13, lineHeight: 1.5 }}>
              Drag-and-drop boards, customizable swimlanes, and velocity metrics synced live across your team.
            </p>
          </div>

          <div className="card card-pad" style={{ background: 'var(--bg-2)' }}>
            <div style={{ color: 'var(--sky)', marginBottom: 12 }}>
              <Sparkles style={{ width: 28, height: 28 }} />
            </div>
            <h3 style={{ fontSize: 16, marginBottom: 6 }}>AI Breakdown & Planning</h3>
            <p style={{ color: 'var(--text-2)', fontSize: 13, lineHeight: 1.5 }}>
              Intelligently decompose epics into actionable subtasks, estimate effort, and detect delivery risks.
            </p>
          </div>

          <div className="card card-pad" style={{ background: 'var(--bg-2)' }}>
            <div style={{ color: 'var(--green)', marginBottom: 12 }}>
              <GitPullRequest style={{ width: 28, height: 28 }} />
            </div>
            <h3 style={{ fontSize: 16, marginBottom: 6 }}>GitHub Connected</h3>
            <p style={{ color: 'var(--text-2)', fontSize: 13, lineHeight: 1.5 }}>
              Link commits, pull requests, and branch statuses directly to issues and tasks in context.
            </p>
          </div>

          <div className="card card-pad" style={{ background: 'var(--bg-2)' }}>
            <div style={{ color: 'var(--violet)', marginBottom: 12 }}>
              <Boxes style={{ width: 28, height: 28 }} />
            </div>
            <h3 style={{ fontSize: 16, marginBottom: 6 }}>Team Workspaces</h3>
            <p style={{ color: 'var(--text-2)', fontSize: 13, lineHeight: 1.5 }}>
              Manage multiple organizations and projects with granular roles, activity audit logs, and member permissions.
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid var(--border)',
          padding: '24px 32px',
          textAlign: 'center',
          color: 'var(--text-3)',
          fontSize: 12,
          background: 'var(--bg-2)',
        }}
      >
        DevFlow · Developer project & collaboration platform · Powered by Clerk Authentication
      </footer>
    </div>
  );
}
