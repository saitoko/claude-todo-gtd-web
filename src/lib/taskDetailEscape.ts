/**
 * TaskDetailModal の Escape キー押下時の挙動を決定する純粋関数。
 *
 * 背景（000-partner #1651）: TaskDetailModal に移動ボタン（MoveDialog 呼び出し）を
 * 追加すると、MoveDialog 表示中は window に2つの keydown リスナー
 * （TaskDetailModal 自身のものと MoveDialog のもの）が同時に存在する状態になる。
 * TaskDetailModal 側の Escape ハンドラが editMode しか見ていないと、
 * showMoveDialog === true のときに Escape を押した際「MoveDialog を閉じる」と
 * 「TaskDetailModal ごと閉じる」が同時に走ってしまう。これを避けるため、
 * editMode / showMoveDialog の状態から取るべきアクションを一意に決定する。
 */

export type TaskDetailEscapeAction = 'cancelEdit' | 'closeMoveDialog' | 'close';

export interface TaskDetailEscapeState {
  editMode: boolean;
  showMoveDialog: boolean;
}

/**
 * 優先順位:
 *   1. editMode === true       → 'cancelEdit'
 *   2. showMoveDialog === true → 'closeMoveDialog'
 *   3. 上記いずれでもない       → 'close'
 *
 * 備考: editMode と showMoveDialog が同時に true になることは通常の UI 操作では
 * 起こり得ない（移動ボタン自体が !editMode のときしか表示されないため）。
 * 防御的に editMode を優先する。
 */
export function resolveTaskDetailEscapeAction(
  state: TaskDetailEscapeState
): TaskDetailEscapeAction {
  if (state.editMode) return 'cancelEdit';
  if (state.showMoveDialog) return 'closeMoveDialog';
  return 'close';
}
