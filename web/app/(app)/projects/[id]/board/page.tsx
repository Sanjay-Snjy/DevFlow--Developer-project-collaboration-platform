'use client';

import { useParams } from 'next/navigation';
import BoardView from '@/features/board/board-view';

export default function BoardPage() {
  const params = useParams<{ id: string }>();
  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Board</h1>
          <p className="page-sub">Drag tasks between columns to update status — changes sync to everyone in real time.</p>
        </div>
      </div>
      <BoardView projectId={params.id} />
    </div>
  );
}
