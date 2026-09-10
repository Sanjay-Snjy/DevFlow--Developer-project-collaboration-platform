import { Boxes, GitPullRequest, Kanban, Sparkles } from 'lucide-react';
import { LogoIcon } from '@/components/ui/logo-icon';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-wrap">
      <aside className="auth-brand">
        <div>
          <div className="flex" style={{ gap: 10 }}>
            <LogoIcon size={30} />
            <span className="logo-word">DevFlow</span>
          </div>
          <h1 style={{ marginTop: 48 }}>Ship better software, together.</h1>
          <p className="pitch">
            Plan work on Kanban boards, track bugs and sprints, review GitHub activity and turn
            ideas into tasks with AI — in one real-time workspace.
          </p>
          <ul>
            <li><Kanban /> Boards, tasks, issues and sprints your whole team shares live</li>
            <li><GitPullButton /> GitHub repositories, commits and pull requests in context</li>
            <li><Sparkles /> AI task breakdowns, issue analysis and sprint planning</li>
            <li><Boxes /> Fine-grained workspace roles and permissions</li>
          </ul>
        </div>
        <div className="dim" style={{ fontSize: 12 }}>Built with Next.js · Node.js · MongoDB · Socket.IO · FastAPI</div>
      </aside>
      <main className="auth-side">{children}</main>
    </div>
  );
}

function GitPullButton() {
  return <GitPullRequest />;
}
