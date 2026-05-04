'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getGtdCategory, GTD_DISPLAY_JA, GTD_LABELS, PROJECT_LABEL } = require('./gtd-labels');

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

// ─── /api/gtd-labels レスポンス構造テスト ───

describe('/api/gtd-labels レスポンス構造', () => {

  it('GTD_DISPLAY_JA に 7 カテゴリすべてが含まれる', () => {
    const expectedKeys = ['inbox', 'next', 'waiting', 'someday', 'routine', 'project', 'reference'];
    for (const key of expectedKeys) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(GTD_DISPLAY_JA, key),
        `GTD_DISPLAY_JA に "${key}" が存在しない`
      );
    }
    assert.equal(Object.keys(GTD_DISPLAY_JA).length, 7, 'GTD_DISPLAY_JA は 7 エントリのみを持つべき');
  });

  it('各値が「{絵文字} {テキスト}」形式である', () => {
    // 絵文字は Unicode Emoji_Presentation プロパティを持つ文字
    const emojiPattern = /^\p{Emoji_Presentation}\s+\S/u;
    for (const [key, value] of Object.entries(GTD_DISPLAY_JA)) {
      assert.match(
        value,
        emojiPattern,
        `GTD_DISPLAY_JA["${key}"] = "${value}" は "{絵文字} {テキスト}" 形式でない`
      );
    }
  });

  it('GTD_LABELS は project を除く 6 カテゴリを含む', () => {
    const expected = ['next', 'routine', 'inbox', 'waiting', 'someday', 'reference'];
    assert.equal(GTD_LABELS.length, expected.length, 'GTD_LABELS は 6 件のはず');
    for (const key of expected) {
      assert.ok(GTD_LABELS.includes(key), `GTD_LABELS に "${key}" が含まれない`);
    }
    assert.ok(!GTD_LABELS.includes('project'), 'GTD_LABELS に "project" は含まれないはず');
  });

  it('PROJECT_LABEL は "project" である', () => {
    assert.equal(PROJECT_LABEL, 'project');
  });

  it('/api/gtd-labels のレスポンス形状が期待するスキーマを満たす（モック検証）', () => {
    // 実際の HTTP リクエストではなく、エンドポイントが返す値の構造を直接検証する
    const mockResponse = {
      labels: GTD_DISPLAY_JA,
      keys: GTD_LABELS,
      projectKey: PROJECT_LABEL,
    };
    assert.ok(typeof mockResponse.labels === 'object', 'labels はオブジェクトであるべき');
    assert.ok(Array.isArray(mockResponse.keys), 'keys は配列であるべき');
    assert.ok(typeof mockResponse.projectKey === 'string', 'projectKey は文字列であるべき');
    assert.equal(mockResponse.projectKey, 'project');
    assert.equal(mockResponse.labels['inbox'], '📥 Inbox');
    assert.equal(mockResponse.labels['next'], '🎯 Next');
  });

});
