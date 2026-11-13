'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Coins,
  Download,
  Gift,
  MessageSquareText,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Smartphone,
  Tag,
  Trash2,
  Users,
} from 'lucide-react';
import { AdminAiChatPanel } from '@/components/admin/AdminAiChatPanel';
import { AiAutopilotPanel } from '@/components/admin/AiAutopilotPanel';
import type {
  AccessTier,
  AiAutopilotConfig,
  AiAutopilotLogEntry,
  AiChatMessage,
  AiPerformanceStats,
  AiPredictionDraft,
  OrderTransaction,
  PayoutRequestRecord,
  PlatformSettings,
  PredictionRecord,
  PromoCodeRecord,
  ResultStatus,
  SafeSessionUser,
  SportType,
  StatsSummary,
} from '@/server/types';

interface AdminOverviewPayload {
  settings: PlatformSettings;
  predictions: PredictionRecord[];
  promoCodes: PromoCodeRecord[];
  users: SafeSessionUser[];
  transactions: OrderTransaction[];
  payouts: PayoutRequestRecord[];
  stats: StatsSummary;
  aiAutopilot: AiAutopilotConfig;
  aiDrafts: AiPredictionDraft[];
  aiLogs: AiAutopilotLogEntry[];
  aiChatMessages?: AiChatMessage[];
  aiStats: AiPerformanceStats;
}

const LEAGUE_PRESETS: Array<{ label: string; sport: SportType; league: string }> = [
  { label: 'ЛЧ УЕФА', sport: 'FOOTBALL', league: 'Лига Чемпионов УЕФА' },
  { label: 'АПЛ', sport: 'FOOTBALL', league: 'Англия · Премьер-лига' },
  { label: 'РПЛ', sport: 'FOOTBALL', league: 'Россия · Мир РПЛ' },
  { label: 'КХЛ', sport: 'HOCKEY', league: 'КХЛ · Регулярный сезон' },
  { label: 'НХЛ', sport: 'HOCKEY', league: 'NHL · Регулярный чемпионат' },
  { label: 'ATP Tour', sport: 'TENNIS', league: 'ATP Masters 1000' },
  { label: 'CS2 Tier-1', sport: 'ESPORTS', league: 'CS2 · BLAST Premier' },
  { label: 'UFC', sport: 'MMA', league: 'UFC · Номерной турнир' },
];

export default function AdminDashboardPage() {
  const [data, setData] = useState<AdminOverviewPayload | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [tab, setTab] = useState<
    | 'AUTOPILOT'
    | 'AI_CHAT'
    | 'PREDICTIONS'
    | 'PRICING_PROMOS'
    | 'FINANCE'
    | 'USERS'
    | 'SETTINGS'
  >('AUTOPILOT');
  const [notice, setNotice] = useState<string | null>(null);

  // Форма нового прогноза
  const [sport, setSport] = useState<SportType>('FOOTBALL');
  const [leagueName, setLeagueName] = useState('Лига Чемпионов УЕФА');
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [matchStartsAt, setMatchStartsAt] = useState(() => {
    const d = new Date(Date.now() + 5 * 3600_000);
    return d.toISOString().slice(0, 16);
  });
  const [accessTier, setAccessTier] = useState<AccessTier>('PAID_SINGLE');
  const [singlePriceRub, setSinglePriceRub] = useState(890);
  const [insuredOnLoss, setInsuredOnLoss] = useState(true);
  const [selectionTitle, setSelectionTitle] = useState('');
  const [fixedOdds, setFixedOdds] = useState(1.92);
  const [stakeUnits, setStakeUnits] = useState(2.0);
  const [bookmakerSource, setBookmakerSource] = useState('Фонбет / Pari');
  const [analysisTeaser, setAnalysisTeaser] = useState('');
  const [analysisFull, setAnalysisFull] = useState('');
  const [isFeatured, setIsFeatured] = useState(false);

  // Форма пакетов и промокодов
  const [defaultPriceInput, setDefaultPriceInput] = useState(890);
  const [bundle2PctInput, setBundle2PctInput] = useState(15);
  const [bundle3PctInput, setBundle3PctInput] = useState(25);
  const [newPromoCode, setNewPromoCode] = useState('');
  const [newPromoPct, setNewPromoPct] = useState(15);
  const [newPromoMaxUses, setNewPromoMaxUses] = useState(200);

  // Настройки интеграций и доступов администратора
  const [settingsDraft, setSettingsDraft] = useState<PlatformSettings | null>(null);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [userSearch, setUserSearch] = useState('');

  const downloadOrdersCsv = () => {
    const rows = data?.transactions ?? [];
    const header = [
      'ID заказа',
      'Дата и время',
      'Email покупателя',
      'Наименование',
      'Сумма (RUB)',
      'Способ оплаты',
      'Статус',
      'Промокод',
      'Возврат по страховке',
    ];
    const escapeCell = (v: string | number) =>
      `"${String(v).replace(/"/g, '""')}"`;

    const lines = [
      header.map(escapeCell).join(';'),
      ...rows.map((r) =>
        [
          r.id,
          new Date(r.createdAt).toLocaleString('ru-RU'),
          r.userEmail,
          r.title,
          r.amountRub,
          r.paymentMethod === 'yookassa' ? 'ЮKassa (Карта/СБП)' : 'Внутренний баланс',
          r.status,
          r.promoCode || '',
          r.insuranceCredited ? 'Да' : 'Нет',
        ]
          .map(escapeCell)
          .join(';'),
      ),
    ];

    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `valuex_orders_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadOverview = useCallback(async () => {
    const res = await fetch('/api/v1/admin/overview', { cache: 'no-store' });
    if (!res.ok) {
      setAuthError(
        'Требуется вход под аккаунтом администратора (admin@valuex.pro).',
      );
      return;
    }
    const json = (await res.json()) as AdminOverviewPayload;
    setData(json);
    setSettingsDraft(json.settings);
    setDefaultPriceInput(json.settings.defaultSinglePriceRub);
    setBundle2PctInput(json.settings.bundle2DiscountPct);
    setBundle3PctInput(json.settings.bundle3DiscountPct);
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const showToast = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 4000);
  };

  const paidTransactions = (data?.transactions ?? []).filter(
    (t) => t.status === 'SUCCEEDED',
  );
  const totalRevenueRub = paidTransactions.reduce((acc, t) => acc + t.amountRub, 0);
  const dayAgo = Date.now() - 86_400_000;
  const todayRevenueRub = paidTransactions
    .filter((t) => new Date(t.createdAt).getTime() >= dayAgo)
    .reduce((acc, t) => acc + t.amountRub, 0);
  const buyersCount = (data?.users ?? []).filter(
    (u) => u.purchasedPredictionIds.length > 0,
  ).length;
  const pendingPredictionsCount = (data?.predictions ?? []).filter(
    (p) => p.resultStatus === 'PENDING',
  ).length;

  const handleCreatePrediction = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/v1/admin/predictions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sport,
        leagueName,
        homeTeam,
        awayTeam,
        matchStartsAt: new Date(matchStartsAt).toISOString(),
        accessTier,
        singlePriceRub: accessTier === 'FREE' ? null : Number(singlePriceRub),
        insuredOnLoss: accessTier === 'PAID_SINGLE' ? insuredOnLoss : false,
        selectionTitle,
        fixedOdds: Number(fixedOdds),
        stakeUnits: Number(stakeUnits),
        bookmakerSource,
        analysisTeaser,
        analysisFull,
        isFeatured,
        pushToTelegram: true,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      showToast(json.error || 'Ошибка публикации');
      return;
    }
    setHomeTeam('');
    setAwayTeam('');
    setSelectionTitle('');
    setAnalysisTeaser('');
    setAnalysisFull('');
    showToast('Событие опубликовано на витрине и зафиксировано SHA-256!');
    await loadOverview();
  };

  const handleSettle = async (id: string, resultStatus: ResultStatus) => {
    const score = window.prompt('Введите итоговый счет матча (например 2:1):', '2:1');
    if (score === null) return;
    const res = await fetch('/api/v1/admin/predictions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        predictionId: id,
        resultStatus,
        finalScore: score,
      }),
    });
    const json = await res.json();
    if (res.ok) {
      const compMsg =
        json.compensatedUsers > 0
          ? ` Страховка автоматически начислена ${json.compensatedUsers} покупателям!`
          : '';
      showToast(`Событие рассчитано (${resultStatus}).${compMsg}`);
      await loadOverview();
    }
  };

  const handleQuickEditPrice = async (item: PredictionRecord) => {
    const nextPriceStr = window.prompt(
      `Новая цена для «${item.homeTeam} — ${item.awayTeam}» (₽):`,
      String(item.singlePriceRub ?? defaultPriceInput),
    );
    if (!nextPriceStr) return;
    const nextPrice = Number(nextPriceStr);
    if (!Number.isFinite(nextPrice) || nextPrice < 50) return;

    await fetch('/api/v1/admin/predictions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        predictionId: item.id,
        editMeta: { singlePriceRub: nextPrice },
      }),
    });
    showToast('Цена события обновлена');
    await loadOverview();
  };

  const handleToggleInsured = async (item: PredictionRecord) => {
    await fetch('/api/v1/admin/predictions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        predictionId: item.id,
        editMeta: { insuredOnLoss: !item.insuredOnLoss },
      }),
    });
    showToast(
      !item.insuredOnLoss
        ? 'Страховка на баланс включена для события'
        : 'Страховка отключена для события',
    );
    await loadOverview();
  };

  const handleDeletePrediction = async (id: string) => {
    if (!window.confirm('Удалить событие с витрины?')) return;
    await fetch(`/api/v1/admin/predictions?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    showToast('Событие удалено');
    await loadOverview();
  };

  const handleSavePricingRules = async (applyToPending: boolean) => {
    await fetch('/api/v1/admin/finance', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'SAVE_PRICING_RULES',
        defaultSinglePriceRub: defaultPriceInput,
        bundle2DiscountPct: bundle2PctInput,
        bundle3DiscountPct: bundle3PctInput,
        applyToPending,
      }),
    });
    showToast(
      applyToPending
        ? 'Правила цен и пакетные скидки применены ко всем активным матчам!'
        : 'Правила цен и пакетных скидок сохранены!',
    );
    await loadOverview();
  };

  const handleCreatePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/v1/admin/finance', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'CREATE_PROMO',
        code: newPromoCode,
        discountPercent: newPromoPct,
        maxUses: newPromoMaxUses,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      showToast(json.error || 'Не удалось создать промокод');
      return;
    }
    setNewPromoCode('');
    showToast('Промокод создан и активен в окне оплаты!');
    await loadOverview();
  };

  const handleDeletePromo = async (promoId: string) => {
    await fetch('/api/v1/admin/finance', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'DELETE_PROMO', promoId }),
    });
    showToast('Промокод удален');
    await loadOverview();
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsDraft) return;
    const res = await fetch('/api/v1/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: settingsDraft,
        newAdminEmail: newAdminEmail.trim() || undefined,
        newAdminPassword: newAdminPassword.trim() || undefined,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      showToast(json.error || 'Ошибка сохранения настроек');
      return;
    }
    setNewAdminEmail('');
    setNewAdminPassword('');
    showToast('Настройки кассы ЮKassa, реквизитов и доступов сохранены!');
    await loadOverview();
  };

  const handleTestTelegram = async () => {
    const res = await fetch('/api/v1/admin/settings', { method: 'POST' });
    const json = await res.json();
    if (res.ok) {
      showToast('Тестовый анонс успешно отправлен в ваш Telegram-канал!');
    } else {
      showToast(json.error || 'Сначала сохраните Bot Token и ID канала');
    }
  };

  if (authError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F6FA] p-6">
        <div className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-800">{authError}</p>
          <Link
            href="/login"
            className="mt-4 inline-block rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white"
          >
            Войти в админ-аккаунт
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F6FA] text-slate-900">
      {/* Темная шапка админ-панели */}
      <header className="bg-[#0B0F19] text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>На витрину</span>
            </Link>
            <h1 className="text-lg font-black">
              Управление маркетплейсом прогнозов
            </h1>
          </div>

          {notice && (
            <div className="rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-bold text-white shadow">
              {notice}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* KPI карточки выручки */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">Выручка всего</div>
            <div className="mt-1 font-mono text-2xl font-black text-slate-950">
              {totalRevenueRub.toLocaleString('ru-RU')} ₽
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">Продажи за 24ч</div>
            <div className="mt-1 font-mono text-2xl font-black text-blue-600">
              {todayRevenueRub.toLocaleString('ru-RU')} ₽
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">Оплаченных чеков</div>
            <div className="mt-1 font-mono text-2xl font-black text-slate-950">
              {paidTransactions.length}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">Покупателей / Всего</div>
            <div className="mt-1 font-mono text-2xl font-black text-slate-950">
              {buyersCount} / {data?.users.length ?? 0}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">Активных на витрине</div>
            <div className="mt-1 font-mono text-2xl font-black text-emerald-600">
              {pendingPredictionsCount}
            </div>
          </div>
        </div>

        {/* Навигация разделов */}
        <div className="mt-6 flex flex-wrap gap-2">
          {(
            [
              ['AUTOPILOT', 'ИИ-Автопилот 24/7', Bot],
              ['AI_CHAT', 'ИИ-Чат и Управление', MessageSquareText],
              ['PREDICTIONS', 'События и расчет', Plus],
              ['PRICING_PROMOS', 'Пакеты и Промокоды', Tag],
              ['FINANCE', 'Чеки и выплаты', Coins],
              ['USERS', 'Клиенты и партнеры', Users],
              ['SETTINGS', 'ЮKassa, Telegram и Реквизиты', Settings],
            ] as const
          ).map(([id, label, Icon]) => {
            const pendingPayoutsCount = (data?.payouts ?? []).filter(
              (p) => p.status === 'PENDING',
            ).length;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                  tab === id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'border border-slate-200 bg-white text-slate-600 hover:text-slate-950'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
                {id === 'AUTOPILOT' &&
                  data?.aiAutopilot.mode === 'FULL_AUTOPILOT' && (
                    <span
                      className="h-2 w-2 rounded-full bg-emerald-400"
                      title="Полный автопилот активен"
                    />
                  )}
                {id === 'FINANCE' && pendingPayoutsCount > 0 && (
                  <span className="rounded-full bg-amber-500 px-1.5 py-0.5 font-mono text-[10px] font-black text-white">
                    {pendingPayoutsCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ВКЛАДКА 0: ИИ-АВТОПИЛОТ 24/7 */}
        {tab === 'AUTOPILOT' && data && (
          <AiAutopilotPanel
            config={data.aiAutopilot}
            drafts={data.aiDrafts}
            logs={data.aiLogs}
            aiStats={data.aiStats}
            onRefresh={loadOverview}
            onToast={showToast}
          />
        )}

        {/* ВКЛАДКА 0.5: ЖИВОЙ ЧАТ С ИИ-УПРАВЛЯЮЩИМ И ПОЛНОЕ УПРАВЛЕНИЕ САЙТОМ */}
        {tab === 'AI_CHAT' && data && (
          <AdminAiChatPanel
            initialMessages={data.aiChatMessages ?? []}
            llmProvider={data.aiAutopilot.llmProvider}
            llmBaseUrl={data.aiAutopilot.llmBaseUrl}
            llmApiKey={data.aiAutopilot.llmApiKey}
            llmModel={data.aiAutopilot.llmModel}
            hasApiKey={
              data.aiAutopilot.llmProvider !== 'BUILTIN_QUANT' &&
              data.aiAutopilot.llmApiKey.trim().length > 8
            }
            onRefresh={loadOverview}
          />
        )}

        {/* ВКЛАДКА 1: СОБЫТИЯ */}
        {tab === 'PREDICTIONS' && (
          <div className="mt-6 grid gap-6 lg:grid-cols-12">
            {/* Форма публикации */}
            <form
              onSubmit={handleCreatePrediction}
              className="space-y-3.5 rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-5"
            >
              <h2 className="text-base font-extrabold text-slate-950">
                Опубликовать новое событие на витрину
              </h2>

              {/* Быстрые пресеты популярных лиг */}
              <div>
                <div className="mb-1.5 text-[11px] font-semibold text-slate-400">
                  Быстрый выбор турнира:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {LEAGUE_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setSport(preset.sport);
                        setLeagueName(preset.league);
                      }}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-500">Вид спорта</label>
                  <select
                    value={sport}
                    onChange={(e) => setSport(e.target.value as SportType)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold"
                  >
                    <option value="FOOTBALL">Футбол</option>
                    <option value="HOCKEY">Хоккей</option>
                    <option value="TENNIS">Теннис</option>
                    <option value="ESPORTS">Киберспорт</option>
                    <option value="BASKETBALL">Баскетбол</option>
                    <option value="MMA">ММА / Бокс</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500">Формат продажи</label>
                  <select
                    value={accessTier}
                    onChange={(e) => setAccessTier(e.target.value as AccessTier)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold"
                  >
                    <option value="PAID_SINGLE">Платный прогноз (разовый)</option>
                    <option value="FREE">Бесплатный открытый прогноз</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500">Лига / Турнир</label>
                <input
                  required
                  value={leagueName}
                  onChange={(e) => setLeagueName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-500">Хозяева / Игрок 1</label>
                  <input
                    required
                    value={homeTeam}
                    onChange={(e) => setHomeTeam(e.target.value)}
                    placeholder="Реал Мадрид"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500">Гости / Игрок 2</label>
                  <input
                    required
                    value={awayTeam}
                    onChange={(e) => setAwayTeam(e.target.value)}
                    placeholder="Бавария"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-500">Начало матча</label>
                  <input
                    type="datetime-local"
                    required
                    value={matchStartsAt}
                    onChange={(e) => setMatchStartsAt(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                  />
                </div>
                {accessTier === 'PAID_SINGLE' && (
                  <div>
                    <label className="text-[11px] font-bold text-slate-500">
                      Цена события (₽)
                    </label>
                    <input
                      type="number"
                      min={50}
                      required
                      value={singlePriceRub}
                      onChange={(e) => setSinglePriceRub(Number(e.target.value))}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs font-bold"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div className="col-span-2">
                  <label className="text-[11px] font-bold text-slate-500">
                    Точный исход (скрыт до оплаты)
                  </label>
                  <input
                    required
                    value={selectionTitle}
                    onChange={(e) => setSelectionTitle(e.target.value)}
                    placeholder="Фора 1 (-1.0) / ТБ 2.5"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500">Кэф</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={fixedOdds}
                    onChange={(e) => setFixedOdds(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-500">Флэт (% от банка)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={stakeUnits}
                    onChange={(e) => setStakeUnits(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500">Букмекер</label>
                  <input
                    value={bookmakerSource}
                    onChange={(e) => setBookmakerSource(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500">
                  Публичный анонс на карточке витрины
                </label>
                <textarea
                  required
                  rows={2}
                  value={analysisTeaser}
                  onChange={(e) => setAnalysisTeaser(e.target.value)}
                  placeholder="Краткое описание ценности матча для покупателя..."
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500">
                  Закрытая аналитика (открывается после покупки)
                </label>
                <textarea
                  required
                  rows={3}
                  value={analysisFull}
                  onChange={(e) => setAnalysisFull(e.target.value)}
                  placeholder="Подробные цифры xG, составы, мотивация и обоснование выбора..."
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"
                />
              </div>

              <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
                {accessTier === 'PAID_SINGLE' && (
                  <label className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                    <input
                      type="checkbox"
                      checked={insuredOnLoss}
                      onChange={(e) => setInsuredOnLoss(e.target.checked)}
                    />
                    <span>Страховка 100% возврата на баланс при минусе</span>
                  </label>
                )}

                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={isFeatured}
                    onChange={(e) => setIsFeatured(e.target.checked)}
                  />
                  <span>Закрепить как «Главное событие дня» в шапке</span>
                </label>
              </div>

              <button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Выставить на витрину (+ SHA-256)</span>
              </button>
            </form>

            {/* Список всех матчей и расчет в 1 клик */}
            <div className="space-y-3 lg:col-span-7">
              {(data?.predictions ?? []).map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-400">
                        <span>{item.leagueName}</span>
                        <span>·</span>
                        {item.accessTier === 'PAID_SINGLE' ? (
                          <button
                            type="button"
                            onClick={() => handleQuickEditPrice(item)}
                            className="font-mono text-blue-600 underline decoration-dotted hover:text-blue-800"
                            title="Нажмите для изменения цены"
                          >
                            {item.singlePriceRub} ₽ (изм.)
                          </button>
                        ) : (
                          <span className="text-emerald-600">БЕСПЛАТНО</span>
                        )}
                        {item.accessTier === 'PAID_SINGLE' && (
                          <button
                            type="button"
                            onClick={() => handleToggleInsured(item)}
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                              item.insuredOnLoss
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            <ShieldCheck className="h-3 w-3" />
                            <span>
                              {item.insuredOnLoss ? 'Страховка ВКЛ' : 'Без страховки'}
                            </span>
                          </button>
                        )}
                      </div>
                      <div className="mt-0.5 text-sm font-extrabold text-slate-950">
                        {item.homeTeam} — {item.awayTeam}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-600">
                        Исход: <strong>{item.selectionTitle}</strong> @{' '}
                        <strong className="font-mono">{item.fixedOdds.toFixed(2)}</strong>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {item.resultStatus === 'PENDING' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSettle(item.id, 'WIN')}
                            className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700"
                          >
                            WIN
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSettle(item.id, 'LOSS')}
                            className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-rose-700"
                          >
                            LOSS
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSettle(item.id, 'PUSH')}
                            className="rounded-lg bg-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-300"
                          >
                            PUSH
                          </button>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs font-bold text-slate-700">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          <span>
                            {item.resultStatus} ({item.finalScore})
                          </span>
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDeletePrediction(item.id)}
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

        {/* ВКЛАДКА 2: ПАКЕТНЫЕ СКИДКИ И ПРОМОКОДЫ */}
        {tab === 'PRICING_PROMOS' && (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {/* Правила цен и пакетов */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="text-base font-extrabold text-slate-950">
                Ценообразование ординаров и пакетные скидки
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Когда покупатель добавляет 2 или 3+ событий кнопкой «+ В пакет», скидка применяется автоматически.
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-500">
                    Базовая цена 1 события (₽)
                  </label>
                  <input
                    type="number"
                    value={defaultPriceInput}
                    onChange={(e) => setDefaultPriceInput(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500">
                    Скидка за 2 события (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={bundle2PctInput}
                    onChange={(e) => setBundle2PctInput(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500">
                    Скидка за 3+ события (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={bundle3PctInput}
                    onChange={(e) => setBundle3PctInput(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm font-bold"
                  />
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => handleSavePricingRules(false)}
                  className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800"
                >
                  Сохранить правила
                </button>
                <button
                  type="button"
                  onClick={() => handleSavePricingRules(true)}
                  className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700"
                >
                  Сохранить + обновить цену всех активных событий
                </button>
              </div>
            </div>

            {/* Промокоды */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="text-base font-extrabold text-slate-950">
                Промокоды для Telegram и рассылок
              </h2>
              <form onSubmit={handleCreatePromo} className="mt-4 grid gap-3 sm:grid-cols-4">
                <input
                  required
                  value={newPromoCode}
                  onChange={(e) => setNewPromoCode(e.target.value.toUpperCase())}
                  placeholder="КОД (DERBY20)"
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs font-bold uppercase sm:col-span-2"
                />
                <input
                  type="number"
                  min={5}
                  max={60}
                  required
                  value={newPromoPct}
                  onChange={(e) => setNewPromoPct(Number(e.target.value))}
                  placeholder="Скидка %"
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs font-bold"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
                >
                  Создать
                </button>
              </form>

              <div className="mt-4 divide-y divide-slate-100">
                {(data?.promoCodes ?? []).map((promo) => (
                  <div
                    key={promo.id}
                    className="flex items-center justify-between py-2.5 text-xs"
                  >
                    <div>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono font-bold text-slate-900">
                        {promo.code}
                      </span>
                      <span className="ml-2 font-bold text-blue-600">
                        −{promo.discountPercent}%
                      </span>
                      <span className="ml-2 text-slate-400">
                        Использовано: {promo.usedCount} / {promo.maxUses}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeletePromo(promo.id)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ВКЛАДКА 3: ЧЕКИ, ВОЗВРАТЫ И ВЫПЛАТЫ ПАРТНЕРАМ */}
        {tab === 'FINANCE' && (
          <div className="mt-6 space-y-6">
            {/* Заявки на вывод партнерских средств */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-6 py-4">
                <div>
                  <h2 className="text-base font-extrabold text-slate-950">
                    Заявки партнеров на выплату (СБП / Карта РФ)
                  </h2>
                  <p className="text-xs text-slate-500">
                    После перевода средств по реквизитам отметьте заявку оплаченной
                  </p>
                </div>
              </div>
              {(data?.payouts ?? []).length === 0 ? (
                <div className="px-6 py-6 text-xs text-slate-500">
                  Заявок на вывод партнерского вознаграждения пока нет.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {(data?.payouts ?? []).map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 text-xs"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-black text-slate-950">
                            {p.amountRub.toLocaleString('ru-RU')} ₽
                          </span>
                          <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold text-slate-800">
                            {p.requisites}
                          </span>
                        </div>
                        <div className="mt-0.5 text-slate-400">
                          {p.userEmail} · {new Date(p.createdAt).toLocaleString('ru-RU')}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {p.status === 'PENDING' ? (
                          <>
                            <button
                              type="button"
                              onClick={async () => {
                                await fetch('/api/v1/admin/finance', {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    action: 'PROCESS_PAYOUT',
                                    payoutId: p.id,
                                    decision: 'PAID',
                                  }),
                                });
                                showToast('Выплата отмечена как исполненная');
                                await loadOverview();
                              }}
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white hover:bg-emerald-700"
                            >
                              Отметить выплаченной
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await fetch('/api/v1/admin/finance', {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    action: 'PROCESS_PAYOUT',
                                    payoutId: p.id,
                                    decision: 'REJECTED',
                                  }),
                                });
                                showToast('Заявка отклонена, сумма возвращена на партнерский счет');
                                await loadOverview();
                              }}
                              className="rounded-lg border border-rose-200 px-3 py-1.5 font-bold text-rose-600 hover:bg-rose-50"
                            >
                              Отклонить
                            </button>
                          </>
                        ) : (
                          <span
                            className={`rounded-lg px-2.5 py-1 font-bold ${
                              p.status === 'PAID'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            {p.status === 'PAID' ? 'Выплачено' : 'Отклонено'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Реестр заказов */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
                <h2 className="text-base font-extrabold text-slate-950">
                  Реестр заказов и возвратов страховки
                </h2>
                <button
                  type="button"
                  onClick={downloadOrdersCsv}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-800 hover:bg-white"
                >
                  <Download className="h-3.5 w-3.5 text-blue-600" />
                  <span>Скачать CSV (Excel / Бухгалтерия)</span>
                </button>
              </div>
              <div className="divide-y divide-slate-100">
                {(data?.transactions ?? []).map((order) => (
                  <div
                    key={order.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 text-xs"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900">{order.title}</span>
                        {order.promoCode && (
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-700">
                            {order.promoCode}
                          </span>
                        )}
                        {order.insuranceCredited && (
                          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                            Страховка выплачена на баланс
                          </span>
                        )}
                      </div>
                      <div className="text-slate-400">
                        {order.userEmail} ·{' '}
                        {new Date(order.createdAt).toLocaleString('ru-RU')}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="font-mono font-bold text-slate-950">
                        {order.amountRub.toLocaleString('ru-RU')} ₽ (
                        {order.status === 'SUCCEEDED'
                          ? 'Оплачен'
                          : order.status === 'REFUNDED'
                            ? 'Возврат'
                            : 'Ожидает'}
                        )
                      </div>
                      {order.status === 'SUCCEEDED' && (
                        <button
                          type="button"
                          onClick={async () => {
                            if (
                              !window.confirm(
                                `Вернуть ${order.amountRub} ₽ на внутренний баланс покупателя и отозвать доступ к прогнозу?`,
                              )
                            ) {
                              return;
                            }
                            const res = await fetch('/api/v1/admin/finance', {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                action: 'REFUND_ORDER',
                                orderId: order.id,
                              }),
                            });
                            if (res.ok) {
                              showToast('Возврат выполнен на баланс клиента');
                              await loadOverview();
                            }
                          }}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-600"
                        >
                          Возврат на баланс
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ВКЛАДКА 4: ПОЛЬЗОВАТЕЛИ И ПАРТНЕРЫ */}
        {tab === 'USERS' && (
          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-6 py-4">
              <div className="relative max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Поиск клиента по Email или имени..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs focus:border-blue-600 focus:bg-white focus:outline-none"
                />
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {(data?.users ?? [])
                .filter((u) => {
                  const q = userSearch.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    u.email.toLowerCase().includes(q) ||
                    u.displayName.toLowerCase().includes(q)
                  );
                })
                .map((u) => (
                <div
                  key={u.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-xs"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2 font-bold text-slate-950">
                      <span>
                        {u.displayName} ({u.email})
                      </span>
                      {u.role === 'ADMIN' && (
                        <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold text-blue-700">
                          АДМИНИСТРАТОР
                        </span>
                      )}
                      {u.status === 'BLOCKED' && (
                        <span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-extrabold text-rose-700">
                          ЗАБЛОКИРОВАН
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-slate-500">
                      Баланс покупок: <strong>{u.balanceRub} ₽</strong> · Партнерский счет:{' '}
                      <strong>{u.affiliateBalanceRub} ₽</strong> (ставка{' '}
                      <strong>{u.revsharePercent}%</strong>, заработано всего:{' '}
                      <strong>{u.affiliateTotalEarnedRub} ₽</strong>) · Открыто прогнозов:{' '}
                      <strong>{u.purchasedPredictionIds.length}</strong>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        const amount = Number(
                          window.prompt('Начислить на баланс (₽):', '1000') || '0',
                        );
                        if (!amount) return;
                        await fetch('/api/v1/admin/users', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            action: 'ADD_BALANCE',
                            userId: u.id,
                            amountRub: amount,
                          }),
                        });
                        showToast('Баланс начислен');
                        await loadOverview();
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold text-slate-700 hover:bg-slate-50"
                    >
                      + Начислить ₽
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        const pending = (data?.predictions ?? []).filter(
                          (p) =>
                            p.resultStatus === 'PENDING' &&
                            !u.purchasedPredictionIds.includes(p.id),
                        );
                        if (pending.length === 0) {
                          showToast('Все актуальные матчи уже открыты у этого клиента');
                          return;
                        }
                        const listStr = pending
                          .slice(0, 8)
                          .map((p, idx) => `${idx + 1}. ${p.homeTeam} — ${p.awayTeam}`)
                          .join('\n');
                        const choice = Number(
                          window.prompt(
                            `Какой матч бесплатно открыть для ${u.email}?\nВведите номер:\n${listStr}`,
                            '1',
                          ) || '0',
                        );
                        const chosen = pending[choice - 1];
                        if (!chosen) return;
                        const res = await fetch('/api/v1/admin/users', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            action: 'GRANT_PREDICTION',
                            userId: u.id,
                            predictionId: chosen.id,
                          }),
                        });
                        if (res.ok) {
                          showToast(
                            `Доступ к «${chosen.homeTeam} — ${chosen.awayTeam}» открыт для ${u.email}!`,
                          );
                          await loadOverview();
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 font-bold text-blue-700 hover:bg-blue-100"
                    >
                      <Gift className="h-3.5 w-3.5" />
                      <span>Подарить матч</span>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        const pctStr = window.prompt(
                          `Партнерский процент для ${u.displayName} (от 5 до 60%):`,
                          String(u.revsharePercent),
                        );
                        if (!pctStr) return;
                        const pct = Number(pctStr);
                        if (!Number.isFinite(pct)) return;
                        await fetch('/api/v1/admin/users', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            action: 'SET_REVSHARE',
                            userId: u.id,
                            revsharePercent: pct,
                          }),
                        });
                        showToast('Партнерский процент обновлен');
                        await loadOverview();
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold text-slate-700 hover:bg-slate-50"
                    >
                      Партнерка {u.revsharePercent}%
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        const nextPass = window.prompt(
                          `Задать новый пароль для ${u.email} (минимум 6 символов):`,
                          'Vx123456',
                        );
                        if (!nextPass) return;
                        const res = await fetch('/api/v1/admin/users', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            action: 'RESET_PASSWORD',
                            userId: u.id,
                            newPassword: nextPass,
                          }),
                        });
                        if (res.ok) {
                          showToast(`Новый пароль установлен для ${u.email}`);
                        }
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold text-slate-700 hover:bg-slate-50"
                    >
                      Сменить пароль
                    </button>

                    {u.role !== 'ADMIN' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await fetch('/api/v1/admin/users', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              action: 'TOGGLE_BLOCK',
                              userId: u.id,
                            }),
                          });
                          showToast(
                            u.status === 'BLOCKED'
                              ? 'Аккаунт разблокирован'
                              : 'Аккаунт заблокирован',
                          );
                          await loadOverview();
                        }}
                        className={`rounded-lg border px-3 py-1.5 font-bold ${
                          u.status === 'BLOCKED'
                            ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                            : 'border-rose-200 text-rose-600 hover:bg-rose-50'
                        }`}
                      >
                        {u.status === 'BLOCKED' ? 'Разблокировать' : 'Блок'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ВКЛАДКА 5: НАСТРОЙКИ ЮKASSA, TELEGRAM, РЕКВИЗИТОВ И ПАРОЛЯ АДМИНА */}
        {tab === 'SETTINGS' && settingsDraft && (
          <form
            onSubmit={handleSaveSettings}
            className="mt-6 max-w-3xl space-y-5 rounded-2xl border border-slate-200 bg-white p-6"
          >
            <h2 className="text-base font-extrabold text-slate-950">
              Платежный шлюз ЮKassa, Telegram, реквизиты и доступ администратора
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-[11px] font-bold text-slate-500">Название бренда</label>
                <input
                  value={settingsDraft.brandName}
                  onChange={(e) =>
                    setSettingsDraft({ ...settingsDraft, brandName: e.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500">Режим приема оплат</label>
                <select
                  value={settingsDraft.paymentMode}
                  onChange={(e) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      paymentMode: e.target.value as 'TEST_INSTANT' | 'YOOKASSA_LIVE',
                    })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold"
                >
                  <option value="TEST_INSTANT">Демо-касса (мгновенная оплата)</option>
                  <option value="YOOKASSA_LIVE">Боевая ЮKassa (Карты РФ / СБП)</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-[11px] font-bold text-slate-500">ЮKassa Shop ID</label>
                <input
                  value={settingsDraft.yookassaShopId}
                  onChange={(e) =>
                    setSettingsDraft({ ...settingsDraft, yookassaShopId: e.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500">ЮKassa Secret Key</label>
                <input
                  type="password"
                  value={settingsDraft.yookassaSecretKey}
                  onChange={(e) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      yookassaSecretKey: e.target.value,
                    })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs"
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-slate-900">
                  Интеграция с Telegram-каналом и контакты поддержки
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await fetch('/api/v1/admin/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'INSTALL_MINI_APP' }),
                      });
                      const json = (await res.json()) as {
                        message?: string;
                        error?: string;
                      };
                      showToast(
                        res.ok
                          ? json.message || 'Telegram Mini App установлен!'
                          : json.error || 'Ошибка установки Mini App',
                      );
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100"
                  >
                    <Smartphone className="h-3 w-3" />
                    <span>Установить кнопку Mini App в бота</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleTestTelegram}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-50"
                  >
                    <Send className="h-3 w-3" />
                    <span>Отправить тестовый пост в канал</span>
                  </button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-[11px] font-bold text-slate-500">
                    Telegram Bot Token (@BotFather)
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
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500">
                    ID канала для автопостинга (@channel или -100...)
                  </label>
                  <input
                    value={settingsDraft.telegramChannelId}
                    onChange={(e) =>
                      setSettingsDraft({
                        ...settingsDraft,
                        telegramChannelId: e.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500">
                    Ссылка на открытый Telegram-канал (в шапке сайта)
                  </label>
                  <input
                    value={settingsDraft.freeTelegramUrl}
                    onChange={(e) =>
                      setSettingsDraft({
                        ...settingsDraft,
                        freeTelegramUrl: e.target.value,
                      })
                    }
                    placeholder="https://t.me/your_channel"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500">
                    Ссылка на поддержку в Telegram
                  </label>
                  <input
                    value={settingsDraft.supportTelegram}
                    onChange={(e) =>
                      setSettingsDraft({
                        ...settingsDraft,
                        supportTelegram: e.target.value,
                      })
                    }
                    placeholder="https://t.me/your_support"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-[11px] font-bold text-slate-500">
                  Наименование продавца (ИП / Самозанятый / ООО для оферты)
                </label>
                <input
                  value={settingsDraft.legalSellerName}
                  onChange={(e) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      legalSellerName: e.target.value,
                    })
                  }
                  placeholder="ИП Иванов И.И."
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500">
                  ИНН продавца (появится в подвале и оферте, когда заполнен)
                </label>
                <input
                  value={settingsDraft.legalInn}
                  onChange={(e) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      legalInn: e.target.value,
                    })
                  }
                  placeholder="770000000000"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[11px] font-bold text-slate-500">
                  ID счетчика Яндекс.Метрики (для аналитики рекламы и автоцели «purchase_success»)
                </label>
                <input
                  value={settingsDraft.yandexMetrikaId || ''}
                  onChange={(e) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      yandexMetrikaId: e.target.value.replace(/\D/g, ''),
                    })
                  }
                  placeholder="Например: 98765432 (оставьте пустым, если не используется)"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs"
                />
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
              <div className="text-xs font-extrabold text-slate-900">
                Безопасность: смена логина и пароля администратора
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Оставьте поля пустыми, если менять не нужно. Рекомендуем сменить стандартный пароль после установки на сервер.
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-[11px] font-bold text-slate-600">
                    Новый Email администратора
                  </label>
                  <input
                    type="email"
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    placeholder="Оставьте пустым, чтобы не менять"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600">
                    Новый пароль администратора (от 6 символов)
                  </label>
                  <input
                    type="password"
                    value={newAdminPassword}
                    onChange={(e) => setNewAdminPassword(e.target.value)}
                    placeholder="Новый надежный пароль..."
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-700"
            >
              Сохранить все настройки
            </button>
          </form>
        )}
      </main>

      {/* Быстрая плавающая кнопка вызова ИИ-Управляющего из любой вкладки админки */}
      {tab !== 'AI_CHAT' && (
        <button
          type="button"
          onClick={() => setTab('AI_CHAT')}
          className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-xs font-extrabold text-white shadow-xl shadow-blue-600/35 transition hover:bg-blue-500"
        >
          <MessageSquareText className="h-4 w-4" />
          <span>Чат с ИИ-Управляющим</span>
        </button>
      )}
    </div>
  );
}
