/**
 * api.ts の ApiError / request() ユニットテスト
 * 実行: node --experimental-strip-types --test src/lib/api.test.ts
 *
 * Issue #1654: request<T>() が構造化エラーフィールド（code / closedChildren /
 * parentStillOpen / cause）を握りつぶし、文字列化した Error だけを throw して
 * いたため、ProjectTreeRow.tsx 側で `e.parentStillOpen` に到達できず復旧表示が
 * 発火しないバグの修正確認。
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError } from './api.ts';

// ─── fetch モックヘルパー ────────────────────────────────────────────────────

type OriginalFetch = typeof globalThis.fetch;
let originalFetch: OriginalFetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** 指定したステータス・ボディで応答する fetch モックをセットする */
function mockFetchJson(status: number, statusText: string, body: unknown): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), { status, statusText })) as typeof fetch;
}

/** JSON としてパースできないプレーンテキストで応答する fetch モックをセットする */
function mockFetchText(status: number, statusText: string, text: string): void {
  globalThis.fetch = (async () =>
    new Response(text, { status, statusText })) as typeof fetch;
}

/** 200 OK・空ボディ（204相当）を返す fetch モック */
function mockFetchNoContent(): void {
  globalThis.fetch = (async () => new Response(null, { status: 204 })) as typeof fetch;
}

// ─── 正常系: 構造化フィールドを持つエラーボディ ────────────────────────────────

describe('ApiError: PARENT_CLOSE_FAILED 相当の構造化エラーボディ', () => {
  it('parentStillOpen / closedChildren / cause がすべて ApiError インスタンスに格納される', async () => {
    mockFetchJson(500, 'Internal Server Error', {
      error: '親プロジェクト #42 のcloseに失敗',
      closedChildren: [43, 44],
      parentStillOpen: true,
      cause: 'GitHub API rate limit exceeded',
    });

    await assert.rejects(
      () => api.doneTask(42, { withChildren: true }),
      (err: unknown) => {
        assert.ok(err instanceof ApiError, 'ApiError インスタンスであること');
        const apiErr = err as ApiError;
        assert.equal(apiErr.status, 500);
        assert.equal(apiErr.statusText, 'Internal Server Error');
        assert.equal(apiErr.parentStillOpen, true);
        assert.deepEqual(apiErr.closedChildren, [43, 44]);
        assert.equal(apiErr.serverCause, 'GitHub API rate limit exceeded');
        assert.equal(apiErr.message, '500 Internal Server Error: 親プロジェクト #42 のcloseに失敗');
        return true;
      }
    );
  });

  it('CHILD_CLOSE_FAILED 相当の failedChildren も格納される', async () => {
    mockFetchJson(500, 'Internal Server Error', {
      error: '子タスクのクローズに失敗しました: #10, #11。親プロジェクトはオープンのままです。',
      failedChildren: [10, 11],
    });

    await assert.rejects(
      () => api.doneTask(1, { withChildren: true }),
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        const apiErr = err as ApiError;
        assert.deepEqual(apiErr.failedChildren, [10, 11]);
        assert.equal(apiErr.parentStillOpen, undefined);
        return true;
      }
    );
  });

  it('body 全体（未知フィールドを含む）が .body に保持される', async () => {
    mockFetchJson(500, 'Internal Server Error', {
      error: 'エラー',
      futureField: 'まだ定義されていないフィールド',
    });

    await assert.rejects(
      () => api.doneTask(1),
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal((err as ApiError).body.futureField, 'まだ定義されていないフィールド');
        return true;
      }
    );
  });
});

// ─── 正常系: 構造化フィールドなしの通常エラー ──────────────────────────────────

describe('ApiError: 構造化フィールドなしの通常エラー', () => {
  it('error フィールドのみのエラーでも message が正しく組み立てられる', async () => {
    mockFetchJson(400, 'Bad Request', { error: '無効な Issue 番号です' });

    await assert.rejects(
      () => api.getTaskDetail(-1),
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal((err as ApiError).message, '400 Bad Request: 無効な Issue 番号です');
        assert.equal((err as ApiError).parentStillOpen, undefined);
        assert.equal((err as ApiError).closedChildren, undefined);
        return true;
      }
    );
  });

  it('detail フィールドのみ（error なし）でも message に反映される', async () => {
    mockFetchJson(500, 'Internal Server Error', { detail: 'engine の詳細メッセージ' });

    await assert.rejects(
      () => api.getTaskDetail(1),
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal((err as ApiError).message, '500 Internal Server Error: engine の詳細メッセージ');
        return true;
      }
    );
  });

  it('err instanceof Error でも判定できる（既存呼び出し側の互換性）', async () => {
    mockFetchJson(400, 'Bad Request', { error: 'タイトルが空です' });

    await assert.rejects(
      () => api.addTask({ title: '' }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        if (err instanceof Error) {
          assert.equal(err.message, '400 Bad Request: タイトルが空です');
        }
        return true;
      }
    );
  });

  it('error / detail いずれもない空ボディの場合はステータス行のみの message になる', async () => {
    mockFetchJson(500, 'Internal Server Error', {});

    await assert.rejects(
      () => api.getTaskDetail(1),
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal((err as ApiError).message, '500 Internal Server Error');
        return true;
      }
    );
  });
});

// ─── 境界値: JSON としてパースできないエラーボディ ─────────────────────────────

describe('ApiError: JSON パース不能なエラーボディのフォールバック', () => {
  it('プレーンテキストのエラーボディは detail としてそのまま保持される', async () => {
    mockFetchText(502, 'Bad Gateway', 'upstream connect error');

    await assert.rejects(
      () => api.getTaskDetail(1),
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        const apiErr = err as ApiError;
        assert.equal(apiErr.detail, 'upstream connect error');
        assert.equal(apiErr.message, '502 Bad Gateway: upstream connect error');
        return true;
      }
    );
  });

  it('空文字列のエラーボディでもエラーにならず message はステータス行のみになる', async () => {
    mockFetchText(500, 'Internal Server Error', '');

    await assert.rejects(
      () => api.getTaskDetail(1),
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal((err as ApiError).message, '500 Internal Server Error');
        return true;
      }
    );
  });

  it('JSON配列など object でないパース結果は detail に文字列化して格納される', async () => {
    mockFetchText(500, 'Internal Server Error', '"plain json string"');

    await assert.rejects(
      () => api.getTaskDetail(1),
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal((err as ApiError).detail, 'plain json string');
        return true;
      }
    );
  });
});

// ─── 正常系（成功パス）: 既存の request() 動作に回帰がないこと ─────────────────

describe('request(): 成功パスの回帰確認', () => {
  it('204 No Content は空オブジェクトとして解決される', async () => {
    mockFetchNoContent();
    const result = await api.moveTask(1, 'next');
    assert.deepEqual(result, {});
  });

  it('200 OK は JSON ボディがそのまま解決される', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: true, owner: 'saitoko', repo: 'x', uptime: 1 }), {
        status: 200,
      })) as typeof fetch;
    const result = await api.health();
    assert.deepEqual(result, { ok: true, owner: 'saitoko', repo: 'x', uptime: 1 });
  });
});
