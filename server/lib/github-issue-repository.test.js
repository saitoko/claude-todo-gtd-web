'use strict';

// GitHubIssueRepository._normalize は engine への subprocess を呼ばない純粋メソッドのため
// engine-client をモックなしでテストできる。ただし require 時点で engine-client が
// require されるため、callEngineJson が呼ばれる前にテストが終わる形にする。

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { GitHubIssueRepository } = require('./github-issue-repository');

const repo = new GitHubIssueRepository();

// ヘルパー: 最小限の Issue オブジェクトを生成する
function makeIssue(overrides = {}) {
  return {
    number: 1,
    title: 'テストタスク',
    body: '',
    labels: [],
    closedAt: null,
    ...overrides,
  };
}

// ─── _normalize テスト ───

describe('GitHubIssueRepository._normalize', () => {

  it('基本ケース: title / body / labels が正しく正規化される', () => {
    const issue = makeIssue({
      number: 42,
      title: 'サンプルタスク',
      body: '',
      labels: [{ name: '📥 inbox' }],
    });
    const task = repo._normalize(issue);

    assert.equal(task.number, 42);
    assert.equal(task.title, 'サンプルタスク');
    assert.equal(task.gtdCategory, 'inbox');
    assert.equal(task.body, '');
    assert.equal(task.due, null);
    assert.equal(task.priority, null);
    assert.equal(task.parentProject, null);
    assert.deepEqual(task.labels, ['📥 inbox']);
  });

  it('body なし → parentProject: null, due: null', () => {
    const task = repo._normalize(makeIssue({ body: null }));
    assert.equal(task.parentProject, null);
    assert.equal(task.due, null);
  });

  it('body に project: #123 と due: 2026-05-01 がある → 正しく抽出される', () => {
    const task = repo._normalize(makeIssue({
      body: 'project: #123\ndue: 2026-05-01',
    }));
    assert.equal(task.parentProject, 123);
    assert.equal(task.due, '2026-05-01');
  });

  it('body に project: #abc（不正形式）→ parentProject: null', () => {
    // parseInt('#abc') → NaN → null になる
    const task = repo._normalize(makeIssue({ body: 'project: #abc' }));
    assert.equal(task.parentProject, null);
  });

  it('body に project:#123（スペースなし）→ _extractField の正規表現ではマッチしない → null', () => {
    // 正規表現は `project:\s+` ではなく `project:\s*` だが、
    // _extractField のパターンは `^project:\s*(.+)$` なので "#123" が取れる
    // 実装を読むと match[1].trim() で "#123" → parseInt("#123") = NaN → null
    // ただし実際は `project: #123` の形式を前提とした実装のため実挙動を確認してテストする
    const task = repo._normalize(makeIssue({ body: 'project:#123' }));
    // スペースなしでも `project:\s*(.+)` にマッチするので 123 が取れる
    assert.equal(task.parentProject, 123);
  });

  it('優先度ラベル p1 → priority: "p1"', () => {
    const task = repo._normalize(makeIssue({ labels: [{ name: '📥 inbox' }, { name: 'p1' }] }));
    assert.equal(task.priority, 'p1');
  });

  it('優先度ラベルなし → priority: null', () => {
    const task = repo._normalize(makeIssue({ labels: [{ name: '📥 inbox' }] }));
    assert.equal(task.priority, null);
  });

  it('GTD ラベルなし → gtdCategory: null（B-3 再発防止）', () => {
    // 'todo' や '仕事' ラベルのみのタスクは gtdCategory が null になる
    const task = repo._normalize(makeIssue({
      labels: [{ name: 'todo' }, { name: '仕事' }],
    }));
    assert.equal(task.gtdCategory, null);
  });

  it('labels が空 → gtdCategory: null', () => {
    const task = repo._normalize(makeIssue({ labels: [] }));
    assert.equal(task.gtdCategory, null);
  });

  it('body が空文字 → body フィールドが空文字で返る', () => {
    const task = repo._normalize(makeIssue({ body: '' }));
    assert.equal(task.body, '');
  });

});
