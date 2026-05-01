// API クライアント（fetch ラッパー）

export interface Task {
  number: number;
  title: string;
  gtdCategory: string; // 'inbox' | 'next' | 'waiting' | 'someday' | 'routine' | 'project' | 'reference'
  labels: string[];
  body: string;
  due: string | null;
  priority: string | null; // 'p1' | 'p2' | 'p3' | null
  updatedAt: string | null; // ISO 8601 形式 (e.g. "2026-01-01T00:00:00Z")
  parentProject?: number | null; // 親プロジェクトの Issue 番号（body の `project: #N` から抽出）
}

export interface TaskListResponse {
  tasks: Task[];
  total: number;
  byCategory: Record<string, number>;
  childTasks?: Task[]; // project カテゴリ表示時のみ含まれる子タスク一覧
}

export interface TaskComment {
  id: number;
  author: string;
  body: string;
  createdAt: string;
}

export interface TaskDetail extends Task {
  assignees: string[];
  createdAt: string;
  updatedAt: string;
  comments: TaskComment[];
}

export interface AddTaskInput {
  title: string;
  gtdCategory?: string;
}

// 有効な GTD カテゴリ
export const GTD_KEYS = ['inbox', 'next', 'waiting', 'someday', 'routine', 'project', 'reference'] as const;
export type GtdKey = (typeof GTD_KEYS)[number];

// UI 表示用ラベル（サイドバー等）
export const GTD_DISPLAY: Record<GtdKey, string> = {
  inbox:     '📥 Inbox',
  next:      '🎯 Next',
  waiting:   '⏳ Waiting',
  someday:   '🌈 Someday',
  routine:   '🔁 Routine',
  project:   '📁 Project',
  reference: '📎 Reference',
};

// move 先として選択可能なカテゴリ（project は除外）
export const MOVABLE_GTD_KEYS: GtdKey[] = ['next', 'waiting', 'someday', 'routine', 'reference', 'inbox'];

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body.error || body.detail || '';
    } catch {
      detail = await res.text().catch(() => '');
    }
    throw new Error(`${res.status} ${res.statusText}${detail ? ': ' + detail : ''}`);
  }
  // 204 No Content
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

export const api = {
  /**
   * タスク一覧を取得する
   * @param gtd - null で全カテゴリ、文字列で絞り込み
   */
  listTasks: (gtd: string | null): Promise<TaskListResponse> => {
    const url = gtd ? `/api/tasks?gtd=${encodeURIComponent(gtd)}` : '/api/tasks';
    return request<TaskListResponse>(url);
  },

  /**
   * タスクを追加する
   */
  addTask: (input: AddTaskInput): Promise<{ number: number }> =>
    request<{ number: number }>('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),

  /**
   * タスクを完了する
   * @param number - Issue 番号
   * @param options.withChildren - true の場合、子タスクも全件クローズしてから親をクローズ
   */
  doneTask: (number: number, options?: { withChildren?: boolean }): Promise<{ ok: boolean; closedChildren?: number[] }> =>
    request<{ ok: boolean; closedChildren?: number[] }>(`/api/tasks/${number}/done`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options ?? {}),
    }),

  /**
   * タスクの GTD カテゴリを変更する
   */
  moveTask: (number: number, targetGtd: string): Promise<{ ok: boolean }> =>
    request<{ ok: boolean }>(`/api/tasks/${number}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetGtd }),
    }),

  /**
   * タスクの詳細情報を取得する（担当者・コメントを含む）
   */
  getTaskDetail: (number: number): Promise<TaskDetail> =>
    request<TaskDetail>(`/api/tasks/${number}`),

  /**
   * リポジトリのラベル一覧を取得する
   */
  listLabels: (): Promise<{ labels: Array<{ name: string; color: string }> }> =>
    request('/api/labels'),

  /**
   * タスクの属性を更新する
   */
  updateTask: (
    number: number,
    patch: {
      title?: string;
      body?: string;
      addLabels?: string[];
      removeLabels?: string[];
    }
  ): Promise<{ ok: boolean }> =>
    request<{ ok: boolean }>(`/api/tasks/${number}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),

  /**
   * ヘルスチェック
   */
  health: (): Promise<{ ok: boolean; owner: string; repo: string; uptime: number }> =>
    request('/api/health'),
};
