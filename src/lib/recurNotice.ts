// recur（繰り返し）再作成の通知メッセージ生成（Issue #1672）
//
// 背景: #1669 でバックエンドの done() が recurCreated（次周期に再作成された
// Issue の対応表）を返すようになったが、Web UI には通知の仕組みがなかった。
// フルのトースト基盤整備は #1656 の担当範囲のため、本モジュールは
// 「recurCreated からメッセージ文字列を組み立てる」ロジックのみを切り出し、
// 既存の error state 表示パターン（List.tsx）に載せられる形にする。

import type { RecurCreated } from './api';

/**
 * recurCreated から通知メッセージを組み立てる
 * @param recurCreated - done() レスポンスの recurCreated（未定義・空配列を許容）
 * @returns 表示すべきメッセージ。再作成が無ければ null（＝通知不要）
 */
export function formatRecurNotice(recurCreated: RecurCreated[] | undefined | null): string | null {
  if (!recurCreated || recurCreated.length === 0) return null;

  const newNumbers = recurCreated
    .map((entry) => entry && entry.newIssueNumber)
    .filter((n): n is number => typeof n === 'number' && n > 0);

  if (newNumbers.length === 0) return null;

  if (newNumbers.length === 1) {
    return `次周期のタスク #${newNumbers[0]} を作成しました`;
  }

  return `次周期のタスク ${newNumbers.map((n) => `#${n}`).join(', ')} を作成しました`;
}
