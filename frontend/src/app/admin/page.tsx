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
  Trash2,
  Users,
} from 'lucide-react';
import { SPORT_LABELS } from '@/components/predictions/PredictionCard';
import type {
  AccessTier,
  AffiliateLinkRecord,
  AffiliatePayoutRequest,
  OrderTransaction,
  PlanCode,
  PlatformSettings,
  PredictionRecord,
  ResultStatus,
  SafeSessionUser,
  SportType,
  StatsSummary,
  TariffPlan,
} from '@/server/types';

interface AdminUserRow extends SafeSessionUser {
  referredByCode: string | null;
  createdAt: string;
  lastLoginAt: string;
}

interface AdminOverviewPayload {
  settings: PlatformSettings;
  tariffs: TariffPlan[];
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
  const [section, setSection] = useState<AdminSection>('OVERVIEW');
  const [toast, setToast] = useState<string | null>(null);

  // Форма создания прогноза
  const [sport, setSport] = useState<SportType>('FOOTBALL');
  const [leagueName, setLeagueName] = useState('');
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [startsInHours, setStartsInHours] = useState('4');
  const [selectionTitle, setSelectionTitle] = useState('');
  const [fixedOdds, setFixedOdds] = useState('1.92');
  const [minOdds, setMinOdds] = useState('1.82');
  const [stakeUnits, setStakeUnits] = useState('2.0');
  const [accessTier, setAccessTier] = useState<AccessTier>('PAID_SINGLE');
  const [singlePrice, setSinglePrice] = useState('790');
  const [teaser, setTeaser] = useState('');
  const [fullText, setFullText] = useState('');
  const [pushTelegram, setPushTelegram] = useState(true);

  // Поле счета при расчете прогнозов
  const [scoreInputs, setScoreInputs] = useState<Record<string, string>>({});

  // Поиск клиентов
  const [userSearch, setUserSearch] = useState('');

  // Тарифы
  const [tariffDrafts, setTariffDrafts] = useState<
    Record<PlanCode, { priceRub: number; oldPriceRub: number }>
  >({
    VIP_7D: { priceRub: 2990, oldPriceRub: 3990 },
    VIP_30D: { priceRub: 6990, oldPriceRub: 9990 },
    VIP_LIFETIME: { priceRub: 24900, oldPriceRub: 34900 },
  });
  const [singleDefaultDraft, setSingleDefaultDraft] = useState('790');

  // Настройки системы
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
      const map = { ...tariffDrafts };
      for (const t of json.tariffs) {
        map[t.code] = { priceRub: t.priceRub, oldPriceRub: t.oldPriceRub };
      }
      setTariffDrafts(map);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  if (loading || !data || !settingsDraft) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">
        Загрузка панели управления...
      </div>
    );
  }

  const totalRevenueRub = data.transactions
    .filter((t) => t.status === 'SUCCEEDED')
    .reduce((acc, t) => acc + t.amountRub, 0);

  const activeVipUsers = data.users.filter((u) => u.hasActiveVip && u.role !== 'ADMIN').length;
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
        analysisTeaser: teaser,
        analysisFull: fullText,
        pushToTelegram: pushTelegram,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      notify(json.error || 'Ошибка публикации прогноза');
      return;
    }
    setHomeTeam('');
    setAwayTeam('');
    setSelectionTitle('');
    setTeaser('');
    setFullText('');
    notify('Прогноз опубликован и подписан SHA-256');
    await loadOverview();
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
      notify('Статус прогноза и статистика обновлены');
      await loadOverview();
    }
  };

  const handleDeletePrediction = async (id: string) => {
    if (!window.confirm('Удалить этот прогноз из базы данных?')) return;
    const res = await fetch(`/api/v1/admin/predictions?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      notify('Прогноз удален');
      await loadOverview();
    }
  };

  const handleUserAction = async (
    userId: string,
    action: string,
    extra?: Record<string, number>,
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
    notify('Данные клиента обновлены');
    await loadOverview();
  };

  const handleSaveTariffs = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/v1/admin/finance', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'SAVE_TARIFFS',
        defaultSinglePriceRub: Number(singleDefaultDraft) || 790,
        tariffs: (['VIP_7D', 'VIP_30D', 'VIP_LIFETIME'] as PlanCode[]).map((code) => ({
          code,
          priceRub: tariffDrafts[code].priceRub,
          oldPriceRub: tariffDrafts[code].oldPriceRub,
        })),
      }),
    });
    if (res.ok) {
      notify('Цены тарифов и ординаров сохранены');
      await loadOverview();
    }
  };

  const handleRefundOrder = async (orderId: string) => {
    if (!window.confirm('Оформить возврат и аннулировать выданный по заказу доступ?')) return;
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

  const handleProcessPayout = async (payoutId: string, decision: 'PAID' | 'REJECTED') => {
    const res = await fetch('/api/v1/admin/finance', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'PROCESS_PAYOUT', payoutId, decision }),
    });
    if (res.ok) {
      notify(decision === 'PAID' ? 'Выплата отмечена исполненной' : 'Заявка отклонена');
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
    notify('Настройки платформы и интеграций сохранены');
    await loadOverview();
  };

  const handleTestTelegram = async () => {
    const res = await fetch('/api/v1/admin/settings', { method: 'POST' });
    const json = await res.json();
    if (!res.ok) {
      notify(json.error || 'Не удалось отправить сообщение в Telegram');
      return;
    }
    notify('Тестовое сообщение доставлено в VIP-канал!');
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
    { id: 'OVERVIEW', label: 'Сводка бизнеса', Icon: BarChart3 },
    { id: 'PREDICTIONS', label: 'Прогнозы и расчет', Icon: FilePlus2 },
    { id: 'USERS', label: 'Клиенты (CRM)', Icon: Users },
    { id: 'FINANCE', label: 'Тарифы и оплаты', Icon: CreditCard },
    {
      id: 'AFFILIATES',
      label: 'Партнеры и выплаты',
      Icon: Share2,
      badge: pendingPayoutsCount || undefined,
    },
    { id: 'SETTINGS', label: 'ЮKassa, Telegram и реквизиты', Icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl border border-emerald-500/40 bg-slate-900 px-4 py-3 text-xs font-semibold text-emerald-300 shadow-2xl">
          {toast}
        </div>
      )}

      {/* Верхняя полоса админ-панели */}
      <header className="border-b border-slate-800 bg-slate-900/90 px-4 py-3.5 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-emerald-500 px-2.5 py-1 font-mono text-xs font-black text-slate-950">
              ADMIN
            </span>
            <h1 className="text-base font-extrabold text-white">
              Управление {data.settings.brandName}.PRO
            </h1>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                data.settings.paymentMode === 'YOOKASSA_LIVE'
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-amber-500/15 text-amber-300'
              }`}
            >
              {data.settings.paymentMode === 'YOOKASSA_LIVE'
                ? 'Боевой режим ЮKassa'
                : 'Тестовый режим оплаты'}
            </span>
          </div>

          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Вернуться на витрину сайта</span>
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-8 sm:px-6 lg:grid-cols-12">
        {/* Боковое меню */}
        <aside className="space-y-1.5 lg:col-span-3">
          {navItems.map(({ id, label, Icon, badge }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-xs font-bold transition ${
                section === id
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-900/70 text-slate-300 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </span>
              {badge ? (
                <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-extrabold text-white">
                  {badge}
                </span>
              ) : null}
            </button>
          ))}
        </aside>

        {/* Рабочая область */}
        <div className="lg:col-span-9">
          {/* 1. ОБЗОР */}
          {section === 'OVERVIEW' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
                  <div className="text-xs text-slate-400">Общая выручка</div>
                  <div className="mt-1.5 font-mono text-2xl font-extrabold text-emerald-400">
                    {totalRevenueRub.toLocaleString('ru-RU')} ₽
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
                  <div className="text-xs text-slate-400">Активных VIP-клиентов</div>
                  <div className="mt-1.5 font-mono text-2xl font-extrabold text-white">
                    {activeVipUsers}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
                  <div className="text-xs text-slate-400">Зарегистрировано</div>
                  <div className="mt-1.5 font-mono text-2xl font-extrabold text-white">
                    {data.users.length}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
                  <div className="text-xs text-slate-400">Yield аналитики</div>
                  <div className="mt-1.5 font-mono text-2xl font-extrabold text-emerald-300">
                    {data.stats.yieldPct >= 0 ? '+' : ''}
                    {data.stats.yieldPct.toFixed(1)}%
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-6">
                <h2 className="text-base font-bold text-white">
                  Быстрый старт перед запуском рекламы
                </h2>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs leading-relaxed text-slate-300">
                  <li>
                    В разделе <strong>«ЮKassa, Telegram и реквизиты»</strong> укажите ваши реквизиты самозанятого / ИП, Shop ID и секретный ключ ЮKassa, а также токен Telegram-бота.
                  </li>
                  <li>
                    В разделе <strong>«Тарифы и оплаты»</strong> установите желаемые цены на подписки 7 дней, 30 дней, Навсегда и разовый ординар.
                  </li>
                  <li>
                    Публикуйте новые разборы и рассчитывайте сыгранные матчи в разделе <strong>«Прогнозы и расчет»</strong> — витрина и графики обновляются мгновенно.
                  </li>
                </ol>
              </div>
            </div>
          )}

          {/* 2. ПРОГНОЗЫ И РАСЧЕТ */}
          {section === 'PREDICTIONS' && (
            <div className="space-y-8">
              <form
                onSubmit={handleCreatePrediction}
                className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6"
              >
                <h2 className="text-lg font-bold text-white">Публикация нового прогноза</h2>
                <p className="mt-1 text-xs text-slate-400">
                  Коэффициент фиксируется жестко в момент публикации и подписывается SHA-256.
                </p>

                <div className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs text-slate-400">Вид спорта</label>
                    <select
                      value={sport}
                      onChange={(e) => setSport(e.target.value as SportType)}
                      className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white"
                    >
                      {(Object.keys(SPORT_LABELS) as SportType[]).map((sp) => (
                        <option key={sp} value={sp}>
                          {SPORT_LABELS[sp].icon} {SPORT_LABELS[sp].label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400">Турнир / Лига</label>
                    <input
                      type="text"
                      required
                      value={leagueName}
                      onChange={(e) => setLeagueName(e.target.value)}
                      placeholder="РПЛ / Лига Чемпионов / КХЛ"
                      className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400">
                      Старт через (часов)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      required
                      value={startsInHours}
                      onChange={(e) => setStartsInHours(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 font-mono text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400">Команда 1 (Хозяева)</label>
                    <input
                      type="text"
                      required
                      value={homeTeam}
                      onChange={(e) => setHomeTeam(e.target.value)}
                      placeholder="Краснодар"
                      className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400">Команда 2 (Гости)</label>
                    <input
                      type="text"
                      required
                      value={awayTeam}
                      onChange={(e) => setAwayTeam(e.target.value)}
                      placeholder="Зенит"
                      className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400">Точный исход</label>
                    <input
                      type="text"
                      required
                      value={selectionTitle}
                      onChange={(e) => setSelectionTitle(e.target.value)}
                      placeholder="Тотал больше (2.5)"
                      className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400">
                      Фиксированный кэф
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="1.05"
                      required
                      value={fixedOdds}
                      onChange={(e) => setFixedOdds(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 font-mono text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400">
                      Мин. допустимый кэф
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="1.01"
                      value={minOdds}
                      onChange={(e) => setMinOdds(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 font-mono text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400">
                      Размер флэта (% банка = юниты)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="5"
                      required
                      value={stakeUnits}
                      onChange={(e) => setStakeUnits(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 font-mono text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400">Уровень доступа</label>
                    <select
                      value={accessTier}
                      onChange={(e) => setAccessTier(e.target.value as AccessTier)}
                      className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white"
                    >
                      <option value="FREE">Бесплатный (открыт всем)</option>
                      <option value="PAID_SINGLE">Платный ординар + VIP</option>
                      <option value="VIP_ONLY">Только для VIP-клуба</option>
                    </select>
                  </div>

                  {accessTier === 'PAID_SINGLE' && (
                    <div>
                      <label className="block text-xs text-slate-400">
                        Цена ординара (₽)
                      </label>
                      <input
                        type="number"
                        min="50"
                        value={singlePrice}
                        onChange={(e) => setSinglePrice(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 font-mono text-xs text-white"
                      />
                    </div>
                  )}
                </div>

                <div className="mt-4 space-y-3">
                  <div>
                    <label className="block text-xs text-slate-400">
                      Краткий анонс (виден всем до покупки)
                    </label>
                    <input
                      type="text"
                      required
                      value={teaser}
                      onChange={(e) => setTeaser(e.target.value)}
                      placeholder="Краткое описание предматчевого перевеса без раскрытия исхода..."
                      className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400">
                      Полное аналитическое обоснование (открывается после оплаты / VIP)
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={fullText}
                      onChange={(e) => setFullText(e.target.value)}
                      placeholder="Подробный разбор составов, xG-метрик и движения котировок..."
                      className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={pushTelegram}
                      onChange={(e) => setPushTelegram(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-emerald-500"
                    />
                    <span>Отправить автопуш в закрытый VIP-канал Telegram</span>
                  </label>

                  <button
                    type="submit"
                    className="rounded-xl bg-emerald-500 px-6 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-400"
                  >
                    Опубликовать прогноз
                  </button>
                </div>
              </form>

              {/* Список прогнозов и расчет в 1 клик */}
              <div className="space-y-3">
                <h3 className="text-base font-bold text-white">
                  Все прогнозы и расчет результатов ({data.predictions.length})
                </h3>
                {data.predictions.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-white">
                          {p.homeTeam} — {p.awayTeam}
                        </span>{' '}
                        <span className="text-slate-400">({p.leagueName})</span>
                        <div className="mt-1 font-mono text-emerald-400">
                          {p.selectionTitle} · кэф {p.fixedOdds.toFixed(2)} · флэт{' '}
                          {p.stakeUnits.toFixed(2)} u · {p.accessTier}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <input
                          type="text"
                          value={scoreInputs[p.id] ?? p.finalScore ?? ''}
                          onChange={(e) =>
                            setScoreInputs((prev) => ({ ...prev, [p.id]: e.target.value }))
                          }
                          placeholder="Счет (2:1)"
                          className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-white"
                        />
                        <button
                          type="button"
                          onClick={() => handleSettlePrediction(p.id, 'WIN')}
                          className={`rounded-lg px-2.5 py-1.5 font-bold ${
                            p.resultStatus === 'WIN'
                              ? 'bg-emerald-500 text-slate-950'
                              : 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                          }`}
                        >
                          Выигрыш
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSettlePrediction(p.id, 'LOSS')}
                          className={`rounded-lg px-2.5 py-1.5 font-bold ${
                            p.resultStatus === 'LOSS'
                              ? 'bg-rose-500 text-white'
                              : 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25'
                          }`}
                        >
                          Проигрыш
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSettlePrediction(p.id, 'PUSH')}
                          className={`rounded-lg px-2.5 py-1.5 font-bold ${
                            p.resultStatus === 'PUSH'
                              ? 'bg-amber-400 text-slate-950'
                              : 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                          }`}
                        >
                          Возврат
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSettlePrediction(p.id, 'CASHOUT')}
                          className="rounded-lg bg-cyan-500/15 px-2.5 py-1.5 font-bold text-cyan-300 hover:bg-cyan-500/25"
                        >
                          Cashout
                        </button>
                        <button
                          type="button"
                          title="Удалить"
                          onClick={() => handleDeletePrediction(p.id)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-rose-400"
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

          {/* 3. КЛИЕНТЫ (CRM) */}
          {section === 'USERS' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-white">
                  База пользователей ({data.users.length})
                </h2>
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Поиск по email, имени или @telegram..."
                  className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs text-white sm:w-72"
                />
              </div>

              <div className="space-y-3">
                {filteredUsers.map((u) => (
                  <div
                    key={u.id}
                    className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{u.displayName}</span>
                          <span className="text-slate-400">{u.email}</span>
                          {u.status === 'BLOCKED' && (
                            <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                              Заблокирован
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-3 text-slate-400">
                          <span>Баланс: {u.balanceRub} ₽</span>
                          <span>
                            Оплачено:{' '}
                            {data.transactions
                              .filter(
                                (tx) => tx.userId === u.id && tx.status === 'SUCCEEDED',
                              )
                              .reduce((s, tx) => s + tx.amountRub, 0)
                              .toLocaleString('ru-RU')}{' '}
                            ₽
                          </span>
                          <span>
                            VIP:{' '}
                            <strong className="text-amber-300">
                              {u.hasActiveVip ? u.vipPlanName : 'Нет'}
                            </strong>
                          </span>
                          <span>RevShare: {u.revsharePercent}%</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleUserAction(u.id, 'GRANT_VIP_7D')}
                          className="rounded-lg bg-amber-400/15 px-2.5 py-1.5 font-semibold text-amber-200 hover:bg-amber-400/25"
                        >
                          +7д VIP
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUserAction(u.id, 'GRANT_VIP_30D')}
                          className="rounded-lg bg-amber-400/15 px-2.5 py-1.5 font-semibold text-amber-200 hover:bg-amber-400/25"
                        >
                          +30д VIP
                        </button>
                        {u.hasActiveVip && (
                          <button
                            type="button"
                            onClick={() => handleUserAction(u.id, 'REVOKE_VIP')}
                            className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-slate-300 hover:text-white"
                          >
                            Снять VIP
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            handleUserAction(u.id, 'ADD_BALANCE', { amountRub: 500 })
                          }
                          className="rounded-lg bg-emerald-500/15 px-2.5 py-1.5 font-semibold text-emerald-300 hover:bg-emerald-500/25"
                        >
                          +500 ₽
                        </button>
                        {u.role !== 'ADMIN' && (
                          <button
                            type="button"
                            onClick={() => handleUserAction(u.id, 'TOGGLE_BLOCK')}
                            className="rounded-lg bg-rose-500/15 px-2.5 py-1.5 font-semibold text-rose-300 hover:bg-rose-500/25"
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

          {/* 4. ТАРИФЫ И ЖУРНАЛ ОПЛАТ */}
          {section === 'FINANCE' && (
            <div className="space-y-8">
              <form
                onSubmit={handleSaveTariffs}
                className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6"
              >
                <h2 className="text-lg font-bold text-white">Управление ценами</h2>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="block text-xs text-slate-400">
                      Разовый ординар (₽)
                    </label>
                    <input
                      type="number"
                      value={singleDefaultDraft}
                      onChange={(e) => setSingleDefaultDraft(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 font-mono text-sm text-white"
                    />
                  </div>

                  {data.tariffs.map((t) => (
                    <div key={t.code}>
                      <label className="block text-xs text-slate-400">{t.name} (₽)</label>
                      <input
                        type="number"
                        value={tariffDrafts[t.code]?.priceRub ?? t.priceRub}
                        onChange={(e) =>
                          setTariffDrafts((prev) => ({
                            ...prev,
                            [t.code]: {
                              ...prev[t.code],
                              priceRub: Number(e.target.value) || 0,
                            },
                          }))
                        }
                        className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 font-mono text-sm text-white"
                      />
                    </div>
                  ))}
                </div>

                <button
                  type="submit"
                  className="mt-4 rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-400"
                >
                  Сохранить тарифную сетку
                </button>
              </form>

              <div>
                <h3 className="text-base font-bold text-white">
                  Журнал платежей ({data.transactions.length})
                </h3>
                <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/75">
                  <table className="w-full min-w-[640px] text-left text-xs">
                    <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Дата</th>
                        <th className="px-4 py-3">Клиент</th>
                        <th className="px-4 py-3">Услуга</th>
                        <th className="px-4 py-3">Сумма</th>
                        <th className="px-4 py-3">Статус</th>
                        <th className="px-4 py-3">Действие</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 text-slate-200">
                      {data.transactions.length > 0 ? (
                        data.transactions.map((tx) => (
                          <tr key={tx.id}>
                            <td className="px-4 py-3 text-slate-400">
                              {new Date(tx.createdAt).toLocaleString('ru-RU')}
                            </td>
                            <td className="px-4 py-3">{tx.userEmail}</td>
                            <td className="px-4 py-3 font-semibold text-white">{tx.title}</td>
                            <td className="px-4 py-3 font-mono font-bold">
                              {tx.amountRub.toLocaleString('ru-RU')} ₽
                            </td>
                            <td className="px-4 py-3">{tx.status}</td>
                            <td className="px-4 py-3">
                              {tx.status === 'SUCCEEDED' && (
                                <button
                                  type="button"
                                  onClick={() => handleRefundOrder(tx.id)}
                                  className="text-rose-400 hover:underline"
                                >
                                  Возврат
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                            Платежей пока не зафиксировано.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 5. ПАРТНЕРЫ И ВЫПЛАТЫ */}
          {section === 'AFFILIATES' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-white">
                  Заявки партнеров на выплату ({data.payouts.length})
                </h2>
                <div className="mt-3 space-y-2.5">
                  {data.payouts.length > 0 ? (
                    data.payouts.map((p) => (
                      <div
                        key={p.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-xs"
                      >
                        <div>
                          <div className="font-bold text-white">
                            {p.userEmail} · {p.amountRub.toLocaleString('ru-RU')} ₽ ({p.method})
                          </div>
                          <div className="mt-0.5 text-slate-400">
                            Реквизиты: {p.requisites}
                          </div>
                        </div>

                        {p.status === 'PENDING' ? (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleProcessPayout(p.id, 'PAID')}
                              className="rounded-lg bg-emerald-500 px-3 py-1.5 font-bold text-slate-950"
                            >
                              Выплачено
                            </button>
                            <button
                              type="button"
                              onClick={() => handleProcessPayout(p.id, 'REJECTED')}
                              className="rounded-lg bg-rose-500/20 px-3 py-1.5 font-bold text-rose-300"
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
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 text-xs text-slate-400">
                      Активных заявок на вывод нет.
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-base font-bold text-white">
                  Реферальные ссылки ({data.affiliateLinks.length})
                </h3>
                <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/75">
                  <table className="w-full min-w-[580px] text-left text-xs">
                    <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Партнер</th>
                        <th className="px-4 py-3">Код (?ref=)</th>
                        <th className="px-4 py-3">Клики</th>
                        <th className="px-4 py-3">Регистрации</th>
                        <th className="px-4 py-3">Покупки</th>
                        <th className="px-4 py-3">Начислено</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 text-slate-200">
                      {data.affiliateLinks.map((l) => (
                        <tr key={l.id}>
                          <td className="px-4 py-3">{l.userEmail}</td>
                          <td className="px-4 py-3 font-mono text-emerald-400">{l.code}</td>
                          <td className="px-4 py-3">{l.clicks}</td>
                          <td className="px-4 py-3">{l.registrations}</td>
                          <td className="px-4 py-3">{l.buyers}</td>
                          <td className="px-4 py-3 font-mono font-bold">
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

          {/* 6. НАСТРОЙКИ ЮKASSA, TELEGRAM И РЕКВИЗИТОВ */}
          {section === 'SETTINGS' && (
            <form
              onSubmit={handleSaveSettings}
              className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-6"
            >
              <div>
                <h2 className="text-lg font-bold text-white">Платежный шлюз ЮKassa</h2>
                <p className="mt-1 text-xs text-slate-400">
                  Пока вы тестируете сайт, используйте «Тестовый режим». После получения Shop ID и Секретного ключа в кабинете ЮKassa переключите на «Боевой режим ЮKassa».
                </p>

                <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs text-slate-400">Режим приема оплат</label>
                    <select
                      value={settingsDraft.paymentMode}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          paymentMode: e.target.value as 'TEST_INSTANT' | 'YOOKASSA_LIVE',
                        })
                      }
                      className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white"
                    >
                      <option value="TEST_INSTANT">Тестовый режим (мгновенно)</option>
                      <option value="YOOKASSA_LIVE">Боевой шлюз ЮKassa API v3</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400">Shop ID ЮKassa</label>
                    <input
                      type="text"
                      value={settingsDraft.yookassaShopId}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, yookassaShopId: e.target.value })
                      }
                      placeholder="Напр. 394102"
                      className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 font-mono text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400">
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
                      className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 font-mono text-xs text-white"
                    />
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400">
                  Адрес для HTTP-уведомлений в личном кабинете ЮKassa:{' '}
                  <code className="font-mono text-emerald-400">{webhookUrl}</code>
                </div>
              </div>

              {/* Telegram Bot */}
              <div className="border-t border-slate-800 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-white">
                      Интеграция закрытого VIP-канала Telegram
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Создайте бота через @BotFather, добавьте его администратором в ваш приватный VIP-канал с правом приглашения участников и публикации постов.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleTestTelegram}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/10 px-3.5 py-2 text-xs font-bold text-sky-300 hover:bg-sky-500/20"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Проверить связь с каналом</span>
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs text-slate-400">
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
                      className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 font-mono text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400">
                      ID закрытого VIP-канала
                    </label>
                    <input
                      type="text"
                      value={settingsDraft.telegramVipChannelId}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          telegramVipChannelId: e.target.value,
                        })
                      }
                      placeholder="-1001987654321"
                      className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 font-mono text-xs text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Бренд и юридические реквизиты */}
              <div className="border-t border-slate-800 pt-5">
                <h3 className="text-base font-bold text-white">
                  Бренд, контакты и реквизиты для Оферты
                </h3>
                <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs text-slate-400">Название бренда</label>
                    <input
                      type="text"
                      value={settingsDraft.brandName}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, brandName: e.target.value })
                      }
                      className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400">
                      Ссылка на бесплатный Telegram-канал
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
                      className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400">
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
                      className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400">Email поддержки</label>
                    <input
                      type="email"
                      value={settingsDraft.supportEmail}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, supportEmail: e.target.value })
                      }
                      className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400">
                      Наименование исполнителя (ИП / Самозанятый / ООО)
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
                      className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400">ИНН / ОГРНИП</label>
                    <input
                      type="text"
                      value={settingsDraft.legalInn}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, legalInn: e.target.value })
                      }
                      className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Смена доступа администратора */}
              <div className="border-t border-slate-800 pt-5">
                <h3 className="text-base font-bold text-white">
                  Смена логина и пароля администратора
                </h3>
                <div className="mt-3 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <input
                    type="email"
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    placeholder="Новый email администратора (необязательно)"
                    className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white"
                  />
                  <input
                    type="password"
                    value={newAdminPassword}
                    onChange={(e) => setNewAdminPassword(e.target.value)}
                    placeholder="Новый пароль администратора (минимум 6 символов)"
                    className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="rounded-xl bg-emerald-500 px-6 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-400"
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
