'use strict';

/**
 * GitHubIssueRepository.undoDone のユニットテスト（Issue #1656）
 *
 * 完了Undoトースト用。①reopen-issueで元Issueを再オープン ②recurCreatedNumberが
 * あればclose-issueで次周期Issueも閉じる、という2段階の呼び出し順序・部分失敗時の
 * 挙動を検証する。callEngineJson をモジュールキャッシュ差し替えでモックする
 * （github-issue-repository-done.test.js と同じ手法）。
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

describe('GitHubIssueRepository.undoDone', () => {

  beforeEach(() => {
    restoreEngineClient();
  });

  it('正常系: recurCreatedNumberなし → reopen-issueのみ呼ばれ、close-issueは呼ばれないこと', async () => {
    const calls = [];
    mockEngineClient(async (_tenant, subArgs) => {
      calls.push(subArgs);
      if (subArgs[0] === 'reopen-issue') return { ok: true };
      throw new Error(`予期しないサブコマンド: ${subArgs.join(' ')}`);
    });

    const { GitHubIssueRepository } = require('./github-issue-repository');
    const repo = new GitHubIssueRepository();
    const result = await repo.undoDone(TENANT, 1670, {});

    assert.deepEqual(calls, [['reopen-issue', '1670']]);
    assert.deepEqual(result, { ok: true });
  });

  it('正常系: reopen-issue → close-issue の順でcallEngineJsonが呼ばれること（呼び出し順序の検証）', async () => {
    const calls = [];
    mockEngineClient(async (_tenant, subArgs) => {
      calls.push(subArgs);
      if (subArgs[0] === 'reopen-issue') return { ok: true };
      if (subArgs[0] === 'close-issue') return { ok: true };
      throw new Error(`予期しないサブコマンド: ${subArgs.join(' ')}`);
    });

    const { GitHubIssueRepository } = require('./github-issue-repository');
    const repo = new GitHubIssueRepository();
    const result = await repo.undoDone(TENANT, 1670, { recurCreatedNumber: 1671 });

    assert.deepEqual(calls, [
      ['reopen-issue', '1670'],
      ['close-issue', '1671'],
    ]);
    assert.deepEqual(result, { ok: true });
  });

  it('異常系: reopen-issueが失敗したら例外がそのままthrowされ、close-issueは呼ばれないこと', async () => {
    const calls = [];
    mockEngineClient(async (_tenant, subArgs) => {
      calls.push(subArgs);
      if (subArgs[0] === 'reopen-issue') {
        const err = new Error('存在しない Issue');
        err.code = 'ENGINE_ERROR';
        throw err;
      }
      throw new Error(`予期しないサブコマンド: ${subArgs.join(' ')}`);
    });

    const { GitHubIssueRepository } = require('./github-issue-repository');
    const repo = new GitHubIssueRepository();

    await assert.rejects(
      () => repo.undoDone(TENANT, 9999, { recurCreatedNumber: 9998 }),
      (err) => {
        assert.equal(err.code, 'ENGINE_ERROR');
        return true;
      }
    );
    assert.deepEqual(calls, [['reopen-issue', '9999']], 'close-issue が呼ばれていないこと');
  });

  it('異常系: reopen-issue成功後にclose-issueが失敗しても例外を投げず {ok:true, recurCloseFailed:true} を返すこと', async () => {
    const calls = [];
    mockEngineClient(async (_tenant, subArgs) => {
      calls.push(subArgs);
      if (subArgs[0] === 'reopen-issue') return { ok: true };
      if (subArgs[0] === 'close-issue') {
        const err = new Error('close失敗');
        err.code = 'ENGINE_ERROR';
        throw err;
      }
      throw new Error(`予期しないサブコマンド: ${subArgs.join(' ')}`);
    });

    const { GitHubIssueRepository } = require('./github-issue-repository');
    const repo = new GitHubIssueRepository();
    const result = await repo.undoDone(TENANT, 1670, { recurCreatedNumber: 1671 });

    assert.deepEqual(calls, [
      ['reopen-issue', '1670'],
      ['close-issue', '1671'],
    ]);
    assert.deepEqual(result, { ok: true, recurCloseFailed: true });
  });

});
