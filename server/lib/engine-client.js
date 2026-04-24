'use strict';

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

// todo-engine.js のパス
const ENGINE_PATH = path.join(process.env.HOME || os.homedir(), '.claude', 'todo-engine.js');

// タイムアウト: 30 秒（GitHub API のレイテンシを考慮）
const TIMEOUT_MS = 30000;

/**
 * JST の今日の日付を YYYY-MM-DD 形式で返す
 * Windows では TZ=Asia/Tokyo が効かないため Intl.DateTimeFormat を使用
 */
function getTodayJST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
}

/**
 * todo-engine.js をサブプロセスとして起動し、stdout の結果を返す
 *
 * @param {{ owner: string, repo: string, token: string }} tenant - TenantContext
 * @param {string[]} args - engine に渡す引数（例: ['api', 'list-issues']）
 * @param {Record<string, string>} envExtra - 追加環境変数（ISSUE_INPUT_ENV 等）
 * @returns {Promise<string>} - stdout の文字列（JSON or 'ok'）
 */
async function callEngine(tenant, args, envExtra = {}) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      GH_TOKEN: tenant.token,
      TODO_REPO_OWNER: tenant.owner,
      TODO_REPO_NAME: tenant.repo,
      LANG_ENV: process.env.LANG_ENV || 'ja',
      TODAY: getTodayJST(),
      ...envExtra,
    };

    const child = spawn('node', [ENGINE_PATH, ...args], { env });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      reject(Object.assign(new Error('engine タイムアウト (30秒)'), { code: 'TIMEOUT' }));
    }, TIMEOUT_MS);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return;
      if (code !== 0) {
        const msg = (stderr || 'engine が exit code ' + code + ' で終了しました').trim();
        reject(Object.assign(new Error(msg), { code: 'ENGINE_ERROR', engineStderr: stderr }));
      } else {
        resolve(stdout);
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      if (timedOut) return;
      reject(Object.assign(err, { code: 'SPAWN_ERROR' }));
    });
  });
}

/**
 * api サブコマンドを呼び出して JSON をパースして返す
 * stdout が 'ok' などのテキストの場合は { ok: true } を返す
 */
async function callEngineJson(tenant, subArgs, envExtra = {}) {
  const stdout = await callEngine(tenant, ['api', ...subArgs], envExtra);
  const trimmed = stdout.trim();
  if (trimmed === 'ok') return { ok: true };
  try {
    return JSON.parse(trimmed);
  } catch {
    // JSON でなければ文字列をそのまま返す
    return { raw: trimmed };
  }
}

module.exports = { callEngine, callEngineJson, getTodayJST };
