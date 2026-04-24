import { type Task } from './api';

export type SortKey = 'number' | 'title' | 'priority' | 'due';

const PRIORITY_ORDER: Record<string, number> = { p1: 1, p2: 2, p3: 3 };

export function sortTasks(tasks: Task[], key: SortKey, dir: 'asc' | 'desc'): Task[] {
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
