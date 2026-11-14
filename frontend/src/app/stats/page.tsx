'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Calculator,
  CheckCircle2,
  MinusCircle,
  ShieldCheck,
  Trophy,
  XCircle,
} from 'lucide-react';
import { SiteShell } from '@/components/layout/SiteShell';
import { EquityCurveChart } from '@/components/stats/EquityCurveChart';
import { HashVerifyModal } from '@/components/predictions/HashVerifyModal';
import { usePublicPlatform } from '@/hooks/usePublicPlatform';
import type { PublicPredictionDto, SportType } from '@/server/types';

const BANKROLL_PRESETS = [10_000, 30_000, 50_000, 100_000];

const SPORT_NAMES: Record<SportType, string> = {
  FOOTBALL: 'Футбол',
  HOCKEY: 'Хоккей',
  TENNIS: 'Теннис',
  BASKETBALL: 'Баскетбол',
  ESPORTS: 'Киберспорт',
  MMA: 'ММА / UFC',
};

export default function StatsPage() {
  const { data, reload } = usePublicPlatform();
  const [period, setPeriod] = useState<'WEEK' | 'MONTH' | 'ALL_TIME'>(
    'ALL_TIME',
  );
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

  const sportBreakdown = (data?.sportBreakdown ?? []).filter((s) => s.bets > 0);

  return (
    <SiteShell
      viewer={data?.viewer ?? null}
      brand={data?.brand ?? null}
      onViewerChange={() => reload()}
    >
      <div className="hero-surface py-8 text-white sm:py-10">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 px-4 sm:px-6 lg:flex-row lg:items-end lg:px-8">
          <div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
              Результаты и открытая статистика
            </h1>
            <p className="mt-1.5 text-xs text-slate-300 sm:text-sm">
              Полная история всех завершенных прогнозов — включая как победы, так и минусы без правок задним числом
            </p>
          </div>

          <div className="inline-flex self-start rounded-xl border border-white/10 bg-white/5 p-1 lg:self-auto">
            {(
              [
                ['WEEK', '7 дней'],
                ['MONTH', '30 дней'],
                ['ALL_TIME', 'Всё время'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPeriod(key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition sm:px-3.5 ${
                  period === key
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {/* 6 KPI карточек */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="text-[11px] font-medium text-slate-500">
              Прирост к банку
            </div>
            <div className="mt-1 font-mono text-xl font-black text-emerald-600 sm:text-2xl">
              {totalProfitPct >= 0 ? '+' : ''}
              {totalProfitPct.toFixed(1)}%
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="text-[11px] font-medium text-slate-500">
              Доходность с оборота
            </div>
            <div className="mt-1 font-mono text-xl font-black text-blue-600 sm:text-2xl">
              {(stats?.yieldPct ?? 0) >= 0 ? '+' : ''}
              {stats?.yieldPct.toFixed(1) ?? '0.0'}%
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="text-[11px] font-medium text-slate-500">
              Угадано матчей
            </div>
            <div className="mt-1 font-mono text-xl font-black text-slate-950 sm:text-2xl">
              {stats?.winRatePct.toFixed(0) ?? '0'}%
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="text-[11px] font-medium text-slate-500">
              Средний коэфф.
            </div>
            <div className="mt-1 font-mono text-xl font-black text-slate-950 sm:text-2xl">
              {stats?.avgOdds.toFixed(2) ?? '1.90'}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="text-[11px] font-medium text-slate-500">
              Побед / Минусов
            </div>
            <div className="mt-1 font-mono text-xl font-black text-slate-950 sm:text-2xl">
              {stats?.wins ?? 0} / {stats?.losses ?? 0}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="text-[11px] font-medium text-slate-500">
              Всего сыграно
            </div>
            <div className="mt-1 font-mono text-xl font-black text-slate-950 sm:text-2xl">
              {(stats?.wins ?? 0) + (stats?.losses ?? 0) + (stats?.pushes ?? 0)}
            </div>
          </div>
        </div>

        {/* График + Рублевый калькулятор */}
        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs sm:p-6 lg:col-span-7">
            <h2 className="mb-1 text-base font-extrabold text-slate-950">
              Как рос игровой банк по месяцам
            </h2>
            <p className="mb-4 text-xs text-slate-500">
              100% — это ваш начальный банк. Нажмите или наведите на точку, чтобы посмотреть результат месяца.
            </p>
            <EquityCurveChart points={data?.equityCurve ?? []} />
          </div>

          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs sm:p-6 lg:col-span-5">
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

              <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                {BANKROLL_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setBankrollRub(preset)}
                    className={`rounded-xl px-3 py-2 font-mono text-xs font-bold transition ${
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
                    Банк: {bankrollRub.toLocaleString('ru-RU')} ₽
                  </span>
                  <span>300 000 ₽</span>
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-center sm:p-3.5 sm:text-left">
              <div>
                <div className="text-[10px] font-semibold uppercase text-slate-400">
                  Ставка (2%)
                </div>
                <div className="mt-0.5 font-mono text-xs font-black text-slate-900 sm:text-sm">
                  {twoPercentRub.toLocaleString('ru-RU')} ₽
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase text-slate-400">
                  Прибыль
                </div>
                <div className="mt-0.5 font-mono text-xs font-black text-emerald-600 sm:text-sm">
                  {simulatedProfitRub >= 0 ? '+' : ''}
                  {simulatedProfitRub.toLocaleString('ru-RU')} ₽
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase text-slate-400">
                  Итог счета
                </div>
                <div className="mt-0.5 font-mono text-xs font-black text-blue-600 sm:text-sm">
                  {simulatedFinalBankRub.toLocaleString('ru-RU')} ₽
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* РАЗБИВКА РЕЗУЛЬТАТИВНОСТИ ПО ВИДАМ СПОРТА */}
        {sportBreakdown.length > 0 && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs sm:p-6">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-blue-600" />
              <h2 className="text-base font-extrabold text-slate-950">
                Результативность по видам спорта
              </h2>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {sportBreakdown.map((item) => (
                <div
                  key={item.sport}
                  className="rounded-xl border border-slate-100 bg-[#F8FAFC] p-3.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-slate-900">
                      {SPORT_NAMES[item.sport] || item.sport}
                    </span>
                    <span className="font-mono text-xs font-black text-emerald-600">
                      {item.profitUnits >= 0 ? '+' : ''}
                      {item.profitUnits.toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-blue-600"
                      style={{
                        width: `${Math.min(100, Math.max(10, item.winRatePct))}%`,
                      }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Точность: {item.winRatePct.toFixed(0)}%</span>
                    <span>Матчей: {item.bets}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* АРХИВ СЫГРАННЫХ МАТЧЕЙ (Карточки на телефонах + Таблица на ПК) */}
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:px-6">
            <h2 className="text-base font-extrabold text-slate-950">
              Архив всех завершившихся матчей ({settledPredictions.length})
            </h2>
            <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
              {(
                [
                  ['ALL', 'Все виды'],
                  ['FOOTBALL', 'Футбол'],
                  ['HOCKEY', 'Хоккей'],
                  ['TENNIS', 'Теннис'],
                  ['ESPORTS', 'Киберспорт'],
                  ['BASKETBALL', 'Баскетбол'],
                  ['MMA', 'ММА'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSportFilter(key)}
                  className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${
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

          {/* Мобильный вид архива: удобные карточки без горизонтального скролла */}
          <div className="divide-y divide-slate-100 md:hidden">
            {settledPredictions.map((item) => {
              const pUnits = item.profitUnits ?? 0;
              return (
                <div key={item.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/predictions/${item.slug}`}
                        className="block truncate text-sm font-extrabold text-slate-950 hover:text-blue-600"
                      >
                        {item.homeTeam} — {item.awayTeam}
                      </Link>
                      <div className="mt-0.5 truncate text-[11px] text-slate-400">
                        {item.leagueName}
                      </div>
                    </div>

                    {item.resultStatus === 'WIN' ||
                    item.resultStatus === 'CASHOUT' ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>+{pUnits.toFixed(1)}%</span>
                      </span>
                    ) : item.resultStatus === 'PUSH' ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">
                        <MinusCircle className="h-3 w-3" />
                        <span>0%</span>
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-600">
                        <XCircle className="h-3 w-3" />
                        <span>{pUnits.toFixed(1)}%</span>
                      </span>
                    )}
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs">
                    <span className="font-bold text-slate-800">
                      {item.selectionTitle}
                    </span>
                    <div className="flex items-center gap-3 font-mono">
                      <span className="font-bold text-blue-600">
                        кэф {item.fixedOdds?.toFixed(2)}
                      </span>
                      {item.finalScore && (
                        <span className="rounded bg-white px-1.5 py-0.5 font-bold text-slate-900 shadow-2xs">
                          {item.finalScore}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Ставка: {item.stakeUnits.toFixed(1)}% банка</span>
                    <button
                      type="button"
                      onClick={() => setHashItem(item)}
                      className="inline-flex items-center gap-1 font-bold text-blue-600"
                    >
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Проверить SHA-256</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Настольная таблица (md+) */}
          <div className="hidden overflow-x-auto md:block">
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

          {settledPredictions.length === 0 && (
            <div className="p-8 text-center text-xs text-slate-500">
              В выбранной дисциплине пока нет завершенных матчей.
            </div>
          )}
        </div>
      </div>

      <HashVerifyModal prediction={hashItem} onClose={() => setHashItem(null)} />
    </SiteShell>
  );
}
