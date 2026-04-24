import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Task, type TaskListResponse, GTD_DISPLAY, type GtdKey } from '../lib/api';
import { getRandomTip } from '../lib/gtd-tips';
import { sortTasks, type SortKey } from '../lib/sortTasks';
import TaskRow from '../components/TaskRow';
import ProjectTreeRow from '../components/ProjectTreeRow';
import AddTaskForm from '../components/AddTaskForm';
import TaskDetailModal from '../components/TaskDetailModal';

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

export default function List({ gtd, onCategoryChange, getCache, setCache, invalidateCache }: Props) {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [childTasks, setChildTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailNumber, setDetailNumber] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [addFormOpen, setAddFormOpen] = useState(false);

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

  async function handleDone(number: number) {
    await api.doneTask(number);
    invalidateCache(gtd);
    await fetchTasks();
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

  function handleDetail(number: number) {
    setDetailNumber(number);
  }

  const displayName = GTD_DISPLAY[gtd] ?? gtd;
  const isProjectView = gtd === 'project';
  const tip = useMemo(() => getRandomTip(gtd), [gtd]);

  const displayTasks = useMemo(
    () => sortKey ? sortTasks(tasks, sortKey, sortDir) : tasks,
    [tasks, sortKey, sortDir]
  );

  const projectTree = isProjectView ? buildProjectTree(displayTasks, childTasks) : [];

  function thProps(key: SortKey) {
    const active = sortKey === key;
    return {
      className: `th-sortable${active ? ' th-sorted' : ''}`,
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
        <h2>{displayName}</h2>
        {!loading && (
          <span className={`badge gtd-${gtd}`} style={{ fontSize: 13 }}>
            {tasks.length}
          </span>
        )}
        <div className="page-header-actions">
          <button
            className="btn mobile-only"
            onClick={() => navigate('/search')}
            aria-label="検索"
            title="検索"
          >🔍</button>
          <button
            className="btn mobile-only"
            onClick={() => setAddFormOpen(v => !v)}
            aria-label="タスクを追加"
            title="タスクを追加"
          >✚</button>
          <button
            className="btn btn-refresh"
            onClick={handleRefresh}
            disabled={loading}
            aria-label="リストを更新"
            title="リストを更新"
          >↻</button>
        </div>
        {tip && <span className="gtd-tip">{tip}</span>}
      </div>

      <div className={`add-task-row${addFormOpen ? ' open' : ''}`}>
        <AddTaskForm onAdd={async (...args) => { await handleAdd(...args); setAddFormOpen(false); }} />
      </div>

      {loading && tasks.length === 0 && <div className="loading">読み込み中...</div>}

      {!loading && error && (
        <div className="error">エラー: {error}</div>
      )}

      {!loading && !error && tasks.length === 0 && (
        <div className="empty">タスクはありません</div>
      )}

      {/* project カテゴリ: ツリー表示 */}
      {!error && isProjectView && tasks.length > 0 && (
        <table>
          <thead>
            <tr>
              <th style={{ width: 60 }} {...thProps('number')}># {sortIcon('number')}</th>
              <th {...thProps('title')}>タイトル {sortIcon('title')}</th>
              <th style={{ width: 80 }} {...thProps('priority')}>優先度 {sortIcon('priority')}</th>
              <th style={{ width: 100 }} {...thProps('due')}>期日 {sortIcon('due')}</th>
              <th style={{ width: 190 }}>操作</th>
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
              />
            ))}
          </tbody>
        </table>
      )}

      {/* その他カテゴリ: フラット表示 */}
      {!error && !isProjectView && tasks.length > 0 && (
        <table>
          <thead>
            <tr>
              <th style={{ width: 60 }} {...thProps('number')}># {sortIcon('number')}</th>
              <th {...thProps('title')}>タイトル {sortIcon('title')}</th>
              <th style={{ width: 80 }} {...thProps('priority')}>優先度 {sortIcon('priority')}</th>
              <th style={{ width: 100 }} {...thProps('due')}>期日 {sortIcon('due')}</th>
              <th style={{ width: 190 }}>操作</th>
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
                onEdit={handleRefresh}
              />
            ))}
          </tbody>
        </table>
      )}

      {detailNumber !== null && (
        <TaskDetailModal
          taskNumber={detailNumber}
          onClose={() => setDetailNumber(null)}
        />
      )}
    </div>
  );
}
