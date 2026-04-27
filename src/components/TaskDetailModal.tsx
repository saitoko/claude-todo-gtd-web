import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { api, type Task, type TaskDetail } from '../lib/api';
import EditForm from './EditForm';

interface Props {
  task: Task;
  onClose: () => void;
  onSaved?: () => void;
}

function formatJST(isoString: string | null): string {
  if (!isoString) return '—';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoString));
}

export default function TaskDetailModal({ task, onClose, onSaved }: Props) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    setEditMode(false);

    api.getTaskDetail(task.number).then((data) => {
      if (!cancelled) {
        setDetail(data);
        setLoading(false);
      }
    }).catch((err: unknown) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : '詳細の取得に失敗しました');
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [task.number]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (editMode) {
          setEditMode(false);
        } else {
          onClose();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, editMode]);

  return createPortal(
    <div
      className="modal-overlay"
      onClick={editMode ? undefined : onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-detail-title"
    >
      <div
        className="modal-dialog task-detail-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {loading && (
          <div className="task-detail-loading">読み込み中...</div>
        )}

        {!loading && error && (
          <div className="task-detail-error">
            <p className="modal-title">エラー</p>
            <p>{error}</p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={onClose}>閉じる</button>
            </div>
          </div>
        )}

        {!loading && !error && detail && (
          <>
            <div className="task-detail-header">
              <p id="task-detail-title" className="modal-title">
                <span className="modal-project-ref">#{detail.number}</span>{' '}
                {detail.title}
              </p>
              <div className="task-detail-header-actions">
                {!editMode && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => setEditMode(true)}
                    title="編集"
                  >
                    ✏️ 編集
                  </button>
                )}
                <button
                  className="btn btn-ghost task-detail-close"
                  onClick={editMode ? () => setEditMode(false) : onClose}
                  title={editMode ? 'キャンセル' : '閉じる'}
                >
                  {editMode ? 'キャンセル' : '✕'}
                </button>
              </div>
            </div>

            {editMode ? (
              <EditForm
                task={detail}
                onSave={async () => {
                  setEditMode(false);
                  setLoading(true);
                  try {
                    const updated = await api.getTaskDetail(task.number);
                    setDetail(updated);
                  } catch {
                    // 再取得失敗は無視
                  } finally {
                    setLoading(false);
                  }
                  onSaved?.();
                }}
                onCancel={() => setEditMode(false)}
              />
            ) : (
              <>
                {/* ラベル */}
                <div className="task-detail-section">
                  <span className="task-detail-label">ラベル</span>
                  {detail.labels.length > 0 ? (
                    <span className="task-detail-value">
                      {detail.labels.map((l, i) => (
                        <span key={i} className="badge">{l}</span>
                      ))}
                    </span>
                  ) : (
                    <span className="task-detail-value task-detail-none">なし</span>
                  )}
                </div>

                {/* 担当者 */}
                <div className="task-detail-section">
                  <span className="task-detail-label">担当者</span>
                  <span className="task-detail-value">
                    {detail.assignees.length > 0
                      ? detail.assignees.join(', ')
                      : <span className="task-detail-none">なし</span>}
                  </span>
                </div>

                {/* 作成日・更新日 */}
                <div className="task-detail-section">
                  <span className="task-detail-label">作成日</span>
                  <span className="task-detail-value">{formatJST(detail.createdAt)}</span>
                </div>
                <div className="task-detail-section">
                  <span className="task-detail-label">更新日</span>
                  <span className="task-detail-value">{formatJST(detail.updatedAt)}</span>
                </div>

                {/* 本文 */}
                {detail.body && (
                  <div className="task-detail-body-section">
                    <div className="task-detail-label">本文</div>
                    <pre className="task-detail-body">{detail.body}</pre>
                  </div>
                )}

                {/* コメント */}
                <div className="task-detail-comments">
                  <div className="task-detail-label">
                    コメント（{detail.comments.length} 件）
                  </div>
                  {detail.comments.length === 0 ? (
                    <p className="task-detail-none">コメントなし</p>
                  ) : (
                    detail.comments.map((c) => (
                      <div key={c.id} className="task-detail-comment">
                        <div className="task-detail-comment-meta">
                          <span className="task-detail-comment-author">{c.author}</span>
                          <span className="task-detail-comment-date">{formatJST(c.createdAt)}</span>
                        </div>
                        <pre className="task-detail-comment-body">{c.body}</pre>
                      </div>
                    ))
                  )}
                </div>

                <div className="modal-actions" style={{ marginTop: 16 }}>
                  <button className="btn btn-ghost" onClick={onClose}>閉じる</button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
