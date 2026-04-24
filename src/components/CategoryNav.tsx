import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { GTD_KEYS, GTD_DISPLAY, type GtdKey } from '../lib/api';

interface Props {
  byCategory: Record<string, number>;
}

export default function CategoryNav({ byCategory }: Props) {
  const [searchValue, setSearchValue] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const navigate = useNavigate();

  return (
    <aside className="sidebar">
      <h1>ToDo Manager</h1>
      <nav>
        {/* 検索インプット */}
        <div className="search-input-wrap">
          <input
            type="search"
            className="search-input"
            placeholder="検索..."
            value={searchValue}
            onChange={(e) => {
              setSearchValue(e.target.value);
              if (!isComposing) {
                navigate(`/search?q=${encodeURIComponent(e.target.value)}`);
              }
            }}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={(e) => {
              setIsComposing(false);
              navigate(`/search?q=${encodeURIComponent(e.currentTarget.value)}`);
            }}
          />
        </div>

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
