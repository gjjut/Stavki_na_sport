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
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">
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

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-2xl font-extrabold text-white sm:text-3xl">
              Верифицированная статистика
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Автоматический расчет показателей по всем завершенным прогнозам
            </p>
          </div>

          <div className="inline-flex rounded-xl border border-slate-800 bg-slate-900 p-1 text-xs font-semibold">
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
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 6 основных метрик */}
        <div className="mt-6 grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
            <div className="text-[11px] text-slate-400">Yield (с оборота)</div>
            <div className="mt-1 font-mono text-2xl font-extrabold text-emerald-400">
              {s.yieldPct >= 0 ? '+' : ''}
              {s.yieldPct.toFixed(1)}%
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
            <div className="text-[11px] text-slate-400">Прибыль в юнитах</div>
            <div className="mt-1 font-mono text-2xl font-extrabold text-white">
              {s.netProfitUnits >= 0 ? '+' : ''}
              {s.netProfitUnits.toFixed(2)} u
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
            <div className="text-[11px] text-slate-400">Проходимость</div>
            <div className="mt-1 font-mono text-2xl font-extrabold text-white">
              {s.winRatePct.toFixed(1)}%
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
            <div className="text-[11px] text-slate-400">Средний кэф</div>
            <div className="mt-1 font-mono text-2xl font-extrabold text-white">
              {s.avgOdds.toFixed(2)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
            <div className="text-[11px] text-slate-400">Макс. просадка</div>
            <div className="mt-1 font-mono text-2xl font-extrabold text-slate-200">
              −{s.maxDrawdownPct.toFixed(2)} u
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
            <div className="text-[11px] text-slate-400">Текущая серия</div>
            <div className="mt-1 font-mono text-2xl font-extrabold text-emerald-300">
              {s.currentWinStreak > 0 ? `${s.currentWinStreak} в плюс` : '—'}
            </div>
          </div>
        </div>

        {/* График Equity Curve */}
        <div className="mt-6">
          <EquityCurveChart points={data.equityCurve} />
        </div>

        {/* Разрез по спортивным дисциплинам */}
        <div className="mt-8">
          <h2 className="text-lg font-bold text-white">Эффективность по дисциплинам</h2>
          <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {data.sportBreakdown.map((item) => {
              const meta = SPORT_LABELS[item.sport];
              return (
                <div
                  key={item.sport}
                  className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">
                      {meta.icon} {meta.label}
                    </span>
                    <span className="font-mono text-xs font-bold text-emerald-400">
                      Yield {item.yieldPct >= 0 ? '+' : ''}
                      {item.yieldPct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between text-xs text-slate-400">
                    <span>Матчей: {item.bets}</span>
                    <span className="font-mono font-bold text-slate-200">
                      {item.profitUnits >= 0 ? '+' : ''}
                      {item.profitUnits.toFixed(2)} u
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Полный реестр рассчитанных прогнозов */}
        <div className="mt-10">
          <h2 className="text-lg font-bold text-white">Открытый реестр расчетов</h2>
          <p className="mt-1 text-xs text-slate-400">
            Все завершенные прогнозы автоматически раскрываются для публичного аудита
          </p>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/75">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Дата</th>
                  <th className="px-4 py-3 font-semibold">Событие</th>
                  <th className="px-4 py-3 font-semibold">Исход</th>
                  <th className="px-4 py-3 font-semibold">Кэф</th>
                  <th className="px-4 py-3 font-semibold">Флэт</th>
                  <th className="px-4 py-3 font-semibold">Результат</th>
                  <th className="px-4 py-3 font-semibold">Проверка</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-200">
                {settledList.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-slate-400">
                      {new Intl.DateTimeFormat('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                      }).format(new Date(row.matchStartsAt))}
                    </td>
                    <td className="px-4 py-3 font-semibold text-white">
                      {row.homeTeam} — {row.awayTeam}{' '}
                      {row.finalScore && (
                        <span className="ml-1 font-mono text-slate-400">
                          ({row.finalScore})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{row.selectionTitle}</td>
                    <td className="px-4 py-3 font-mono font-bold text-emerald-400">
                      {row.fixedOdds?.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 font-mono">{row.stakeUnits.toFixed(2)} u</td>
                    <td className="px-4 py-3 font-mono font-bold">
                      <span
                        className={
                          (row.profitUnits ?? 0) > 0
                            ? 'text-emerald-400'
                            : (row.profitUnits ?? 0) < 0
                              ? 'text-rose-400'
                              : 'text-amber-300'
                        }
                      >
                        {(row.profitUnits ?? 0) > 0 ? '+' : ''}
                        {(row.profitUnits ?? 0).toFixed(2)} u
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleVerifyHash(row.id)}
                        className="inline-flex items-center gap-1 font-medium text-emerald-400 hover:text-emerald-300"
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
