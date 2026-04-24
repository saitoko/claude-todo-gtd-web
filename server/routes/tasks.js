'use strict';

const express = require('express');
const { GitHubIssueRepository } = require('../lib/github-issue-repository');
const { GTD_LABELS, PROJECT_LABEL } = require('../lib/gtd-labels');

const router = express.Router();
const repo = new GitHubIssueRepository();

// 有効な GTD カテゴリ（move 先として許可）
const VALID_GTD_KEYS = new Set(GTD_LABELS);

/**
 * GET /api/tasks
 * タスク一覧を取得する（全カテゴリ or ?gtd=inbox でフィルタ）
 */
router.get('/tasks', async (req, res) => {
  try {
    const gtdFilter = req.query.gtd || null;
    if (gtdFilter && !VALID_GTD_KEYS.has(gtdFilter) && gtdFilter !== PROJECT_LABEL) {
      return res.status(400).json({ error: '無効な gtd カテゴリです', detail: gtdFilter });
    }

    // tenant は req から取得（Phase 1: req._tenant に設定済み）
    const result = await repo.list(req._tenant, gtdFilter);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

/**
 * POST /api/tasks
 * タスクを追加する
 * Body: { title: string, gtdCategory?: string }
 */
router.post('/tasks', async (req, res) => {
  try {
    const { title, gtdCategory } = req.body || {};

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'タイトルが空です' });
    }

    const gtdKey = gtdCategory || 'inbox';
    if (!VALID_GTD_KEYS.has(gtdKey)) {
      return res.status(400).json({ error: '無効な gtdCategory です', detail: gtdKey });
    }

    const result = await repo.add(req._tenant, { title: title.trim(), gtdCategory: gtdKey });
    res.status(201).json(result);
  } catch (err) {
    handleError(res, err);
  }
});

/**
 * POST /api/tasks/:number/done
 * タスクを完了（Issue クローズ）する
 */
router.post('/tasks/:number/done', async (req, res) => {
  try {
    const num = parseInt(req.params.number, 10);
    if (!num || num <= 0) {
      return res.status(400).json({ error: '無効な Issue 番号です' });
    }

    await repo.done(req._tenant, num);
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

/**
 * POST /api/tasks/:number/move
 * GTD カテゴリを変更する
 * Body: { targetGtd: string }
 */
router.post('/tasks/:number/move', async (req, res) => {
  try {
    const num = parseInt(req.params.number, 10);
    if (!num || num <= 0) {
      return res.status(400).json({ error: '無効な Issue 番号です' });
    }

    const { targetGtd } = req.body || {};
    if (!targetGtd) {
      return res.status(400).json({ error: 'targetGtd が指定されていません' });
    }

    // project への move は engine 側で禁止されているが、ここでも弾く
    if (targetGtd === PROJECT_LABEL) {
      return res.status(400).json({
        error: 'project への移動はできません',
        detail: 'プロジェクト昇格には /todo promote-project を使ってください',
      });
    }

    if (!VALID_GTD_KEYS.has(targetGtd)) {
      return res.status(400).json({ error: '無効な targetGtd です', detail: targetGtd });
    }

    await repo.move(req._tenant, num, targetGtd);
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

/**
 * エラーハンドラー
 */
function handleError(res, err) {
  process.stderr.write('[tasks] Error: ' + (err.message || String(err)) + '\n');

  if (err.code === 'TIMEOUT') {
    return res.status(504).json({ error: 'タイムアウト（30秒）', detail: err.message });
  }

  if (err.code === 'ENGINE_ERROR') {
    // engine の stderr メッセージをそのまま伝播
    const detail = err.engineStderr ? err.engineStderr.trim() : err.message;
    return res.status(500).json({ error: 'engine エラー', detail });
  }

  res.status(500).json({ error: '内部エラー', detail: err.message });
}

module.exports = { router };
