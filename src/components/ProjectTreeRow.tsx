import { useState } from 'react';
import { type Task, MOVABLE_GTD_KEYS, GTD_DISPLAY } from '../lib/api';

interface Props {
  parent: Task;
  children: Task[];
  onDone: (number: number) => Promise<void>;
  onMove: (number: number, targetGtd: string) => Promise<void>;
}

export default function ProjectTreeRow({ parent, children, onDone, onMove }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [moveTarget, setMoveTarget] = useState('');
  const [busy, setBusy] = useState(false);

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
  const isOverdue = parent.due != null && parent.due < today;
  const hasChildren = children.length > 0;

  async function handleDone() {
    if (!window.confirm(`#${parent.number} を完了しますか？`)) return;
    setBusy(true);
    try {
      await onDone(parent.number);
    } finally {
      setBusy(false);
    }
  }

  async function handleMove() {
    if (!moveTarget) return;
    setBusy(true);
    try {
      await onMove(parent.number, moveTarget);
      setMoveTarget('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* 親 project 行 */}
      <tr className="project-parent-row">
        <td>
          <span className="issue-num">#{parent.number}</span>
        </td>
        <td>
          <div className="project-title-cell">
            {hasChildren ? (
              <button
                className="expand-btn"
                onClick={() => setExpanded((prev) => !prev)}
                title={expanded ? '折りたたむ' : '展開する'}
                aria-expanded={expanded}
              >
                {expanded ? '▼' : '▶'}
              </button>
            ) : (
              <span className="expand-btn-placeholder" />
            )}
            <span>{parent.title}</span>
            {hasChildren && (
              <span className="child-count-badge">{children.length}件</span>
            )}
          </div>
        </td>
        <td>
          {parent.priority && (
            <span className={`badge pri-${parent.priority}`}>{parent.priority}</span>
          )}
        </td>
        <td>
          {parent.due && (
            <span className={`due-date${isOverdue ? ' overdue' : ''}`}>{parent.due}</span>
          )}
        </td>
        <td>
          <div className="task-actions">
            <button
              className="btn btn-danger"
              onClick={handleDone}
              disabled={busy}
              title="完了（Issue クローズ）"
            >
              完了
            </button>
            <select
              value={moveTarget}
              onChange={(e) => setMoveTarget(e.target.value)}
              disabled={busy}
            >
              <option value="">移動先...</option>
              {MOVABLE_GTD_KEYS
                .filter((k) => k !== parent.gtdCategory)
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
        </td>
      </tr>

      {/* 子タスク行（展開時のみ） */}
      {expanded && children.map((child) => (
        <ChildTaskRow
          key={child.number}
          task={child}
          onDone={onDone}
          onMove={onMove}
        />
      ))}
    </>
  );
}

// 子タスク行コンポーネント（インライン定義）
function ChildTaskRow({
  task,
  onDone,
  onMove,
}: {
  task: Task;
  onDone: (number: number) => Promise<void>;
  onMove: (number: number, targetGtd: string) => Promise<void>;
}) {
  const [moveTarget, setMoveTarget] = useState('');
  const [busy, setBusy] = useState(false);

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
    <tr className="project-child-row">
      <td>
        <span className="issue-num">#{task.number}</span>
      </td>
      <td>
        <div className="child-title-cell">
          <span>{task.title}</span>
          <span className={`badge gtd-${task.gtdCategory} gtd-badge-small`}>
            {GTD_DISPLAY[task.gtdCategory as keyof typeof GTD_DISPLAY] ?? task.gtdCategory}
          </span>
        </div>
      </td>
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
            className="btn btn-danger"
            onClick={handleDone}
            disabled={busy}
            title="完了（Issue クローズ）"
          >
            完了
          </button>
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
      </td>
    </tr>
  );
}
