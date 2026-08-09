/**
 * partitionByDate.ts ユニットテスト
 * 実行: node --experimental-strip-types --test src/lib/partitionByDate.test.ts
 *
 * 背景（#1649）: モバイル画面で期限超過タスクが非表示になるバグの修正。
 * 修正前は today/future/noDue の3バケツしかなく、due < today（期限超過）の
 * タスクがどのバケツにも属さず戻り値から欠落していた。overdue バケツを追加し、
 * 欠落しないことを保証する。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { partitionByDate, isTaskOverdue } from './partitionByDate.ts';
import { type Task } from './api.ts';

// ─── テストデータファクトリ ──────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> & { number: number }): Task {
  return {
    title: `Task #${overrides.number}`,
    gtdCategory: 'next',
    labels: [],
    body: '',
    due: null,
    priority: null,
    updatedAt: null,
    ...overrides,
  };
}

const BASE_TODAY = '2026-08-03';

// ─── 正常系 ───────────────────────────────────────────────────────────────────

describe('partitionByDate', () => {
  it('正常系: 期限超過・今日・未来・期日なしが混在するタスク一覧が、それぞれ正しいバケツに振り分けられる', () => {
    const tasks: Task[] = [
      makeTask({ number: 1, due: '2026-08-01' }), // overdue
      makeTask({ number: 2, due: '2026-08-03' }), // today
      makeTask({ number: 3, due: '2026-08-10' }), // future
      makeTask({ number: 4, due: null }),          // noDue
    ];
    const result = partitionByDate(tasks, BASE_TODAY);

    assert.deepEqual(result.overdue.map((t) => t.number), [1]);
    assert.deepEqual(result.today.map((t) => t.number), [2]);
    assert.deepEqual(result.future.map((t) => t.number), [3]);
    assert.deepEqual(result.noDue.map((t) => t.number), [4]);
  });

  it('正常系: 期限超過タスクが overdue バケツに含まれ、today/future/noDue のいずれにも重複して含まれない', () => {
    const tasks: Task[] = [
      makeTask({ number: 1, due: '2026-07-01' }),
      makeTask({ number: 2, due: '2026-08-02' }),
    ];
    const result = partitionByDate(tasks, BASE_TODAY);

    assert.equal(result.overdue.length, 2);
    assert.equal(result.today.some((t) => t.number === 1 || t.number === 2), false);
    assert.equal(result.future.some((t) => t.number === 1 || t.number === 2), false);
    assert.equal(result.noDue.some((t) => t.number === 1 || t.number === 2), false);
  });

  it('正常系: 複数件の期限超過タスクがすべて overdue に含まれる（総件数が一致する）', () => {
    const tasks: Task[] = [
      makeTask({ number: 1, due: '2026-07-01' }),
      makeTask({ number: 2, due: '2026-07-15' }),
      makeTask({ number: 3, due: '2026-08-02' }),
      makeTask({ number: 4, due: '2026-08-03' }),
    ];
    const result = partitionByDate(tasks, BASE_TODAY);

    const totalPartitioned =
      result.overdue.length + result.today.length + result.future.length + result.noDue.length;
    assert.equal(totalPartitioned, tasks.length);
    assert.equal(result.overdue.length, 3);
  });

  // ─── 境界値 ─────────────────────────────────────────────────────────────────

  it('境界値: 期限超過タスクが1件もない場合、overdue は空配列になる（既存機能への影響なし）', () => {
    const tasks: Task[] = [
      makeTask({ number: 1, due: '2026-08-03' }),
      makeTask({ number: 2, due: '2026-08-10' }),
      makeTask({ number: 3, due: null }),
    ];
    const result = partitionByDate(tasks, BASE_TODAY);

    assert.deepEqual(result.overdue, []);
    assert.equal(result.today.length, 1);
    assert.equal(result.future.length, 1);
    assert.equal(result.noDue.length, 1);
  });

  it('境界値: 空配列を渡した場合、全バケツが空配列になる', () => {
    const result = partitionByDate([], BASE_TODAY);

    assert.deepEqual(result.overdue, []);
    assert.deepEqual(result.today, []);
    assert.deepEqual(result.future, []);
    assert.deepEqual(result.noDue, []);
  });

  it('境界値: 日付境界（昨日）は overdue に分類される', () => {
    const tasks: Task[] = [makeTask({ number: 1, due: '2026-08-02' })];
    const result = partitionByDate(tasks, BASE_TODAY);

    assert.deepEqual(result.overdue.map((t) => t.number), [1]);
    assert.deepEqual(result.today, []);
  });

  it('境界値: 日付境界（今日ちょうど）は overdue ではなく today に分類される', () => {
    const tasks: Task[] = [makeTask({ number: 1, due: '2026-08-03' })];
    const result = partitionByDate(tasks, BASE_TODAY);

    assert.deepEqual(result.overdue, []);
    assert.deepEqual(result.today.map((t) => t.number), [1]);
  });

  it('境界値: 日付境界（明日）は overdue でも today でもなく future に分類される', () => {
    const tasks: Task[] = [makeTask({ number: 1, due: '2026-08-04' })];
    const result = partitionByDate(tasks, BASE_TODAY);

    assert.deepEqual(result.overdue, []);
    assert.deepEqual(result.today, []);
    assert.deepEqual(result.future.map((t) => t.number), [1]);
  });

  it('境界値: today 引数を省略した場合、実行時点のJST日付が基準として使われる（例外にならない）', () => {
    const tasks: Task[] = [makeTask({ number: 1, due: null })];
    assert.doesNotThrow(() => partitionByDate(tasks));
  });

  // ─── ラベル ───────────────────────────────────────────────────────────────

  it('正常系: overdueLabel は固定の警告文言を返す', () => {
    const result = partitionByDate([], BASE_TODAY);
    assert.equal(result.overdueLabel, '⚠️ 期限超過');
  });

  it('正常系: todayLabel/futureLabel は基準日から算出される（既存仕様の回帰確認）', () => {
    const result = partitionByDate([], BASE_TODAY);
    assert.equal(result.todayLabel, `今日（${BASE_TODAY}）`);
    assert.equal(result.futureLabel, '明日以降（2026-08-04〜）');
  });
});

// ─── isTaskOverdue（#1674: overdue判定ロジックの重複解消） ─────────────────────

describe('isTaskOverdue', () => {
  it('境界値: due が null の場合、false を返す（期日なしタスクは期限超過にならない）', () => {
    const task = makeTask({ number: 1, due: null });
    assert.equal(isTaskOverdue(task, BASE_TODAY), false);
  });

  it('境界値: due が today と同日の場合、false を返す（当日は期限超過ではない）', () => {
    const task = makeTask({ number: 1, due: BASE_TODAY });
    assert.equal(isTaskOverdue(task, BASE_TODAY), false);
  });

  it('境界値: due が前日の場合、true を返す（期限超過と判定される）', () => {
    const task = makeTask({ number: 1, due: '2026-08-02' });
    assert.equal(isTaskOverdue(task, BASE_TODAY), true);
  });

  it('境界値: due が翌日の場合、false を返す（未来の期日は期限超過ではない）', () => {
    const task = makeTask({ number: 1, due: '2026-08-04' });
    assert.equal(isTaskOverdue(task, BASE_TODAY), false);
  });
});
