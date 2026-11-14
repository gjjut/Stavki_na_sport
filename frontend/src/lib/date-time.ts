export type DateTimeValue = string | number | Date | null | undefined;
export type LocalDateTimeFormat = 'compact' | 'long' | 'full';

const DATE_TIME_OPTIONS: Record<LocalDateTimeFormat, Intl.DateTimeFormatOptions> = {
  compact: {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  },
  long: {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  },
  full: {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  },
};

function toDate(value: Exclude<DateTimeValue, null | undefined>): Date {
  return value instanceof Date ? value : new Date(value);
}

export function toIsoDateTime(value: DateTimeValue): string | null {
  if (value === null || value === undefined) return null;
  const date = toDate(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/** Format an ISO event instant in the timezone resolved by the visitor's browser. */
export function formatDateTimeInTimeZone(
  value: DateTimeValue,
  timeZone: string,
  format: LocalDateTimeFormat = 'compact',
  locale = 'ru-RU',
  showTimeZone = true,
): string {
  if (value === null || value === undefined || !timeZone) return '—';
  const date = toDate(value);
  if (!Number.isFinite(date.getTime())) return '—';

  try {
    return new Intl.DateTimeFormat(locale, {
      ...DATE_TIME_OPTIONS[format],
      timeZone,
      ...(showTimeZone ? { timeZoneName: 'short' as const } : {}),
    }).format(date);
  } catch {
    return '—';
  }
}

/** Convert an instant to the browser-local wall-clock value used by datetime-local. */
export function toDateTimeLocalInputValue(value: Date): string {
  if (!Number.isFinite(value.getTime())) return '';
  const localWallClock = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return localWallClock.toISOString().slice(0, 16);
}

/**
 * Parse a datetime-local value in the browser's timezone. Reject a wall-clock
 * time that did not exist because the clock jumped forward for DST rather than
 * silently shifting the event to a different local time.
 */
export function dateTimeLocalInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  if (toDateTimeLocalInputValue(date) !== value) return null;
  return date.toISOString();
}

/** Calendar-day comparison in the current browser's timezone. */
export function isOnBrowserLocalDay(value: DateTimeValue, now = new Date()): boolean {
  if (value === null || value === undefined) return false;
  const date = toDate(value);
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(now.getTime())) return false;
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}
