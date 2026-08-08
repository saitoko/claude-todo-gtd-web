import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, GTD_DISPLAY, GTD_KEYS, type GtdKey, type Task, type TaskListResponse, type AddTaskInput } from '../lib/api';
import { useSearch } from '../lib/useSearch';
import { sortTasks, type SortKey } from '../lib/sortTasks';
import AddTaskForm from '../components/AddTaskForm';
import TaskDetailModal from '../components/TaskDetailModal';
import TaskRow from '../components/TaskRow';
import type { ToastInput } from '../lib/useToast';

// 完了Undoトーストの表示時間（ミリ秒）。List.tsx と同じ値（#1656）。
const UNDO_TOAST_DURATION_MS = 6000;

interface Props {
  getCache: (gtd: GtdKey) => TaskListResponse | null;
  setCache: (gtd: GtdKey, data: TaskListResponse) => void;
  invalidateCache: (gtd?: GtdKey) => void;
  pushToast: (input: ToastInput) => string;
}

export default function Search({ getCache, setCache, invalidateCache, pushToast }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [isComposing, setIsComposing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

  function thProps(key: SortKey, extraClass?: string) {
    const active = sortKey === key;
    const base = extraClass ? `${extraClass} ` : '';
    return {
      className: `${base}th-sortable${active ? ' th-sorted' : ''}`,
      onClick: () => handleSort(key),
    };
  }

  function sortIcon(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="sort-icon">{sortDir === 'asc' ? '▲' : '▼'}</span>;
  }

  /** 完了Undo（#1656）。①元Issueをreopen ②recurCreatedNumberがあれば次周期Issueをclose */
  async function handleUndoDone(number: number, recurCreatedNumber: number | undefined, gtdAtDoneTime: string) {
    try {
      const result = await api.undoDoneTask(number, recurCreatedNumber);
      invalidateCache(gtdAtDoneTime as GtdKey);
      setRefreshKey(k => k + 1);
      if (result.recurCloseFailed) {
        alert(`#${number} は元に戻しましたが、次周期タスク #${recurCreatedNumber} のクローズに失敗しました。手動で確認してください。`);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '元に戻す処理に失敗しました');
    }
  }

  async function handleDone(number: number, gtdCategory: string) {
    const result = await api.doneTask(number);
    invalidateCache(gtdCategory as GtdKey);
    setRefreshKey(k => k + 1);

    const recur = (result.recurCreated ?? []).find((rc) => rc.number === number);
    pushToast({
      message: recur
        ? `#${number} を完了しました。次周期のタスク #${recur.newIssueNumber} を作成しました`
        : `#${number} を完了しました`,
      actionLabel: '元に戻す',
      onAction: () => handleUndoDone(number, recur?.newIssueNumber, gtdCategory),
      durationMs: UNDO_TOAST_DURATION_MS,
    });
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

  async function handleAdd(input: AddTaskInput) {
    await api.addTask(input);
    invalidateCache((input.gtdCategory ?? 'inbox') as GtdKey);
    setRefreshKey(k => k + 1);
  }

  // 検索結果に含まれる GTD カテゴリを収集（絵文字チップ用）
  const availableGtdLabels = useMemo(() => {
    const set = new Set<string>();
    for (const { task } of results) {
      if ((GTD_KEYS as readonly string[]).includes(task.gtdCategory)) {
        set.add(task.gtdCategory);
      }
    }
    // GTD_KEYS の順序に従って並べる
    return GTD_KEYS.filter(k => set.has(k));
  }, [results]);

  // 検索結果からGTDラベルを除いたラベル一覧を収集
  const availableLabels = useMemo(() => {
    const set = new Set<string>();
    for (const { task } of results) {
      for (const label of task.labels) {
        if (!(GTD_KEYS as readonly string[]).includes(label)) set.add(label);
      }
    }
    return Array.from(set).sort();
  }, [results]);

  // ラベル絞り込み後の結果
  const filteredResults = useMemo(() => {
    if (selectedLabels.length === 0) return results;
    return results.filter(({ task }) =>
      selectedLabels.every(label => task.labels.includes(label))
    );
  }, [results, selectedLabels]);

  function toggleLabel(label: string) {
    setSelectedLabels(prev =>
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
    );
  }

  // GTD カテゴリ別絞り込み（selectedLabels 配列で兼用）
  function toggleGtdLabel(key: string) {
    setSelectedLabels(prev =>
      prev.includes(key) ? prev.filter(l => l !== key) : [...prev, key]
    );
  }

  // カテゴリ別にグルーピング
  const grouped = new Map<string, typeof filteredResults>();
  for (const result of filteredResults) {
    const cat = result.task.gtdCategory;
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(result);
  }

  return (
    <div className="list-page">
      <div className="page-header">
        <h2>🔍 検索</h2>
        {query && !loading && (
          <span className="gtd-tip">
            {filteredResults.length}{filteredResults.length !== results.length ? `/${results.length}` : ''} 件
          </span>
        )}
      </div>

      {/* 検索フォーム */}
      <div className="search-form">
        <input
          ref={inputRef}
          type="search"
          className="search-input"
          placeholder="キーワードを入力..."
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={(e) => {
            setIsComposing(false);
            setQuery(e.currentTarget.value);
          }}
        />
      </div>

      <div className="add-task-row">
        <AddTaskForm onAdd={handleAdd} />
      </div>

      {/* 本文検索トグル */}
      <label className="search-body-toggle">
        <input
          type="checkbox"
          checked={searchBodyEnabled}
          onChange={(e) => setSearchBodyEnabled(e.target.checked)}
        />
        本文も検索する
      </label>

      {/* GTD カテゴリ絞り込みチップ（絵文字付き） */}
      {availableGtdLabels.length > 0 && (
        <div className="label-filter">
          {availableGtdLabels.map(key => (
            <button
              key={key}
              className={`label-filter-btn${selectedLabels.includes(key) ? ' active' : ''}`}
              onClick={() => toggleGtdLabel(key)}
            >
              {GTD_DISPLAY[key as GtdKey] ?? key}
            </button>
          ))}
        </div>
      )}

      {/* ラベル絞り込み */}
      {availableLabels.length > 0 && (
        <div className="label-filter">
          {availableLabels.map(label => (
            <button
              key={label}
              className={`label-filter-btn${selectedLabels.includes(label) ? ' active' : ''}`}
              onClick={() => toggleLabel(label)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

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
                      <th {...thProps('number', 'th-num')}># {sortIcon('number')}</th>
                      <th {...thProps('title')}>タイトル {sortIcon('title')}</th>
                      <th {...thProps('priority', 'th-priority')}>優先度 {sortIcon('priority')}</th>
                      <th {...thProps('due', 'th-due')}>期日 {sortIcon('due')}</th>
                      <th className="th-actions">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((task) => (
                      <TaskRow
                        key={task.number}
                        task={task}
                        onDone={() => handleDone(task.number, task.gtdCategory)}
                        onMove={(num, targetGtd) => handleMove(num, targetGtd, task.gtdCategory)}
                        onDetail={(t) => setActiveTask(t)}
                        onSaved={() => { invalidateCache(task.gtdCategory as GtdKey); setRefreshKey(k => k + 1); }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {activeTask !== null && (
        <TaskDetailModal
          task={activeTask}
          onClose={() => setActiveTask(null)}
          onSaved={() => { invalidateCache(); setRefreshKey(k => k + 1); }}
          onMove={(number, targetGtd) => handleMove(number, targetGtd, activeTask.gtdCategory)}
        />
      )}
    </div>
  );
}
