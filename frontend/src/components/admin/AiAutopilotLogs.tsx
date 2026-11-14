'use client';

import React from 'react';
import { Clock } from 'lucide-react';
import type { AiAutopilotLogEntry } from '@/server/types';

interface AiAutopilotLogsProps {
  logs: AiAutopilotLogEntry[];
  busyAction: string | null;
  onClearLogs: () => void;
}

export const AiAutopilotLogs: React.FC<AiAutopilotLogsProps> = ({
  logs,
  busyAction,
  onClearLogs,
}) => {
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-blue-600" />
          <h3 className="text-base font-extrabold text-slate-950">
            Журнал работы ИИ-Автопилота
          </h3>
        </div>
        {logs.length > 0 && (
          <button
            type="button"
            onClick={onClearLogs}
            disabled={busyAction !== null}
            className="text-[11px] font-semibold text-slate-400 hover:text-slate-700 disabled:cursor-wait disabled:opacity-50"
          >
            Очистить
          </button>
        )}
      </div>

      <div className="mt-4 max-h-[460px] flex-1 space-y-2.5 overflow-y-auto pr-1">
        {logs.length === 0 && <p className="text-xs text-slate-500">Записей пока нет.</p>}
        {logs.map((log) => (
          <div
            key={log.id}
            className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs"
          >
            <div className="flex items-center justify-between text-[10px] font-bold">
              <span
                className={
                  log.level === 'SUCCESS'
                    ? 'text-emerald-600'
                    : log.level === 'ERROR'
                      ? 'text-rose-600'
                      : 'text-blue-600'
                }
              >
                {log.stage}
              </span>
              <span className="font-mono text-slate-400">
                {new Date(log.createdAt).toLocaleString('ru-RU', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <p className="mt-1 leading-relaxed text-slate-700">{log.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
