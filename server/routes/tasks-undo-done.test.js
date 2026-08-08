'use strict';

/**
 * POST /api/tasks/:number/undo-done のルートテスト（Issue #1656）
 *
 * 完了Undoトースト用のエンドポイント。repo.undoDone() の呼び出しと戻り値が
 * HTTPレスポンスに正しく反映されること、不正な入力が400で弾かれることを検証する。
 * ハーネスは route-test-utils.js を使う（tasks-done.test.js と同じ手法）。
 */

const { describe, it, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  mockRepository,
  restoreRepository,
  startTestServer,
  stopTestServer,
  apiRequest,
} = require('./route-test-utils');

/** repo.undoDone() の戻り値/挙動を差し替えて router を読み込み直す */
function mockRepoUndoDone(undoDoneImpl) {
  mockRepository({
    undoDone: async (_tenant, issueNumber, options) => undoDoneImpl(issueNumber, options),
  });
}

const restoreRepoModule = restoreRepository;

function postUndoDone(server, number, body) {
  return apiRequest(server, 'POST', `/api/tasks/${number}/undo-done`, body ?? {});
}

describe('POST /api/tasks/:number/undo-done ルート', () => {
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

  it('正常系: recurCreatedNumber なし → repo.undoDone が { recurCreatedNumber: undefined } で呼ばれ、200 {ok:true} が返る', async () => {
    let receivedOptions;
    mockRepoUndoDone(async (_num, options) => {
      receivedOptions = options;
      return { ok: true };
    });
    server = await startTestServer();

    const { status, json } = await postUndoDone(server, 1670);

    assert.equal(status, 200);
    assert.deepEqual(json, { ok: true });
    assert.deepEqual(receivedOptions, { recurCreatedNumber: undefined });
  });

  it('正常系: recurCreatedNumber あり・成功 → 200 {ok:true}（recurCloseFailedキーなし）', async () => {
    let receivedOptions;
    mockRepoUndoDone(async (_num, options) => {
      receivedOptions = options;
      return { ok: true };
    });
    server = await startTestServer();

    const { status, json } = await postUndoDone(server, 1670, { recurCreatedNumber: 1671 });

    assert.equal(status, 200);
    assert.deepEqual(json, { ok: true });
    assert.equal(json.recurCloseFailed, undefined);
    assert.deepEqual(receivedOptions, { recurCreatedNumber: 1671 });
  });

  it('正常系: recurCreatedNumber あり・close側だけ失敗 → 200 {ok:true, recurCloseFailed:true}', async () => {
    mockRepoUndoDone(async () => ({ ok: true, recurCloseFailed: true }));
    server = await startTestServer();

    const { status, json } = await postUndoDone(server, 1670, { recurCreatedNumber: 1671 });

    assert.equal(status, 200);
    assert.deepEqual(json, { ok: true, recurCloseFailed: true });
  });

  it('異常系: repo.undoDone が reject（reopen自体の失敗を模す） → 500、ENGINE_ERROR相当のエラーレスポンス', async () => {
    mockRepoUndoDone(async () => {
      const err = new Error('存在しない Issue');
      err.code = 'ENGINE_ERROR';
      err.engineStderr = '存在しない Issue';
      throw err;
    });
    server = await startTestServer();

    const { status, json } = await postUndoDone(server, 9999);

    assert.equal(status, 500);
    assert.equal(json.error, 'engine エラー');
  });

  it('異常系: :number が不正（12abc等） → 400、repo.undoDoneが呼ばれないこと', async () => {
    mockRepoUndoDone(async () => {
      throw new Error('呼ばれないはず');
    });
    server = await startTestServer();

    const { status, json } = await postUndoDone(server, '12abc');

    assert.equal(status, 400);
    assert.ok(json.error);
  });

  it('異常系: recurCreatedNumber が文字列・負数・0・小数 → 400（validateOptionalPositiveIntegerの境界）', async () => {
    mockRepoUndoDone(async () => {
      throw new Error('呼ばれないはず');
    });
    server = await startTestServer();

    for (const bad of ['1671', -1, 0, 1.5]) {
      const { status, json } = await postUndoDone(server, 1670, { recurCreatedNumber: bad });
      assert.equal(status, 400, `recurCreatedNumber=${JSON.stringify(bad)} は400になるべき`);
      assert.ok(json.error);
    }
  });
});
