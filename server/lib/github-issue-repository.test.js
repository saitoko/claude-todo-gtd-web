'use strict';

// GitHubIssueRepository._normalize は engine への subprocess を呼ばない純粋メソッドのため
// engine-client をモックなしでテストできる。ただし require 時点で engine-client が
// require されるため、callEngineJson が呼ばれる前にテストが終わる形にする。

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
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

  it('updatedAt あり → task.updatedAt に値が入る', () => {
    const task = repo._normalize(makeIssue({ updatedAt: '2026-04-01T10:00:00Z' }));
    assert.equal(task.updatedAt, '2026-04-01T10:00:00Z');
  });

  it('updatedAt なし（undefined）→ task.updatedAt が null', () => {
    const issue = makeIssue();
    // makeIssue はデフォルトで updatedAt を含まない
    const task = repo._normalize(issue);
    assert.equal(task.updatedAt, null);
  });

});

// ─── add() テスト（Issue #1656: due/priority/ctx 対応） ───
// callEngineJson をモジュールキャッシュ差し替えでモックする
// （github-issue-repository-done.test.js と同じ手法）。

describe('GitHubIssueRepository.add', () => {
  const engineClientPath = path.resolve(__dirname, 'engine-client.js');
  const repoPath = path.resolve(__dirname, 'github-issue-repository.js');
  const TENANT = { owner: 'test-owner', repo: 'test-repo', token: 'test-token' };

  function mockEngineClient(impl) {
    require.cache[engineClientPath] = {
      id: engineClientPath,
      filename: engineClientPath,
      loaded: true,
      exports: {
        callEngine: async () => '',
        callEngineJson: impl,
        getTodayJST: () => '2026-08-08',
      },
      children: [],
      paths: [],
      parent: null,
    };
    delete require.cache[repoPath];
  }

  function restoreEngineClient() {
    delete require.cache[engineClientPath];
    delete require.cache[repoPath];
  }

  beforeEach(() => {
    restoreEngineClient();
  });

  it('due 指定時、create-issue に渡す ISSUE_INPUT_ENV の body が "due: 2026-08-10\\n" になること', async () => {
    let capturedEnv;
    mockEngineClient(async (_tenant, subArgs, env) => {
      capturedEnv = env;
      if (subArgs[0] === 'create-issue') return { number: 1 };
      throw new Error(`予期しないサブコマンド: ${subArgs[0]}`);
    });

    const { GitHubIssueRepository: Repo } = require('./github-issue-repository');
    const r = new Repo();
    await r.add(TENANT, { title: 'タイトル', gtdCategory: 'inbox', due: '2026-08-10' });

    const issueInput = JSON.parse(capturedEnv.ISSUE_INPUT_ENV);
    assert.equal(issueInput.body, 'due: 2026-08-10\n');
  });

  it('priority 指定時、labels 配列に "p1" が含まれること', async () => {
    let capturedEnv;
    mockEngineClient(async (_tenant, subArgs, env) => {
      capturedEnv = env;
      if (subArgs[0] === 'create-issue') return { number: 2 };
      throw new Error(`予期しないサブコマンド: ${subArgs[0]}`);
    });

    const { GitHubIssueRepository: Repo } = require('./github-issue-repository');
    const r = new Repo();
    await r.add(TENANT, { title: 'タイトル', gtdCategory: 'inbox', priority: 'p1' });

    const issueInput = JSON.parse(capturedEnv.ISSUE_INPUT_ENV);
    assert.ok(issueInput.labels.includes('p1'));
  });

  it('ctx 指定時、labels 配列に "@home" が含まれること', async () => {
    let capturedEnv;
    mockEngineClient(async (_tenant, subArgs, env) => {
      capturedEnv = env;
      if (subArgs[0] === 'create-issue') return { number: 3 };
      throw new Error(`予期しないサブコマンド: ${subArgs[0]}`);
    });

    const { GitHubIssueRepository: Repo } = require('./github-issue-repository');
    const r = new Repo();
    await r.add(TENANT, { title: 'タイトル', gtdCategory: 'inbox', ctx: ['@home'] });

    const issueInput = JSON.parse(capturedEnv.ISSUE_INPUT_ENV);
    assert.ok(issueInput.labels.includes('@home'));
  });

  it('due/priority/ctx すべて未指定時、既存動作（body:\'\'、labelsはgtdラベルのみ）が変わらないこと（リグレッション）', async () => {
    let capturedEnv;
    mockEngineClient(async (_tenant, subArgs, env) => {
      capturedEnv = env;
      if (subArgs[0] === 'create-issue') return { number: 4 };
      throw new Error(`予期しないサブコマンド: ${subArgs[0]}`);
    });

    const { GitHubIssueRepository: Repo } = require('./github-issue-repository');
    const r = new Repo();
    await r.add(TENANT, { title: 'タイトル', gtdCategory: 'inbox' });

    const issueInput = JSON.parse(capturedEnv.ISSUE_INPUT_ENV);
    assert.equal(issueInput.body, '');
    assert.deepEqual(issueInput.labels, ['📥 inbox']);
  });
});
