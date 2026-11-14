'use client';

import React, { useEffect, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { LocalDateTime } from '@/components/LocalDateTime';
import { Badge, SectionCard } from './ui';

type Health = {
  status: 'ok' | 'degraded' | 'error';
  storage?: 'postgres' | 'local_file' | 'unavailable';
  storageDegraded?: boolean;
  sessionAuthConfigured?: boolean;
  adminAccountConfigured?: boolean;
  cronAuthConfigured?: boolean;
  timestamp?: string;
};

function stateLabel(value: boolean | undefined, yes: string, no: string) {
  return value === true ? yes : value === false ? no : 'нет данных';
}

export function SystemHealth() {
  const [revision, setRevision] = useState(0);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch('/api/health', { cache: 'no-store', signal: controller.signal });
        const json = (await res.json()) as Health;
        if (res.ok && json.status === 'ok') setHealth(json);
        else if (res.status === 503 && json.status === 'degraded') setHealth(json);
        else setHealth({ status: 'error' });
      } catch {
        if (!controller.signal.aborted) setHealth({ status: 'error' });
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [revision]);

  return (
    <SectionCard
      title="Состояние системы"
      subtitle="Сервер, хранилище и настройки доступа; интеграции не проверяются"
      action={<button type="button" onClick={() => setRevision((value) => value + 1)} disabled={loading} className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Проверить</button>}
    >
      <div className="space-y-3 px-5 py-4 text-xs" aria-live="polite">
        {loading ? <span className="text-slate-500">Проверяем состояние…</span> : health?.status === 'error' || !health ? (
          <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-rose-600" /><span className="font-semibold text-rose-700">Не удалось получить состояние сервера.</span></div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone={health.status === 'ok' ? 'emerald' : 'amber'}>{health.status === 'ok' ? 'Проверка пройдена' : 'Требуется внимание'}</Badge>
              {health.timestamp && <span className="text-[11px] text-slate-400">Проверено: <LocalDateTime value={health.timestamp} format="full" /></span>}
            </div>
            <div className="grid gap-2 text-slate-600 sm:grid-cols-2">
              <span>Хранилище: <strong>{health.storage === 'postgres' ? 'PostgreSQL' : health.storage === 'local_file' ? 'локальный файл' : health.storage === 'unavailable' ? 'недоступно' : 'нет данных'}</strong>{health.storageDegraded ? health.storage === 'unavailable' ? ' · операции приостановлены' : ' · ошибка конфигурации' : ''}</span>
              <span>Подпись сессий: <strong>{stateLabel(health.sessionAuthConfigured, 'настроена', 'не настроена')}</strong></span>
              <span>Администратор: <strong>{stateLabel(health.adminAccountConfigured, 'активен', 'не найден')}</strong></span>
              <span>Секрет расписания: <strong>{stateLabel(health.cronAuthConfigured, 'настроен', 'не настроен')}</strong></span>
            </div>
          </>
        )}
      </div>
    </SectionCard>
  );
}
