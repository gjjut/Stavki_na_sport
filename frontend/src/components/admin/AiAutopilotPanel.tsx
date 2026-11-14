'use client';

import React, { useEffect, useState } from 'react';
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
  const [draftConfig, setDraftConfig] = useState<AiAutopilotConfig>(config);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<AiDiagnosticsReport | null>(null);
  const [confirmation, setConfirmation] = useState<{ type: 'draft'; id: string } | { type: 'logs' } | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [llmCheckStatus, setLlmCheckStatus] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    setDraftConfig(config);
  }, [config]);

  const saveModeImmediately = async (nextMode: AiAutopilotMode) => {
    const previousConfig = draftConfig;
    setBusyAction('MODE');
    try {
      const updated = { ...draftConfig, mode: nextMode };
      setDraftConfig(updated);
      const res = await fetch('/api/v1/admin/autopilot', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { mode: nextMode } }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || `Не удалось сохранить режим (HTTP ${res.status})`);
      onToast(
        nextMode === 'FULL_AUTOPILOT'
          ? 'Полный автопилот 24/7 включён.'
          : nextMode === 'MODERATION'
            ? 'Включен режим премодерации черновиков ИИ.'
            : 'ИИ-Автопилот поставлен на паузу.',
      );
      await onRefresh();
    } catch (err) {
      setDraftConfig(previousConfig);
      onToast(err instanceof Error ? err.message : 'Не удалось сохранить режим автопилота', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleApplyProviderPreset = (provider: AiLlmProvider) => {
    setLlmCheckStatus(null);
    setAvailableModels([]);
    if (provider === 'PLUSVIBE') {
      setDraftConfig({
        ...draftConfig,
        llmProvider: 'PLUSVIBE',
        llmBaseUrl: 'https://plusvibeapi.ru/v1',
        llmModel: 'deepseek-v4.1-flash-1017',
      });
    } else if (provider === 'OLLAMA') {
      setDraftConfig({
        ...draftConfig,
        llmProvider: 'OLLAMA',
        llmBaseUrl: 'https://ollama.com/v1',
        llmModel: 'deepseek-v4.1-flash',
      });
    } else if (provider === 'ORCAROUTER') {
      setDraftConfig({
        ...draftConfig,
        llmProvider: 'ORCAROUTER',
        llmBaseUrl: 'https://www.orcarouter.ai/v1',
        llmModel: 'deepseek/deepseek-v4.1-flash-free',
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
      };
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
        message: `${json.message || json.error || 'Проверка завершена'} ${keyPersistenceNote}`,
      });
      if (
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
        body: JSON.stringify({ config: draftConfig }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        keySavedNow?: boolean;
      };
      if (!res.ok) throw new Error(json.error || `Не удалось сохранить настройки (HTTP ${res.status})`);
      if (json.keySavedNow) {
        setDraftConfig((prev) => ({
          ...prev,
          llmApiKey: '',
          llmApiKeyConfigured: true,
        }));
      }
      onToast(
        json.keySavedNow
          ? 'Настройки сохранены. Новый API-ключ отдельно сохранён на сервере; доступность модели этим действием не проверялась.'
          : 'Настройки ИИ-Автопилота и расписания сохранены!',
      );
      await onRefresh();
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
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || `Сканирование не выполнено (HTTP ${res.status})`);
      const createdCount = Number(json.createdCount) || 0;
      if (createdCount > 0) {
        onToast(
          json.publishedDirectly
            ? `Опубликовано прогнозов: ${createdCount} (${json.feedSource}).`
            : `Подготовлено черновиков: ${createdCount} (${json.feedSource}).`,
        );
      } else {
        onToast(
          `Прогнозов не создано: реальных кандидатов, прошедших проверку, нет (обработано событий: ${Number(json.scannedCount) || 0}; ${json.feedSource}).`,
        );
      }
      await onRefresh();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Не удалось выполнить сканирование', 'error');
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
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || `Сверка результатов не выполнена (HTTP ${res.status})`);
      onToast(
        (json.settledCount ?? 0) > 0
          ? `По подтверждённым источникам рассчитано матчей: ${json.settledCount}; страховок выплачено: ${json.compensatedBuyers ?? 0}.`
          : `Новых расчётов нет. Проверено событий: ${json.checkedCount ?? 0}; неподтверждённые и неоднозначные исходы оставлены без расчёта.`,
      );
      await onRefresh();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Не удалось выполнить сверку результатов', 'error');
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
        error?: string;
      };
      if (res.ok) {
        const removedCount = Number(json.removedDemoCount) || 0;
        const createdCount = Number(json.createdCount) || 0;
        const scannedCount = Number(json.scannedCount) || 0;
        onToast(
          createdCount > 0
            ? `Удалено демо-карточек: ${removedCount}. Сканировано: ${scannedCount}; опубликовано реальных прогнозов: ${createdCount} (${json.feedSource}).`
            : `Удалено демо-карточек: ${removedCount}. Реальных прогнозов не опубликовано: сканирование проверило ${scannedCount} событий и не нашло прошедших кандидатов (${json.feedSource}).`,
        );
        await onRefresh();
      } else {
        onToast(json.error || `Не удалось заменить демо-карточки (HTTP ${res.status})`, 'error');
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Не удалось заменить демо-карточки', 'error');
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
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || 'Не удалось отправить сводку в Telegram');
      onToast('Сводка свежих матчей и открытой статистики опубликована в Telegram-канале!');
      await onRefresh();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Не удалось отправить сводку в Telegram', 'error');
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
        busyAction={busyAction}
        diagnostics={diagnostics}
        isFullAutopilot={isFullAutopilot}
        onSaveMode={saveModeImmediately}
        onRunScan={handleRunScan}
        onRunSettlement={handleRunSettlement}
        onRunDiagnostics={handleRunDiagnostics}
        onReplaceDemo={handleReplaceDemoWithReal}
        onBroadcastDigest={handleBroadcastDigest}
      />

      <AiAutopilotDrafts
        drafts={drafts}
        busyAction={busyAction}
        onApprove={handleApproveDraft}
        onDelete={(id) => setConfirmation({ type: 'draft', id })}
        onApproveAll={handleApproveAllDrafts}
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <AiAutopilotConfigForm
          draftConfig={draftConfig}
          setDraftConfig={setDraftConfig}
          busyAction={busyAction}
          availableModels={availableModels}
          llmCheckStatus={llmCheckStatus}
          onApplyProviderPreset={handleApplyProviderPreset}
          onTestLlm={handleTestLlmAndFetchModels}
          onToggleSport={toggleSport}
          onSaveConfig={handleSaveConfig}
        />
        <AiAutopilotLogs logs={logs} busyAction={busyAction} onClearLogs={() => setConfirmation({ type: 'logs' })} />
      </div>

      <ConfirmDialog
        open={confirmation !== null}
        title={confirmation?.type === 'draft' ? 'Удалить черновик?' : 'Очистить журнал?'}
        description={confirmation?.type === 'draft'
          ? 'Черновик будет удалён без публикации. Это действие нельзя отменить.'
          : 'Все записи журнала автопилота будут удалены. Это действие нельзя отменить.'}
        confirmLabel={confirmation?.type === 'draft' ? 'Удалить' : 'Очистить'}
        busy={busyAction !== null}
        onCancel={() => { if (!busyAction) setConfirmation(null); }}
        onConfirm={() => {
          if (busyAction || !confirmation) return;
          if (confirmation.type === 'draft') void handleDeleteDraft(confirmation.id);
          else void handleClearLogs();
        }}
      />
    </div>
  );
};
