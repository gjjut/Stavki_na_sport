'use client';

import React, { useEffect, useState } from 'react';
import {
  formatDateTimeInTimeZone,
  toIsoDateTime,
  type DateTimeValue,
  type LocalDateTimeFormat,
} from '@/lib/date-time';

interface LocalDateTimeProps {
  value: DateTimeValue;
  format?: LocalDateTimeFormat;
  locale?: string;
  showTimeZone?: boolean;
  fallback?: string;
  className?: string;
}

export const LocalDateTime: React.FC<LocalDateTimeProps> = ({
  value,
  format = 'compact',
  locale = 'ru-RU',
  showTimeZone = true,
  fallback = '—',
  className,
}) => {
  const [browserTimeZone, setBrowserTimeZone] = useState<string | null>(null);

  useEffect(() => {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setBrowserTimeZone(resolved || 'UTC');
  }, []);

  const isoDateTime = toIsoDateTime(value);
  const displayText = browserTimeZone
    ? formatDateTimeInTimeZone(
        value,
        browserTimeZone,
        format,
        locale,
        showTimeZone,
      )
    : fallback;

  return (
    <time
      dateTime={isoDateTime ?? undefined}
      className={className}
      title={browserTimeZone ? `Местное время · ${browserTimeZone}` : undefined}
    >
      {displayText}
    </time>
  );
};
