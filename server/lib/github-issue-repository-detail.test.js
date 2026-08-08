'use strict';

/**
 * GitHubIssueRepository.getDetail のユニットテスト
 *
 * callEngineJson をモジュールキャッシュ差し替えでモックする。
 * Node.js 22+ の mock.module が不要な方法（require.cache 差し替え）を採用。
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// engine-client モジュールのパスを解決
const engineClientPath = path.resolve(__dirname, 'engine-client.js');
const repoPath = path.resolve(__dirname, 'github-issue-repository.js');

// ダミー tenant（実際には使用しない。callEngineJson をモックするため）
const TENANT = { owner: 'test-owner', repo: 'test-repo', token: 'test-token' };

// 正常系の issue 詳細レスポンス（view-issue-detail 相当）
// due / project 制御行と p2 ラベルを含め、_normalize() 経由での
// due/priority/gtdCategory/parentProject 抽出を検証できるようにする（Issue #1712/#1716）。
const ISSUE_DETAIL = {
  number: 42,
  title: 'テストタスク',
  body: 'due: 2026-05-01\nproject: #10\n\n本文メモ',
  labels: [{ name: '📥 inbox' }, { name: 'p2' }],
  assignees: ['user-a', 'user-b'],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-04-24T10:00:00Z',
  closedAt: null,
};

// 正常系のコメント配列（list-comments 相当）
const COMMENTS = [
  { id: 1, author: 'user-a', body: 'コメント1', createdAt: '2026-04-01T09:00:00Z' },
  { id: 2, author: 'user-b', body: 'コメント2', createdAt: '2026-04-02T10:00:00Z' },
];

/**
 * callEngineJson の実装を差し替える
 * モジュールキャッシュを上書きして、GitHubIssueRepository が読み込む
 * engine-client を制御する。
 */
function mockEngineClient(impl) {
  // engine-client のキャッシュを差し替える
  require.cache[engineClientPath] = {
    id: engineClientPath,
    filename: engineClientPath,
    loaded: true,
    exports: {
      callEngine: async () => '',
      callEngineJson: impl,
      getTodayJST: () => '2026-04-24',
    },
    children: [],
    paths: [],
    parent: null,
  };

  // github-issue-repository のキャッシュを削除して再 require させる
  delete require.cache[repoPath];
}

function restoreEngineClient() {
  delete require.cache[engineClientPath];
  delete require.cache[repoPath];
}

// ─── getDetail テスト ───

describe('GitHubIssueRepository.getDetail', () => {

  beforeEach(() => {
    restoreEngineClient();
  });

  it('正常系: issue 詳細とコメントが正しく返る', async () => {
    let callCount = 0;
    mockEngineClient(async (_tenant, subArgs) => {
      callCount++;
      if (subArgs[0] === 'view-issue-detail') return ISSUE_DETAIL;
      if (subArgs[0] === 'list-comments') return COMMENTS;
      throw new Error(`予期しないサブコマンド: ${subArgs[0]}`);
    });

    const { GitHubIssueRepository } = require('./github-issue-repository');
    const repo = new GitHubIssueRepository();
    const detail = await repo.getDetail(TENANT, 42);

    assert.equal(detail.number, 42);
    assert.equal(detail.title, 'テストタスク');
    assert.equal(detail.body, 'due: 2026-05-01\nproject: #10\n\n本文メモ');
    assert.deepEqual(detail.labels, ['📥 inbox', 'p2']);
    assert.deepEqual(detail.assignees, ['user-a', 'user-b']);
    assert.equal(detail.createdAt, '2026-01-01T00:00:00Z');
    assert.equal(detail.updatedAt, '2026-04-24T10:00:00Z');
    assert.equal(detail.comments.length, 2);
    assert.equal(detail.comments[0].author, 'user-a');
    assert.equal(detail.comments[1].body, 'コメント2');
    assert.equal(callCount, 2, 'engine が 2 回呼ばれること');

    // Issue #1712/#1716: getDetail が _normalize() 経由で due/priority/gtdCategory/
    // parentProject を返すこと（従来はこれらが欠落し EditForm の due 初期値が常に
    // '' になって保存時に due が消滅するデータ損失バグの原因だった）
    assert.equal(detail.due, '2026-05-01', 'body の due: 行から due が抽出されること');
    assert.equal(detail.priority, 'p2', 'p2 ラベルから priority が抽出されること');
    assert.equal(detail.gtdCategory, 'inbox', '📥 inbox ラベルから gtdCategory が抽出されること');
    assert.equal(detail.parentProject, 10, 'body の project: #10 行から parentProject が抽出されること');
  });

  it('GTD ラベルが付いていない issue: gtdCategory は null、due/project 行がない body では due/parentProject も null', async () => {
    const noLabelIssue = {
      ...ISSUE_DETAIL,
      body: '本文メモのみ',
      labels: [{ name: '@personal' }],
    };
    mockEngineClient(async (_tenant, subArgs) => {
      if (subArgs[0] === 'view-issue-detail') return noLabelIssue;
      if (subArgs[0] === 'list-comments') return [];
      throw new Error(`予期しないサブコマンド: ${subArgs[0]}`);
    });

    const { GitHubIssueRepository } = require('./github-issue-repository');
    const repo = new GitHubIssueRepository();
    const detail = await repo.getDetail(TENANT, 42);

    assert.equal(detail.gtdCategory, null, 'GTD ラベルが1つもない場合 gtdCategory は null');
    assert.equal(detail.due, null, 'due: 行がない body では due は null');
    assert.equal(detail.priority, null, 'p1/p2/p3 ラベルがない場合 priority は null');
    assert.equal(detail.parentProject, null, 'project: 行がない body では parentProject は null');
    assert.deepEqual(detail.labels, ['@personal']);
  });

  it('コメント取得失敗時: comments: [] を返し、他フィールドは正常', async () => {
    mockEngineClient(async (_tenant, subArgs) => {
      if (subArgs[0] === 'view-issue-detail') return ISSUE_DETAIL;
      if (subArgs[0] === 'list-comments') throw new Error('GitHub API タイムアウト');
      throw new Error(`予期しないサブコマンド: ${subArgs[0]}`);
    });

    const { GitHubIssueRepository } = require('./github-issue-repository');
    const repo = new GitHubIssueRepository();
    const detail = await repo.getDetail(TENANT, 42);

    assert.equal(detail.number, 42);
    assert.equal(detail.title, 'テストタスク');
    assert.deepEqual(detail.comments, [], 'コメント失敗時は空配列');
    assert.deepEqual(detail.assignees, ['user-a', 'user-b'], '担当者は正常に返る');
    // コメント取得失敗時も _normalize() の結果（due/priority/gtdCategory/parentProject）は
    // list-comments の失敗と独立に正常に返ること
    assert.equal(detail.due, '2026-05-01');
    assert.equal(detail.priority, 'p2');
    assert.equal(detail.gtdCategory, 'inbox');
    assert.equal(detail.parentProject, 10);
  });

  it('view-issue-detail 失敗時: throw する', async () => {
    mockEngineClient(async (_tenant, subArgs) => {
      if (subArgs[0] === 'view-issue-detail') {
        const err = new Error('engine エラー');
        err.code = 'ENGINE_ERROR';
        throw err;
      }
      return [];
    });

    const { GitHubIssueRepository } = require('./github-issue-repository');
    const repo = new GitHubIssueRepository();

    await assert.rejects(
      () => repo.getDetail(TENANT, 42),
      (err) => {
        assert.equal(err.code, 'ENGINE_ERROR');
        return true;
      },
      'view-issue-detail 失敗時は throw すること'
    );
  });

});
