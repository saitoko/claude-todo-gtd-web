'use strict';

/**
 * routes 層の入力型検証ヘルパー（Issue #1658）
 *
 * 背景: 各ルートは値の「有無」だけを見て「型」を見ていなかったため、
 * 型の違う入力（`title: 123` / `addLabels: 'p1'` / `body: {}` 等）が
 * repo 層・engine 層まで到達して TypeError になり、クライアントの
 * 入力ミスがサーバー障害を意味する 500 として返っていた。
 * ここで型を検査し、クライアント起因の不正入力は 400 で返す。
 *
 * 各バリデータは成功時 `{ ok: true, value }`、失敗時 `{ ok: false, body }` を返す。
 * `body` はそのまま `res.status(400).json(body)` に渡せる形にしてある。
 *
 * スコープ外（意図的に検査していないもの）:
 * サイズ上限（ラベル配列の要素数・title/body の文字列長）は検査しない。
 * ラベルは `LABELS_ENV`、title/body は `ISSUE_INPUT_ENV` として子プロセスの
 * 環境変数に渡されるため、極端に巨大な入力は spawn 失敗 → 500 になりうるが、
 * これは「型の不一致による 500」とは別種の論点（サイズ上限の設計判断）であり
 * 本モジュールでは扱わない。対応する場合は別 Issue で上限値を決めること。
 */

// Issue 番号として許可する形式（先頭ゼロ・小数・指数表記・末尾ゴミを弾く）
const ISSUE_NUMBER_PATTERN = /^[1-9][0-9]*$/;

/**
 * 値の型名を人間可読な文字列で返す（400 レスポンスの detail 用）
 * @param {unknown} value
 * @returns {string}
 */
function typeName(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function ok(value) {
  return { ok: true, value };
}

function ng(error, detail) {
  return { ok: false, body: detail === undefined ? { error } : { error, detail } };
}

/**
 * URL パラメータの Issue 番号を厳密にパースする
 *
 * 旧実装は `parseInt(raw, 10)` だったため `"12abc"` → 12、`"1.9"` → 1、
 * `"1e3"` → 1 のように、不正な入力が別の Issue 番号として黙って通っていた。
 *
 * @param {unknown} raw - `req.params.number`（express では常に文字列）
 * @returns {{ ok: true, value: number } | { ok: false, body: object }}
 */
function parseIssueNumber(raw) {
  if (typeof raw !== 'string' || !ISSUE_NUMBER_PATTERN.test(raw)) {
    return ng('無効な Issue 番号です', String(raw));
  }
  const num = Number(raw);
  if (!Number.isSafeInteger(num)) {
    return ng('無効な Issue 番号です', String(raw));
  }
  return ok(num);
}

/**
 * 文字列フィールドの型を検証する
 * @param {unknown} value
 * @param {string} fieldName - エラーメッセージに出すフィールド名
 * @returns {{ ok: true, value: string } | { ok: false, body: object }}
 */
function validateString(value, fieldName) {
  if (typeof value !== 'string') {
    return ng(`${fieldName} は文字列で指定してください`, typeName(value));
  }
  return ok(value);
}

/**
 * boolean フィールドの型を検証する（未指定は許容し defaultValue を返す）
 *
 * 旧実装は `!!req.body.withChildren` と truthy 判定していたため、
 * `"false"` のような文字列が true として扱われ、意図しない子タスク
 * 一括クローズが起きうる状態だった。
 *
 * @param {unknown} value
 * @param {string} fieldName
 * @param {boolean} defaultValue - value が undefined/null のときの既定値
 * @returns {{ ok: true, value: boolean } | { ok: false, body: object }}
 */
function validateOptionalBoolean(value, fieldName, defaultValue) {
  if (value === undefined || value === null) return ok(defaultValue);
  if (typeof value !== 'boolean') {
    return ng(`${fieldName} は true / false で指定してください`, typeName(value));
  }
  return ok(value);
}

/**
 * ラベル名配列を検証する
 *
 * engine 側（todo-engine.js の add-labels / remove-labels）は
 * `LABELS_ENV` をカンマ区切りで split するため、カンマを含むラベル名は
 * 2つのラベルとして黙って分割されてしまう。空文字ラベルは engine 側の
 * filter で消えて「ラベル未指定」エラー（500）になる。どちらも
 * クライアント入力の問題なので routes 層で 400 として弾く。
 *
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {{ ok: true, value: string[] } | { ok: false, body: object }}
 */
function validateLabelArray(value, fieldName) {
  if (!Array.isArray(value)) {
    return ng(`${fieldName} は文字列の配列で指定してください`, typeName(value));
  }
  for (let i = 0; i < value.length; i += 1) {
    const label = value[i];
    if (typeof label !== 'string') {
      return ng(`${fieldName} の要素は文字列で指定してください`, `${fieldName}[${i}]: ${typeName(label)}`);
    }
    if (!label.trim()) {
      return ng(`${fieldName} に空のラベル名は指定できません`, `${fieldName}[${i}]`);
    }
    if (label.includes(',')) {
      return ng(
        `${fieldName} のラベル名にカンマは使用できません`,
        `${fieldName}[${i}]: ${label}`
      );
    }
  }
  return ok(value);
}

// due 入力として許可する形式（YYYY-MM-DD のみ。CLI の M/D 短縮形や 'clear' は非対応、#1656）
const DUE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// priority ラベルとして許可する値（事前作成済みのラベルのみを前提とする、#1656）
const VALID_PRIORITIES = new Set(['p1', 'p2', 'p3']);

/**
 * due（期日）フィールドを検証する（Issue #1656: タスク追加時の詳細入力）
 * `<input type="date">` が常に YYYY-MM-DD を出力する前提で、正規表現のみで検証する
 * （カレンダー妥当性は検証しない。2026-13-40 のような形式一致の不正日付は通過する）。
 *
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {{ ok: true, value: string | undefined } | { ok: false, body: object }}
 */
function validateOptionalDue(value, fieldName) {
  if (value === undefined || value === null || value === '') return ok(undefined);
  if (typeof value !== 'string') {
    return ng(`${fieldName} は文字列で指定してください`, typeName(value));
  }
  if (!DUE_DATE_PATTERN.test(value)) {
    return ng(`${fieldName} は YYYY-MM-DD 形式で指定してください`, value);
  }
  return ok(value);
}

/**
 * priority フィールドを検証する（Issue #1656）
 * p1/p2/p3 のみ許可する（ラベルは常に事前作成済みという既存前提を踏襲、ensureLabel 相当は行わない）。
 *
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {{ ok: true, value: string | undefined } | { ok: false, body: object }}
 */
function validateOptionalPriority(value, fieldName) {
  if (value === undefined || value === null || value === '') return ok(undefined);
  if (typeof value !== 'string') {
    return ng(`${fieldName} は文字列で指定してください`, typeName(value));
  }
  if (!VALID_PRIORITIES.has(value)) {
    return ng(`${fieldName} は p1/p2/p3 のいずれかで指定してください`, value);
  }
  return ok(value);
}

/**
 * ctx（コンテキスト、`@` ラベル）配列を検証する（Issue #1656）
 * 要素の型・空文字・カンマ検証は validateLabelArray に委譲し、加えて各要素が
 * `@` で始まることを検証する。既存ラベルのみを選択させる前提のため未存在ラベルの
 * 自動作成（ensureLabel 相当）は行わない。
 *
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {{ ok: true, value: string[] | undefined } | { ok: false, body: object }}
 */
function validateOptionalCtxArray(value, fieldName) {
  if (value === undefined || value === null) return ok(undefined);
  const base = validateLabelArray(value, fieldName);
  if (!base.ok) return base;
  for (let i = 0; i < base.value.length; i += 1) {
    if (!base.value[i].startsWith('@')) {
      return ng(`${fieldName} の要素は @ で始まる必要があります`, `${fieldName}[${i}]: ${base.value[i]}`);
    }
  }
  return base;
}

/**
 * 正の整数（number型）を任意フィールドとして検証する（Issue #1656）
 * undo-done の recurCreatedNumber 用。JSON body由来なので値は既に number 型で届く
 * （URLパラメータの文字列パースとは別枠）。
 *
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {{ ok: true, value: number | undefined } | { ok: false, body: object }}
 */
function validateOptionalPositiveInteger(value, fieldName) {
  if (value === undefined || value === null) return ok(undefined);
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    return ng(`${fieldName} は正の整数で指定してください`, typeName(value));
  }
  return ok(value);
}

module.exports = {
  ISSUE_NUMBER_PATTERN,
  typeName,
  parseIssueNumber,
  validateString,
  validateOptionalBoolean,
  validateLabelArray,
  validateOptionalDue,
  validateOptionalPriority,
  validateOptionalCtxArray,
  validateOptionalPositiveInteger,
};
