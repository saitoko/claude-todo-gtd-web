import { useLocation, NavLink } from 'react-router-dom';

interface Props {
  /** タスク追加FABが押されたときのコールバック */
  onFabClick: () => void;
  /** Lists タブが押されたときのコールバック（カテゴリ選択ドロワーを開く） */
  onListsClick: () => void;
}

/**
 * モバイル専用の下部タブバー（max-width: 640px のみ表示）。
 * 6枠構成: Lists / Inbox / FAB（中央）/ Focus / Insight / Search
 *
 * Lists タブ: タップでカテゴリ選択ドロワーを開く（/list/:gtd 全体でアクティブ）
 * Inbox タブ: /list/inbox のみ
 * Focus:   /focus
 * Insight: /insight
 * Search:  /search
 */
export default function MobileTabBar({ onFabClick, onListsClick }: Props) {
  const location = useLocation();
  const isListsActive = location.pathname.startsWith('/list/');

  return (
    <nav className="mobile-tab-bar" aria-label="メインナビゲーション">
      {/* Lists タブ（ドロワーを開く）: NavLink ではなく button */}
      <button
        className={`mobile-tab-item${isListsActive ? ' active' : ''}`}
        onClick={onListsClick}
        aria-current={isListsActive ? 'page' : undefined}
        aria-haspopup="dialog"
        aria-label="カテゴリ一覧を開く"
      >
        <span className="mobile-tab-icon">≡</span>
        <span className="mobile-tab-label">Lists</span>
      </button>

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

      {/* Insight タブ */}
      <NavLink
        to="/insight"
        className={({ isActive }) =>
          `mobile-tab-item${isActive ? ' active' : ''}`
        }
      >
        <span className="mobile-tab-icon">💡</span>
        <span className="mobile-tab-label">Insight</span>
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
