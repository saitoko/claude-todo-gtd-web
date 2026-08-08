import { useState, useEffect } from 'react';
import { MOVABLE_GTD_KEYS, GTD_DISPLAY, api, type AddTaskInput } from '../lib/api';

interface Props {
  onAdd: (input: AddTaskInput) => Promise<void>;
  onRefresh?: () => Promise<void>;
  onSearch?: () => void;
}

/**
 * タスク追加フォーム。
 *
 * Issue #1656: 収集フリクション低減のため、due/priority/ctx は既定で折りたたんだ
 * 「▸ 詳細」欄に置く。タイトル入力＋GTDカテゴリ選択＋送信という既存の最速フローは
 * 変更しない。ctx は EditForm.tsx と同じパターン（api.listLabels() で取得した
 * `@` 始まりの既存ラベルのみをチェックボックスで選択）を採用し、自由入力での
 * 新規ctx作成はスコープ外とする（未存在ラベルを渡した場合の挙動が未検証のため）。
 */
export default function AddTaskForm({ onAdd, onRefresh, onSearch }: Props) {
  const [title, setTitle] = useState('');
  const [gtdCategory, setGtdCategory] = useState('inbox');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── 詳細入力欄（既定で折りたたみ） ──
  const [showDetails, setShowDetails] = useState(false);
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState('');
  const [ctxSelected, setCtxSelected] = useState<string[]>([]);
  const [availableCtx, setAvailableCtx] = useState<string[]>([]);

  useEffect(() => {
    api.listLabels().then(({ labels }) => {
      setAvailableCtx(labels.filter((l) => l.name.startsWith('@')).map((l) => l.name));
    }).catch(() => {
      // ctx候補取得失敗は無視（EditFormと同じ方針。ctx欄が非表示になるだけで送信自体は可能）
    });
  }, []);

  function toggleCtx(ctx: string) {
    setCtxSelected((prev) => (prev.includes(ctx) ? prev.filter((c) => c !== ctx) : [...prev, ctx]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = title.trim();
    if (!trimmed) {
      setError('タイトルを入力してください');
      return;
    }

    setBusy(true);
    try {
      await onAdd({
        title: trimmed,
        gtdCategory,
        due: due || undefined,
        priority: priority || undefined,
        ctx: ctxSelected.length > 0 ? ctxSelected : undefined,
      });
      setTitle('');
      setDue('');
      setPriority('');
      setCtxSelected([]);
      // gtdCategory・showDetails はリセットしない（同じ条件で続けて追加しやすくする）
    } catch (err) {
      setError(err instanceof Error ? err.message : '追加に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="add-task-form" onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="新しいタスクのタイトル..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={busy}
      />
      <div className="add-task-controls">
        <select
          value={gtdCategory}
          onChange={(e) => setGtdCategory(e.target.value)}
          disabled={busy}
        >
          {MOVABLE_GTD_KEYS.map((k) => (
            <option key={k} value={k}>{GTD_DISPLAY[k]}</option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-ghost add-task-details-toggle"
          onClick={() => setShowDetails((v) => !v)}
          disabled={busy}
          title="詳細（期日・優先度・コンテキスト）"
        >
          {showDetails ? '▾ 詳細' : '▸ 詳細'}
        </button>
        <button type="submit" className="btn btn-icon" disabled={busy || !title.trim()} title="追加">
          {busy ? '⏳' : '➕'}
        </button>
        {onRefresh && (
          <button type="button" className="btn btn-icon" onClick={onRefresh} disabled={busy} title="更新">
            🔄
          </button>
        )}
        {onSearch && (
          <button type="button" className="btn btn-icon" onClick={onSearch} style={{ marginLeft: 'auto' }} title="検索">
            🔍
          </button>
        )}
      </div>

      {showDetails && (
        <div className="add-task-details">
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            disabled={busy}
            aria-label="優先度"
          >
            <option value="">優先度なし</option>
            <option value="p1">p1（高）</option>
            <option value="p2">p2（中）</option>
            <option value="p3">p3（低）</option>
          </select>
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            disabled={busy}
            aria-label="期日"
          />
          {availableCtx.length > 0 && (
            <div className="add-task-ctx-chips">
              {availableCtx.map((ctx) => (
                <label key={ctx} className="edit-form-tag-item">
                  <input
                    type="checkbox"
                    checked={ctxSelected.includes(ctx)}
                    onChange={() => toggleCtx(ctx)}
                    disabled={busy}
                  />
                  {ctx}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <span className="error" style={{ fontSize: 12 }}>{error}</span>}
    </form>
  );
}
