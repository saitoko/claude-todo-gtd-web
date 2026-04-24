'use strict';

/**
 * 認証ミドルウェア
 *
 * Phase 1: localhost バインドのみ。パススルー実装（next() のみ）
 * Phase 2: Basic 認証 or Cloudflare Access の JWT 検証を追加（差し替えポイント）
 * Phase 3: GitHub OAuth トークンを Bearer ヘッダーで受け取り TenantContext に解決（差し替えポイント）
 */

// eslint-disable-next-line no-unused-vars
function authMiddleware(req, res, next) {
  // Phase 1: パススルー（localhost のみでの利用を想定）
  next();
}

module.exports = { authMiddleware };
