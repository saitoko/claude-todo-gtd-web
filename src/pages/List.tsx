import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Task, type TaskListResponse, type RecurCreated, GTD_DISPLAY, type GtdKey, getGtdEmoji } from '../lib/api';
import { getRandomTip } from '../lib/gtd-tips';
import { sortTasks, type SortKey } from '../lib/sortTasks';
import { partitionByDate } from '../lib/partitionByDate';
import { formatRecurNotice } from '../lib/recurNotice';
import TaskRow from '../components/TaskRow';
import ProjectTreeRow from '../components/ProjectTreeRow';
import AddTaskForm from '../components/AddTaskForm';
import TaskDetailModal from '../components/TaskDetailModal';
import { useMobileBreakpoint } from '../hooks/useMobileBreakpoint';

// recur通知の自動消去までの表示時間（ミリ秒）。#1656 の本格トースト基盤が
// 入るまでの最小実装（画面上部に一定時間表示して自動で消える簡易通知）。
const RECUR_NOTICE_DURATION_MS = 5000;

interface Props {
  gtd: GtdKey;
  onCategoryChange: (byCategory: Record<string, number>) => void;
  getCache: (gtd: GtdKey) => TaskListResponse | null;
  setCache: (gtd: GtdKey, data: TaskListResponse) => void;
  invalidateCache: (gtd?: GtdKey) => void;
}

const GTD_ORDER: Record<string, number> = {
  inbox: 0, next: 1, waiting: 2, someday: 3, routine: 4,
};

function buildProjectTree(
  projectTasks: Task[],
  childTasks: Task[]
): { parent: Task; children: Task[] }[] {
  return projectTasks.map((parent) => {
    const children = childTasks
      .filter((c) => c.parentProject === parent.number)
      .sort((a, b) => {
        const orderA = GTD_ORDER[a.gtdCategory] ?? 99;
        const orderB = GTD_ORDER[b.gtdCategory] ?? 99;
        if (orderA !== orderB) return orderA - orderB;
        return b.number - a.number;
      });
    return { parent, children };
  });
}

/** モバイル用カード1件 */
function MobileTaskCard({
  task,
  onDone,
  onDetail,
}: {
  task: Task;
  onDone: (n: number) => Promise<void>;
  onDetail: (t: Task) => void;
}) {
  const [hidden, setHidden] = useState(false);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
  const isOverdue = task.due != null && task.due < today;

  if (hidden) return null;

  return (
    <div
      className={`mobile-card${task.priority ? ` mobile-card-pri-${task.priority}` : ''}`}
      onClick={() => onDetail(task)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onDetail(task); }}
    >
      <div className="mobile-card-left">
        <span className="mobile-card-gtd-bar" data-gtd={task.gtdCategory} />
      </div>
      <div className="mobile-card-body">
        <div className="mobile-card-title">{task.title}</div>
        <div className="mobile-card-meta">
          <span className="mobile-card-category">{getGtdEmoji(task.gtdCategory)}</span>
          {task.due && (
            <span className={`mobile-card-due${isOverdue ? ' overdue' : ''}`}>
              {task.due}
            </span>
          )}
        </div>
      </div>
      <div className="mobile-card-right">
        {task.priority && (
          <span className={`badge pri-${task.priority}`}>{task.priority}</span>
        )}
        <button
          className="mobile-card-done-btn"
          onClick={async (e) => {
            e.stopPropagation();
            if (!window.confirm(`#${task.number} を完了しますか？`)) return;
            setHidden(true);
            try {
              await onDone(task.number);
            } catch (err) {
              setHidden(false);
              alert(err instanceof Error ? err.message : '完了処理に失敗しました');
            }
          }}
          title="完了"
          aria-label="完了"
        >
          ✅
        </button>
      </div>
    </div>
  );
}

/** モバイル用セクションヘッダー */
function MobileSectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="mobile-section-header">
      <span className="mobile-section-label">{label}</span>
      <span className="mobile-section-count">{count}</span>
    </div>
  );
}

/** モバイル用リスト（日付セクション分割） */
function MobileTaskList({
  tasks,
  onDone,
  onDetail,
  gtd,
}: {
  tasks: Task[];
  onDone: (n: number) => Promise<void>;
  onDetail: (t: Task) => void;
  gtd: string;
}) {
  const { overdue, today, future, noDue, overdueLabel, todayLabel, futureLabel } = useMemo(
    () => partitionByDate(tasks),
    [tasks]
  );

  if (tasks.length === 0) return null;

  // inbox/someday 等、期日が少ないカテゴリは noDue をまとめて表示
  const showSections = overdue.length > 0 || today.length > 0 || future.length > 0;

  return (
    <div className="mobile-task-list">
      {showSections && overdue.length > 0 && (
        <>
          <MobileSectionHeader label={overdueLabel} count={overdue.length} />
          {overdue.map((t) => (
            <MobileTaskCard key={t.number} task={t} onDone={onDone} onDetail={onDetail} />
          ))}
        </>
      )}
      {showSections && today.length > 0 && (
        <>
          <MobileSectionHeader label={todayLabel} count={today.length} />
          {today.map((t) => (
            <MobileTaskCard key={t.number} task={t} onDone={onDone} onDetail={onDetail} />
          ))}
        </>
      )}
      {showSections && future.length > 0 && (
        <>
          <MobileSectionHeader label={futureLabel} count={future.length} />
          {future.map((t) => (
            <MobileTaskCard key={t.number} task={t} onDone={onDone} onDetail={onDetail} />
          ))}
        </>
      )}
      {noDue.length > 0 && (
        <>
          {showSections && (
            <MobileSectionHeader label="期日なし" count={noDue.length} />
          )}
          {noDue.map((t) => (
            <MobileTaskCard key={t.number} task={t} onDone={onDone} onDetail={onDetail} />
          ))}
        </>
      )}
    </div>
  );
}

/** 空状態オンボーディングメッセージ */
function EmptyState({ gtd }: { gtd: string }) {
  const messages: Record<string, { icon: string; message: string; hint: string }> = {
    inbox:     { icon: '📥', message: 'Inbox は空です', hint: '新しいタスクをどんどん入れましょう' },
    next:      { icon: '🎯', message: 'Next は空です', hint: '今すぐ着手するタスクを追加しましょう' },
    waiting:   { icon: '⏳', message: 'Waiting は空です', hint: '誰かの返答を待っているタスクはありません' },
    someday:   { icon: '🌈', message: 'Someday は空です', hint: 'いつかやりたいアイデアを書き留めましょう' },
    routine:   { icon: '🔁', message: 'Routine は空です', hint: '繰り返しタスクを登録しましょう' },
    project:   { icon: '📁', message: 'Project は空です', hint: '複数ステップのプロジェクトを追加しましょう' },
    reference: { icon: '📎', message: 'Reference は空です', hint: '参照資料・情報をここに整理しましょう' },
  };

  const { icon, message, hint } = messages[gtd] ?? {
    icon: '📋', message: 'タスクはありません', hint: 'タスクを追加しましょう',
  };

  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <div className="empty-state-message">{message}</div>
      <div className="empty-state-hint">{hint}</div>
    </div>
  );
}

export default function List({ gtd, onCategoryChange, getCache, setCache, invalidateCache }: Props) {
  const navigate = useNavigate();
  const isMobile = useMobileBreakpoint();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [childTasks, setChildTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [recurNotice, setRecurNotice] = useState<string | null>(null);
  const recurNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchTasks = useCallback(async () => {
    const cached = getCache(gtd);
    if (cached !== null) {
      setTasks(cached.tasks);
      setChildTasks(cached.childTasks ?? []);
      onCategoryChange(cached.byCategory);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result: TaskListResponse = await api.listTasks(gtd);
      setCache(gtd, result);
      setTasks(result.tasks);
      setChildTasks(result.childTasks ?? []);
      onCategoryChange(result.byCategory);
    } catch (err) {
      setError(err instanceof Error ? err.message : '取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [gtd, onCategoryChange, getCache, setCache]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // カテゴリ切り替え時はソートをリセット
  useEffect(() => {
    setSortKey(null);
  }, [gtd]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  async function handleAdd(title: string, gtdCategory: string) {
    await api.addTask({ title, gtdCategory });
    invalidateCache(gtdCategory as GtdKey);
    invalidateCache(gtd);
    await fetchTasks();
  }

  /**
   * recur再作成の通知を表示する（#1672）
   * done() が失敗した場合は呼び出し元で catch されるため、この関数自体は
   * 成功パスからのみ呼ばれる想定（異常系での誤発火を避ける）。
   */
  function showRecurNotice(recurCreated?: RecurCreated[]) {
    const message = formatRecurNotice(recurCreated);
    if (!message) return;
    if (recurNoticeTimerRef.current) clearTimeout(recurNoticeTimerRef.current);
    setRecurNotice(message);
    recurNoticeTimerRef.current = setTimeout(() => setRecurNotice(null), RECUR_NOTICE_DURATION_MS);
  }

  useEffect(() => {
    return () => {
      if (recurNoticeTimerRef.current) clearTimeout(recurNoticeTimerRef.current);
    };
  }, []);

  async function handleDone(number: number) {
    const result = await api.doneTask(number);
    invalidateCache(gtd);
    await fetchTasks();
    showRecurNotice(result.recurCreated);
  }

  async function handleMove(number: number, targetGtd: string) {
    await api.moveTask(number, targetGtd);
    invalidateCache(gtd);
    invalidateCache(targetGtd as GtdKey);
    await fetchTasks();
  }

  async function handleRefresh() {
    invalidateCache(gtd);
    await fetchTasks();
  }

  function handleDetail(task: Task) {
    setDetailTask(task);
  }

  const displayName = GTD_DISPLAY[gtd] ?? gtd;
  const isProjectView = gtd === 'project';
  const tip = useMemo(() => getRandomTip(gtd), [gtd]);

  const displayTasks = useMemo(
    () => sortKey ? sortTasks(tasks, sortKey, sortDir) : tasks,
    [tasks, sortKey, sortDir]
  );

  const projectTree = isProjectView ? buildProjectTree(displayTasks, childTasks) : [];

  function thProps(key: SortKey, extraClass?: string) {
    const active = sortKey === key;
    const base = extraClass ? `${extraClass} ` : '';
    return {
      className: `${base}th-sortable${active ? ' th-sorted' : ''}`,
      onClick: () => handleSort(key),
    };
  }

  function sortIcon(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="sort-icon">{sortDir === 'asc' ? '▲' : '▼'}</span>;
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="breadcrumb">
          <span className="breadcrumb-sep">Lists</span>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">{displayName}</span>
        </h2>
        {!loading && (
          <span className={`badge gtd-${gtd}`} style={{ fontSize: 13 }}>
            {tasks.length}
          </span>
        )}
        {tip && <span className="gtd-tip">{tip}</span>}
        {/* PC専用の追加ボタン（モバイルはFABを使用） */}
        {!isMobile && (
          <div className="page-header-actions">
            <button
              className="btn mobile-only"
              onClick={() => setAddFormOpen(v => !v)}
              aria-label="タスクを追加"
              title="タスクを追加"
            >✚</button>
          </div>
        )}
      </div>

      {/* PC専用の追加フォーム行 */}
      {!isMobile && (
        <div className={`add-task-row${addFormOpen ? ' open' : ''}`}>
          <AddTaskForm
            onAdd={async (...args) => { await handleAdd(...args); setAddFormOpen(false); }}
            onRefresh={handleRefresh}
            onSearch={() => navigate('/search')}
          />
        </div>
      )}

      {recurNotice && (
        <div className="recur-notice" role="status">{recurNotice}</div>
      )}

      {loading && tasks.length === 0 && <div className="loading">読み込み中...</div>}

      {!loading && error && (
        <div className="error">エラー: {error}</div>
      )}

      {/* 空状態オンボーディング */}
      {!loading && !error && tasks.length === 0 && (
        <EmptyState gtd={gtd} />
      )}

      {/* モバイル: カード型リスト（日付セクション分割） */}
      {!error && isMobile && !isProjectView && tasks.length > 0 && (
        <MobileTaskList
          tasks={displayTasks}
          onDone={handleDone}
          onDetail={handleDetail}
          gtd={gtd}
        />
      )}

      {/* PC: project カテゴリ ツリー表示 */}
      {!error && !isMobile && isProjectView && tasks.length > 0 && (
        <table>
          <thead>
            <tr>
              <th {...thProps('number', 'th-num')}># {sortIcon('number')}</th>
              <th {...thProps('title')}>タイトル {sortIcon('title')}</th>
              <th {...thProps('priority', 'th-priority')}>優先度 {sortIcon('priority')}</th>
              <th {...thProps('due', 'th-due')}>期日 {sortIcon('due')}</th>
              <th className="th-actions"></th>
            </tr>
          </thead>
          <tbody>
            {projectTree.map(({ parent, children }) => (
              <ProjectTreeRow
                key={parent.number}
                parent={parent}
                children={children}
                onDone={handleDone}
                onMove={handleMove}
                onRefresh={handleRefresh}
                onDetail={handleDetail}
                onRecurNotice={showRecurNotice}
              />
            ))}
          </tbody>
        </table>
      )}

      {/* PC: その他カテゴリ フラット表示 */}
      {!error && !isMobile && !isProjectView && tasks.length > 0 && (
        <table>
          <thead>
            <tr>
              <th {...thProps('number', 'th-num')}># {sortIcon('number')}</th>
              <th {...thProps('title')}>タイトル {sortIcon('title')}</th>
              <th {...thProps('priority', 'th-priority')}>優先度 {sortIcon('priority')}</th>
              <th {...thProps('due', 'th-due')}>期日 {sortIcon('due')}</th>
              <th className="th-actions"></th>
            </tr>
          </thead>
          <tbody>
            {displayTasks.map((task) => (
              <TaskRow
                key={task.number}
                task={task}
                onDone={handleDone}
                onMove={handleMove}
                onDetail={handleDetail}
                onSaved={handleRefresh}
              />
            ))}
          </tbody>
        </table>
      )}

      {/* モバイル: project カテゴリはツリー表示（将来対応）→ 現状はフラット */}
      {!error && isMobile && isProjectView && tasks.length > 0 && (
        <MobileTaskList
          tasks={displayTasks}
          onDone={handleDone}
          onDetail={handleDetail}
          gtd={gtd}
        />
      )}

      {detailTask !== null && (
        <TaskDetailModal
          task={detailTask}
          onClose={() => setDetailTask(null)}
          onSaved={handleRefresh}
        />
      )}
    </div>
  );
}
