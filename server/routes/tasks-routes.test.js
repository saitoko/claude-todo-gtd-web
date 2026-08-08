'use strict';

/**
 * server/routes/tasks.js の routes レベルテスト（Issue #1658）
 *
 * これまで routes 層のテストは POST /tasks/:number/done（tasks-done.test.js）
 * だけで、他の6エンドポイントは「repo に何をどう渡しているか」「repo の戻り値が
 * どうレスポンスへ写像されるか」が未検証だった。本ファイルは正常系と
 * エラー写像（handleError）を実際の HTTP リクエストで検証する。
 *
 * 型検証 400 ガードは tasks-validation.test.js が担当する。
 */

const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

const {
  TEST_TENANT,
  mockRepository,
  restoreRepository,
  startTestServer,
  stopTestServer,
  apiRequest,
} = require('./route-test-utils');

describe('tasks routes（正常系・エラー写像）', () => {
  let server;

  /** mockRepository → startTestServer をまとめた小ヘルパー */
  async function withRepo(methods) {
    mockRepository(methods);
    server = await startTestServer();
    return server;
  }

  beforeEach(async () => {
    if (server) {
      await stopTestServer(server);
      server = undefined;
    }
    restoreRepository();
  });

  after(async () => {
    if (server) await stopTestServer(server);
    restoreRepository();
  });

  describe('GET /api/tasks', () => {
    it('gtd 未指定なら repo.list に null を渡し、戻り値をそのまま返すこと', async () => {
      const calls = [];
      const payload = {
        tasks: [{ number: 1, title: 'a', gtdCategory: 'inbox' }],
        total: 1,
        byCategory: { inbox: 1 },
      };
      await withRepo({
        list: async (tenant, gtdFilter) => {
          calls.push({ tenant, gtdFilter });
          return payload;
        },
      });

      const { status, json } = await apiRequest(server, 'GET', '/api/tasks');

      assert.equal(status, 200);
      assert.deepEqual(json, payload);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].gtdFilter, null);
      assert.deepEqual(calls[0].tenant, TEST_TENANT, 'TenantContext が repo へ渡ること');
    });

    it('?gtd=next はそのまま repo.list のフィルタに渡ること', async () => {
      let received;
      await withRepo({
        list: async (_tenant, gtdFilter) => {
          received = gtdFilter;
          return { tasks: [], total: 0, byCategory: {} };
        },
      });

      const { status } = await apiRequest(server, 'GET', '/api/tasks?gtd=next');

      assert.equal(status, 200);
      assert.equal(received, 'next');
    });

    it('?gtd=project は許可され、childTasks を含むレスポンスが透過すること', async () => {
      await withRepo({
        list: async (_tenant, gtdFilter) => {
          assert.equal(gtdFilter, 'project');
          return {
            tasks: [{ number: 10, title: 'P', gtdCategory: 'project' }],
            total: 2,
            byCategory: { project: 1, next: 1 },
            childTasks: [{ number: 11, title: 'C', gtdCategory: 'next', parentProject: 10 }],
          };
        },
      });

      const { status, json } = await apiRequest(server, 'GET', '/api/tasks?gtd=project');

      assert.equal(status, 200);
      assert.equal(json.childTasks.length, 1);
      assert.equal(json.childTasks[0].parentProject, 10);
    });
  });

  describe('POST /api/tasks', () => {
    it('201 と作成された Issue 番号を返すこと', async () => {
      await withRepo({ add: async () => ({ number: 4242 }) });

      const { status, json } = await apiRequest(server, 'POST', '/api/tasks', { title: 'new task' });

      assert.equal(status, 201);
      assert.deepEqual(json, { number: 4242 });
    });

    it('title の前後空白は trim され、gtdCategory 省略時は inbox になること', async () => {
      let received;
      await withRepo({
        add: async (_tenant, input) => {
          received = input;
          return { number: 1 };
        },
      });

      await apiRequest(server, 'POST', '/api/tasks', { title: '  余白あり  ' });

      assert.deepEqual(received, { title: '余白あり', gtdCategory: 'inbox' });
    });

    it('gtdCategory を指定するとそのカテゴリで作成されること', async () => {
      let received;
      await withRepo({
        add: async (_tenant, input) => {
          received = input;
          return { number: 2 };
        },
      });

      await apiRequest(server, 'POST', '/api/tasks', { title: 't', gtdCategory: 'someday' });

      assert.equal(received.gtdCategory, 'someday');
    });
  });

  describe('GET /api/tasks/:number', () => {
    it('repo.getDetail の戻り値をそのまま返すこと', async () => {
      const detail = {
        number: 55,
        title: 'detail',
        body: 'b',
        labels: ['🎯 next'],
        assignees: ['saitoko'],
        createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-02T00:00:00Z',
        comments: [{ id: 1, author: 'saitoko', body: 'c', createdAt: '2026-08-02T00:00:00Z' }],
      };
      let receivedNumber;
      await withRepo({
        getDetail: async (_tenant, num) => {
          receivedNumber = num;
          return detail;
        },
      });

      const { status, json } = await apiRequest(server, 'GET', '/api/tasks/55');

      assert.equal(status, 200);
      assert.deepEqual(json, detail);
      assert.equal(receivedNumber, 55, '文字列ではなく数値で repo に渡ること');
    });
  });

  describe('POST /api/tasks/:number/move', () => {
    it('repo.move に番号と移動先を渡し、{ ok: true } を返すこと', async () => {
      const calls = [];
      await withRepo({
        move: async (_tenant, num, targetGtd) => {
          calls.push([num, targetGtd]);
        },
      });

      const { status, json } = await apiRequest(server, 'POST', '/api/tasks/77/move', {
        targetGtd: 'waiting',
      });

      assert.equal(status, 200);
      assert.deepEqual(json, { ok: true });
      assert.deepEqual(calls, [[77, 'waiting']]);
    });
  });

  describe('PATCH /api/tasks/:number', () => {
    it('title / body / ラベル差分をまとめて patch として渡すこと', async () => {
      let received;
      await withRepo({
        update: async (_tenant, num, patch) => {
          received = { num, patch };
        },
      });

      const { status, json } = await apiRequest(server, 'PATCH', '/api/tasks/88', {
        title: '  新タイトル  ',
        body: '新しい本文',
        addLabels: ['p1', '@home'],
        removeLabels: ['p3'],
      });

      assert.equal(status, 200);
      assert.deepEqual(json, { ok: true });
      assert.equal(received.num, 88);
      assert.deepEqual(received.patch, {
        title: '新タイトル',
        body: '新しい本文',
        addLabels: ['p1', '@home'],
        removeLabels: ['p3'],
      });
    });

    it('body に空文字を指定した場合も patch に含めること（本文クリアが握りつぶされない）', async () => {
      let received;
      await withRepo({
        update: async (_tenant, _num, patch) => {
          received = patch;
        },
      });

      const { status } = await apiRequest(server, 'PATCH', '/api/tasks/88', { body: '' });

      assert.equal(status, 200);
      assert.deepEqual(received, { body: '' });
    });
  });

  describe('GET /api/labels', () => {
    it('repo.listLabels の結果を { labels } でラップして返すこと', async () => {
      await withRepo({
        listLabels: async () => [{ name: 'p1', color: 'ff0000' }],
      });

      const { status, json } = await apiRequest(server, 'GET', '/api/labels');

      assert.equal(status, 200);
      assert.deepEqual(json, { labels: [{ name: 'p1', color: 'ff0000' }] });
    });
  });

  describe('GET /api/gtd-labels', () => {
    it('静的な GTD 表示定義を repo を呼ばずに返し、キャッシュヘッダーを付けること', async () => {
      // repo は一切モックしない = 呼ばれたら例外 → 500 になる
      await withRepo({});

      const { status, json, headers } = await apiRequest(server, 'GET', '/api/gtd-labels');

      assert.equal(status, 200);
      assert.equal(json.projectKey, 'project');
      assert.deepEqual(json.keys, ['next', 'routine', 'inbox', 'waiting', 'someday', 'reference']);
      assert.equal(json.labels.inbox, '📥 Inbox');
      assert.match(headers.get('cache-control'), /max-age=86400/);
    });
  });

  describe('handleError のステータス写像', () => {
    it('TIMEOUT は 504 になること', async () => {
      await withRepo({
        list: async () => {
          throw Object.assign(new Error('engine タイムアウト (30秒)'), { code: 'TIMEOUT' });
        },
      });

      const { status, json } = await apiRequest(server, 'GET', '/api/tasks');

      assert.equal(status, 504);
      assert.match(json.error, /タイムアウト/);
    });

    it('ENGINE_ERROR は 500 になり engine の stderr が detail に載ること', async () => {
      await withRepo({
        move: async () => {
          throw Object.assign(new Error('failed'), {
            code: 'ENGINE_ERROR',
            engineStderr: '  Error: label not found\n',
          });
        },
      });

      const { status, json } = await apiRequest(server, 'POST', '/api/tasks/1/move', {
        targetGtd: 'next',
      });

      assert.equal(status, 500);
      assert.equal(json.error, 'engine エラー');
      assert.equal(json.detail, 'Error: label not found');
    });

    it('CHILD_CLOSE_FAILED は失敗した子タスク番号を返すこと', async () => {
      await withRepo({
        done: async () => {
          throw Object.assign(new Error('子タスクのクローズに失敗しました: #2'), {
            code: 'CHILD_CLOSE_FAILED',
            failedChildren: [2],
          });
        },
      });

      const { status, json } = await apiRequest(server, 'POST', '/api/tasks/1/done', {
        withChildren: true,
      });

      assert.equal(status, 500);
      assert.deepEqual(json.failedChildren, [2]);
    });

    it('コード無しの例外は 500「内部エラー」になること', async () => {
      await withRepo({
        listLabels: async () => {
          throw new Error('想定外');
        },
      });

      const { status, json } = await apiRequest(server, 'GET', '/api/labels');

      assert.equal(status, 500);
      assert.equal(json.error, '内部エラー');
      assert.equal(json.detail, '想定外');
    });
  });
});
