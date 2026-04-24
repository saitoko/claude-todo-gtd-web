'use strict';

/**
 * T-1: engine-sync テスト
 *
 * ~/.claude/todo-engine.js の GTD_DISPLAY と
 * server/lib/gtd-labels.js の GTD_DISPLAY が一致していることを検証する。
 *
 * 実装方針A: engine ソースを読み込んで正規表現で GTD_DISPLAY = {...} を抽出し、
 * JSON.parse 可能な形に変換して比較する。
 * engine を require すると即実行されてしまう問題を回避するための方式。
 *
 * 注意: todo-engine.js 側の GTD_DISPLAY を変更した場合は gtd-labels.js も更新すること。
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { GTD_DISPLAY: WEB_GTD_DISPLAY } = require('./gtd-labels');

// engine ソースから GTD_DISPLAY を抽出する
function extractEngineGtdDisplay(engineSource) {
  // `const GTD_DISPLAY = { ... };` の波括弧内を抽出する
  // engine では1行にまとめて書かれているため単純なマッチで取れる
  const match = engineSource.match(/const GTD_DISPLAY\s*=\s*(\{[\s\S]*?\});/);
  if (!match) {
    throw new Error('todo-engine.js から GTD_DISPLAY を抽出できませんでした');
  }

  // JavaScriptオブジェクトリテラルを JSON に変換してパースする
  // キーが引用符なしの場合に対応: `next: '🎯 next'` → `"next": "🎯 next"`
  const objLiteral = match[1]
    // シングルクォート → ダブルクォート（値）
    .replace(/'([^']*)'/g, '"$1"')
    // 引用符なしキー → ダブルクォートキー（例: next: → "next":）
    .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')
    // 末尾カンマの除去（JSON 非対応）
    .replace(/,(\s*[}\]])/g, '$1');

  try {
    return JSON.parse(objLiteral);
  } catch (e) {
    throw new Error(
      `GTD_DISPLAY の JSON.parse に失敗しました。engine フォーマットが変わった可能性があります。\n` +
      `変換後の文字列: ${objLiteral}\n` +
      `エラー: ${e.message}`
    );
  }
}

describe('T-1: engine GTD_DISPLAY と web GTD_DISPLAY の同期確認', () => {

  const enginePath = path.join(
    process.env.HOME || os.homedir(),
    '.claude',
    'todo-engine.js'
  );

  it('todo-engine.js が存在すること', () => {
    assert.ok(
      fs.existsSync(enginePath),
      `todo-engine.js が見つかりません: ${enginePath}`
    );
  });

  it('engine の GTD_DISPLAY を抽出できること', () => {
    const source = fs.readFileSync(enginePath, 'utf-8');
    // 例外が出なければ抽出成功
    const engineDisplay = extractEngineGtdDisplay(source);
    assert.ok(
      typeof engineDisplay === 'object' && engineDisplay !== null,
      'GTD_DISPLAY がオブジェクトとして抽出されること'
    );
  });

  it('engine と web の GTD_DISPLAY キーセットが一致すること', () => {
    const source = fs.readFileSync(enginePath, 'utf-8');
    const engineDisplay = extractEngineGtdDisplay(source);

    const engineKeys = Object.keys(engineDisplay).sort();
    const webKeys = Object.keys(WEB_GTD_DISPLAY).sort();

    assert.deepEqual(
      webKeys,
      engineKeys,
      `キーセットが異なります。\n` +
      `  engine: [${engineKeys.join(', ')}]\n` +
      `  web:    [${webKeys.join(', ')}]`
    );
  });

  it('engine と web の GTD_DISPLAY の各値が normLabel 後に一致すること', () => {
    // normLabel: 絵文字プレフィックスを除去して小文字化した値で比較する。
    // これにより「絵文字が違う（B-1）」と「キーワード自体が違う」を区別して検出できる。
    // 現状: engine は '🎯 next'、web は '✅ next' と絵文字が異なるが、
    // normLabel 後はどちらも 'next' になるため「値のキーワード部分」は一致している。
    // このテストは「絵文字を除いたキーワードの不一致」を検出する。
    const source = fs.readFileSync(enginePath, 'utf-8');
    const engineDisplay = extractEngineGtdDisplay(source);

    function normLabel(str) {
      return str.replace(/^\p{Emoji_Presentation}\s*/u, '').toLowerCase().trim();
    }

    const mismatches = [];
    for (const key of Object.keys(engineDisplay)) {
      const engineNorm = normLabel(engineDisplay[key]);
      const webNorm = WEB_GTD_DISPLAY[key] ? normLabel(WEB_GTD_DISPLAY[key]) : undefined;
      if (engineNorm !== webNorm) {
        mismatches.push(
          `  key="${key}": engine="${engineDisplay[key]}" (norm="${engineNorm}") ` +
          `vs web="${WEB_GTD_DISPLAY[key]}" (norm="${webNorm}")`
        );
      }
    }

    assert.equal(
      mismatches.length,
      0,
      `GTD_DISPLAY の値（絵文字除去後）が不一致です:\n${mismatches.join('\n')}\n\n` +
      `修正方法: server/lib/gtd-labels.js の GTD_DISPLAY を todo-engine.js に合わせて更新してください。`
    );
  });

  it('engine と web の GTD_DISPLAY の絵文字プレフィックスも一致すること（B-1 直接検証）', () => {
    // 上のテストは normLabel 後の比較。このテストは完全一致（絵文字含む）を要求する。
    // 現状の B-1 不一致（next の絵文字違い）はここで検出される。
    const source = fs.readFileSync(enginePath, 'utf-8');
    const engineDisplay = extractEngineGtdDisplay(source);

    const mismatches = [];
    for (const key of Object.keys(engineDisplay)) {
      if (engineDisplay[key] !== WEB_GTD_DISPLAY[key]) {
        mismatches.push(
          `  key="${key}": engine="${engineDisplay[key]}" vs web="${WEB_GTD_DISPLAY[key]}"`
        );
      }
    }

    assert.equal(
      mismatches.length,
      0,
      `GTD_DISPLAY の値（絵文字含む完全一致）が不一致です:\n${mismatches.join('\n')}\n\n` +
      `修正方法: server/lib/gtd-labels.js の GTD_DISPLAY を todo-engine.js に合わせて更新してください。\n` +
      `  例: next: '🎯 next'  （todo-engine.js の値）`
    );
  });

});
