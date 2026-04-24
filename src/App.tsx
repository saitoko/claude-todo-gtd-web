import { useState, useCallback } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import CategoryNav from './components/CategoryNav';
import List from './pages/List';
import { GTD_KEYS, type GtdKey } from './lib/api';

const GTD_KEY_SET = new Set<string>(GTD_KEYS);

function isGtdKey(v: string | undefined): v is GtdKey {
  return !!v && GTD_KEY_SET.has(v);
}

function ListRoute({
  byCategory,
  onCategoryChange,
}: {
  byCategory: Record<string, number>;
  onCategoryChange: (bc: Record<string, number>) => void;
}) {
  const { gtd } = useParams<{ gtd: string }>();
  if (!isGtdKey(gtd)) {
    return <Navigate to="/list/inbox" replace />;
  }
  return <List gtd={gtd} onCategoryChange={onCategoryChange} />;
}

export default function App() {
  const [byCategory, setByCategory] = useState<Record<string, number>>({});

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
              />
            }
          />
        </Routes>
      </main>
    </div>
  );
}
