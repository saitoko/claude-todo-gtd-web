import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { type Task, MOVABLE_GTD_KEYS, GTD_DISPLAY } from '../lib/api';
import MoveDialog from './MoveDialog';
import { useSwipeReveal } from '../hooks/useSwipeReveal';

interface Props {
  task: Task;
  onDone: (number: number) => Promise<void>;
  onMove: (number: number, targetGtd: string) => Promise<void>;
  onDetail: (task: Task) => void;
}

export default function TaskRow({ task, onDone, onMove, onDetail }: Props) {
  const [moveTarget, setMoveTarget] = useState('');
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [hidden, setHidden] = useState(false);

  const { isOpen, handlers, reset, containerRef } = useSwipeReveal();

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
  const isOverdue = task.due != null && task.due < today;

  async function handleSwipeDone() {
    reset();
    setHidden(true);
    try {
      await onDone(task.number);
    } catch (err: unknown) {
      setHidden(false);
      alert(err instanceof Error ? err.message : '完了処理に失敗しました');
    }
  }

  async function handleMove() {
    if (!moveTarget) return;
    setHidden(true);
    try {
      await onMove(task.number, moveTarget);
    } catch (err: unknown) {
      setHidden(false);
      alert(err instanceof Error ? err.message : '移動処理に失敗しました');
    }
  }

  async function handleSwipeMove(targetGtd: string) {
    setHidden(true);
    setShowMoveDialog(false);
    try {
      await onMove(task.number, targetGtd);
    } catch (err: unknown) {
      setHidden(false);
      alert(err instanceof Error ? err.message : '移動処理に失敗しました');
    }
  }

  function handleTitleClick() {
    if (isOpen) return;
    onDetail(task);
  }

  return (
    <>
      <tr
        ref={containerRef as React.RefObject<HTMLTableRowElement>}
        className={task.priority ? `pri-${task.priority}` : undefined}
        style={hidden ? { display: 'none' } : undefined}
        {...handlers}
      >
        <td>
          <span className="issue-num">#{task.number}</span>
        </td>
        <td onClick={handleTitleClick}>
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
            <div className="move-group">
              <select
                value={moveTarget}
                onChange={(e) => setMoveTarget(e.target.value)}
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
                disabled={!moveTarget}
              >
                ➡️
              </button>
            </div>
            <button
              className="btn btn-icon"
              onClick={async () => {
                if (!window.confirm(`#${task.number} を完了しますか？`)) return;
                setHidden(true);
                try { await onDone(task.number); } catch (err: unknown) {
                  setHidden(false);
                  alert(err instanceof Error ? err.message : '完了処理に失敗しました');
                }
              }}
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
          <div
            className="swipe-action-portal"
            style={{ top: rect.top, height: rect.height }}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <button
              className="swipe-btn-done"
              onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleSwipeDone(); }}
              onClick={(e) => { e.stopPropagation(); handleSwipeDone(); }}
            >✅</button>
            <button
              className="swipe-btn-move"
              onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setShowMoveDialog(true); }}
              onClick={(e) => { e.stopPropagation(); setShowMoveDialog(true); }}
            >➡️</button>
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
