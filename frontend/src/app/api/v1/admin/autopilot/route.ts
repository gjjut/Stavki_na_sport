import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  approveAiDraftToStorefront,
  broadcastDailyDigestToTelegram,
  replaceDemoWithRealMatches,
  runAiScanAndGenerateCycle,
  runAutopilotDiagnostics,
  runAutoSettlementCycle,
  testLlmConnectionAndModels,
} from '@/server/ai-autopilot';
import {
  mutateState,
  readState,
  StorageUnavailableError,
  toAdminAutopilotDto,
} from '@/server/database';
import { requireAdminAccount } from '@/server/guards';
import { assertLlmKeyMatchesProvider, assertLlmKeyScope, normalizeLlmBaseUrl, validateLlmProvider } from '@/server/llm-config-policy';
import { applyAutopilotConfigPatch } from '@/server/autopilot-config-policy';

function operationError(err: unknown, fallback: string) {
  if (err instanceof StorageUnavailableError) return NextResponse.json({ error: err.message }, { status: 503 });
  const code = err instanceof Error ? err.message : '';
  if (code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Войдите как администратор.' }, { status: 401 });
  if (code === 'BLOCKED' || code === 'FORBIDDEN') return NextResponse.json({ error: 'Доступ только для администратора.' }, { status: 403 });
  return NextResponse.json({ error: code || fallback }, { status: 400 });
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdminAccount();
    const body = (await req.json()) as { config?: unknown };

    const result = await mutateState((state) => {
      const prevMode = state.aiAutopilot.mode;
      const applied = applyAutopilotConfigPatch(state.aiAutopilot, body?.config);
      state.aiAutopilot = applied.config;
      const mode = state.aiAutopilot.mode;
      if (mode !== prevMode) {
        state.aiLogs.unshift({
          id: `ailog_${randomUUID().slice(0, 8)}`,
          createdAt: new Date().toISOString(),
          level: mode === 'FULL_AUTOPILOT' ? 'SUCCESS' : 'INFO',
          stage: 'PUBLISHER',
          message:
            mode === 'FULL_AUTOPILOT'
              ? `Включен полный режим: слоты ${String(
                  state.aiAutopilot.morningHourMsk,
                ).padStart(2, '0')}:00 и ${String(
                  state.aiAutopilot.eveningHourMsk,
                ).padStart(2, '0')}:00 МСК. Выпуск зависит от линии, модели и планировщика.`
              : mode === 'MODERATION'
                ? 'Включен режим «Премодерация черновиков».'
                : 'Автопилот переведен в режим паузы (OFF).',
        });
      }
      return applied;
    });

    return NextResponse.json({
      aiAutopilot: toAdminAutopilotDto(result.config),
      keySavedNow: result.keySavedNow,
    });
  } catch (err) {
    return operationError(err, 'Ошибка сохранения автопилота');
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminAccount();
    const body = (await req.json()) as
      | { action: 'RUN_SCAN_NOW'; forcePublish?: boolean }
      | { action: 'REPLACE_DEMO_WITH_REAL' }
      | { action: 'BROADCAST_DAILY_DIGEST' }
      | { action: 'RUN_SETTLE_NOW' }
      | { action: 'RUN_DIAGNOSTICS' }
      | {
          action: 'TEST_LLM';
          llmProvider: string;
          llmBaseUrl: string;
          llmApiKey: string;
          llmModel: string;
        }
      | { action: 'APPROVE_DRAFT'; draftId: string }
      | { action: 'APPROVE_ALL_DRAFTS' }
      | { action: 'DELETE_DRAFT'; draftId: string }
      | { action: 'CLEAR_LOGS' };

    if (body.action === 'TEST_LLM') {
      if (typeof body.llmProvider !== 'string' || typeof body.llmBaseUrl !== 'string' ||
          typeof body.llmApiKey !== 'string' || typeof body.llmModel !== 'string') {
        throw new Error('Заполните провайдера, адрес и модель.');
      }
      validateLlmProvider(body.llmProvider);
      if (body.llmProvider === 'BUILTIN_QUANT') throw new Error('Для проверки выберите внешнего провайдера.');
      const provider = body.llmProvider;
      const base = normalizeLlmBaseUrl(body.llmBaseUrl, provider);
      const model = body.llmModel.trim();
      if (!model) throw new Error('Укажите точный ID модели.');
      const submittedKey = body.llmApiKey.trim();
      if (submittedKey && (submittedKey.length <= 8 || /\s/.test(submittedKey))) {
        throw new Error('API-ключ выглядит некорректно; он не сохранён.');
      }
      const stateBeforeTest = await readState();
      const savedKey = stateBeforeTest.aiAutopilot.llmApiKey.trim();
      assertLlmKeyScope(stateBeforeTest.aiAutopilot, { llmProvider: provider, llmBaseUrl: base }, submittedKey);
      const keyForTest = submittedKey || savedKey;
      if (!keyForTest) throw new Error('Введите API-ключ для выбранного провайдера.');
      assertLlmKeyMatchesProvider(keyForTest, provider);

      const result = await testLlmConnectionAndModels({
        llmProvider: provider, llmBaseUrl: base, llmApiKey: keyForTest, llmModel: model,
      });
      // The button says “test and save”: persist the selected configuration even
      // when reusing an existing key or when the single probe fails.
      await mutateState((state) => {
        assertLlmKeyScope(state.aiAutopilot, { llmProvider: provider, llmBaseUrl: base }, submittedKey);
        if (!submittedKey && state.aiAutopilot.llmApiKey.trim() !== savedKey) {
          throw new Error('Ключ изменился во время проверки. Проверьте настройки и запустите проверку заново.');
        }
        state.aiAutopilot.llmProvider = provider;
        state.aiAutopilot.llmBaseUrl = base;
        state.aiAutopilot.llmApiKey = submittedKey || state.aiAutopilot.llmApiKey;
        state.aiAutopilot.llmModel = model;
        state.aiAutopilot.runRevision = randomUUID();
      });
      return NextResponse.json({
        ...result,
        keySaved: true,
        keySavedNow: Boolean(submittedKey),
        keyConfigured: true,
        configSaved: true,
      });
    }

    if (body.action === 'RUN_DIAGNOSTICS') {
      const report = await runAutopilotDiagnostics();
      return NextResponse.json({ report });
    }

    if (body.action === 'REPLACE_DEMO_WITH_REAL') {
      const res = await replaceDemoWithRealMatches();
      return NextResponse.json(res);
    }

    if (body.action === 'BROADCAST_DAILY_DIGEST') {
      const res = await broadcastDailyDigestToTelegram();
      if (!res.sent) {
        return NextResponse.json(
          { error: res.error, outcome: res.outcome },
          { status: res.outcome === 'unknown' ? 502 : 400 },
        );
      }
      return NextResponse.json({ ok: true, warning: res.warning });
    }

    if (body.action === 'RUN_SCAN_NOW') {
      const res = await runAiScanAndGenerateCycle({
        forcePublish: body.forcePublish,
        triggerLabel: 'Ручной запуск из админ-панели',
      });
      return NextResponse.json(res);
    }

    if (body.action === 'RUN_SETTLE_NOW') {
      const res = await runAutoSettlementCycle();
      return NextResponse.json(res);
    }

    if (body.action === 'APPROVE_DRAFT') {
      const created = await approveAiDraftToStorefront(body.draftId);
      return NextResponse.json({ prediction: created });
    }

    if (body.action === 'APPROVE_ALL_DRAFTS') {
      const state = await readState();
      const drafts = state.aiDrafts;
      let approvedCount = 0;
      const failedDrafts: Array<{ id: string; error: string }> = [];
      for (const draft of drafts) {
        try {
          await approveAiDraftToStorefront(draft.id);
          approvedCount += 1;
        } catch (err) {
          failedDrafts.push({
            id: draft.id,
            error: err instanceof Error ? err.message : 'Не удалось проверить и выпустить черновик',
          });
        }
      }
      return NextResponse.json({
        requestedCount: drafts.length,
        approvedCount,
        failedDrafts,
        complete: drafts.length > 0 && failedDrafts.length === 0,
      });
    }

    if (body.action === 'DELETE_DRAFT') {
      await mutateState((s) => {
        s.aiDrafts = s.aiDrafts.filter((d) => d.id !== body.draftId);
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'CLEAR_LOGS') {
      await mutateState((s) => {
        s.aiLogs = [];
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 });
  } catch (err) {
    return operationError(err, 'Ошибка выполнения операции ИИ');
  }
}
