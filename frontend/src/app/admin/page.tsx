'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  Coins,
  Plus,
  Send,
  Settings,
  ShieldCheck,
  Tag,
  Trash2,
  Users,
} from 'lucide-react';
import type {
  AccessTier,
  OrderTransaction,
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
  stats: StatsSummary;
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
    'PREDICTIONS' | 'PRICING_PROMOS' | 'FINANCE' | 'USERS' | 'SETTINGS'
  >('PREDICTIONS');
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

  // Настройки интеграций
  const [settingsDraft, setSettingsDraft] = useState<PlatformSettings | null>(null);

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
    await fetch('/api/v1/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: settingsDraft }),
    });
    showToast('Настройки кассы ЮKassa и бренда сохранены!');
    await loadOverview();
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
              ['PREDICTIONS', 'События и расчет', Plus],
              ['PRICING_PROMOS', 'Пакеты и Промокоды', Tag],
              ['FINANCE', 'Чеки и заказы', Coins],
              ['USERS', 'Клиенты и доступы', Users],
              ['SETTINGS', 'ЮKassa, Telegram и Бренд', Settings],
            ] as const
          ).map(([id, label, Icon]) => (
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
            </button>
          ))}
        </div>

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

        {/* ВКЛАДКА 3: ЧЕКИ И ЗАКАЗЫ */}
        {tab === 'FINANCE' && (
          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-base font-extrabold text-slate-950">
                Реестр заказов и возвратов страховки
              </h2>
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
                      {order.userEmail} · {new Date(order.createdAt).toLocaleString('ru-RU')}
                    </div>
                  </div>
                  <div className="font-mono font-bold text-slate-950">
                    {order.amountRub.toLocaleString('ru-RU')} ₽ ({order.status})
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ВКЛАДКА 4: ПОЛЬЗОВАТЕЛИ */}
        {tab === 'USERS' && (
          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="divide-y divide-slate-100">
              {(data?.users ?? []).map((u) => (
                <div
                  key={u.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-950">
                      {u.displayName} ({u.email})
                    </div>
                    <div className="text-slate-500">
                      Баланс: <strong>{u.balanceRub} ₽</strong> · Открыто прогнозов:{' '}
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
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ВКЛАДКА 5: НАСТРОЙКИ ЮKASSA И TELEGRAM */}
        {tab === 'SETTINGS' && settingsDraft && (
          <form
            onSubmit={handleSaveSettings}
            className="mt-6 max-w-2xl space-y-4 rounded-2xl border border-slate-200 bg-white p-6"
          >
            <h2 className="text-base font-extrabold text-slate-950">
              Платежный шлюз ЮKassa, Telegram и реквизиты
            </h2>

            <div className="grid grid-cols-2 gap-4">
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

            <div className="grid grid-cols-2 gap-4">
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-bold text-slate-500">Telegram Bot Token</label>
                <input
                  type="password"
                  value={settingsDraft.telegramBotToken}
                  onChange={(e) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      telegramBotToken: e.target.value,
                    })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500">
                  ID открытого канала анонсов (@channel)
                </label>
                <input
                  value={settingsDraft.telegramChannelId}
                  onChange={(e) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      telegramChannelId: e.target.value,
                    })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs"
                />
              </div>
            </div>

            <button
              type="submit"
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-700"
            >
              Сохранить настройки
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
