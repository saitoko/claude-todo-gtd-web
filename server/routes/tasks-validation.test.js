'use strict';

/**
 * routes 層の型検証 400 ガードのテスト（Issue #1658）
 *
 * 背景: 各ルートは値の「有無」しか見ておらず「型」を見ていなかったため、
 * 型の違う入力が repo / engine 層まで到達して TypeError になり、
 * クライアントの入力ミスが 500（サーバー障害）として返っていた。
 * また `parseInt('12abc')` が 12 として通るなど、不正入力が
 * 別の Issue 番号として黙って処理される経路もあった。
 *
 * 本テストは「不正な型・形式の入力が repo に到達せず 400 で弾かれること」を
 * 実際に HTTP リクエストを送って検証する。各テストは repo のメソッドを
 * 一切モックしないため、ルートが誤って repo を呼べば 500 になりテストが落ちる
 * （= 400 を返せていることが repo 未到達の証明になる）。
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const {
  mockRepository,
  restoreRepository,
  startTestServer,
  stopTestServer,
  apiRequest,
} = require('./route-test-utils');

describe('routes 型検証 400 ガード', () => {
  let server;

  before(async () => {
    // メソッドを一切モックしない = repo が呼ばれたら例外 → 500 になる
    mockRepository({});
    server = await startTestServer();
  });

  after(async () => {
    if (server) await stopTestServer(server);
    restoreRepository();
  });

  describe('GET /api/tasks', () => {
    it('gtd に配列（?gtd[]=inbox）を渡すと 400 になること', async () => {
      const { status, json } = await apiRequest(server, 'GET', '/api/tasks?gtd[]=inbox');
      assert.equal(status, 400);
      assert.match(json.error, /gtd は文字列/);
      assert.equal(json.detail, 'array');
    });

    it('gtd にオブジェクト（?gtd[x]=1）を渡すと 400 になること', async () => {
      const { status, json } = await apiRequest(server, 'GET', '/api/tasks?gtd[x]=1');
      assert.equal(status, 400);
      assert.equal(json.detail, 'object');
    });

    it('未知の gtd カテゴリは 400 になること', async () => {
      const { status, json } = await apiRequest(server, 'GET', '/api/tasks?gtd=unknown');
      assert.equal(status, 400);
      assert.equal(json.detail, 'unknown');
    });
  });

  describe('POST /api/tasks', () => {
    it('title 未指定は 400「タイトルが空です」になること', async () => {
      const { status, json } = await apiRequest(server, 'POST', '/api/tasks', {});
      assert.equal(status, 400);
      assert.equal(json.error, 'タイトルが空です');
    });

    it('title が数値だと 400 になること（旧実装は title.trim() で TypeError → 500）', async () => {
      const { status, json } = await apiRequest(server, 'POST', '/api/tasks', { title: 123 });
      assert.equal(status, 400);
      assert.match(json.error, /title は文字列/);
      assert.equal(json.detail, 'number');
    });

    it('title が null だと 400「タイトルが空です」になること（旧実装は 500）', async () => {
      const { status, json } = await apiRequest(server, 'POST', '/api/tasks', { title: null });
      assert.equal(status, 400);
      assert.equal(json.error, 'タイトルが空です');
    });

    it('title が空白のみだと 400 になること', async () => {
      const { status, json } = await apiRequest(server, 'POST', '/api/tasks', { title: '   ' });
      assert.equal(status, 400);
      assert.equal(json.error, 'タイトルが空です');
    });

    it('gtdCategory がオブジェクトだと 400 になること', async () => {
      const { status, json } = await apiRequest(server, 'POST', '/api/tasks', {
        title: 'ok',
        gtdCategory: { key: 'next' },
      });
      assert.equal(status, 400);
      assert.match(json.error, /gtdCategory は文字列/);
      assert.equal(json.detail, 'object');
    });

    it('gtdCategory に project を指定すると 400 になること', async () => {
      const { status, json } = await apiRequest(server, 'POST', '/api/tasks', {
        title: 'ok',
        gtdCategory: 'project',
      });
      assert.equal(status, 400);
      assert.equal(json.detail, 'project');
    });

    // ── due/priority/ctx（Issue #1656: タスク追加時の詳細入力） ──

    it('due がスラッシュ区切り（2026/08/10）だと 400 になること', async () => {
      const { status, json } = await apiRequest(server, 'POST', '/api/tasks', {
        title: 'ok',
        due: '2026/08/10',
      });
      assert.equal(status, 400);
      assert.match(json.error, /due は YYYY-MM-DD 形式/);
    });

    it('due が形式は合うが実在しない日付（2026-13-40）でも 400 にならないこと（正規表現のみで検証する設計方針の明示）', async () => {
      const { status } = await apiRequest(server, 'POST', '/api/tasks', {
        title: 'ok',
        due: '2026-13-40',
      });
      assert.notEqual(status, 400);
    });

    it('due が数値だと 400 になること', async () => {
      const { status, json } = await apiRequest(server, 'POST', '/api/tasks', {
        title: 'ok',
        due: 20260810,
      });
      assert.equal(status, 400);
      assert.match(json.error, /due は文字列/);
    });

    it('priority が p4 だと 400 になること', async () => {
      const { status, json } = await apiRequest(server, 'POST', '/api/tasks', {
        title: 'ok',
        priority: 'p4',
      });
      assert.equal(status, 400);
      assert.match(json.error, /priority は p1\/p2\/p3/);
    });

    it('priority が数値だと 400 になること', async () => {
      const { status, json } = await apiRequest(server, 'POST', '/api/tasks', {
        title: 'ok',
        priority: 1,
      });
      assert.equal(status, 400);
      assert.match(json.error, /priority は文字列/);
    });

    it('ctx の要素が @ で始まらない（home）と 400 になること', async () => {
      const { status, json } = await apiRequest(server, 'POST', '/api/tasks', {
        title: 'ok',
        ctx: ['home'],
      });
      assert.equal(status, 400);
      assert.match(json.error, /ctx の要素は @ で始まる/);
    });

    it('ctx が文字列の配列でない（オブジェクト）と 400 になること', async () => {
      const { status, json } = await apiRequest(server, 'POST', '/api/tasks', {
        title: 'ok',
        ctx: { home: true },
      });
      assert.equal(status, 400);
      assert.match(json.error, /ctx は文字列の配列/);
    });

    it('ctx に空文字要素があると 400 になること（validateLabelArray委譲分）', async () => {
      const { status, json } = await apiRequest(server, 'POST', '/api/tasks', {
        title: 'ok',
        ctx: ['@home', '  '],
      });
      assert.equal(status, 400);
      assert.match(json.error, /空のラベル名/);
    });
  });

  describe(':number パラメータの厳密パース', () => {
    // 旧実装 parseInt(raw, 10) が別の番号として黙って通していた形式を含む
    const invalidNumbers = [
      '0',
      '-1',
      'abc',
      '12abc',
      '1.9',
      '1e3',
      '007',
      ' 12',
      '99999999999999999999', // Number.MAX_SAFE_INTEGER 超（精度落ちで別番号になる）
      '',
    ];

    for (const raw of invalidNumbers) {
      const label = raw === '' ? '(空文字)' : raw;
      it(`GET /api/tasks/${label} は 400 になること`, async () => {
        const { status, json } = await apiRequest(
          server,
          'GET',
          `/api/tasks/${encodeURIComponent(raw)}`
        );
        // 空文字は '/api/tasks/' となり GET /tasks（一覧）にマッチするため除外
        if (raw === '') {
          assert.notEqual(status, 200, '空の番号が一覧取得として成立してはいけない');
          return;
        }
        assert.equal(status, 400);
        assert.equal(json.error, '無効な Issue 番号です');
      });
    }

    it('POST /api/tasks/12abc/done も 400 になること（旧実装は #12 を完了していた）', async () => {
      const { status, json } = await apiRequest(server, 'POST', '/api/tasks/12abc/done', {});
      assert.equal(status, 400);
      assert.equal(json.error, '無効な Issue 番号です');
    });

    it('POST /api/tasks/12abc/move も 400 になること', async () => {
      const { status, json } = await apiRequest(server, 'POST', '/api/tasks/12abc/move', {
        targetGtd: 'next',
      });
      assert.equal(status, 400);
      assert.equal(json.error, '無効な Issue 番号です');
    });

    it('PATCH /api/tasks/12abc も 400 になること', async () => {
      const { status, json } = await apiRequest(server, 'PATCH', '/api/tasks/12abc', {
        title: 'x',
      });
      assert.equal(status, 400);
      assert.equal(json.error, '無効な Issue 番号です');
    });
  });

  describe('POST /api/tasks/:number/done', () => {
    it('withChildren に文字列 "false" を渡すと 400 になること（旧実装は true 扱いで子タスクを一括クローズしていた）', async () => {
      const { status, json } = await apiRequest(server, 'POST', '/api/tasks/100/done', {
        withChildren: 'false',
      });
      assert.equal(status, 400);
      assert.match(json.error, /withChildren は true \/ false/);
      assert.equal(json.detail, 'string');
    });

    it('withChildren に数値を渡すと 400 になること', async () => {
      const { status } = await apiRequest(server, 'POST', '/api/tasks/100/done', {
        withChildren: 1,
      });
      assert.equal(status, 400);
    });
  });

  describe('POST /api/tasks/:number/move', () => {
    it('targetGtd 未指定は 400 になること', async () => {
      const { status, json } = await apiRequest(server, 'POST', '/api/tasks/100/move', {});
      assert.equal(status, 400);
      assert.equal(json.error, 'targetGtd が指定されていません');
    });

    it('targetGtd が空文字は 400 になること', async () => {
      const { status, json } = await apiRequest(server, 'POST', '/api/tasks/100/move', {
        targetGtd: '',
      });
      assert.equal(status, 400);
      assert.equal(json.error, 'targetGtd が指定されていません');
    });

    it('targetGtd が数値だと 400 になること', async () => {
      const { status, json } = await apiRequest(server, 'POST', '/api/tasks/100/move', {
        targetGtd: 1,
      });
      assert.equal(status, 400);
      assert.match(json.error, /targetGtd は文字列/);
    });

    it('targetGtd が project だと 400 になること（昇格は CLI 側の責務）', async () => {
      const { status, json } = await apiRequest(server, 'POST', '/api/tasks/100/move', {
        targetGtd: 'project',
      });
      assert.equal(status, 400);
      assert.match(json.error, /project への移動はできません/);
    });

    it('未知の targetGtd は 400 になること', async () => {
      const { status, json } = await apiRequest(server, 'POST', '/api/tasks/100/move', {
        targetGtd: 'unknown',
      });
      assert.equal(status, 400);
      assert.equal(json.detail, 'unknown');
    });
  });

  describe('PATCH /api/tasks/:number', () => {
    it('title が数値だと 400 になること（旧実装は 500）', async () => {
      const { status, json } = await apiRequest(server, 'PATCH', '/api/tasks/100', { title: 5 });
      assert.equal(status, 400);
      assert.match(json.error, /title は文字列/);
    });

    it('title が null だと 400 になること（旧実装は null.trim() で 500）', async () => {
      const { status, json } = await apiRequest(server, 'PATCH', '/api/tasks/100', { title: null });
      assert.equal(status, 400);
      assert.equal(json.detail, 'null');
    });

    it('title が空白のみだと 400 になること', async () => {
      const { status, json } = await apiRequest(server, 'PATCH', '/api/tasks/100', { title: '  ' });
      assert.equal(status, 400);
      assert.equal(json.error, 'タイトルは1文字以上必要です');
    });

    it('body がオブジェクトだと 400 になること（旧実装は engine に JSON 化して渡していた）', async () => {
      const { status, json } = await apiRequest(server, 'PATCH', '/api/tasks/100', {
        body: { text: 'x' },
      });
      assert.equal(status, 400);
      assert.match(json.error, /body は文字列/);
    });

    it('addLabels が文字列だと 400 になること（旧実装は1文字ずつ展開されたうえ join で 500）', async () => {
      const { status, json } = await apiRequest(server, 'PATCH', '/api/tasks/100', {
        addLabels: 'p1',
      });
      assert.equal(status, 400);
      assert.match(json.error, /addLabels は文字列の配列/);
      assert.equal(json.detail, 'string');
    });

    it('removeLabels が数値だと 400 になること（旧実装はスプレッドで TypeError → 500）', async () => {
      const { status, json } = await apiRequest(server, 'PATCH', '/api/tasks/100', {
        removeLabels: 3,
      });
      assert.equal(status, 400);
      assert.match(json.error, /removeLabels は文字列の配列/);
    });

    it('addLabels の要素が文字列でないと 400 になること（旧実装は normLabel で 500）', async () => {
      const { status, json } = await apiRequest(server, 'PATCH', '/api/tasks/100', {
        addLabels: ['@home', 42],
      });
      assert.equal(status, 400);
      assert.match(json.error, /addLabels の要素は文字列/);
      assert.equal(json.detail, 'addLabels[1]: number');
    });

    it('空文字のラベルは 400 になること（旧実装は engine 側で "LABELS_ENV is not set" → 500）', async () => {
      const { status, json } = await apiRequest(server, 'PATCH', '/api/tasks/100', {
        addLabels: ['  '],
      });
      assert.equal(status, 400);
      assert.match(json.error, /空のラベル名/);
    });

    it('カンマを含むラベルは 400 になること（LABELS_ENV がカンマ区切りのため黙って2つに分割される）', async () => {
      const { status, json } = await apiRequest(server, 'PATCH', '/api/tasks/100', {
        addLabels: ['a,b'],
      });
      assert.equal(status, 400);
      assert.match(json.error, /カンマは使用できません/);
      assert.equal(json.detail, 'addLabels[0]: a,b');
    });

    it('GTD カテゴリラベルの付け外しは 400 で弾かれること（絵文字付きでも）', async () => {
      const { status, json } = await apiRequest(server, 'PATCH', '/api/tasks/100', {
        addLabels: ['🎯 next'],
      });
      assert.equal(status, 400);
      assert.match(json.error, /GTDカテゴリラベル/);
    });

    it('GTD カテゴリラベルの除去も 400 で弾かれること', async () => {
      const { status, json } = await apiRequest(server, 'PATCH', '/api/tasks/100', {
        removeLabels: ['inbox'],
      });
      assert.equal(status, 400);
      assert.match(json.error, /GTDカテゴリラベル/);
    });

    it('更新フィールドが1つもない PATCH は 400 になること（旧実装は何もせず 200 を返していた）', async () => {
      const { status, json } = await apiRequest(server, 'PATCH', '/api/tasks/100', {});
      assert.equal(status, 400);
      assert.equal(json.error, '更新するフィールドがありません');
    });

    it('空配列だけの PATCH も 400 になること', async () => {
      const { status, json } = await apiRequest(server, 'PATCH', '/api/tasks/100', {
        addLabels: [],
        removeLabels: [],
      });
      assert.equal(status, 400);
      assert.equal(json.error, '更新するフィールドがありません');
    });
  });
});

/**
 * ガードが「正当な入力まで弾いていないこと」を確認する。
 * 400 ガードのテストだけだと過剰な拒否に気づけないため、
 * 型検証を通過すべき入力を同じファイル内で対にして押さえておく。
 */
describe('型検証を通過する正当な入力', () => {
  let server;
  let lastDone;
  let lastAdd;
  let lastUpdate;

  before(async () => {
    mockRepository({
      done: async (_tenant, num, options) => {
        lastDone = { num, options };
        return { closedChildren: [], recurCreated: [] };
      },
      add: async (_tenant, input) => {
        lastAdd = input;
        return { number: 1 };
      },
      update: async (_tenant, num, patch) => {
        lastUpdate = { num, patch };
      },
      getDetail: async (_tenant, num) => ({ number: num, title: 't', labels: [], comments: [] }),
    });
    server = await startTestServer();
  });

  after(async () => {
    if (server) await stopTestServer(server);
    restoreRepository();
  });

  it('withChildren: true はそのまま repo.done へ渡ること', async () => {
    const { status } = await apiRequest(server, 'POST', '/api/tasks/10/done', {
      withChildren: true,
    });
    assert.equal(status, 200);
    assert.equal(lastDone.options.withChildren, true);
  });

  it('withChildren: false はそのまま repo.done へ渡ること', async () => {
    const { status } = await apiRequest(server, 'POST', '/api/tasks/10/done', {
      withChildren: false,
    });
    assert.equal(status, 200);
    assert.equal(lastDone.options.withChildren, false);
  });

  it('withChildren 未指定は false になること', async () => {
    const { status } = await apiRequest(server, 'POST', '/api/tasks/10/done', {});
    assert.equal(status, 200);
    assert.equal(lastDone.options.withChildren, false);
  });

  it('Issue 番号の最小値 1 が通ること（境界値）', async () => {
    const { status, json } = await apiRequest(server, 'GET', '/api/tasks/1');
    assert.equal(status, 200);
    assert.equal(json.number, 1);
  });

  it('マルチバイト・絵文字を含むタイトルが通り、全角スペースが trim されること', async () => {
    const { status } = await apiRequest(server, 'POST', '/api/tasks', {
      title: '　日本語タイトル 🎉　',
    });
    assert.equal(status, 201);
    assert.equal(lastAdd.title, '日本語タイトル 🎉', 'U+3000（全角スペース）も trim 対象');
  });

  it('GTD カテゴリ以外の絵文字入りラベルは通ること（過剰拒否していないこと）', async () => {
    const { status } = await apiRequest(server, 'PATCH', '/api/tasks/20', {
      addLabels: ['@🏠 自宅', 'p1'],
    });
    assert.equal(status, 200);
    assert.deepEqual(lastUpdate.patch.addLabels, ['@🏠 自宅', 'p1']);
  });

  it('全角スペースのみのラベルは 400 で弾かれること（trim の境界）', async () => {
    const { status, json } = await apiRequest(server, 'PATCH', '/api/tasks/20', {
      addLabels: ['　'],
    });
    assert.equal(status, 400);
    assert.match(json.error, /空のラベル名/);
  });

  // ── due/priority/ctx（Issue #1656）: リグレッション・正常受け渡しの確認 ──

  it('due/priority/ctx すべて未指定でも 201 になること（既存動作のリグレッション確認）', async () => {
    const { status } = await apiRequest(server, 'POST', '/api/tasks', { title: 'no details' });
    assert.equal(status, 201);
    assert.equal(lastAdd.due, undefined);
    assert.equal(lastAdd.priority, undefined);
    assert.equal(lastAdd.ctx, undefined);
  });

  it('due/priority/ctx すべて指定すると 201 になり、repo.add に正しい形で渡ること', async () => {
    const { status } = await apiRequest(server, 'POST', '/api/tasks', {
      title: 'with details',
      due: '2026-08-10',
      priority: 'p2',
      ctx: ['@home', '@errand'],
    });
    assert.equal(status, 201);
    assert.equal(lastAdd.due, '2026-08-10');
    assert.equal(lastAdd.priority, 'p2');
    assert.deepEqual(lastAdd.ctx, ['@home', '@errand']);
  });
});
