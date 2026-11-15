'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from './ui';
import { AiAutopilotConfigForm } from './AiAutopilotConfig';
import { AiAutopilotDrafts } from './AiAutopilotDrafts';
import { AiAutopilotHero } from './AiAutopilotHero';
import { AiAutopilotLogs } from './AiAutopilotLogs';
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
  onToast: (msg: string, kind?: 'success' | 'error') => void;
}

export const AiAutopilotPanel: React.FC<AiAutopilotPanelProps> = ({
  config,
  drafts,
  logs,
  aiStats,
  onRefresh,
  onToast,
}) => {
  const [draftConfig, setDraftConfigState] = useState<AiAutopilotConfig>(config);
  const dirtyRef = useRef(false);
  const [configDirty, setConfigDirty] = useState(false);
  const setDraftConfig = useCallback<React.Dispatch<React.SetStateAction<AiAutopilotConfig>>>((update) => {
    dirtyRef.current = true;
    setConfigDirty(true);
    setDraftConfigState(update);
  }, []);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [modeBusy, setModeBusy] = useState(false);
  const effectiveBusyAction = busyAction ?? (modeBusy ? 'MODE' : null);
  const [diagnostics, setDiagnostics] = useState<AiDiagnosticsReport | null>(null);
  const [confirmation, setConfirmation] = useState<{ type: 'draft'; id: string } | { type: 'logs' | 'legacy' } | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [llmCheckStatus, setLlmCheckStatus] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!dirtyRef.current) {
      setDraftConfigState(config);
    } else {
      // Refresh status without discarding edits that have not been saved.
      setDraftConfigState((draft) => ({
        ...draft,
        mode: config.mode,
        llmApiKeyConfigured: config.llmApiKeyConfigured,
        totalGeneratedCount: config.totalGeneratedCount,
        lastFeedSource: config.lastFeedSource,
        lastMorningRunDate: config.lastMorningRunDate,
        lastEveningRunDate: config.lastEveningRunDate,
        lastScanAt: config.lastScanAt,
        lastSettleAt: config.lastSettleAt,
      }));
    }
  }, [config]);

  const saveModeImmediately = async (nextMode: AiAutopilotMode) => {
    if (modeBusy) return;
    setModeBusy(true);
    try {
      const res = await fetch('/api/v1/admin/autopilot', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { mode: nextMode } }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || `Не удалось сохранить режим (HTTP ${res.status})`);
      // A mode change is independent of unsaved form edits and of any running scan.
      setDraftConfigState((current) => ({ ...current, mode: nextMode }));
      onToast(
        nextMode === 'FULL_AUTOPILOT'
          ? 'Полный режим включён; выпуски зависят от линии, модели и планировщика.'
          : nextMode === 'MODERATION'
            ? 'Включен режим премодерации черновиков ИИ.'
            : 'Пауза сохранена: не завершившиеся сборы остановятся до создания оставшихся событий. Уже опубликованное не отменяется.',
      );
      try { await onRefresh(); } catch { onToast('Режим сохранён, но панель не обновилась. Обновите страницу.', 'error'); }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Не удалось сохранить режим автопилота', 'error');
    } finally {
      setModeBusy(false);
    }
  };

  const handleApplyProviderPreset = (provider: AiLlmProvider) => {
    setLlmCheckStatus(null);
    setAvailableModels([]);
    if (provider === 'PLUSVIBE') {
      setDraftConfig({
        ...draftConfig,
        llmApiKey: '',
        llmProvider: 'PLUSVIBE',
        llmBaseUrl: 'https://plusvibeapi.ru/v1',
        llmModel: 'deepseek-v4.1-flash',
      });
    } else if (provider === 'OLLAMA') {
      setDraftConfig({
        ...draftConfig,
        llmApiKey: '',
        llmProvider: 'OLLAMA',
        llmBaseUrl: 'https://ollama.com/v1',
        llmModel: 'deepseek-v4.1-flash',
      });
    } else if (provider === 'ORCAROUTER') {
      setDraftConfig({
        ...draftConfig,
        llmApiKey: '',
        llmProvider: 'ORCAROUTER',
        llmBaseUrl: 'https://www.orcarouter.ai/v1',
        llmModel: 'deepseek/deepseek-v4.1-flash-free',
      });
    } else if (provider === 'DEEPSEEK') {
      setDraftConfig({
        ...draftConfig,
        llmApiKey: '',
        llmProvider: 'DEEPSEEK',
        llmBaseUrl: 'https://api.deepseek.com/v1',
        llmModel: 'deepseek-chat',
      });
    } else if (provider === 'OPENROUTER') {
      setDraftConfig({
        ...draftConfig,
        llmApiKey: '',
        llmProvider: 'OPENROUTER',
        llmBaseUrl: 'https://openrouter.ai/api/v1',
        llmModel: 'deepseek/deepseek-chat',
      });
    } else if (provider === 'RU_GATEWAY') {
      setDraftConfig({
        ...draftConfig,
        llmApiKey: '',
        llmProvider: 'RU_GATEWAY',
        llmBaseUrl: 'https://api.proxyapi.ru/openai/v1',
        llmModel: 'gpt-4o-mini',
      });
    } else if (provider === 'OPENAI') {
      setDraftConfig({
        ...draftConfig,
        llmApiKey: '',
        llmProvider: 'OPENAI',
        llmBaseUrl: 'https://api.openai.com/v1',
        llmModel: 'gpt-4o-mini',
      });
    } else {
      setDraftConfig({
        ...draftConfig,
        llmApiKey: '',
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
        detectedProvider?: AiLlmProvider;
        resolvedBaseUrl?: string;
        testedModel?: string;
        availableModels?: string[];
        balanceRub?: number | null;
        message?: string;
        error?: string;
        keySaved?: boolean;
        keySavedNow?: boolean;
        keyConfigured?: boolean;
        configSaved?: boolean;
      };
      if (!res.ok) throw new Error(json.error || `Не удалось проверить настройки (HTTP ${res.status})`);
      if (Array.isArray(json.availableModels) && json.availableModels.length > 0) {
        setAvailableModels(json.availableModels);
      }
      if (json.detectedProvider || json.resolvedBaseUrl || json.testedModel) {
        setDraftConfig((prev) => ({
          ...prev,
          llmProvider: json.detectedProvider || prev.llmProvider,
          llmBaseUrl: json.resolvedBaseUrl || prev.llmBaseUrl,
          llmModel: json.testedModel || prev.llmModel,
        }));
      }
      if (json.keySavedNow) {
        setDraftConfig((prev) => ({
          ...prev,
          llmApiKey: '',
          llmApiKeyConfigured: true,
        }));
      }
      const keyPersistenceNote = json.keySavedNow
        ? 'Новый ключ сохранён на сервере.'
        : json.keySaved
          ? 'Использован ранее сохранённый ключ; он остаётся на сервере.'
          : 'Ключ на сервере не сохранён.';
      setLlmCheckStatus({
        ok: Boolean(json.ok),
        message: `${json.message || json.error || 'Проверка завершена'} ${keyPersistenceNote}${json.configSaved ? ' Выбранные провайдер, адрес и модель сохранены.' : ''}`,
      });
      if (
        json.configSaved ||
        json.keySavedNow ||
        json.ok ||
        (Array.isArray(json.availableModels) && json.availableModels.length > 0)
      ) {
        await onRefresh();
      }
    } catch (err) {
      setLlmCheckStatus({
        ok: false,
        message: err instanceof Error ? err.message : 'Не удалось проверить соединение с моделью',
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
        // Never send counters, timestamps or a stale mode back as editable settings.
        body: JSON.stringify({ config: {
          llmProvider: draftConfig.llmProvider,
          llmBaseUrl: draftConfig.llmBaseUrl,
          llmApiKey: draftConfig.llmApiKey,
          llmModel: draftConfig.llmModel,
          sportsEnabled: draftConfig.sportsEnabled,
          morningHourMsk: draftConfig.morningHourMsk,
          eveningHourMsk: draftConfig.eveningHourMsk,
          maxPicksPerRun: draftConfig.maxPicksPerRun,
          minActiveOnStorefront: draftConfig.minActiveOnStorefront,
          minValueEdgePct: draftConfig.minValueEdgePct,
          minAgentConfidencePct: draftConfig.minAgentConfidencePct ?? 60,
          defaultAiPriceRub: draftConfig.defaultAiPriceRub,
          freeEveryNthPick: draftConfig.freeEveryNthPick,
          insureAiPicks: draftConfig.insureAiPicks,
          autoSettleEnabled: draftConfig.autoSettleEnabled,
          openSourceResearchEnabled: draftConfig.openSourceResearchEnabled !== false,
        } }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        keySavedNow?: boolean;
      };
      if (!res.ok) throw new Error(json.error || `Не удалось сохранить настройки (HTTP ${res.status})`);
      if (json.keySavedNow) {
        setDraftConfigState((prev) => ({
          ...prev,
          llmApiKey: '',
          llmApiKeyConfigured: true,
        }));
      }
      dirtyRef.current = false;
      setConfigDirty(false);
      onToast(
        json.keySavedNow
          ? 'Настройки сохранены. Новый API-ключ отдельно сохранён на сервере; доступность модели этим действием не проверялась.'
          : 'Настройки ИИ-Автопилота и расписания сохранены!',
      );
      try { await onRefresh(); } catch { onToast('Настройки сохранены, но панель не обновилась. Обновите страницу.', 'error'); }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Не удалось сохранить настройки автопилота', 'error');
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
      const json = (await res.json().catch(() => ({}))) as {
        createdCount?: number;
        scannedCount?: number;
        publishedDirectly?: boolean;
        feedSource?: string;
        warning?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || `Сканирование не выполнено (HTTP ${res.status})`);
      const createdCount = Number(json.createdCount) || 0;
      const message = createdCount > 0
        ? json.publishedDirectly
          ? `Опубликовано прогнозов: ${createdCount} (${json.feedSource}). Статус анонсов Telegram смотрите в журнале и канале.`
          : `Подготовлено черновиков: ${createdCount} (${json.feedSource}).`
        : `Прогнозов не создано (обработано событий: ${Number(json.scannedCount) || 0}; ${json.feedSource}). Причины — в журнале.`;
      onToast(`${message}${json.warning ? ` ${json.warning}` : ''}`, json.warning ? 'error' : undefined);
      try { await onRefresh(); } catch { onToast('Результат получен, но панель не обновилась. Обновите страницу.', 'error'); }
    } catch (err) {
      onToast(`${err instanceof Error ? err.message : 'Нет ответа сервера'}. Итог сбора не подтверждён: проверьте витрину и черновики перед повтором.`, 'error');
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
      const json = (await res.json().catch(() => ({}))) as {
        settledCount?: number;
        compensatedBuyers?: number;
        checkedCount?: number;
        warning?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || `Сверка результатов не выполнена (HTTP ${res.status})`);
      const message = (json.settledCount ?? 0) > 0
        ? `По подтверждённым источникам рассчитано матчей: ${json.settledCount}; начислений страховки на баланс: ${json.compensatedBuyers ?? 0}. Статус Telegram смотрите в журнале и канале.`
        : `Новых расчётов нет. Проверено событий: ${json.checkedCount ?? 0}; неподтверждённые и неоднозначные исходы оставлены без расчёта.`;
      onToast(`${message}${json.warning ? ` ${json.warning}` : ''}`, json.warning ? 'error' : undefined);
      await onRefresh();
    } catch (err) {
      onToast(`${err instanceof Error ? err.message : 'Нет ответа сервера'}. Проверьте результаты и балансы перед повтором.`, 'error');
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
      const json = (await res.json().catch(() => ({}))) as {
        report?: AiDiagnosticsReport;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || `Диагностика не выполнена (HTTP ${res.status})`);
      if (!json.report) throw new Error('Сервер не вернул отчёт диагностики');
      setDiagnostics(json.report);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Не удалось выполнить диагностику', 'error');
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
      const json = (await res.json().catch(() => ({}))) as {
        removedDemoCount?: number;
        createdCount?: number;
        scannedCount?: number;
        feedSource?: string;
        warning?: string;
        error?: string;
      };
      if (res.ok) {
        const removedCount = Number(json.removedDemoCount) || 0;
        const createdCount = Number(json.createdCount) || 0;
        const scannedCount = Number(json.scannedCount) || 0;
        const message = createdCount > 0
          ? `Удалено демо-карточек: ${removedCount}. Сканировано: ${scannedCount}; опубликовано прогнозов: ${createdCount} (${json.feedSource}).`
          : `Удалено демо-карточек: ${removedCount}. Реальных прогнозов не опубликовано; проверено событий: ${scannedCount} (${json.feedSource}).`;
        onToast(`${message}${json.warning ? ` ${json.warning}` : ''}`, json.warning ? 'error' : undefined);
        try { await onRefresh(); } catch { onToast('Результат получен, но панель не обновилась. Обновите страницу.', 'error'); }
      } else {
        onToast(`${json.error || `Ошибка операции (HTTP ${res.status})`}. Проверьте витрину и журнал перед повтором: часть операции могла выполниться.`, 'error');
      }
    } catch (err) {
      onToast(`${err instanceof Error ? err.message : 'Нет ответа сервера'}. Проверьте витрину и журнал перед повтором: часть операции могла выполниться.`, 'error');
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
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || `Не удалось выпустить прогноз (HTTP ${res.status})`);
      onToast('Прогноз ИИ опубликован на витрине и зафиксирован SHA-256!');
      await onRefresh();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Не удалось выпустить прогноз', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteDraft = async (draftId: string) => {
    setBusyAction(`DELETE:${draftId}`);
    try {
      const res = await fetch('/api/v1/admin/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'DELETE_DRAFT', draftId }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || `Не удалось удалить черновик (HTTP ${res.status})`);
      setConfirmation(null);
      onToast('Черновик удалён.');
      await onRefresh();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Не удалось удалить черновик', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleApproveAllDrafts = async () => {
    setBusyAction('APPROVE_ALL');
    try {
      const res = await fetch('/api/v1/admin/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'APPROVE_ALL_DRAFTS' }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        requestedCount?: number;
        approvedCount?: number;
        failedDrafts?: Array<{ id: string; error: string }>;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || `Ошибка выпуска (HTTP ${res.status})`);
      const requestedCount = json.requestedCount ?? 0;
      const approvedCount = json.approvedCount ?? 0;
      const failedDrafts = json.failedDrafts ?? [];
      const message =
        requestedCount === 0
          ? 'Черновиков нет — публикация не выполнялась.'
          : `Опубликовано ${approvedCount} из ${requestedCount} черновиков.${
              failedDrafts.length > 0
                ? ` Не выпущено ${failedDrafts.length}: ${failedDrafts
                    .slice(0, 2)
                    .map((item) => item.error)
                    .join('; ')}`
                : ''
            }`;
      onToast(message);
      await onRefresh();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Не удалось выпустить черновики', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleBroadcastDigest = async () => {
    setBusyAction('DIGEST');
    try {
      const res = await fetch('/api/v1/admin/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'BROADCAST_DAILY_DIGEST' }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; warning?: string };
      if (!res.ok) {
        onToast(json.error || 'Ответ сервера не получен. Итог публикации неизвестен: проверьте канал перед повтором.', 'error');
        return;
      }
      if (json.ok !== true) {
        onToast('Подтверждение публикации не получено. Проверьте канал перед повтором.', 'error');
        return;
      }
      onToast(`Сводка опубликована в Telegram-канале!${json.warning ? ` ${json.warning}` : ''}`);
      try {
        await onRefresh();
      } catch {
        onToast('Публикация подтверждена, но панель не обновилась. Обновите страницу.', 'error');
      }
    } catch {
      onToast('Нет ответа сервера. Итог публикации неизвестен: проверьте канал перед повтором.', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const isFullAutopilot = draftConfig.mode === 'FULL_AUTOPILOT';

  const handleClearLogs = async () => {
    setBusyAction('CLEAR_LOGS');
    try {
      const res = await fetch('/api/v1/admin/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CLEAR_LOGS' }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || `Не удалось очистить журнал (HTTP ${res.status})`);
      setConfirmation(null);
      onToast('Журнал очищен.');
      await onRefresh();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Не удалось очистить журнал', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-6">
      <AiAutopilotHero
        draftConfig={draftConfig}
        config={config}
        aiStats={aiStats}
        draftsCount={drafts.length}
        busyAction={effectiveBusyAction}
        modeBusy={modeBusy}
        diagnostics={diagnostics}
        isFullAutopilot={isFullAutopilot}
        onSaveMode={saveModeImmediately}
        onRunScan={handleRunScan}
        onRunSettlement={handleRunSettlement}
        onRunDiagnostics={handleRunDiagnostics}
        onReplaceDemo={() => setConfirmation({ type: 'legacy' })}
        onBroadcastDigest={handleBroadcastDigest}
      />

      <AiAutopilotDrafts
        drafts={drafts}
        busyAction={effectiveBusyAction}
        onApprove={handleApproveDraft}
        onDelete={(id) => setConfirmation({ type: 'draft', id })}
        onApproveAll={handleApproveAllDrafts}
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <AiAutopilotConfigForm
          draftConfig={draftConfig}
          setDraftConfig={setDraftConfig}
          busyAction={effectiveBusyAction}
          configDirty={configDirty}
          availableModels={availableModels}
          llmCheckStatus={llmCheckStatus}
          onApplyProviderPreset={handleApplyProviderPreset}
          onConnectionChange={() => { setAvailableModels([]); setLlmCheckStatus(null); }}
          onTestLlm={handleTestLlmAndFetchModels}
          onToggleSport={toggleSport}
          onSaveConfig={handleSaveConfig}
        />
        <AiAutopilotLogs logs={logs} busyAction={effectiveBusyAction} onClearLogs={() => setConfirmation({ type: 'logs' })} />
      </div>

      <ConfirmDialog
        open={confirmation !== null}
        title={confirmation?.type === 'draft' ? 'Удалить черновик?' : confirmation?.type === 'legacy' ? 'Очистить старые демо и запустить выпуск?' : 'Очистить журнал?'}
        description={confirmation?.type === 'draft'
          ? 'Черновик будет удалён без публикации. Это действие нельзя отменить.'
          : confirmation?.type === 'legacy'
            ? 'Удаляются только старые демо без привязки к доступу и какой-либо истории заказов. Остальные скрыты с витрины. Затем запустится проверенный сбор с возможной немедленной публикацией, даже если автопилот на паузе.'
            : 'Все записи журнала автопилота будут удалены. Это действие нельзя отменить.'}
        confirmLabel={confirmation?.type === 'draft' ? 'Удалить' : confirmation?.type === 'legacy' ? 'Очистить и запустить выпуск' : 'Очистить'}
        busy={effectiveBusyAction !== null}
        onCancel={() => { if (!effectiveBusyAction) setConfirmation(null); }}
        onConfirm={() => {
          if (effectiveBusyAction || !confirmation) return;
          if (confirmation.type === 'draft') void handleDeleteDraft(confirmation.id);
          else if (confirmation.type === 'legacy') { setConfirmation(null); void handleReplaceDemoWithReal(); }
          else void handleClearLogs();
        }}
      />
    </div>
  );
};
