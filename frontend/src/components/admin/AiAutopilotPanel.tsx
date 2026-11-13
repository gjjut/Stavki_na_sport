'use client';

import React, { useEffect, useState } from 'react';
import {
  Activity,
  Bot,
  CheckCircle2,
  Clock,
  Cpu,
  Loader2,
  Play,
  Rocket,
  ShieldCheck,
  Sparkles,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react';
import type {
  AiAutopilotConfig,
  AiAutopilotLogEntry,
  AiAutopilotMode,
  AiDiagnosticsReport,
  AiLlmProvider,
  AiPerformanceStats,
  AiPredictionDraft,
  SportType,
} from '@/server/types';

interface AiAutopilotPanelProps {
  config: AiAutopilotConfig;
  drafts: AiPredictionDraft[];
  logs: AiAutopilotLogEntry[];
  aiStats: AiPerformanceStats;
  onRefresh: () => Promise<void>;
  onToast: (msg: string) => void;
}

const SPORT_OPTIONS: Array<{ id: SportType; label: string }> = [
  { id: 'FOOTBALL', label: 'Футбол' },
  { id: 'HOCKEY', label: 'Хоккей' },
  { id: 'TENNIS', label: 'Теннис' },
  { id: 'ESPORTS', label: 'Киберспорт' },
  { id: 'BASKETBALL', label: 'Баскетбол' },
  { id: 'MMA', label: 'ММА / UFC' },
];

export const AiAutopilotPanel: React.FC<AiAutopilotPanelProps> = ({
  config,
  drafts,
  logs,
  aiStats,
  onRefresh,
  onToast,
}) => {
  const [draftConfig, setDraftConfig] = useState<AiAutopilotConfig>(config);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<AiDiagnosticsReport | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [llmCheckStatus, setLlmCheckStatus] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    setDraftConfig(config);
  }, [config]);

  const saveModeImmediately = async (nextMode: AiAutopilotMode) => {
    setBusyAction('MODE');
    try {
      const updated = { ...draftConfig, mode: nextMode };
      setDraftConfig(updated);
      const res = await fetch('/api/v1/admin/autopilot', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { mode: nextMode } }),
      });
      if (res.ok) {
        onToast(
          nextMode === 'FULL_AUTOPILOT'
            ? 'Полный автопилот 24/7 ВКЛЮЧЕН! Сбор российской линии и авторасчет активны.'
            : nextMode === 'MODERATION'
              ? 'Включен режим премодерации черновиков ИИ.'
              : 'ИИ-Автопилот поставлен на паузу.',
        );
        await onRefresh();
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleApplyProviderPreset = (provider: AiLlmProvider) => {
    setLlmCheckStatus(null);
    setAvailableModels([]);
    if (provider === 'ORCAROUTER') {
      setDraftConfig({
        ...draftConfig,
        llmProvider: 'ORCAROUTER',
        llmBaseUrl: 'https://www.orcarouter.ai/v1',
        llmModel: 'gemini-2.5-flash',
      });
    } else if (provider === 'DEEPSEEK') {
      setDraftConfig({
        ...draftConfig,
        llmProvider: 'DEEPSEEK',
        llmBaseUrl: 'https://api.deepseek.com/v1',
        llmModel: 'deepseek-chat',
      });
    } else if (provider === 'OPENROUTER') {
      setDraftConfig({
        ...draftConfig,
        llmProvider: 'OPENROUTER',
        llmBaseUrl: 'https://openrouter.ai/api/v1',
        llmModel: 'deepseek/deepseek-chat',
      });
    } else if (provider === 'RU_GATEWAY') {
      setDraftConfig({
        ...draftConfig,
        llmProvider: 'RU_GATEWAY',
        llmBaseUrl: 'https://api.proxyapi.ru/openai/v1',
        llmModel: 'gpt-4o-mini',
      });
    } else if (provider === 'OPENAI') {
      setDraftConfig({
        ...draftConfig,
        llmProvider: 'OPENAI',
        llmBaseUrl: 'https://api.openai.com/v1',
        llmModel: 'gpt-4o-mini',
      });
    } else {
      setDraftConfig({
        ...draftConfig,
        llmProvider: 'BUILTIN_QUANT',
      });
    }
  };

  const handleTestLlmAndFetchModels = async () => {
    setBusyAction('TEST_LLM');
    setLlmCheckStatus(null);
    try {
      const res = await fetch('/api/v1/admin/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'TEST_LLM',
          llmProvider: draftConfig.llmProvider,
          llmBaseUrl: draftConfig.llmBaseUrl,
          llmApiKey: draftConfig.llmApiKey,
          llmModel: draftConfig.llmModel,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        resolvedBaseUrl?: string;
        testedModel?: string;
        availableModels?: string[];
        message?: string;
        error?: string;
      };
      if (Array.isArray(json.availableModels) && json.availableModels.length > 0) {
        setAvailableModels(json.availableModels);
      }
      if (json.resolvedBaseUrl || json.testedModel) {
        setDraftConfig((prev) => ({
          ...prev,
          llmBaseUrl: json.resolvedBaseUrl || prev.llmBaseUrl,
          llmModel: json.testedModel || prev.llmModel,
        }));
      }
      setLlmCheckStatus({
        ok: Boolean(json.ok),
        message: json.message || json.error || 'Проверка завершена',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const toggleSport = (sport: SportType) => {
    const exists = draftConfig.sportsEnabled.includes(sport);
    const next = exists
      ? draftConfig.sportsEnabled.filter((s) => s !== sport)
      : [...draftConfig.sportsEnabled, sport];
    if (next.length === 0) return;
    setDraftConfig({ ...draftConfig, sportsEnabled: next });
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction('SAVE');
    try {
      const res = await fetch('/api/v1/admin/autopilot', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: draftConfig }),
      });
      if (res.ok) {
        onToast('Настройки ИИ-Автопилота и расписания сохранены!');
        await onRefresh();
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleRunScan = async (forcePublish: boolean) => {
    setBusyAction(forcePublish ? 'FORCE_PUBLISH' : 'SCAN');
    try {
      const res = await fetch('/api/v1/admin/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RUN_SCAN_NOW', forcePublish }),
      });
      const json = await res.json();
      if (res.ok) {
        if (json.createdCount > 0) {
          onToast(
            json.publishedDirectly
              ? `Выставлено ${json.createdCount} событий на витрину (${json.feedSource})!`
              : `Подготовлено ${json.createdCount} прогнозов в черновики (${json.feedSource})!`,
          );
        } else {
          onToast(`Новых матчей сверх лимита не требуется (${json.feedSource}).`);
        }
        await onRefresh();
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleRunSettlement = async () => {
    setBusyAction('SETTLE');
    try {
      const res = await fetch('/api/v1/admin/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RUN_SETTLE_NOW' }),
      });
      const json = await res.json();
      if (res.ok) {
        onToast(
          json.settledCount > 0
            ? `Рассчитано матчей: ${json.settledCount}, выплачено страховок: ${json.compensatedBuyers}.`
            : `Проверено завершенных встреч: ${json.checkedCount}. Новых итоговых счетов пока нет.`,
        );
        await onRefresh();
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleRunDiagnostics = async () => {
    setBusyAction('DIAG');
    try {
      const res = await fetch('/api/v1/admin/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RUN_DIAGNOSTICS' }),
      });
      const json = await res.json();
      if (res.ok && json.report) {
        setDiagnostics(json.report as AiDiagnosticsReport);
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleReplaceDemoWithReal = async () => {
    setBusyAction('REPLACE_DEMO');
    try {
      const res = await fetch('/api/v1/admin/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REPLACE_DEMO_WITH_REAL' }),
      });
      const json = await res.json();
      if (res.ok) {
        onToast(
          `Стартовые демо убраны (${json.removedDemoCount} шт.), опубликовано реальных матчей: ${json.createdCount} (${json.feedSource})!`,
        );
        await onRefresh();
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleApproveDraft = async (draftId: string) => {
    setBusyAction(draftId);
    try {
      const res = await fetch('/api/v1/admin/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'APPROVE_DRAFT', draftId }),
      });
      if (res.ok) {
        onToast('Прогноз ИИ опубликован на витрине и зафиксирован SHA-256!');
        await onRefresh();
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteDraft = async (draftId: string) => {
    await fetch('/api/v1/admin/autopilot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'DELETE_DRAFT', draftId }),
    });
    await onRefresh();
  };

  const isFullAutopilot = draftConfig.mode === 'FULL_AUTOPILOT';

  return (
    <div className="mt-6 space-y-6">
      {/* 1. ГЛАВНЫЙ БЛОК ТУМБЛЕРА АВТОПИЛОТА И СТАТИСТИКИ АЛГОРИТМА */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-[#0B0F19] p-6 text-white shadow-lg sm:p-8">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-bold text-blue-300">
              <Bot className="h-4 w-4 text-blue-400" />
              <span>Прямая линия РФ (Фонбет / Леон · 0 ₽/мес) + ИИ-Аналитик</span>
            </div>

            <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
              {isFullAutopilot
                ? 'Полный автопилот 24/7 активен'
                : draftConfig.mode === 'MODERATION'
                  ? 'Режим премодерации черновиков'
                  : 'ИИ-Автопилот на паузе'}
            </h2>

            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate-300 sm:text-sm">
              С вашего российского IP сервер бесплатно собирает прематч-линию РФ (русские команды, РПЛ, КХЛ, еврокубки, ATP, CS2, UFC), фильтрует валуйные котировки, генерирует разбор и сам публикует события в{' '}
              <strong className="text-white">
                {String(draftConfig.morningHourMsk).padStart(2, '0')}:00
              </strong>{' '}
              и{' '}
              <strong className="text-white">
                {String(draftConfig.eveningHourMsk).padStart(2, '0')}:00 МСК
              </strong>
              , а после матчей сверяет счет и начисляет страховки на баланс.
            </p>

            {/* Тумблер 3 режимов */}
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busyAction === 'MODE'}
                onClick={() => saveModeImmediately('FULL_AUTOPILOT')}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-extrabold transition ${
                  isFullAutopilot
                    ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/30'
                    : 'border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
                }`}
              >
                <Rocket className="h-4 w-4" />
                <span>Полный автопилот 24/7</span>
              </button>

              <button
                type="button"
                disabled={busyAction === 'MODE'}
                onClick={() => saveModeImmediately('MODERATION')}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-bold transition ${
                  draftConfig.mode === 'MODERATION'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                    : 'border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
                }`}
              >
                <ShieldCheck className="h-4 w-4" />
                <span>Премодерация черновиков</span>
              </button>

              <button
                type="button"
                disabled={busyAction === 'MODE'}
                onClick={() => saveModeImmediately('OFF')}
                className={`rounded-xl px-4 py-3 text-xs font-bold transition ${
                  draftConfig.mode === 'OFF'
                    ? 'bg-rose-600 text-white'
                    : 'border border-white/15 bg-white/5 text-slate-400 hover:text-white'
                }`}
              >
                Пауза
              </button>
            </div>
          </div>

          {/* Метрики дистанции самого ИИ */}
          <div className="grid grid-cols-2 gap-3 lg:col-span-5">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="text-[11px] text-slate-400">Yield алгоритма ИИ</div>
              <div
                className={`mt-1 font-mono text-2xl font-black ${
                  aiStats.yieldPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {aiStats.yieldPct >= 0 ? '+' : ''}
                {aiStats.yieldPct.toFixed(1)}%
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400">
                Чистая эффективность на дистанции
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="text-[11px] text-slate-400">Профит ИИ к банку</div>
              <div className="mt-1 font-mono text-2xl font-black text-white">
                {aiStats.netProfitUnits >= 0 ? '+' : ''}
                {aiStats.netProfitUnits.toFixed(2)}%
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400">
                Побед: {aiStats.wins} / Минусов: {aiStats.losses}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="text-[11px] text-slate-400">Проходимость ИИ</div>
              <div className="mt-1 font-mono text-2xl font-black text-blue-400">
                {aiStats.winRatePct.toFixed(1)}%
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400">
                Рассчитано: {aiStats.settledAiPredictions} шт.
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="text-[11px] text-slate-400">Черновиков в очереди</div>
              <div className="mt-1 font-mono text-2xl font-black text-white">
                {drafts.length}
              </div>
              <div className="mt-0.5 truncate text-[10px] text-slate-400">
                {config.lastFeedSource || `Выпущено ИИ: ${aiStats.totalAiPredictions}`}
              </div>
            </div>
          </div>
        </div>

        {/* Панель мгновенного управления и самодиагностики */}
        <div className="mt-6 flex flex-wrap items-center gap-2.5 border-t border-white/10 pt-5">
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => handleRunScan(false)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50"
          >
            {busyAction === 'SCAN' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            <span>
              {isFullAutopilot
                ? 'Собрать линию РФ и опубликовать сейчас'
                : 'Собрать линию РФ в черновики'}
            </span>
          </button>

          {!isFullAutopilot && (
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => handleRunScan(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-2.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
            >
              {busyAction === 'FORCE_PUBLISH' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="h-3.5 w-3.5" />
              )}
              <span>Выпустить сразу на витрину</span>
            </button>
          )}

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={handleRunSettlement}
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-bold text-slate-200 hover:bg-white/10 disabled:opacity-50"
          >
            {busyAction === 'SETTLE' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            )}
            <span>Сверить счета и выплатить страховки</span>
          </button>

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={handleReplaceDemoWithReal}
            className="inline-flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/15 px-4 py-2.5 text-xs font-bold text-amber-200 hover:bg-amber-400/25 disabled:opacity-50"
          >
            {busyAction === 'REPLACE_DEMO' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
            )}
            <span>Заменить стартовые демо реальными матчами</span>
          </button>

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={handleRunDiagnostics}
            className="ml-auto inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-bold text-blue-300 hover:bg-white/10 disabled:opacity-50"
          >
            {busyAction === 'DIAG' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Activity className="h-3.5 w-3.5" />
            )}
            <span>Проверить реальные матчи и узлы</span>
          </button>
        </div>

        {/* Блок результатов живой диагностики */}
        {diagnostics && (
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-white">
                Отчет самодиагностики · Серверное время: {diagnostics.mskTimeFormatted}
              </span>
              <span className="font-mono text-blue-300">
                Следующий плановый слот: {diagnostics.nextSlotLabel}
              </span>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {diagnostics.items.map((item) => (
                <div
                  key={item.name}
                  className="flex items-start justify-between gap-2 rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-1.5 font-bold text-white">
                      {item.ok ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-amber-400" />
                      )}
                      <span>{item.name}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-300">{item.details}</p>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-slate-400">
                    {item.latencyMs} мс
                  </span>
                </div>
              ))}
            </div>

            {diagnostics.sampleMatches && diagnostics.sampleMatches.length > 0 && (
              <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-3.5">
                <div className="mb-2.5 flex items-center justify-between gap-2 text-xs font-bold text-emerald-300">
                  <span>
                    Живая проверка: реальные предстоящие матчи в линии прямо сейчас
                  </span>
                  <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] text-emerald-200">
                    Источник: {diagnostics.sampleMatches[0].source}
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {diagnostics.sampleMatches.map((m, i) => (
                    <div
                      key={`${m.matchTitle}_${i}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[10px] text-slate-400">
                          {m.leagueName} · {m.startsAtFormatted} МСК
                        </div>
                        <div className="truncate font-bold text-white">
                          {m.matchTitle}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[11px] font-semibold text-blue-300">
                          {m.market}
                        </div>
                        <div className="font-mono text-xs font-black text-emerald-400">
                          {m.odds.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. ОЧЕРЕДЬ ЧЕРНОВИКОВ ИИ */}
      {drafts.length > 0 && (
        <div className="rounded-2xl border border-blue-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-extrabold text-slate-950">
                Подготовленные прогнозы ИИ на проверку ({drafts.length})
              </h3>
              <p className="text-xs text-slate-500">
                Проверьте аргументацию и опубликуйте матчи в 1 клик
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                await fetch('/api/v1/admin/autopilot', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'APPROVE_ALL_DRAFTS' }),
                });
                onToast('Все черновики ИИ опубликованы на витрину!');
                await onRefresh();
              }}
              className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
            >
              Опубликовать все ({drafts.length})
            </button>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {drafts.map((d) => (
              <div
                key={d.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold">
                    <span className="text-slate-500">{d.leagueName}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-mono text-emerald-800">
                        EV +{d.valueEdgePct.toFixed(1)}%
                      </span>
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 font-mono text-blue-800">
                        Увер. {d.confidencePct}%
                      </span>
                    </div>
                  </div>

                  <div className="mt-1.5 text-base font-black text-slate-950">
                    {d.homeTeam} — {d.awayTeam}
                  </div>

                  <div className="mt-2 rounded-xl border border-blue-100 bg-white p-2.5 text-xs">
                    <div className="font-extrabold text-blue-700">
                      Исход: {d.selectionTitle} @ {d.fixedOdds.toFixed(2)} · Флэт{' '}
                      {d.stakeUnits.toFixed(1)}%
                    </div>
                    <div className="mt-1 text-slate-600">{d.analysisTeaser}</div>
                  </div>

                  <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-slate-500">
                    {d.analysisFull}
                  </p>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-slate-200/80 pt-3">
                  <span className="font-mono text-xs font-bold text-slate-700">
                    {d.accessTier === 'FREE'
                      ? 'Бесплатный открытый разбор'
                      : `${d.singlePriceRub} ₽ ${d.insuredOnLoss ? '· Со страховкой' : ''}`}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busyAction === d.id}
                      onClick={() => handleApproveDraft(d.id)}
                      className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-700"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>На витрину</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDraft(d.id)}
                      className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
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

      {/* 3. НАСТРОЙКИ НЕЙРОСЕТИ И РАСПИСАНИЯ */}
      <div className="grid gap-6 lg:grid-cols-12">
        <form
          onSubmit={handleSaveConfig}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-7"
        >
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-blue-600" />
            <h3 className="text-base font-extrabold text-slate-950">
              Нейросеть-аналитик и расписание выпусков
            </h3>
          </div>

          <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/60 p-3 text-xs text-emerald-900">
            <strong>Сбор линии и результатов (0 ₽/мес):</strong> каскад прямых российских шлюзов{' '}
            <strong>Фонбет РФ → Леон РФ → Резервный Матч-центр</strong> встроен в ядро и работает автоматически без внешних ключей.
          </div>

          {/* Пресеты провайдеров ИИ */}
          <div>
            <label className="text-[11px] font-bold text-slate-500">
              Мозг написания аналитики:
            </label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(
                [
                  ['ORCAROUTER', 'OrcaRouter.ai (Gemini / GPT / Claude / DeepSeek)'],
                  ['DEEPSEEK', 'DeepSeek API (РФ без VPN)'],
                  ['OPENROUTER', 'OpenRouter'],
                  ['RU_GATEWAY', 'ProxyAPI / AITunnel'],
                  ['OPENAI', 'OpenAI'],
                  ['BUILTIN_QUANT', 'Встроенный аналитик (0 ₽, без ключей)'],
                ] as const
              ).map(([prov, label]) => (
                <button
                  key={prov}
                  type="button"
                  onClick={() => handleApplyProviderPreset(prov)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    draftConfig.llmProvider === prov
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {draftConfig.llmProvider !== 'BUILTIN_QUANT' && (
            <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/40 p-3.5">
              {draftConfig.llmProvider === 'ORCAROUTER' && (
                <p className="text-[11px] leading-relaxed text-slate-600">
                  В кабинете{' '}
                  <span className="font-mono font-bold text-slate-900">
                    orcarouter.ai/console/token
                  </span>{' '}
                  нажмите кнопку <strong>«Копировать / Copy»</strong> в строке с вашим ключом{' '}
                  <strong>initial token</strong> (скопируется длинный секретный код на{' '}
                  <span className="font-mono font-bold">sk-...</span>), вставьте его ниже и нажмите{' '}
                  <strong>«Проверить токен и загрузить модели»</strong>.
                </p>
              )}

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-500">
                    API URL шлюза
                  </label>
                  <input
                    value={draftConfig.llmBaseUrl}
                    onChange={(e) =>
                      setDraftConfig({ ...draftConfig, llmBaseUrl: e.target.value })
                    }
                    placeholder="https://www.orcarouter.ai/v1"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500">
                    Модель
                  </label>
                  {availableModels.length > 0 ? (
                    <select
                      value={draftConfig.llmModel}
                      onChange={(e) =>
                        setDraftConfig({ ...draftConfig, llmModel: e.target.value })
                      }
                      className="mt-1 w-full rounded-xl border border-blue-300 bg-white px-2.5 py-2 font-mono text-xs font-bold text-slate-900"
                    >
                      {availableModels.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={draftConfig.llmModel}
                      onChange={(e) =>
                        setDraftConfig({ ...draftConfig, llmModel: e.target.value })
                      }
                      placeholder="gemini-2.5-flash"
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs"
                    />
                  )}
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500">
                    Секретный ключ (sk-...)
                  </label>
                  <input
                    type="password"
                    placeholder="sk-..."
                    value={draftConfig.llmApiKey}
                    onChange={(e) =>
                      setDraftConfig({ ...draftConfig, llmApiKey: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={handleTestLlmAndFetchModels}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {busyAction === 'TEST_LLM' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Activity className="h-3.5 w-3.5" />
                  )}
                  <span>Проверить токен и загрузить модели</span>
                </button>

                {availableModels.length > 0 && (
                  <span className="text-[11px] font-semibold text-emerald-700">
                    Загружено моделей с вашего токена: {availableModels.length} — выберите любую в списке и нажмите «Сохранить параметры ИИ»
                  </span>
                )}
              </div>

              {llmCheckStatus && (
                <div
                  className={`rounded-xl border p-2.5 text-xs font-semibold ${
                    llmCheckStatus.ok
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                      : 'border-amber-200 bg-amber-50 text-amber-900'
                  }`}
                >
                  {llmCheckStatus.message}
                </div>
              )}
            </div>
          )}

          {/* Выбор видов спорта */}
          <div>
            <label className="text-[11px] font-bold text-slate-500">
              Дисциплины для автоотбора:
            </label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {SPORT_OPTIONS.map((sp) => {
                const active = draftConfig.sportsEnabled.includes(sp.id);
                return (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() => toggleSport(sp.id)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                      active
                        ? 'bg-blue-600 text-white'
                        : 'border border-slate-200 bg-slate-50 text-slate-500'
                    }`}
                  >
                    {sp.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Расписание и коммерческие правила ИИ */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="text-[11px] font-bold text-slate-500">
                Утренний слот (МСК)
              </label>
              <input
                type="number"
                min={0}
                max={23}
                value={draftConfig.morningHourMsk}
                onChange={(e) =>
                  setDraftConfig({
                    ...draftConfig,
                    morningHourMsk: Number(e.target.value),
                  })
                }
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs font-bold"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500">
                Вечерний слот (МСК)
              </label>
              <input
                type="number"
                min={0}
                max={23}
                value={draftConfig.eveningHourMsk}
                onChange={(e) =>
                  setDraftConfig({
                    ...draftConfig,
                    eveningHourMsk: Number(e.target.value),
                  })
                }
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs font-bold"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500">
                Матчей за выпуск
              </label>
              <input
                type="number"
                min={1}
                max={8}
                value={draftConfig.maxPicksPerRun}
                onChange={(e) =>
                  setDraftConfig({
                    ...draftConfig,
                    maxPicksPerRun: Number(e.target.value),
                  })
                }
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs font-bold"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500">
                Мин. перевес EV%
              </label>
              <input
                type="number"
                step="0.5"
                min={1}
                max={20}
                value={draftConfig.minValueEdgePct}
                onChange={(e) =>
                  setDraftConfig({
                    ...draftConfig,
                    minValueEdgePct: Number(e.target.value),
                  })
                }
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-500">
                Цена платного прогноза ИИ (₽)
              </label>
              <input
                type="number"
                min={50}
                value={draftConfig.defaultAiPriceRub}
                onChange={(e) =>
                  setDraftConfig({
                    ...draftConfig,
                    defaultAiPriceRub: Number(e.target.value),
                  })
                }
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs font-bold"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500">
                Бесплатный прогрев (каждый N-й, 0 = выкл)
              </label>
              <input
                type="number"
                min={0}
                max={20}
                value={draftConfig.freeEveryNthPick}
                onChange={(e) =>
                  setDraftConfig({
                    ...draftConfig,
                    freeEveryNthPick: Number(e.target.value),
                  })
                }
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs font-bold"
              />
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
            <label className="flex items-center gap-2 text-xs font-bold text-emerald-800">
              <input
                type="checkbox"
                checked={draftConfig.insureAiPicks}
                onChange={(e) =>
                  setDraftConfig({ ...draftConfig, insureAiPicks: e.target.checked })
                }
              />
              <span>Включать «Страховку 100% на баланс» для всех платных прогнозов ИИ</span>
            </label>

            <label className="flex items-center gap-2 text-xs font-bold text-slate-800">
              <input
                type="checkbox"
                checked={draftConfig.autoSettleEnabled}
                onChange={(e) =>
                  setDraftConfig({
                    ...draftConfig,
                    autoSettleEnabled: e.target.checked,
                  })
                }
              />
              <span>
                Автоматически сверять официальный счет после игр и выплачивать страховки
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={busyAction === 'SAVE'}
            className="w-full rounded-xl bg-blue-600 py-3 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
          >
            Сохранить настройки Автопилота
          </button>
        </form>

        {/* Журнал активности ИИ */}
        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600" />
              <h3 className="text-base font-extrabold text-slate-950">
                Журнал работы ИИ-Автопилота
              </h3>
            </div>
            {logs.length > 0 && (
              <button
                type="button"
                onClick={async () => {
                  await fetch('/api/v1/admin/autopilot', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'CLEAR_LOGS' }),
                  });
                  await onRefresh();
                }}
                className="text-[11px] font-semibold text-slate-400 hover:text-slate-700"
              >
                Очистить
              </button>
            )}
          </div>

          <div className="mt-4 max-h-[460px] flex-1 space-y-2.5 overflow-y-auto pr-1">
            {logs.map((log) => (
              <div
                key={log.id}
                className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs"
              >
                <div className="flex items-center justify-between text-[10px] font-bold">
                  <span
                    className={
                      log.level === 'SUCCESS'
                        ? 'text-emerald-600'
                        : log.level === 'ERROR'
                          ? 'text-rose-600'
                          : 'text-blue-600'
                    }
                  >
                    {log.stage}
                  </span>
                  <span className="font-mono text-slate-400">
                    {new Date(log.createdAt).toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="mt-1 leading-relaxed text-slate-700">{log.message}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
