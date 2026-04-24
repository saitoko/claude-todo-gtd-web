import { useState } from 'react';
import { createPortal } from 'react-dom';
import { type Task, MOVABLE_GTD_KEYS, GTD_DISPLAY, api } from '../lib/api';
import ConfirmDialog, { type ConfirmDialogChoice } from './ConfirmDialog';

interface Props {
  parent: Task;
  children: Task[];
  onDone: (number: number) => Promise<void>;
  onMove: (number: number, targetGtd: string) => Promise<void>;
  /** 子タスクも含めて完了した後など、APIを再呼び出しせずリスト再フェッチだけしたいとき */
  onRefresh: () => Promise<void>;
  onDetail: (number: number) => void;
}

export default function ProjectTreeRow({ parent, children, onDone, onMove, onRefresh, onDetail }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [moveTarget, setMoveTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
  const isOverdue = parent.due != null && parent.due < today;
  const hasChildren = children.length > 0;

  async function handleDone() {
    if (hasChildren) {
      // 子タスクがある場合はモーダルで3択確認
      setShowConfirm(true);
      return;
    }
    // 子タスクなし → 従来通り即完了
    setBusy(true);
    try {
      await onDone(parent.number);
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmChoice(choice: ConfirmDialogChoice) {
    setShowConfirm(false);
    if (choice === 'cancel') return;

    setBusy(true);
    try {
      if (choice === 'withChildren') {
        // サーバー側で子→親の順にクローズ。完了後はリスト再フェッチのみ
        try {
          await api.doneTask(parent.number, { withChildren: true });
        } catch (err: unknown) {
          // 部分成功（子はclose済み・親はopenのまま）の場合に詳細を表示
          const e = err as Record<string, unknown>;
          if (e && e.parentStillOpen === true) {
            const closed = Array.isArray(e.closedChildren) ? e.closedChildren.join(', #') : '';
            const msg = closed
              ? `子タスク (#${closed}) はclose済みです。\n親 #${parent.number} のcloseに失敗しました。手動で再試行してください。\n原因: ${e.cause ?? ''}`
              : `親 #${parent.number} のcloseに失敗しました。手動で再試行してください。\n原因: ${e.cause ?? ''}`;
            alert(msg);
          } else {
            alert(err instanceof Error ? err.message : '完了処理に失敗しました');
          }
          await onRefresh();
          return;
        }
        await onRefresh();
      } else {
        // parentOnly: 親だけ閉じる（従来の onDone を再利用）
        await onDone(parent.number);
      }
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
              className="btn"
              onClick={() => onDetail(parent.number)}
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
          onDetail={onDetail}
        />
      ))}

      {/* 完了確認ダイアログ（Portal 経由で body 直下にマウント） */}
      {showConfirm && createPortal(
        <ConfirmDialog
          projectNumber={parent.number}
          projectTitle={parent.title}
          childCount={children.length}
          onChoice={handleConfirmChoice}
        />,
        document.body
      )}
    </>
  );
}

// 子タスク行コンポーネント（インライン定義）
function ChildTaskRow({
  task,
  onDone,
  onMove,
  onDetail,
}: {
  task: Task;
  onDone: (number: number) => Promise<void>;
  onMove: (number: number, targetGtd: string) => Promise<void>;
  onDetail: (number: number) => void;
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
  );
}
