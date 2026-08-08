import { createPortal } from 'react-dom';
import AddTaskForm from './AddTaskForm';
import type { AddTaskInput } from '../lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (input: AddTaskInput) => Promise<void>;
}

/**
 * モバイル専用のボトムシート風タスク追加パネル。
 * MobileTabBar の FAB ボタンに対応する入力フォームを
 * 画面下部からスライドインするように表示する。
 *
 * FAB ボタン自体は MobileTabBar 内に組み込まれているため、
 * このコンポーネントはボトムシートのみ担当する。
 *
 * onRefresh / onSearch は渡さない。ボトムシート内はタスク追加専用UIのみ。
 */
export default function MobileFab({ open, onClose, onAdd }: Props) {
  if (!open) return null;

  return createPortal(
    <div
      className="mobile-fab-sheet-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="タスクを追加"
    >
      <div
        className="mobile-fab-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mobile-fab-sheet-handle" />
        <div className="mobile-fab-sheet-title">タスクを追加</div>
        <AddTaskForm
          onAdd={async (input) => {
            await onAdd(input);
            onClose();
          }}
        />
      </div>
    </div>,
    document.body
  );
}
