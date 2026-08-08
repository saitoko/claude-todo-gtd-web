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

module.exports = {
  ISSUE_NUMBER_PATTERN,
  typeName,
  parseIssueNumber,
  validateString,
  validateOptionalBoolean,
  validateLabelArray,
};
