'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Coins,
  LayoutDashboard,
  Loader2,
  LogIn,
  Menu,
  MessageSquareText,
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
import { AdminCommandPalette } from '@/components/admin/AdminCommandPalette';
import { SystemHealth } from '@/components/admin/SystemHealth';
import type { AdminCommandTarget, AdminTabId as TabId } from '@/lib/admin-command-search';
import { AiAutopilotPanel } from '@/components/admin/AiAutopilotPanel';
import { FinanceTab } from '@/components/admin/FinanceTab';
import { PredictionsTab } from '@/components/admin/PredictionsTab';
import { UsersTab } from '@/components/admin/UsersTab';
import { formatRub, type AdminUser } from '@/components/admin/admin-format';
import { OrderStatusBadge } from '@/components/admin/AdminTableHelpers';
import { aggregateSportStats, buildPredictionSalesChart, isPaidPredictionSale, paidAtMs } from '@/lib/admin-metrics';
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  RevenueChart,
  SectionCard,
  SkeletonLines,
  SportStats,
  ToastStack,
  inputCls,
  inputMonoCls,
  type ToastItem,
  type ToastKind,
} from '@/components/admin/ui';
import { LocalDateTime } from '@/components/LocalDateTime';
import { TeamAvatar } from '@/components/predictions/TeamAvatar';
import type {
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
  StatsSummary,
} from '@/server/types';

interface AdminOverviewPayload {
  settings: PlatformSettings;
  predictions: PredictionRecord[];
  promoCodes: PromoCodeRecord[];
  users: AdminUser[];
  transactions: OrderTransaction[];
  payouts: PayoutRequestRecord[];
  stats: StatsSummary;
  aiAutopilot: AiAutopilotConfig;
  aiDrafts: AiPredictionDraft[];
  aiLogs: AiAutopilotLogEntry[];
  aiChatMessages?: AiChatMessage[];
  aiStats: AiPerformanceStats;
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<AdminOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('OVERVIEW');
  const [navigation, setNavigation] = useState<{ target: AdminCommandTarget; sequence: number } | null>(null);
  const navigationSequence = useRef(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSeq = useRef(0);

  const goToTab = (nextTab: TabId) => {
    setNavigation(null);
    setTab(nextTab);
    setSidebarOpen(false);
  };
  const navigateFromSearch = (target: AdminCommandTarget) => {
    setNavigation(target.search || target.userId || target.predictionId || target.orderId
      ? { target, sequence: ++navigationSequence.current }
      : null);
    setTab(target.tab);
    setSidebarOpen(false);
  };

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
    () => (data?.transactions ?? []).filter(isPaidPredictionSale),
    [data],
  );
  const totalRevenueRub = useMemo(
    () => paidTransactions.reduce((acc, t) => acc + t.amountRub, 0),
    [paidTransactions],
  );
  const todayRevenueRub = useMemo(() => {
    const now = Date.now();
    return paidTransactions
      .filter((order) => paidAtMs(order) >= now - 86_400_000 && paidAtMs(order) <= now)
      .reduce((acc, order) => acc + order.amountRub, 0);
  }, [paidTransactions]);
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
                goToTab(item.id);
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
            <AdminCommandPalette
              enabled={Boolean(data)}
              users={data?.users ?? []}
              predictions={data?.predictions ?? []}
              transactions={data?.transactions ?? []}
              onNavigate={navigateFromSearch}
            />
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
                  onGoTab={goToTab}
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
                  key={navigation?.target.tab === 'PREDICTIONS' ? navigation.sequence : 'default'}
                  initialSearch={navigation?.target.tab === 'PREDICTIONS' ? navigation.target.search : undefined}
                  initialPredictionId={navigation?.target.tab === 'PREDICTIONS' ? navigation.target.predictionId : undefined}
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
                  key={navigation?.target.tab === 'FINANCE' ? navigation.sequence : 'default'}
                  initialSearch={navigation?.target.tab === 'FINANCE' ? navigation.target.search : undefined}
                  initialOrderId={navigation?.target.tab === 'FINANCE' ? navigation.target.orderId : undefined}
                  transactions={data.transactions}
                  payouts={data.payouts}
                  onRefresh={loadOverview}
                  onToast={showToast}
                />
              )}

              {tab === 'USERS' && data && (
                <UsersTab
                  key={navigation?.target.tab === 'USERS' ? navigation.sequence : 'default'}
                  initialSearch={navigation?.target.tab === 'USERS' ? navigation.target.search : undefined}
                  initialUserId={navigation?.target.tab === 'USERS' ? navigation.target.userId : undefined}
                  users={data.users}
                  predictions={data.predictions}
                  transactions={data.transactions}
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
          onClick={() => goToTab('AI_CHAT')}
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
      label: 'Продажи прогнозов',
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
      label: 'Оплаченных заказов',
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

  const revenuePoints = useMemo(
    () => buildPredictionSalesChart(data.transactions, new Date()),
    [data.transactions],
  );

  const sportStats = useMemo(() => aggregateSportStats(data.predictions), [data.predictions]);

  const activityFeed = useMemo(() => {
    const items: Array<{ id: string; time: string; text: string; tone: 'emerald' | 'amber' | 'rose' | 'blue' | 'slate' }> = [];
    for (const log of [...data.aiLogs].slice(0, 8)) {
      items.push({
        id: log.id,
        time: log.createdAt,
        text: log.message,
        tone: log.level === 'SUCCESS' ? 'emerald' : log.level === 'ERROR' ? 'rose' : log.level === 'WARN' ? 'amber' : 'blue',
      });
    }
    for (const t of [...data.transactions].slice(0, 4)) {
      if (t.status === 'SUCCEEDED') {
        items.push({
          id: t.id,
          time: t.createdAt,
          text: `Оплата ${formatRub(t.amountRub)} — ${t.title}`,
          tone: 'emerald',
        });
      }
    }
    return items
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 10);
  }, [data.aiLogs, data.transactions]);

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

      <p className="text-[11px] text-slate-500">Продажи — сумма заказов прогнозов со статусом «Оплачен»: пополнения и возвращённые заказы исключены, страховые выплаты не вычитаются. Это не денежный поток.</p>
      <div className="grid gap-5 xl:grid-cols-3">
        <SectionCard title="Динамика продаж прогнозов" subtitle="За 14 дней по времени оплаты; только текущий статус «Оплачен»" className="xl:col-span-2">
          <RevenueChart points={revenuePoints} />
        </SectionCard>

        <SectionCard title="Эффективность по спорту" subtitle="Только подтверждённые расчёты">
          {sportStats.length === 0 ? (
            <EmptyState icon={<TrendingUp className="h-5 w-5" />} title="Пока нет рассчитанных событий" description="Статистика появится после первых подтверждённых расчётов." />
          ) : (
            <SportStats rows={sportStats} />
          )}
        </SectionCard>
      </div>

      <SystemHealth />

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
                    <OrderStatusBadge status={o.status} />
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

      <SectionCard
        title="Лента активности"
        subtitle="Последние события автопилота и оплаты"
        action={
          <button
            type="button"
            onClick={() => onGoTab('AUTOPILOT')}
            className="text-xs font-bold text-blue-600 hover:text-blue-800"
          >
            Журнал автопилота →
          </button>
        }
      >
        {activityFeed.length === 0 ? (
          <EmptyState icon={<Activity className="h-5 w-5" />} title="Активности пока нет" />
        ) : (
          <div className="divide-y divide-slate-100">
            {activityFeed.map((item) => (
              <div key={item.id} className="flex items-start gap-3 px-5 py-2.5">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    item.tone === 'emerald'
                      ? 'bg-emerald-500'
                      : item.tone === 'rose'
                        ? 'bg-rose-500'
                        : item.tone === 'amber'
                          ? 'bg-amber-500'
                          : 'bg-blue-500'
                  }`}
                />
                <p className="min-w-0 flex-1 text-xs leading-relaxed text-slate-700">{item.text}</p>
                <span className="shrink-0 text-[10px] text-slate-400">
                  <LocalDateTime value={item.time} format="full" />
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   СОБЫТИЯ
   ════════════════════════════════════════════════════════════════════════ */

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
