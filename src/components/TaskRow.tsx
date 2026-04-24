import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { type Task, MOVABLE_GTD_KEYS, GTD_DISPLAY } from '../lib/api';
import EditForm from './EditForm';
import MoveDialog from './MoveDialog';
import { useSwipeReveal } from '../hooks/useSwipeReveal';

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
  const [showMoveDialog, setShowMoveDialog] = useState(false);

  const { offset, isOpen, handlers, reset, containerRef } = useSwipeReveal();

  // due の色分け（今日以前 = 期限切れ）
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
  const isOverdue = task.due != null && task.due < today;

  async function handleSwipeDone() {
    // スワイプ完了は確認なし
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
    // スワイプが開いているときはタップを無視
    if (isOpen) return;
    onDetail(task.number);
  }

  return (
    <>
      <tr
        ref={containerRef as React.RefObject<HTMLTableRowElement>}
        className={task.priority ? `pri-${task.priority}` : undefined}
        {...handlers}
      >
        <td>
          <span className="issue-num">#{task.number}</span>
        </td>
        <td
          onClick={editOpen ? () => setEditOpen(false) : handleTitleClick}
        >
          <span className="title-text" style={{ cursor: 'pointer' }}>{task.title}</span>
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

      {/* スワイプ完了後: fixed でボタンを表示 */}
      {isOpen && (() => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return null;
        return createPortal(
          <div
            className="swipe-action-portal"
            style={{ top: rect.top, height: rect.height }}
          >
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
