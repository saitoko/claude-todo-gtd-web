import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, GTD_DISPLAY, type GtdKey, type TaskListResponse } from '../lib/api';
import { useSearch } from '../lib/useSearch';
import { sortTasks, type SortKey } from '../lib/sortTasks';
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
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

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

  // query 変更時に URL を同期（setSearchParams は安定参照でないため依存配列から除外）
  useEffect(() => {
    if (query) {
      setSearchParams({ q: query }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function thProps(key: SortKey) {
    const active = sortKey === key;
    return {
      className: `th-sortable${active ? ' th-sorted' : ''}`,
      onClick: () => handleSort(key),
    };
  }

  function sortIcon(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="sort-icon">{sortDir === 'asc' ? '▲' : '▼'}</span>;
  }

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

  // カテゴリ別にグルーピング
  const grouped = new Map<string, typeof results>();
  for (const result of results) {
    const cat = result.task.gtdCategory;
    if (!grouped.has(cat)) grouped.set(cat, []);
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

      {error && (
        <div className="search-error-banner">
          一部カテゴリの取得に失敗しました: {error}
        </div>
      )}

      {loading && <div className="loading">検索中...</div>}

      {!loading && !query && (
        <div className="search-hint">キーワードを入力してください</div>
      )}

      {!loading && query && results.length === 0 && !error && (
        <div className="search-empty">"{query}" に一致するタスクはありません</div>
      )}

      {!loading && results.length > 0 && (
        <div className="task-list">
          {Array.from(grouped.entries()).map(([cat, catResults]) => {
            const tasks = catResults.map(r => r.task);
            const sorted = sortKey ? sortTasks(tasks, sortKey, sortDir) : tasks;
            return (
              <div key={cat}>
                <div className="search-result-group-header">
                  {GTD_DISPLAY[cat as GtdKey] ?? cat}
                  <span className="nav-badge" style={{ marginLeft: 6 }}>{catResults.length}</span>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 60 }} {...thProps('number')}># {sortIcon('number')}</th>
                      <th {...thProps('title')}>タイトル {sortIcon('title')}</th>
                      <th style={{ width: 60 }} {...thProps('priority')}>優先度 {sortIcon('priority')}</th>
                      <th style={{ width: 100 }} {...thProps('due')}>期日 {sortIcon('due')}</th>
                      <th style={{ width: 280 }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((task) => (
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
            );
          })}
        </div>
      )}

      {activeTaskNumber !== null && (
        <TaskDetailModal
          taskNumber={activeTaskNumber}
          onClose={() => setActiveTaskNumber(null)}
        />
      )}
    </div>
  );
}
