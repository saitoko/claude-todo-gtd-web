import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { type Task, MOVABLE_GTD_KEYS, GTD_DISPLAY, api } from '../lib/api';
import ConfirmDialog, { type ConfirmDialogChoice } from './ConfirmDialog';
import MoveDialog from './MoveDialog';
import { useSwipeReveal } from '../hooks/useSwipeReveal';

interface Props {
  parent: Task;
  children: Task[];
  onDone: (number: number) => Promise<void>;
  onMove: (number: number, targetGtd: string) => Promise<void>;
  /** 子タスクも含めて完了した後など、APIを再呼び出しせずリスト再フェッチだけしたいとき */
  onRefresh: () => Promise<void>;
  onDetail: (task: Task) => void;
}

export default function ProjectTreeRow({ parent, children, onDone, onMove, onRefresh, onDetail }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [moveTarget, setMoveTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);

  const { isOpen, handlers, reset, containerRef } = useSwipeReveal();

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
  const isOverdue = parent.due != null && parent.due < today;
  const hasChildren = children.length > 0;

  async function handleSwipeDone() {
    if (hasChildren) {
      setShowConfirm(true);
      return;
    }
    setBusy(true);
    try {
      await onDone(parent.number);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '完了処理に失敗しました');
      reset();
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmChoice(choice: ConfirmDialogChoice) {
    setShowConfirm(false);
    if (choice === 'cancel') {
      reset();
      return;
    }

    setBusy(true);
    try {
      if (choice === 'withChildren') {
        try {
          await api.doneTask(parent.number, { withChildren: true });
        } catch (err: unknown) {
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
        // parentOnly
        await onDone(parent.number);
      }
    } finally {
      setBusy(false);
      reset();
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

  async function handleSwipeMove(targetGtd: string) {
    await onMove(parent.number, targetGtd);
    reset();
  }

  function handleTitleClick() {
    if (isOpen) return;
    onDetail(parent);
  }

  return (
    <>
      {/* 親 project 行 */}
      <tr
        ref={containerRef as React.RefObject<HTMLTableRowElement>}
        className={`project-parent-row${parent.priority ? ` pri-${parent.priority}` : ''}`}
        {...handlers}
      >
        <td>
          <span className="issue-num">#{parent.number}</span>
        </td>
        <td>
          <div className="project-title-cell">
            {hasChildren ? (
              <button
                className="expand-btn"
                onClick={(e) => { e.stopPropagation(); setExpanded((prev) => !prev); }}
                title={expanded ? '折りたたむ' : '展開する'}
                aria-expanded={expanded}
              >
                {expanded ? '▼' : '▶'}
              </button>
            ) : (
              <span className="expand-btn-placeholder" />
            )}
            <span
              onClick={handleTitleClick}
              style={{ cursor: 'pointer', flex: 1 }}
            >{parent.title}</span>
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
          {/* PC 操作列（モバイルは CSS で display:none） */}
          <div className="task-actions">
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
            <button
              className="btn btn-danger"
              onClick={() => {
                if (hasChildren) { setShowConfirm(true); return; }
                if (!window.confirm(`#${parent.number} を完了しますか？`)) return;
                setBusy(true);
                onDone(parent.number).finally(() => setBusy(false));
              }}
              disabled={busy}
              title="完了（Issue クローズ）"
            >
              完了
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
          onDetail={onDetail}
        />
      ))}

      {/* 完了確認ダイアログ */}
      {showConfirm && createPortal(
        <ConfirmDialog
          projectNumber={parent.number}
          projectTitle={parent.title}
          childCount={children.length}
          onChoice={handleConfirmChoice}
        />,
        document.body
      )}

      {/* スワイプ完了後: fixed でボタンを表示 */}
      {isOpen && (() => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return null;
        return createPortal(
          <div className="swipe-action-portal" style={{ top: rect.top, height: rect.height }}>
            <button className="swipe-btn-done" onClick={(e) => { e.stopPropagation(); handleSwipeDone(); }} disabled={busy}>完了</button>
            <button className="swipe-btn-move" onClick={(e) => { e.stopPropagation(); setShowMoveDialog(true); }} disabled={busy}>移動</button>
          </div>,
          document.body
        );
      })()}

      {showMoveDialog && createPortal(
        <MoveDialog
          taskNumber={parent.number}
          currentGtd={parent.gtdCategory}
          onMove={handleSwipeMove}
          onClose={() => { setShowMoveDialog(false); reset(); }}
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
  onDetail: (task: Task) => void;
}) {
  const [moveTarget, setMoveTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);

  const { isOpen, handlers, reset, containerRef } = useSwipeReveal();

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
  const isOverdue = task.due != null && task.due < today;

  async function handleSwipeDone() {
    setBusy(true);
    try {
      await onDone(task.number);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '完了処理に失敗しました');
      reset();
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

  async function handleSwipeMove(targetGtd: string) {
    await onMove(task.number, targetGtd);
    reset();
  }

  function handleTitleClick() {
    if (isOpen) return;
    onDetail(task);
  }

  return (
    <>
      <tr
        ref={containerRef as React.RefObject<HTMLTableRowElement>}
        className={`project-child-row${task.priority ? ` pri-${task.priority}` : ''}`}
        {...handlers}
      >
        <td>
          <span className="issue-num">#{task.number}</span>
        </td>
        <td>
          <div className="child-title-cell">
            <span
              onClick={handleTitleClick}
              style={{ cursor: 'pointer' }}
            >{task.title}</span>
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
          {/* PC 操作列（モバイルは CSS で display:none） */}
          <div className="task-actions">
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
            <button
              className="btn btn-danger"
              onClick={async () => {
                if (!window.confirm(`#${task.number} を完了しますか？`)) return;
                setBusy(true);
                try { await onDone(task.number); } finally { setBusy(false); }
              }}
              disabled={busy}
              title="完了（Issue クローズ）"
            >
              完了
            </button>
          </div>
        </td>
      </tr>

      {/* スワイプ完了後: fixed でボタンを表示 */}
      {isOpen && (() => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return null;
        return createPortal(
          <div className="swipe-action-portal" style={{ top: rect.top, height: rect.height }}>
            <button className="swipe-btn-done" onClick={(e) => { e.stopPropagation(); handleSwipeDone(); }} disabled={busy}>完了</button>
            <button className="swipe-btn-move" onClick={(e) => { e.stopPropagation(); setShowMoveDialog(true); }} disabled={busy}>移動</button>
          </div>,
          document.body
        );
      })()}

      {showMoveDialog && createPortal(
        <MoveDialog
          taskNumber={task.number}
          currentGtd={task.gtdCategory}
          onMove={handleSwipeMove}
          onClose={() => { setShowMoveDialog(false); reset(); }}
        />,
        document.body
      )}
    </>
  );
}
