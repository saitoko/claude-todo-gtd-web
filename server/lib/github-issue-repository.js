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
   * Issue #1669: 旧実装は `close-issue`（close するだけ）を呼んでいたため、
   * recur（繰り返し）設定済みタスクを Web 版で完了しても次周期の Issue が
   * 再作成されず、繰り返しチェーンが無言で途切れるバグがあった。
   * `done-issue`（close + postDoneProcessing 相当の後処理）を呼ぶことで、
   * CLI の `/todo done` と同じ recur 再作成・depends_on 昇格を行う。
   * 子タスクにも recur が設定されている可能性があるため、親・子どちらも
   * `done-issue` 経由にする。
   *
   * @param {{ owner, repo, token }} tenant
   * @param {number} issueNumber
   * @param {{ withChildren?: boolean }} [options]
   * @returns {Promise<{ closedChildren?: number[], recurCreated?: Array<{ number: number, newIssueNumber: number }> }>}
   */
  async done(tenant, issueNumber, options = {}) {
    const closedChildren = [];
    const recurCreated = [];

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
          const childResult = await callEngineJson(tenant, ['done-issue', String(child.number)]);
          closedChildren.push(child.number);
          if (childResult && childResult.newIssueNumber) {
            recurCreated.push({ number: child.number, newIssueNumber: childResult.newIssueNumber });
          }
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
      const parentResult = await callEngineJson(tenant, ['done-issue', String(issueNumber)]);
      if (parentResult && parentResult.newIssueNumber) {
        recurCreated.push({ number: issueNumber, newIssueNumber: parentResult.newIssueNumber });
      }
    } catch (parentErr) {
      // 子は全件成功済みだが親のcloseに失敗した場合
      const error = new Error(`親プロジェクト #${issueNumber} のcloseに失敗`);
      error.code = 'PARENT_CLOSE_FAILED';
      error.closedChildren = closedChildren;
      error.parentStillOpen = true;
      error.cause = parentErr.message || String(parentErr);
      throw error;
    }
    return { closedChildren, recurCreated };
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

    // list() と同じ _normalize() を通し、due / priority / gtdCategory / parentProject を
    // getDetail でも導出する。
    // Issue #1712: TaskDetail 型（フロントの src/lib/api.ts）は Task を extends しており
    // due/priority/gtdCategory/parentProject を持つと主張していたが、従来の getDetail は
    // これらを返していなかった（型と実装の乖離）。
    // Issue #1716: この乖離により Web UI の EditForm が task.due を常に '' で初期化し、
    // 保存時に due 行が本文から消える（データ損失）バグが発生していた。
    const normalized = this._normalize(issue);

    return {
      ...normalized,
      assignees: issue.assignees || [],
      createdAt: issue.createdAt || null,
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
   * リポジトリのラベル一覧を取得する
   *
   * @param {{ owner, repo, token }} tenant
   * @returns {Promise<Array<{ name: string, color: string }>>}
   */
  async listLabels(tenant) {
    const labels = await callEngineJson(tenant, ['list-labels']);
    return labels;
  }

  /**
   * タスクの属性を更新する
   *
   * @param {{ owner, repo, token }} tenant
   * @param {number} issueNumber
   * @param {{ title?: string, body?: string, addLabels?: string[], removeLabels?: string[] }} patch
   */
  async update(tenant, issueNumber, patch) {
    // 1. title / body の更新
    if (patch.title !== undefined || patch.body !== undefined) {
      const input = {};
      if (patch.title !== undefined) input.title = patch.title;
      if (patch.body !== undefined) input.body = patch.body;
      await callEngineJson(
        tenant,
        ['edit-issue', String(issueNumber)],
        { ISSUE_INPUT_ENV: JSON.stringify(input) }
      );
    }

    // 2. ラベル除去
    if (patch.removeLabels && patch.removeLabels.length > 0) {
      await callEngineJson(
        tenant,
        ['remove-labels', String(issueNumber)],
        { LABELS_ENV: patch.removeLabels.join(',') }
      );
    }

    // 3. ラベル追加
    if (patch.addLabels && patch.addLabels.length > 0) {
      await callEngineJson(
        tenant,
        ['add-labels', String(issueNumber)],
        { LABELS_ENV: patch.addLabels.join(',') }
      );
    }
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
      updatedAt: issue.updatedAt || null,
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
