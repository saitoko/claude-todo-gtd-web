'use strict';

/**
 * routes レベルテスト用の共通ハーネス（Issue #1658）
 *
 * routes 層だけを検証したいので、GitHubIssueRepository（= engine サブプロセス
 * 呼び出し）をモジュールキャッシュ差し替えでモックし、ephemeral port に立てた
 * express app へ実際に HTTP リクエストを投げる。
 * ミドルウェア構成（express.json / req._tenant 注入 / '/api' マウント）は
 * server/index.js の本番構成と揃えてある。
 *
 * 使い方:
 *   mockRepository({ list: async () => ({ tasks: [] }) });
 *   const server = await startTestServer();
 *   const { status, json } = await apiRequest(server, 'GET', '/api/tasks');
 *   await stopTestServer(server);
 *   restoreRepository();
 *
 * 注意: mockRepository() は startTestServer() より前に呼ぶこと
 * （startTestServer が tasks.js を読み直す際にモックを解決するため）。
 */

const path = require('node:path');
const express = require('express');

const repoModulePath = path.resolve(__dirname, '../lib/github-issue-repository.js');
const routesModulePath = path.resolve(__dirname, 'tasks.js');

/** テスト用の TenantContext（engine には到達しないのでダミー値でよい） */
const TEST_TENANT = { owner: 'test-owner', repo: 'test-repo', token: 'test-token' };

/**
 * GitHubIssueRepository をモックに差し替える
 *
 * @param {Record<string, Function>} methods - モックするメソッド。
 *   未指定のメソッドが呼ばれた場合は「未モック」エラーを投げるため、
 *   「このルートは repo を呼ばないはず」という検証がそのまま書ける。
 */
function mockRepository(methods = {}) {
  delete require.cache[repoModulePath];
  delete require.cache[routesModulePath];

  class MockRepository {
    constructor() {
      return new Proxy(this, {
        get(target, prop) {
          if (typeof prop === 'symbol') return target[prop];
          if (Object.prototype.hasOwnProperty.call(methods, prop)) return methods[prop];
          return () => {
            throw new Error(`MockRepository.${String(prop)}() は未モックです（呼ばれない想定のメソッドです）`);
          };
        },
      });
    }
  }

  require.cache[repoModulePath] = {
    id: repoModulePath,
    filename: repoModulePath,
    loaded: true,
    exports: { GitHubIssueRepository: MockRepository },
    children: [],
    paths: [],
    parent: null,
  };
}

/** モジュールキャッシュを元に戻す（他テストファイルへの汚染防止） */
function restoreRepository() {
  delete require.cache[repoModulePath];
  delete require.cache[routesModulePath];
}

/**
 * モックした tasks.js router を使い、ephemeral port で express app を起動する
 * @returns {Promise<import('node:http').Server>}
 */
function startTestServer() {
  delete require.cache[routesModulePath];
  // eslint-disable-next-line global-require
  const { router } = require('./tasks');

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req._tenant = TEST_TENANT;
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

/**
 * テストサーバーへ HTTP リクエストを送り、ステータスとパース済みボディを返す
 *
 * @param {import('node:http').Server} server
 * @param {string} method - 'GET' | 'POST' | 'PATCH' ...
 * @param {string} urlPath - '/api/tasks' 等（クエリ文字列を含んでよい）
 * @param {unknown} [body] - 指定時のみ JSON ボディとして送る
 * @returns {Promise<{ status: number, json: any, headers: Headers }>}
 */
async function apiRequest(server, method, urlPath, body) {
  const { port } = server.address();
  const options = { method };
  if (body !== undefined) {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(body);
  }
  const res = await fetch(`http://127.0.0.1:${port}${urlPath}`, options);
  const json = await res.json().catch(() => null);
  return { status: res.status, json, headers: res.headers };
}

module.exports = {
  TEST_TENANT,
  mockRepository,
  restoreRepository,
  startTestServer,
  stopTestServer,
  apiRequest,
};
