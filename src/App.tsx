import { useState, useCallback } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import CategoryNav from './components/CategoryNav';
import List from './pages/List';
import Search from './pages/Search';
import ErrorBoundary from './components/ErrorBoundary';
import { GTD_KEYS, type GtdKey, type TaskListResponse } from './lib/api';
import { useTaskCache } from './lib/useTaskCache';

const GTD_KEY_SET = new Set<string>(GTD_KEYS);

function isGtdKey(v: string | undefined): v is GtdKey {
  return !!v && GTD_KEY_SET.has(v);
}

function ListRoute({
  byCategory,
  onCategoryChange,
  getCache,
  setCache,
  invalidateCache,
}: {
  byCategory: Record<string, number>;
  onCategoryChange: (bc: Record<string, number>) => void;
  getCache: (gtd: GtdKey) => TaskListResponse | null;
  setCache: (gtd: GtdKey, data: TaskListResponse) => void;
  invalidateCache: (gtd?: GtdKey) => void;
}) {
  const { gtd } = useParams<{ gtd: string }>();
  if (!isGtdKey(gtd)) {
    return <Navigate to="/list/inbox" replace />;
  }
  return (
    <List
      gtd={gtd}
      onCategoryChange={onCategoryChange}
      getCache={getCache}
      setCache={setCache}
      invalidateCache={invalidateCache}
    />
  );
}

export default function App() {
  const [byCategory, setByCategory] = useState<Record<string, number>>({});
  const { getCache, setCache, invalidateCache } = useTaskCache();

  const handleCategoryChange = useCallback((bc: Record<string, number>) => {
    setByCategory(bc);
  }, []);

  return (
    <div className="app">
      <CategoryNav byCategory={byCategory} />
      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/list/inbox" replace />} />
          <Route
            path="/list/:gtd"
            element={
              <ListRoute
                byCategory={byCategory}
                onCategoryChange={handleCategoryChange}
                getCache={getCache}
                setCache={setCache}
                invalidateCache={invalidateCache}
              />
            }
          />
          <Route
            path="/search"
            element={
              <ErrorBoundary>
                <Search getCache={getCache} setCache={setCache} invalidateCache={invalidateCache} />
              </ErrorBoundary>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
