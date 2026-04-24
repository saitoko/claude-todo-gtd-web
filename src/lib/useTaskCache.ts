import { useRef } from 'react';
import { type TaskListResponse, type GtdKey } from './api';

/** キャッシュの1エントリ */
interface CacheEntry {
  data: TaskListResponse;
  fetchedAt: number; // Date.now() の値（ミリ秒）
}

/** GtdKey ごとのキャッシュストア */
type CacheStore = Partial<Record<GtdKey, CacheEntry>>;

/** TTL（ミリ秒）。5分 */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * GtdKey 単位のフロントエンドキャッシュ。
 * useRef ベースのため、読み書きで App が再レンダリングされない。
 */
export function useTaskCache() {
  const store = useRef<CacheStore>({});

  /**
   * キャッシュから取得を試みる。
   * TTL 切れまたは未キャッシュなら null を返す。
   */
  function getCache(gtd: GtdKey): TaskListResponse | null {
    const entry = store.current[gtd];
    if (entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS) {
      return entry.data;
    }
    return null;
  }

  /** フェッチ結果をキャッシュに保存する */
  function setCache(gtd: GtdKey, data: TaskListResponse): void {
    store.current[gtd] = { data, fetchedAt: Date.now() };
  }

  /**
   * 指定カテゴリのキャッシュを破棄する。
   * 引数なしで全カテゴリを破棄する。
   */
  function invalidateCache(gtd?: GtdKey): void {
    if (gtd !== undefined) {
      delete store.current[gtd];
    } else {
      store.current = {};
    }
  }

  return { getCache, setCache, invalidateCache };
}
