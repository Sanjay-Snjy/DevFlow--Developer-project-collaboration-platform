import Link from 'next/link';
import type { Viewport } from 'next';
import { LogoIcon } from '@/components/ui/logo-icon';
import { LandingHeroActions, LandingNavActions } from '@/components/landing-actions';
import { ScrollClassToggler } from '@/components/scroll-class';
import {
  ArrowRight,
  Bell,
  Bug,
  CheckCircle2,
  GitBranch,
  GitPullRequest,
  KanbanSquare,
  LayoutDashboard,
  MessageSquare,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import './landing.css';

/* The landing page is always dark (see the `.lp` token block in landing.css), so the
   mobile browser chrome is tinted to match its near-black base color. */
export const viewport: Viewport = { themeColor: '#05060a' };

/* ── Small helpers ──────────────────────────────────────────── */

function HeroActions() {
  return <div className="lp-hero-actions"><LandingHeroActions /></div>;
}

function Bullet({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <span style={{ color: 'var(--green)', display: 'inline-flex' }}>{icon}</span>
      <span style={{ fontSize: 13.5, color: 'var(--text-2)' }}>{text}</span>
    </div>
  );
}

/* ── Product mockup (built with the app's own design tokens) ── */

function KanbanMock() {
  const cols: { name: string; count: number; cards: { key: string; title: string; tag: string; tagColor: string; av: string; hue: string; pr?: boolean }[] }[] = [
    {
      name: 'Backlog',
      count: 8,
      cards: [
        { key: 'DEV-142', title: 'Rate-limit the public API', tag: 'Backend', tagColor: 'var(--sky)', av: 'MK', hue: '#0e7490' },
        { key: 'DEV-150', title: 'Audit log export to CSV', tag: 'Feature', tagColor: 'var(--violet)', av: 'JT', hue: '#6d28d9', pr: true },
      ],
    },
    {
      name: 'In progress',
      count: 4,
      cards: [
        { key: 'DEV-138', title: 'Sprint velocity chart on analytics', tag: 'Frontend', tagColor: 'var(--amber)', av: 'AL', hue: '#b45309' },
        { key: 'DEV-145', title: 'Fix flaky auth redirect on refresh', tag: 'Bug', tagColor: 'var(--red)', av: 'MK', hue: '#0e7490' },
      ],
    },
    {
      name: 'In review',
      count: 3,
      cards: [
        { key: 'DEV-131', title: 'GitHub sync: branch status on cards', tag: 'Integration', tagColor: 'var(--green)', av: 'RS', hue: '#15803d', pr: true },
      ],
    },
    {
      name: 'Done',
      count: 12,
      cards: [
        { key: 'DEV-127', title: 'Migrate issues table to new schema', tag: 'Backend', tagColor: 'var(--sky)', av: 'AL', hue: '#b45309' },
        { key: 'DEV-124', title: 'Keyboard shortcuts for board', tag: 'Frontend', tagColor: 'var(--amber)', av: 'JT', hue: '#6d28d9' },
      ],
    },
  ];

  return (
    <div className="lp-shot" aria-hidden>
      {/* window bar */}
      <div className="lp-shot-bar">
        <span className="lp-shot-dot" /><span className="lp-shot-dot" /><span className="lp-shot-dot" />
        <span className="lp-shot-url">app.devflow.dev/board</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8, color: 'var(--text-3)' }}>
          <Search style={{ width: 13, height: 13 }} />
          <Bell style={{ width: 13, height: 13 }} />
        </span>
      </div>

      <div className="lp-shot-body">
        {/* sidebar */}
        <div className="lp-shot-side">
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 8px 12px' }}>
            <LogoIcon size={18} />
            <span style={{ fontWeight: 800, fontSize: 12 }}>DevFlow</span>
          </div>
          {[
            { icon: <LayoutDashboard />, label: 'Dashboard', on: false },
            { icon: <KanbanSquare />, label: 'Board', on: true },
            { icon: <Bug />, label: 'Issues', on: false },
            { icon: <GitPullRequest />, label: 'Pull requests', on: false },
            { icon: <Users />, label: 'Members', on: false },
          ].map((it) => (
            <div key={it.label} className={`lp-shot-navitem${it.on ? ' on' : ''}`}>
              {it.icon} {it.label}
            </div>
          ))}
        </div>

        {/* board */}
        <div className="lp-shot-main">
          <div className="lp-shot-head">
            <span className="lp-shot-title">Sprint 24 — Core platform</span>
            <span className="chip" style={{ fontSize: 10 }}>Mar 3 – Mar 14</span>
          </div>
          <div className="lp-shot-cols">
            {cols.map((col) => (
              <div className="lp-shot-col" key={col.name}>
                <div className="lp-shot-colname">
                  {col.name} <span className="lp-shot-colcount">{col.count}</span>
                </div>
                {col.cards.map((c) => (
                  <div className="lp-shot-card" key={c.key}>
                    <span className="k">{c.key}</span>
                    <div className="t">{c.title}</div>
                    <div className="f">
                      <span className="lp-shot-pill" style={{ background: 'var(--bg-4)', color: c.tagColor, border: '1px solid var(--border)' }}>
                        {c.tag}
                      </span>
                      {c.pr && <GitPullRequest style={{ color: 'var(--green)' }} />}
                      <span style={{ marginLeft: 'auto' }} />
                      <span className="lp-shot-av" style={{ background: c.hue }}>{c.av}</span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────── */

export default function HomePage() {
  return (
    <div className="lp">
      {/* Toggle the nav's blur/tint once scrolling starts */}
      <ScrollClassToggler selector=".lp-nav" className="scrolled" threshold={8} />

      {/* Navigation */}
      <header className="lp-nav">
        <div className="lp-nav-inner">
          <Link href="/" className="lp-brand">
            <LogoIcon size={26} />
            DevFlow
          </Link>

          <nav className="lp-nav-links">
            <a className="lp-nav-link" href="#features">Features</a>
            <a className="lp-nav-link" href="#workflow">Workflow</a>
          </nav>

          <div className="lp-nav-cta">
            <LandingNavActions />
          </div>
        </div>
      </header>

      <main style={{ flex: 1 }}>
        {/* Hero */}
        <section className="lp-hero">
          <div className="lp-hero-glow" />
          <h1>
            The project tool your engineering team <span className="lp-accent">actually keeps using.</span>
          </h1>
          <p className="lp-hero-sub">
            DevFlow connects your boards, issues, sprints and pull requests in one place —
            so plans stay current without the ceremony.
          </p>
          <HeroActions />
        </section>

        {/* Product screenshot mockup */}
        <section className="lp-shot-wrap">
          <KanbanMock />
        </section>


        {/* Features — bento grid */}
        <section className="lp-section" id="features">
          <div className="lp-kicker">Features</div>
          <h2 className="lp-h2">Everything the sprint needs, nothing it doesn&rsquo;t</h2>
          <p className="lp-section-sub">
            Boards, sprints, issues and GitHub stay in sync automatically — the tools stop fighting each other.
          </p>

          <div className="lp-bento">
            {/* AI — wide cell with mini demo */}
            <div className="lp-cell lp-cell-wide">
              <div className="lp-cell-icon"><Sparkles /></div>
              <h3>AI that does the pl anning grunt work</h3>
              <p>
                Break an epic into scoped subtasks, draft estimates and flag delivery risk before
                the sprint starts. You approve; it doesn&rsquo;t guess.
              </p>
              <div className="lp-ai-demo">
                <div className="lp-ai-row">
                  <CheckCircle2 />
                  <div>
                    <div className="r-title">Break down &ldquo;Billing v2 migration&rdquo;</div>
                    <div className="r-meta">Generated 6 subtasks · draft estimates attached</div>
                  </div>
                  <span className="lp-ai-chip">Ready</span>
                </div>
                <div className="lp-ai-row">
                  <CheckCircle2 />
                  <div>
                    <div className="r-title">Risk detected on Sprint 24</div>
                    <div className="r-meta">2 tasks blocked · over capacity by 12%</div>
                  </div>
                  <span className="lp-ai-chip">Review</span>
                </div>
              </div>
            </div>

            {/* Sprints — mid cell with chart */}
            <div className="lp-cell lp-cell-mid">
              <div className="lp-cell-icon i-blue"><Zap /></div>
              <h3>Sprints that track themselves</h3>
              <p>
                Velocity and burndown update as work moves. See slippage the day it starts, not at retro.
              </p>
              <div className="lp-sprint-demo" aria-hidden>
                {[42, 58, 36, 70, 52, 84, 64].map((h, i) => (
                  <div key={i} className={`lp-sprint-bar${i > 4 ? ' dim' : ''}`} style={{ height: `${h}%` }} />
                ))}
              </div>
              <div className="lp-sprint-meta">
                <span>Velocity</span><span>42 → 47 pts</span>
              </div>
            </div>

            {/* GitHub */}
            <div className="lp-cell lp-cell-mid">
              <div className="lp-cell-icon i-green"><GitBranch /></div>
              <h3>GitHub, wired in</h3>
              <p>
                Branches, commits and PR checks appear on the cards they belong to. Close issues by merging.
              </p>
            </div>

            {/* Issues & comments */}
            <div className="lp-cell lp-cell-wide">
              <div className="lp-cell-icon i-violet"><MessageSquare /></div>
              <h3>Discussion lives on the work</h3>
              <p>
                Comments, mentions and activity feeds are attached to issues — decisions stop
                evaporating in chat threads. Realtime updates keep everyone on the same page.
              </p>
            </div>

            {/* Security */}
            <div className="lp-cell lp-cell-mid">
              <div className="lp-cell-icon i-amber"><ShieldCheck /></div>
              <h3>Built for real teams</h3>
              <p>
                Granular roles per project, org workspaces and a full activity audit trail.
              </p>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="lp-section" id="workflow">
          <div className="lp-kicker">Workflow</div>
          <h2 className="lp-h2">Set up in an afternoon, not a quarter</h2>
          <p className="lp-section-sub">
            No migration project. Import your issues, connect GitHub, invite the team.
          </p>

          <div className="lp-steps">
            <div className="lp-step">
              <div className="lp-step-num">1</div>
              <h3>Create your workspace</h3>
              <p>Sign up, name your org, and add your first project. Templates for kanban or scrum included.</p>
            </div>
            <div className="lp-step">
              <div className="lp-step-num">2</div>
              <h3>Connect GitHub</h3>
              <p>Link your repos once. PRs, branches and CI statuses attach themselves to the right issues.</p>
            </div>
            <div className="lp-step">
              <div className="lp-step-num">3</div>
              <h3>Plan your first sprint</h3>
              <p>Drag work into the sprint, let AI draft the breakdown, and start the clock. That&rsquo;s it.</p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-grid">
            <div className="lp-footer-brand">
              <div className="lp-brand">
                <LogoIcon size={24} />
                DevFlow
              </div>
              <p>
                Project tracking, boards and AI-assisted planning for software teams that would
                rather be shipping.
              </p>
            </div>
            <div className="lp-footer-col">
              <h4>Product</h4>
              <a href="#features">Features</a>
              <a href="#workflow">Workflow</a>
              <a href="#features">Integrations</a>
              <a href="#features">Changelog</a>
            </div>
            <div className="lp-footer-col">
              <h4>Resources</h4>
              <a href="#faq">Documentation</a>
              <a href="#faq">API reference</a>
              <a href="#faq">Guides</a>
              <a href="#faq">Support</a>
            </div>
            <div className="lp-footer-col">
              <h4>Company</h4>
              <a href="#faq">About</a>
              <a href="#faq">Blog</a>
              <a href="#faq">Careers</a>
              <a href="#faq">Privacy</a>
            </div>
          </div>
          <div className="lp-footer-base">
            <span>© {new Date().getFullYear()} DevFlow. All rights reserved.</span>
            <span>Built for engineering teams.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ── Tiny inline proof logos ────────────────────────────────── */

function Triangle() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" aria-hidden>
      <path d="M12 3l9 16H3z" />
    </svg>
  );
}
function Hex() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" aria-hidden>
      <path d="M12 2l8.66 5v10L12 22l-8.66-5V7z" />
    </svg>
  );
}
function Diamond() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" aria-hidden>
      <path d="M12 2l10 10-10 10L2 12z" />
    </svg>
  );
}
function Square() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}
function Circle() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" aria-hidden>
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}
