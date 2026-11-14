import type { SafeSessionUser } from '@/server/types';

export type AdminUser = SafeSessionUser & {
  createdAt?: string;
  lastLoginAt?: string | null;
  referredByCode?: string | null;
};

export function formatRub(value: number): string {
  return `${value.toLocaleString('ru-RU')} ₽`;
}

/** Quoting alone does not stop spreadsheet applications from evaluating formulas. */
export function escapeCsvCell(value: string | number): string {
  const text = String(value);
  const safe = typeof value === 'string' && (/^[\t\r\n]/.test(text) || /^[\t\r\n ]*[=+\-@]/.test(text))
    ? `'${text}`
    : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export type SortDirection = 'asc' | 'desc';
export type SortState<K extends string> = { key: K; direction: SortDirection };

export function nextSort<K extends string>(current: SortState<K>, key: K, initial: SortDirection = 'asc'): SortState<K> {
  return current.key === key
    ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
    : { key, direction: initial };
}

export function compareValues(a: string | number, b: string | number, direction: SortDirection): number {
  const result = typeof a === 'number' && typeof b === 'number'
    ? a - b
    : String(a).localeCompare(String(b), 'ru', { numeric: true, sensitivity: 'base' });
  return direction === 'asc' ? result : -result;
}
