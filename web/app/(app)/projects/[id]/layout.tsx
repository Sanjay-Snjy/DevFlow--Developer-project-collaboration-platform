'use client';

import { useParams } from 'next/navigation';
import ProjectShell from '@/features/project/project-shell';

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  return <ProjectShell projectId={params.id}>{children}</ProjectShell>;
}
