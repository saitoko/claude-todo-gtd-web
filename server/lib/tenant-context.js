'use strict';

const path = require('path');
const fs = require('fs');

/**
 * TenantContext: 1テナント（ユーザー）のリポジトリ・認証情報
 *
 * Phase 1: 環境変数から固定の1テナントをロード
 * Phase 2: Express セッション / Basic 認証ヘッダーから解決（差し替えポイント）
 * Phase 3: GitHub OAuth トークンから解決（差し替えポイント）
 */

/**
 * .env ファイルをプロジェクトルートから探索してロードする
 * todo.sh と同じ探索ロジック: カレントディレクトリから上に辿る
 */
function loadEnvFile() {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    const envPath = path.join(dir, '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx < 0) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        // 既に環境変数が設定されている場合は上書きしない
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
      return envPath;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Phase 1: 環境変数から TenantContext をロードする
 * 必須変数が未設定の場合は例外をスローする
 *
 * @returns {{ owner: string, repo: string, token: string }}
 */
function loadTenantContext() {
  // .env ファイルを探索してロード（環境変数が既にセットされていれば上書きしない）
  loadEnvFile();

  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const owner = process.env.TODO_REPO_OWNER;
  const repo = process.env.TODO_REPO_NAME;

  if (!token) {
    throw new Error('GH_TOKEN が設定されていません。.env ファイルを確認してください。');
  }
  if (!owner) {
    throw new Error('TODO_REPO_OWNER が設定されていません。.env ファイルを確認してください。');
  }
  if (!repo) {
    throw new Error('TODO_REPO_NAME が設定されていません。.env ファイルを確認してください。');
  }

  return { owner, repo, token };
}

module.exports = { loadTenantContext, loadEnvFile };
