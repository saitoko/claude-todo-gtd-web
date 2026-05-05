import { useState, useCallback } from 'react';
import { Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom';
import CategoryNav from './components/CategoryNav';
import MobileTabBar from './components/MobileTabBar';
import MobileFab from './components/MobileFab';
import List from './pages/List';
import Search from './pages/Search';
import Focus from './pages/Focus';
import Insight from './pages/Insight';
import ErrorBoundary from './components/ErrorBoundary';
import { GTD_KEYS, type GtdKey, type TaskListResponse, api } from './lib/api';
import { useTaskCache } from './lib/useTaskCache';
import { useMobileBreakpoint } from './hooks/useMobileBreakpoint';

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
  const isMobile = useMobileBreakpoint();
  const [fabOpen, setFabOpen] = useState(false);
  const navigate = useNavigate();

  const handleCategoryChange = useCallback((bc: Record<string, number>) => {
    setByCategory(bc);
  }, []);

  async function handleFabAdd(title: string, gtdCategory: string) {
    await api.addTask({ title, gtdCategory });
    invalidateCache(gtdCategory as GtdKey);
    invalidateCache();
  }

  return (
    <div className={`app${isMobile ? ' app-mobile' : ''}`}>
      <CategoryNav byCategory={byCategory} />
      <main className={`main${isMobile ? ' main-mobile' : ''}`}>
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
          <Route
            path="/focus"
            element={
              <ErrorBoundary>
                <Focus getCache={getCache} setCache={setCache} invalidateCache={invalidateCache} />
              </ErrorBoundary>
            }
          />
          <Route
            path="/insight"
            element={
              <ErrorBoundary>
                <Insight getCache={getCache} setCache={setCache} invalidateCache={invalidateCache} />
              </ErrorBoundary>
            }
          />
        </Routes>
      </main>

      {/* モバイル専用: 下部タブバー */}
      {isMobile && (
        <MobileTabBar onFabClick={() => setFabOpen(true)} />
      )}

      {/* モバイル専用: FABボトムシート */}
      {isMobile && (
        <MobileFab
          open={fabOpen}
          onClose={() => setFabOpen(false)}
          onAdd={handleFabAdd}
          onRefresh={async () => { invalidateCache(); }}
          onSearch={() => { setFabOpen(false); navigate('/search'); }}
        />
      )}
    </div>
  );
}
