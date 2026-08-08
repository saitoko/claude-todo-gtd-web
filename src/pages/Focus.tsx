import { useState, useEffect, useMemo } from 'react';
import { api, type Task, type TaskListResponse, type GtdKey } from '../lib/api';
import {
  getTodayJST,
  extractContextLabels,
  filterByContext,
  filterFocusTasks,
} from '../lib/filterTasks';
import TaskRow from '../components/TaskRow';
import TaskDetailModal from '../components/TaskDetailModal';
import type { ToastInput } from '../lib/useToast';

// 完了Undoトーストの表示時間（ミリ秒）。List.tsx と同じ値（#1656）。
const UNDO_TOAST_DURATION_MS = 6000;

interface Props {
  getCache: (gtd: GtdKey) => TaskListResponse | null;
  setCache: (gtd: GtdKey, data: TaskListResponse) => void;
  invalidateCache: (gtd?: GtdKey) => void;
  pushToast: (input: ToastInput) => string;
}

export default function Focus({ getCache, setCache, invalidateCache, pushToast }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedContext, setSelectedContext] = useState<string | null>(null);
  const [showNoContext, setShowNoContext] = useState(true);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const cached = getCache('next');
    if (cached) {
      setTasks(cached.tasks);
      setLoading(false);
      return;
    }

    api.listTasks('next')
      .then((res) => {
        if (cancelled) return;
        setCache('next', res);
        setTasks(res.tasks);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'タスクの取得に失敗しました');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  // refreshKey が変わったら再フェッチ
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const today = getTodayJST();

  // next タスクから @ラベルを収集してコンテキストボタンを生成
  const contextLabels = useMemo(() => extractContextLabels(tasks), [tasks]);

  // コンテキスト選択後にフィルタ
  const contextFiltered = useMemo(
    () => filterByContext(tasks, selectedContext, showNoContext),
    [tasks, selectedContext, showNoContext]
  );

  // 今日期限 or p1/p2 のタスクに絞り込み
  const focusTasks = useMemo(
    () => filterFocusTasks(contextFiltered, today),
    [contextFiltered, today]
  );

  /** 完了Undo（#1656）。①元Issueをreopen ②recurCreatedNumberがあれば次周期Issueをclose */
  async function handleUndoDone(number: number, recurCreatedNumber: number | undefined) {
    try {
      const result = await api.undoDoneTask(number, recurCreatedNumber);
      invalidateCache('next');
      setRefreshKey((k) => k + 1);
      if (result.recurCloseFailed) {
        alert(`#${number} は元に戻しましたが、次周期タスク #${recurCreatedNumber} のクローズに失敗しました。手動で確認してください。`);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '元に戻す処理に失敗しました');
    }
  }

  async function handleDone(number: number) {
    const result = await api.doneTask(number);
    invalidateCache('next');
    setRefreshKey((k) => k + 1);

    const recur = (result.recurCreated ?? []).find((rc) => rc.number === number);
    pushToast({
      message: recur
        ? `#${number} を完了しました。次周期のタスク #${recur.newIssueNumber} を作成しました`
        : `#${number} を完了しました`,
      actionLabel: '元に戻す',
      onAction: () => handleUndoDone(number, recur?.newIssueNumber),
      durationMs: UNDO_TOAST_DURATION_MS,
    });
  }

  async function handleMove(number: number, targetGtd: string) {
    await api.moveTask(number, targetGtd);
    invalidateCache('next');
    invalidateCache(targetGtd as GtdKey);
    setRefreshKey((k) => k + 1);
  }

  function handleEdit() {
    invalidateCache('next');
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="focus-page list-page">
      <div className="page-header">
        <h2>🎯 Focus — 今やること</h2>
        {!loading && (
          <span className="gtd-tip">
            {focusTasks.length} 件
          </span>
        )}
      </div>

      {/* コンテキスト選択 */}
      {contextLabels.length > 0 && (
        <div className="focus-context-bar">
          <button
            className={`focus-context-btn${selectedContext === null ? ' active' : ''}`}
            onClick={() => setSelectedContext(null)}
          >
            すべて
          </button>
          {contextLabels.map((ctx) => (
            <button
              key={ctx}
              className={`focus-context-btn${selectedContext === ctx ? ' active' : ''}`}
              onClick={() => setSelectedContext(ctx)}
            >
              {ctx}
            </button>
          ))}
          {selectedContext !== null && (
            <label className="focus-nocontext-toggle">
              <input
                type="checkbox"
                checked={showNoContext}
                onChange={(e) => setShowNoContext(e.target.checked)}
              />
              コンテキスト未設定も表示
            </label>
          )}
        </div>
      )}

      {error && (
        <div className="search-error-banner">タスクの取得に失敗しました: {error}</div>
      )}

      {loading && <div className="loading">読み込み中...</div>}

      {!loading && !error && tasks.length === 0 && (
        <div className="empty">タスクはありません</div>
      )}

      {!loading && !error && tasks.length > 0 && focusTasks.length === 0 && (
        <div className="empty">
          {selectedContext !== null
            ? 'このコンテキストのタスクはありません'
            : '条件に一致するタスクはありません（今日期限 / p1 / p2）'}
        </div>
      )}

      {!loading && focusTasks.length > 0 && (
        <div className="task-list">
          <table>
            <thead>
              <tr>
                <th className="th-num">#</th>
                <th>タイトル</th>
                <th className="th-priority">優先度</th>
                <th className="th-due">期日</th>
                <th className="th-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {focusTasks.map((task) => (
                <TaskRow
                  key={task.number}
                  task={task}
                  onDone={() => handleDone(task.number)}
                  onMove={(num, targetGtd) => handleMove(num, targetGtd)}
                  onDetail={(t) => setActiveTask(t)}
                  onSaved={handleEdit}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTask !== null && (
        <TaskDetailModal
          task={activeTask}
          onClose={() => setActiveTask(null)}
          onSaved={() => { invalidateCache(); setRefreshKey((k) => k + 1); }}
          onMove={handleMove}
        />
      )}
    </div>
  );
}
