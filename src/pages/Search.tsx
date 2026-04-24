import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, GTD_DISPLAY, type GtdKey, type TaskListResponse } from '../lib/api';
import { useSearch } from '../lib/useSearch';
import AddTaskForm from '../components/AddTaskForm';
import TaskDetailModal from '../components/TaskDetailModal';
import TaskRow from '../components/TaskRow';

interface Props {
  getCache: (gtd: GtdKey) => TaskListResponse | null;
  setCache: (gtd: GtdKey, data: TaskListResponse) => void;
  invalidateCache: (gtd?: GtdKey) => void;
}

export default function Search({ getCache, setCache, invalidateCache }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTaskNumber, setActiveTaskNumber] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const {
    query,
    setQuery,
    searchBodyEnabled,
    setSearchBodyEnabled,
    results,
    loading,
    error,
  } = useSearch(getCache, setCache, refreshKey);

  // URL クエリパラメータ q が変わったら query に反映
  useEffect(() => {
    const q = searchParams.get('q') ?? '';
    setQuery(q);
  }, [searchParams]);

  // query 変更時に URL を同期
  useEffect(() => {
    if (query) {
      setSearchParams({ q: query }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  }, [query, setSearchParams]);

  async function handleDone(number: number, gtdCategory: string) {
    await api.doneTask(number);
    invalidateCache(gtdCategory as GtdKey);
    setRefreshKey(k => k + 1);
  }

  async function handleMove(number: number, targetGtd: string, currentGtd: string) {
    await api.moveTask(number, targetGtd);
    invalidateCache(currentGtd as GtdKey);
    invalidateCache(targetGtd as GtdKey);
    setRefreshKey(k => k + 1);
  }

  async function handleEdit(gtdCategory: string) {
    invalidateCache(gtdCategory as GtdKey);
    setRefreshKey(k => k + 1);
  }

  async function handleAdd(title: string, gtdCategory: string) {
    await api.addTask({ title, gtdCategory });
    invalidateCache(gtdCategory as GtdKey);
    setRefreshKey(k => k + 1);
  }

  // カテゴリ別にグルーピング（GTD_KEYS の順序を維持）
  const grouped = new Map<string, typeof results>();
  for (const result of results) {
    const cat = result.task.gtdCategory;
    if (!grouped.has(cat)) {
      grouped.set(cat, []);
    }
    grouped.get(cat)!.push(result);
  }

  return (
    <div className="list-page">
      <div className="page-header">
        <h2>検索</h2>
        {query && !loading && (
          <span className="gtd-tip">{results.length} 件</span>
        )}
      </div>

      <AddTaskForm onAdd={handleAdd} />

      {/* 本文検索トグル */}
      <label className="search-body-toggle">
        <input
          type="checkbox"
          checked={searchBodyEnabled}
          onChange={(e) => setSearchBodyEnabled(e.target.checked)}
        />
        本文も検索する
      </label>

      {/* エラーバナー（部分エラーの場合も結果は表示する） */}
      {error && (
        <div className="search-error-banner">
          一部カテゴリの取得に失敗しました: {error}
        </div>
      )}

      {/* ローディング */}
      {loading && (
        <div className="loading">検索中...</div>
      )}

      {/* クエリ空 */}
      {!loading && !query && (
        <div className="search-hint">キーワードを入力してください</div>
      )}

      {/* 結果 0 件 */}
      {!loading && query && results.length === 0 && !error && (
        <div className="search-empty">"{query}" に一致するタスクはありません</div>
      )}

      {/* 検索結果 */}
      {!loading && results.length > 0 && (
        <div className="task-list">
          {Array.from(grouped.entries()).map(([cat, catResults]) => (
            <div key={cat}>
              {/* カテゴリグループヘッダー */}
              <div className="search-result-group-header">
                {GTD_DISPLAY[cat as GtdKey] ?? cat}
                <span className="nav-badge" style={{ marginLeft: 6 }}>{catResults.length}</span>
              </div>

              {/* 各タスク行 */}
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>#</th>
                    <th>タイトル</th>
                    <th style={{ width: 60 }}>優先度</th>
                    <th style={{ width: 100 }}>期日</th>
                    <th style={{ width: 280 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {catResults.map(({ task }) => (
                    <TaskRow
                      key={task.number}
                      task={task}
                      onDone={() => handleDone(task.number, task.gtdCategory)}
                      onMove={(num, targetGtd) => handleMove(num, targetGtd, task.gtdCategory)}
                      onDetail={(num) => setActiveTaskNumber(num)}
                      onEdit={() => handleEdit(task.gtdCategory)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* タスク詳細モーダル */}
      {activeTaskNumber !== null && (
        <TaskDetailModal
          taskNumber={activeTaskNumber}
          onClose={() => setActiveTaskNumber(null)}
        />
      )}
    </div>
  );
}
