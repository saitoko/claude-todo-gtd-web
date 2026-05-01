import { NavLink } from 'react-router-dom';
import { GTD_KEYS, GTD_DISPLAY, type GtdKey } from '../lib/api';

const GTD_ICON: Record<GtdKey, string> = {
  inbox:     '📥',
  next:      '▶️',
  waiting:   '⏳',
  someday:   '🌈',
  routine:   '🔄',
  project:   '📁',
  reference: '📚',
};

interface Props {
  byCategory: Record<string, number>;
}

export default function CategoryNav({ byCategory }: Props) {
  return (
    <aside className="sidebar">
      <h1>ToDo Manager</h1>
      <nav>
        {GTD_KEYS.map((key: GtdKey) => (
          <NavLink
            key={key}
            to={`/list/${key}`}
            className={({ isActive }) => (isActive ? 'active' : undefined)}
          >
            <span className="nav-icon" aria-label={GTD_DISPLAY[key]}>{GTD_ICON[key]}</span>
            <span className="nav-label">{GTD_DISPLAY[key]}</span>
            {(byCategory[key] != null) && (
              <span className="nav-badge">{byCategory[key]}</span>
            )}
          </NavLink>
        ))}
        <NavLink
          to="/focus"
          className={({ isActive }) => (isActive ? 'active' : undefined)}
        >
          <span className="nav-icon" aria-label="Focus">🎯</span>
          <span className="nav-label">Focus</span>
        </NavLink>
        <NavLink
          to="/insight"
          className={({ isActive }) => (isActive ? 'active' : undefined)}
        >
          <span className="nav-icon" aria-label="Insight">💡</span>
          <span className="nav-label">Insight</span>
        </NavLink>
      </nav>
    </aside>
  );
}
