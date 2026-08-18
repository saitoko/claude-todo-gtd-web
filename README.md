# claude-todo-gtd-web（アーカイブ）

**このリポジトリは 2026-08-18 に開発を終了しました。後継は [`claude-todo-gtd-pwa`](https://github.com/saitoko/claude-todo-gtd-pwa)（本番: todo.saitoko.net）です。**

新規の機能追加・バグ修正は pwa 側で行ってください。ただし後述のとおり、**pwa がまだ持っていない機能の参照実装がここに残っています**。削除しないでください。

## 何だったか

GitHub Issues を GTD 方式で管理する Web クライアント。CLI スキル `/todo`（`~/.claude/todo-engine.js`）のブラウザ版として 2026-04-24 に開発を開始し、2026-08-09 の commit `5a63d4f` を最後に停止しました（80 commits）。

- 構成: React SPA + Express サーバー（`server/`）
- 起動: `npm run dev`（サーバーと Vite を同時起動）。**ローカル専用でデプロイ設定はありません**
- テスト: `npm test`（`node --test`）

## pwa との関係

pwa は本リポジトリの単純な後継ではなく、**並行して開発された別実装**です。画面構成（`Focus` / `Insight` / `List` / `Search`）はほぼ同じですが、バックエンドが異なります。

| | web（本リポジトリ） | pwa |
|---|---|---|
| バックエンド | Express サーバー `server/` | Cloudflare Workers `src/worker.ts` |
| CLI 連携 | `server/lib/engine-client.js` が `todo-engine.js` を **spawn** | なし（GitHub REST API を直接呼ぶ） |
| デプロイ | なし（ローカルのみ） | todo.saitoko.net |

この違いにより、**CLI のロジックに依存する機能は web にしか実装されていません**。

## pwa が持たない機能（重要）

以下は web では動いていましたが、pwa には存在しません。

| 機能 | 元 Issue |
|---|---|
| recur 再作成・depends_on 昇格 | #1669 |
| 再作成結果のフロントエンド通知 | #1672 |
| 完了 Undo | #1656 |
| トースト通知 | #1656 |
| 繰り返し再作成の通知UI | #1672 |

**ただし、これらのロジックは本リポジトリにはありません。** web の `server/lib/github-issue-repository.js` の `done()` は `callEngineJson(tenant, ['done-issue', ...])` で CLI の `~/.claude/todo-engine.js` に spawn して丸投げする薄いラッパーです。web がこれらを実現できたのは「Express なので子プロセスを spawn できる」という環境優位によるもので、移植可能なロジック資産があるわけではありません。

pwa へ移植する場合の参照元は **CLI 本体** です。

| 対象 | 所在 | 規模 |
|---|---|---|
| recur 日付計算 | `~/.claude/todo-engine.js:1009-1130` | 約120行 |
| recur 再作成 | 同 `postDoneProcessing():3438-3473` | 約35行 |
| depends_on 昇格 | 同 `:3485-3515` | 約30行 |

本リポジトリに価値があるのは、**UI 層の実装**（`src/lib/useToast.ts` / `src/components/ToastStack.tsx` / `src/lib/recurNotice.ts`）と、**API レスポンス設計**（`recurCreated: Array<{number, newIssueNumber}>` をどう透過させたか）です。

関連課題は本体リポジトリの Issue #1861。

## ローカルブランチについて

ローカルに残っている作業ブランチ9本は、**すべて内容が `main` にマージ済み**です（2026-08-18 に `git cherry -v origin/main <branch>` で全件 `-` 判定を確認）。PR マージ後の削除漏れであり、未反映の作業はありません。

## Issue の所在

本リポジトリに紐づいていた Issue 9件は 2026-08-18 に整理済みです（本体リポジトリ `000-partner` で管理）。

- pwa で解決済み・非該当のためクローズ: #1673 / #1711 / #1194 / #1192
- pwa 側へ起票し直し: #1729 → #1861、#1718 → #1862、#1193 → #1863、#1191 → #1864、#1186 → #1865
