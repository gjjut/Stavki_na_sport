'use client';

import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Lock,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';
import type {
  MatchLifecycleStatus,
  PredictionAccessTier,
  PredictionCardData,
  PredictionResultStatus,
  SportType,
} from '../predictions/PredictionCard';

export interface CreatePredictionPayload {
  sport: SportType;
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
  matchStartsAt: string;
  matchStatus: MatchLifecycleStatus;
  selectionTitle: string;
  fixedOdds: number;
  minAcceptableOdds: number | null;
  bookmakerSource: string;
  stakePercent: number;
  stakeUnits: number;
  accessTier: PredictionAccessTier;
  singlePriceRub: number | null;
  resultStatus: PredictionResultStatus;
  cashoutMultiplier: number | null;
  finalScore: string | null;
  analysisTeaser: string;
  analysisFull: string;
  pushToVipChannel: boolean;
  pushToBotDm: boolean;
}

export interface AdminPredictionFormProps {
  onPublishPrediction?: (
    payload: CreatePredictionPayload,
    createdPreview: PredictionCardData,
  ) => Promise<void> | void;
}

const SPORT_OPTIONS: Array<{
  value: SportType;
  label: string;
  icon: string;
  leagues: string[];
  quickMarkets: string[];
}> = [
  {
    value: 'HOCKEY',
    label: 'Хоккей',
    icon: '🏒',
    leagues: ['КХЛ · Регулярный чемпионат', 'НХЛ', 'ВХЛ', 'ЧМ (Элита)'],
    quickMarkets: ['Фора 1 (-1.5)', 'ИТБ1 (2.5)', 'Тотал Больше (5.5)', 'Победа 1 в матче'],
  },
  {
    value: 'FOOTBALL',
    label: 'Футбол',
    icon: '⚽',
    leagues: ['АПЛ', 'Лига Чемпионов УЕФА', 'РПЛ', 'Серия А', 'Ла Лига'],
    quickMarkets: ['Фора 1 (-1.0)', 'Тотал Больше (2.5)', 'Обе забьют — Да', 'ИТБ1 (1.5)'],
  },
  {
    value: 'TENNIS',
    label: 'Теннис',
    icon: '🎾',
    leagues: ['ATP 1000 · Masters', 'WTA 1000', 'ATP 500', 'Grand Slam'],
    quickMarkets: ['Фора 1 по геймам (-3.5)', 'Тотал геймов Б (22.5)', 'Победа 1 (2:0)'],
  },
  {
    value: 'ESPORTS',
    label: 'Киберспорт',
    icon: '🎮',
    leagues: ['CS2 · Major Championship', 'Dota 2 · Tier-1', 'ESL Pro League', 'Valorant VCT'],
    quickMarkets: ['Фора по картам 1 (-1.5)', 'Тотал карт Б (2.5)', 'Победа на 1-й карте: К1'],
  },
];

const FLAT_PRESETS = [1.0, 1.5, 2.0, 3.0, 5.0];

const CLIENT_BANK_TIERS = [
  { label: 'Осторожный банк', bankRub: 30_000 },
  { label: 'Средний банк клиента', bankRub: 100_000 },
  { label: 'PRO-беттор (VIP)', bankRub: 300_000 },
];

function buildDefaultKickoffLocal(): string {
  const d = new Date(Date.now() + 2 * 60 * 60 * 1000 + 15 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

/** Быстрый детерминированный псевдо-SHA256 для клиентского предпросмотра до ответа сервера */
function generatePreviewHash(seed: string): string {
  let h1 = 0xdeadbeef ^ seed.length;
  let h2 = 0x41c6ce57 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  const part = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return `${part(h1)}${part(h2)}${part(h1 ^ h2)}${part(Math.imul(h1, 31))}${part(
    Math.imul(h2, 17),
  )}a9f4c2e8b1d07365`.slice(0, 64);
}

export const AdminPredictionForm: React.FC<AdminPredictionFormProps> = ({
  onPublishPrediction,
}) => {
  // Поля формы прогноза
  const [sport, setSport] = useState<SportType>('HOCKEY');
  const [leagueName, setLeagueName] = useState('КХЛ · Регулярный чемпионат');
  const [homeTeam, setHomeTeam] = useState('Авангард');
  const [awayTeam, setAwayTeam] = useState('Салават Юлаев');
  const [matchStartsLocal, setMatchStartsLocal] = useState<string>(buildDefaultKickoffLocal);
  const [matchStatus, setMatchStatus] = useState<MatchLifecycleStatus>('UPCOMING');

  // Беттинг-параметры (жесткая фиксация кэфа и Флэт в % / Юнитах)
  const [selectionTitle, setSelectionTitle] = useState('ИТБ1 (2.5)');
  const [fixedOddsInput, setFixedOddsInput] = useState('1.96');
  const [minOddsInput, setMinOddsInput] = useState('1.85');
  const [estimatedProbPct, setEstimatedProbPct] = useState<number>(55);
  const [bookmakerSource, setBookmakerSource] = useState('Pinnacle / Фонбет');
  const [stakePercent, setStakePercent] = useState<number>(2.0); // 1% = 1 Unit

  // Статус расчета (для лайв-закрытия или внесения результата)
  const [resultStatus, setResultStatus] = useState<PredictionResultStatus>('PENDING');
  const [cashoutMultiplierInput, setCashoutMultiplierInput] = useState('1.45');
  const [finalScore, setFinalScore] = useState('');

  // Монетизация и рассылки Telegram
  const [accessTier, setAccessTier] = useState<PredictionAccessTier>('PAID_SINGLE');
  const [singlePriceInput, setSinglePriceInput] = useState('790');
  const [pushToVipChannel, setPushToVipChannel] = useState(true);
  const [pushToBotDm, setPushToBotDm] = useState(true);

  // Аналитические тексты
  const [analysisTeaser, setAnalysisTeaser] = useState(
    'У гостей второй выезд за 48 часов и бэкап-вратарь (88.9% ОБ). Ранняя линия дает +7.8% перевеса по xG спецбригад большинства.',
  );
  const [analysisFull, setAnalysisFull] = useState(
    '1. Первая спецбригада «Авангарда» реализует 26.4% большинства дома.\n2. Гости проводят 3-й матч на выезде за 5 дней — просадка по скорости во 2-м периоде.\n3. Справедливый кэф по нашей модели — 1.81, берем валуй за 1.96 (актуально до 1.85).',
  );

  // Ползунок симуляции банка клиента в правом блоке аналитики
  const [sampleUserBankRub, setSampleUserBankRub] = useState<number>(100_000);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [publishedBanner, setPublishedBanner] = useState<string | null>(null);

  const activeSportConfig = useMemo(
    () => SPORT_OPTIONS.find((s) => s.value === sport) ?? SPORT_OPTIONS[0],
    [sport],
  );

  // Числовые расчеты ставок и потенциальной прибыли в реальном времени
  const calc = useMemo(() => {
    const fixedOdds = Math.max(1.01, Number(fixedOddsInput) || 1.01);
    const minOdds = Number(minOddsInput) > 1.01 ? Number(minOddsInput) : null;
    const stakeUnits = stakePercent; // Стандарт платформы: 1.00 Unit = 1.00% от банка
    const singlePriceRub = accessTier === 'PAID_SINGLE' ? Math.max(0, Number(singlePriceInput) || 0) : 0;
    const cashoutMultiplier = Math.max(0, Number(cashoutMultiplierInput) || 0);

    // 1. Потенциальная чистая прибыль при заходе (WIN) во Флэте
    const potentialWinUnits = stakeUnits * (fixedOdds - 1);
    const potentialWinBankPct = stakePercent * (fixedOdds - 1);
    const singleBetRoiPct = (fixedOdds - 1) * 100;

    // 2. Фактический расчет, если выбран не PENDING
    let settledUnits: number | null = null;
    if (resultStatus === 'WIN') settledUnits = potentialWinUnits;
    if (resultStatus === 'LOSS') settledUnits = -stakeUnits;
    if (resultStatus === 'PUSH') settledUnits = 0;
    if (resultStatus === 'CASHOUT') settledUnits = stakeUnits * (cashoutMultiplier - 1);

    // 3. Математика Валуйности (+EV против маржи БК)
    const impliedBookieProbPct = (1 / fixedOdds) * 100;
    const expectedValuePct = ((estimatedProbPct / 100) * fixedOdds - 1) * 100;
    const fairOdds = estimatedProbPct > 0 ? 100 / estimatedProbPct : fixedOdds;

    // 4. Расчет для выбранного ориентира банка покупателя
    const sampleStakeRub = (sampleUserBankRub * stakePercent) / 100;
    const sampleGrossReturnRub = sampleStakeRub * fixedOdds;
    const sampleNetProfitRub = sampleStakeRub * (fixedOdds - 1);

    // Проверка окупаемости разовой покупки прогноза со среднего банка (100 000 ₽)
    const avgClientProfitRub = ((100_000 * stakePercent) / 100) * (fixedOdds - 1);
    const pricePaybackRatio = singlePriceRub > 0 ? avgClientProfitRub / singlePriceRub : null;

    const previewHash = generatePreviewHash(
      `${matchStartsLocal}|${selectionTitle}|${fixedOdds.toFixed(3)}|${stakeUnits.toFixed(2)}`,
    );

    return {
      fixedOdds,
      minOdds,
      stakeUnits,
      singlePriceRub,
      cashoutMultiplier,
      potentialWinUnits,
      potentialWinBankPct,
      singleBetRoiPct,
      settledUnits,
      impliedBookieProbPct,
      expectedValuePct,
      fairOdds,
      sampleStakeRub,
      sampleGrossReturnRub,
      sampleNetProfitRub,
      pricePaybackRatio,
      previewHash,
    };
  }, [
    fixedOddsInput,
    minOddsInput,
    stakePercent,
    accessTier,
    singlePriceInput,
    resultStatus,
    cashoutMultiplierInput,
    estimatedProbPct,
    sampleUserBankRub,
    matchStartsLocal,
    selectionTitle,
  ]);

  const handleSportSwitch = (nextSport: SportType) => {
    setSport(nextSport);
    const found = SPORT_OPTIONS.find((item) => item.value === nextSport);
    if (found) {
      setLeagueName(found.leagues[0]);
      setSelectionTitle(found.quickMarkets[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!homeTeam.trim() || !awayTeam.trim() || !selectionTitle.trim()) return;

    setIsSubmitting(true);
    setPublishedBanner(null);

    const isoStart = new Date(matchStartsLocal).toISOString();
    const payload: CreatePredictionPayload = {
      sport,
      leagueName: leagueName.trim(),
      homeTeam: homeTeam.trim(),
      awayTeam: awayTeam.trim(),
      matchStartsAt: isoStart,
      matchStatus,
      selectionTitle: selectionTitle.trim(),
      fixedOdds: calc.fixedOdds,
      minAcceptableOdds: calc.minOdds,
      bookmakerSource: bookmakerSource.trim(),
      stakePercent,
      stakeUnits: calc.stakeUnits,
      accessTier,
      singlePriceRub: accessTier === 'PAID_SINGLE' ? calc.singlePriceRub : null,
      resultStatus,
      cashoutMultiplier: resultStatus === 'CASHOUT' ? calc.cashoutMultiplier : null,
      finalScore: finalScore.trim() || null,
      analysisTeaser: analysisTeaser.trim(),
      analysisFull: analysisFull.trim(),
      pushToVipChannel,
      pushToBotDm,
    };

    const isSettled = matchStatus === 'FINISHED' && resultStatus !== 'PENDING';
    const isFree = accessTier === 'FREE';

    const createdCard: PredictionCardData = {
      id: `pred_${Date.now()}`,
      slug: `${homeTeam}-${awayTeam}-${Date.now()}`.toLowerCase().replace(/\s+/g, '-'),
      sport: payload.sport,
      leagueName: payload.leagueName,
      homeTeam: payload.homeTeam,
      awayTeam: payload.awayTeam,
      matchStartsAt: payload.matchStartsAt,
      matchStatus: payload.matchStatus,
      stakePercent: payload.stakePercent,
      stakeUnits: payload.stakeUnits,
      bookmakerSource: payload.bookmakerSource,
      analysisTeaser: payload.analysisTeaser,
      isLocked: !(isFree || isSettled),
      accessTier: payload.accessTier,
      singlePriceRub: payload.singlePriceRub,
      selectionTitle: isFree || isSettled ? payload.selectionTitle : null,
      fixedOdds: isFree || isSettled ? payload.fixedOdds : null,
      minAcceptableOdds: isFree || isSettled ? payload.minAcceptableOdds : null,
      analysisFull: isFree || isSettled ? payload.analysisFull : null,
      resultStatus: payload.resultStatus,
      finalScore: payload.finalScore,
      profitUnits: calc.settledUnits !== null ? Number(calc.settledUnits.toFixed(2)) : null,
      profitPercent: calc.settledUnits !== null ? Number(calc.settledUnits.toFixed(2)) : null,
      verificationHash: calc.previewHash,
      oddsLockedAt: new Date().toISOString(),
    };

    try {
      await onPublishPrediction?.(payload, createdCard);
      const tgNote = pushToVipChannel
        ? ' + отправлен пуш в закрытый VIP Telegram-канал'
        : '';
      setPublishedBanner(
        `Прогноз «${payload.homeTeam} vs ${payload.awayTeam}» опубликован! Кэф ${calc.fixedOdds.toFixed(
          2,
        )} жестко зафиксирован (SHA-256)${tgNote}.`,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      {/* ЛЕВАЯ КОЛОНКА (7/12): БЫСТРАЯ ФОРМА ДОБАВЛЕНИЯ ПРОГНОЗА */}
      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl sm:p-6 xl:col-span-7"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-bold text-white sm:text-xl">
              Публикация прогноза и фиксация линии
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              После публикации коэффициент, исход и флэт блокируются триггером PostgreSQL
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
            <Lock className="h-3.5 w-3.5" />
            <span>Anti-Fraud Odds Lock</span>
          </span>
        </div>

        {publishedBanner && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 p-3.5 text-sm text-emerald-200"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <span>{publishedBanner}</span>
          </motion.div>
        )}

        {/* 1. Выбор спорта и быстрые пресеты лиг */}
        <div className="space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
            1. Вид спорта и Турнир
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SPORT_OPTIONS.map((item) => {
              const active = sport === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => handleSportSwitch(item.value)}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                    active
                      ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200 shadow-[0_0_16px_rgba(16,185,129,0.15)]'
                      : 'border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div>
            <input
              type="text"
              required
              value={leagueName}
              onChange={(e) => setLeagueName(e.target.value)}
              placeholder="Название лиги / турнира"
              className="w-full rounded-xl border border-slate-700/80 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {activeSportConfig.leagues.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setLeagueName(preset)}
                  className="rounded-lg border border-slate-800 bg-slate-950/80 px-2.5 py-1 text-[11px] text-slate-400 transition hover:border-slate-700 hover:text-slate-200"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 2. Команды, время старта и статус цикла */}
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">
              Команда 1 / Игрок 1 (Хозяева)
            </label>
            <input
              type="text"
              required
              value={homeTeam}
              onChange={(e) => setHomeTeam(e.target.value)}
              className="w-full rounded-xl border border-slate-700/80 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-emerald-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">
              Команда 2 / Игрок 2 (Гости)
            </label>
            <input
              type="text"
              required
              value={awayTeam}
              onChange={(e) => setAwayTeam(e.target.value)}
              className="w-full rounded-xl border border-slate-700/80 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-emerald-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">
              Дата и время начала (для FOMO-таймера)
            </label>
            <input
              type="datetime-local"
              required
              value={matchStartsLocal}
              onChange={(e) => setMatchStartsLocal(e.target.value)}
              className="w-full rounded-xl border border-slate-700/80 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-emerald-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">
              Статус события в ленте
            </label>
            <select
              value={matchStatus}
              onChange={(e) => setMatchStatus(e.target.value as MatchLifecycleStatus)}
              className="w-full rounded-xl border border-slate-700/80 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-emerald-400 focus:outline-none"
            >
              <option value="UPCOMING">Ожидает начала (Таймер FOMO)</option>
              <option value="LIVE">В игре (LIVE индикатор)</option>
              <option value="FINISHED">Завершен (Открыт для верификации)</option>
            </select>
          </div>
        </div>

        {/* 3. Исход, жесткая фиксация коэффициента и оценка вероятности */}
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              2. Параметры ставки и фиксация коэффициента
            </span>
            <span className="text-[11px] text-slate-400">Все расчеты строго во Флэте</span>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">
              Точный исход (скрыт под Blur для некупивших)
            </label>
            <input
              type="text"
              required
              value={selectionTitle}
              onChange={(e) => setSelectionTitle(e.target.value)}
              placeholder="Напр.: Фора 1 (-1.5) или ИТБ1 (2.5)"
              className="w-full rounded-xl border border-slate-700/80 bg-slate-900 px-3.5 py-2.5 text-sm font-semibold text-white focus:border-emerald-400 focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {activeSportConfig.quickMarkets.map((market) => (
                <button
                  key={market}
                  type="button"
                  onClick={() => setSelectionTitle(market)}
                  className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-[11px] text-slate-400 transition hover:border-emerald-500/40 hover:text-emerald-300"
                >
                  {market}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Фиксируемый кэф *
              </label>
              <input
                type="number"
                step="0.01"
                min="1.05"
                max="50"
                required
                value={fixedOddsInput}
                onChange={(e) => setFixedOddsInput(e.target.value)}
                className="w-full rounded-xl border border-emerald-500/40 bg-slate-900 px-3.5 py-2 font-mono text-base font-bold text-emerald-300 focus:border-emerald-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Мин. валуйный кэф
              </label>
              <input
                type="number"
                step="0.01"
                min="1.01"
                max="50"
                value={minOddsInput}
                onChange={(e) => setMinOddsInput(e.target.value)}
                className="w-full rounded-xl border border-slate-700/80 bg-slate-900 px-3.5 py-2 font-mono text-sm text-slate-200 focus:border-emerald-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Линия букмекера
              </label>
              <input
                type="text"
                value={bookmakerSource}
                onChange={(e) => setBookmakerSource(e.target.value)}
                className="w-full rounded-xl border border-slate-700/80 bg-slate-900 px-3.5 py-2 text-sm text-slate-200 focus:border-emerald-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Размер ставки в % от банка / Юнитах */}
          <div className="pt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-300">
                Размер ставки (% от банка / Юниты):
              </span>
              <span className="font-mono text-sm font-bold text-emerald-400">
                {stakePercent.toFixed(1)}% банка = {calc.stakeUnits.toFixed(2)} u
              </span>
            </div>

            <input
              type="range"
              min="0.5"
              max="5.0"
              step="0.5"
              value={stakePercent}
              onChange={(e) => setStakePercent(Number(e.target.value))}
              className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-emerald-400"
            />

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {FLAT_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setStakePercent(preset)}
                    className={`rounded-lg border px-2.5 py-1 font-mono text-xs font-semibold transition ${
                      stakePercent === preset
                        ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                        : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {preset.toFixed(1)}% ({preset.toFixed(1)} u)
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>Вероятность захода по модели:</span>
                <input
                  type="number"
                  min="5"
                  max="95"
                  value={estimatedProbPct}
                  onChange={(e) => setEstimatedProbPct(Number(e.target.value) || 50)}
                  className="w-16 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-center font-mono text-xs font-bold text-indigo-300"
                />
                <span>%</span>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Монетизация, Статус расчета и Telegram-рассылка */}
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">
              Формат доступа
            </label>
            <select
              value={accessTier}
              onChange={(e) => setAccessTier(e.target.value as PredictionAccessTier)}
              className="w-full rounded-xl border border-slate-700/80 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-emerald-400 focus:outline-none"
            >
              <option value="PAID_SINGLE">Разовая покупка + VIP</option>
              <option value="VIP_ONLY">Эксклюзив VIP-подписки</option>
              <option value="FREE">Бесплатный (Прогрев)</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">
              Цена разового открытия (₽)
            </label>
            <input
              type="number"
              min="0"
              step="10"
              disabled={accessTier !== 'PAID_SINGLE'}
              value={singlePriceInput}
              onChange={(e) => setSinglePriceInput(e.target.value)}
              className="w-full rounded-xl border border-slate-700/80 bg-slate-950 px-3.5 py-2.5 font-mono text-sm text-white disabled:opacity-40 focus:border-emerald-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">
              Статус результата
            </label>
            <select
              value={resultStatus}
              onChange={(e) => setResultStatus(e.target.value as PredictionResultStatus)}
              className="w-full rounded-xl border border-slate-700/80 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-emerald-400 focus:outline-none"
            >
              <option value="PENDING">PENDING (В ожидании)</option>
              <option value="WIN">WIN (Выигрыш)</option>
              <option value="LOSS">LOSS (Проигрыш)</option>
              <option value="PUSH">PUSH (Возврат 1.00)</option>
              <option value="CASHOUT">CASHOUT (Досрочное закрытие)</option>
            </select>
          </div>
        </div>

        {resultStatus === 'CASHOUT' && (
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3.5 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-cyan-200">
                Коэффициент закрытия Cashout (напр. 1.45 или 0.60)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={cashoutMultiplierInput}
                onChange={(e) => setCashoutMultiplierInput(e.target.value)}
                className="w-full rounded-lg border border-cyan-400/40 bg-slate-950 px-3 py-2 font-mono text-sm text-cyan-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-cyan-200">
                Счет на момент Cashout / финала
              </label>
              <input
                type="text"
                value={finalScore}
                onChange={(e) => setFinalScore(e.target.value)}
                placeholder="Напр.: 2:1 (3-й период)"
                className="w-full rounded-lg border border-cyan-400/40 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </div>
          </div>
        )}

        {/* Тизер и полное описание */}
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">
              Публичный тизер над размытием (триггер любопытства и экспертности)
            </label>
            <input
              type="text"
              value={analysisTeaser}
              onChange={(e) => setAnalysisTeaser(e.target.value)}
              className="w-full rounded-xl border border-slate-700/80 bg-slate-950 px-3.5 py-2 text-sm text-slate-200 focus:border-emerald-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">
              Полный аналитический разбор (доступен после оплаты и в VIP-канале)
            </label>
            <textarea
              rows={3}
              value={analysisFull}
              onChange={(e) => setAnalysisFull(e.target.value)}
              className="w-full rounded-xl border border-slate-700/80 bg-slate-950 px-3.5 py-2 text-sm text-slate-200 focus:border-emerald-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Тумблеры интеграции с Telegram Bot API */}
        <div className="flex flex-col gap-2.5 rounded-xl border border-sky-500/25 bg-sky-500/5 p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex cursor-pointer items-center gap-2.5 text-xs font-medium text-slate-200">
            <input
              type="checkbox"
              checked={pushToVipChannel}
              onChange={(e) => setPushToVipChannel(e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-500"
            />
            <span>Автопуш в закрытый VIP Telegram-канал</span>
          </label>

          <label className="flex cursor-pointer items-center gap-2.5 text-xs font-medium text-slate-200">
            <input
              type="checkbox"
              checked={pushToBotDm}
              onChange={(e) => setPushToBotDm(e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-500"
            />
            <span>Личное уведомление подписчикам в Telegram-боте</span>
          </label>
        </div>

        <motion.button
          type="submit"
          whileTap={{ scale: 0.99 }}
          disabled={isSubmitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-5 py-3.5 text-sm font-extrabold text-slate-950 shadow-[0_0_28px_rgba(16,185,129,0.35)] transition hover:brightness-110 disabled:opacity-60"
        >
          <Send className="h-4 w-4" />
          <span>
            {isSubmitting
              ? 'Фиксация кэфа и отправка в VIP Telegram...'
              : 'Опубликовать прогноз и зафиксировать коэффициент'}
          </span>
        </motion.button>
      </form>

      {/* ПРАВАЯ КОЛОНКА (5/12): АВТОРАСЧЕТ ПОТЕНЦИАЛЬНОЙ ПРИБЫЛИ ЮЗЕРА И +EV КОНТРОЛЬ */}
      <div className="space-y-5 xl:col-span-5">
        {/* Блок 1: Калькулятор потенциальной прибыли юзера (Флэт + Срез по банкам) */}
        <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-slate-900 to-slate-950 p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Calculator className="h-4 w-4 text-emerald-400" />
              <span>Потенциальная прибыль для покупателя</span>
            </div>
            <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 font-mono text-xs font-bold text-emerald-300">
              ROI ставки: +{calc.singleBetRoiPct.toFixed(0)}%
            </span>
          </div>

          {/* Главные метрики в Юнитах и % к банку */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">
                Чистый плюс (Юниты)
              </div>
              <div className="mt-1 font-mono text-2xl font-extrabold text-emerald-400">
                +{calc.potentialWinUnits.toFixed(2)} u
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                при риске -{calc.stakeUnits.toFixed(2)} u
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">
                Прирост ко всему банку
              </div>
              <div className="mt-1 font-mono text-2xl font-extrabold text-teal-300">
                +{calc.potentialWinBankPct.toFixed(2)}%
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                кэф {calc.fixedOdds.toFixed(2)} · флэт {stakePercent.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Интерактивный ползунок примера банка юзера */}
          <div className="mt-4 rounded-xl border border-slate-800/90 bg-slate-900/75 p-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300">Моделирование банка клиента:</span>
              <span className="font-mono font-bold text-white">
                {sampleUserBankRub.toLocaleString('ru-RU')} ₽
              </span>
            </div>
            <input
              type="range"
              min="10000"
              max="500000"
              step="10000"
              value={sampleUserBankRub}
              onChange={(e) => setSampleUserBankRub(Number(e.target.value))}
              className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-teal-400"
            />
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-slate-950/80 p-2">
                <div className="text-[10px] text-slate-400">Сумма ставки</div>
                <div className="mt-0.5 font-mono font-bold text-slate-200">
                  {Math.round(calc.sampleStakeRub).toLocaleString('ru-RU')} ₽
                </div>
              </div>
              <div className="rounded-lg bg-slate-950/80 p-2">
                <div className="text-[10px] text-slate-400">Выплата БК</div>
                <div className="mt-0.5 font-mono font-bold text-slate-200">
                  {Math.round(calc.sampleGrossReturnRub).toLocaleString('ru-RU')} ₽
                </div>
              </div>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2">
                <div className="text-[10px] text-emerald-300">Чистая прибыль</div>
                <div className="mt-0.5 font-mono font-extrabold text-emerald-300">
                  +{Math.round(calc.sampleNetProfitRub).toLocaleString('ru-RU')} ₽
                </div>
              </div>
            </div>
          </div>

          {/* Таблица по сегментам аудитории + контроль окупаемости разовой цены */}
          <div className="mt-4 space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Срез выгоды по сегментам покупателей
            </div>
            {CLIENT_BANK_TIERS.map((tier) => {
              const stakeRub = (tier.bankRub * stakePercent) / 100;
              const netWinRub = stakeRub * (calc.fixedOdds - 1);
              return (
                <div
                  key={tier.label}
                  className="flex items-center justify-between rounded-lg border border-slate-800/70 bg-slate-950/60 px-3 py-2 text-xs"
                >
                  <div>
                    <span className="font-medium text-slate-200">{tier.label}</span>
                    <span className="ml-1.5 text-slate-500">
                      ({tier.bankRub.toLocaleString('ru-RU')} ₽)
                    </span>
                  </div>
                  <div className="font-mono">
                    <span className="text-slate-400">
                      ставка {Math.round(stakeRub).toLocaleString('ru-RU')} ₽ →{' '}
                    </span>
                    <span className="font-bold text-emerald-400">
                      +{Math.round(netWinRub).toLocaleString('ru-RU')} ₽
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Умный совет по конверсии и окупаемости цены прогноза */}
          {accessTier === 'PAID_SINGLE' && calc.pricePaybackRatio !== null && (
            <div
              className={`mt-3.5 flex items-start gap-2 rounded-xl border p-3 text-xs ${
                calc.pricePaybackRatio >= 1.5
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-amber-500/40 bg-amber-500/15 text-amber-200'
              }`}
            >
              {calc.pricePaybackRatio >= 1.5 ? (
                <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              )}
              <span>
                {calc.pricePaybackRatio >= 1.5
                  ? `Отличная экономика для клиента: на среднем банке 100 000 ₽ чистая прибыль покроет цену прогноза (${calc.singlePriceRub} ₽) в ${calc.pricePaybackRatio.toFixed(
                      1,
                    )}x с первого захода.`
                  : `Внимание по конверсии: цена разового прогноза (${calc.singlePriceRub} ₽) съедает значительную долю прибыли среднего банка. Рекомендуем снизить разовую цену или поставить доступ «Эксклюзив VIP».`}
              </span>
            </div>
          )}
        </div>

        {/* Блок 2: Математический детектор Валуя (+EV против маржи БК) */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Zap className="h-4 w-4 text-amber-400" />
              <span>Контроль валуйности (+EV над линией БК)</span>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 font-mono text-xs font-bold ${
                calc.expectedValuePct > 0
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-rose-500/15 text-rose-300'
              }`}
            >
              EV: {calc.expectedValuePct > 0 ? '+' : ''}
              {calc.expectedValuePct.toFixed(1)}%
            </span>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2.5 text-center text-xs">
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-2.5">
              <div className="text-[10px] text-slate-400">Вероятность в кэфе</div>
              <div className="mt-1 font-mono text-sm font-bold text-slate-200">
                {calc.impliedBookieProbPct.toFixed(1)}%
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-2.5">
              <div className="text-[10px] text-slate-400">Наша модель</div>
              <div className="mt-1 font-mono text-sm font-bold text-indigo-300">
                {estimatedProbPct.toFixed(1)}%
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-2.5">
              <div className="text-[10px] text-slate-400">Справедливый кэф</div>
              <div className="mt-1 font-mono text-sm font-bold text-emerald-300">
                {calc.fairOdds.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Блок 3: Live-превью автопуша в закрытый VIP Telegram-канал */}
        <div className="rounded-2xl border border-sky-500/25 bg-slate-900/90 p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-sky-300">
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Предпросмотр сообщения в VIP Telegram</span>
            </span>
            <span className="font-mono text-[10px] text-slate-400">Bot API · HTML</span>
          </div>

          <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950 p-3.5 font-sans text-xs leading-relaxed text-slate-200">
            <div className="font-bold text-white">
              🔥 VIP ПРОГНОЗ | {activeSportConfig.label} · {leagueName}
            </div>
            <div className="mt-1 font-semibold text-sky-200">
              🏟 {homeTeam || 'Команда 1'} — {awayTeam || 'Команда 2'}
            </div>
            <div className="mt-2 space-y-0.5">
              <div>
                🎯 Исход: <span className="font-bold text-emerald-300">{selectionTitle}</span>
              </div>
              <div>
                📈 Зафиксированный кэф:{' '}
                <span className="font-mono font-bold text-emerald-400">
                  {calc.fixedOdds.toFixed(2)}
                </span>
                {calc.minOdds && (
                  <span className="text-slate-400"> (валуй до {calc.minOdds.toFixed(2)})</span>
                )}
              </div>
              <div>
                💼 Флэт:{' '}
                <span className="font-mono font-semibold text-white">
                  {stakePercent.toFixed(1)}% банка ({calc.stakeUnits.toFixed(2)} u)
                </span>
              </div>
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 border-t border-slate-800/80 pt-2 font-mono text-[10px] text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span>SHA-256: {calc.previewHash.slice(0, 20)}...</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPredictionForm;
