import { type Task } from './api.ts';

/**
 * 今日の日付を JST で 'YYYY-MM-DD' 形式で返す
 */
export function getTodayJST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
}

/**
 * tasks から '@' プレフィックスのラベルを重複排除して返す
 */
export function extractContextLabels(tasks: Task[]): string[] {
  const seen = new Set<string>();
  for (const task of tasks) {
    for (const label of task.labels) {
      if (label.startsWith('@')) {
        seen.add(label);
      }
    }
  }
  return Array.from(seen).sort();
}

/**
 * コンテキストラベルでタスクをフィルタする
 * - context: null = 全件返す
 * - context: '@外出中' 等 = そのラベルを持つタスクのみ（showNoContext=true なら @ラベルなしも含む）
 * - showNoContext: true のとき '@' ラベルなしタスクも含める
 */
export function filterByContext(
  tasks: Task[],
  context: string | null,
  showNoContext: boolean
): Task[] {
  if (context === null) return tasks;
  return tasks.filter((task) => {
    const hasContext = task.labels.some((l) => l.startsWith('@'));
    const hasTargetContext = task.labels.includes(context);
    if (hasTargetContext) return true;
    if (showNoContext && !hasContext) return true;
    return false;
  });
}

/**
 * Focus ビュー用フィルタ: due <= today OR priority in ['p1','p2'] のタスクを返す
 */
export function filterFocusTasks(tasks: Task[], today: string): Task[] {
  return tasks.filter((task) => {
    const dueHit = task.due != null && task.due <= today;
    const priorityHit = task.priority === 'p1' || task.priority === 'p2';
    return dueHit || priorityHit;
  });
}

/**
 * Close 候補（due 超過）: next タスクのうち due < today のもの
 * due == today は「今日が締切」なので Close 候補に含めない
 */
export function getCloseCandidatesByDue(tasks: Task[], today: string): Task[] {
  return tasks.filter(
    (task) => task.gtdCategory === 'next' && task.due != null && task.due < today
  );
}

/**
 * Close 候補（古い next）: updatedAt が 30日以上前のタスク
 *
 * updatedAt（ISO 8601 形式）が利用可能な場合は 30日以上前のタスクを返す。
 * updatedAt がない場合は due == null のタスクを number 昇順で limit 件返す（フォールバック）。
 *
 * @param tasks - next カテゴリのタスク（絞り込み済みを渡すこと）
 * @param limit - フォールバック時の最大件数（デフォルト 20）
 */
export function getCloseCandidatesOld(
  tasks: Task[],
  limit = 20
): Task[] {
  if (limit === 0) return [];

  const today = getTodayJST();
  const threshold = getDateDaysAgo(today, 30); // 30日前の 'YYYY-MM-DD'

  const nextTasks = tasks.filter((task) => task.gtdCategory === 'next');

  // updatedAt が利用可能かどうか確認（少なくとも1件に updatedAt があれば利用可能と判断）
  const hasUpdatedAt = nextTasks.some((task) => task.updatedAt != null);

  if (hasUpdatedAt) {
    // updatedAt が 30日以上前のタスク（ちょうど30日前を含む）
    // updatedDate <= threshold: threshold = 今日 - 30日 なので、それ以前を対象にする
    return nextTasks.filter((task) => {
      if (!task.updatedAt) return false;
      const updatedDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date(task.updatedAt));
      return updatedDate <= threshold;
    });
  }

  // フォールバック: due == null のタスクを number 昇順で limit 件
  return nextTasks
    .filter((task) => task.due == null)
    .sort((a, b) => a.number - b.number)
    .slice(0, limit);
}

/**
 * カテゴリ見直し候補を返す
 * - waitingOverdue: waiting かつ due < today
 * - waitingNoDue:   waiting かつ due == null
 * - someday:        someday 全件
 */
export function getCategoryReviewCandidates(
  waitingTasks: Task[],
  somedayTasks: Task[],
  today: string
): {
  waitingOverdue: Task[];
  waitingNoDue: Task[];
  someday: Task[];
} {
  const waitingOverdue = waitingTasks.filter(
    (t) => t.gtdCategory === 'waiting' && t.due != null && t.due < today
  );
  const waitingNoDue = waitingTasks.filter(
    (t) => t.gtdCategory === 'waiting' && t.due == null
  );
  const someday = somedayTasks.filter((t) => t.gtdCategory === 'someday');

  return { waitingOverdue, waitingNoDue, someday };
}

// ─── 内部ユーティリティ ───────────────────────────────────────────────────────

/**
 * 基準日 (YYYY-MM-DD) から N 日前の日付文字列を返す
 */
function getDateDaysAgo(today: string, days: number): string {
  const d = new Date(today + 'T00:00:00+09:00');
  d.setDate(d.getDate() - days);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(d);
}
