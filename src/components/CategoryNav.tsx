import { NavLink } from 'react-router-dom';
import { GTD_KEYS, GTD_DISPLAY, type GtdKey } from '../lib/api';

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
            <span className="nav-label">{GTD_DISPLAY[key]}</span>
            {(byCategory[key] != null) && (
              <span className="nav-badge">{byCategory[key]}</span>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
