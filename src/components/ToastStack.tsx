import { createPortal } from 'react-dom';
import type { ToastItem } from '../lib/useToast';

interface Props {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

/**
 * 画面下部に固定表示するトーストスタック（Issue #1656）。
 *
 * アクセシビリティ: コンテナに role="region" aria-label="通知"、各トーストに
 * role="status" aria-live="polite" を付与する（既存の .recur-notice と同じ方針。
 * スクリーンリーダーの読み上げを強制中断させる assertive は使わない）。
 *
 * onAction の呼び出しは非同期（Promise<void> を返しうる）だが、本コンポーネントは
 * 結果を待たない（fire-and-forget）。失敗時のハンドリング（alert()）は各ページの
 * handleUndoDone 内で行う。
 */
export default function ToastStack({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;

  return createPortal(
    <div className="toast-stack" role="region" aria-label="通知">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast" role="status" aria-live="polite">
          <span className="toast-message">{toast.message}</span>
          {toast.actionLabel && toast.onAction && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                const action = toast.onAction;
                // Undoボタン押下時は即座に該当トーストを消す（二重押下防止）
                onDismiss(toast.id);
                action?.();
              }}
            >
              {toast.actionLabel}
            </button>
          )}
        </div>
      ))}
    </div>,
    document.body
  );
}
