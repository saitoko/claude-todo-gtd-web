/**
 * taskBody.ts ユニットテスト
 * 実行: node --experimental-strip-types --test src/lib/taskBody.test.ts
 *
 * 背景: EditForm.tsx の本文編集は stripControlLines() で制御行を編集用テキストから
 * 隠し、buildFinalBody() で保存時に制御行を再構築する。engine（~/.claude/todo-engine.js
 * parseBodyObj/buildBody）は due/activate/before/depends_on/recur/project/estimate/actual/
 * reviewed_at の9種の制御行を扱うため、これらが編集フォーム経由の保存で欠落しないことを保証する。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stripControlLines, buildFinalBody } from './taskBody.ts';

// ─── テストデータファクトリ ──────────────────────────────────────────────────

const FULL_BODY = [
  'due: 2026-08-10',
  'activate: 2026-08-05',
  'before: 2026-08-15',
  'depends_on: #123',
  'recur: weekly',
  'project: #456',
  'estimate: 30m',
  'actual: 1h',
  'reviewed_at: 2026-08-01',
  '',
  '本文の説明文です。',
  '2行目もあります。',
].join('\n');

// ─── stripControlLines ───────────────────────────────────────────────────────

describe('stripControlLines', () => {
  it('正常系: 9種類の制御行すべてが表示用テキストから除去され、descのみ残る', () => {
    const result = stripControlLines(FULL_BODY);
    assert.equal(result, '本文の説明文です。\n2行目もあります。');
  });

  it('正常系: 制御行が一部（recurのみ）でも正しく除去される', () => {
    const body = ['recur: daily', '', '説明'].join('\n');
    assert.equal(stripControlLines(body), '説明');
  });

  it('正常系: 制御行が一部（estimateとactivateのみ）でも正しく除去される', () => {
    const body = ['activate: 2026-08-05', 'estimate: 15m', '', '説明'].join('\n');
    assert.equal(stripControlLines(body), '説明');
  });

  it('境界値: 制御行が1つもない（descのみの）bodyはそのまま返る', () => {
    const body = '純粋な説明文のみ。\n改行あり。';
    assert.equal(stripControlLines(body), body);
  });

  it('境界値: descが空でrecur等の制御行のみのbodyは空文字を返す', () => {
    const body = ['due: 2026-08-10', 'recur: monthly'].join('\n');
    assert.equal(stripControlLines(body), '');
  });

  it('境界値: 空文字列の入力は空文字列を返す', () => {
    assert.equal(stripControlLines(''), '');
  });

  it('セキュリティ/異常系: 制御行の値にコロンやマルチバイト文字を含んでも該当行として除去される', () => {
    const body = [
      'due: 2026-08-10',
      'project: #789',
      '',
      '説明: 時刻は10:30、担当は佐藤さんです。絵文字😀も含む。',
    ].join('\n');
    // 制御行（due:, project:）は除去されるが、desc内の「説明: 」はプレフィックス一致しないため残る
    assert.equal(
      stripControlLines(body),
      '説明: 時刻は10:30、担当は佐藤さんです。絵文字😀も含む。'
    );
  });

  it('大文字小文字非対称性の回帰: 大文字始まりの行（"Recur:"）はengineの制御行ではないため除去されず説明文として残る', () => {
    // engine（~/.claude/todo-engine.js parseBodyObj）は小文字プレフィックスのみを
    // 制御行として解釈する。stripControlLines がここで大文字始まりの行まで除去すると
    // extractControlLine（大文字小文字を区別）で拾えず buildFinalBody で復元されず消失する。
    const body = ['Recur: weekly', '', '説明文'].join('\n');
    assert.equal(stripControlLines(body), 'Recur: weekly\n\n説明文');
  });

  it('回帰: 小文字の制御行（recur:）は引き続き表示用テキストから除去される', () => {
    const body = ['recur: weekly', '', '説明文'].join('\n');
    assert.equal(stripControlLines(body), '説明文');
  });
});

// ─── buildFinalBody ──────────────────────────────────────────────────────────

describe('buildFinalBody', () => {
  it('正常系: 9種類すべて揃ったbodyでdesc部分のみ変更 → 全制御行が元の値のまま保持される', () => {
    const displayBody = stripControlLines(FULL_BODY);
    const editedDisplayBody = displayBody.replace('本文の説明文です。', '本文の説明文（修正）です。');
    const result = buildFinalBody(editedDisplayBody, FULL_BODY, '2026-08-10');

    assert.match(result, /^due: 2026-08-10$/m);
    assert.match(result, /^activate: 2026-08-05$/m);
    assert.match(result, /^before: 2026-08-15$/m);
    assert.match(result, /^depends_on: #123$/m);
    assert.match(result, /^recur: weekly$/m);
    assert.match(result, /^project: #456$/m);
    assert.match(result, /^estimate: 30m$/m);
    assert.match(result, /^actual: 1h$/m);
    assert.match(result, /^reviewed_at: 2026-08-01$/m);
    assert.ok(result.includes('本文の説明文（修正）です。'));
    assert.ok(result.includes('2行目もあります。'));
  });

  it('正常系: 制御行が一部（recurのみ）だけ存在するケースでも欠落しない', () => {
    const rawBody = ['recur: daily', '', '説明文'].join('\n');
    const displayBody = stripControlLines(rawBody);
    const result = buildFinalBody(displayBody, rawBody, '');
    assert.match(result, /^recur: daily$/m);
    assert.ok(result.includes('説明文'));
  });

  it('正常系: 制御行がestimateとactivateのみのケースでも欠落しない', () => {
    const rawBody = ['activate: 2026-08-05', 'estimate: 15m', '', '説明文'].join('\n');
    const displayBody = stripControlLines(rawBody);
    const result = buildFinalBody(displayBody, rawBody, '');
    assert.match(result, /^activate: 2026-08-05$/m);
    assert.match(result, /^estimate: 15m$/m);
    assert.equal(/^recur:/m.test(result), false);
    assert.ok(result.includes('説明文'));
  });

  it('境界値: 制御行が1つもない（descのみの）bodyは説明文のみ再構築される', () => {
    const rawBody = '純粋な説明文のみ。';
    const displayBody = stripControlLines(rawBody);
    const result = buildFinalBody(displayBody, rawBody, '');
    assert.equal(result, '純粋な説明文のみ。');
  });

  it('境界値: descが空でrecur等の制御行のみのbodyでは制御行のみが再構築される', () => {
    const rawBody = ['recur: weekly', 'project: #999'].join('\n');
    const displayBody = stripControlLines(rawBody);
    const result = buildFinalBody(displayBody, rawBody, '');
    assert.equal(result, 'recur: weekly\nproject: #999');
  });

  it('境界値: dueをUIで変更した場合、他の制御行（recur等）は影響を受けずそのまま保持される', () => {
    const rawBody = ['due: 2026-08-10', 'recur: weekly', 'estimate: 1h', '', '説明'].join('\n');
    const displayBody = stripControlLines(rawBody);
    const result = buildFinalBody(displayBody, rawBody, '2026-09-01'); // dueを変更
    assert.match(result, /^due: 2026-09-01$/m);
    assert.match(result, /^recur: weekly$/m);
    assert.match(result, /^estimate: 1h$/m);
  });

  it('境界値: dueをクリア（空文字）した場合、due行は再構築されず他の制御行のみ残る', () => {
    const rawBody = ['due: 2026-08-10', 'recur: weekly', '', '説明'].join('\n');
    const displayBody = stripControlLines(rawBody);
    const result = buildFinalBody(displayBody, rawBody, ''); // dueをクリア
    assert.equal(/^due:/m.test(result), false);
    assert.match(result, /^recur: weekly$/m);
  });

  it('大文字小文字非対称性の回帰: 大文字始まりの行（"Recur:"）はstripControlLinesで残るため、編集を経てもbuildFinalBody後に消失しない', () => {
    // 修正前は stripControlLines が 'i' フラグで "Recur: weekly" も除去する一方、
    // extractControlLine は大文字小文字を区別するため拾えず、buildFinalBody の
    // 出力から "Recur: weekly" が消失していた（データ損失バグ）。
    const rawBody = ['Recur: weekly', '', '説明文'].join('\n');
    const displayBody = stripControlLines(rawBody);
    const result = buildFinalBody(displayBody, rawBody, '');
    assert.ok(result.includes('Recur: weekly'));
    assert.ok(result.includes('説明文'));
  });

  it('セキュリティ/異常系: descにコロンやマルチバイト文字を含んでも制御行と誤認せず保持される', () => {
    const rawBody = [
      'recur: monthly',
      '',
      '説明: 時刻は10:30、担当は佐藤さんです。絵文字😀も含む。',
    ].join('\n');
    const displayBody = stripControlLines(rawBody);
    const result = buildFinalBody(displayBody, rawBody, '');
    assert.match(result, /^recur: monthly$/m);
    assert.ok(result.includes('説明: 時刻は10:30、担当は佐藤さんです。絵文字😀も含む。'));
  });
});
