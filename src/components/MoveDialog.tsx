import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MOVABLE_GTD_KEYS, GTD_DISPLAY } from '../lib/api';

interface Props {
  taskNumber: number;
  currentGtd: string;
  onMove: (targetGtd: string) => Promise<void>;
  onClose: () => void;
}

/**
 * スワイプ「移動」ボタン押下後の移動先選択ダイアログ
 * GTD カテゴリ一覧をボタン形式で表示する
 */
export default function MoveDialog({ taskNumber, currentGtd, onMove, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Escape キーで閉じる
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  async function handleSelect(targetGtd: string) {
    setBusy(true);
    setError(null);
    try {
      await onMove(targetGtd);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '移動に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  const targets = MOVABLE_GTD_KEYS.filter((k) => k !== currentGtd);

  return createPortal(
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="move-dialog-title"
    >
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <p id="move-dialog-title" className="modal-title">
          <span className="modal-project-ref">#{taskNumber}</span> の移動先を選択
        </p>
        {error && (
          <p style={{ color: 'var(--danger)', fontSize: 13, margin: '0 0 10px' }}>{error}</p>
        )}
        <div className="modal-actions" style={{ flexDirection: 'column', gap: 6 }}>
          {targets.map((k) => (
            <button
              key={k}
              className="btn btn-secondary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => handleSelect(k)}
              disabled={busy}
            >
              {GTD_DISPLAY[k]}
            </button>
          ))}
        </div>
        <div className="modal-actions" style={{ marginTop: 12 }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            キャンセル
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
