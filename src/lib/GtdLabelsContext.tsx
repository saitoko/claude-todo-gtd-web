/**
 * GtdLabelsContext — GTD カテゴリ表示定義を全コンポーネントに配布する React Context
 *
 * 初期値（フォールバック）は api.ts の GTD_DISPLAY と同じ値を持つ。
 * マウント時に /api/gtd-labels から取得し、成功すれば Context を更新する。
 * API 失敗・ネットワーク切断時もフォールバック値でUIが正常動作する。
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';

// ─── 型定義 ───

export interface GtdLabelsResponse {
  labels: Record<string, string>;   // GTD_DISPLAY_JA の内容
  keys: string[];                    // GTD_LABELS の内容
  projectKey: string;               // PROJECT_LABEL の内容
}

export interface GtdLabelsContextValue {
  labels: Record<string, string>;   // 表示名マップ（初期値: 静的フォールバック）
  isLoaded: boolean;                 // API 取得完了フラグ
}

// ─── フォールバック定義（api.ts の GTD_DISPLAY と同値） ───

const FALLBACK_LABELS: Record<string, string> = {
  inbox:     '📥 Inbox',
  next:      '🎯 Next',
  waiting:   '⏳ Waiting',
  someday:   '🌈 Someday',
  routine:   '🔁 Routine',
  project:   '📁 Project',
  reference: '📎 Reference',
};

// ─── Context ───

const GtdLabelsContext = createContext<GtdLabelsContextValue>({
  labels: FALLBACK_LABELS,
  isLoaded: false,
});

// ─── Provider ───

export function GtdLabelsProvider({ children }: { children: React.ReactNode }) {
  const [labels, setLabels] = useState<Record<string, string>>(FALLBACK_LABELS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // 初回マウント時に 1 回のみ fetch
    api.fetchGtdLabels()
      .then((data) => {
        if (data.labels && typeof data.labels === 'object') {
          setLabels(data.labels);
        }
        setIsLoaded(true);
      })
      .catch((err) => {
        // API 失敗時はフォールバック値のままUIを継続する
        console.warn('[GtdLabelsContext] /api/gtd-labels 取得失敗（フォールバック使用）:', err);
        setIsLoaded(true); // 失敗時も isLoaded = true にして「未取得」状態を解消
      });
  }, []);

  return (
    <GtdLabelsContext.Provider value={{ labels, isLoaded }}>
      {children}
    </GtdLabelsContext.Provider>
  );
}

// ─── Hook ───

/**
 * GTD ラベル表示定義を取得する Hook
 * @example
 *   const { labels } = useGtdLabels();
 *   const displayName = labels[gtdKey] ?? gtdKey;
 */
export function useGtdLabels(): GtdLabelsContextValue {
  return useContext(GtdLabelsContext);
}
