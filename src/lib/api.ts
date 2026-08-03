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

/** done() でrecur再作成が起きた際の対応表（#1672） */
export interface RecurCreated {
  number: number; // 完了した元Issue番号
  newIssueNumber: number; // 次周期に再作成されたIssue番号
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

/**
 * GTD カテゴリキーから絵文字を抽出するユーティリティ
 * GTD_DISPLAY の値が "{絵文字} {テキスト}" 形式であることを前提とする
 * @param key - GtdKey または任意の文字列
 * @returns 絵文字文字列（該当なし・形式不正の場合は key をそのまま返す）
 */
export function getGtdEmoji(key: string): string {
  const display = GTD_DISPLAY[key as GtdKey];
  if (!display) return key;
  const emoji = display.split(' ')[0];
  return emoji || key;
}

/**
 * サーバーがエラー時に返す JSON ボディの型。
 * `server/routes/tasks.js` の `handleError()` が返すフィールドをすべて許容する。
 * 未知のフィールドも将来のサーバー側拡張に備えて index signature で保持する。
 */
export interface ApiErrorBody {
  error?: string;
  detail?: string;
  code?: string;
  /** withChildren=true で子タスクのクローズに一部失敗した場合の失敗 Issue 番号一覧（CHILD_CLOSE_FAILED） */
  failedChildren?: number[];
  /** 子タスクは全件クローズ成功したが、親タスクのクローズにだけ失敗した場合 true（PARENT_CLOSE_FAILED） */
  parentStillOpen?: boolean;
  /** parentStillOpen 発生時、クローズ済みの子タスク Issue 番号一覧 */
  closedChildren?: number[];
  /** サーバー側が保持していた元エラーのメッセージ文字列（PARENT_CLOSE_FAILED） */
  cause?: string;
  [key: string]: unknown;
}

/**
 * API リクエスト失敗時に throw されるエラー。
 *
 * 従来は `body.error || body.detail` の文字列だけを取り出して素の `Error` を
 * throw していたため、サーバー側が付与する構造化フィールド（`code` /
 * `closedChildren` / `parentStillOpen` / `cause` 等）が呼び出し側で失われていた
 * （Issue #1654）。本クラスはレスポンスボディ全体を保持し、呼び出し側が
 * `err instanceof ApiError` で判定した上で構造化フィールドに型安全にアクセス
 * できるようにする。
 *
 * `message` は従来の `"${status} ${statusText}: ${detail}"` 形式を維持するため、
 * `err instanceof Error` で `err.message` を表示している既存の呼び出し側は
 * そのまま動作する。
 */
export class ApiError extends Error {
  /** HTTP ステータスコード */
  status: number;
  /** HTTP ステータステキスト */
  statusText: string;
  /** サーバー側の `error.code`（例: 'PARENT_CLOSE_FAILED'）。存在しない場合は undefined */
  code?: string;
  /** サーバーが返した detail フィールド（存在する場合） */
  detail?: string;
  /** CHILD_CLOSE_FAILED 発生時、クローズに失敗した子タスク Issue 番号一覧 */
  failedChildren?: number[];
  /** PARENT_CLOSE_FAILED 発生時 true（子は全件クローズ成功、親のみ失敗） */
  parentStillOpen?: boolean;
  /** PARENT_CLOSE_FAILED 発生時、クローズ済みの子タスク Issue 番号一覧 */
  closedChildren?: number[];
  /**
   * サーバー側の元エラーメッセージ文字列（PARENT_CLOSE_FAILED の `cause` フィールド）。
   *
   * 注意: JS 標準の `Error.prototype.cause`（因果チェーン用に Error オブジェクトを
   * 保持する仕組み。ES2022〜）とは意味が異なる（こちらは文字列メッセージ）ため、
   * 名前の衝突・意味の混同を避けて `serverCause` という別名で保持する。
   * 標準の `cause` プロパティは使用しない。
   */
  serverCause?: string;
  /** レスポンスボディ全体（未知フィールドも含めて保持） */
  body: ApiErrorBody;

  constructor(status: number, statusText: string, body: ApiErrorBody) {
    const detail = body.error || body.detail || '';
    super(`${status} ${statusText}${detail ? ': ' + detail : ''}`);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
    this.body = body;
    this.code = body.code;
    this.detail = body.detail;
    this.failedChildren = body.failedChildren;
    this.parentStillOpen = body.parentStillOpen;
    this.closedChildren = body.closedChildren;
    this.serverCause = body.cause;

    // TS で class extends Error する際、ターゲット環境によっては instanceof が
    // 正しく機能しないことがあるため、プロトタイプチェーンを明示的に復元する
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    // レスポンスボディは一度しか読み出せない（json() が失敗しても text() で
    // 再読み出しはできず "body stream already read" になる）ため、まず text()
    // で読み切ってから JSON パースを試みる。パース失敗時はプレーンテキストの
    // まま detail として保持する（フォールバック）。
    const text = await res.text().catch(() => '');
    let body: ApiErrorBody = {};
    if (text) {
      try {
        const parsed: unknown = JSON.parse(text);
        if (parsed && typeof parsed === 'object') {
          body = parsed as ApiErrorBody;
        } else {
          body = { detail: String(parsed) };
        }
      } catch {
        body = { detail: text };
      }
    }
    throw new ApiError(res.status, res.statusText, body);
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
   * @returns recurCreated - recur（繰り返し）設定済みタスクが完了した場合、次周期に
   *   再作成された Issue の対応表（#1672）。recur なしの通常 done では空配列。
   */
  doneTask: (
    number: number,
    options?: { withChildren?: boolean }
  ): Promise<{ ok: boolean; closedChildren?: number[]; recurCreated?: RecurCreated[] }> =>
    request<{ ok: boolean; closedChildren?: number[]; recurCreated?: RecurCreated[] }>(`/api/tasks/${number}/done`, {
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
   * GTD カテゴリの表示定義を取得する（絵文字付き日本語名）
   * GtdLabelsContext の初期化時に使用する。
   * API 失敗時は GtdLabelsContext 側でフォールバック値を使うため、エラーをそのまま throw する。
   */
  fetchGtdLabels: (): Promise<{ labels: Record<string, string>; keys: string[]; projectKey: string }> =>
    request('/api/gtd-labels'),

  /**
   * ヘルスチェック
   */
  health: (): Promise<{ ok: boolean; owner: string; repo: string; uptime: number }> =>
    request('/api/health'),
};
