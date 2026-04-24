import { useState, useEffect } from 'react';
import { api, type Task } from '../lib/api';

interface EditFormProps {
  task: Task;
  onSave: () => Promise<void>;
  onCancel: () => void;
}

/** body から制御行（due: / project:）を除いた表示用テキストを返す */
function stripControlLines(rawBody: string): string {
  return rawBody
    .split('\n')
    .filter((line) => !/^(due|project):\s*/i.test(line))
    .join('\n')
    .trim();
}

/** 表示用テキストに制御行を再付加して保存用 body を組み立てる */
function buildFinalBody(displayBody: string, rawBody: string, dueValue: string): string {
  const lines: string[] = [];
  const projectLine = rawBody.match(/^project:\s*.+$/m)?.[0];
  if (projectLine) lines.push(projectLine);
  if (dueValue) lines.push(`due: ${dueValue}`);
  const userText = displayBody.trim();
  if (userText) lines.push(userText);
  return lines.join('\n');
}

export default function EditForm({ task, onSave, onCancel }: EditFormProps) {
  const [title, setTitle] = useState(task.title);
  const [body, setBody] = useState(() => stripControlLines(task.body ?? ''));
  const [priority, setPriority] = useState(task.priority ?? '');
  const [due, setDue] = useState(task.due ?? '');
  const [tagLabels, setTagLabels] = useState<string[]>(
    task.labels.filter((l) => l.startsWith('@'))
  );
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.listLabels().then(({ labels }) => {
      setAvailableTags(
        labels.filter((l) => l.name.startsWith('@')).map((l) => l.name)
      );
    }).catch(() => {
      // タグ候補取得失敗は無視
    });
  }, []);

  function toggleTag(tag: string) {
    setTagLabels((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  async function handleSave() {
    if (title.trim() === '') {
      setError('タイトルは必須です');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const finalBody = buildFinalBody(body, task.body ?? '', due);

      // ラベル差分を計算
      const originalPriority = task.priority ?? '';
      const removeLabels: string[] = [];
      const addLabels: string[] = [];

      if (priority !== originalPriority) {
        if (originalPriority) removeLabels.push(originalPriority);
        if (priority) addLabels.push(priority);
      }

      const originalTags = task.labels.filter((l) => l.startsWith('@'));
      const tagToAdd = tagLabels.filter((t) => !originalTags.includes(t));
      const tagToRemove = originalTags.filter((t) => !tagLabels.includes(t));
      removeLabels.push(...tagToRemove);
      addLabels.push(...tagToAdd);

      // patch 構築（変更がないキーは含めない）
      const patch: {
        title?: string;
        body?: string;
        addLabels?: string[];
        removeLabels?: string[];
      } = {};

      if (title.trim() !== task.title) patch.title = title.trim();
      if (finalBody !== (task.body ?? '')) patch.body = finalBody;
      if (removeLabels.length > 0) patch.removeLabels = removeLabels;
      if (addLabels.length > 0) patch.addLabels = addLabels;

      // 変更なし → API を叩かずに閉じる
      if (Object.keys(patch).length === 0) {
        await onSave();
        return;
      }

      await api.updateTask(task.number, patch);
      await onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="edit-form">
      <div className="edit-form-field">
        <label>タイトル</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
        />
      </div>
      <div className="edit-form-field">
        <label>優先度</label>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          disabled={busy}
        >
          <option value="">なし</option>
          <option value="p1">p1（高）</option>
          <option value="p2">p2（中）</option>
          <option value="p3">p3（低）</option>
        </select>
      </div>
      <div className="edit-form-field">
        <label>期日</label>
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          disabled={busy}
        />
        {due && (
          <button
            type="button"
            className="btn"
            onClick={() => setDue('')}
            disabled={busy}
          >
            クリア
          </button>
        )}
      </div>
      {availableTags.length > 0 && (
        <div className="edit-form-field">
          <label>タグ</label>
          <div className="edit-form-tags">
            {availableTags.map((tag) => (
              <label key={tag} className="edit-form-tag-item">
                <input
                  type="checkbox"
                  checked={tagLabels.includes(tag)}
                  onChange={() => toggleTag(tag)}
                  disabled={busy}
                />
                {tag}
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="edit-form-field">
        <label>本文</label>
        <textarea
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={busy}
        />
      </div>
      {error && <div className="edit-form-error">{error}</div>}
      <div className="edit-form-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSave}
          disabled={busy}
        >
          保存
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onCancel}
          disabled={busy}
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
