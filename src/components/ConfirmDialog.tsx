import { useEffect } from 'react';

export type ConfirmDialogChoice = 'withChildren' | 'parentOnly' | 'cancel';

interface Props {
  projectNumber: number;
  projectTitle: string;
  childCount: number;
  onChoice: (choice: ConfirmDialogChoice) => void;
}

/**
 * 子タスクを持つプロジェクトの完了確認ダイアログ（3択モーダル）
 *
 * - 「子タスクも全部完了する」→ withChildren
 * - 「親プロジェクトだけ完了する」→ parentOnly
 * - 「キャンセル」→ cancel
 * Escape キー / オーバーレイクリックでキャンセル扱い
 */
export default function ConfirmDialog({ projectNumber, projectTitle, childCount, onChoice }: Props) {
  // Escape キーでキャンセル
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onChoice('cancel');
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onChoice]);

  return (
    <div
      className="modal-overlay"
      onClick={() => onChoice('cancel')}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      {/* クリックを内側に伝播させない */}
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <p id="confirm-dialog-title" className="modal-title">
          プロジェクト <span className="modal-project-ref">#{projectNumber}</span> を完了しますか？
        </p>
        <p className="modal-body">
          「{projectTitle}」には、オープンの子タスクが <strong>{childCount} 件</strong> あります。
        </p>
        <div className="modal-actions">
          <button
            className="btn btn-danger"
            onClick={() => onChoice('withChildren')}
            autoFocus
          >
            子タスクも全部完了する
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => onChoice('parentOnly')}
          >
            親プロジェクトだけ完了する
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => onChoice('cancel')}
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
