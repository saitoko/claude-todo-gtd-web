import { useState } from 'react';
import { MOVABLE_GTD_KEYS, GTD_DISPLAY } from '../lib/api';

interface Props {
  onAdd: (title: string, gtdCategory: string) => Promise<void>;
}

export default function AddTaskForm({ onAdd }: Props) {
  const [title, setTitle] = useState('');
  const [gtdCategory, setGtdCategory] = useState('inbox');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      await onAdd(trimmed, gtdCategory);
      setTitle('');
      // gtdCategory はリセットしない（同じカテゴリに続けて追加しやすくする）
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
      <select
        value={gtdCategory}
        onChange={(e) => setGtdCategory(e.target.value)}
        disabled={busy}
      >
        {MOVABLE_GTD_KEYS.map((k) => (
          <option key={k} value={k}>{GTD_DISPLAY[k]}</option>
        ))}
      </select>
      <button type="submit" className="btn btn-primary" disabled={busy || !title.trim()}>
        {busy ? '追加中...' : '追加'}
      </button>
      {error && <span className="error" style={{ fontSize: 12 }}>{error}</span>}
    </form>
  );
}
