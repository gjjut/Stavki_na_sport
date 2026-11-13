'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Award,
  BarChart3,
  Check,
  CreditCard,
  Crown,
  ExternalLink,
  Flame,
  Gift,
  Link2,
  Lock,
  Plus,
  Send,
  ShieldCheck,
  Sliders,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import PredictionCard, {
  type MatchLifecycleStatus,
  type PredictionCardData,
  type PredictionResultStatus,
  type SportType,
} from '@/components/predictions/PredictionCard';
import {
  Sha256VerifierModal,
  type HashVerificationProof,
} from '@/components/predictions/Sha256VerifierModal';
import AdminPredictionForm, {
  type CreatePredictionPayload,
} from '@/components/admin/AdminPredictionForm';
import {
  AdminFinancePanel,
  AdminTelegramDispatchesPanel,
} from '@/components/admin/AdminFinanceAndTelegramPanel';
import { EquityCurveChart } from '@/components/stats/EquityCurveChart';
import { SocialProofToast } from '@/components/triggers/SocialProofToast';
import {
  YooKassaCheckoutModal,
  type CheckoutTarget,
} from '@/components/billing/YooKassaCheckoutModal';
import {
  EQUITY_CURVE_MONTHS,
  INITIAL_AFFILIATES,
  INITIAL_CRM_USERS,
  STATS_BY_PERIOD,
  type AffiliatePartnerRow,
  type CrmUserRow,
  type EquityPoint,
  type VerifiedStatsSnapshot,
} from '@/data/mockPlatformData';
import type {
  TariffPlanConfig,
  TelegramDispatchRecord,
  TransactionRecord,
  ViewerSessionState,
} from '@/server/platformStore';

type MainTab = 'FEED' | 'STATS' | 'TARIFFS' | 'CABINET' | 'ADMIN';
type StatsPeriod = 'ALL_TIME' | 'MONTH' | 'WEEK';
type AdminSubTab = 'PREDICTIONS' | 'FINANCE' | 'CRM' | 'AFFILIATES' | 'TELEGRAM';

interface BootstrapResponse {
  predictions: PredictionCardData[];
  statsByPeriod: Record<StatsPeriod, VerifiedStatsSnapshot>;
  equityCurve: EquityPoint[];
  tariffs: TariffPlanConfig[];
  defaultSinglePriceRub: number;
  viewer: ViewerSessionState;
  admin: {
    transactions: TransactionRecord[];
    crmUsers: CrmUserRow[];
    affiliates: AffiliatePartnerRow[];
    telegramDispatches: TelegramDispatchRecord[];
  };
}

export default function TipsterPlatformPage() {
  const [activeTab, setActiveTab] = useState<MainTab>('FEED');
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('ALL_TIME');

  // Фильтры ленты прогнозов
  const [sportFilter, setSportFilter] = useState<'ALL' | SportType>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | MatchLifecycleStatus>('ALL');

  // Серверное состояние платформы (подгружается из /api/v1/bootstrap)
  const [predictions, setPredictions] = useState<PredictionCardData[]>([]);
  const [statsMap, setStatsMap] =
    useState<Record<StatsPeriod, VerifiedStatsSnapshot>>(STATS_BY_PERIOD);
  const [equityCurve, setEquityCurve] = useState<EquityPoint[]>(EQUITY_CURVE_MONTHS);
  const [tariffs, setTariffs] = useState<TariffPlanConfig[]>([
    {
      code: 'VIP_7D',
      name: 'VIP · 1 неделя',
      badge: 'Тест-драйв системы',
      durationDays: 7,
      priceRub: 1_990,
      oldPriceRub: 2_900,
      supportsAutoRenew: true,
      features: [
        'Все прогнозы на сайте без размытия (15–20 ставок)',
        'Одноразовый инвайт в закрытый VIP Telegram-канал',
        'Уведомления о ранней линии и Live Cashout',
      ],
    },
    {
      code: 'VIP_30D',
      name: 'VIP · 1 месяц',
      badge: 'Оптимальная дистанция',
      durationDays: 30,
      priceRub: 4_990,
      oldPriceRub: 9_900,
      supportsAutoRenew: true,
      features: [
        'Полный доступ ко всем смолл-маркетам и пиннакл-валуям',
        'Мгновенные пуши в закрытый VIP Telegram за секунду до просадки',
        'Персональный калькулятор Флэта и защита от тильта',
      ],
    },
    {
      code: 'VIP_LIFETIME',
      name: 'VIP · Навсегда',
      badge: 'Без повторных платежей',
      durationDays: null,
      priceRub: 24_900,
      oldPriceRub: 45_000,
      supportsAutoRenew: false,
      features: [
        'Пожизненный доступ ко всем прогнозам и закрытому VIP-клубу',
        'Приоритетная рассылка смолл-маркетов до прогрузки линии',
        'Прямая обратная связь с главным аналитиком по вашему банку',
      ],
    },
  ]);
  const [defaultSinglePriceRub, setDefaultSinglePriceRub] = useState<number>(790);

  const [viewer, setViewer] = useState<ViewerSessionState>({
    userId: 'viewer_current',
    email: 'bettor@example.ru',
    status: 'ACTIVE',
    hasActiveVip: false,
    vipPlanLabel: null,
    vipExpiresAt: null,
    autoRenewEnabled: false,
    vipInviteLink: null,
    purchasedPredictionIds: [],
    referenceBankrollRub: 100_000,
    balanceRub: 1_500,
    attributedRefCode: null,
  });

  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [crmUsers, setCrmUsers] = useState<CrmUserRow[]>(INITIAL_CRM_USERS);
  const [affiliates, setAffiliates] = useState<AffiliatePartnerRow[]>(INITIAL_AFFILIATES);
  const [telegramDispatches, setTelegramDispatches] = useState<TelegramDispatchRecord[]>([]);

  // Модалки оплаты и SHA-256 верификатора
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutTarget | null>(null);
  const [hashProof, setHashProof] = useState<HashVerificationProof | null>(null);
  const [hashError, setHashError] = useState<string | null>(null);

  // Подразделы Админ-панели и форма реф-ссылок
  const [adminSubTab, setAdminSubTab] = useState<AdminSubTab>('PREDICTIONS');
  const [newRefCode, setNewRefCode] = useState('tg_sport_value');
  const [newRefSource, setNewRefSource] = useState('Посев в Telegram-канале');
  const [bankrollDraft, setBankrollDraft] = useState<string>('100000');

  const applyServerBootstrap = useCallback((raw: unknown) => {
    const data = raw as BootstrapResponse;
    if (!data || !Array.isArray(data.predictions)) return;
    setPredictions(data.predictions);
    setStatsMap(data.statsByPeriod);
    setEquityCurve(data.equityCurve);
    setTariffs(data.tariffs);
    setDefaultSinglePriceRub(data.defaultSinglePriceRub);
    setViewer(data.viewer);
    setBankrollDraft(String(data.viewer.referenceBankrollRub));
    setTransactions(data.admin.transactions);
    setCrmUsers(data.admin.crmUsers);
    setAffiliates(data.admin.affiliates);
    setTelegramDispatches(data.admin.telegramDispatches);
  }, []);

  // Первичная загрузка данных с сервера + захват ?ref= параметра вебмастера
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    const url = ref ? `/api/v1/bootstrap?ref=${encodeURIComponent(ref)}` : '/api/v1/bootstrap';
    fetch(url)
      .then((res) => res.json())
      .then(applyServerBootstrap)
      .catch(() => {});
  }, [applyServerBootstrap]);

  const filteredPredictions = useMemo(() => {
    return predictions.filter((item) => {
      const sportOk = sportFilter === 'ALL' || item.sport === sportFilter;
      const statusOk = statusFilter === 'ALL' || item.matchStatus === statusFilter;
      return sportOk && statusOk;
    });
  }, [predictions, sportFilter, statusFilter]);

  const activeStats = statsMap[statsPeriod];

  // Проверка криптографического хеша SHA-256 через серверный node:crypto
  const handleVerifyHash = async (predictionId: string) => {
    setHashProof(null);
    setHashError(null);
    const res = await fetch('/api/v1/predictions/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ predictionId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setHashError(data.error || 'Не удалось проверить хеш');
    } else {
      setHashProof(data as HashVerificationProof);
    }
  };

  // Открытие модалки покупки разового прогноза
  const handleBuySingle = (predictionId: string) => {
    const found = predictions.find((p) => p.id === predictionId);
    if (!found) return;
    setCheckoutTarget({
      kind: 'SINGLE_PREDICTION',
      predictionId: found.id,
      title: `Прогноз: ${found.homeTeam} — ${found.awayTeam} (${found.leagueName})`,
      amountRub: found.singlePriceRub ?? defaultSinglePriceRub,
      supportsAutoRenew: false,
    });
  };

  // Открытие модалки покупки VIP-подписки
  const handleOpenVipCheckout = (plan: TariffPlanConfig) => {
    setCheckoutTarget({
      kind: 'VIP_SUBSCRIPTION',
      planCode: plan.code,
      title: plan.name,
      amountRub: plan.priceRub,
      supportsAutoRenew: plan.supportsAutoRenew,
    });
  };

  // Сохранение рабочего банка юзера на сервере
  const handleSaveBankroll = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/v1/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referenceBankrollRub: Math.max(1000, Number(bankrollDraft) || 50000) }),
    });
    if (res.ok) applyServerBootstrap(await res.json());
  };

  const handleCancelAutoRenew = async () => {
    const res = await fetch('/api/v1/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cancelAutoRenew: true }),
    });
    if (res.ok) applyServerBootstrap(await res.json());
  };

  const handleTopupDemoBalance = async () => {
    const res = await fetch('/api/v1/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topupBalanceRub: 2000 }),
    });
    if (res.ok) applyServerBootstrap(await res.json());
  };

  const handleSimulateReferralVisit = async (code: string) => {
    const res = await fetch('/api/v1/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bindRefCode: code }),
    });
    if (res.ok) applyServerBootstrap(await res.json());
  };

  // Админка: создание нового прогноза на сервере
  const handleAdminPublish = async (payload: CreatePredictionPayload) => {
    const res = await fetch('/api/v1/admin/predictions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) applyServerBootstrap(await res.json());
  };

  // Админка: оперативный расчет прогноза (Win / Loss / Push / Cashout)
  const handleAdminQuickSettle = async (
    predictionId: string,
    resultStatus: Exclude<PredictionResultStatus, 'PENDING'>,
  ) => {
    const res = await fetch('/api/v1/admin/predictions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ predictionId, resultStatus }),
    });
    if (res.ok) applyServerBootstrap(await res.json());
  };

  // Админка: сохранение новых цен тарифов
  const handleSaveTariffs = async (patch: {
    defaultSinglePriceRub: number;
    tariffs: Array<{
      code: 'VIP_7D' | 'VIP_30D' | 'VIP_LIFETIME';
      priceRub: number;
      oldPriceRub: number;
    }>;
  }) => {
    const res = await fetch('/api/v1/admin/tariffs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) applyServerBootstrap(await res.json());
  };

  // Админка: возврат средств через Webhook refund.succeeded
  const handleTriggerRefund = async (yookassaPaymentId: string) => {
    const res = await fetch('/api/v1/webhooks/yookassa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'notification',
        event: 'refund.succeeded',
        object: { id: `rf_${Date.now()}`, payment_id: yookassaPaymentId },
      }),
    });
    if (res.ok) {
      const data = await res.json();
      applyServerBootstrap(data.state);
    }
  };

  // Админка: действия CRM и Партнерки
  const handleCrmUserAction = async (
    userId: string,
    action: 'TOGGLE_BLOCK' | 'GRANT_PROMO_VIP',
  ) => {
    const res = await fetch('/api/v1/admin/crm', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: 'USER', userId, action }),
    });
    if (res.ok) applyServerBootstrap(await res.json());
  };

  const handleCreateReferralLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRefCode.trim()) return;
    const res = await fetch('/api/v1/admin/crm', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: 'AFFILIATE',
        action: 'CREATE_LINK',
        code: newRefCode,
        source: newRefSource,
      }),
    });
    if (res.ok) {
      applyServerBootstrap(await res.json());
      setNewRefCode('');
    }
  };

  const handleUpdateAffiliateRate = async (affiliateId: string, revsharePct: number) => {
    const res = await fetch('/api/v1/admin/crm', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: 'AFFILIATE',
        action: 'UPDATE_RATE',
        affiliateId,
        revsharePct,
      }),
    });
    if (res.ok) applyServerBootstrap(await res.json());
  };

  const viewerTransactions = useMemo(
    () => transactions.filter((t) => t.userId === viewer.userId),
    [transactions, viewer.userId],
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* ВЕРХНЯЯ НАВИГАЦИЯ */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 font-mono text-sm font-black text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.35)]">
              +EV
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold tracking-tight text-white">
                  VALUEX<span className="text-emerald-400">.PRO</span>
                </span>
                <span className="hidden rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300 sm:inline-block">
                  SHA-256 Verified
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Математический валуй-беттинг без «100% договорняков»
              </p>
            </div>
          </div>

          {/* Навигация по разделам */}
          <nav className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/90 p-1">
            {(
              [
                { id: 'FEED', label: 'Витрина и Прогнозы', Icon: Flame },
                { id: 'STATS', label: 'Equity Curve', Icon: BarChart3 },
                { id: 'TARIFFS', label: 'Тарифы VIP', Icon: Crown },
                { id: 'CABINET', label: 'Кабинет / Рефералы', Icon: Wallet },
                { id: 'ADMIN', label: 'Админ-панель', Icon: Sliders },
              ] as const
            ).map(({ id, label, Icon }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? 'bg-emerald-500 text-slate-950 shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>

          {/* Статус VIP пользователя */}
          <div className="hidden items-center gap-2.5 lg:flex">
            {viewer.status === 'BLOCKED' ? (
              <span className="rounded-full border border-rose-500/40 bg-rose-500/15 px-3 py-1 text-xs font-bold text-rose-300">
                АККАУНТ ЗАБЛОКИРОВАН
              </span>
            ) : viewer.hasActiveVip ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/15 px-3 py-1 text-xs font-bold text-amber-200">
                <Crown className="h-3.5 w-3.5 text-amber-300" />
                <span>VIP АКТИВЕН · Все замки сняты</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab('TARIFFS')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3.5 py-1.5 text-xs font-bold text-amber-200 transition hover:bg-amber-400/20"
              >
                <Crown className="h-3.5 w-3.5 text-amber-300" />
                <span>Подключить VIP (-75%)</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* ===================================================================== */}
        {/* ВКЛАДКА 1: ГЛАВНЫЙ ЭКРАН (ТРИГГЕР ДОВЕРИЯ + ЛЕНТА ПРОГНОЗОВ)          */}
        {/* ===================================================================== */}
        {activeTab === 'FEED' && (
          <div className="space-y-8">
            <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900/95 to-emerald-950/30 p-6 shadow-2xl sm:p-8">
              <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
                <div className="space-y-4 lg:col-span-6">
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>Коэффициенты фиксируются криптографически до начала матча</span>
                  </div>

                  <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">
                    Спортивная аналитика на перекосах линии{' '}
                    <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
                      с дистанционным +EV
                    </span>
                  </h1>

                  <p className="text-sm leading-relaxed text-slate-300 sm:text-base">
                    Никаких сказок про «99% проходимости» и «инсайдов». Только математический обход маржи букмекера по ранней линии Pinnacle, строгий Флэт 1–3% от банка и открытый архив каждого плюса и минуса.
                  </p>

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const monthPlan =
                          tariffs.find((t) => t.code === 'VIP_30D') ?? tariffs[0];
                        if (monthPlan) handleOpenVipCheckout(monthPlan);
                      }}
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-5 py-3 text-sm font-extrabold text-slate-950 shadow-[0_0_28px_rgba(16,185,129,0.35)] transition hover:brightness-110"
                    >
                      <Crown className="h-4 w-4" />
                      <span>Получить полный VIP-доступ</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('STATS')}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:text-white"
                    >
                      <BarChart3 className="h-4 w-4 text-emerald-400" />
                      <span>График роста банка (Equity Curve)</span>
                    </button>
                  </div>
                </div>

                {/* Виджет «Верифицированная статистика» */}
                <div className="rounded-2xl border border-slate-800 bg-slate-950/90 p-5 shadow-inner lg:col-span-6">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3.5">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-emerald-400" />
                      <span className="text-xs font-bold uppercase tracking-wider text-white">
                        Верифицированная статистика
                      </span>
                    </div>

                    <div className="flex rounded-lg border border-slate-800 bg-slate-900 p-0.5 text-[11px]">
                      {(
                        [
                          { key: 'WEEK', label: '7 дней' },
                          { key: 'MONTH', label: '30 дней' },
                          { key: 'ALL_TIME', label: 'Всё время' },
                        ] as const
                      ).map((p) => (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => setStatsPeriod(p.key)}
                          className={`rounded-md px-2.5 py-1 font-semibold transition ${
                            statsPeriod === p.key
                              ? 'bg-emerald-500 text-slate-950'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-800/90 bg-slate-900/70 p-3.5">
                      <div className="text-[11px] text-slate-400">Прирост к банку (ROI)</div>
                      <div className="mt-1 font-mono text-2xl font-extrabold text-emerald-400">
                        +{activeStats.roiBankrollPct}%
                      </div>
                      <div className="font-mono text-[11px] text-slate-500">
                        +{activeStats.netProfitUnits} юнитов
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800/90 bg-slate-900/70 p-3.5">
                      <div className="text-[11px] text-slate-400">Yield (чистый с оборота)</div>
                      <div className="mt-1 font-mono text-2xl font-extrabold text-teal-300">
                        +{activeStats.yieldPct}%
                      </div>
                      <div className="text-[11px] text-slate-500">
                        на {activeStats.settledBets} ставках
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800/90 bg-slate-900/70 p-3.5">
                      <div className="text-[11px] text-slate-400">Win Rate (без возвратов)</div>
                      <div className="mt-1 font-mono text-2xl font-extrabold text-white">
                        {activeStats.winRatePct}%
                      </div>
                      <div className="text-[11px] text-slate-500">
                        средний кэф {activeStats.avgOdds.toFixed(2)}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800/90 bg-slate-900/70 p-3.5">
                      <div className="text-[11px] text-slate-400">Текущая серия побед</div>
                      <div className="mt-1 flex items-center gap-1.5 font-mono text-xl font-extrabold text-amber-300">
                        <Flame className="h-4 w-4 text-amber-400" />
                        <span>{activeStats.currentWinStreak} WIN подряд</span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800/90 bg-slate-900/70 p-3.5">
                      <div className="text-[11px] text-slate-400">Макс. просадка банка</div>
                      <div className="mt-1 font-mono text-xl font-bold text-slate-200">
                        -{activeStats.maxDrawdownPct}%
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800/90 bg-slate-900/70 p-3.5">
                      <div className="text-[11px] text-slate-400">Баланс исходов</div>
                      <div className="mt-1.5 font-mono text-xs font-bold text-slate-300">
                        <span className="text-emerald-400">{activeStats.wins}W</span> ·{' '}
                        <span className="text-rose-400">{activeStats.losses}L</span> ·{' '}
                        <span className="text-amber-300">{activeStats.pushes}P</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Лента прогнозов с фильтрами */}
            <section className="space-y-4">
              <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 lg:flex-row lg:items-center">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { value: 'ALL', label: 'Все виды спорта' },
                      { value: 'FOOTBALL', label: '⚽ Футбол' },
                      { value: 'HOCKEY', label: '🏒 Хоккей' },
                      { value: 'TENNIS', label: '🎾 Теннис' },
                      { value: 'ESPORTS', label: '🎮 Киберспорт' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setSportFilter(item.value)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                        sportFilter === item.value
                          ? 'bg-emerald-500 text-slate-950'
                          : 'border border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      { value: 'ALL', label: 'Все статусы' },
                      { value: 'UPCOMING', label: 'Ожидает' },
                      { value: 'LIVE', label: 'В игре (LIVE)' },
                      { value: 'FINISHED', label: 'Завершен' },
                    ] as const
                  ).map((st) => (
                    <button
                      key={st.value}
                      type="button"
                      onClick={() => setStatusFilter(st.value)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                        statusFilter === st.value
                          ? 'border border-indigo-400/50 bg-indigo-500/20 text-indigo-200'
                          : 'border border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5">
                {filteredPredictions.map((pred) => (
                  <PredictionCard
                    key={pred.id}
                    prediction={pred}
                    userReferenceBankrollRub={viewer.referenceBankrollRub}
                    onBuySingle={handleBuySingle}
                    onOpenVipPlans={() => setActiveTab('TARIFFS')}
                    onVerifyHash={handleVerifyHash}
                  />
                ))}

                {filteredPredictions.length === 0 && (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-10 text-center text-sm text-slate-400">
                    По выбранным фильтрам сейчас нет прогнозов.
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* ===================================================================== */}
        {/* ВКЛАДКА 2: EQUITY CURVE И ПРОЗРАЧНАЯ МЕТОДОЛОГИЯ                      */}
        {/* ===================================================================== */}
        {activeTab === 'STATS' && (
          <div className="space-y-6">
            <EquityCurveChart points={equityCurve} />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
                <h4 className="text-sm font-bold text-white">1. Строгая фиксация кэфа</h4>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                  В момент публикации генерируется SHA-256 от связки времени матча, исхода, кэфа и юнитов. Нажмите «Проверить SHA-256 до матча» на любой завершенной карточке — сервер пересчитает хеш в реальном времени.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
                <h4 className="text-sm font-bold text-white">2. Система Флэт (1 u = 1% банка)</h4>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                  Никаких догонов и овербетов. Рабочий коридор — от 1% до 3% от начального банка на ставку, поэтому даже неблагоприятная серия дает контролируемую просадку менее 8%.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
                <h4 className="text-sm font-bold text-white">3. Разница ROI и Yield</h4>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                  <strong className="text-slate-200">Yield (+{activeStats.yieldPct}%)</strong> — чистая отдача с каждого проставленного юнита оборота, а{' '}
                  <strong className="text-slate-200">Прирост к банку (+{activeStats.roiBankrollPct}%)</strong> — фактическое увеличение стартового капитала.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* ВКЛАДКА 3: ТАРИФЫ VIP И СРАВНЕНИЕ С БЕСПЛАТНЫМ КАНАЛОМ                */}
        {/* ===================================================================== */}
        {activeTab === 'TARIFFS' && (
          <div className="space-y-8">
            <div className="text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-200">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Как обходится маржа букмекера (5–7%) на дистанции</span>
              </span>
              <h2 className="mt-3 text-2xl font-extrabold text-white sm:text-3xl">
                Тарифы доступа и сравнение с бесплатным каналом
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              {tariffs.map((plan) => {
                const isPopular = plan.code === 'VIP_30D';
                const isLifetime = plan.code === 'VIP_LIFETIME';
                return (
                  <div
                    key={plan.code}
                    className={`relative flex flex-col justify-between rounded-2xl p-6 ${
                      isPopular
                        ? 'border-2 border-emerald-400/70 bg-gradient-to-b from-slate-900 to-slate-950 shadow-[0_0_35px_rgba(16,185,129,0.18)]'
                        : isLifetime
                          ? 'border border-amber-400/35 bg-slate-900/90'
                          : 'border border-slate-800 bg-slate-900/90'
                    }`}
                  >
                    {isPopular && (
                      <span className="absolute -top-3 right-5 rounded-full bg-emerald-400 px-3 py-0.5 text-[11px] font-extrabold uppercase text-slate-950">
                        Выбор 74% клиентов
                      </span>
                    )}
                    <div>
                      <div
                        className={`text-xs font-bold uppercase tracking-wider ${
                          isPopular
                            ? 'text-emerald-400'
                            : isLifetime
                              ? 'text-amber-300'
                              : 'text-slate-400'
                        }`}
                      >
                        {plan.badge}
                      </div>
                      <h3 className="mt-1 text-xl font-bold text-white">{plan.name}</h3>
                      <div className="mt-4 flex items-baseline gap-2">
                        <span
                          className={`font-mono text-3xl font-extrabold ${
                            isPopular
                              ? 'text-emerald-400'
                              : isLifetime
                                ? 'text-amber-300'
                                : 'text-white'
                          }`}
                        >
                          {plan.priceRub.toLocaleString('ru-RU')} ₽
                        </span>
                        <span className="font-mono text-sm text-slate-500 line-through">
                          {plan.oldPriceRub.toLocaleString('ru-RU')} ₽
                        </span>
                      </div>

                      <ul className="mt-5 space-y-2.5 text-xs text-slate-200">
                        {plan.features.map((feat) => (
                          <li key={feat} className="flex items-center gap-2">
                            <Check
                              className={`h-4 w-4 shrink-0 ${
                                isLifetime ? 'text-amber-300' : 'text-emerald-400'
                              }`}
                            />
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenVipCheckout(plan)}
                      className={`mt-6 w-full rounded-xl py-3 text-sm font-extrabold transition ${
                        isPopular
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 hover:brightness-110'
                          : isLifetime
                            ? 'border border-amber-400/50 bg-amber-400/15 text-amber-200 hover:bg-amber-400 hover:text-slate-950'
                            : 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500 hover:text-slate-950'
                      }`}
                    >
                      Оформить · {plan.priceRub.toLocaleString('ru-RU')} ₽
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Таблица сравнения Бесплатно (Telegram) vs VIP (Сайт) */}
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90">
              <div className="border-b border-slate-800 px-6 py-4">
                <h3 className="text-base font-bold text-white">
                  Сравнение: Бесплатный Telegram-канал vs VIP-аналитика на платформе
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/70 text-slate-400">
                      <th className="px-6 py-3.5 font-semibold">Критерий дистанции</th>
                      <th className="px-6 py-3.5 font-semibold">Бесплатно (Telegram)</th>
                      <th className="px-6 py-3.5 font-semibold text-emerald-400">
                        VIP Платформа + Закрытый Бот
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    <tr>
                      <td className="px-6 py-3.5 font-medium text-white">
                        Обход маржи букмекера (5–7%)
                      </td>
                      <td className="px-6 py-3.5 text-slate-400">
                        Биг-маркеты с уже выжатой линией (EV около 0%)
                      </td>
                      <td className="px-6 py-3.5 font-semibold text-emerald-300">
                        Ранние перекосы линии с перевесом +6%…+11% (+EV валуи)
                      </td>
                    </tr>
                    <tr>
                      <td className="px-6 py-3.5 font-medium text-white">
                        Удержание коэффициента
                      </td>
                      <td className="px-6 py-3.5 text-slate-400">
                        Толпа прогружает кэф за 2 минуты с 1.95 до 1.68
                      </td>
                      <td className="px-6 py-3.5 text-slate-200">
                        Закрытый пул + точный порог «брать валуй от 1.85»
                      </td>
                    </tr>
                    <tr>
                      <td className="px-6 py-3.5 font-medium text-white">
                        Сигналы Cashout в лайве
                      </td>
                      <td className="px-6 py-3.5 text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <X className="h-3.5 w-3.5 text-rose-400" /> Отсутствует
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-emerald-300">
                        Мгновенный пуш в бота при красной карточке / травме лидера
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* ВКЛАДКА 4: ЛИЧНЫЙ КАБИНЕТ И ПАРТНЕРСКАЯ ПРОГРАММА                     */}
        {/* ===================================================================== */}
        {activeTab === 'CABINET' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              {/* Настройка игрового банка и внутреннего депозита */}
              <form
                onSubmit={handleSaveBankroll}
                className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase text-slate-400">
                    Мой банк и внутренний депозит
                  </span>
                  <Wallet className="h-4 w-4 text-emerald-400" />
                </div>

                <div className="mt-3">
                  <label className="text-xs text-slate-300">
                    Ваш рабочий банк в БК (для подсказок флэта в карточках):
                  </label>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      step="5000"
                      min="1000"
                      value={bankrollDraft}
                      onChange={(e) => setBankrollDraft(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 font-mono text-base font-bold text-emerald-400"
                    />
                    <button
                      type="submit"
                      className="rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400"
                    >
                      ОК
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs">
                  <div>
                    <div className="text-slate-400">Депозит на сайте:</div>
                    <div className="font-mono text-base font-extrabold text-white">
                      {viewer.balanceRub.toLocaleString('ru-RU')} ₽
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleTopupDemoBalance}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 font-semibold text-emerald-300 hover:bg-emerald-500/20"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>+2 000 ₽</span>
                  </button>
                </div>
              </form>

              {/* Статус VIP и одноразовый TG-инвайт */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase text-slate-400">
                    Активная подписка и VIP Telegram
                  </span>
                  <Crown className="h-4 w-4 text-amber-300" />
                </div>

                {viewer.hasActiveVip ? (
                  <div className="mt-3 space-y-2.5 text-xs">
                    <div className="text-base font-bold text-emerald-300">
                      {viewer.vipPlanLabel}
                    </div>
                    {viewer.vipInviteLink && (
                      <div className="flex items-center justify-between rounded-lg border border-sky-500/30 bg-slate-950 px-3 py-2 font-mono text-[11px] text-sky-300">
                        <span className="truncate">{viewer.vipInviteLink}</span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      </div>
                    )}
                    <div className="text-slate-400">
                      Автопродление ЮKassa:{' '}
                      <strong className="text-white">
                        {viewer.autoRenewEnabled ? 'Включено' : 'Отключено'}
                      </strong>
                    </div>
                    {viewer.autoRenewEnabled && (
                      <button
                        type="button"
                        onClick={handleCancelAutoRenew}
                        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 hover:border-rose-500/40 hover:text-rose-300"
                      >
                        Отключить автопродление в 1 клик
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div className="text-sm font-semibold text-slate-200">
                      Активной VIP-подписки пока нет
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('TARIFFS')}
                      className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400"
                    >
                      Выбрать тариф VIP
                    </button>
                  </div>
                )}
              </div>

              {/* История покупок и чеков */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase text-slate-400">
                    Мои покупки ({viewerTransactions.length})
                  </span>
                  <Award className="h-4 w-4 text-sky-400" />
                </div>
                <div className="mt-3 max-h-40 space-y-2 overflow-y-auto pr-1">
                  {viewerTransactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between font-semibold text-white">
                        <span className="truncate pr-2">{tx.title}</span>
                        <span className="shrink-0 font-mono text-emerald-400">
                          {tx.amountRub.toLocaleString('ru-RU')} ₽
                        </span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-400">
                        Статус: {tx.status} · Чек: {tx.receiptStatus}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Партнерский кабинет вебмастера */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-white">
                    Партнерская программа (RevShare до 50% с оплат и рекуррентов)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Текущая реф-привязка вашей сессии:{' '}
                    <span className="font-mono text-sky-300">
                      {viewer.attributedRefCode ? `?ref=${viewer.attributedRefCode}` : 'не привязана'}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleSimulateReferralVisit('khl_insider')}
                  className="rounded-xl border border-sky-500/35 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-500/20"
                >
                  Тест перехода по `?ref=khl_insider`
                </button>
              </div>

              <form
                onSubmit={handleCreateReferralLink}
                className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3"
              >
                <input
                  type="text"
                  value={newRefCode}
                  onChange={(e) => setNewRefCode(e.target.value)}
                  placeholder="Код ссылки (напр. khl_vip_2026)"
                  className="rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 font-mono text-xs text-white"
                />
                <input
                  type="text"
                  value={newRefSource}
                  onChange={(e) => setNewRefSource(e.target.value)}
                  placeholder="Источник / SubID (напр. Посев Хоккей)"
                  className="rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-xs text-white"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-extrabold text-slate-950 hover:bg-emerald-400"
                >
                  <Link2 className="h-4 w-4" />
                  <span>Сгенерировать реф-ссылку</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* ВКЛАДКА 5: ПОЛНАЯ АДМИН-ПАНЕЛЬ (ВСЕ 5 МОДУЛЕЙ РАЗДЕЛА 4)              */}
        {/* ===================================================================== */}
        {activeTab === 'ADMIN' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-900/90 p-3.5">
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: 'PREDICTIONS', label: '1. Прогнозы и Расчет', Icon: TrendingUp },
                    { id: 'FINANCE', label: '2. Тарифы и ЮKassa', Icon: CreditCard },
                    { id: 'CRM', label: '3. CRM и Промо-VIP', Icon: Users },
                    { id: 'AFFILIATES', label: '4. Рефералы (% RevShare)', Icon: UserCheck },
                    { id: 'TELEGRAM', label: '5. Telegram Автопуши', Icon: Send },
                  ] as const
                ).map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setAdminSubTab(id)}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                      adminSubTab === id
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-950 text-slate-300 hover:text-white'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {adminSubTab === 'PREDICTIONS' && (
              <div className="space-y-6">
                <AdminPredictionForm onPublishPrediction={handleAdminPublish} />

                <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5">
                  <h3 className="text-base font-bold text-white">
                    Оперативный расчет матчей (автопересчет ROI/Yield на сервере + пуш отчета)
                  </h3>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400">
                          <th className="py-2.5 pr-4">Матч / Лига</th>
                          <th className="px-3 py-2.5">Флэт</th>
                          <th className="px-3 py-2.5">Статус / Прибыль</th>
                          <th className="px-3 py-2.5 text-right">Рассчитать в 1 клик</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {predictions.slice(0, 8).map((item) => (
                          <tr key={item.id}>
                            <td className="py-3 pr-4">
                              <div className="font-bold text-white">
                                {item.homeTeam} — {item.awayTeam}
                              </div>
                              <div className="text-[11px] text-slate-400">{item.leagueName}</div>
                            </td>
                            <td className="px-3 py-3 font-mono text-emerald-300">
                              {item.stakePercent}% ({item.stakeUnits} u)
                            </td>
                            <td className="px-3 py-3 font-mono font-bold text-slate-200">
                              {item.resultStatus}
                              {item.profitUnits !== null &&
                                ` (${item.profitUnits > 0 ? '+' : ''}${item.profitUnits} u)`}
                            </td>
                            <td className="px-3 py-3 text-right">
                              <div className="inline-flex flex-wrap justify-end gap-1.5">
                                {(['WIN', 'LOSS', 'PUSH', 'CASHOUT'] as const).map((st) => (
                                  <button
                                    key={st}
                                    type="button"
                                    onClick={() => handleAdminQuickSettle(item.id, st)}
                                    className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 font-mono text-[11px] font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-300"
                                  >
                                    {st}
                                  </button>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {adminSubTab === 'FINANCE' && (
              <AdminFinancePanel
                tariffs={tariffs}
                defaultSinglePriceRub={defaultSinglePriceRub}
                transactions={transactions}
                onSaveTariffs={handleSaveTariffs}
                onTriggerRefund={handleTriggerRefund}
              />
            )}

            {adminSubTab === 'CRM' && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-lg font-bold text-white">
                    CRM пользователей: блокировка и ручная выдача промо-доступов
                  </h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleCrmUserAction('viewer_current', 'GRANT_PROMO_VIP')}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-400/15 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-400/25"
                    >
                      <Gift className="h-3.5 w-3.5" />
                      <span>Выдать Промо-VIP моей сессии</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCrmUserAction('viewer_current', 'TOGGLE_BLOCK')}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-rose-500/40 hover:text-rose-300"
                    >
                      <Lock className="h-3.5 w-3.5" />
                      <span>{viewer.status === 'ACTIVE' ? 'Тест бана моей сессии' : 'Разбанить мою сессию'}</span>
                    </button>
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="py-3 pr-4">Пользователь / TG</th>
                        <th className="px-3 py-3">Тариф</th>
                        <th className="px-3 py-3">LTV Оплаты</th>
                        <th className="px-3 py-3">Статус</th>
                        <th className="px-3 py-3 text-right">Действия CRM</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {crmUsers.map((u) => (
                        <tr key={u.id}>
                          <td className="py-3.5 pr-4">
                            <div className="font-bold text-white">{u.name}</div>
                            <div className="text-[11px] text-slate-400">
                              {u.email} · <span className="text-sky-300">{u.telegram}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3.5 text-slate-200">{u.planLabel}</td>
                          <td className="px-3 py-3.5 font-mono font-bold text-emerald-400">
                            {u.spentRub.toLocaleString('ru-RU')} ₽
                          </td>
                          <td className="px-3 py-3.5">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                                u.status === 'ACTIVE'
                                  ? 'bg-emerald-500/15 text-emerald-300'
                                  : 'bg-rose-500/15 text-rose-300'
                              }`}
                            >
                              {u.status === 'ACTIVE' ? 'АКТИВЕН' : 'ЗАБЛОКИРОВАН'}
                            </span>
                          </td>
                          <td className="px-3 py-3.5 text-right">
                            <div className="inline-flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleCrmUserAction(u.id, 'GRANT_PROMO_VIP')}
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200 hover:bg-amber-400/20"
                              >
                                <Gift className="h-3 w-3" />
                                <span>Промо VIP</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCrmUserAction(u.id, 'TOGGLE_BLOCK')}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:border-rose-500/40 hover:text-rose-300"
                              >
                                <Lock className="h-3 w-3" />
                                <span>{u.status === 'ACTIVE' ? 'Бан' : 'Разбан'}</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {adminSubTab === 'AFFILIATES' && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6">
                <h3 className="text-lg font-bold text-white">
                  Вебмастера, воронка реф-ссылок и настройка % RevShare
                </h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="py-3 pr-4">Вебмастер / Источник</th>
                        <th className="px-3 py-3">Реф-код</th>
                        <th className="px-3 py-3">Клики → Рег → Оплаты</th>
                        <th className="px-3 py-3">Выручка</th>
                        <th className="px-3 py-3 text-right">Ставка % RevShare</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {affiliates.map((af) => (
                        <tr key={af.id}>
                          <td className="py-3.5 pr-4">
                            <div className="font-bold text-white">{af.webmaster}</div>
                            <div className="text-[11px] text-slate-400">{af.source}</div>
                          </td>
                          <td className="px-3 py-3.5 font-mono text-sky-300">?ref={af.code}</td>
                          <td className="px-3 py-3.5 font-mono text-slate-300">
                            {af.clicks} → {af.registrations} →{' '}
                            <span className="font-bold text-emerald-400">{af.buyers}</span>
                          </td>
                          <td className="px-3 py-3.5 font-mono font-bold text-white">
                            {af.revenueRub.toLocaleString('ru-RU')} ₽
                          </td>
                          <td className="px-3 py-3.5 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              {[30, 35, 40, 50].map((pct) => (
                                <button
                                  key={pct}
                                  type="button"
                                  onClick={() => handleUpdateAffiliateRate(af.id, pct)}
                                  className={`rounded-lg px-2.5 py-1 font-mono text-[11px] font-bold ${
                                    af.revsharePct === pct
                                      ? 'bg-emerald-500 text-slate-950'
                                      : 'border border-slate-700 bg-slate-950 text-slate-300'
                                  }`}
                                >
                                  {pct}%
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {adminSubTab === 'TELEGRAM' && (
              <AdminTelegramDispatchesPanel dispatches={telegramDispatches} />
            )}
          </div>
        )}
      </main>

      <SocialProofToast />

      <YooKassaCheckoutModal
        target={checkoutTarget}
        viewerBalanceRub={viewer.balanceRub}
        defaultEmail={viewer.email}
        onClose={() => setCheckoutTarget(null)}
        onServerStateSynced={applyServerBootstrap}
      />

      <Sha256VerifierModal
        proof={hashProof}
        error={hashError}
        onClose={() => {
          setHashProof(null);
          setHashError(null);
        }}
      />
    </div>
  );
}
