'use client';

import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { SiteShell } from '@/components/layout/SiteShell';
import {
  HashVerifyModal,
  VerifiedHashPayload,
} from '@/components/predictions/HashVerifyModal';
import { SPORT_LABELS } from '@/components/predictions/PredictionCard';
import { EquityCurveChart } from '@/components/stats/EquityCurveChart';
import { usePublicPlatform } from '@/hooks/usePublicPlatform';

export default function StatsPage() {
  const { data, loading, reload } = usePublicPlatform();
  const [period, setPeriod] = useState<'WEEK' | 'MONTH' | 'ALL_TIME'>('ALL_TIME');
  const [verifiedHash, setVerifiedHash] = useState<VerifiedHashPayload | null>(null);

  if (loading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F6FA] text-sm font-medium text-slate-500">
        Загрузка верифицированной статистики...
      </div>
    );
  }

  const s = data.statsByPeriod[period];
  const settledList = data.predictions.filter((p) => p.resultStatus !== 'PENDING');

  const handleVerifyHash = async (predictionId: string) => {
    const res = await fetch('/api/v1/predictions/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ predictionId }),
    });
    const json = await res.json();
    if (res.ok) setVerifiedHash(json);
  };

  return (
    <SiteShell brand={data.brand} viewer={data.viewer} onViewerChange={() => reload()}>
      <HashVerifyModal data={verifiedHash} onClose={() => setVerifiedHash(null)} />

      {/* Темная шапка раздела */}
      <div className="bg-[#0B0F19] py-10 text-white">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 px-4 sm:flex-row sm:items-end sm:px-6 lg:px-8">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-blue-400">
              Открытый аудит
            </div>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-white">
              Статистика и реестр расчетов
            </h1>
            <p className="mt-1.5 text-xs text-slate-400 sm:text-sm">
              100% показателей рассчитываются автоматически по завершенным событиям
            </p>
          </div>

          <div className="inline-flex rounded-xl border border-white/15 bg-white/5 p-1 text-xs font-bold">
            {(
              [
                ['WEEK', '7 дней'],
                ['MONTH', '30 дней'],
                ['ALL_TIME', 'За всё время'],
              ] as const
            ).map(([code, label]) => (
              <button
                key={code}
                type="button"
                onClick={() => setPeriod(code)}
                className={`rounded-lg px-3.5 py-2 transition ${
                  period === code
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* 6 основных метрик */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
            <div className="text-[11px] font-semibold text-slate-400">Yield (с оборота)</div>
            <div className="mt-1 font-mono text-2xl font-black text-blue-600">
              {s.yieldPct >= 0 ? '+' : ''}
              {s.yieldPct.toFixed(1)}%
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
            <div className="text-[11px] font-semibold text-slate-400">Прибыль в юнитах</div>
            <div className="mt-1 font-mono text-2xl font-black text-slate-950">
              {s.netProfitUnits >= 0 ? '+' : ''}
              {s.netProfitUnits.toFixed(2)} u
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
            <div className="text-[11px] font-semibold text-slate-400">Проходимость</div>
            <div className="mt-1 font-mono text-2xl font-black text-slate-950">
              {s.winRatePct.toFixed(1)}%
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
            <div className="text-[11px] font-semibold text-slate-400">Средний кэф</div>
            <div className="mt-1 font-mono text-2xl font-black text-slate-950">
              {s.avgOdds.toFixed(2)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
            <div className="text-[11px] font-semibold text-slate-400">Макс. просадка</div>
            <div className="mt-1 font-mono text-2xl font-black text-slate-700">
              −{s.maxDrawdownPct.toFixed(2)} u
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
            <div className="text-[11px] font-semibold text-slate-400">Текущая серия</div>
            <div className="mt-1 font-mono text-2xl font-black text-emerald-600">
              {s.currentWinStreak > 0 ? `${s.currentWinStreak} в плюс` : '—'}
            </div>
          </div>
        </div>

        {/* График роста банка */}
        <div className="mt-6">
          <EquityCurveChart points={data.equityCurve} />
        </div>

        {/* Разрез по спортивным дисциплинам */}
        <div className="mt-8">
          <h2 className="text-lg font-extrabold text-slate-950">
            Доходность по видам спорта
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.sportBreakdown.map((item) => {
              const meta = SPORT_LABELS[item.sport];
              return (
                <div
                  key={item.sport}
                  className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-extrabold text-slate-950">
                      {meta.icon} {meta.label}
                    </span>
                    <span className="rounded-full bg-blue-50 px-2.5 py-0.5 font-mono text-xs font-black text-blue-700">
                      Yield {item.yieldPct >= 0 ? '+' : ''}
                      {item.yieldPct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between text-xs text-slate-500">
                    <span>Событий: {item.bets} · Винрейт {item.winRatePct.toFixed(0)}%</span>
                    <span className="font-mono font-bold text-slate-900">
                      {item.profitUnits >= 0 ? '+' : ''}
                      {item.profitUnits.toFixed(2)} u
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Таблица открытого архива */}
        <div className="mt-10">
          <h2 className="text-lg font-extrabold text-slate-950">
            Реестр завершенных событий
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Все завершенные матчи раскрываются с исходной цифровой подписью SHA-256
          </p>

          <div className="mt-4 overflow-x-auto rounded-3xl border border-slate-200/90 bg-white shadow-sm">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/80 text-slate-500">
                <tr>
                  <th className="px-5 py-3.5 font-bold">Дата</th>
                  <th className="px-5 py-3.5 font-bold">Матч</th>
                  <th className="px-5 py-3.5 font-bold">Исход</th>
                  <th className="px-5 py-3.5 font-bold">Кэф</th>
                  <th className="px-5 py-3.5 font-bold">Флэт</th>
                  <th className="px-5 py-3.5 font-bold">Итог</th>
                  <th className="px-5 py-3.5 font-bold">Подпись</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {settledList.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3.5 text-slate-400">
                      {new Intl.DateTimeFormat('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                      }).format(new Date(row.matchStartsAt))}
                    </td>
                    <td className="px-5 py-3.5 font-bold text-slate-950">
                      {row.homeTeam} — {row.awayTeam}{' '}
                      {row.finalScore && (
                        <span className="ml-1 font-mono text-slate-400">
                          ({row.finalScore})
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 font-medium">{row.selectionTitle}</td>
                    <td className="px-5 py-3.5 font-mono font-black text-blue-600">
                      {row.fixedOdds?.toFixed(2)}
                    </td>
                    <td className="px-5 py-3.5 font-mono">{row.stakeUnits.toFixed(2)} u</td>
                    <td className="px-5 py-3.5 font-mono font-bold">
                      <span
                        className={
                          (row.profitUnits ?? 0) > 0
                            ? 'text-emerald-600'
                            : (row.profitUnits ?? 0) < 0
                              ? 'text-rose-600'
                              : 'text-amber-600'
                        }
                      >
                        {(row.profitUnits ?? 0) > 0 ? '+' : ''}
                        {(row.profitUnits ?? 0).toFixed(2)} u
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <button
                        type="button"
                        onClick={() => handleVerifyHash(row.id)}
                        className="inline-flex items-center gap-1 font-bold text-blue-600 hover:text-blue-700"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span>SHA-256</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
