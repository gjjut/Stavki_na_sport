'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Calculator, CheckCircle2, MinusCircle, ShieldCheck, XCircle } from 'lucide-react';
import { SiteShell } from '@/components/layout/SiteShell';
import { EquityCurveChart } from '@/components/stats/EquityCurveChart';
import { HashVerifyModal } from '@/components/predictions/HashVerifyModal';
import { usePublicPlatform } from '@/hooks/usePublicPlatform';
import type { PublicPredictionDto, SportType } from '@/server/types';

const BANKROLL_PRESETS = [10_000, 30_000, 50_000, 100_000];

export default function StatsPage() {
  const { data, reload } = usePublicPlatform();
  const [period, setPeriod] = useState<'WEEK' | 'MONTH' | 'ALL_TIME'>('ALL_TIME');
  const [sportFilter, setSportFilter] = useState<SportType | 'ALL'>('ALL');
  const [bankrollRub, setBankrollRub] = useState<number>(30_000);
  const [hashItem, setHashItem] = useState<PublicPredictionDto | null>(null);

  const stats = data?.statsByPeriod[period];
  const totalProfitPct = stats?.netProfitUnits ?? 0;
  const simulatedProfitRub = Math.round((bankrollRub * totalProfitPct) / 100);
  const simulatedFinalBankRub = bankrollRub + simulatedProfitRub;
  const twoPercentRub = Math.round((bankrollRub * 2) / 100);

  const settledPredictions = (data?.predictions ?? []).filter(
    (p) =>
      p.resultStatus !== 'PENDING' &&
      (sportFilter === 'ALL' || p.sport === sportFilter),
  );

  return (
    <SiteShell
      viewer={data?.viewer ?? null}
      brand={data?.brand ?? null}
      onViewerChange={() => reload()}
    >
      <div className="bg-[#0B0F19] py-10 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-3xl font-black tracking-tight">
              Результаты и открытая статистика
            </h1>
            <p className="mt-1.5 text-sm text-slate-300">
              Полная история всех завершенных прогнозов — включая как победы, так и минусы без правок задним числом
            </p>
          </div>

          <div className="flex gap-1.5 rounded-xl border border-white/10 bg-white/5 p-1">
            {(
              [
                ['WEEK', 'За 7 дней'],
                ['MONTH', 'За 30 дней'],
                ['ALL_TIME', 'За всё время'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPeriod(key)}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                  period === key
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
        {/* Понятные карточки показателей */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">Прирост к банку</div>
            <div className="mt-1 font-mono text-2xl font-black text-emerald-600">
              {totalProfitPct >= 0 ? '+' : ''}
              {totalProfitPct.toFixed(1)}%
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">Доходность с оборота</div>
            <div className="mt-1 font-mono text-2xl font-black text-blue-600">
              {(stats?.yieldPct ?? 0) >= 0 ? '+' : ''}
              {stats?.yieldPct.toFixed(1) ?? '0.0'}%
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">Угадано матчей</div>
            <div className="mt-1 font-mono text-2xl font-black text-slate-950">
              {stats?.winRatePct.toFixed(0) ?? '0'}%
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">Средний коэфф.</div>
            <div className="mt-1 font-mono text-2xl font-black text-slate-950">
              {stats?.avgOdds.toFixed(2) ?? '1.90'}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">Побед / Минусов</div>
            <div className="mt-1 font-mono text-2xl font-black text-slate-950">
              {stats?.wins ?? 0} / {stats?.losses ?? 0}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">Всего сыграно</div>
            <div className="mt-1 font-mono text-2xl font-black text-slate-950">
              {(stats?.wins ?? 0) + (stats?.losses ?? 0) + (stats?.pushes ?? 0)}
            </div>
          </div>
        </div>

        {/* График + Понятный рублевый калькулятор */}
        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-7">
            <h2 className="mb-1 text-base font-extrabold text-slate-950">
              Как рос игровой банк по месяцам
            </h2>
            <p className="mb-4 text-xs text-slate-500">
              100% — это ваш начальный банк. Точки на графике показывают, как он увеличивался на дистанции.
            </p>
            <EquityCurveChart points={data?.equityCurve ?? []} />
          </div>

          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-5">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                <Calculator className="h-3.5 w-3.5" />
                <span>Калькулятор в рублях</span>
              </div>
              <h2 className="mt-2.5 text-lg font-extrabold text-slate-950">
                Сколько бы вы заработали со своим банком?
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Выберите комфортную для вас общую сумму на ставки — калькулятор покажет безопасную ставку на 1 матч и чистую прибыль в рублях.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {BANKROLL_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setBankrollRub(preset)}
                    className={`rounded-xl px-3 py-1.5 font-mono text-xs font-bold transition ${
                      bankrollRub === preset
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                    }`}
                  >
                    {preset.toLocaleString('ru-RU')} ₽
                  </button>
                ))}
              </div>

              <div className="mt-4">
                <input
                  type="range"
                  min={5_000}
                  max={300_000}
                  step={5_000}
                  value={bankrollRub}
                  onChange={(e) => setBankrollRub(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
                <div className="mt-1 flex justify-between font-mono text-[11px] text-slate-400">
                  <span>5 000 ₽</span>
                  <span className="font-bold text-slate-800">
                    Ваш банк: {bankrollRub.toLocaleString('ru-RU')} ₽
                  </span>
                  <span>300 000 ₽</span>
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2.5 rounded-2xl border border-slate-100 bg-slate-50 p-3.5">
              <div>
                <div className="text-[10px] font-semibold uppercase text-slate-400">
                  Ставка на матч (2%)
                </div>
                <div className="mt-0.5 font-mono text-sm font-black text-slate-900">
                  {twoPercentRub.toLocaleString('ru-RU')} ₽
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase text-slate-400">
                  Чистая прибыль
                </div>
                <div className="mt-0.5 font-mono text-sm font-black text-emerald-600">
                  {simulatedProfitRub >= 0 ? '+' : ''}
                  {simulatedProfitRub.toLocaleString('ru-RU')} ₽
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase text-slate-400">
                  Стало на счете
                </div>
                <div className="mt-0.5 font-mono text-sm font-black text-blue-600">
                  {simulatedFinalBankRub.toLocaleString('ru-RU')} ₽
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Открытая таблица всех сыгранных матчей */}
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
            <h2 className="text-base font-extrabold text-slate-950">
              Архив всех завершившихся матчей
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['ALL', 'Все виды'],
                  ['FOOTBALL', 'Футбол'],
                  ['HOCKEY', 'Хоккей'],
                  ['TENNIS', 'Теннис'],
                  ['ESPORTS', 'Киберспорт'],
                  ['MMA', 'ММА'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSportFilter(key)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                    sportFilter === key
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">Матч</th>
                  <th className="px-4 py-3">Какая была ставка</th>
                  <th className="px-4 py-3">Коэфф.</th>
                  <th className="px-4 py-3">Доля банка</th>
                  <th className="px-4 py-3">Счет игры</th>
                  <th className="px-4 py-3">Итог</th>
                  <th className="px-5 py-3 text-right">Проверка</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {settledPredictions.map((item) => {
                  const pUnits = item.profitUnits ?? 0;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/predictions/${item.slug}`}
                          className="font-bold text-slate-900 hover:text-blue-600"
                        >
                          {item.homeTeam} — {item.awayTeam}
                        </Link>
                        <div className="text-[11px] text-slate-400">
                          {item.leagueName}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-slate-800">
                        {item.selectionTitle}
                      </td>
                      <td className="px-4 py-3.5 font-mono font-bold text-slate-900">
                        {item.fixedOdds?.toFixed(2)}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-slate-600">
                        {item.stakeUnits.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3.5 font-mono font-semibold text-slate-800">
                        {item.finalScore || '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        {item.resultStatus === 'WIN' ||
                        item.resultStatus === 'CASHOUT' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 font-bold text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Зашел (+{pUnits.toFixed(1)}%)</span>
                          </span>
                        ) : item.resultStatus === 'PUSH' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 font-bold text-slate-600">
                            <MinusCircle className="h-3.5 w-3.5" />
                            <span>Возврат (0%)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 font-bold text-rose-600">
                            <XCircle className="h-3.5 w-3.5" />
                            <span>Не зашел ({pUnits.toFixed(1)}%)</span>
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => setHashItem(item)}
                          className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline"
                        >
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Проверить</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <HashVerifyModal prediction={hashItem} onClose={() => setHashItem(null)} />
    </SiteShell>
  );
}
