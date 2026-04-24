import { useState, useEffect, useCallback } from 'react';
import { api, type Task, type TaskListResponse, GTD_DISPLAY, type GtdKey } from '../lib/api';
import TaskRow from '../components/TaskRow';
import ProjectTreeRow from '../components/ProjectTreeRow';
import AddTaskForm from '../components/AddTaskForm';

interface Props {
  gtd: GtdKey;
  onCategoryChange: (byCategory: Record<string, number>) => void;
}

// GTD カテゴリの並び順（子タスクのソートに使用）
const GTD_ORDER: Record<string, number> = {
  inbox: 0,
  next: 1,
  waiting: 2,
  someday: 3,
  routine: 4,
};

/**
 * project カテゴリ用ツリーデータを構築する
 * @param projectTasks - project ラベルの Issue（親）
 * @param childTasks   - parentProject を持つ Issue（子）
 * @returns 各親と紐づく子タスクリスト
 */
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
        // 同カテゴリは番号降順
        return b.number - a.number;
      });
    return { parent, children };
  });
}

export default function List({ gtd, onCategoryChange }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [childTasks, setChildTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result: TaskListResponse = await api.listTasks(gtd);
      setTasks(result.tasks);
      setChildTasks(result.childTasks ?? []);
      onCategoryChange(result.byCategory);
    } catch (err) {
      setError(err instanceof Error ? err.message : '取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [gtd, onCategoryChange]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  async function handleAdd(title: string, gtdCategory: string) {
    await api.addTask({ title, gtdCategory });
    await fetchTasks();
  }

  async function handleDone(number: number) {
    await api.doneTask(number);
    await fetchTasks();
  }

  async function handleMove(number: number, targetGtd: string) {
    await api.moveTask(number, targetGtd);
    await fetchTasks();
  }

  async function handleRefresh() {
    await fetchTasks();
  }

  const displayName = GTD_DISPLAY[gtd] ?? gtd;
  const isProjectView = gtd === 'project';

  // ツリーデータ（project カテゴリのみ）
  const projectTree = isProjectView ? buildProjectTree(tasks, childTasks) : [];

  return (
    <div>
      <div className="page-header">
        <h2>{displayName}</h2>
        {!loading && (
          <span className="badge gtd-{gtd}" style={{ fontSize: 13 }}>
            {tasks.length} 件
          </span>
        )}
      </div>

      <AddTaskForm currentGtd={gtd} onAdd={handleAdd} />

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
              <th style={{ width: 60 }}>#</th>
              <th>タイトル</th>
              <th style={{ width: 60 }}>優先度</th>
              <th style={{ width: 100 }}>期日</th>
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
              />
            ))}
          </tbody>
        </table>
      )}

      {/* その他カテゴリ: 従来のフラット表示 */}
      {!loading && !error && !isProjectView && tasks.length > 0 && (
        <table>
          <thead>
            <tr>
              <th style={{ width: 60 }}>#</th>
              <th>タイトル</th>
              <th style={{ width: 60 }}>優先度</th>
              <th style={{ width: 100 }}>期日</th>
              <th style={{ width: 280 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <TaskRow
                key={task.number}
                task={task}
                onDone={handleDone}
                onMove={handleMove}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
