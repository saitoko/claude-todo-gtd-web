'use strict';

/**
 * createToastController（useToast の中核ロジック）のユニットテスト（Issue #1656）
 *
 * 本リポジトリに React Testing Library 等のコンポーネントテスト基盤（renderHook相当）が
 * 無いため、`useToast()` フックのタイマー管理・最大表示件数制御ロジックを
 * 非フックの `createToastController()` として切り出し、直接インスタンス化して
 * テストする（useToast.ts のコメント参照）。`useToast()` フック自体は
 * このコントローラーを useRef で保持するだけの薄いアダプターのため、
 * コントローラーのテストがフックの実質的な単体テストになる。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToastController, MAX_VISIBLE_TOASTS } from './useToast.ts';

test('正常系: pushToast で toasts 配列にアイテムが追加される', () => {
  const controller = createToastController();
  assert.deepEqual(controller.getToasts(), []);

  const id = controller.pushToast({ message: '#1 を完了しました', durationMs: 6000 });

  const toasts = controller.getToasts();
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].id, id);
  assert.equal(toasts[0].message, '#1 を完了しました');
});

test('正常系: durationMs 経過後、自動的に toasts から除去される', (t: any) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const controller = createToastController();

  controller.pushToast({ message: 'テスト', durationMs: 6000 });
  assert.equal(controller.getToasts().length, 1);

  t.mock.timers.tick(5999);
  assert.equal(controller.getToasts().length, 1, 'durationMs未満では消えない');

  t.mock.timers.tick(1);
  assert.equal(controller.getToasts().length, 0, 'durationMs経過で自動的に消える');
});

test('正常系: dismissToast(id) で即座に除去され、タイマーもクリアされる（クリア後にタイマー経過してもエラーにならない）', (t: any) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const controller = createToastController();

  const id = controller.pushToast({ message: 'テスト', durationMs: 6000 });
  assert.equal(controller.getToasts().length, 1);

  controller.dismissToast(id);
  assert.equal(controller.getToasts().length, 0, 'dismissToastで即座に除去される');

  // タイマーがクリアされていれば、期限が来ても何も起きない（エラーも二重除去エラーも起きない）
  assert.doesNotThrow(() => t.mock.timers.tick(6000));
  assert.equal(controller.getToasts().length, 0);
});

test('境界値: MAX_VISIBLE_TOASTS を超えて pushToast した場合、最も古いものが即座に破棄され、常に3件以下に保たれる', (t: any) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const controller = createToastController();
  assert.equal(MAX_VISIBLE_TOASTS, 3);

  const id1 = controller.pushToast({ message: '#1', durationMs: 6000 });
  const id2 = controller.pushToast({ message: '#2', durationMs: 6000 });
  const id3 = controller.pushToast({ message: '#3', durationMs: 6000 });
  assert.deepEqual(controller.getToasts().map((t2) => t2.id), [id1, id2, id3]);

  const id4 = controller.pushToast({ message: '#4', durationMs: 6000 });

  const toasts = controller.getToasts();
  assert.equal(toasts.length, 3, '常に3件以下に保たれる');
  assert.deepEqual(
    toasts.map((t2) => t2.id),
    [id2, id3, id4],
    '最も古い#1が破棄され、#2〜#4が残る'
  );

  // 破棄された#1のタイマーはクリアされているはず（tickしても例外なく、残り3件はそのまま）
  assert.doesNotThrow(() => t.mock.timers.tick(6000));
  assert.equal(controller.getToasts().length, 0, '残り3件も時間経過で消える（#1のタイマークリアが影響しないこと）');
});
