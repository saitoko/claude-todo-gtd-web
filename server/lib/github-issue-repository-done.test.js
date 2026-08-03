'use strict';

/**
 * GitHubIssueRepository.done のユニットテスト（Issue #1669）
 *
 * 背景: 旧実装は `api close-issue`（close するだけ）しか呼ばず、CLI の
 * `/todo done` が呼ぶ postDoneProcessing（recur再作成 + depends_on昇格）を
 * 経由しないため、Web版でrecurタスクを完了すると繰り返しチェーンが無言で
 * 途切れるバグがあった。修正後は親・子どちらも `api done-issue` を呼ぶ。
 *
 * callEngineJson をモジュールキャッシュ差し替えでモックする
 * （github-issue-repository-detail.test.js と同じ手法。Node.js 22+ の
 * mock.module が不要な方法）。
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

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
      getTodayJST: () => '2026-08-03',
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

describe('GitHubIssueRepository.done', () => {

  beforeEach(() => {
    restoreEngineClient();
  });

  it('正常系: withChildren なし・recurあり → done-issue が呼ばれ newIssueNumber が recurCreated に入る（#1669の直接検証）', async () => {
    const calls = [];
    mockEngineClient(async (_tenant, subArgs) => {
      calls.push(subArgs);
      if (subArgs[0] === 'done-issue') {
        return { ok: true, recurLine: '繰り返しタスク #999 を 2026-08-10 で作成しました。', otherLines: [], newIssueNumber: 999 };
      }
      throw new Error(`予期しないサブコマンド: ${subArgs[0]}`);
    });

    const { GitHubIssueRepository } = require('./github-issue-repository');
    const repo = new GitHubIssueRepository();
    const result = await repo.done(TENANT, 100, {});

    assert.deepEqual(calls, [['done-issue', '100']], 'close-issue ではなく done-issue が呼ばれること');
    assert.deepEqual(result.closedChildren, []);
    assert.deepEqual(result.recurCreated, [{ number: 100, newIssueNumber: 999 }]);
  });

  it('正常系: recurなし → recurCreated が空配列のまま（余計なrecur扱いをしない）', async () => {
    mockEngineClient(async (_tenant, subArgs) => {
      if (subArgs[0] === 'done-issue') {
        return { ok: true, recurLine: null, otherLines: [], newIssueNumber: null };
      }
      throw new Error(`予期しないサブコマンド: ${subArgs[0]}`);
    });

    const { GitHubIssueRepository } = require('./github-issue-repository');
    const repo = new GitHubIssueRepository();
    const result = await repo.done(TENANT, 101, {});

    assert.deepEqual(result.recurCreated, []);
  });

  it('正常系: withChildren あり・子タスクにrecurあり → 子・親ともに done-issue が呼ばれ、両方のrecurCreatedが集計される', async () => {
    const calls = [];
    mockEngineClient(async (_tenant, subArgs) => {
      calls.push(subArgs);
      if (subArgs[0] === 'list-issues') {
        return [
          { number: 200, title: 'Parent Project', body: '', labels: [{ name: '📁 project' }], closedAt: null },
          { number: 201, title: 'Child A (recur)', body: 'project: #200\nrecur: weekly\n', labels: [{ name: '🎯 next' }], closedAt: null },
          { number: 202, title: 'Child B (norecur)', body: 'project: #200\n', labels: [{ name: '🎯 next' }], closedAt: null },
        ];
      }
      if (subArgs[0] === 'done-issue') {
        const num = subArgs[1];
        if (num === '201') return { ok: true, recurLine: '繰り返しタスク #301 を 2026-08-10 で作成しました。', otherLines: [], newIssueNumber: 301 };
        if (num === '202') return { ok: true, recurLine: null, otherLines: [], newIssueNumber: null };
        if (num === '200') return { ok: true, recurLine: null, otherLines: [], newIssueNumber: null };
      }
      throw new Error(`予期しないサブコマンド: ${subArgs.join(' ')}`);
    });

    const { GitHubIssueRepository } = require('./github-issue-repository');
    const repo = new GitHubIssueRepository();
    const result = await repo.done(TENANT, 200, { withChildren: true });

    assert.deepEqual(result.closedChildren.sort(), [201, 202]);
    assert.deepEqual(result.recurCreated, [{ number: 201, newIssueNumber: 301 }]);
    // 子（#201, #202）→ 親（#200）の順で done-issue が呼ばれ、いずれも close-issue ではない
    const doneIssueCalls = calls.filter(c => c[0] === 'done-issue').map(c => c[1]);
    assert.deepEqual(doneIssueCalls, ['201', '202', '200']);
    assert.ok(!calls.some(c => c[0] === 'close-issue'), 'close-issue が呼ばれていないこと（#1669の直接検証）');
  });

  it('境界値: 子タスクが0件（withChildren指定だが子なし）→ 親のみdone-issueが呼ばれエラーにならない', async () => {
    mockEngineClient(async (_tenant, subArgs) => {
      if (subArgs[0] === 'list-issues') return [];
      if (subArgs[0] === 'done-issue') return { ok: true, recurLine: null, otherLines: [], newIssueNumber: null };
      throw new Error(`予期しないサブコマンド: ${subArgs[0]}`);
    });

    const { GitHubIssueRepository } = require('./github-issue-repository');
    const repo = new GitHubIssueRepository();
    const result = await repo.done(TENANT, 300, { withChildren: true });

    assert.deepEqual(result.closedChildren, []);
    assert.deepEqual(result.recurCreated, []);
  });

  it('セキュリティ/異常系: 子タスクのdone-issueが失敗 → CHILD_CLOSE_FAILED を throw し、親のdone-issueは呼ばれない', async () => {
    const calls = [];
    mockEngineClient(async (_tenant, subArgs) => {
      calls.push(subArgs);
      if (subArgs[0] === 'list-issues') {
        return [
          { number: 200, title: 'Parent', body: '', labels: [{ name: '📁 project' }], closedAt: null },
          { number: 201, title: 'Child (fails)', body: 'project: #200\n', labels: [{ name: '🎯 next' }], closedAt: null },
        ];
      }
      if (subArgs[0] === 'done-issue' && subArgs[1] === '201') {
        const err = new Error('存在しない Issue');
        err.code = 'ENGINE_ERROR';
        throw err;
      }
      throw new Error(`予期しないサブコマンド: ${subArgs.join(' ')}`);
    });

    const { GitHubIssueRepository } = require('./github-issue-repository');
    const repo = new GitHubIssueRepository();

    await assert.rejects(
      () => repo.done(TENANT, 200, { withChildren: true }),
      (err) => {
        assert.equal(err.code, 'CHILD_CLOSE_FAILED');
        assert.deepEqual(err.failedChildren, [201]);
        return true;
      }
    );
    // 親（#200）の done-issue は呼ばれていないこと（子の失敗で親はオープンのまま）
    assert.ok(!calls.some(c => c[0] === 'done-issue' && c[1] === '200'), '子失敗時は親のdone-issueが呼ばれないこと');
  });

  it('異常系: 親のdone-issueが失敗 → PARENT_CLOSE_FAILED を throw し、closedChildren が保持される', async () => {
    mockEngineClient(async (_tenant, subArgs) => {
      if (subArgs[0] === 'done-issue' && subArgs[1] === '400') {
        const err = new Error('GitHub API エラー');
        throw err;
      }
      throw new Error(`予期しないサブコマンド: ${subArgs.join(' ')}`);
    });

    const { GitHubIssueRepository } = require('./github-issue-repository');
    const repo = new GitHubIssueRepository();

    await assert.rejects(
      () => repo.done(TENANT, 400, {}),
      (err) => {
        assert.equal(err.code, 'PARENT_CLOSE_FAILED');
        assert.equal(err.parentStillOpen, true);
        assert.deepEqual(err.closedChildren, []);
        return true;
      }
    );
  });

});
