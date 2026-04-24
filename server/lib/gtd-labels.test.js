'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getGtdCategory } = require('./gtd-labels');

// ─── getGtdCategory テスト ───

describe('getGtdCategory', () => {

  it('オブジェクト配列: inbox ラベルを認識する', () => {
    assert.equal(getGtdCategory([{ name: '📥 inbox' }]), 'inbox');
  });

  it('オブジェクト配列: next ラベルを認識する', () => {
    // B-1 で問題になった next ラベル。engine 側は '🎯 next'、web 側は '✅ next' の差異がある。
    // normLabel は絵文字を除去するため、どちらの絵文字でも 'next' として正規化される。
    assert.equal(getGtdCategory([{ name: '🎯 next' }]), 'next');
    assert.equal(getGtdCategory([{ name: '✅ next' }]), 'next');
  });

  it('オブジェクト配列: project ラベルを認識する', () => {
    assert.equal(getGtdCategory([{ name: '📁 project' }]), 'project');
  });

  it('オブジェクト配列: GTD ラベルなし → null を返す（B-3 再発防止）', () => {
    // B-3: 未分類タスクが inbox に誤分類された根本原因。
    // 'todo' や '仕事' は GTD_LABELS に含まれないため null になる。
    assert.equal(getGtdCategory([{ name: 'todo' }, { name: '仕事' }]), null);
  });

  it('空配列 → null を返す', () => {
    assert.equal(getGtdCategory([]), null);
  });

  it('オブジェクト配列: inbox と next が両方ある → 最初にヒットした方を返す', () => {
    // 実装は順序依存（先頭一致）のため、その挙動を仕様として固定する
    const result = getGtdCategory([{ name: '📥 inbox' }, { name: '🎯 next' }]);
    assert.equal(result, 'inbox');
  });

  it('文字列配列: inbox ラベルを認識する', () => {
    // labels が string[] の場合も動作すること
    assert.equal(getGtdCategory(['📥 inbox']), 'inbox');
  });

  it('文字列配列: GTD ラベルなし → null を返す', () => {
    assert.equal(getGtdCategory(['bug', 'enhancement']), null);
  });

  it('GTD 全ラベルをそれぞれ認識する', () => {
    const cases = [
      ['🔁 routine',   'routine'],
      ['⏳ waiting',   'waiting'],
      ['🌈 someday',   'someday'],
      ['📎 reference', 'reference'],
    ];
    for (const [label, expected] of cases) {
      assert.equal(
        getGtdCategory([{ name: label }]),
        expected,
        `label "${label}" は "${expected}" を返すべき`
      );
    }
  });

});
