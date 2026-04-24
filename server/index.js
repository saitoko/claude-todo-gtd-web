'use strict';

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const { loadTenantContext } = require('./lib/tenant-context');
const { authMiddleware } = require('./middleware/auth');
const { router: tasksRouter } = require('./routes/tasks');

// 起動時に TenantContext をロードし、未設定なら即終了する
let tenant;
try {
  tenant = loadTenantContext();
} catch (err) {
  process.stderr.write('[todo-manager] 起動エラー: ' + err.message + '\n');
  process.exit(1);
}

const PORT = Number(process.env.PORT || 5175);
const VITE_PORT = Number(process.env.VITE_PORT || 5176);

const app = express();

// Phase 1: localhost のみ許可（Vite dev server オリジン）
// TODO(Phase 2): env化（ALLOWED_ORIGIN 環境変数で制御）
app.use(cors({ origin: `http://localhost:${VITE_PORT}` }));
app.use(express.json());

// Phase 1: TenantContext をリクエストに注入（Phase 2/3 で差し替えポイント）
app.use((req, _res, next) => {
  req._tenant = tenant;
  next();
});

// API ルーター（認証ミドルウェアを通す）
app.use('/api', authMiddleware, tasksRouter);

// ヘルスチェック
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    owner: tenant.owner,
    repo: tenant.repo,
    uptime: process.uptime(),
  });
});

// 本番ビルドがあれば配信、なければ dev モードとして Vite へリダイレクト
const distDir = path.join(__dirname, '..', 'dist');
const hasDist = fs.existsSync(path.join(distDir, 'index.html'));

if (hasDist) {
  app.use(express.static(distDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
} else {
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'not found' });
    }
    res.redirect(`http://localhost:${VITE_PORT}${req.originalUrl}`);
  });
}

// Phase 1: localhost のみバインド（外部NICには露出しない）
// TODO(Phase 2): 外部公開時は '0.0.0.0' またはリバースプロキシに変更
app.listen(PORT, '127.0.0.1', () => {
  process.stdout.write('\n');
  process.stdout.write('========================================\n');
  process.stdout.write('  todo-manager\n');
  process.stdout.write('========================================\n');
  if (hasDist) {
    process.stdout.write(`  Open: http://localhost:${PORT}/\n`);
  } else {
    process.stdout.write(`  UI (Vite dev):  http://localhost:${VITE_PORT}/\n`);
    process.stdout.write(`  API (Express):  http://localhost:${PORT}/api/\n`);
    process.stdout.write(`  (5175/ → 5176 に自動リダイレクト)\n`);
  }
  process.stdout.write('========================================\n');
  process.stdout.write(`  Owner: ${tenant.owner}\n`);
  process.stdout.write(`  Repo:  ${tenant.repo}\n`);
  process.stdout.write('\n');
});
