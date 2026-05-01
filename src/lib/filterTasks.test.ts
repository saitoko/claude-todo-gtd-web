/**
 * filterTasks.ts ユニットテスト
 * 実行: node --experimental-strip-types --test src/lib/filterTasks.test.ts
 * または: npx tsx --test src/lib/filterTasks.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getTodayJST,
  extractContextLabels,
  filterByContext,
  filterFocusTasks,
  getCloseCandidatesByDue,
  getCloseCandidatesOld,
  getCategoryReviewCandidates,
} from './filterTasks.ts';
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

// ─── getTodayJST ─────────────────────────────────────────────────────────────

describe('getTodayJST', () => {
  it('YYYY-MM-DD 形式を返す', () => {
    const result = getTodayJST();
    assert.match(result, /^\d{4}-\d{2}-\d{2}$/);
  });
});

// ─── extractContextLabels ────────────────────────────────────────────────────

describe('extractContextLabels', () => {
  it('@外出中 ラベルを持つタスクから ["@外出中"] が返る', () => {
    const tasks = [makeTask({ number: 1, labels: ['@外出中', '🎯 next'] })];
    assert.deepEqual(extractContextLabels(tasks), ['@外出中']);
  });

  it('@なしラベルのみなら空配列を返す', () => {
    const tasks = [makeTask({ number: 1, labels: ['bug', 'enhancement'] })];
    assert.deepEqual(extractContextLabels(tasks), []);
  });

  it('重複ラベルは1件に集約される', () => {
    const tasks = [
      makeTask({ number: 1, labels: ['@PC'] }),
      makeTask({ number: 2, labels: ['@PC', '@外出中'] }),
    ];
    const result = extractContextLabels(tasks);
    assert.equal(result.length, 2);
    assert.ok(result.includes('@PC'));
    assert.ok(result.includes('@外出中'));
  });

  it('タスクが空配列なら空配列を返す', () => {
    assert.deepEqual(extractContextLabels([]), []);
  });
});

// ─── filterByContext ─────────────────────────────────────────────────────────

describe('filterByContext', () => {
  const tasks = [
    makeTask({ number: 1, labels: ['@PC'] }),
    makeTask({ number: 2, labels: ['@外出中'] }),
    makeTask({ number: 3, labels: [] }),       // @なし
    makeTask({ number: 4, labels: ['bug'] }),   // @なし（他ラベルあり）
  ];

  it('context=null なら全件返す', () => {
    assert.equal(filterByContext(tasks, null, false).length, 4);
  });

  it('context="@PC" なら @PC ラベル持ちのみ返す', () => {
    const result = filterByContext(tasks, '@PC', false);
    assert.equal(result.length, 1);
    assert.equal(result[0].number, 1);
  });

  it('showNoContext=true かつ context="@PC" なら @PC 持ち + @なしの両方を返す', () => {
    const result = filterByContext(tasks, '@PC', true);
    // task 1 (@PC あり) + task 3 (@なし) + task 4 (@なし) = 3件
    assert.equal(result.length, 3);
    const numbers = result.map((t) => t.number).sort();
    assert.deepEqual(numbers, [1, 3, 4]);
  });

  it('showNoContext=false なら @なしタスクを返さない', () => {
    const result = filterByContext(tasks, '@PC', false);
    assert.ok(result.every((t) => t.labels.includes('@PC')));
  });

  it('タスクが空配列なら空配列を返す', () => {
    assert.deepEqual(filterByContext([], '@PC', true), []);
  });
});

// ─── filterFocusTasks ────────────────────────────────────────────────────────

describe('filterFocusTasks', () => {
  const today = '2026-05-01';

  it('due == today のタスクが含まれる', () => {
    const tasks = [makeTask({ number: 1, due: today })];
    assert.equal(filterFocusTasks(tasks, today).length, 1);
  });

  it('due < today のタスクが含まれる', () => {
    const tasks = [makeTask({ number: 1, due: '2026-04-30' })];
    assert.equal(filterFocusTasks(tasks, today).length, 1);
  });

  it('due > today かつ priority == null のタスクが含まれない', () => {
    const tasks = [makeTask({ number: 1, due: '2026-05-10', priority: null })];
    assert.equal(filterFocusTasks(tasks, today).length, 0);
  });

  it('priority == "p1" かつ due なしのタスクが含まれる', () => {
    const tasks = [makeTask({ number: 1, due: null, priority: 'p1' })];
    assert.equal(filterFocusTasks(tasks, today).length, 1);
  });

  it('priority == "p2" かつ due なしのタスクが含まれる', () => {
    const tasks = [makeTask({ number: 1, due: null, priority: 'p2' })];
    assert.equal(filterFocusTasks(tasks, today).length, 1);
  });

  it('priority == "p3" かつ due なしのタスクが含まれない', () => {
    const tasks = [makeTask({ number: 1, due: null, priority: 'p3' })];
    assert.equal(filterFocusTasks(tasks, today).length, 0);
  });

  it('due == null かつ priority == null のタスクが含まれない', () => {
    const tasks = [makeTask({ number: 1, due: null, priority: null })];
    assert.equal(filterFocusTasks(tasks, today).length, 0);
  });

  it('タスクが空配列なら空配列を返す', () => {
    assert.deepEqual(filterFocusTasks([], today), []);
  });
});

// ─── getCloseCandidatesByDue ──────────────────────────────────────────────────

describe('getCloseCandidatesByDue', () => {
  const today = '2026-05-01';

  it('due < today の next タスクを返す', () => {
    const tasks = [
      makeTask({ number: 1, gtdCategory: 'next', due: '2026-04-30' }),
    ];
    assert.equal(getCloseCandidatesByDue(tasks, today).length, 1);
  });

  it('due == today のタスクは含めない', () => {
    const tasks = [
      makeTask({ number: 1, gtdCategory: 'next', due: today }),
    ];
    assert.equal(getCloseCandidatesByDue(tasks, today).length, 0);
  });

  it('due > today のタスクは含めない', () => {
    const tasks = [
      makeTask({ number: 1, gtdCategory: 'next', due: '2026-05-10' }),
    ];
    assert.equal(getCloseCandidatesByDue(tasks, today).length, 0);
  });

  it('next 以外カテゴリは含めない', () => {
    const tasks = [
      makeTask({ number: 1, gtdCategory: 'waiting', due: '2026-04-30' }),
    ];
    assert.equal(getCloseCandidatesByDue(tasks, today).length, 0);
  });

  it('タスクが空配列なら空配列を返す', () => {
    assert.deepEqual(getCloseCandidatesByDue([], today), []);
  });
});

// ─── getCloseCandidatesOld ────────────────────────────────────────────────────

describe('getCloseCandidatesOld', () => {
  it('updatedAt が 30日以上前のタスクを返す（updatedAt あり）', () => {
    const tasks = [
      makeTask({ number: 1, gtdCategory: 'next', updatedAt: '2025-01-01T00:00:00Z' }), // 30日以上前
      makeTask({ number: 2, gtdCategory: 'next', updatedAt: new Date().toISOString() }), // 今日
    ];
    const result = getCloseCandidatesOld(tasks);
    assert.equal(result.length, 1);
    assert.equal(result[0].number, 1);
  });

  it('updatedAt がちょうど30日前のタスクを返す（境界値: 含む）', () => {
    const today = getTodayJST();
    const thirtyDaysAgoDate = new Date(today + 'T00:00:00+09:00');
    thirtyDaysAgoDate.setDate(thirtyDaysAgoDate.getDate() - 30);
    const thirtyDaysAgo = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(thirtyDaysAgoDate);
    // JST正午(T03:00:00Z)を使う: UTC→JST変換後も thirtyDaysAgo の日付になることが保証される
    const tasks = [
      makeTask({ number: 1, gtdCategory: 'next', updatedAt: thirtyDaysAgo + 'T03:00:00Z' }),
    ];
    const result = getCloseCandidatesOld(tasks);
    assert.equal(result.length, 1);
  });

  it('updatedAt が29日前のタスクは含めない（境界値: 除外）', () => {
    const today = getTodayJST();
    const twentyNineDaysAgoDate = new Date(today + 'T00:00:00+09:00');
    twentyNineDaysAgoDate.setDate(twentyNineDaysAgoDate.getDate() - 29);
    const twentyNineDaysAgo = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(twentyNineDaysAgoDate);
    // JST正午(T03:00:00Z)を使う: UTC→JST変換後も twentyNineDaysAgo の日付になることが保証される
    const tasks = [
      makeTask({ number: 1, gtdCategory: 'next', updatedAt: twentyNineDaysAgo + 'T03:00:00Z' }),
    ];
    const result = getCloseCandidatesOld(tasks);
    assert.equal(result.length, 0);
  });

  it('updatedAt がない場合: due == null のタスクを number 昇順で limit 件返す（フォールバック）', () => {
    const tasks = [
      makeTask({ number: 5, gtdCategory: 'next', due: null, updatedAt: null }),
      makeTask({ number: 2, gtdCategory: 'next', due: null, updatedAt: null }),
      makeTask({ number: 8, gtdCategory: 'next', due: null, updatedAt: null }),
    ];
    const result = getCloseCandidatesOld(tasks, 2);
    assert.equal(result.length, 2);
    assert.equal(result[0].number, 2); // 昇順
    assert.equal(result[1].number, 5);
  });

  it('limit=0 → 空配列を返す', () => {
    const tasks = [makeTask({ number: 1, gtdCategory: 'next', due: null })];
    assert.deepEqual(getCloseCandidatesOld(tasks, 0), []);
  });

  it('対象タスクが limit 未満 → 全件返す', () => {
    const tasks = [
      makeTask({ number: 1, gtdCategory: 'next', due: null, updatedAt: null }),
      makeTask({ number: 2, gtdCategory: 'next', due: null, updatedAt: null }),
    ];
    const result = getCloseCandidatesOld(tasks, 20);
    assert.equal(result.length, 2);
  });

  it('タスクが空配列なら空配列を返す', () => {
    assert.deepEqual(getCloseCandidatesOld([]), []);
  });
});

// ─── getCategoryReviewCandidates ──────────────────────────────────────────────

describe('getCategoryReviewCandidates', () => {
  const today = '2026-05-01';

  it('waiting due 超過・waiting due なし・someday が正しく分類される', () => {
    const waitingTasks = [
      makeTask({ number: 1, gtdCategory: 'waiting', due: '2026-04-30' }), // 超過
      makeTask({ number: 2, gtdCategory: 'waiting', due: null }),           // due なし
      makeTask({ number: 3, gtdCategory: 'waiting', due: today }),          // 今日（超過に含めない）
    ];
    const somedayTasks = [
      makeTask({ number: 4, gtdCategory: 'someday' }),
    ];

    const result = getCategoryReviewCandidates(waitingTasks, somedayTasks, today);
    assert.equal(result.waitingOverdue.length, 1);
    assert.equal(result.waitingOverdue[0].number, 1);
    assert.equal(result.waitingNoDue.length, 1);
    assert.equal(result.waitingNoDue[0].number, 2);
    assert.equal(result.someday.length, 1);
    assert.equal(result.someday[0].number, 4);
  });

  it('タスクが空配列なら全セクション空配列', () => {
    const result = getCategoryReviewCandidates([], [], today);
    assert.deepEqual(result.waitingOverdue, []);
    assert.deepEqual(result.waitingNoDue, []);
    assert.deepEqual(result.someday, []);
  });
});
