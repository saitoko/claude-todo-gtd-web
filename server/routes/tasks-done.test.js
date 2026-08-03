'use strict';

/**
 * POST /api/tasks/:number/done のルートテスト（Issue #1672）
 *
 * 背景: #1669 で GitHubIssueRepository.done() が recurCreated
 * （次周期に再作成されたIssueの対応表）を返すようになったが、
 * server/routes/tasks.js のレスポンスには含まれていなかった。
 * 本テストは「repo.done() の戻り値が HTTP レスポンスにそのまま
 * 反映されること」を実際に express ルーターへリクエストを送って検証する。
 *
 * github-issue-repository モジュールをモジュールキャッシュ差し替えでモックする
 * （github-issue-repository-done.test.js と同じ手法）。
 */

const { describe, it, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');

const repoModulePath = path.resolve(__dirname, '../lib/github-issue-repository.js');
const routesModulePath = path.resolve(__dirname, 'tasks.js');

/** repo.done() の戻り値/挙動を差し替えて router を読み込み直す */
function mockRepoDone(doneImpl) {
  delete require.cache[repoModulePath];
  delete require.cache[routesModulePath];
  require.cache[repoModulePath] = {
    id: repoModulePath,
    filename: repoModulePath,
    loaded: true,
    exports: {
      GitHubIssueRepository: class {
        async done(_tenant, issueNumber, options) {
          return doneImpl(issueNumber, options);
        }
      },
    },
    children: [],
    paths: [],
    parent: null,
  };
}

function restoreRepoModule() {
  delete require.cache[repoModulePath];
  delete require.cache[routesModulePath];
}

/** モックした tasks.js router を使い、ephemeral port で express app を起動する */
function startTestServer() {
  delete require.cache[routesModulePath];
  // eslint-disable-next-line global-require
  const { router } = require('./tasks');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req._tenant = { owner: 'test-owner', repo: 'test-repo', token: 'test-token' };
    next();
  });
  app.use('/api', router);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function stopTestServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function postDone(server, number, body) {
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/api/tasks/${number}/done`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

describe('POST /api/tasks/:number/done ルート', () => {
  let server;

  beforeEach(async () => {
    if (server) {
      await stopTestServer(server);
      server = undefined;
    }
    restoreRepoModule();
  });

  after(async () => {
    if (server) await stopTestServer(server);
    restoreRepoModule();
  });

  it('正常系: recur再作成が起きた場合、レスポンスの recurCreated に含まれること', async () => {
    mockRepoDone(async (issueNumber) => ({
      closedChildren: [],
      recurCreated: [{ number: issueNumber, newIssueNumber: 1671 }],
    }));
    server = await startTestServer();

    const { status, json } = await postDone(server, 1670);

    assert.equal(status, 200);
    assert.equal(json.ok, true);
    assert.deepEqual(json.recurCreated, [{ number: 1670, newIssueNumber: 1671 }]);
  });

  it('正常系: recur再作成が起きない通常のdoneでは recurCreated が空配列で返ること', async () => {
    mockRepoDone(async () => ({ closedChildren: [], recurCreated: [] }));
    server = await startTestServer();

    const { status, json } = await postDone(server, 1680);

    assert.equal(status, 200);
    assert.equal(json.ok, true);
    assert.deepEqual(json.recurCreated, []);
  });

  it('境界値: withChildren で複数の子タスクのうち一部だけrecur再作成 → 該当分のみ recurCreated に含まれること', async () => {
    mockRepoDone(async (issueNumber, options) => {
      assert.equal(options.withChildren, true);
      return {
        closedChildren: [201, 202],
        recurCreated: [{ number: 201, newIssueNumber: 301 }], // 202 は recur なし
      };
    });
    server = await startTestServer();

    const { status, json } = await postDone(server, 200, { withChildren: true });

    assert.equal(status, 200);
    assert.deepEqual(json.closedChildren, [201, 202]);
    assert.deepEqual(json.recurCreated, [{ number: 201, newIssueNumber: 301 }]);
  });

  it('異常系: done自体が失敗（PARENT_CLOSE_FAILED）した場合、200レスポンスにならず recurCreated も含まれないこと', async () => {
    mockRepoDone(async () => {
      const err = new Error('親プロジェクト #400 のcloseに失敗');
      err.code = 'PARENT_CLOSE_FAILED';
      err.closedChildren = [];
      err.cause = 'GitHub API エラー';
      throw err;
    });
    server = await startTestServer();

    const { status, json } = await postDone(server, 400);

    assert.equal(status, 500);
    assert.equal(json.recurCreated, undefined, 'エラー時に recurCreated フィールドが誤って含まれないこと');
    assert.equal(json.parentStillOpen, true);
  });

  it('異常系: 無効な Issue 番号（0以下）→ 400エラーで recurCreated 判定ロジックに到達しないこと', async () => {
    mockRepoDone(async () => {
      throw new Error('呼ばれないはず');
    });
    server = await startTestServer();

    const { status, json } = await postDone(server, 0);

    assert.equal(status, 400);
    assert.equal(json.recurCreated, undefined);
  });
});
