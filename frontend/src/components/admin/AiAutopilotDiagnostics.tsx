'use client';

import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { LocalDateTime } from '@/components/LocalDateTime';
import type { AiDiagnosticsReport } from '@/server/types';

export function AiAutopilotDiagnostics({ diagnostics }: { diagnostics: AiDiagnosticsReport }) {
  return (
  <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
      <span className="font-bold text-white">
        Отчет самодиагностики · Серверное время: {diagnostics.mskTimeFormatted}
      </span>
      <span className="font-mono text-blue-300">
        Следующий плановый слот: {diagnostics.nextSlotLabel}
      </span>
    </div>
    <div className="grid gap-2.5 sm:grid-cols-2">
      {diagnostics.items.map((item) => (
        <div
          key={item.name}
          className="flex items-start justify-between gap-2 rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs"
        >
          <div>
            <div className="flex items-center gap-1.5 font-bold text-white">
              {item.ok ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-amber-400" />
              )}
              <span>{item.name}</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-300">{item.details}</p>
          </div>
          <span className="shrink-0 font-mono text-[11px] text-slate-400">
            {item.latencyMs} мс
          </span>
        </div>
      ))}
    </div>

    {diagnostics.sampleMatches && diagnostics.sampleMatches.length > 0 && (
      <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-3.5">
        <div className="mb-2.5 flex items-center justify-between gap-2 text-xs font-bold text-emerald-300">
          <span>
            Живая проверка: реальные предстоящие матчи в линии прямо сейчас
          </span>
          <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] text-emerald-200">
            Источник: {diagnostics.sampleMatches[0].source}
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {diagnostics.sampleMatches.map((m, i) => (
            <div
              key={`${m.matchTitle}_${i}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-xs"
            >
              <div className="min-w-0">
                <div className="truncate text-[10px] text-slate-400">
                  {m.leagueName} · Начало:{' '}
                  <LocalDateTime
                    value={m.matchStartsAt}
                    format="compact"
                  />
                </div>
                <div className="truncate font-bold text-white">
                  {m.matchTitle}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[11px] font-semibold text-blue-300">
                  {m.market}
                </div>
                <div className="font-mono text-xs font-black text-emerald-400">
                  {m.odds.toFixed(2)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
  );
}
