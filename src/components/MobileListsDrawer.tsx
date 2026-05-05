import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { GTD_KEYS } from '../lib/api';
import { useGtdLabels } from '../lib/GtdLabelsContext';

interface Props {
  open: boolean;
  onClose: () => void;
  /** カテゴリ別タスク件数（0の場合はバッジ非表示） */
  byCategory?: Record<string, number>;
}

/**
 * モバイル専用: Lists タブから開くカテゴリ選択ドロワー。
 * PC のサイドバー（CategoryNav）と同じ GTD カテゴリ一覧をボトムシート風に表示する。
 *
 * - createPortal で document.body に直接マウント（タブバーの z-index の影響を受けない）
 * - slideUpSheet アニメーションで下から sliding in
 * - backdrop タップで閉じる
 * - カテゴリ選択で /list/:gtd に遷移 + onClose 呼び出し
 */
export default function MobileListsDrawer({ open, onClose, byCategory = {} }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { labels } = useGtdLabels();

  // ドロワーが開いている間は body のスクロールを抑制する
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  function handleSelect(gtdKey: string) {
    navigate(`/list/${gtdKey}`);
    onClose();
  }

  // 現在表示中の GTD カテゴリを取得（/list/:gtd のパターン）
  const currentGtd = location.pathname.startsWith('/list/')
    ? location.pathname.replace('/list/', '')
    : null;

  const drawer = (
    <div
      className="mobile-lists-drawer-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="カテゴリ選択"
      onClick={onClose}
    >
      {/* シート本体（クリックが backdrop に伝搬しないよう stopPropagation） */}
      <div
        className="mobile-lists-drawer-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ハンドル */}
        <div className="mobile-lists-drawer-handle" aria-hidden="true" />

        {/* タイトル */}
        <div className="mobile-lists-drawer-title">Lists</div>

        {/* カテゴリ一覧 */}
        <nav aria-label="GTDカテゴリ">
          {GTD_KEYS.map((key) => {
            const displayName = labels[key] ?? key;
            const emoji = displayName.split(' ')[0];
            const label = displayName.split(' ').slice(1).join(' ');
            const count = byCategory[key] ?? 0;
            const isActive = currentGtd === key;

            return (
              <button
                key={key}
                className={`mobile-lists-drawer-item${isActive ? ' active' : ''}`}
                onClick={() => handleSelect(key)}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="mobile-lists-drawer-emoji" aria-hidden="true">
                  {emoji}
                </span>
                <span className="mobile-lists-drawer-name">{label}</span>
                {count > 0 && (
                  <span className="mobile-lists-drawer-badge" aria-label={`${count}件`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* 閉じるボタン */}
        <button
          className="mobile-lists-drawer-close"
          onClick={onClose}
          aria-label="閉じる"
        >
          閉じる
        </button>
      </div>
    </div>
  );

  return createPortal(drawer, document.body);
}
