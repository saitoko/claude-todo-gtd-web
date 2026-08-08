import React, { useState, useEffect, useMemo } from 'react';
import { api, type Task, type TaskListResponse, type GtdKey } from '../lib/api';
import {
  getTodayJST,
  getCloseCandidatesByDue,
  getCloseCandidatesOld,
  getCategoryReviewCandidates,
} from '../lib/filterTasks';
import { sortTasks } from '../lib/sortTasks';
import TaskRow from '../components/TaskRow';
import TaskDetailModal from '../components/TaskDetailModal';

interface Props {
  getCache: (gtd: GtdKey) => TaskListResponse | null;
  setCache: (gtd: GtdKey, data: TaskListResponse) => void;
  invalidateCache: (gtd?: GtdKey) => void;
}

interface FetchState {
  tasks: Task[];
  loading: boolean;
  error: string | null;
}

const INITIAL_FETCH_STATE: FetchState = { tasks: [], loading: true, error: null };
const SECTION_LIMIT = 10;

export default function Insight({ getCache, setCache, invalidateCache }: Props) {
  const [nextState, setNextState] = useState<FetchState>(INITIAL_FETCH_STATE);
  const [waitingState, setWaitingState] = useState<FetchState>(INITIAL_FETCH_STATE);
  const [somedayState, setSomedayState] = useState<FetchState>(INITIAL_FETCH_STATE);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // セクションごとの件数展開状態（キー: セクション名、true = 全件表示）
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  // セクションごとの折り畳み状態（キー: セクション名、true = 折り畳み中）
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  function expandSection(key: string) {
    setExpandedSections((prev) => ({ ...prev, [key]: true }));
  }

  function isSectionExpanded(key: string) {
    return expandedSections[key] === true;
  }

  function toggleSection(key: string) {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function isSectionCollapsed(key: string) {
    return collapsedSections[key] === true;
  }

  function sliceSection(tasks: Task[], key: string) {
    return isSectionExpanded(key) ? tasks : tasks.slice(0, SECTION_LIMIT);
  }

  function hiddenCount(tasks: Task[], key: string) {
    return isSectionExpanded(key) ? 0 : Math.max(0, tasks.length - SECTION_LIMIT);
  }

  async function fetchCategory(
    gtd: GtdKey,
    setState: React.Dispatch<React.SetStateAction<FetchState>>
  ) {
    const cached = getCache(gtd);
    if (cached) {
      setState({ tasks: cached.tasks, loading: false, error: null });
      return;
    }
    try {
      const res = await api.listTasks(gtd);
      setCache(gtd, res);
      setState({ tasks: res.tasks, loading: false, error: null });
    } catch (err: unknown) {
      setState({
        tasks: [],
        loading: false,
        error: err instanceof Error ? err.message : `${gtd} の取得に失敗しました`,
      });
    }
  }

  useEffect(() => {
    setNextState(INITIAL_FETCH_STATE);
    setWaitingState(INITIAL_FETCH_STATE);
    setSomedayState(INITIAL_FETCH_STATE);
    setExpandedSections({});
    setCollapsedSections({});

    // 3カテゴリを並列取得
    fetchCategory('next', setNextState);
    fetchCategory('waiting', setWaitingState);
    fetchCategory('someday', setSomedayState);
  // refreshKey が変わったら再フェッチ
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const today = getTodayJST();

  // ─── Close 候補（due 超過 next）
  const closeCandidatesByDue = useMemo(
    () => getCloseCandidatesByDue(nextState.tasks, today),
    [nextState.tasks, today]
  );

  // ─── Close 候補（古い next: updatedAt 30日以上前 or フォールバック）
  const allOldCandidates = useMemo(
    () => getCloseCandidatesOld(nextState.tasks),
    [nextState.tasks]
  );

  // ─── カテゴリ見直し候補
  const categoryReview = useMemo(
    () =>
      getCategoryReviewCandidates(waitingState.tasks, somedayState.tasks, today),
    [waitingState.tasks, somedayState.tasks, today]
  );

  // waiting: due ありを先頭に表示
  const waitingOverdueSorted = useMemo(
    () => sortTasks(categoryReview.waitingOverdue, 'due', 'asc'),
    [categoryReview.waitingOverdue]
  );
  const waitingNoDueSorted = useMemo(
    () => sortTasks(categoryReview.waitingNoDue, 'number', 'asc'),
    [categoryReview.waitingNoDue]
  );

  async function handleDone(number: number, gtdCategory: string) {
    await api.doneTask(number);
    invalidateCache(gtdCategory as GtdKey);
    setRefreshKey((k) => k + 1);
  }

  async function handleMove(number: number, targetGtd: string, currentGtd: string) {
    await api.moveTask(number, targetGtd);
    invalidateCache(currentGtd as GtdKey);
    invalidateCache(targetGtd as GtdKey);
    setRefreshKey((k) => k + 1);
  }

  function handleEdit(gtdCategory: string) {
    invalidateCache(gtdCategory as GtdKey);
    setRefreshKey((k) => k + 1);
  }

  const isLoading =
    nextState.loading || waitingState.loading || somedayState.loading;

  const errors = [nextState.error, waitingState.error, somedayState.error].filter(Boolean);

  return (
    <div className="insight-page list-page">
      <div className="page-header">
        <h2>💡 Insight — 見直し</h2>
        {!isLoading && (
          <span className="gtd-tip">
            Close 候補 {closeCandidatesByDue.length + allOldCandidates.length} 件 /
            見直し候補 {categoryReview.waitingOverdue.length + categoryReview.waitingNoDue.length + categoryReview.someday.length} 件
          </span>
        )}
      </div>

      {errors.length > 0 && (
        <div className="search-error-banner">
          一部カテゴリの取得に失敗しました: {errors.join(' / ')}
        </div>
      )}

      {isLoading && <div className="loading">読み込み中...</div>}

      {!isLoading && (
        <>
          {/* ─── セクション1: Close 候補（due 超過） ─── */}
          <section className="insight-section">
            <button
              className="insight-section-header"
              onClick={() => toggleSection('closeDue')}
              aria-expanded={!isSectionCollapsed('closeDue')}
            >
              <span className={`insight-collapse-icon${isSectionCollapsed('closeDue') ? ' collapsed' : ''}`}>▼</span>
              <span className="insight-section-title">Close 候補（期日超過）</span>
              <span className="nav-badge">{closeCandidatesByDue.length}</span>
            </button>
            {!isSectionCollapsed('closeDue') && (
              closeCandidatesByDue.length === 0 ? (
                <div className="insight-empty">該当なし</div>
              ) : (
                <>
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
                      {sliceSection(closeCandidatesByDue, 'closeDue').map((task) => (
                        <TaskRow
                          key={task.number}
                          task={task}
                          onDone={() => handleDone(task.number, task.gtdCategory)}
                          onMove={(num, targetGtd) => handleMove(num, targetGtd, task.gtdCategory)}
                          onDetail={(t) => setActiveTask(t)}
                          onSaved={() => handleEdit(task.gtdCategory)}
                        />
                      ))}
                    </tbody>
                  </table>
                  {hiddenCount(closeCandidatesByDue, 'closeDue') > 0 && (
                    <div className="insight-expand">
                      <button className="btn" onClick={() => expandSection('closeDue')}>
                        他 {hiddenCount(closeCandidatesByDue, 'closeDue')} 件を表示
                      </button>
                    </div>
                  )}
                </>
              )
            )}
          </section>

          {/* ─── セクション2: Close 候補（長期放置） ─── */}
          <section className="insight-section">
            <button
              className="insight-section-header"
              onClick={() => toggleSection('closeOld')}
              aria-expanded={!isSectionCollapsed('closeOld')}
            >
              <span className={`insight-collapse-icon${isSectionCollapsed('closeOld') ? ' collapsed' : ''}`}>▼</span>
              <span className="insight-section-title">⏱ Close 候補（30日以上更新なし）</span>
              <span className="nav-badge">{allOldCandidates.length}</span>
            </button>
            {!isSectionCollapsed('closeOld') && (
              allOldCandidates.length === 0 ? (
                <div className="insight-empty">該当なし</div>
              ) : (
                <>
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
                      {sliceSection(allOldCandidates, 'closeOld').map((task) => (
                        <TaskRow
                          key={task.number}
                          task={task}
                          onDone={() => handleDone(task.number, task.gtdCategory)}
                          onMove={(num, targetGtd) => handleMove(num, targetGtd, task.gtdCategory)}
                          onDetail={(t) => setActiveTask(t)}
                          onSaved={() => handleEdit(task.gtdCategory)}
                        />
                      ))}
                    </tbody>
                  </table>
                  {hiddenCount(allOldCandidates, 'closeOld') > 0 && (
                    <div className="insight-expand">
                      <button className="btn" onClick={() => expandSection('closeOld')}>
                        他 {hiddenCount(allOldCandidates, 'closeOld')} 件を表示
                      </button>
                    </div>
                  )}
                </>
              )
            )}
          </section>

          {/* ─── セクション3: カテゴリ見直し候補（waiting 超過） ─── */}
          <section className="insight-section">
            <button
              className="insight-section-header"
              onClick={() => toggleSection('waitingOverdue')}
              aria-expanded={!isSectionCollapsed('waitingOverdue')}
            >
              <span className={`insight-collapse-icon${isSectionCollapsed('waitingOverdue') ? ' collapsed' : ''}`}>▼</span>
              <span className="insight-section-title">⏳ カテゴリ見直し（Waiting 期日超過）</span>
              <span className="nav-badge">{categoryReview.waitingOverdue.length}</span>
            </button>
            {!isSectionCollapsed('waitingOverdue') && (
              categoryReview.waitingOverdue.length === 0 ? (
                <div className="insight-empty">該当なし</div>
              ) : (
                <>
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
                      {sliceSection(waitingOverdueSorted, 'waitingOverdue').map((task) => (
                        <TaskRow
                          key={task.number}
                          task={task}
                          onDone={() => handleDone(task.number, task.gtdCategory)}
                          onMove={(num, targetGtd) => handleMove(num, targetGtd, task.gtdCategory)}
                          onDetail={(t) => setActiveTask(t)}
                          onSaved={() => handleEdit(task.gtdCategory)}
                        />
                      ))}
                    </tbody>
                  </table>
                  {hiddenCount(waitingOverdueSorted, 'waitingOverdue') > 0 && (
                    <div className="insight-expand">
                      <button className="btn" onClick={() => expandSection('waitingOverdue')}>
                        他 {hiddenCount(waitingOverdueSorted, 'waitingOverdue')} 件を表示
                      </button>
                    </div>
                  )}
                </>
              )
            )}
          </section>

          {/* ─── セクション4: カテゴリ見直し候補（waiting due なし） ─── */}
          <section className="insight-section">
            <button
              className="insight-section-header"
              onClick={() => toggleSection('waitingNoDue')}
              aria-expanded={!isSectionCollapsed('waitingNoDue')}
            >
              <span className={`insight-collapse-icon${isSectionCollapsed('waitingNoDue') ? ' collapsed' : ''}`}>▼</span>
              <span className="insight-section-title">⏳ カテゴリ見直し（Waiting 期日なし）</span>
              <span className="nav-badge">{categoryReview.waitingNoDue.length}</span>
            </button>
            {!isSectionCollapsed('waitingNoDue') && (
              categoryReview.waitingNoDue.length === 0 ? (
                <div className="insight-empty">該当なし</div>
              ) : (
                <>
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
                      {sliceSection(waitingNoDueSorted, 'waitingNoDue').map((task) => (
                        <TaskRow
                          key={task.number}
                          task={task}
                          onDone={() => handleDone(task.number, task.gtdCategory)}
                          onMove={(num, targetGtd) => handleMove(num, targetGtd, task.gtdCategory)}
                          onDetail={(t) => setActiveTask(t)}
                          onSaved={() => handleEdit(task.gtdCategory)}
                        />
                      ))}
                    </tbody>
                  </table>
                  {hiddenCount(waitingNoDueSorted, 'waitingNoDue') > 0 && (
                    <div className="insight-expand">
                      <button className="btn" onClick={() => expandSection('waitingNoDue')}>
                        他 {hiddenCount(waitingNoDueSorted, 'waitingNoDue')} 件を表示
                      </button>
                    </div>
                  )}
                </>
              )
            )}
          </section>

          {/* ─── セクション5: カテゴリ見直し候補（someday 全件） ─── */}
          <section className="insight-section">
            <button
              className="insight-section-header"
              onClick={() => toggleSection('someday')}
              aria-expanded={!isSectionCollapsed('someday')}
            >
              <span className={`insight-collapse-icon${isSectionCollapsed('someday') ? ' collapsed' : ''}`}>▼</span>
              <span className="insight-section-title">🌈 カテゴリ見直し（Someday 全件）</span>
              <span className="nav-badge">{categoryReview.someday.length}</span>
            </button>
            {!isSectionCollapsed('someday') && (
              categoryReview.someday.length === 0 ? (
                <div className="insight-empty">該当なし</div>
              ) : (
                <>
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
                      {sliceSection(categoryReview.someday, 'someday').map((task) => (
                        <TaskRow
                          key={task.number}
                          task={task}
                          onDone={() => handleDone(task.number, task.gtdCategory)}
                          onMove={(num, targetGtd) => handleMove(num, targetGtd, task.gtdCategory)}
                          onDetail={(t) => setActiveTask(t)}
                          onSaved={() => handleEdit(task.gtdCategory)}
                        />
                      ))}
                    </tbody>
                  </table>
                  {hiddenCount(categoryReview.someday, 'someday') > 0 && (
                    <div className="insight-expand">
                      <button className="btn" onClick={() => expandSection('someday')}>
                        他 {hiddenCount(categoryReview.someday, 'someday')} 件を表示
                      </button>
                    </div>
                  )}
                </>
              )
            )}
          </section>
        </>
      )}

      {activeTask !== null && (
        <TaskDetailModal
          task={activeTask}
          onClose={() => setActiveTask(null)}
          onSaved={() => { invalidateCache(); setRefreshKey((k) => k + 1); }}
          onMove={(number, targetGtd) => handleMove(number, targetGtd, activeTask.gtdCategory)}
        />
      )}
    </div>
  );
}
