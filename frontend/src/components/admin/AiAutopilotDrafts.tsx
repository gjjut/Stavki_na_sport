'use client';

import React from 'react';
import { Sparkles, Trash2 } from 'lucide-react';
import { LocalDateTime } from '@/components/LocalDateTime';
import { TeamAvatar } from '@/components/predictions/TeamAvatar';
import type { AiPredictionDraft } from '@/server/types';

interface AiAutopilotDraftsProps {
  drafts: AiPredictionDraft[];
  busyAction: string | null;
  onApprove: (draftId: string) => void;
  onDelete: (draftId: string) => void;
  onApproveAll: () => void;
}

export const AiAutopilotDrafts: React.FC<AiAutopilotDraftsProps> = ({
  drafts,
  busyAction,
  onApprove,
  onDelete,
  onApproveAll,
}) => {
  if (drafts.length === 0) return null;

  return (
    <div className="rounded-2xl border border-blue-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-extrabold text-slate-950">
            Подготовленные прогнозы ИИ на проверку ({drafts.length})
          </h3>
          <p className="text-xs text-slate-500">
            Проверьте аргументацию и опубликуйте матчи в 1 клик
          </p>
        </div>
        <button
          type="button"
          onClick={onApproveAll}
          disabled={busyAction !== null}
          className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
        >
          {busyAction === 'APPROVE_ALL' ? 'Повторная сверка линии…' : `Опубликовать все (${drafts.length})`}
        </button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {drafts.map((d) => (
          <div
            key={d.id}
            className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
          >
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold">
                <span className="text-slate-500">{d.leagueName}</span>
                <div className="flex items-center gap-1.5">
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-mono text-emerald-800">
                    EV +{d.valueEdgePct.toFixed(1)}%
                  </span>
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 font-mono text-blue-800">
                    Увер. {d.confidencePct}%
                  </span>
                </div>
              </div>

              <div className="mt-2 flex items-center gap-2 text-base font-black text-slate-950">
                <TeamAvatar
                  team={d.homeTeam}
                  sport={d.sport}
                  logoUrl={d.homeLogoUrl}
                  size="sm"
                />
                <span>{d.homeTeam}</span>
                <span className="text-slate-300">—</span>
                <TeamAvatar
                  team={d.awayTeam}
                  sport={d.sport}
                  logoUrl={d.awayLogoUrl}
                  size="sm"
                />
                <span>{d.awayTeam}</span>
              </div>
              <div className="mt-1 text-[10px] text-slate-500">
                Начало:{' '}
                <LocalDateTime value={d.matchStartsAt} format="full" />
              </div>

              <div className="mt-2 rounded-xl border border-blue-100 bg-white p-2.5 text-xs">
                <div className="font-extrabold text-blue-700">
                  Исход: {d.selectionTitle} @ {d.fixedOdds.toFixed(2)} · Флэт{' '}
                  {d.stakeUnits.toFixed(1)}%
                </div>
                {d.researchSources && d.researchSources.length > 0 && (
                  <div className="mt-1 text-[10px] font-semibold text-emerald-700">
                    Проверено: {d.researchSources.join(' · ')}
                  </div>
                )}
                <div className="mt-1 text-slate-600">{d.analysisTeaser}</div>
              </div>

              <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-slate-500">
                {d.analysisFull}
              </p>
              {d.agentReport && (
                <details className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/70 p-2 text-[10px] text-slate-700">
                  <summary className="cursor-pointer font-bold text-indigo-800">
                    Отчёт AI-команды и причины допуска
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap font-sans leading-relaxed">
                    {d.agentReport}
                  </pre>
                </details>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-slate-200/80 pt-3">
              <span className="font-mono text-xs font-bold text-slate-700">
                {d.accessTier === 'FREE'
                  ? 'Бесплатный открытый разбор'
                  : `${d.singlePriceRub} ₽ ${d.insuredOnLoss ? '· Со страховкой' : ''}`}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => onApprove(d.id)}
                  className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-700"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>На витрину</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(d.id)}
                  disabled={busyAction !== null}
                  aria-label={`Удалить черновик: ${d.homeTeam} — ${d.awayTeam}`}
                  className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-wait disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
