// トースト（画面下部の一時通知）管理フック（Issue #1656）
//
// 本リポジトリは共有状態に React Context を使わず、フックを App.tsx で
// 1回呼び出して props で下流に渡す設計を一貫して採用している
// （useTaskCache → getCache/setCache/invalidateCache と同じ流儀）。
// 本フックも同じパターンに合わせる。
//
// テスト方針: 本リポジトリに React Testing Library 等のコンポーネントテスト基盤が
// 無いため（renderHook相当の手段が無い）、タイマー管理・最大表示件数制御という
// フックの中核ロジックを `createToastController()` という非フックの純粋な
// コントローラーとして切り出し、直接インスタンス化してテストできる形にしている
// （useToast.test.ts 参照）。`useToast()` フックはこのコントローラーを
// `useRef` で1つ保持し、変更通知を `useState` の再レンダートリガーに変換するだけの
// 薄いアダプターになっている。

import { useState, useRef, useEffect, useCallback } from 'react';

export interface ToastInput {
  message: string;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  durationMs: number;
}

export interface ToastItem extends ToastInput {
  id: string;
}

/** 同時表示するトーストの最大件数。超えた分は最も古いものから即座に破棄する */
export const MAX_VISIBLE_TOASTS = 3;

/**
 * トースト管理の中核ロジック（非フック）。
 * useState/useRef を使わないプレーンな JS オブジェクトとして実装し、
 * React のレンダーサイクルの外からも直接呼び出してテストできるようにする。
 */
export function createToastController() {
  let toasts: ToastItem[] = [];
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const listeners = new Set<() => void>();

  function notify() {
    for (const listener of listeners) listener();
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function getToasts(): ToastItem[] {
    return toasts;
  }

  function clearTimer(id: string) {
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
  }

  function dismissToast(id: string) {
    clearTimer(id);
    const next = toasts.filter((t) => t.id !== id);
    if (next.length === toasts.length) return; // 既に消えている（多重呼び出し）なら何もしない
    toasts = next;
    notify();
  }

  function pushToast(input: ToastInput): string {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nextAll = [...toasts, { ...input, id }];

    // 最大表示件数を超えたら最も古いものを即座に破棄する（タイマー完了を待たない）
    if (nextAll.length > MAX_VISIBLE_TOASTS) {
      const overflow = nextAll.slice(0, nextAll.length - MAX_VISIBLE_TOASTS);
      for (const t of overflow) clearTimer(t.id);
      toasts = nextAll.slice(nextAll.length - MAX_VISIBLE_TOASTS);
    } else {
      toasts = nextAll;
    }

    const timer = setTimeout(() => dismissToast(id), input.durationMs);
    timers.set(id, timer);

    notify();
    return id;
  }

  return { getToasts, pushToast, dismissToast, subscribe };
}

/**
 * トーストを管理するフック。
 * @returns toasts - 現在表示中のトースト一覧
 * @returns pushToast - トーストを追加する。生成した id を返す
 * @returns dismissToast - 指定 id のトーストを即座に除去し、タイマーもクリアする
 */
export function useToast() {
  const controllerRef = useRef<ReturnType<typeof createToastController> | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = createToastController();
  }
  const controller = controllerRef.current;

  // コントローラー内部の変更を再レンダーに変換するだけのトリガー
  const [, forceRender] = useState(0);
  useEffect(() => controller.subscribe(() => forceRender((n) => n + 1)), [controller]);

  const pushToast = useCallback((input: ToastInput) => controller.pushToast(input), [controller]);
  const dismissToast = useCallback((id: string) => controller.dismissToast(id), [controller]);

  return { toasts: controller.getToasts(), pushToast, dismissToast };
}
