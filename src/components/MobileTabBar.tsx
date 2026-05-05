import { useLocation, NavLink } from 'react-router-dom';

interface Props {
  /** タスク追加FABが押されたときのコールバック */
  onFabClick: () => void;
}

/**
 * モバイル専用の下部タブバー（max-width: 640px のみ表示）。
 * 5タブ構成: Lists / Inbox / Focus / Insight / Search
 * 中央に FAB（+ボタン）を配置。
 *
 * Lists タブ: /list/:gtd すべてでアクティブ
 * Inbox タブ: /list/inbox のみ
 * Focus: /focus
 * Insight: /insight
 * Search: /search
 */
export default function MobileTabBar({ onFabClick }: Props) {
  const location = useLocation();
  const isListsActive = location.pathname.startsWith('/list/');

  return (
    <nav className="mobile-tab-bar" aria-label="メインナビゲーション">
      {/* Lists タブ（/list/:gtd 全体でアクティブ） */}
      <NavLink
        to="/list/inbox"
        className={isListsActive ? 'mobile-tab-item active' : 'mobile-tab-item'}
        aria-current={isListsActive ? 'page' : undefined}
      >
        <span className="mobile-tab-icon">≡</span>
        <span className="mobile-tab-label">Lists</span>
      </NavLink>

      {/* Inbox タブ（Inbox直接） */}
      <NavLink
        to="/list/inbox"
        className={({ isActive }) =>
          `mobile-tab-item${isActive ? ' active' : ''}`
        }
        end
      >
        <span className="mobile-tab-icon">📥</span>
        <span className="mobile-tab-label">Inbox</span>
      </NavLink>

      {/* FAB（中央） */}
      <div className="mobile-fab-slot">
        <button
          className="mobile-fab"
          onClick={onFabClick}
          aria-label="タスクを追加"
          title="タスクを追加"
        >
          +
        </button>
      </div>

      {/* Focus タブ */}
      <NavLink
        to="/focus"
        className={({ isActive }) =>
          `mobile-tab-item${isActive ? ' active' : ''}`
        }
      >
        <span className="mobile-tab-icon">@</span>
        <span className="mobile-tab-label">Focus</span>
      </NavLink>

      {/* Search タブ */}
      <NavLink
        to="/search"
        className={({ isActive }) =>
          `mobile-tab-item${isActive ? ' active' : ''}`
        }
      >
        <span className="mobile-tab-icon">🔍</span>
        <span className="mobile-tab-label">Search</span>
      </NavLink>
    </nav>
  );
}
