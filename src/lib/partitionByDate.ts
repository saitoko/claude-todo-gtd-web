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
  const overdue = tasks.filter((t) => t.due != null && t.due < today);
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
