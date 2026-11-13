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
import { mutateState, readState } from '@/server/database';
import { requireAdminAccount } from '@/server/guards';
import type { AiAutopilotConfig } from '@/server/types';

export async function PATCH(req: NextRequest) {
  try {
    await requireAdminAccount();
    const body = (await req.json()) as {
      config: Partial<AiAutopilotConfig>;
    };

    const nextConfig = await mutateState((state) => {
      const prevMode = state.aiAutopilot.mode;
      const incoming = { ...body.config };
      if (
        typeof incoming.llmBaseUrl === 'string' &&
        incoming.llmBaseUrl.includes('/console')
      ) {
        try {
          const parsed = new URL(incoming.llmBaseUrl.trim());
          incoming.llmBaseUrl = `${parsed.origin}/v1`;
        } catch {
          // оставляем как есть
        }
      }
      state.aiAutopilot = {
        ...state.aiAutopilot,
        ...incoming,
      };
      if (body.config.mode && body.config.mode !== prevMode) {
        state.aiLogs.unshift({
          id: `ailog_${randomUUID().slice(0, 8)}`,
          createdAt: new Date().toISOString(),
          level: body.config.mode === 'FULL_AUTOPILOT' ? 'SUCCESS' : 'INFO',
          stage: 'PUBLISHER',
          message:
            body.config.mode === 'FULL_AUTOPILOT'
              ? `Включен режим «ПОЛНЫЙ АВТОПИЛОТ 24/7» (слоты ${String(
                  state.aiAutopilot.morningHourMsk,
                ).padStart(2, '0')}:00 и ${String(
                  state.aiAutopilot.eveningHourMsk,
                ).padStart(2, '0')}:00 МСК + автосверка счетов и выплата страховок).`
              : body.config.mode === 'MODERATION'
                ? 'Включен режим «Премодерация черновиков».'
                : 'Модуль ИИ-Автопилота переведен в режим паузы (OFF).',
        });
      }
      return state.aiAutopilot;
    });

    return NextResponse.json({ aiAutopilot: nextConfig });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка сохранения автопилота' },
      { status: 400 },
    );
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
      const result = await testLlmConnectionAndModels({
        llmProvider: body.llmProvider,
        llmBaseUrl: body.llmBaseUrl,
        llmApiKey: body.llmApiKey,
        llmModel: body.llmModel,
      });
      return NextResponse.json(result);
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
          { error: res.error || 'Укажите токен бота и ID канала во вкладке «ЮKassa, Telegram и Реквизиты»' },
          { status: 400 },
        );
      }
      return NextResponse.json({ ok: true });
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
      let count = 0;
      for (const d of state.aiDrafts) {
        await approveAiDraftToStorefront(d.id);
        count += 1;
      }
      return NextResponse.json({ approvedCount: count });
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка выполнения операции ИИ' },
      { status: 400 },
    );
  }
}
