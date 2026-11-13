'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BarChart3,
  CreditCard,
  FilePlus2,
  Send,
  Settings,
  Share2,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { SPORT_LABELS } from '@/components/predictions/PredictionCard';
import type {
  AccessTier,
  AffiliateLinkRecord,
  AffiliatePayoutRequest,
  OrderTransaction,
  PlatformSettings,
  PredictionRecord,
  ResultStatus,
  SafeSessionUser,
  SportType,
  StatsSummary,
} from '@/server/types';

interface AdminUserRow extends SafeSessionUser {
  referredByCode: string | null;
  createdAt: string;
  lastLoginAt: string;
}

interface AdminOverviewPayload {
  settings: PlatformSettings;
  predictions: PredictionRecord[];
  users: AdminUserRow[];
  transactions: OrderTransaction[];
  affiliateLinks: AffiliateLinkRecord[];
  payouts: AffiliatePayoutRequest[];
  stats: StatsSummary;
}

type AdminSection =
  | 'OVERVIEW'
  | 'PREDICTIONS'
  | 'USERS'
  | 'FINANCE'
  | 'AFFILIATES'
  | 'SETTINGS';

export default function AdminDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<AdminOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<AdminSection>('PREDICTIONS');
  const [toast, setToast] = useState<string | null>(null);

  // Форма нового события
  const [sport, setSport] = useState<SportType>('FOOTBALL');
  const [leagueName, setLeagueName] = useState('');
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [startsInHours, setStartsInHours] = useState('3');
  const [selectionTitle, setSelectionTitle] = useState('');
  const [fixedOdds, setFixedOdds] = useState('1.95');
  const [minOdds, setMinOdds] = useState('1.85');
  const [stakeUnits, setStakeUnits] = useState('2.0');
  const [accessTier, setAccessTier] = useState<AccessTier>('PAID_SINGLE');
  const [singlePrice, setSinglePrice] = useState('790');
  const [isFeatured, setIsFeatured] = useState(false);
  const [teaser, setTeaser] = useState('');
  const [fullText, setFullText] = useState('');
  const [pushTelegram, setPushTelegram] = useState(true);

  const [scoreInputs, setScoreInputs] = useState<Record<string, string>>({});
  const [userSearch, setUserSearch] = useState('');
  const [singleDefaultDraft, setSingleDefaultDraft] = useState('790');
  const [applyDefaultToAll, setApplyDefaultToAll] = useState(false);

  const [settingsDraft, setSettingsDraft] = useState<PlatformSettings | null>(null);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');

  const notify = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 4000);
  };

  const loadOverview = useCallback(async () => {
    const res = await fetch('/api/v1/admin/overview', { cache: 'no-store' });
    if (res.status === 401 || res.status === 403) {
      router.replace('/login');
      return;
    }
    if (res.ok) {
      const json = (await res.json()) as AdminOverviewPayload;
      setData(json);
      setSettingsDraft(json.settings);
      setSingleDefaultDraft(String(json.settings.defaultSinglePriceRub));
      setSinglePrice(String(json.settings.defaultSinglePriceRub));
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  if (loading || !data || !settingsDraft) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F6FA] text-sm font-medium text-slate-500">
        Загрузка панели управления...
      </div>
    );
  }

  const totalRevenueRub = data.transactions
    .filter((t) => t.status === 'SUCCEEDED')
    .reduce((acc, t) => acc + t.amountRub, 0);

  const soldSingleCount = data.transactions.filter(
    (t) => t.kind === 'SINGLE_PREDICTION' && t.status === 'SUCCEEDED',
  ).length;

  const pendingPayoutsCount = data.payouts.filter((p) => p.status === 'PENDING').length;

  const handleCreatePrediction = async (e: React.FormEvent) => {
    e.preventDefault();
    const kickoffIso = new Date(
      Date.now() + Math.max(0.25, Number(startsInHours) || 3) * 3600 * 1000,
    ).toISOString();

    const res = await fetch('/api/v1/admin/predictions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sport,
        leagueName,
        homeTeam,
        awayTeam,
        matchStartsAt: kickoffIso,
        selectionTitle,
        fixedOdds: Number(fixedOdds),
        minAcceptableOdds: Number(minOdds) || null,
        stakeUnits: Number(stakeUnits),
        accessTier,
        singlePriceRub: accessTier === 'PAID_SINGLE' ? Number(singlePrice) : null,
        isFeatured,
        analysisTeaser: teaser,
        analysisFull: fullText,
        pushToTelegram: pushTelegram,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      notify(json.error || 'Ошибка публикации события');
      return;
    }
    setHomeTeam('');
    setAwayTeam('');
    setSelectionTitle('');
    setTeaser('');
    setFullText('');
    setIsFeatured(false);
    notify('Событие опубликовано на витрине и подписано SHA-256');
    await loadOverview();
  };

  const handleSetFeatured = async (predictionId: string) => {
    const res = await fetch('/api/v1/admin/predictions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ predictionId, setFeatured: true }),
    });
    if (res.ok) {
      notify('Событие закреплено на главном баннере');
      await loadOverview();
    }
  };

  const handleSettlePrediction = async (
    predictionId: string,
    resultStatus: ResultStatus,
  ) => {
    const res = await fetch('/api/v1/admin/predictions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        predictionId,
        resultStatus,
        finalScore: scoreInputs[predictionId] || undefined,
        cashoutMultiplier: resultStatus === 'CASHOUT' ? 1.45 : undefined,
      }),
    });
    if (res.ok) {
      notify('Матч рассчитан, статистика и график обновлены');
      await loadOverview();
    }
  };

  const handleDeletePrediction = async (id: string) => {
    if (!window.confirm('Удалить это событие с витрины?')) return;
    const res = await fetch(`/api/v1/admin/predictions?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      notify('Событие удалено');
      await loadOverview();
    }
  };

  const handleUserAction = async (
    userId: string,
    action: string,
    extra?: Record<string, string | number>,
  ) => {
    const res = await fetch('/api/v1/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, action, ...extra }),
    });
    const json = await res.json();
    if (!res.ok) {
      notify(json.error || 'Ошибка операции');
      return;
    }
    notify('Данные покупателя обновлены');
    await loadOverview();
  };

  const handleSaveDefaultPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/v1/admin/finance', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'SAVE_DEFAULT_PRICE',
        defaultSinglePriceRub: Number(singleDefaultDraft) || 790,
        applyToPending: applyDefaultToAll,
      }),
    });
    if (res.ok) {
      notify('Базовая стоимость прогноза сохранена');
      await loadOverview();
    }
  };

  const handleRefundOrder = async (orderId: string) => {
    if (!window.confirm('Оформить возврат и закрыть доступ к купленному событию?')) {
      return;
    }
    const res = await fetch('/api/v1/admin/finance', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'REFUND_ORDER', orderId }),
    });
    if (res.ok) {
      notify('Возврат оформлен');
      await loadOverview();
    }
  };

  const handleProcessPayout = async (
    payoutId: string,
    decision: 'PAID' | 'REJECTED',
  ) => {
    const res = await fetch('/api/v1/admin/finance', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'PROCESS_PAYOUT', payoutId, decision }),
    });
    if (res.ok) {
      notify(decision === 'PAID' ? 'Выплата подтверждена' : 'Заявка отклонена');
      await loadOverview();
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/v1/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: settingsDraft,
        newAdminEmail: newAdminEmail || undefined,
        newAdminPassword: newAdminPassword || undefined,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      notify(json.error || 'Ошибка сохранения настроек');
      return;
    }
    setNewAdminPassword('');
    notify('Настройки успешно сохранены');
    await loadOverview();
  };

  const handleTestTelegram = async () => {
    const res = await fetch('/api/v1/admin/settings', { method: 'POST' });
    const json = await res.json();
    if (!res.ok) {
      notify(json.error || 'Не удалось отправить сообщение в Telegram');
      return;
    }
    notify('Тестовый анонс доставлен в ваш Telegram-канал!');
  };

  const filteredUsers = data.users.filter((u) => {
    if (!userSearch.trim()) return true;
    const q = userSearch.trim().toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      u.displayName.toLowerCase().includes(q) ||
      (u.telegramUsername || '').toLowerCase().includes(q)
    );
  });

  const upcomingPaidList = data.predictions.filter(
    (p) => p.matchStatus !== 'FINISHED' && p.accessTier === 'PAID_SINGLE',
  );

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/v1/webhooks/yookassa`
      : '/api/v1/webhooks/yookassa';

  const navItems: Array<{
    id: AdminSection;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'PREDICTIONS', label: 'События и расчет', Icon: FilePlus2 },
    { id: 'OVERVIEW', label: 'Сводка продаж', Icon: BarChart3 },
    { id: 'FINANCE', label: 'Цены и платежи', Icon: CreditCard },
    { id: 'USERS', label: 'Покупатели (CRM)', Icon: Users },
    {
      id: 'AFFILIATES',
      label: 'Партнеры и выплаты',
      Icon: Share2,
      badge: pendingPayoutsCount || undefined,
    },
    { id: 'SETTINGS', label: 'ЮKassa, Telegram и реквизиты', Icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#F4F6FA] text-slate-900">
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 rounded-2xl bg-[#0B0F19] px-5 py-3 text-xs font-bold text-white shadow-2xl">
          {toast}
        </div>
      )}

      {/* Темная шапка панели управления */}
      <header className="bg-[#0B0F19] px-4 py-4 text-white sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-blue-600 px-2.5 py-1 font-mono text-xs font-black text-white">
              ADMIN
            </span>
            <h1 className="text-base font-black text-white">
              Управление витриной {data.settings.brandName}
            </h1>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                data.settings.paymentMode === 'YOOKASSA_LIVE'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-amber-500/20 text-amber-300'
              }`}
            >
              {data.settings.paymentMode === 'YOOKASSA_LIVE'
                ? 'Боевой шлюз ЮKassa'
                : 'Тестовый режим оплаты'}
            </span>
          </div>

          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-bold text-white hover:bg-white/10"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>На витрину сайта</span>
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-8 sm:px-6 lg:grid-cols-12 lg:px-8">
        {/* Боковая навигация */}
        <aside className="space-y-1.5 lg:col-span-3">
          {navItems.map(({ id, label, Icon, badge }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-xs font-bold transition ${
                section === id
                  ? 'bg-[#0B0F19] text-white shadow-sm'
                  : 'border border-slate-200/80 bg-white text-slate-600 hover:text-slate-950'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </span>
              {badge ? (
                <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black text-white">
                  {badge}
                </span>
              ) : null}
            </button>
          ))}
        </aside>

        {/* Рабочая зона */}
        <div className="lg:col-span-9">
          {/* СВОДКА */}
          {section === 'OVERVIEW' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-xs font-semibold text-slate-400">Общая выручка</div>
                  <div className="mt-1.5 font-mono text-2xl font-black text-blue-600">
                    {totalRevenueRub.toLocaleString('ru-RU')} ₽
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-xs font-semibold text-slate-400">
                    Продано прогнозов
                  </div>
                  <div className="mt-1.5 font-mono text-2xl font-black text-slate-950">
                    {soldSingleCount}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-xs font-semibold text-slate-400">Покупателей</div>
                  <div className="mt-1.5 font-mono text-2xl font-black text-slate-950">
                    {data.users.length}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-xs font-semibold text-slate-400">Yield аналитики</div>
                  <div className="mt-1.5 font-mono text-2xl font-black text-emerald-600">
                    {data.stats.yieldPct >= 0 ? '+' : ''}
                    {data.stats.yieldPct.toFixed(1)}%
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-base font-extrabold text-slate-950">
                  Памятка по работе с витриной разовых событий
                </h2>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs leading-relaxed text-slate-600">
                  <li>
                    При публикации нового матча вы сами назначаете ему индивидуальную цену в рублях (например, 690 ₽ за рядовой матч или 1 290 ₽ за главный матч тура) либо делаете его бесплатным для прогрева аудитории.
                  </li>
                  <li>
                    Галочка <strong>«Сделать главным событием дня»</strong> выводит карточку матча в темный акцентный блок на самом верху главной страницы.
                  </li>
                  <li>
                    После окончания матча укажите счет и нажмите «Выигрыш / Проигрыш / Возврат» — показатели Yield и график на сайте пересчитаются автоматически.
                  </li>
                </ol>
              </div>
            </div>
          )}

          {/* СОБЫТИЯ И РАСЧЕТ */}
          {section === 'PREDICTIONS' && (
            <div className="space-y-8">
              <form
                onSubmit={handleCreatePrediction}
                className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7"
              >
                <h2 className="text-lg font-extrabold text-slate-950">
                  Добавить событие на витрину
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Исход и коэффициент автоматически защищаются подписью SHA-256 до начала матча.
                </p>

                <div className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600">
                      Дисциплина
                    </label>
                    <select
                      value={sport}
                      onChange={(e) => setSport(e.target.value as SportType)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-900"
                    >
                      {(Object.keys(SPORT_LABELS) as SportType[]).map((sp) => (
                        <option key={sp} value={sp}>
                          {SPORT_LABELS[sp].icon} {SPORT_LABELS[sp].label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600">
                      Турнир / Лига
                    </label>
                    <input
                      type="text"
                      required
                      value={leagueName}
                      onChange={(e) => setLeagueName(e.target.value)}
                      placeholder="РПЛ / Лига Чемпионов / КХЛ"
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600">
                      Начало через (часов)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      required
                      value={startsInHours}
                      onChange={(e) => setStartsInHours(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-xs text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600">
                      Команда 1 (Хозяева)
                    </label>
                    <input
                      type="text"
                      required
                      value={homeTeam}
                      onChange={(e) => setHomeTeam(e.target.value)}
                      placeholder="Краснодар"
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600">
                      Команда 2 (Гости)
                    </label>
                    <input
                      type="text"
                      required
                      value={awayTeam}
                      onChange={(e) => setAwayTeam(e.target.value)}
                      placeholder="Зенит"
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600">
                      Точный исход (скрыт до оплаты)
                    </label>
                    <input
                      type="text"
                      required
                      value={selectionTitle}
                      onChange={(e) => setSelectionTitle(e.target.value)}
                      placeholder="Тотал больше (2.5)"
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600">
                      Фиксированный кэф
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="1.05"
                      required
                      value={fixedOdds}
                      onChange={(e) => setFixedOdds(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-xs text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600">
                      Мин. допустимый кэф
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="1.01"
                      value={minOdds}
                      onChange={(e) => setMinOdds(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-xs text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600">
                      Флэт (% от банка = юниты)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="5"
                      required
                      value={stakeUnits}
                      onChange={(e) => setStakeUnits(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-xs text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600">
                      Тип продажи
                    </label>
                    <select
                      value={accessTier}
                      onChange={(e) => setAccessTier(e.target.value as AccessTier)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-900"
                    >
                      <option value="PAID_SINGLE">Платная разовая продажа</option>
                      <option value="FREE">Бесплатный открытый разбор</option>
                    </select>
                  </div>

                  {accessTier === 'PAID_SINGLE' && (
                    <div>
                      <label className="block text-xs font-bold text-slate-600">
                        Цена этого события (₽)
                      </label>
                      <input
                        type="number"
                        min="50"
                        value={singlePrice}
                        onChange={(e) => setSinglePrice(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-xs font-bold text-blue-700"
                      />
                    </div>
                  )}
                </div>

                <div className="mt-4 space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600">
                      Краткий анонс на карточке (виден до покупки)
                    </label>
                    <input
                      type="text"
                      required
                      value={teaser}
                      onChange={(e) => setTeaser(e.target.value)}
                      placeholder="Краткое описание предматчевых факторов без раскрытия самого исхода..."
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600">
                      Полный разбор (открывается после разовой оплаты)
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={fullText}
                      onChange={(e) => setFullText(e.target.value)}
                      placeholder="Подробная аргументация по составам, статистике и движению линии..."
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900"
                    />
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={isFeatured}
                        onChange={(e) => setIsFeatured(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600"
                      />
                      <span>Сделать «Главным событием дня» в шапке</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={pushTelegram}
                        onChange={(e) => setPushTelegram(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600"
                      />
                      <span>Отправить анонс в Telegram-канал</span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    className="rounded-xl bg-blue-600 px-6 py-3 text-xs font-bold text-white shadow-md shadow-blue-600/25 hover:bg-blue-700"
                  >
                    Опубликовать на витрине
                  </button>
                </div>
              </form>

              {/* Список событий и расчет */}
              <div className="space-y-3">
                <h3 className="text-base font-extrabold text-slate-950">
                  Все события на витрине ({data.predictions.length})
                </h3>
                {data.predictions.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-extrabold text-slate-950">
                            {p.homeTeam} — {p.awayTeam}
                          </span>
                          <span className="text-slate-400">({p.leagueName})</span>
                          {p.isFeatured && (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                              Главный матч дня
                            </span>
                          )}
                        </div>
                        <div className="mt-1 font-mono text-slate-600">
                          <strong className="text-blue-600">{p.selectionTitle}</strong> · кэф{' '}
                          {p.fixedOdds.toFixed(2)} · флэт {p.stakeUnits.toFixed(1)}% ·{' '}
                          {p.accessTier === 'FREE'
                            ? 'Бесплатно'
                            : `${p.singlePriceRub} ₽`}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {p.matchStatus !== 'FINISHED' && !p.isFeatured && (
                          <button
                            type="button"
                            onClick={() => handleSetFeatured(p.id)}
                            title="Вывести в главный баннер"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-600"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            <span>В баннер</span>
                          </button>
                        )}

                        <input
                          type="text"
                          value={scoreInputs[p.id] ?? p.finalScore ?? ''}
                          onChange={(e) =>
                            setScoreInputs((prev) => ({
                              ...prev,
                              [p.id]: e.target.value,
                            }))
                          }
                          placeholder="Счет (2:1)"
                          className="w-24 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-900"
                        />
                        <button
                          type="button"
                          onClick={() => handleSettlePrediction(p.id, 'WIN')}
                          className={`rounded-lg px-2.5 py-1.5 font-bold ${
                            p.resultStatus === 'WIN'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          }`}
                        >
                          Выигрыш
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSettlePrediction(p.id, 'LOSS')}
                          className={`rounded-lg px-2.5 py-1.5 font-bold ${
                            p.resultStatus === 'LOSS'
                              ? 'bg-rose-600 text-white'
                              : 'bg-rose-50 text-rose-600 hover:bg-rose-100'
                          }`}
                        >
                          Проигрыш
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSettlePrediction(p.id, 'PUSH')}
                          className={`rounded-lg px-2.5 py-1.5 font-bold ${
                            p.resultStatus === 'PUSH'
                              ? 'bg-amber-500 text-white'
                              : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                          }`}
                        >
                          Возврат
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSettlePrediction(p.id, 'CASHOUT')}
                          className="rounded-lg bg-sky-50 px-2.5 py-1.5 font-bold text-sky-700 hover:bg-sky-100"
                        >
                          Cashout
                        </button>
                        <button
                          type="button"
                          title="Удалить"
                          onClick={() => handleDeletePrediction(p.id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ПОКУПАТЕЛИ CRM */}
          {section === 'USERS' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-extrabold text-slate-950">
                  Покупатели ({data.users.length})
                </h2>
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Поиск по email, имени или @telegram..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 sm:w-72"
                />
              </div>

              <div className="space-y-3">
                {filteredUsers.map((u) => (
                  <div
                    key={u.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-950">
                            {u.displayName}
                          </span>
                          <span className="text-slate-400">{u.email}</span>
                          {u.status === 'BLOCKED' && (
                            <span className="rounded bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">
                              Заблокирован
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-3 text-slate-500">
                          <span>Кошелек: {u.balanceRub} ₽</span>
                          <span>Куплено прогнозов: {u.purchasedPredictionIds.length}</span>
                          <span>
                            Оплачено всего:{' '}
                            {data.transactions
                              .filter(
                                (tx) =>
                                  tx.userId === u.id && tx.status === 'SUCCEEDED',
                              )
                              .reduce((s, tx) => s + tx.amountRub, 0)
                              .toLocaleString('ru-RU')}{' '}
                            ₽
                          </span>
                          <span>RevShare: {u.revsharePercent}%</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {upcomingPaidList.length > 0 && (
                          <select
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) {
                                handleUserAction(u.id, 'GRANT_PREDICTION', {
                                  predictionId: e.target.value,
                                });
                                e.target.value = '';
                              }
                            }}
                            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700"
                          >
                            <option value="">+ Открыть событие...</option>
                            {upcomingPaidList.map((mp) => (
                              <option key={mp.id} value={mp.id}>
                                {mp.homeTeam} — {mp.awayTeam}
                              </option>
                            ))}
                          </select>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            handleUserAction(u.id, 'ADD_BALANCE', { amountRub: 500 })
                          }
                          className="rounded-lg bg-blue-50 px-2.5 py-1.5 font-bold text-blue-700 hover:bg-blue-100"
                        >
                          +500 ₽ на баланс
                        </button>

                        {u.role !== 'ADMIN' && (
                          <button
                            type="button"
                            onClick={() => handleUserAction(u.id, 'TOGGLE_BLOCK')}
                            className="rounded-lg bg-rose-50 px-2.5 py-1.5 font-bold text-rose-600 hover:bg-rose-100"
                          >
                            {u.status === 'ACTIVE' ? 'Блок' : 'Разблок'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ЦЕНЫ И ЖУРНАЛ ОПЛАТ */}
          {section === 'FINANCE' && (
            <div className="space-y-8">
              <form
                onSubmit={handleSaveDefaultPrice}
                className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <h2 className="text-lg font-extrabold text-slate-950">
                  Базовая цена разового события
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Подставляется по умолчанию при создании нового матча (при желании каждому матчу можно указать свою цену).
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <input
                    type="number"
                    min={50}
                    value={singleDefaultDraft}
                    onChange={(e) => setSingleDefaultDraft(e.target.value)}
                    className="w-44 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 font-mono text-sm font-bold text-slate-900"
                  />

                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={applyDefaultToAll}
                      onChange={(e) => setApplyDefaultToAll(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600"
                    />
                    <span>Применить ко всем текущим предстоящим событиям</span>
                  </label>

                  <button
                    type="submit"
                    className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-700"
                  >
                    Сохранить цену
                  </button>
                </div>
              </form>

              <div>
                <h3 className="text-base font-extrabold text-slate-950">
                  Журнал разовых покупок и пополнений ({data.transactions.length})
                </h3>
                <div className="mt-3 overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
                  <table className="w-full min-w-[640px] text-left text-xs">
                    <thead className="border-b border-slate-100 bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-5 py-3.5 font-bold">Дата</th>
                        <th className="px-5 py-3.5 font-bold">Покупатель</th>
                        <th className="px-5 py-3.5 font-bold">Событие</th>
                        <th className="px-5 py-3.5 font-bold">Сумма</th>
                        <th className="px-5 py-3.5 font-bold">Статус</th>
                        <th className="px-5 py-3.5 font-bold">Действие</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {data.transactions.length > 0 ? (
                        data.transactions.map((tx) => (
                          <tr key={tx.id}>
                            <td className="px-5 py-3.5 text-slate-400">
                              {new Date(tx.createdAt).toLocaleString('ru-RU')}
                            </td>
                            <td className="px-5 py-3.5">{tx.userEmail}</td>
                            <td className="px-5 py-3.5 font-bold text-slate-950">
                              {tx.title}
                            </td>
                            <td className="px-5 py-3.5 font-mono font-black">
                              {tx.amountRub.toLocaleString('ru-RU')} ₽
                            </td>
                            <td className="px-5 py-3.5">{tx.status}</td>
                            <td className="px-5 py-3.5">
                              {tx.status === 'SUCCEEDED' && (
                                <button
                                  type="button"
                                  onClick={() => handleRefundOrder(tx.id)}
                                  className="font-bold text-rose-600 hover:underline"
                                >
                                  Возврат
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-5 py-10 text-center text-slate-400">
                            Покупок пока не совершалось.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ПАРТНЕРЫ И ВЫПЛАТЫ */}
          {section === 'AFFILIATES' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-extrabold text-slate-950">
                  Заявки партнеров на выплату ({data.payouts.length})
                </h2>
                <div className="mt-3 space-y-2.5">
                  {data.payouts.length > 0 ? (
                    data.payouts.map((p) => (
                      <div
                        key={p.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm"
                      >
                        <div>
                          <div className="font-extrabold text-slate-950">
                            {p.userEmail} · {p.amountRub.toLocaleString('ru-RU')} ₽ (
                            {p.method})
                          </div>
                          <div className="mt-0.5 text-slate-500">
                            Реквизиты: {p.requisites}
                          </div>
                        </div>

                        {p.status === 'PENDING' ? (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleProcessPayout(p.id, 'PAID')}
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white"
                            >
                              Выплачено
                            </button>
                            <button
                              type="button"
                              onClick={() => handleProcessPayout(p.id, 'REJECTED')}
                              className="rounded-lg bg-rose-50 px-3 py-1.5 font-bold text-rose-600"
                            >
                              Отклонить
                            </button>
                          </div>
                        ) : (
                          <span className="font-bold text-slate-400">{p.status}</span>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-xs text-slate-400">
                      Активных заявок на выплату нет.
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-base font-extrabold text-slate-950">
                  Партнерские ссылки ({data.affiliateLinks.length})
                </h3>
                <div className="mt-3 overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
                  <table className="w-full min-w-[580px] text-left text-xs">
                    <thead className="border-b border-slate-100 bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-5 py-3.5 font-bold">Партнер</th>
                        <th className="px-5 py-3.5 font-bold">Код (?ref=)</th>
                        <th className="px-5 py-3.5 font-bold">Переходы</th>
                        <th className="px-5 py-3.5 font-bold">Регистрации</th>
                        <th className="px-5 py-3.5 font-bold">Покупки</th>
                        <th className="px-5 py-3.5 font-bold">Оборот</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {data.affiliateLinks.map((l) => (
                        <tr key={l.id}>
                          <td className="px-5 py-3.5">{l.userEmail}</td>
                          <td className="px-5 py-3.5 font-mono font-bold text-blue-600">
                            {l.code}
                          </td>
                          <td className="px-5 py-3.5">{l.clicks}</td>
                          <td className="px-5 py-3.5">{l.registrations}</td>
                          <td className="px-5 py-3.5">{l.buyers}</td>
                          <td className="px-5 py-3.5 font-mono font-black">
                            {l.revenueRub.toLocaleString('ru-RU')} ₽
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* НАСТРОЙКИ */}
          {section === 'SETTINGS' && (
            <form
              onSubmit={handleSaveSettings}
              className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
            >
              <div>
                <h2 className="text-lg font-extrabold text-slate-950">
                  Платежный шлюз ЮKassa
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  В «Тестовом режиме» покупка событий проходит мгновенно для демонстрации. Для приема реальных карт и СБП укажите ключи ЮKassa и включите боевой режим.
                </p>

                <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600">
                      Режим оплаты
                    </label>
                    <select
                      value={settingsDraft.paymentMode}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          paymentMode: e.target.value as
                            | 'TEST_INSTANT'
                            | 'YOOKASSA_LIVE',
                        })
                      }
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-900"
                    >
                      <option value="TEST_INSTANT">Тестовый (мгновенно)</option>
                      <option value="YOOKASSA_LIVE">Боевой ЮKassa API v3</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600">
                      Shop ID ЮKassa
                    </label>
                    <input
                      type="text"
                      value={settingsDraft.yookassaShopId}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          yookassaShopId: e.target.value,
                        })
                      }
                      placeholder="Напр. 394102"
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-xs text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600">
                      Секретный ключ ЮKassa
                    </label>
                    <input
                      type="password"
                      value={settingsDraft.yookassaSecretKey}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          yookassaSecretKey: e.target.value,
                        })
                      }
                      placeholder="live_..."
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-xs text-slate-900"
                    />
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                  Адрес для HTTP-уведомлений в кабинете ЮKassa:{' '}
                  <code className="font-mono font-bold text-blue-600">{webhookUrl}</code>
                </div>
              </div>

              {/* Telegram для анонсов */}
              <div className="border-t border-slate-100 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-950">
                      Автоанонсы новых событий в Telegram-канал
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Бот автоматически публикует красивый анонс в ваш открытый Telegram-канал при добавлении нового прогноза на сайт.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleTestTelegram}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Проверить отправку поста</span>
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-600">
                      Токен бота (@BotFather)
                    </label>
                    <input
                      type="password"
                      value={settingsDraft.telegramBotToken}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          telegramBotToken: e.target.value,
                        })
                      }
                      placeholder="123456789:AAH..."
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-xs text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600">
                      ID вашего Telegram-канала
                    </label>
                    <input
                      type="text"
                      value={settingsDraft.telegramChannelId}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          telegramChannelId: e.target.value,
                        })
                      }
                      placeholder="@my_channel или -1001987654321"
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-xs text-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* Бренд и юридические реквизиты */}
              <div className="border-t border-slate-100 pt-5">
                <h3 className="text-base font-extrabold text-slate-950">
                  Бренд и реквизиты для Публичной оферты
                </h3>
                <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-600">
                      Название бренда
                    </label>
                    <input
                      type="text"
                      value={settingsDraft.brandName}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, brandName: e.target.value })
                      }
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600">
                      Ссылка на ваш Telegram-канал
                    </label>
                    <input
                      type="text"
                      value={settingsDraft.freeTelegramUrl}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          freeTelegramUrl: e.target.value,
                        })
                      }
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600">
                      Ссылка на поддержку в Telegram
                    </label>
                    <input
                      type="text"
                      value={settingsDraft.supportTelegram}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          supportTelegram: e.target.value,
                        })
                      }
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600">
                      Email поддержки
                    </label>
                    <input
                      type="email"
                      value={settingsDraft.supportEmail}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          supportEmail: e.target.value,
                        })
                      }
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600">
                      Исполнитель (ИП / Самозанятый / ООО)
                    </label>
                    <input
                      type="text"
                      value={settingsDraft.legalSellerName}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          legalSellerName: e.target.value,
                        })
                      }
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600">
                      ИНН / ОГРНИП
                    </label>
                    <input
                      type="text"
                      value={settingsDraft.legalInn}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          legalInn: e.target.value,
                        })
                      }
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* Смена доступа администратора */}
              <div className="border-t border-slate-100 pt-5">
                <h3 className="text-base font-extrabold text-slate-950">
                  Смена логина и пароля администратора
                </h3>
                <div className="mt-3 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <input
                    type="email"
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    placeholder="Новый email администратора (необязательно)"
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900"
                  />
                  <input
                    type="password"
                    value={newAdminPassword}
                    onChange={(e) => setNewAdminPassword(e.target.value)}
                    placeholder="Новый пароль администратора (от 6 символов)"
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="rounded-xl bg-blue-600 px-6 py-3 text-xs font-bold text-white shadow-md shadow-blue-600/25 hover:bg-blue-700"
              >
                Сохранить все настройки
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
