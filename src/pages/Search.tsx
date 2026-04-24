import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GTD_DISPLAY, type GtdKey, type TaskListResponse } from '../lib/api';
import { useSearch } from '../lib/useSearch';
import TaskDetailModal from '../components/TaskDetailModal';

interface Props {
  getCache: (gtd: GtdKey) => TaskListResponse | null;
  setCache: (gtd: GtdKey, data: TaskListResponse) => void;
}

export default function Search({ getCache, setCache }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTaskNumber, setActiveTaskNumber] = useState<number | null>(null);

  const {
    query,
    setQuery,
    searchBodyEnabled,
    setSearchBodyEnabled,
    results,
    loading,
    error,
  } = useSearch(getCache, setCache);

  // URL クエリパラメータ q を初期値として反映
  useEffect(() => {
    const q = searchParams.get('q') ?? '';
    setQuery(q);
    // 初回マウント時のみ実行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // query 変更時に URL を同期
  useEffect(() => {
    if (query) {
      setSearchParams({ q: query }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  }, [query, setSearchParams]);

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
              <table className="task-table">
                <tbody>
                  {catResults.map(({ task, matchedIn }) => (
                    <tr key={task.number} className="task-row">
                      {/* Issue 番号 */}
                      <td style={{ width: 48, whiteSpace: 'nowrap' }}>
                        <span className="issue-num">#{task.number}</span>
                      </td>

                      {/* タイトル（クリックで詳細モーダル） */}
                      <td>
                        <button
                          className="btn btn-ghost"
                          style={{ textAlign: 'left', fontWeight: 500, padding: '0 4px', color: 'var(--fg)' }}
                          onClick={() => setActiveTaskNumber(task.number)}
                        >
                          {task.title}
                        </button>
                        {matchedIn === 'body' && (
                          <span className="badge" style={{ marginLeft: 6, fontSize: 10, color: 'var(--muted)', background: 'transparent', border: '1px solid var(--border)' }}>
                            本文
                          </span>
                        )}
                      </td>

                      {/* 優先度 */}
                      <td style={{ width: 48, whiteSpace: 'nowrap' }}>
                        {task.priority && (
                          <span className={`badge priority-${task.priority}`}>
                            {task.priority.toUpperCase()}
                          </span>
                        )}
                      </td>

                      {/* 期日 */}
                      <td style={{ width: 100, whiteSpace: 'nowrap' }}>
                        {task.due && (
                          <span className="due-date">{task.due.slice(0, 10)}</span>
                        )}
                      </td>
                    </tr>
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
