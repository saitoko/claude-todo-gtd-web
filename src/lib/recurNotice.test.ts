'use strict';

/**
 * formatRecurNotice のユニットテスト（Issue #1672）
 *
 * done() のレスポンスに含まれる recurCreated から、Web UI に表示する
 * 通知メッセージ文字列を組み立てるロジックを検証する。
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatRecurNotice } from './recurNotice.ts';

describe('formatRecurNotice', () => {
  it('正常系: recurCreated が1件 → 「次周期のタスク #N を作成しました」を返す', () => {
    const message = formatRecurNotice([{ number: 1670, newIssueNumber: 1671 }]);
    assert.equal(message, '次周期のタスク #1671 を作成しました');
  });

  it('正常系: recurCreated が空配列 → null を返す（通知不要）', () => {
    const message = formatRecurNotice([]);
    assert.equal(message, null);
  });

  it('正常系: recurCreated が undefined → null を返す（通知不要）', () => {
    const message = formatRecurNotice(undefined);
    assert.equal(message, null);
  });

  it('正常系: recurCreated が null → null を返す（通知不要）', () => {
    const message = formatRecurNotice(null);
    assert.equal(message, null);
  });

  it('境界値: recurCreated が複数件（withChildren で複数の子がrecur再作成） → 全件のIssue番号を含むメッセージを返す', () => {
    const message = formatRecurNotice([
      { number: 201, newIssueNumber: 301 },
      { number: 205, newIssueNumber: 305 },
    ]);
    assert.equal(message, '次周期のタスク #301, #305 を作成しました');
  });

  it('境界値: withChildren で一部の子だけrecurCreated → recurCreatedに含まれる分だけが通知に反映される', () => {
    // #201 のみ recur、#202 は recur なしのケース（repo.done() は recur ありの分だけ recurCreated に積む）
    const message = formatRecurNotice([{ number: 201, newIssueNumber: 301 }]);
    assert.equal(message, '次周期のタスク #301 を作成しました');
  });

  it('異常系: newIssueNumber が欠落したエントリが混在 → 欠落分は無視して有効なエントリのみ通知する', () => {
    const message = formatRecurNotice([
      { number: 201, newIssueNumber: 301 },
      // @ts-expect-error 実データでは起きない想定だが防御的にテストする
      { number: 202, newIssueNumber: null },
    ]);
    assert.equal(message, '次周期のタスク #301 を作成しました');
  });

  it('異常系: 全エントリの newIssueNumber が無効（0） → null を返す（通知を誤発火させない）', () => {
    const message = formatRecurNotice([{ number: 201, newIssueNumber: 0 }]);
    assert.equal(message, null);
  });
});
