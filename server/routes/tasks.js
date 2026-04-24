'use strict';

const express = require('express');
const { GitHubIssueRepository } = require('../lib/github-issue-repository');
const { GTD_LABELS, PROJECT_LABEL, normLabel } = require('../lib/gtd-labels');

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
 * GET /api/tasks/:number
 * タスクの詳細情報（担当者・コメントを含む）を取得する
 */
router.get('/tasks/:number', async (req, res) => {
  try {
    const num = parseInt(req.params.number, 10);
    if (!num || num <= 0) {
      return res.status(400).json({ error: '無効な Issue 番号です' });
    }
    const result = await repo.getDetail(req._tenant, num);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

/**
 * POST /api/tasks/:number/done
 * タスクを完了（Issue クローズ）する
 * Body: { withChildren?: boolean }
 * Response: { ok: true, closedChildren?: number[] }
 */
router.post('/tasks/:number/done', async (req, res) => {
  try {
    const num = parseInt(req.params.number, 10);
    if (!num || num <= 0) {
      return res.status(400).json({ error: '無効な Issue 番号です' });
    }

    const withChildren = !!(req.body && req.body.withChildren);
    const result = await repo.done(req._tenant, num, { withChildren });
    res.json({ ok: true, closedChildren: result.closedChildren });
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
 * GET /api/labels
 * リポジトリのラベル一覧を取得する
 */
router.get('/labels', async (req, res) => {
  try {
    const labels = await repo.listLabels(req._tenant);
    res.json({ labels });
  } catch (err) {
    handleError(res, err);
  }
});

/**
 * PATCH /api/tasks/:number
 * タスクの属性を更新する
 * Body: { title?, body?, addLabels?, removeLabels? }
 */
router.patch('/tasks/:number', async (req, res) => {
  try {
    const num = parseInt(req.params.number, 10);
    if (!num || num <= 0) {
      return res.status(400).json({ error: '無効な Issue 番号です' });
    }

    const { title, body, addLabels, removeLabels } = req.body || {};

    if (title !== undefined && !title.trim()) {
      return res.status(400).json({ error: 'タイトルは1文字以上必要です' });
    }

    // GTDカテゴリラベルのガード
    const GTD_ALL = [...GTD_LABELS, PROJECT_LABEL];
    const labelsToCheck = [...(addLabels || []), ...(removeLabels || [])];
    for (const label of labelsToCheck) {
      if (GTD_ALL.includes(normLabel(label))) {
        return res.status(400).json({
          error: 'GTDカテゴリラベルは編集フォームで変更できません。移動機能を使ってください。',
        });
      }
    }

    const patch = {};
    if (title !== undefined) patch.title = title.trim();
    if (body !== undefined) patch.body = body;
    if (addLabels && addLabels.length > 0) patch.addLabels = addLabels;
    if (removeLabels && removeLabels.length > 0) patch.removeLabels = removeLabels;

    await repo.update(req._tenant, num, patch);
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

  if (err.code === 'CHILD_CLOSE_FAILED') {
    return res.status(500).json({
      error: err.message,
      failedChildren: err.failedChildren || [],
    });
  }

  if (err.code === 'PARENT_CLOSE_FAILED') {
    return res.status(500).json({
      error: err.message,
      closedChildren: err.closedChildren || [],
      parentStillOpen: true,
      cause: err.cause || '',
    });
  }

  res.status(500).json({ error: '内部エラー', detail: err.message });
}

module.exports = { router };
