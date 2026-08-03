import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { type Task, MOVABLE_GTD_KEYS, GTD_DISPLAY, api, ApiError } from '../lib/api';
import { stripControlLines, buildFinalBody } from '../lib/taskBody';
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
  const [editingPriority, setEditingPriority] = useState(false);
  const [editingDue, setEditingDue] = useState(false);
  const [dueInputValue, setDueInputValue] = useState(parent.due ?? '');

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
          if (err instanceof ApiError && err.parentStillOpen === true) {
            const closed = err.closedChildren && err.closedChildren.length > 0
              ? err.closedChildren.join(', #')
              : '';
            const msg = closed
              ? `子タスク (#${closed}) はclose済みです。\n親 #${parent.number} のcloseに失敗しました。手動で再試行してください。\n原因: ${err.serverCause ?? ''}`
              : `親 #${parent.number} のcloseに失敗しました。手動で再試行してください。\n原因: ${err.serverCause ?? ''}`;
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
        try {
          await onDone(parent.number);
        } catch (err: unknown) {
          alert(err instanceof Error ? err.message : '完了処理に失敗しました');
        }
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
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '移動処理に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  async function handleSwipeMove(targetGtd: string) {
    try {
      await onMove(parent.number, targetGtd);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '移動処理に失敗しました');
    } finally {
      reset();
    }
  }

  function handleTitleClick() {
    if (isOpen) return;
    onDetail(parent);
  }

  async function handlePriorityChange(newPriority: string) {
    setEditingPriority(false);
    if (newPriority === (parent.priority ?? '')) return;
    try {
      const removeLabels = parent.priority ? [parent.priority] : [];
      const addLabels = newPriority ? [newPriority] : [];
      await api.updateTask(parent.number, { removeLabels, addLabels });
      await onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : '優先度の更新に失敗しました');
    }
  }

  function startEditDue() {
    setDueInputValue(parent.due ?? '');
    setEditingDue(true);
  }

  async function commitDueChange() {
    setEditingDue(false);
    if (dueInputValue === (parent.due ?? '')) return;
    try {
      const rawBody = parent.body ?? '';
      const displayBody = stripControlLines(rawBody);
      const newBody = buildFinalBody(displayBody, rawBody, dueInputValue);
      await api.updateTask(parent.number, { body: newBody });
      await onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : '期日の更新に失敗しました');
    }
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
          <span className="issue-num">{parent.number}</span>
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
        <td
          onClick={() => !editingPriority && setEditingPriority(true)}
          style={{ cursor: 'pointer' }}
        >
          {editingPriority ? (
            <select
              autoFocus
              value={parent.priority ?? ''}
              onChange={(e) => handlePriorityChange(e.target.value)}
              onBlur={() => setEditingPriority(false)}
              className="inline-select"
              onClick={(e) => e.stopPropagation()}
            >
              <option value="">なし</option>
              <option value="p1">p1（高）</option>
              <option value="p2">p2（中）</option>
              <option value="p3">p3（低）</option>
            </select>
          ) : parent.priority ? (
            <span className={`badge pri-${parent.priority}`}>{parent.priority}</span>
          ) : (
            <span className="inline-empty">-</span>
          )}
        </td>
        <td
          onClick={() => !editingDue && startEditDue()}
          style={{ cursor: 'pointer' }}
        >
          {editingDue ? (
            <input
              type="date"
              autoFocus
              value={dueInputValue}
              onChange={(e) => setDueInputValue(e.target.value)}
              onBlur={commitDueChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitDueChange();
                if (e.key === 'Escape') setEditingDue(false);
              }}
              className="inline-date"
              onClick={(e) => e.stopPropagation()}
            />
          ) : parent.due ? (
            <span className={`due-date${isOverdue ? ' overdue' : ''}`}>{parent.due}</span>
          ) : (
            <span className="inline-empty">-</span>
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
                className="btn btn-icon"
                onClick={handleMove}
                disabled={busy || !moveTarget}
              >
                ➡️
              </button>
            </div>
            <button
              className="btn btn-icon"
              onClick={() => {
                if (hasChildren) { setShowConfirm(true); return; }
                if (!window.confirm(`#${parent.number} を完了しますか？`)) return;
                setBusy(true);
                onDone(parent.number)
                  .catch((err: unknown) => {
                    alert(err instanceof Error ? err.message : '完了処理に失敗しました');
                  })
                  .finally(() => setBusy(false));
              }}
              disabled={busy}
              title="完了（Issue クローズ）"
            >
              ✅
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
          onRefresh={onRefresh}
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
            <button className="swipe-btn-done" onClick={(e) => { e.stopPropagation(); handleSwipeDone(); }} disabled={busy}>✅</button>
            <button className="swipe-btn-move" onClick={(e) => { e.stopPropagation(); setShowMoveDialog(true); }} disabled={busy}>➡️</button>
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
  onRefresh,
}: {
  task: Task;
  onDone: (number: number) => Promise<void>;
  onMove: (number: number, targetGtd: string) => Promise<void>;
  onDetail: (task: Task) => void;
  onRefresh: () => Promise<void>;
}) {
  const [moveTarget, setMoveTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [editingPriority, setEditingPriority] = useState(false);
  const [editingDue, setEditingDue] = useState(false);
  const [dueInputValue, setDueInputValue] = useState(task.due ?? '');

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
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '移動処理に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  async function handleSwipeMove(targetGtd: string) {
    try {
      await onMove(task.number, targetGtd);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '移動処理に失敗しました');
    } finally {
      reset();
    }
  }

  function handleTitleClick() {
    if (isOpen) return;
    onDetail(task);
  }

  async function handlePriorityChange(newPriority: string) {
    setEditingPriority(false);
    if (newPriority === (task.priority ?? '')) return;
    try {
      const removeLabels = task.priority ? [task.priority] : [];
      const addLabels = newPriority ? [newPriority] : [];
      await api.updateTask(task.number, { removeLabels, addLabels });
      await onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : '優先度の更新に失敗しました');
    }
  }

  function startEditDue() {
    setDueInputValue(task.due ?? '');
    setEditingDue(true);
  }

  async function commitDueChange() {
    setEditingDue(false);
    if (dueInputValue === (task.due ?? '')) return;
    try {
      const rawBody = task.body ?? '';
      const displayBody = stripControlLines(rawBody);
      const newBody = buildFinalBody(displayBody, rawBody, dueInputValue);
      await api.updateTask(task.number, { body: newBody });
      await onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : '期日の更新に失敗しました');
    }
  }

  return (
    <>
      <tr
        ref={containerRef as React.RefObject<HTMLTableRowElement>}
        className={`project-child-row${task.priority ? ` pri-${task.priority}` : ''}`}
        {...handlers}
      >
        <td>
          <span className="issue-num">{task.number}</span>
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
        <td
          onClick={() => !editingPriority && setEditingPriority(true)}
          style={{ cursor: 'pointer' }}
        >
          {editingPriority ? (
            <select
              autoFocus
              value={task.priority ?? ''}
              onChange={(e) => handlePriorityChange(e.target.value)}
              onBlur={() => setEditingPriority(false)}
              className="inline-select"
              onClick={(e) => e.stopPropagation()}
            >
              <option value="">なし</option>
              <option value="p1">p1（高）</option>
              <option value="p2">p2（中）</option>
              <option value="p3">p3（低）</option>
            </select>
          ) : task.priority ? (
            <span className={`badge pri-${task.priority}`}>{task.priority}</span>
          ) : (
            <span className="inline-empty">-</span>
          )}
        </td>
        <td
          onClick={() => !editingDue && startEditDue()}
          style={{ cursor: 'pointer' }}
        >
          {editingDue ? (
            <input
              type="date"
              autoFocus
              value={dueInputValue}
              onChange={(e) => setDueInputValue(e.target.value)}
              onBlur={commitDueChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitDueChange();
                if (e.key === 'Escape') setEditingDue(false);
              }}
              className="inline-date"
              onClick={(e) => e.stopPropagation()}
            />
          ) : task.due ? (
            <span className={`due-date${isOverdue ? ' overdue' : ''}`}>{task.due}</span>
          ) : (
            <span className="inline-empty">-</span>
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
                className="btn btn-icon"
                onClick={handleMove}
                disabled={busy || !moveTarget}
              >
                ➡️
              </button>
            </div>
            <button
              className="btn btn-icon"
              onClick={async () => {
                if (!window.confirm(`#${task.number} を完了しますか？`)) return;
                setBusy(true);
                try {
                  await onDone(task.number);
                } catch (err: unknown) {
                  alert(err instanceof Error ? err.message : '完了処理に失敗しました');
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
              title="完了（Issue クローズ）"
            >
              ✅
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
            <button className="swipe-btn-done" onClick={(e) => { e.stopPropagation(); handleSwipeDone(); }} disabled={busy}>✅</button>
            <button className="swipe-btn-move" onClick={(e) => { e.stopPropagation(); setShowMoveDialog(true); }} disabled={busy}>➡️</button>
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
