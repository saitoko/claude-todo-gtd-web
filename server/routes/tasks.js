'use strict';

const express = require('express');
const { GitHubIssueRepository } = require('../lib/github-issue-repository');
const { GTD_LABELS, PROJECT_LABEL, GTD_DISPLAY_JA, normLabel } = require('../lib/gtd-labels');
const {
  parseIssueNumber,
  validateString,
  validateOptionalBoolean,
  validateLabelArray,
} = require('./validation');

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
    const rawGtd = req.query.gtd;
    if (rawGtd !== undefined) {
      // `?gtd[]=x` 等でオブジェクト・配列が来た場合を弾く（express の qs パーサー）
      const typed = validateString(rawGtd, 'gtd');
      if (!typed.ok) return res.status(400).json(typed.body);
    }

    const gtdFilter = rawGtd || null;
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

    if (title === undefined || title === null) {
      return res.status(400).json({ error: 'タイトルが空です' });
    }
    const typedTitle = validateString(title, 'title');
    if (!typedTitle.ok) return res.status(400).json(typedTitle.body);
    if (!title.trim()) {
      return res.status(400).json({ error: 'タイトルが空です' });
    }

    if (gtdCategory !== undefined && gtdCategory !== null) {
      const typedGtd = validateString(gtdCategory, 'gtdCategory');
      if (!typedGtd.ok) return res.status(400).json(typedGtd.body);
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
    const parsed = parseIssueNumber(req.params.number);
    if (!parsed.ok) return res.status(400).json(parsed.body);
    const num = parsed.value;

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
 * Response: { ok: true, closedChildren?: number[], recurCreated?: Array<{ number: number, newIssueNumber: number }> }
 *
 * Issue #1672: repo.done() が返す recurCreated（#1669 で追加された次周期Issue再作成情報）を
 * レスポンスに含める。Web UI 側で「次周期のタスクが作成されました」通知を出せるようにするため。
 */
router.post('/tasks/:number/done', async (req, res) => {
  try {
    const parsed = parseIssueNumber(req.params.number);
    if (!parsed.ok) return res.status(400).json(parsed.body);
    const num = parsed.value;

    const typedWithChildren = validateOptionalBoolean(
      (req.body || {}).withChildren,
      'withChildren',
      false
    );
    if (!typedWithChildren.ok) return res.status(400).json(typedWithChildren.body);
    const withChildren = typedWithChildren.value;

    const result = await repo.done(req._tenant, num, { withChildren });
    res.json({ ok: true, closedChildren: result.closedChildren, recurCreated: result.recurCreated });
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
    const parsed = parseIssueNumber(req.params.number);
    if (!parsed.ok) return res.status(400).json(parsed.body);
    const num = parsed.value;

    const { targetGtd } = req.body || {};
    if (targetGtd === undefined || targetGtd === null || targetGtd === '') {
      return res.status(400).json({ error: 'targetGtd が指定されていません' });
    }
    const typedTarget = validateString(targetGtd, 'targetGtd');
    if (!typedTarget.ok) return res.status(400).json(typedTarget.body);

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
 * GET /api/gtd-labels
 * GTD カテゴリの表示定義（絵文字付き日本語名）を返す
 * 静的データのため強キャッシュ可
 */
router.get('/gtd-labels', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=86400, immutable');
  res.json({
    labels: GTD_DISPLAY_JA,
    keys: GTD_LABELS,
    projectKey: PROJECT_LABEL,
  });
});

/**
 * PATCH /api/tasks/:number
 * タスクの属性を更新する
 * Body: { title?, body?, addLabels?, removeLabels? }
 */
router.patch('/tasks/:number', async (req, res) => {
  try {
    const parsed = parseIssueNumber(req.params.number);
    if (!parsed.ok) return res.status(400).json(parsed.body);
    const num = parsed.value;

    const { title, body, addLabels, removeLabels } = req.body || {};

    if (title !== undefined) {
      const typedTitle = validateString(title, 'title');
      if (!typedTitle.ok) return res.status(400).json(typedTitle.body);
      if (!title.trim()) {
        return res.status(400).json({ error: 'タイトルは1文字以上必要です' });
      }
    }

    if (body !== undefined) {
      const typedBody = validateString(body, 'body');
      if (!typedBody.ok) return res.status(400).json(typedBody.body);
    }

    if (addLabels !== undefined) {
      const typedAdd = validateLabelArray(addLabels, 'addLabels');
      if (!typedAdd.ok) return res.status(400).json(typedAdd.body);
    }

    if (removeLabels !== undefined) {
      const typedRemove = validateLabelArray(removeLabels, 'removeLabels');
      if (!typedRemove.ok) return res.status(400).json(typedRemove.body);
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

    // 更新対象が1つもない PATCH は engine を呼ばず何もせず 200 を返していたため、
    // クライアント側から「保存できた」と誤認できた。明示的に 400 で弾く。
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({
        error: '更新するフィールドがありません',
        detail: 'title / body / addLabels / removeLabels のいずれかを指定してください',
      });
    }

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
