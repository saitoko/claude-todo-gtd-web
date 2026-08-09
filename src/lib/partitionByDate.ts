import { type Task } from './api.ts';
import { getTodayJST } from './filterTasks.ts';

export interface PartitionedTasks {
  overdue: Task[];
  today: Task[];
  future: Task[];
  noDue: Task[];
  overdueLabel: string;
  todayLabel: string;
  futureLabel: string;
}

/**
 * タスクが期限超過（overdue）かどうかを判定する
 *
 * #1674: partitionByDate() 内の overdue フィルタと、モバイルカード単体（MobileTaskCard）の
 * 期限超過表示判定が同じ式 `due != null && due < today` を別々に持っていた（重複）。
 * 本関数を唯一の判定ロジックとし、両方の呼び出し元から共通利用する。
 * #1741: TaskRow / ProjectTreeRow（親行・子行）にも同型のインライン重複が残っていたため、
 * 本関数への置き換えを全 UI コンポーネントに拡大した。
 *
 * @param task - 判定対象のタスク
 * @param today - 基準日（'YYYY-MM-DD'形式、JST）
 */
export function isTaskOverdue(task: Task, today: string): boolean {
  return task.due != null && task.due < today;
}

/**
 * タスクを「期限超過」「今日」「明日以降」「期日なし」のセクションに分割する
 *
 * #1649: 従来は today/future/noDue の3バケツしかなく、due < today（期限超過）の
 * タスクがどのバケツにも属さず戻り値から欠落していた（モバイル画面から完全に非表示）。
 * overdue バケツを追加して欠落を解消する。
 *
 * @param tasks - 分割対象のタスク一覧
 * @param today - 基準日（'YYYY-MM-DD'形式、JST）。省略時は実行時点のJST日付
 */
export function partitionByDate(tasks: Task[], today: string = getTodayJST()): PartitionedTasks {
  const overdue = tasks.filter((t) => isTaskOverdue(t, today));
  const todayTasks = tasks.filter((t) => t.due === today);
  const future = tasks.filter((t) => t.due != null && t.due > today);
  const noDue = tasks.filter((t) => t.due == null);

  // 翌日の日付
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(tomorrow);

  return {
    overdue,
    today: todayTasks,
    future,
    noDue,
    overdueLabel: '⚠️ 期限超過',
    todayLabel: `今日（${today}）`,
    futureLabel: `明日以降（${tomorrowStr}〜）`,
  };
}
