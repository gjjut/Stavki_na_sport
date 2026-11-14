'use client';

import React from 'react';
import {
  Activity,
  Bot,
  CheckCircle2,
  Loader2,
  Play,
  Rocket,
  Send,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { AiAutopilotDiagnostics } from './AiAutopilotDiagnostics';
import type {
  AiAutopilotConfig,
  AiAutopilotMode,
  AiDiagnosticsReport,
  AiPerformanceStats,
} from '@/server/types';

interface AiAutopilotHeroProps {
  draftConfig: AiAutopilotConfig;
  config: AiAutopilotConfig;
  aiStats: AiPerformanceStats;
  draftsCount: number;
  busyAction: string | null;
  diagnostics: AiDiagnosticsReport | null;
  isFullAutopilot: boolean;
  onSaveMode: (mode: AiAutopilotMode) => void;
  onRunScan: (forcePublish: boolean) => void;
  onRunSettlement: () => void;
  onRunDiagnostics: () => void;
  onReplaceDemo: () => void;
  onBroadcastDigest: () => void;
}

export const AiAutopilotHero: React.FC<AiAutopilotHeroProps> = ({
  draftConfig,
  config,
  aiStats,
  draftsCount,
  busyAction,
  diagnostics,
  isFullAutopilot,
  onSaveMode,
  onRunScan,
  onRunSettlement,
  onRunDiagnostics,
  onReplaceDemo,
  onBroadcastDigest,
}) => {
  return (
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
        <p className="mt-2 max-w-2xl text-[10px] leading-relaxed text-amber-200/90">
          Метод: алгоритм предварительно выбирает матч и рынок; его edge/confidence — эвристики, не доказанные вероятности. Одна настроенная AI-модель оценивает кандидата в трёх ролях (не три независимые модели); рынок и коэффициент фиксируются из линии и моделью не переписываются. Выпуск требует подтверждённой линии Фонбет/Леон, минимум двух PASS без VETO и прохождения порогов риска/уверенности/edge. Это не гарантия выигрыша.
        </p>

        {/* Тумблер 3 режимов */}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busyAction !== null}
            aria-pressed={isFullAutopilot}
            onClick={() => onSaveMode('FULL_AUTOPILOT')}
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
            disabled={busyAction !== null}
            aria-pressed={draftConfig.mode === 'MODERATION'}
            onClick={() => onSaveMode('MODERATION')}
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
            disabled={busyAction !== null}
            aria-pressed={draftConfig.mode === 'OFF'}
            onClick={() => onSaveMode('OFF')}
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

      {/* Статистика записей AI-контура с сохранённым отчётом и ID линии */}
      <div className="grid grid-cols-2 gap-3 lg:col-span-5">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[11px] text-slate-400">Yield AI-контура</div>
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
          <div className="text-[11px] text-slate-400">Профит AI-контура к банку</div>
          <div className="mt-1 font-mono text-2xl font-black text-white">
            {aiStats.netProfitUnits >= 0 ? '+' : ''}
            {aiStats.netProfitUnits.toFixed(2)}%
          </div>
          <div className="mt-0.5 text-[10px] text-slate-400">
            Побед: {aiStats.wins} / Минусов: {aiStats.losses}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[11px] text-slate-400">Проходимость AI-контура</div>
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
            {draftsCount}
          </div>
          <div className="mt-0.5 truncate text-[10px] text-slate-400">
            {config.lastFeedSource || `Учтено AI-контуром: ${aiStats.totalAiPredictions}`}
          </div>
        </div>
        <p className="col-span-2 text-[10px] leading-relaxed text-slate-500">
          В статистику попадают только записи с ID линии и сохранённым отчётом ролей; это не аудит production-вызовов модели.
        </p>
      </div>
    </div>

    {/* Панель мгновенного управления и самодиагностики */}
    <div className="mt-6 flex flex-wrap items-center gap-2.5 border-t border-white/10 pt-5">
      <button
        type="button"
        disabled={busyAction !== null}
        onClick={() => onRunScan(false)}
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
          onClick={() => onRunScan(true)}
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
        onClick={onBroadcastDigest}
        className="inline-flex items-center gap-2 rounded-xl border border-blue-400/30 bg-blue-500/15 px-4 py-2.5 text-xs font-bold text-blue-200 hover:bg-blue-500/25 disabled:opacity-50"
      >
        {busyAction === 'DIGEST' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Send className="h-3.5 w-3.5" />
        )}
        <span>Сводка дня в Telegram</span>
      </button>

      <button
        type="button"
        disabled={busyAction !== null}
        onClick={onRunSettlement}
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
        onClick={onReplaceDemo}
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
        onClick={onRunDiagnostics}
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

    {diagnostics && <AiAutopilotDiagnostics diagnostics={diagnostics} />}
  </div>
  );
};
