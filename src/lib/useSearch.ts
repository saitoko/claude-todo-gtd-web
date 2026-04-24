import { useState, useEffect, useRef } from 'react';
import { api, GTD_KEYS, type GtdKey, type Task, type TaskListResponse } from './api';

export interface SearchResult {
  task: Task;
  matchedIn: 'title' | 'body';
}

export interface UseSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  searchBodyEnabled: boolean;
  setSearchBodyEnabled: (v: boolean) => void;
  results: SearchResult[];
  loading: boolean;
  error: string | null;
}

export function useSearch(
  getCache: (gtd: GtdKey) => TaskListResponse | null,
  setCache: (gtd: GtdKey, data: TaskListResponse) => void,
  refreshKey: number = 0,
): UseSearchReturn {
  const [query, setQuery] = useState('');
  const [searchBodyEnabled, setSearchBodyEnabled] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // query と searchBodyEnabled の最新値を ref で保持（非同期処理内から参照するため）
  const queryRef = useRef(query);
  const searchBodyEnabledRef = useRef(searchBodyEnabled);
  useEffect(() => { queryRef.current = query; }, [query]);
  useEffect(() => { searchBodyEnabledRef.current = searchBodyEnabled; }, [searchBodyEnabled]);

  useEffect(() => {
    // 空クエリなら即時クリア
    if (query.trim() === '') {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    // アンマウント後の state 更新を防ぐフラグ
    let isMounted = true;

    const timerId = setTimeout(async () => {
      if (!isMounted) return;

      // 補完フェッチが必要かどうかを先に確認
      const needsFetch = GTD_KEYS.some((key) => getCache(key) === null);
      if (needsFetch) {
        setLoading(true);
      }
      setError(null);

      // GTD_KEYS 全件を並列処理
      const categoryResults = await Promise.allSettled(
        GTD_KEYS.map(async (key) => {
          const cached = getCache(key);
          if (cached !== null) {
            return { key, data: cached };
          }
          // 未キャッシュ: APIフェッチ
          const fetched = await api.listTasks(key);
          setCache(key, fetched);
          return { key, data: fetched };
        })
      );

      if (!isMounted) return;

      const errors: string[] = [];
      // task.number → SearchResult のマップ（重複排除用）
      const seen = new Map<number, SearchResult>();

      const currentQuery = queryRef.current;
      const currentBodyEnabled = searchBodyEnabledRef.current;

      // GTD_KEYS 順で処理（インデックス順 = カテゴリ順を維持するため）
      categoryResults.forEach((settled, idx) => {
        if (settled.status === 'rejected') {
          errors.push(`${GTD_KEYS[idx]}: 取得失敗`);
          return;
        }

        const { data } = settled.value;
        const allTasks: Task[] = [
          ...data.tasks,
          ...(data.childTasks ?? []),
        ];

        const q = currentQuery.toLowerCase();

        for (const task of allTasks) {
          // 既に登録済みの task.number はスキップ（重複排除）
          if (seen.has(task.number)) continue;

          const titleMatch = task.title.toLowerCase().includes(q);
          const bodyMatch = currentBodyEnabled && typeof task.body === 'string' && task.body.toLowerCase().includes(q);

          if (titleMatch) {
            seen.set(task.number, { task, matchedIn: 'title' });
          } else if (bodyMatch) {
            seen.set(task.number, { task, matchedIn: 'body' });
          }
        }
      });

      // GTD_KEYS 定義順 → 同カテゴリ内は task.number 降順でソート
      const gtdOrder: Record<string, number> = {};
      GTD_KEYS.forEach((k, i) => { gtdOrder[k] = i; });

      const sorted = Array.from(seen.values()).sort((a, b) => {
        const aOrder = gtdOrder[a.task.gtdCategory] ?? 999;
        const bOrder = gtdOrder[b.task.gtdCategory] ?? 999;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return b.task.number - a.task.number; // 番号降順
      });

      setResults(sorted);
      setError(errors.length > 0 ? errors.join(' / ') : null);
      setLoading(false);
    }, 300);

    return () => {
      isMounted = false;
      clearTimeout(timerId);
    };
    // searchBodyEnabled / refreshKey も依存に含めて本文ON/OFF切替・操作後再検索に対応する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, searchBodyEnabled, refreshKey]);

  return {
    query,
    setQuery,
    searchBodyEnabled,
    setSearchBodyEnabled,
    results,
    loading,
    error,
  };
}
