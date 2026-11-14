'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Ban,
  Bot,
  CheckCircle2,
  Coins,
  Download,
  Gift,
  LayoutDashboard,
  Loader2,
  LogIn,
  Menu,
  MessageSquareText,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Smartphone,
  Tag,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { AdminAiChatPanel } from '@/components/admin/AdminAiChatPanel';
import { AiAutopilotPanel } from '@/components/admin/AiAutopilotPanel';
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  SectionCard,
  SkeletonLines,
  ToastStack,
  inputCls,
  inputMonoCls,
  type ToastItem,
  type ToastKind,
} from '@/components/admin/ui';
import { LocalDateTime } from '@/components/LocalDateTime';
import { TeamAvatar } from '@/components/predictions/TeamAvatar';
import {
  dateTimeLocalInputToIso,
  toDateTimeLocalInputValue,
} from '@/lib/date-time';
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

type TabId =
  | 'OVERVIEW'
  | 'AUTOPILOT'
  | 'AI_CHAT'
  | 'PREDICTIONS'
  | 'PRICING_PROMOS'
  | 'FINANCE'
  | 'USERS'
  | 'SETTINGS';

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

function getAdminMatchStatusLabel(prediction: PredictionRecord): string {
  switch (prediction.matchLifecycleStatus) {
    case 'SCHEDULED':
      return 'Запланирован';
    case 'LIVE':
      return 'LIVE';
    case 'FINISHED':
      return 'Завершён';
    case 'POSTPONED':
      return 'Перенесён';
    case 'CANCELLED':
      return 'Отменён';
    case 'UNKNOWN':
      return 'Статус не подтверждён';
    default:
      return prediction.matchStatus === 'LIVE'
        ? 'LIVE'
        : prediction.matchStatus === 'FINISHED'
          ? 'Завершён'
          : 'Предстоящий';
  }
}

function formatRub(value: number): string {
  return `${value.toLocaleString('ru-RU')} ₽`;
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<AdminOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('OVERVIEW');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSeq = useRef(0);

  const showToast = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = ++toastSeq.current;
    setToasts((prev) => [...prev.slice(-3), { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const loadOverview = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/overview', { cache: 'no-store' });
      if (!res.ok) {
        setAuthError('Требуется вход под аккаунтом администратора.');
        return;
      }
      const json = (await res.json()) as AdminOverviewPayload;
      setData(json);
      setAuthError(null);
    } catch {
      setAuthError('Не удалось связаться с сервером. Проверьте соединение и обновите страницу.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const paidTransactions = useMemo(
    () => (data?.transactions ?? []).filter((t) => t.status === 'SUCCEEDED'),
    [data],
  );
  const totalRevenueRub = useMemo(
    () => paidTransactions.reduce((acc, t) => acc + t.amountRub, 0),
    [paidTransactions],
  );
  const dayAgo = Date.now() - 86_400_000;
  const todayRevenueRub = useMemo(
    () =>
      paidTransactions
        .filter((t) => new Date(t.createdAt).getTime() >= dayAgo)
        .reduce((acc, t) => acc + t.amountRub, 0),
    [paidTransactions, dayAgo],
  );
  const buyersCount = useMemo(
    () => (data?.users ?? []).filter((u) => u.purchasedPredictionIds.length > 0).length,
    [data],
  );
  const pendingPredictionsCount = useMemo(
    () => (data?.predictions ?? []).filter((p) => p.resultStatus === 'PENDING').length,
    [data],
  );
  const pendingPayoutsCount = useMemo(
    () => (data?.payouts ?? []).filter((p) => p.status === 'PENDING').length,
    [data],
  );
  const liveCount = useMemo(
    () => (data?.predictions ?? []).filter((p) => p.matchLifecycleStatus === 'LIVE').length,
    [data],
  );

  const navItems: Array<{
    id: TabId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
    dot?: boolean;
  }> = [
    { id: 'OVERVIEW', label: 'Обзор', icon: LayoutDashboard },
    {
      id: 'AUTOPILOT',
      label: 'ИИ-Автопилот',
      icon: Bot,
      dot: data?.aiAutopilot.mode === 'FULL_AUTOPILOT',
    },
    { id: 'AI_CHAT', label: 'ИИ-Чат', icon: MessageSquareText },
    { id: 'PREDICTIONS', label: 'События', icon: Plus, badge: pendingPredictionsCount || undefined },
    { id: 'PRICING_PROMOS', label: 'Цены и промокоды', icon: Tag },
    { id: 'FINANCE', label: 'Финансы', icon: Coins, badge: pendingPayoutsCount || undefined },
    { id: 'USERS', label: 'Клиенты', icon: Users },
    { id: 'SETTINGS', label: 'Настройки', icon: Settings },
  ];

  if (authError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F6FA] p-6">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <p className="mt-4 text-sm font-bold text-slate-800">{authError}</p>
          <Link
            href="/login"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-700"
          >
            <LogIn className="h-3.5 w-3.5" />
            Войти в админ-аккаунт
          </Link>
        </div>
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </div>
    );
  }

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-5 pb-4 pt-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/30">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-black tracking-tight text-white">VALUEX</div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Admin Console
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
          aria-label="Закрыть меню"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                setSidebarOpen(false);
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold transition ${
                active
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.dot && (
                <span className="h-2 w-2 rounded-full bg-emerald-400" title="Полный автопилот активен" />
              )}
              {item.badge !== undefined && (
                <span
                  className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-black ${
                    active ? 'bg-white/20 text-white' : 'bg-amber-500/20 text-amber-400'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-white/10 p-4">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-400 transition hover:bg-white/5 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          На витрину сайта
        </Link>
        <button
          type="button"
          onClick={() => void loadOverview()}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-400 transition hover:bg-white/5 hover:text-white"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Обновить данные
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F4F6FA] text-slate-900">
      {/* Десктопный сайдбар */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 bg-[#0B0F19] lg:block">
        {sidebarContent}
      </aside>

      {/* Мобильный сайдбар */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 bg-[#0B0F19] shadow-2xl">
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        {/* Верхняя панель */}
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur-md">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 lg:hidden"
              aria-label="Открыть меню"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-black text-slate-950 sm:text-base">
                {navItems.find((n) => n.id === tab)?.label ?? 'Админ-панель'}
              </h1>
              <p className="hidden text-[11px] text-slate-500 sm:block">
                {data
                  ? `Обновлено ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} · ${data.users.length} пользователей · ${data.predictions.length} событий`
                  : 'Загрузка данных…'}
              </p>
            </div>
            {data?.aiAutopilot.mode === 'FULL_AUTOPILOT' && (
              <Badge tone="emerald">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Автопилот 24/7
              </Badge>
            )}
            {liveCount > 0 && <Badge tone="rose">LIVE: {liveCount}</Badge>}
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          {loading && !data ? (
            <SectionCard title="Загрузка панели">
              <SkeletonLines rows={6} />
            </SectionCard>
          ) : (
            <>
              {tab === 'OVERVIEW' && data && (
                <OverviewTab
                  data={data}
                  totalRevenueRub={totalRevenueRub}
                  todayRevenueRub={todayRevenueRub}
                  paidCount={paidTransactions.length}
                  buyersCount={buyersCount}
                  pendingPredictionsCount={pendingPredictionsCount}
                  onGoTab={setTab}
                  onRefresh={loadOverview}
                  onToast={showToast}
                />
              )}

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

              {tab === 'AI_CHAT' && data && (
                <AdminAiChatPanel
                  initialMessages={data.aiChatMessages ?? []}
                  llmProvider={data.aiAutopilot.llmProvider}
                  llmBaseUrl={data.aiAutopilot.llmBaseUrl}
                  llmApiKey={data.aiAutopilot.llmApiKey}
                  llmModel={data.aiAutopilot.llmModel}
                  hasApiKey={
                    data.aiAutopilot.llmProvider !== 'BUILTIN_QUANT' &&
                    (data.aiAutopilot.llmApiKeyConfigured ??
                      data.aiAutopilot.llmApiKey.trim().length > 8)
                  }
                  onRefresh={loadOverview}
                />
              )}

              {tab === 'PREDICTIONS' && data && (
                <PredictionsTab
                  predictions={data.predictions}
                  defaultPrice={data.settings.defaultSinglePriceRub}
                  onRefresh={loadOverview}
                  onToast={showToast}
                />
              )}

              {tab === 'PRICING_PROMOS' && data && (
                <PricingPromosTab
                  settings={data.settings}
                  promoCodes={data.promoCodes}
                  onRefresh={loadOverview}
                  onToast={showToast}
                />
              )}

              {tab === 'FINANCE' && data && (
                <FinanceTab
                  transactions={data.transactions}
                  payouts={data.payouts}
                  onRefresh={loadOverview}
                  onToast={showToast}
                />
              )}

              {tab === 'USERS' && data && (
                <UsersTab
                  users={data.users}
                  predictions={data.predictions}
                  onRefresh={loadOverview}
                  onToast={showToast}
                />
              )}

              {tab === 'SETTINGS' && data && (
                <SettingsTab
                  settings={data.settings}
                  onRefresh={loadOverview}
                  onToast={showToast}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Плавающая кнопка ИИ-чата */}
      {tab !== 'AI_CHAT' && (
        <button
          type="button"
          onClick={() => setTab('AI_CHAT')}
          className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-xs font-extrabold text-white shadow-xl shadow-blue-600/35 transition hover:bg-blue-500"
        >
          <MessageSquareText className="h-4 w-4" />
          <span className="hidden sm:inline">Чат с ИИ-Управляющим</span>
          <span className="sm:hidden">ИИ-Чат</span>
        </button>
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   ОБЗОР
   ════════════════════════════════════════════════════════════════════════ */

function OverviewTab({
  data,
  totalRevenueRub,
  todayRevenueRub,
  paidCount,
  buyersCount,
  pendingPredictionsCount,
  onGoTab,
  onRefresh,
  onToast,
}: {
  data: AdminOverviewPayload;
  totalRevenueRub: number;
  todayRevenueRub: number;
  paidCount: number;
  buyersCount: number;
  pendingPredictionsCount: number;
  onGoTab: (tab: TabId) => void;
  onRefresh: () => Promise<void>;
  onToast: (msg: string, kind?: ToastKind) => void;
}) {
  const [settling, setSettling] = useState(false);

  const handleVerifiedSettlementCycle = async () => {
    setSettling(true);
    try {
      const res = await fetch('/api/v1/admin/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RUN_SETTLE_NOW' }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        checkedCount?: number;
        settledCount?: number;
        compensatedBuyers?: number;
        error?: string;
      };
      if (!res.ok) {
        onToast(json.error || `Не удалось проверить результаты (HTTP ${res.status})`, 'error');
        return;
      }
      onToast(
        (json.settledCount ?? 0) > 0
          ? `По подтверждённым источникам рассчитано матчей: ${json.settledCount}; страховок выплачено: ${json.compensatedBuyers ?? 0}.`
          : `Новых расчётов нет. Проверено событий: ${json.checkedCount ?? 0}; без подтверждённого однозначного результата выплата не выполнялась.`,
      );
      await onRefresh();
    } finally {
      setSettling(false);
    }
  };

  const kpis = [
    {
      label: 'Выручка всего',
      value: formatRub(totalRevenueRub),
      icon: Wallet,
      tone: 'text-slate-950',
      bg: 'bg-slate-100 text-slate-600',
    },
    {
      label: 'Продажи за 24ч',
      value: formatRub(todayRevenueRub),
      icon: TrendingUp,
      tone: 'text-blue-600',
      bg: 'bg-blue-50 text-blue-600',
    },
    {
      label: 'Оплаченных чеков',
      value: String(paidCount),
      icon: ReceiptText,
      tone: 'text-slate-950',
      bg: 'bg-slate-100 text-slate-600',
    },
    {
      label: 'Покупателей',
      value: `${buyersCount} / ${data.users.length}`,
      icon: Users,
      tone: 'text-slate-950',
      bg: 'bg-slate-100 text-slate-600',
    },
    {
      label: 'Активных событий',
      value: String(pendingPredictionsCount),
      icon: Plus,
      tone: 'text-emerald-600',
      bg: 'bg-emerald-50 text-emerald-600',
    },
  ];

  const recentOrders = [...data.transactions]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);
  const upcoming = [...data.predictions]
    .filter((p) => p.resultStatus === 'PENDING')
    .sort((a, b) => new Date(a.matchStartsAt).getTime() - new Date(b.matchStartsAt).getTime())
    .slice(0, 5);
  const pendingPayouts = data.payouts.filter((p) => p.status === 'PENDING');

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${kpi.bg}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="mt-3 text-[11px] font-semibold text-slate-500">{kpi.label}</div>
              <div className={`mt-0.5 font-mono text-lg font-black ${kpi.tone}`}>{kpi.value}</div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Ближайшие события"
          subtitle="Активные прогнозы на витрине"
          action={
            <button
              type="button"
              onClick={() => onGoTab('PREDICTIONS')}
              className="text-xs font-bold text-blue-600 hover:text-blue-800"
            >
              Все события →
            </button>
          }
        >
          {upcoming.length === 0 ? (
            <EmptyState icon={<Plus className="h-5 w-5" />} title="Нет активных событий" description="Опубликуйте прогноз вручную или включите автопилот." />
          ) : (
            <div className="divide-y divide-slate-100">
              {upcoming.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <TeamAvatar team={p.homeTeam} sport={p.sport} logoUrl={p.homeLogoUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-bold text-slate-900">
                      {p.homeTeam} — {p.awayTeam}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {p.leagueName} · <LocalDateTime value={p.matchStartsAt} format="full" />
                    </div>
                  </div>
                  <Badge tone={p.accessTier === 'FREE' ? 'emerald' : 'blue'}>
                    {p.accessTier === 'FREE' ? 'Бесплатно' : formatRub(p.singlePriceRub ?? 0)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Последние заказы"
          subtitle="Самые свежие транзакции"
          action={
            <button
              type="button"
              onClick={() => onGoTab('FINANCE')}
              className="text-xs font-bold text-blue-600 hover:text-blue-800"
            >
              Финансы →
            </button>
          }
        >
          {recentOrders.length === 0 ? (
            <EmptyState icon={<ReceiptText className="h-5 w-5" />} title="Заказов пока нет" />
          ) : (
            <div className="divide-y divide-slate-100">
              {recentOrders.map((o) => (
                <div key={o.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-bold text-slate-900">{o.title}</div>
                    <div className="mt-0.5 truncate text-[11px] text-slate-500">
                      {o.userEmail} · <LocalDateTime value={o.createdAt} format="full" />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-xs font-black text-slate-950">
                      {formatRub(o.amountRub)}
                    </div>
                    <Badge tone={o.status === 'SUCCEEDED' ? 'emerald' : o.status === 'REFUNDED' ? 'rose' : 'amber'}>
                      {o.status === 'SUCCEEDED' ? 'Оплачен' : o.status === 'REFUNDED' ? 'Возврат' : 'Ожидает'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Быстрые действия" subtitle="Частые операции администратора">
          <div className="grid gap-2.5 p-5 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onGoTab('PREDICTIONS')}
              className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left text-xs font-bold text-slate-800 transition hover:border-blue-300 hover:bg-blue-50"
            >
              <Plus className="h-4 w-4 text-blue-600" />
              Опубликовать событие
            </button>
            <button
              type="button"
              onClick={handleVerifiedSettlementCycle}
              disabled={settling}
              className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left text-xs font-bold text-slate-800 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-50"
            >
              {settling ? (
                <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              )}
              Рассчитать результаты
            </button>
            <button
              type="button"
              onClick={() => onGoTab('PRICING_PROMOS')}
              className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left text-xs font-bold text-slate-800 transition hover:border-blue-300 hover:bg-blue-50"
            >
              <Tag className="h-4 w-4 text-blue-600" />
              Создать промокод
            </button>
            <button
              type="button"
              onClick={() => onGoTab('AI_CHAT')}
              className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left text-xs font-bold text-slate-800 transition hover:border-indigo-300 hover:bg-indigo-50"
            >
              <MessageSquareText className="h-4 w-4 text-indigo-600" />
              Спросить ИИ-Управляющего
            </button>
          </div>
        </SectionCard>

        <SectionCard
          title="Требуют внимания"
          subtitle="Заявки и события, ожидающие действий"
        >
          {pendingPayouts.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="Всё в порядке"
              description="Нет ожидающих выплат партнёрам."
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {pendingPayouts.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs font-black text-slate-950">
                      {formatRub(p.amountRub)}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-slate-500">
                      {p.userEmail} · {p.requisites}
                    </div>
                  </div>
                  <Badge tone="amber">Ожидает выплаты</Badge>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   СОБЫТИЯ
   ════════════════════════════════════════════════════════════════════════ */

function PredictionsTab({
  predictions,
  defaultPrice,
  onRefresh,
  onToast,
}: {
  predictions: PredictionRecord[];
  defaultPrice: number;
  onRefresh: () => Promise<void>;
  onToast: (msg: string, kind?: ToastKind) => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'SETTLED'>('ALL');
  const [priceEdit, setPriceEdit] = useState<{ item: PredictionRecord; value: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PredictionRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [settling, setSettling] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return predictions.filter((p) => {
      if (filter === 'PENDING' && p.resultStatus !== 'PENDING') return false;
      if (filter === 'SETTLED' && p.resultStatus === 'PENDING') return false;
      if (!q) return true;
      return (
        p.homeTeam.toLowerCase().includes(q) ||
        p.awayTeam.toLowerCase().includes(q) ||
        p.leagueName.toLowerCase().includes(q) ||
        p.selectionTitle.toLowerCase().includes(q)
      );
    });
  }, [predictions, search, filter]);

  const handleVerifiedSettlementCycle = async () => {
    setSettling(true);
    try {
      const res = await fetch('/api/v1/admin/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RUN_SETTLE_NOW' }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        checkedCount?: number;
        settledCount?: number;
        compensatedBuyers?: number;
        error?: string;
      };
      if (!res.ok) {
        onToast(json.error || `Не удалось проверить результаты (HTTP ${res.status})`, 'error');
        return;
      }
      onToast(
        (json.settledCount ?? 0) > 0
          ? `Рассчитано матчей: ${json.settledCount}; страховок выплачено: ${json.compensatedBuyers ?? 0}.`
          : `Новых расчётов нет. Проверено событий: ${json.checkedCount ?? 0}.`,
      );
      await onRefresh();
    } finally {
      setSettling(false);
    }
  };

  const savePrice = async () => {
    if (!priceEdit) return;
    const nextPrice = Number(priceEdit.value);
    if (!Number.isFinite(nextPrice) || nextPrice < 50) {
      onToast('Цена должна быть не меньше 50 ₽', 'error');
      return;
    }
    await fetch('/api/v1/admin/predictions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        predictionId: priceEdit.item.id,
        editMeta: { singlePriceRub: nextPrice },
      }),
    });
    setPriceEdit(null);
    onToast('Цена события обновлена');
    await onRefresh();
  };

  const toggleInsured = async (item: PredictionRecord) => {
    await fetch('/api/v1/admin/predictions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        predictionId: item.id,
        editMeta: { insuredOnLoss: !item.insuredOnLoss },
      }),
    });
    onToast(
      !item.insuredOnLoss
        ? 'Страховка на баланс включена для события'
        : 'Страховка отключена для события',
    );
    await onRefresh();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/v1/admin/predictions?id=${encodeURIComponent(deleteTarget.id)}`, {
        method: 'DELETE',
      });
      onToast('Событие удалено');
      setDeleteTarget(null);
      await onRefresh();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Опубликовать событие
        </button>
        <button
          type="button"
          onClick={handleVerifiedSettlementCycle}
          disabled={settling}
          className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
        >
          {settling ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Рассчитать по подтверждённым счётaм
        </button>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по командам, лиге, исходу…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div className="flex rounded-xl border border-slate-200 bg-white p-1">
          {(
            [
              ['ALL', 'Все'],
              ['PENDING', 'Активные'],
              ['SETTLED', 'Рассчитанные'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${
                filter === id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <SectionCard title={`События (${filtered.length})`} subtitle="Управление прогнозами на витрине">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Search className="h-5 w-5" />}
            title="Ничего не найдено"
            description="Попробуйте изменить запрос или сбросить фильтр."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((item) => (
              <div key={item.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-400">{item.leagueName}</span>
                      <Badge tone={item.matchLifecycleStatus === 'LIVE' ? 'rose' : item.matchLifecycleStatus === 'FINISHED' ? 'slate' : 'blue'}>
                        {getAdminMatchStatusLabel(item)}
                      </Badge>
                      {item.accessTier === 'PAID_SINGLE' ? (
                        <button
                          type="button"
                          onClick={() =>
                            setPriceEdit({ item, value: String(item.singlePriceRub ?? defaultPrice) })
                          }
                          className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-blue-600 hover:text-blue-800"
                          title="Изменить цену"
                        >
                          {formatRub(item.singlePriceRub ?? 0)}
                          <Pencil className="h-3 w-3" />
                        </button>
                      ) : (
                        <Badge tone="emerald">Бесплатно</Badge>
                      )}
                      {item.accessTier === 'PAID_SINGLE' && (
                        <button
                          type="button"
                          onClick={() => toggleInsured(item)}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold transition ${
                            item.insuredOnLoss
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                          title="Переключить страховку"
                        >
                          <ShieldCheck className="h-3 w-3" />
                          {item.insuredOnLoss ? 'Страховка ВКЛ' : 'Без страховки'}
                        </button>
                      )}
                      {item.isFeatured && <Badge tone="indigo">Главное событие</Badge>}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-extrabold text-slate-950">
                      <TeamAvatar team={item.homeTeam} sport={item.sport} logoUrl={item.homeLogoUrl} size="xs" />
                      <span>{item.homeTeam}</span>
                      <span className="text-slate-300">—</span>
                      <TeamAvatar team={item.awayTeam} sport={item.sport} logoUrl={item.awayLogoUrl} size="xs" />
                      <span>{item.awayTeam}</span>
                    </div>

                    <div className="mt-1 text-xs text-slate-600">
                      Исход: <strong>{item.selectionTitle}</strong> @{' '}
                      <strong className="font-mono">{item.fixedOdds.toFixed(2)}</strong>
                      {' · '}
                      <LocalDateTime value={item.matchStartsAt} format="full" />
                    </div>

                    {item.authorSource === 'AI_AUTOPILOT' && (
                      <div className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                        <span>Статус: {getAdminMatchStatusLabel(item)}</span>
                        {item.actualStartedAt && (
                          <span>
                            {' · '}старт наблюдался <LocalDateTime value={item.actualStartedAt} format="full" />
                          </span>
                        )}
                        {item.actualFinishedAt && (
                          <span>
                            {' · '}
                            {item.actualFinishedAtPrecision === 'SOURCE_EXACT'
                              ? 'фактический финиш'
                              : 'финиш зафиксирован'}{' '}
                            <LocalDateTime value={item.actualFinishedAt} format="full" />
                          </span>
                        )}
                        {item.matchVerifiedAt && (
                          <span>
                            {' · '}проверено <LocalDateTime value={item.matchVerifiedAt} format="full" />
                          </span>
                        )}
                        {item.matchVerificationSource && <span> · {item.matchVerificationSource}</span>}
                        {Number.isInteger(item.liveHomeScore) &&
                          Number.isInteger(item.liveAwayScore) && (
                            <span>
                              {' · '}счёт {item.liveHomeScore}:{item.liveAwayScore}
                            </span>
                          )}
                        {item.finalScoreVerified && <span> · счёт подтверждён</span>}
                        {item.matchVerificationConflict && <span> · конфликт источников</span>}
                      </div>
                    )}

                    {item.agentReport && (
                      <details className="mt-2 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-[11px] text-slate-700">
                        <summary className="cursor-pointer font-bold text-indigo-800">
                          Сохранённый отчёт AI-команды
                        </summary>
                        <pre className="mt-2 whitespace-pre-wrap font-sans leading-relaxed">
                          {item.agentReport}
                        </pre>
                      </details>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {item.resultStatus === 'PENDING' ? (
                      item.finalScoreVerified &&
                      !item.matchVerificationConflict &&
                      item.matchLifecycleStatus === 'FINISHED' ? (
                        <button
                          type="button"
                          onClick={handleVerifiedSettlementCycle}
                          disabled={settling}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          Рассчитать по подтверждённому счёту
                        </button>
                      ) : (
                        <span className="max-w-[240px] rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10px] font-semibold leading-relaxed text-amber-800">
                          Расчёт закрыт до согласия финального счёта минимум у двух независимых источников.
                        </span>
                      )
                    ) : (
                      <Badge tone={item.settlementVerified ? 'slate' : 'amber'}>
                        <CheckCircle2
                          className={`h-3 w-3 ${item.settlementVerified ? 'text-emerald-600' : 'text-amber-600'}`}
                        />
                        {item.settlementVerified
                          ? `${item.resultStatus} (${item.finalScore || 'итог'})`
                          : `Не проверено · ${item.resultStatus} (${item.finalScore || 'без счёта'}) — исключено из статистики`}
                      </Badge>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(item)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      aria-label="Удалить событие"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <CreatePredictionModal
        open={showCreate}
        defaultPrice={defaultPrice}
        onClose={() => setShowCreate(false)}
        onCreated={async () => {
          setShowCreate(false);
          await onRefresh();
        }}
        onToast={onToast}
      />

      <Modal
        open={priceEdit !== null}
        onClose={() => setPriceEdit(null)}
        title="Изменить цену события"
        description={
          priceEdit
            ? `${priceEdit.item.homeTeam} — ${priceEdit.item.awayTeam}`
            : undefined
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => setPriceEdit(null)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={savePrice}
              className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
            >
              Сохранить цену
            </button>
          </>
        }
      >
        <Field label="Новая цена (₽)" hint="Минимум 50 ₽. Применится сразу на витрине.">
          <input
            type="number"
            min={50}
            autoFocus
            value={priceEdit?.value ?? ''}
            onChange={(e) => setPriceEdit((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
            className={inputMonoCls}
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Удалить событие?"
        description={
          deleteTarget
            ? `Событие «${deleteTarget.homeTeam} — ${deleteTarget.awayTeam}» будет удалено с витрины. Действие нельзя отменить.`
            : ''
        }
        confirmLabel="Удалить"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

/* ── Модалка создания события ─────────────────────────────────────────── */

function CreatePredictionModal({
  open,
  defaultPrice,
  onClose,
  onCreated,
  onToast,
}: {
  open: boolean;
  defaultPrice: number;
  onClose: () => void;
  onCreated: () => Promise<void>;
  onToast: (msg: string, kind?: ToastKind) => void;
}) {
  const [sport, setSport] = useState<SportType>('FOOTBALL');
  const [leagueName, setLeagueName] = useState('Лига Чемпионов УЕФА');
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [matchStartsAt, setMatchStartsAt] = useState('');
  const [accessTier, setAccessTier] = useState<AccessTier>('PAID_SINGLE');
  const [singlePriceRub, setSinglePriceRub] = useState(defaultPrice);
  const [insuredOnLoss, setInsuredOnLoss] = useState(true);
  const [selectionTitle, setSelectionTitle] = useState('');
  const [fixedOdds, setFixedOdds] = useState(1.92);
  const [stakeUnits, setStakeUnits] = useState(2.0);
  const [bookmakerSource, setBookmakerSource] = useState('Фонбет / Pari');
  const [analysisTeaser, setAnalysisTeaser] = useState('');
  const [analysisFull, setAnalysisFull] = useState('');
  const [isFeatured, setIsFeatured] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSinglePriceRub(defaultPrice);
      setMatchStartsAt(toDateTimeLocalInputValue(new Date(Date.now() + 5 * 3600_000)));
    }
  }, [open, defaultPrice]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const matchStartsAtIso = dateTimeLocalInputToIso(matchStartsAt);
    if (!matchStartsAtIso) {
      onToast(
        'Выбранное местное время недопустимо (возможно, часы перескочили при переходе на летнее время). Выберите другую дату или время.',
        'error',
      );
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/v1/admin/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sport,
          leagueName,
          homeTeam,
          awayTeam,
          matchStartsAt: matchStartsAtIso,
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
        onToast(json.error || 'Ошибка публикации', 'error');
        return;
      }
      setHomeTeam('');
      setAwayTeam('');
      setSelectionTitle('');
      setAnalysisTeaser('');
      setAnalysisFull('');
      onToast('Событие опубликовано на витрине и зафиксировано SHA-256!');
      await onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Опубликовать новое событие"
      description="Событие сразу появится на витрине и будет зафиксировано SHA-256."
      wide
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Выставить на витрину
          </button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Быстрый выбор турнира">
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
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Вид спорта">
            <select value={sport} onChange={(e) => setSport(e.target.value as SportType)} className={inputCls}>
              <option value="FOOTBALL">Футбол</option>
              <option value="HOCKEY">Хоккей</option>
              <option value="TENNIS">Теннис</option>
              <option value="ESPORTS">Киберспорт</option>
              <option value="BASKETBALL">Баскетбол</option>
              <option value="MMA">ММА / Бокс</option>
            </select>
          </Field>
          <Field label="Формат продажи">
            <select value={accessTier} onChange={(e) => setAccessTier(e.target.value as AccessTier)} className={inputCls}>
              <option value="PAID_SINGLE">Платный прогноз (разовый)</option>
              <option value="FREE">Бесплатный открытый прогноз</option>
            </select>
          </Field>
        </div>

        <Field label="Лига / Турнир">
          <input required value={leagueName} onChange={(e) => setLeagueName(e.target.value)} className={inputCls} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Хозяева / Игрок 1">
            <div className="flex items-center gap-2">
              {homeTeam.trim().length >= 2 && <TeamAvatar team={homeTeam.trim()} sport={sport} size="sm" />}
              <input required value={homeTeam} onChange={(e) => setHomeTeam(e.target.value)} placeholder="Реал Мадрид" className={inputCls} />
            </div>
          </Field>
          <Field label="Гости / Игрок 2">
            <div className="flex items-center gap-2">
              {awayTeam.trim().length >= 2 && <TeamAvatar team={awayTeam.trim()} sport={sport} size="sm" />}
              <input required value={awayTeam} onChange={(e) => setAwayTeam(e.target.value)} placeholder="Бавария" className={inputCls} />
            </div>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Начало матча (время браузера)" hint="При сохранении переводится в UTC; на сайте каждый увидит его в своём часовом поясе.">
            <input
              type="datetime-local"
              required
              value={matchStartsAt}
              onChange={(e) => setMatchStartsAt(e.target.value)}
              className={inputCls}
            />
          </Field>
          {accessTier === 'PAID_SINGLE' && (
            <Field label="Цена события (₽)">
              <input
                type="number"
                min={50}
                required
                value={singlePriceRub}
                onChange={(e) => setSinglePriceRub(Number(e.target.value))}
                className={inputMonoCls}
              />
            </Field>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Точный исход (скрыт до оплаты)">
            <input required value={selectionTitle} onChange={(e) => setSelectionTitle(e.target.value)} placeholder="Фора 1 (-1.0) / ТБ 2.5" className={inputCls} />
          </Field>
          <Field label="Коэффициент">
            <input type="number" step="0.01" required value={fixedOdds} onChange={(e) => setFixedOdds(Number(e.target.value))} className={inputMonoCls} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Флэт (% от банка)">
            <input type="number" step="0.5" value={stakeUnits} onChange={(e) => setStakeUnits(Number(e.target.value))} className={inputMonoCls} />
          </Field>
          <Field label="Букмекер">
            <input value={bookmakerSource} onChange={(e) => setBookmakerSource(e.target.value)} className={inputCls} />
          </Field>
        </div>

        <Field label="Публичный анонс на карточке витрины">
          <textarea required rows={2} value={analysisTeaser} onChange={(e) => setAnalysisTeaser(e.target.value)} placeholder="Краткое описание ценности матча для покупателя…" className={inputCls} />
        </Field>

        <Field label="Закрытая аналитика (открывается после покупки)">
          <textarea required rows={3} value={analysisFull} onChange={(e) => setAnalysisFull(e.target.value)} placeholder="Подробные цифры xG, составы, мотивация и обоснование выбора…" className={inputCls} />
        </Field>

        <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
          {accessTier === 'PAID_SINGLE' && (
            <label className="flex items-center gap-2 text-xs font-bold text-emerald-800">
              <input type="checkbox" checked={insuredOnLoss} onChange={(e) => setInsuredOnLoss(e.target.checked)} />
              <span>Страховка 100% возврата на баланс при минусе</span>
            </label>
          )}
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} />
            <span>Закрепить как «Главное событие дня» в шапке</span>
          </label>
        </div>
      </form>
    </Modal>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   ЦЕНЫ И ПРОМОКОДЫ
   ════════════════════════════════════════════════════════════════════════ */

function PricingPromosTab({
  settings,
  promoCodes,
  onRefresh,
  onToast,
}: {
  settings: PlatformSettings;
  promoCodes: PromoCodeRecord[];
  onRefresh: () => Promise<void>;
  onToast: (msg: string, kind?: ToastKind) => void;
}) {
  const [defaultPriceInput, setDefaultPriceInput] = useState(settings.defaultSinglePriceRub);
  const [bundle2PctInput, setBundle2PctInput] = useState(settings.bundle2DiscountPct);
  const [bundle3PctInput, setBundle3PctInput] = useState(settings.bundle3DiscountPct);
  const [newPromoCode, setNewPromoCode] = useState('');
  const [newPromoPct, setNewPromoPct] = useState(15);
  const [newPromoMaxUses, setNewPromoMaxUses] = useState(200);
  const [deletePromo, setDeletePromo] = useState<PromoCodeRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setDefaultPriceInput(settings.defaultSinglePriceRub);
    setBundle2PctInput(settings.bundle2DiscountPct);
    setBundle3PctInput(settings.bundle3DiscountPct);
  }, [settings]);

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
    onToast(
      applyToPending
        ? 'Правила цен и пакетные скидки применены ко всем активным матчам!'
        : 'Правила цен и пакетных скидок сохранены!',
    );
    await onRefresh();
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
      onToast(json.error || 'Не удалось создать промокод', 'error');
      return;
    }
    setNewPromoCode('');
    onToast('Промокод создан и активен в окне оплаты!');
    await onRefresh();
  };

  const confirmDeletePromo = async () => {
    if (!deletePromo) return;
    setDeleting(true);
    try {
      await fetch('/api/v1/admin/finance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'DELETE_PROMO', promoId: deletePromo.id }),
      });
      onToast('Промокод удалён');
      setDeletePromo(null);
      await onRefresh();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <SectionCard title="Ценообразование" subtitle="Правила цен ординаров и пакетные скидки">
        <div className="space-y-4 p-5">
          <p className="text-xs leading-relaxed text-slate-500">
            Когда покупатель добавляет 2 или 3+ событий кнопкой «+ В пакет», скидка применяется автоматически.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Базовая цена 1 события (₽)">
              <input type="number" value={defaultPriceInput} onChange={(e) => setDefaultPriceInput(Number(e.target.value))} className={inputMonoCls} />
            </Field>
            <Field label="Скидка за 2 события (%)">
              <input type="number" min={0} max={50} value={bundle2PctInput} onChange={(e) => setBundle2PctInput(Number(e.target.value))} className={inputMonoCls} />
            </Field>
            <Field label="Скидка за 3+ события (%)">
              <input type="number" min={0} max={60} value={bundle3PctInput} onChange={(e) => setBundle3PctInput(Number(e.target.value))} className={inputMonoCls} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2.5">
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
      </SectionCard>

      <SectionCard title="Промокоды" subtitle="Для Telegram и рассылок">
        <form onSubmit={handleCreatePromo} className="grid gap-2.5 border-b border-slate-100 p-5 sm:grid-cols-[1fr_90px_110px_auto]">
          <input
            required
            value={newPromoCode}
            onChange={(e) => setNewPromoCode(e.target.value.toUpperCase())}
            placeholder="КОД (DERBY20)"
            className={`${inputMonoCls} uppercase`}
          />
          <input
            type="number"
            min={5}
            max={60}
            required
            value={newPromoPct}
            onChange={(e) => setNewPromoPct(Number(e.target.value))}
            placeholder="Скидка %"
            className={inputMonoCls}
          />
          <input
            type="number"
            min={1}
            required
            value={newPromoMaxUses}
            onChange={(e) => setNewPromoMaxUses(Number(e.target.value))}
            placeholder="Лимит"
            className={inputMonoCls}
          />
          <button type="submit" className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700">
            Создать
          </button>
        </form>
        {promoCodes.length === 0 ? (
          <EmptyState icon={<Tag className="h-5 w-5" />} title="Промокодов пока нет" description="Создайте первый промокод для рассылки в Telegram." />
        ) : (
          <div className="divide-y divide-slate-100">
            {promoCodes.map((promo) => (
              <div key={promo.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-900">
                    {promo.code}
                  </span>
                  <Badge tone="blue">−{promo.discountPercent}%</Badge>
                  <span className="text-[11px] text-slate-500">
                    Использовано: {promo.usedCount} / {promo.maxUses}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setDeletePromo(promo)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  aria-label="Удалить промокод"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <ConfirmDialog
        open={deletePromo !== null}
        title="Удалить промокод?"
        description={deletePromo ? `Промокод ${deletePromo.code} перестанет работать в окне оплаты.` : ''}
        confirmLabel="Удалить"
        busy={deleting}
        onConfirm={confirmDeletePromo}
        onCancel={() => setDeletePromo(null)}
      />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   ФИНАНСЫ
   ════════════════════════════════════════════════════════════════════════ */

function FinanceTab({
  transactions,
  payouts,
  onRefresh,
  onToast,
}: {
  transactions: OrderTransaction[];
  payouts: PayoutRequestRecord[];
  onRefresh: () => Promise<void>;
  onToast: (msg: string, kind?: ToastKind) => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SUCCEEDED' | 'REFUNDED' | 'PENDING'>('ALL');
  const [refundTarget, setRefundTarget] = useState<OrderTransaction | null>(null);
  const [refunding, setRefunding] = useState(false);
  const [payoutBusy, setPayoutBusy] = useState<string | null>(null);

  const downloadOrdersCsv = () => {
    const rows = transactions;
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
    const escapeCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
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
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `valuex_orders_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((o) => {
      if (statusFilter !== 'ALL' && o.status !== statusFilter) return false;
      if (!q) return true;
      return (
        o.title.toLowerCase().includes(q) ||
        o.userEmail.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q)
      );
    });
  }, [transactions, search, statusFilter]);

  const processPayout = async (p: PayoutRequestRecord, decision: 'PAID' | 'REJECTED') => {
    setPayoutBusy(p.id);
    try {
      await fetch('/api/v1/admin/finance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'PROCESS_PAYOUT', payoutId: p.id, decision }),
      });
      onToast(
        decision === 'PAID'
          ? 'Выплата отмечена как исполненная'
          : 'Заявка отклонена, сумма возвращена на партнёрский счёт',
      );
      await onRefresh();
    } finally {
      setPayoutBusy(null);
    }
  };

  const confirmRefund = async () => {
    if (!refundTarget) return;
    setRefunding(true);
    try {
      const res = await fetch('/api/v1/admin/finance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REFUND_ORDER', orderId: refundTarget.id }),
      });
      if (res.ok) {
        onToast('Возврат выполнен на баланс клиента');
        setRefundTarget(null);
        await onRefresh();
      } else {
        onToast('Не удалось выполнить возврат', 'error');
      }
    } finally {
      setRefunding(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionCard
        title="Заявки партнёров на выплату"
        subtitle="После перевода средств по реквизитам отметьте заявку оплаченной"
      >
        {payouts.length === 0 ? (
          <EmptyState icon={<Wallet className="h-5 w-5" />} title="Заявок на вывод пока нет" />
        ) : (
          <div className="divide-y divide-slate-100">
            {payouts.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-black text-slate-950">
                      {formatRub(p.amountRub)}
                    </span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-800">
                      {p.requisites}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {p.userEmail} · <LocalDateTime value={p.createdAt} format="full" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {p.status === 'PENDING' ? (
                    <>
                      <button
                        type="button"
                        disabled={payoutBusy === p.id}
                        onClick={() => processPayout(p, 'PAID')}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Отметить выплаченной
                      </button>
                      <button
                        type="button"
                        disabled={payoutBusy === p.id}
                        onClick={() => processPayout(p, 'REJECTED')}
                        className="rounded-lg border border-rose-200 px-3 py-1.5 text-[11px] font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                      >
                        Отклонить
                      </button>
                    </>
                  ) : (
                    <Badge tone={p.status === 'PAID' ? 'emerald' : 'rose'}>
                      {p.status === 'PAID' ? 'Выплачено' : 'Отклонено'}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={`Реестр заказов (${filtered.length})`}
        subtitle="Все транзакции и возвраты страховки"
        action={
          <button
            type="button"
            onClick={downloadOrdersCsv}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-800 hover:bg-white"
          >
            <Download className="h-3.5 w-3.5 text-blue-600" />
            Скачать CSV
          </button>
        }
      >
        <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-100 px-5 py-3">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию, email или ID…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs focus:border-blue-500 focus:bg-white focus:outline-none"
            />
          </div>
          <div className="flex rounded-xl border border-slate-200 bg-white p-1">
            {(
              [
                ['ALL', 'Все'],
                ['SUCCEEDED', 'Оплачены'],
                ['REFUNDED', 'Возвраты'],
                ['PENDING', 'Ожидают'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setStatusFilter(id)}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${
                  statusFilter === id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={<ReceiptText className="h-5 w-5" />} title="Заказов не найдено" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3">Заказ</th>
                  <th className="px-5 py-3">Покупатель</th>
                  <th className="px-5 py-3">Дата</th>
                  <th className="px-5 py-3">Сумма</th>
                  <th className="px-5 py-3">Статус</th>
                  <th className="px-5 py-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <div className="font-bold text-slate-900">{order.title}</div>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {order.promoCode && (
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-700">
                            {order.promoCode}
                          </span>
                        )}
                        {order.insuranceCredited && (
                          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                            Страховка выплачена
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{order.userEmail}</td>
                    <td className="px-5 py-3 text-slate-500">
                      <LocalDateTime value={order.createdAt} format="full" />
                    </td>
                    <td className="px-5 py-3 font-mono font-black text-slate-950">
                      {formatRub(order.amountRub)}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={order.status === 'SUCCEEDED' ? 'emerald' : order.status === 'REFUNDED' ? 'rose' : 'amber'}>
                        {order.status === 'SUCCEEDED' ? 'Оплачен' : order.status === 'REFUNDED' ? 'Возврат' : 'Ожидает'}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {order.status === 'SUCCEEDED' && (
                        <button
                          type="button"
                          onClick={() => setRefundTarget(order)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-600"
                        >
                          Возврат на баланс
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <ConfirmDialog
        open={refundTarget !== null}
        title="Вернуть средства?"
        description={
          refundTarget
            ? `${formatRub(refundTarget.amountRub)} будет возвращена на внутренний баланс покупателя, а доступ к прогнозу отозван.`
            : ''
        }
        confirmLabel="Вернуть на баланс"
        busy={refunding}
        onConfirm={confirmRefund}
        onCancel={() => setRefundTarget(null)}
      />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   КЛИЕНТЫ
   ════════════════════════════════════════════════════════════════════════ */

type UserAction =
  | { kind: 'balance'; user: SafeSessionUser }
  | { kind: 'grant'; user: SafeSessionUser }
  | { kind: 'revshare'; user: SafeSessionUser }
  | { kind: 'password'; user: SafeSessionUser }
  | { kind: 'block'; user: SafeSessionUser };

function UsersTab({
  users,
  predictions,
  onRefresh,
  onToast,
}: {
  users: SafeSessionUser[];
  predictions: PredictionRecord[];
  onRefresh: () => Promise<void>;
  onToast: (msg: string, kind?: ToastKind) => void;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'BUYERS' | 'PARTNERS' | 'BLOCKED'>('ALL');
  const [action, setAction] = useState<UserAction | null>(null);
  const [busy, setBusy] = useState(false);

  const [balanceAmount, setBalanceAmount] = useState('1000');
  const [grantPredictionId, setGrantPredictionId] = useState('');
  const [revsharePct, setRevsharePct] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const openAction = (next: UserAction) => {
    setAction(next);
    if (next.kind === 'balance') setBalanceAmount('1000');
    if (next.kind === 'revshare') setRevsharePct(String(next.user.revsharePercent));
    if (next.kind === 'password') setNewPassword('');
    if (next.kind === 'grant') {
      const pending = predictions.filter(
        (p) => p.resultStatus === 'PENDING' && !next.user.purchasedPredictionIds.includes(p.id),
      );
      setGrantPredictionId(pending[0]?.id ?? '');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (filter === 'BUYERS' && u.purchasedPredictionIds.length === 0) return false;
      if (filter === 'PARTNERS' && u.affiliateTotalEarnedRub <= 0) return false;
      if (filter === 'BLOCKED' && u.status !== 'BLOCKED') return false;
      if (!q) return true;
      return u.email.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q);
    });
  }, [users, search, filter]);

  const runAction = async () => {
    if (!action) return;
    setBusy(true);
    try {
      let payload: Record<string, unknown> | null = null;
      if (action.kind === 'balance') {
        const amount = Number(balanceAmount);
        if (!Number.isFinite(amount) || amount === 0) {
          onToast('Введите корректную сумму', 'error');
          return;
        }
        payload = { action: 'ADD_BALANCE', userId: action.user.id, amountRub: amount };
      } else if (action.kind === 'grant') {
        if (!grantPredictionId) {
          onToast('Все актуальные матчи уже открыты у этого клиента', 'info');
          return;
        }
        payload = { action: 'GRANT_PREDICTION', userId: action.user.id, predictionId: grantPredictionId };
      } else if (action.kind === 'revshare') {
        const pct = Number(revsharePct);
        if (!Number.isFinite(pct) || pct < 5 || pct > 60) {
          onToast('Партнёрский процент должен быть от 5 до 60%', 'error');
          return;
        }
        payload = { action: 'SET_REVSHARE', userId: action.user.id, revsharePercent: pct };
      } else if (action.kind === 'password') {
        if (newPassword.length < 6) {
          onToast('Пароль должен содержать минимум 6 символов', 'error');
          return;
        }
        payload = { action: 'RESET_PASSWORD', userId: action.user.id, newPassword };
      } else if (action.kind === 'block') {
        payload = { action: 'TOGGLE_BLOCK', userId: action.user.id };
      }
      if (!payload) return;
      const res = await fetch('/api/v1/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        onToast('Не удалось выполнить действие', 'error');
        return;
      }
      const messages: Record<UserAction['kind'], string> = {
        balance: 'Баланс начислен',
        grant: 'Доступ к прогнозу открыт',
        revshare: 'Партнёрский процент обновлён',
        password: 'Новый пароль установлен',
        block:
          action.user.status === 'BLOCKED'
            ? 'Аккаунт разблокирован'
            : 'Аккаунт заблокирован',
      };
      onToast(messages[action.kind]);
      setAction(null);
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const grantablePredictions = action?.kind === 'grant'
    ? predictions.filter(
        (p) => p.resultStatus === 'PENDING' && !action.user.purchasedPredictionIds.includes(p.id),
      )
    : [];

  const modalMeta: Record<UserAction['kind'], { title: string; description: string; confirm: string }> = {
    balance: { title: 'Начислить на баланс', description: 'Сумма будет добавлена на внутренний баланс клиента.', confirm: 'Начислить' },
    grant: { title: 'Подарить прогноз', description: 'Клиент получит бесплатный доступ к выбранному событию.', confirm: 'Открыть доступ' },
    revshare: { title: 'Партнёрский процент', description: 'Доля с продаж по реферальной ссылке клиента.', confirm: 'Сохранить' },
    password: { title: 'Сменить пароль', description: 'Новый пароль будет действовать сразу.', confirm: 'Установить пароль' },
    block: { title: 'Изменить блокировку', description: 'Заблокированный клиент не сможет входить и покупать.', confirm: 'Применить' },
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по email или имени…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div className="flex rounded-xl border border-slate-200 bg-white p-1">
          {(
            [
              ['ALL', 'Все'],
              ['BUYERS', 'Покупатели'],
              ['PARTNERS', 'Партнёры'],
              ['BLOCKED', 'Заблокированные'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${
                filter === id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <SectionCard title={`Клиенты (${filtered.length})`} subtitle="Управление пользователями и партнёрами">
        {filtered.length === 0 ? (
          <EmptyState icon={<Users className="h-5 w-5" />} title="Клиентов не найдено" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3">Клиент</th>
                  <th className="px-5 py-3">Баланс</th>
                  <th className="px-5 py-3">Партнёрка</th>
                  <th className="px-5 py-3">Открыто прогнозов</th>
                  <th className="px-5 py-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900">
                          {u.displayName} ({u.email})
                        </span>
                        {u.role === 'ADMIN' && <Badge tone="blue">Администратор</Badge>}
                        {u.status === 'BLOCKED' && <Badge tone="rose">Заблокирован</Badge>}
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono font-bold text-slate-900">
                      {formatRub(u.balanceRub)}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      <div className="font-mono font-bold">{formatRub(u.affiliateBalanceRub)}</div>
                      <div className="text-[11px] text-slate-400">
                        {u.revsharePercent}% · заработано {formatRub(u.affiliateTotalEarnedRub)}
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono font-bold text-slate-900">
                      {u.purchasedPredictionIds.length}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openAction({ kind: 'balance', user: u })}
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                        >
                          + ₽
                        </button>
                        <button
                          type="button"
                          onClick={() => openAction({ kind: 'grant', user: u })}
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-bold text-blue-700 hover:bg-blue-100"
                        >
                          <Gift className="h-3 w-3" />
                          Подарить матч
                        </button>
                        <button
                          type="button"
                          onClick={() => openAction({ kind: 'revshare', user: u })}
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                        >
                          {u.revsharePercent}%
                        </button>
                        <button
                          type="button"
                          onClick={() => openAction({ kind: 'password', user: u })}
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                        >
                          Пароль
                        </button>
                        {u.role !== 'ADMIN' && (
                          <button
                            type="button"
                            onClick={() => openAction({ kind: 'block', user: u })}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${
                              u.status === 'BLOCKED'
                                ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                                : 'border-rose-200 text-rose-600 hover:bg-rose-50'
                            }`}
                          >
                            <Ban className="h-3 w-3" />
                            {u.status === 'BLOCKED' ? 'Разблокировать' : 'Блок'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <Modal
        open={action !== null}
        onClose={() => setAction(null)}
        title={action ? modalMeta[action.kind].title : ''}
        description={
          action
            ? `${modalMeta[action.kind].description} Клиент: ${action.user.displayName} (${action.user.email})`
            : undefined
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => setAction(null)}
              disabled={busy}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={runAction}
              disabled={busy}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white disabled:opacity-50 ${
                action?.kind === 'block' && action.user.status !== 'BLOCKED'
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {action ? modalMeta[action.kind].confirm : ''}
            </button>
          </>
        }
      >
        {action?.kind === 'balance' && (
          <Field label="Сумма начисления (₽)" hint="Можно указать отрицательную сумму для списания.">
            <input type="number" autoFocus value={balanceAmount} onChange={(e) => setBalanceAmount(e.target.value)} className={inputMonoCls} />
          </Field>
        )}
        {action?.kind === 'grant' && (
          <Field label="Событие для подарка">
            {grantablePredictions.length === 0 ? (
              <p className="text-xs text-slate-500">Все актуальные матчи уже открыты у этого клиента.</p>
            ) : (
              <select value={grantPredictionId} onChange={(e) => setGrantPredictionId(e.target.value)} className={inputCls}>
                {grantablePredictions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.homeTeam} — {p.awayTeam} · {p.leagueName}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        {action?.kind === 'revshare' && (
          <Field label="Партнёрский процент" hint="Допустимый диапазон: от 5 до 60%.">
            <input type="number" min={5} max={60} autoFocus value={revsharePct} onChange={(e) => setRevsharePct(e.target.value)} className={inputMonoCls} />
          </Field>
        )}
        {action?.kind === 'password' && (
          <Field label="Новый пароль" hint="Минимум 6 символов.">
            <input type="password" autoFocus value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputCls} />
          </Field>
        )}
        {action?.kind === 'block' && (
          <p className="text-xs leading-relaxed text-slate-600">
            {action.user.status === 'BLOCKED'
              ? 'Аккаунт будет разблокирован и клиент снова сможет входить и покупать прогнозы.'
              : 'Аккаунт будет заблокирован: клиент не сможет входить и покупать прогнозы, пока вы не разблокируете его.'}
          </p>
        )}
      </Modal>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   НАСТРОЙКИ
   ════════════════════════════════════════════════════════════════════════ */

function SettingsTab({
  settings,
  onRefresh,
  onToast,
}: {
  settings: PlatformSettings;
  onRefresh: () => Promise<void>;
  onToast: (msg: string, kind?: ToastKind) => void;
}) {
  const [draft, setDraft] = useState<PlatformSettings>(settings);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [tgBusy, setTgBusy] = useState<string | null>(null);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const set = <K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/v1/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: draft,
          newAdminEmail: newAdminEmail.trim() || undefined,
          newAdminPassword: newAdminPassword.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        onToast(json.error || 'Ошибка сохранения настроек', 'error');
        return;
      }
      setNewAdminEmail('');
      setNewAdminPassword('');
      onToast('Настройки кассы ЮKassa, реквизитов и доступов сохранены!');
      await onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const handleTestTelegram = async () => {
    setTgBusy('test');
    try {
      const res = await fetch('/api/v1/admin/settings', { method: 'POST' });
      const json = await res.json();
      if (res.ok) {
        onToast('Тестовый анонс успешно отправлен в ваш Telegram-канал!');
      } else {
        onToast(json.error || 'Сначала сохраните Bot Token и ID канала', 'error');
      }
    } finally {
      setTgBusy(null);
    }
  };

  const handleInstallMiniApp = async () => {
    setTgBusy('miniapp');
    try {
      const res = await fetch('/api/v1/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'INSTALL_MINI_APP' }),
      });
      const json = (await res.json()) as { message?: string; error?: string };
      onToast(
        res.ok ? json.message || 'Telegram Mini App установлен!' : json.error || 'Ошибка установки Mini App',
        res.ok ? 'success' : 'error',
      );
    } finally {
      setTgBusy(null);
    }
  };

  return (
    <form onSubmit={handleSave} className="max-w-3xl space-y-5">
      <SectionCard title="Общие" subtitle="Бренд и режим приёма оплат">
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Название бренда">
            <input value={draft.brandName} onChange={(e) => set('brandName', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Режим приёма оплат">
            <select
              value={draft.paymentMode}
              onChange={(e) => set('paymentMode', e.target.value as 'TEST_INSTANT' | 'YOOKASSA_LIVE')}
              className={inputCls}
            >
              <option value="TEST_INSTANT">Демо-касса (мгновенная оплата)</option>
              <option value="YOOKASSA_LIVE">Боевая ЮKassa (Карты РФ / СБП)</option>
            </select>
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="ЮKassa" subtitle="Ключи платёжного шлюза">
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Shop ID">
            <input value={draft.yookassaShopId} onChange={(e) => set('yookassaShopId', e.target.value)} className={inputMonoCls} />
          </Field>
          <Field label="Secret Key" hint={draft.yookassaSecretKeyConfigured ? 'Ключ сохранён на сервере; введите новый только для замены.' : undefined}>
            <input
              type="password"
              value={draft.yookassaSecretKey}
              placeholder={draft.yookassaSecretKeyConfigured ? 'Сохранён на сервере' : 'Введите Secret Key ЮKassa'}
              onChange={(e) => set('yookassaSecretKey', e.target.value)}
              className={inputMonoCls}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Telegram"
        subtitle="Интеграция с каналом и контакты поддержки"
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleInstallMiniApp}
              disabled={tgBusy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
            >
              <Smartphone className="h-3 w-3" />
              Установить кнопку Mini App
            </button>
            <button
              type="button"
              onClick={handleTestTelegram}
              disabled={tgBusy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-[11px] font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            >
              {tgBusy === 'test' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Тестовый пост в канал
            </button>
          </div>
        }
      >
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Bot Token (@BotFather)" hint={draft.telegramBotTokenConfigured ? 'Токен сохранён на сервере; введите новый только для замены.' : undefined}>
            <input
              type="password"
              value={draft.telegramBotToken}
              placeholder={draft.telegramBotTokenConfigured ? 'Сохранён на сервере' : 'Введите токен от BotFather'}
              onChange={(e) => set('telegramBotToken', e.target.value)}
              className={inputMonoCls}
            />
          </Field>
          <Field label="ID канала для автопостинга">
            <input value={draft.telegramChannelId} onChange={(e) => set('telegramChannelId', e.target.value)} placeholder="@channel или -100…" className={inputMonoCls} />
          </Field>
          <Field label="Ссылка на открытый Telegram-канал">
            <input value={draft.freeTelegramUrl} onChange={(e) => set('freeTelegramUrl', e.target.value)} placeholder="https://t.me/your_channel" className={inputCls} />
          </Field>
          <Field label="Ссылка на поддержку в Telegram">
            <input value={draft.supportTelegram} onChange={(e) => set('supportTelegram', e.target.value)} placeholder="https://t.me/your_support" className={inputCls} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Реквизиты и аналитика" subtitle="Данные продавца для оферты и счётчик Метрики">
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Наименование продавца (ИП / Самозанятый / ООО)">
            <input value={draft.legalSellerName} onChange={(e) => set('legalSellerName', e.target.value)} placeholder="ИП Иванов И.И." className={inputCls} />
          </Field>
          <Field label="ИНН продавца">
            <input value={draft.legalInn} onChange={(e) => set('legalInn', e.target.value)} placeholder="770000000000" className={inputMonoCls} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="ID счётчика Яндекс.Метрики" hint="Для аналитики рекламы и автоцели «purchase_success». Оставьте пустым, если не используется.">
              <input
                value={draft.yandexMetrikaId || ''}
                onChange={(e) => set('yandexMetrikaId', e.target.value.replace(/\D/g, ''))}
                placeholder="Например: 98765432"
                className={inputMonoCls}
              />
            </Field>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Безопасность" subtitle="Смена логина и пароля администратора">
        <div className="rounded-b-2xl border-t border-amber-100 bg-amber-50/50 p-5">
          <p className="text-[11px] leading-relaxed text-slate-500">
            Оставьте поля пустыми, если менять не нужно. Новый пароль должен содержать не менее 12 символов.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Новый Email администратора">
              <input type="email" value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} placeholder="Оставьте пустым, чтобы не менять" className={inputCls} />
            </Field>
            <Field label="Новый пароль администратора (от 12 символов)">
              <input type="password" minLength={12} value={newAdminPassword} onChange={(e) => setNewAdminPassword(e.target.value)} placeholder="Новый надёжный пароль…" className={inputCls} />
            </Field>
          </div>
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Сохранить все настройки
        </button>
      </div>
    </form>
  );
}
