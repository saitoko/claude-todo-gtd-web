import { useState, useEffect, useCallback, useMemo } from 'react';
import { api, type Task, type TaskListResponse, GTD_DISPLAY, type GtdKey } from '../lib/api';
import { getRandomTip } from '../lib/gtd-tips';
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

type SortKey = 'number' | 'title' | 'priority' | 'due';

const GTD_ORDER: Record<string, number> = {
  inbox: 0, next: 1, waiting: 2, someday: 3, routine: 4,
};

const PRIORITY_ORDER: Record<string, number> = { p1: 1, p2: 2, p3: 3 };

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

function sortTasks(tasks: Task[], key: SortKey, dir: 'asc' | 'desc'): Task[] {
  return [...tasks].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case 'number':
        cmp = a.number - b.number;
        break;
      case 'title':
        cmp = a.title.localeCompare(b.title, 'ja');
        break;
      case 'priority':
        cmp = (PRIORITY_ORDER[a.priority ?? ''] ?? 99) - (PRIORITY_ORDER[b.priority ?? ''] ?? 99);
        break;
      case 'due': {
        const da = a.due ?? '9999-99-99';
        const db = b.due ?? '9999-99-99';
        cmp = da < db ? -1 : da > db ? 1 : 0;
        break;
      }
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

export default function List({ gtd, onCategoryChange, getCache, setCache, invalidateCache }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [childTasks, setChildTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailNumber, setDetailNumber] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

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
            {tasks.length} 件
          </span>
        )}
        {tip && <span className="gtd-tip">{tip}</span>}
        <button
          className="btn btn-refresh"
          onClick={handleRefresh}
          disabled={loading}
          aria-label="リストを更新"
          title="リストを更新"
        >↻</button>
      </div>

      <AddTaskForm onAdd={handleAdd} />

      {loading && <div className="loading">読み込み中...</div>}

      {!loading && error && (
        <div className="error">エラー: {error}</div>
      )}

      {!loading && !error && tasks.length === 0 && (
        <div className="empty">タスクはありません</div>
      )}

      {/* project カテゴリ: ツリー表示 */}
      {!loading && !error && isProjectView && tasks.length > 0 && (
        <table>
          <thead>
            <tr>
              <th style={{ width: 60 }} {...thProps('number')}># {sortIcon('number')}</th>
              <th {...thProps('title')}>タイトル {sortIcon('title')}</th>
              <th style={{ width: 60 }} {...thProps('priority')}>優先度 {sortIcon('priority')}</th>
              <th style={{ width: 100 }} {...thProps('due')}>期日 {sortIcon('due')}</th>
              <th style={{ width: 280 }}>操作</th>
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
      {!loading && !error && !isProjectView && tasks.length > 0 && (
        <table>
          <thead>
            <tr>
              <th style={{ width: 60 }} {...thProps('number')}># {sortIcon('number')}</th>
              <th {...thProps('title')}>タイトル {sortIcon('title')}</th>
              <th style={{ width: 60 }} {...thProps('priority')}>優先度 {sortIcon('priority')}</th>
              <th style={{ width: 100 }} {...thProps('due')}>期日 {sortIcon('due')}</th>
              <th style={{ width: 280 }}>操作</th>
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
