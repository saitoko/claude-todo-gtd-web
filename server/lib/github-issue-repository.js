'use strict';

const { callEngineJson } = require('./engine-client');
const { getGtdCategory } = require('./gtd-labels');

/**
 * GitHubIssueRepository: TodoRepository の Phase 1 実装
 * todo-engine.js の api サブコマンド経由で GitHub Issues を操作する
 *
 * TenantContext は必ず引数で受け取る（モジュールトップレベルで env を読まない）
 * Phase 3 でマルチテナント化する際の差し替えポイント
 */
class GitHubIssueRepository {

  /**
   * オープンな Issue 一覧を取得し、GTD カテゴリ別に分類して返す
   *
   * @param {{ owner, repo, token }} tenant
   * @param {string|null} gtdFilter - 'inbox'/'next'/... | null（全カテゴリ）
   * @returns {Promise<{ tasks: Task[], total: number, byCategory: Record<string,number>, childTasks?: Task[] }>}
   */
  async list(tenant, gtdFilter = null) {
    const raw = await callEngineJson(tenant, ['list-issues']);
    // raw は [{ number, title, body, labels: [{name}], closedAt }]

    const tasks = raw
      .filter(i => !i.closedAt) // オープンのみ
      .map(i => this._normalize(i))
      .filter(t => t.gtdCategory !== null); // ラベル漏れは除外（CLIで気づける）

    // byCategory 集計
    const byCategory = {};
    for (const task of tasks) {
      byCategory[task.gtdCategory] = (byCategory[task.gtdCategory] || 0) + 1;
    }

    // project フィルタの場合はツリー用に子タスクも返す
    if (gtdFilter === 'project') {
      const projectTasks = tasks.filter(t => t.gtdCategory === 'project');
      const childTasks = tasks.filter(t => t.parentProject != null);
      return {
        tasks: projectTasks,
        total: tasks.length,
        byCategory,
        childTasks,
      };
    }

    // フィルタリング
    const filtered = gtdFilter ? tasks.filter(t => t.gtdCategory === gtdFilter) : tasks;

    return {
      tasks: filtered,
      total: tasks.length,
      byCategory,
    };
  }

  /**
   * タスクを追加する
   *
   * @param {{ owner, repo, token }} tenant
   * @param {{ title: string, gtdCategory?: string }} input
   * @returns {Promise<{ number: number }>}
   */
  async add(tenant, input) {
    const { GTD_DISPLAY } = require('./gtd-labels');
    const gtdKey = input.gtdCategory || 'inbox';
    const label = GTD_DISPLAY[gtdKey];

    const issueInput = {
      title: input.title,
      body: '',
      labels: label ? [label] : [],
    };

    const result = await callEngineJson(
      tenant,
      ['create-issue'],
      { ISSUE_INPUT_ENV: JSON.stringify(issueInput) }
    );

    return { number: result.number };
  }

  /**
   * タスクを完了（Issue をクローズ）する
   *
   * @param {{ owner, repo, token }} tenant
   * @param {number} issueNumber
   * @param {{ withChildren?: boolean }} [options]
   * @returns {Promise<{ closedChildren?: number[] }>}
   */
  async done(tenant, issueNumber, options = {}) {
    const closedChildren = [];

    if (options.withChildren) {
      // list-issues で全件取得し、parentProject === issueNumber の子タスクを先にクローズする
      const allResult = await callEngineJson(tenant, ['list-issues']);
      const allTasks = allResult
        .filter(i => !i.closedAt)
        .map(i => this._normalize(i));

      const children = allTasks.filter(t => t.parentProject === issueNumber);

      const failedNumbers = [];
      for (const child of children) {
        try {
          await callEngineJson(tenant, ['close-issue', String(child.number)]);
          closedChildren.push(child.number);
        } catch (err) {
          failedNumbers.push(child.number);
        }
      }

      if (failedNumbers.length > 0) {
        const error = new Error(
          `子タスクのクローズに失敗しました: #${failedNumbers.join(', #')}。親プロジェクトはオープンのままです。`
        );
        error.code = 'CHILD_CLOSE_FAILED';
        error.failedChildren = failedNumbers;
        throw error;
      }
    }

    try {
      await callEngineJson(tenant, ['close-issue', String(issueNumber)]);
    } catch (parentErr) {
      // 子は全件成功済みだが親のクローズに失敗した場合
      const error = new Error(`親プロジェクト #${issueNumber} のcloseに失敗`);
      error.code = 'PARENT_CLOSE_FAILED';
      error.closedChildren = closedChildren;
      error.parentStillOpen = true;
      error.cause = parentErr.message || String(parentErr);
      throw error;
    }
    return { closedChildren };
  }

  /**
   * タスクの詳細情報（担当者・コメントを含む）を取得する
   *
   * @param {{ owner, repo, token }} tenant
   * @param {number} issueNumber
   * @returns {Promise<TaskDetail>}
   */
  async getDetail(tenant, issueNumber) {
    // Issue 基本情報（担当者・日時を含む）
    const issue = await callEngineJson(
      tenant,
      ['view-issue-detail', String(issueNumber)]
    );

    // コメント一覧（失敗してもコメントなしとして続行する）
    let comments = [];
    try {
      comments = await callEngineJson(
        tenant,
        ['list-comments', String(issueNumber)]
      );
      if (!Array.isArray(comments)) comments = [];
    } catch (_err) {
      // コメント取得失敗は握りつぶし、空配列で続行
      comments = [];
    }

    return {
      number: issue.number,
      title: issue.title,
      body: issue.body || '',
      labels: issue.labels.map(l => (typeof l === 'string' ? l : l.name)),
      assignees: issue.assignees || [],
      createdAt: issue.createdAt || null,
      updatedAt: issue.updatedAt || null,
      comments,
    };
  }

  /**
   * タスクの GTD カテゴリを変更する
   *
   * @param {{ owner, repo, token }} tenant
   * @param {number} issueNumber
   * @param {string} targetGtd - 'inbox'/'next'/'waiting'/'someday'/'routine'/'reference'
   */
  async move(tenant, issueNumber, targetGtd) {
    await callEngineJson(tenant, ['move-gtd', String(issueNumber), targetGtd]);
  }

  /**
   * 生の Issue データを Task 型に正規化する
   * @private
   */
  _normalize(issue) {
    const labelNames = issue.labels.map(l => (typeof l === 'string' ? l : l.name));
    const gtdCategory = getGtdCategory(labelNames);

    // due / priority / estimate の抽出（body の frontmatter 風テキストから）
    const due = this._extractField(issue.body, 'due');
    const priority = this._extractPriority(labelNames);

    // 親プロジェクト番号の抽出（body の `project: #N` から）
    const parentProject = this._extractParentProject(issue.body);

    return {
      number: issue.number,
      title: issue.title,
      gtdCategory,
      labels: labelNames,
      body: issue.body || '',
      due,
      priority,
      parentProject,
    };
  }

  /**
   * body から `field: value` 形式のフィールドを抽出する
   * @private
   */
  _extractField(body, field) {
    if (!body) return null;
    const match = body.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'));
    return match ? match[1].trim() : null;
  }

  /**
   * ラベル一覧から優先度（p1/p2/p3）を抽出する
   * @private
   */
  _extractPriority(labelNames) {
    for (const name of labelNames) {
      if (/^p[123]$/.test(name)) return name;
    }
    return null;
  }

  /**
   * body から `project: #N` 形式の親プロジェクト番号を抽出する
   * @private
   * @returns {number|null}
   */
  _extractParentProject(body) {
    const raw = this._extractField(body, 'project');
    if (!raw) return null;
    const num = parseInt(raw.replace(/^#/, ''), 10);
    return isNaN(num) ? null : num;
  }
}

module.exports = { GitHubIssueRepository };
