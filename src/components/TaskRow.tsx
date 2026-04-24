import { useState } from 'react';
import { type Task, MOVABLE_GTD_KEYS, GTD_DISPLAY } from '../lib/api';
import EditForm from './EditForm';

interface Props {
  task: Task;
  onDone: (number: number) => Promise<void>;
  onMove: (number: number, targetGtd: string) => Promise<void>;
  onDetail: (number: number) => void;
  onEdit: () => Promise<void>;
}

export default function TaskRow({ task, onDone, onMove, onDetail, onEdit }: Props) {
  const [moveTarget, setMoveTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // due の色分け（今日以前 = 期限切れ）
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
  const isOverdue = task.due != null && task.due < today;

  async function handleDone() {
    if (!window.confirm(`#${task.number} を完了しますか？`)) return;
    setBusy(true);
    try {
      await onDone(task.number);
    } finally {
      setBusy(false);
    }
  }

  async function handleMove() {
    if (!moveTarget) return;
    setBusy(true);
    try {
      await onMove(task.number, moveTarget);
      setMoveTarget('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <tr>
        <td>
          <span className="issue-num">#{task.number}</span>
        </td>
        <td
          onClick={editOpen ? () => setEditOpen(false) : undefined}
          style={editOpen ? { cursor: 'pointer' } : undefined}
        >{task.title}</td>
        <td>
          {task.priority && (
            <span className={`badge pri-${task.priority}`}>{task.priority}</span>
          )}
        </td>
        <td>
          {task.due && (
            <span className={`due-date${isOverdue ? ' overdue' : ''}`}>{task.due}</span>
          )}
        </td>
        <td>
          <div className="task-actions">
            <button
              className="btn"
              onClick={() => setEditOpen((prev) => !prev)}
              disabled={busy}
              title="編集"
            >
              ✏️
            </button>
            <button
              className="btn"
              onClick={() => onDetail(task.number)}
              disabled={busy}
              title="詳細を表示"
            >
              詳細
            </button>
            <button
              className="btn btn-danger"
              onClick={handleDone}
              disabled={busy}
              title="完了（Issue クローズ）"
            >
              完了
            </button>
            <div className="move-group">
              <select
                value={moveTarget}
                onChange={(e) => setMoveTarget(e.target.value)}
                disabled={busy}
              >
                <option value="">移動先...</option>
                {MOVABLE_GTD_KEYS
                  .filter((k) => k !== task.gtdCategory)
                  .map((k) => (
                    <option key={k} value={k}>{GTD_DISPLAY[k]}</option>
                  ))}
              </select>
              <button
                className="btn"
                onClick={handleMove}
                disabled={busy || !moveTarget}
              >
                移動
              </button>
            </div>
          </div>
        </td>
      </tr>
      {editOpen && (
        <tr className="edit-form-row-tr">
          <td colSpan={5}>
            <EditForm
              task={task}
              onSave={async () => { setEditOpen(false); await onEdit(); }}
              onCancel={() => setEditOpen(false)}
            />
          </td>
        </tr>
      )}
    </>
  );
}
