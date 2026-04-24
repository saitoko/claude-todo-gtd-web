'use strict';

// GTD ラベル定数（todo-engine.js の GTD_DISPLAY と同期すること）
// 注意: todo-engine.js 側でラベル変更があった場合はここも手動で更新する（U2: 二重管理リスク）

// GTD ラベルの正規化キー一覧（project は別扱い）
const GTD_LABELS = ['next', 'routine', 'inbox', 'waiting', 'someday', 'reference'];

// project ラベル（move 禁止）
const PROJECT_LABEL = 'project';

// 表示名マップ（絵文字付きラベル文字列）
// 注意: todo-engine.js の GTD_DISPLAY と一致させること
// 警告: このオブジェクトはサーバー側（ラベル付与・フィルタ）用。
//       フロント側の GTD_DISPLAY（src/lib/api.ts）は UI 表示専用で別物。
const GTD_DISPLAY = {
  next:      '✅ next',
  routine:   '🔁 routine',
  inbox:     '📥 inbox',
  waiting:   '⏳ waiting',
  someday:   '🌈 someday',
  project:   '📁 project',
  reference: '📎 reference',
};

// UI 表示用の日本語名
const GTD_DISPLAY_JA = {
  inbox:     '📥 Inbox',
  next:      '🎯 Next',
  waiting:   '⏳ Waiting',
  someday:   '🌈 Someday',
  routine:   '🔁 Routine',
  project:   '📁 Project',
  reference: '📎 Reference',
};

// ラベル名（絵文字あり）を正規化キーに変換する
// 例: '🎯 next' → 'next'、'📥 inbox' → 'inbox'
function normLabel(name) {
  return name.replace(/^\p{Emoji_Presentation}\s*/u, '').toLowerCase().trim();
}

// Issue のラベル配列から GTD カテゴリキーを特定する
// labels: [{ name: string }] or string[]
function getGtdCategory(labels) {
  const names = labels.map(l => (typeof l === 'string' ? l : l.name));
  for (const name of names) {
    const norm = normLabel(name);
    if (GTD_LABELS.includes(norm)) return norm;
    if (norm === PROJECT_LABEL) return PROJECT_LABEL;
  }
  return null; // ラベルなし → null（UIに表示しない。ラベル漏れは CLI で気づける）
}

module.exports = {
  GTD_LABELS,
  PROJECT_LABEL,
  GTD_DISPLAY,
  GTD_DISPLAY_JA,
  normLabel,
  getGtdCategory,
};
