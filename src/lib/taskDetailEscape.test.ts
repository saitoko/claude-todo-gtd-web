/**
 * taskDetailEscape.ts ユニットテスト
 * 実行: node --experimental-strip-types --test src/lib/taskDetailEscape.test.ts
 *
 * 背景（000-partner #1651）: TaskDetailModal に移動ボタン（MoveDialog）を追加すると
 * Escape キーの2つのリスナー（TaskDetailModal 自身と MoveDialog）が競合しうる。
 * resolveTaskDetailEscapeAction はこの優先順位を一意に決定する純粋関数。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTaskDetailEscapeAction } from './taskDetailEscape.ts';

describe('resolveTaskDetailEscapeAction', () => {
  // ─── 正常系 ───────────────────────────────────────────────────────────────

  it('正常系: editMode/showMoveDialog どちらも false のとき close を返す', () => {
    const action = resolveTaskDetailEscapeAction({ editMode: false, showMoveDialog: false });
    assert.equal(action, 'close');
  });

  it('正常系: editMode が true のとき cancelEdit を返す', () => {
    const action = resolveTaskDetailEscapeAction({ editMode: true, showMoveDialog: false });
    assert.equal(action, 'cancelEdit');
  });

  it('正常系: showMoveDialog が true のとき closeMoveDialog を返す', () => {
    const action = resolveTaskDetailEscapeAction({ editMode: false, showMoveDialog: true });
    assert.equal(action, 'closeMoveDialog');
  });

  // ─── 境界値・防御的仕様の確認 ──────────────────────────────────────────────

  it('境界値: editMode と showMoveDialog が同時に true（通常のUI操作では到達しない想定）のとき、editMode を優先して cancelEdit を返す', () => {
    const action = resolveTaskDetailEscapeAction({ editMode: true, showMoveDialog: true });
    assert.equal(action, 'cancelEdit');
  });
});
