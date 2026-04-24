import { useState, useEffect, useCallback } from 'react';
import { api, type Task, type TaskListResponse, GTD_DISPLAY, type GtdKey } from '../lib/api';
import TaskRow from '../components/TaskRow';
import AddTaskForm from '../components/AddTaskForm';

interface Props {
  gtd: GtdKey;
  onCategoryChange: (byCategory: Record<string, number>) => void;
}

export default function List({ gtd, onCategoryChange }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result: TaskListResponse = await api.listTasks(gtd);
      setTasks(result.tasks);
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

  const displayName = GTD_DISPLAY[gtd] ?? gtd;

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

      {!loading && !error && tasks.length > 0 && (
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
