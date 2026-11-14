import { randomUUID } from 'node:crypto';
import {
  approveAiDraftToStorefront,
  broadcastDailyDigestToTelegram,
  buildCandidateLlmBaseUrls,
  isNonChatModelId,
  postLlmChatCompletion,
  prioritizeModelsFreeFirst,
  replaceDemoWithRealMatches,
  runAiScanAndGenerateCycle,
  runAutoSettlementCycle,
} from './ai-autopilot';
import {
  gatherMatchOpenSourceIntel,
  searchOpenSourcesForAdmin,
} from './ai-research';
import {
  computeAiPerformanceStats,
  computePlatformAnalytics,
  hasVerifiedSettledResult,
  mutateState,
  readState,
} from './database';
import { sendTelegramChannelAnnouncement } from './integrations';
import { deleteUnownedPrediction } from './admin-prediction-policy';
import {
  extractRawAdminAgentActions,
  formatAdminMatchScanSummary,
  isAdminMutationIntent,
  isDraftOnlyMatchCollectionIntent,
  isMatchCollectionIntent,
  parseStructuredAgentJson,
  resolveAdminAgentActions,
  SUPPORTED_ADMIN_AGENT_TOOLS,
} from './ai-admin-chat-protocol';
import type {
  AgentActionRequest,
  AgentLlmStructuredOutput,
} from './ai-admin-chat-protocol';
import type {
  AiAutopilotMode,
  AiChatErrorDiagnostic,
  AiChatExecutedAction,
  AiChatMessage,
  SportType,
} from './types';

/**
 * Снимок всей живой информации по сайту для контекста нейросети
 */
async function buildPlatformContextSnapshot() {
  const state = await readState();
  const analytics = computePlatformAnalytics(state.predictions);
  const aiStats = computeAiPerformanceStats(state.predictions);

  const paidOrders = state.transactions.filter((t) => t.status === 'SUCCEEDED');
  const totalRevenueRub = paidOrders.reduce((acc, t) => acc + t.amountRub, 0);
  const dayAgo = Date.now() - 24 * 3600_000;
  const revenue24hRub = paidOrders
    .filter((t) => new Date(t.createdAt).getTime() >= dayAgo)
    .reduce((acc, t) => acc + t.amountRub, 0);

  const activePredictions = state.predictions
    .filter((p) => p.resultStatus === 'PENDING')
    .slice(0, 8)
    .map((p) => ({
      id: p.id,
      match: `${p.homeTeam} — ${p.awayTeam}`,
      sport: p.sport,
      league: p.leagueName,
      pick: p.selectionTitle,
      odds: p.fixedOdds,
      tier: p.accessTier,
      priceRub: p.singlePriceRub,
    }));

  const recentSettled = state.predictions
    .filter(hasVerifiedSettledResult)
    .slice(0, 6)
    .map((p) => ({
      id: p.id,
      match: `${p.homeTeam} — ${p.awayTeam}`,
      pick: p.selectionTitle,
      odds: p.fixedOdds,
      result: p.resultStatus,
      score: p.finalScore,
    }));

  return {
    mskTimeNow: new Date(Date.now() + 3 * 3600_000)
      .toISOString()
      .replace('T', ' ')
      .slice(0, 16),
    brandAndSettings: {
      brandName: state.settings.brandName,
      paymentMode: state.settings.paymentMode,
      yookassaConfigured: Boolean(
        state.settings.yookassaShopId && state.settings.yookassaSecretKey,
      ),
      telegramChannelConfigured: Boolean(
        state.settings.telegramBotToken && state.settings.telegramChannelId,
      ),
      telegramBotUsername: state.settings.telegramBotUsername || '',
      defaultSinglePriceRub: state.settings.defaultSinglePriceRub,
      bundle2DiscountPct: state.settings.bundle2DiscountPct,
      bundle3DiscountPct: state.settings.bundle3DiscountPct,
      yandexMetrikaId: state.settings.yandexMetrikaId || '',
    },
    financeAndUsers: {
      totalRevenueRub,
      revenue24hRub,
      paidOrdersCount: paidOrders.length,
      totalUsersCount: state.users.length,
      pendingPartnerPayoutsCount: state.payouts.filter(
        (p) => p.status === 'PENDING',
      ).length,
      recentUsers: state.users.slice(0, 10).map((u) => ({
        email: u.email,
        balanceRub: u.balanceRub,
        purchasedCount: u.purchasedPredictionIds.length,
        telegramLinked: Boolean(u.telegramChatId),
      })),
    },
    promoCodes: state.promoCodes.map((c) => ({
      code: c.code,
      discountPercent: c.discountPercent,
      used: `${c.usedCount}/${c.maxUses}`,
      active: c.active,
    })),
    autopilot: {
      mode: state.aiAutopilot.mode,
      llmProvider: state.aiAutopilot.llmProvider,
      llmModel: state.aiAutopilot.llmModel,
      morningHourMsk: state.aiAutopilot.morningHourMsk,
      eveningHourMsk: state.aiAutopilot.eveningHourMsk,
      maxPicksPerRun: state.aiAutopilot.maxPicksPerRun,
      defaultAiPriceRub: state.aiAutopilot.defaultAiPriceRub,
      freeEveryNthPick: state.aiAutopilot.freeEveryNthPick,
      insureAiPicks: state.aiAutopilot.insureAiPicks,
      openSourceResearchEnabled:
        state.aiAutopilot.openSourceResearchEnabled !== false,
      draftsInQueueCount: state.aiDrafts.length,
      drafts: state.aiDrafts.slice(0, 6).map((d) => ({
        id: d.id,
        match: `${d.homeTeam} — ${d.awayTeam}`,
        pick: d.selectionTitle,
        odds: d.fixedOdds,
      })),
    },
    verifiedStats: {
      allTimeWinRatePct: analytics.statsByPeriod.ALL_TIME.winRatePct,
      allTimeNetProfitPct: analytics.statsByPeriod.ALL_TIME.netProfitUnits,
      wins: analytics.statsByPeriod.ALL_TIME.wins,
      losses: analytics.statsByPeriod.ALL_TIME.losses,
      aiWinRatePct: aiStats.winRatePct,
      aiYieldPct: aiStats.yieldPct,
    },
    activePredictionsOnStorefront: activePredictions,
    recentSettledPredictions: recentSettled,
  };
}

/**
 * Исполнитель реальных команд по сайту и открытым источникам
 */
async function executeAdminAgentTool(
  req: AgentActionRequest,
): Promise<{
  record: AiChatExecutedAction;
  toolData?: unknown;
}> {
  const tool = (req.tool || '').trim();
  const args = req.args || {};

  if (!SUPPORTED_ADMIN_AGENT_TOOLS.has(tool)) {
    return {
      record: {
        tool: tool || 'invalid_agent_action',
        ok: false,
        summary: `Команда «${tool || 'без имени'}» не поддерживается; действие не выполнялось.`,
      },
    };
  }

  try {
    if (tool === 'search_open_sources') {
      const query = String(args.query || '').trim();
      if (!query) throw new Error('Пустой поисковый запрос');
      const snap = await readState();
      const pvKey = snap.aiAutopilot.llmApiKey?.trim().startsWith('sk-pv-')
        ? snap.aiAutopilot.llmApiKey.trim()
        : undefined;
      const res = await searchOpenSourcesForAdmin(query, pvKey);
      return {
        record: {
          tool,
          ok: true,
          summary: `Поиск в источниках по запросу «${query}» (заголовков: ${res.headlines.length}, превью: ${res.snippets.length}, источники: ${res.sources.join(', ') || 'RSS'})`,
        },
        toolData: res,
      };
    }

    if (tool === 'research_specific_match') {
      const homeTeam = String(args.homeTeam || '').trim();
      const awayTeam = String(args.awayTeam || '').trim();
      const sport = (String(args.sport || 'FOOTBALL').toUpperCase() as SportType) || 'FOOTBALL';
      const leagueName = String(args.leagueName || 'Турнир').trim();
      const snap = await readState();
      const pvKey = snap.aiAutopilot.llmApiKey?.trim().startsWith('sk-pv-')
        ? snap.aiAutopilot.llmApiKey.trim()
        : undefined;
      const intel = await gatherMatchOpenSourceIntel({
        sport,
        leagueName,
        homeTeam,
        awayTeam,
        homeOdds: Number(args.homeOdds || 1.9),
        drawOdds: args.drawOdds ? Number(args.drawOdds) : null,
        awayOdds: Number(args.awayOdds || 2.0),
        plusVibeApiKey: pvKey,
      });
      return {
        record: {
          tool,
          ok: true,
          summary: `Собрано досье открытых источников на матч «${homeTeam} — ${awayTeam}» (индекс надежности ${intel.reliabilityScore}/100)`,
        },
        toolData: intel,
      };
    }

    if (tool === 'scan_and_publish_matches') {
      const requestedCount = Number(args.count ?? 3);
      const count = Number.isFinite(requestedCount)
        ? Math.min(8, Math.max(1, Math.round(requestedCount)))
        : 3;
      const forcePublish = args.publishImmediately !== false;
      const res = await runAiScanAndGenerateCycle({
        forcePublish,
        maxCountOverride: count,
        triggerLabel: 'Запуск из ИИ-Чата управляющего',
      });
      const summary = formatAdminMatchScanSummary({
        feedSource: res.feedSource,
        scannedCount: res.scannedCount,
        createdCount: res.createdCount,
        publishImmediately: forcePublish,
      });
      return {
        record: {
          tool,
          // A completed scan with zero qualifying picks is a successful scan, not a tool failure.
          ok: true,
          summary,
        },
        toolData: res,
      };
    }

    if (tool === 'replace_demo_matches') {
      const res = await replaceDemoWithRealMatches();
      return {
        record: {
          tool,
          ok: res.createdCount > 0,
          summary: `Удалено начальных демо-карточек: ${res.removedDemoCount}. Сканировано событий: ${res.scannedCount}; ${res.createdCount > 0 ? `опубликовано реальных прогнозов: ${res.createdCount}` : 'реальных прогнозов не опубликовано — сканирование не нашло кандидатов, прошедших проверку'} (${res.feedSource}).`,
        },
        toolData: res,
      };
    }

    if (tool === 'approve_all_drafts') {
      const st = await readState();
      const drafts = st.aiDrafts;
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
      const summary =
        drafts.length === 0
          ? 'Черновиков нет — публикация не выполнялась.'
          : `Опубликовано ${approvedCount} из ${drafts.length} черновиков.${
              failedDrafts.length > 0
                ? ` Не выпущено ${failedDrafts.length}: ${failedDrafts
                    .slice(0, 3)
                    .map((item) => `${item.id}: ${item.error}`)
                    .join('; ')}`
                : ''
            }`;
      return {
        record: {
          tool,
          ok: drafts.length > 0 && failedDrafts.length === 0,
          summary,
        },
        toolData: { requestedCount: drafts.length, approvedCount, failedDrafts },
      };
    }

    if (tool === 'run_settlement') {
      const res = await runAutoSettlementCycle();
      return {
        record: {
          tool,
          ok: true,
          summary: `Выполнена автосверка результатов завершенных игр (рассчитано матчей: ${res.settledCount}, возвратов страховки: ${res.compensatedBuyers})`,
        },
        toolData: res,
      };
    }

    if (tool === 'update_or_delete_prediction') {
      const q = String(args.predictionIdOrTeamQuery || '')
        .trim()
        .toLowerCase();
      const subAction = String(args.action || 'SET_PRICE').toUpperCase();

      const msg = await mutateState((state) => {
        const idx = state.predictions.findIndex(
          (p) =>
            p.id.toLowerCase() === q ||
            `${p.homeTeam} ${p.awayTeam}`.toLowerCase().includes(q),
        );
        if (idx === -1) throw new Error(`Матч по запросу «${q}» не найден`);
        const target = state.predictions[idx];

        if (subAction === 'DELETE') {
          deleteUnownedPrediction(state, target.id);
          return `Удален матч «${target.homeTeam} — ${target.awayTeam}»`;
        }
        if (subAction === 'MAKE_FREE') {
          target.accessTier = 'FREE';
          target.singlePriceRub = null;
          target.insuredOnLoss = false;
          return `Матч «${target.homeTeam} — ${target.awayTeam}» переведен в бесплатный открытый доступ (0 ₽)`;
        }
        if (subAction === 'MAKE_FEATURED') {
          for (const p of state.predictions) p.isFeatured = false;
          target.isFeatured = true;
          return `Матч «${target.homeTeam} — ${target.awayTeam}» закреплен главным событием дня на витрине`;
        }
        const nextPrice = Math.max(50, Math.round(Number(args.priceRub || 790)));
        target.accessTier = 'PAID_SINGLE';
        target.singlePriceRub = nextPrice;
        return `Цена на матч «${target.homeTeam} — ${target.awayTeam}» изменена на ${nextPrice} ₽`;
      });

      return { record: { tool, ok: true, summary: msg } };
    }

    if (tool === 'configure_autopilot') {
      const summaryParts: string[] = [];
      await mutateState((state) => {
        if (args.mode) {
          const m = String(args.mode).toUpperCase() as AiAutopilotMode;
          if (['OFF', 'MODERATION', 'FULL_AUTOPILOT'].includes(m)) {
            state.aiAutopilot.mode = m;
            summaryParts.push(`режим: ${m}`);
          }
        }
        if (args.morningHourMsk !== undefined) {
          state.aiAutopilot.morningHourMsk = Math.min(
            23,
            Math.max(0, Math.round(Number(args.morningHourMsk))),
          );
          summaryParts.push(`утро: ${state.aiAutopilot.morningHourMsk}:00 МСК`);
        }
        if (args.eveningHourMsk !== undefined) {
          state.aiAutopilot.eveningHourMsk = Math.min(
            23,
            Math.max(0, Math.round(Number(args.eveningHourMsk))),
          );
          summaryParts.push(`вечер: ${state.aiAutopilot.eveningHourMsk}:00 МСК`);
        }
        if (args.maxPicksPerRun !== undefined) {
          state.aiAutopilot.maxPicksPerRun = Math.min(
            8,
            Math.max(1, Math.round(Number(args.maxPicksPerRun))),
          );
          summaryParts.push(`матчей за слот: ${state.aiAutopilot.maxPicksPerRun}`);
        }
        if (args.defaultAiPriceRub !== undefined) {
          state.aiAutopilot.defaultAiPriceRub = Math.max(
            50,
            Math.round(Number(args.defaultAiPriceRub)),
          );
          summaryParts.push(`цена ИИ: ${state.aiAutopilot.defaultAiPriceRub} ₽`);
        }
        if (args.freeEveryNthPick !== undefined) {
          state.aiAutopilot.freeEveryNthPick = Math.max(
            0,
            Math.round(Number(args.freeEveryNthPick)),
          );
          summaryParts.push(`бесплатный каждый N-й: ${state.aiAutopilot.freeEveryNthPick}`);
        }
        if (args.insureAiPicks !== undefined) {
          state.aiAutopilot.insureAiPicks = Boolean(args.insureAiPicks);
          summaryParts.push(
            `страховка: ${state.aiAutopilot.insureAiPicks ? 'вкл' : 'выкл'}`,
          );
        }
        if (args.openSourceResearchEnabled !== undefined) {
          state.aiAutopilot.openSourceResearchEnabled = Boolean(
            args.openSourceResearchEnabled,
          );
          summaryParts.push(
            `поиск открытых источников: ${
              state.aiAutopilot.openSourceResearchEnabled ? 'вкл' : 'выкл'
            }`,
          );
        }
      });

      return {
        record: {
          tool,
          ok: true,
          summary: `Настройки ИИ-Автопилота обновлены (${summaryParts.join(', ') || 'без изменений'})`,
        },
      };
    }

    if (tool === 'update_storefront_pricing') {
      const changed: string[] = [];
      await mutateState((state) => {
        if (args.brandName && String(args.brandName).trim()) {
          state.settings.brandName = String(args.brandName).trim();
          changed.push(`бренд: ${state.settings.brandName}`);
        }
        if (args.defaultSinglePriceRub !== undefined) {
          const pr = Math.max(50, Math.round(Number(args.defaultSinglePriceRub)));
          state.settings.defaultSinglePriceRub = pr;
          state.aiAutopilot.defaultAiPriceRub = pr;
          changed.push(`базовая цена: ${pr} ₽`);
        }
        if (args.bundle2DiscountPct !== undefined) {
          state.settings.bundle2DiscountPct = Math.min(
            60,
            Math.max(0, Math.round(Number(args.bundle2DiscountPct))),
          );
          changed.push(`скидка за 2 матча: −${state.settings.bundle2DiscountPct}%`);
        }
        if (args.bundle3DiscountPct !== undefined) {
          state.settings.bundle3DiscountPct = Math.min(
            70,
            Math.max(0, Math.round(Number(args.bundle3DiscountPct))),
          );
          changed.push(`скидка за 3 матча: −${state.settings.bundle3DiscountPct}%`);
        }
      });

      return {
        record: {
          tool,
          ok: true,
          summary: `Тарифы и настройки витрины сохранены (${changed.join(', ')})`,
        },
      };
    }

    if (tool === 'manage_promo_code') {
      const code = String(args.code || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, '');
      if (!code) throw new Error('Укажите код промокода латиницей');
      const sub = String(args.action || 'CREATE').toUpperCase();

      const msg = await mutateState((state) => {
        if (sub === 'DELETE') {
          state.promoCodes = state.promoCodes.filter(
            (c) => c.code.toUpperCase() !== code,
          );
          return `Промокод ${code} удален`;
        }
        const pct = Math.min(80, Math.max(5, Math.round(Number(args.discountPercent || 20))));
        const maxUses = Math.max(1, Math.round(Number(args.maxUses || 200)));
        const existing = state.promoCodes.find(
          (c) => c.code.toUpperCase() === code,
        );
        if (existing) {
          existing.discountPercent = pct;
          existing.maxUses = maxUses;
          existing.active = true;
          return `Промокод ${code} обновлен: скидка −${pct}% (лимит ${maxUses})`;
        }
        state.promoCodes.unshift({
          id: `promo_${randomUUID().slice(0, 8)}`,
          code,
          discountPercent: pct,
          maxUses,
          usedCount: 0,
          active: true,
          createdAt: new Date().toISOString(),
        });
        return `Создан промокод ${code} на скидку −${pct}% (${maxUses} активаций)`;
      });

      return { record: { tool, ok: true, summary: msg } };
    }

    if (tool === 'manage_user_account') {
      const email = String(args.email || '')
        .trim()
        .toLowerCase();
      const sub = String(args.action || 'CREDIT_BALANCE').toUpperCase();

      const msg = await mutateState((state) => {
        const u = state.users.find((row) => row.email.toLowerCase() === email);
        if (!u) throw new Error(`Клиент с E-mail ${email} не найден`);
        if (sub === 'GRANT_PREDICTION') {
          const q = String(args.teamQuery || '').toLowerCase();
          const p = state.predictions.find(
            (pred) =>
              pred.resultStatus === 'PENDING' &&
              (!q || `${pred.homeTeam} ${pred.awayTeam}`.toLowerCase().includes(q)),
          );
          if (!p) throw new Error('Подходящий активный матч не найден');
          if (!u.purchasedPredictionIds.includes(p.id)) {
            u.purchasedPredictionIds.push(p.id);
          }
          return `Клиенту ${u.email} открыт бесплатный доступ к матчу «${p.homeTeam} — ${p.awayTeam}»`;
        }
        const delta = Math.round(Number(args.amountRub || 0));
        u.balanceRub = Math.max(0, u.balanceRub + delta);
        return `Баланс клиента ${u.email} изменен (${delta >= 0 ? '+' : ''}${delta} ₽ → текущий: ${u.balanceRub} ₽)`;
      });

      return { record: { tool, ok: true, summary: msg } };
    }

    if (tool === 'telegram_channel_post') {
      const sub = String(args.action || 'DAILY_DIGEST').toUpperCase();
      if (sub === 'DAILY_DIGEST') {
        const res = await broadcastDailyDigestToTelegram();
        if (!res.sent) throw new Error(res.error || 'Telegram-канал не настроен');
        return {
          record: {
            tool,
            ok: true,
            summary: 'В Telegram-канал опубликована сводка матчей и открытой статистики',
          },
        };
      }
      const state = await readState();
      const html = String(args.customHtmlText || '').trim();
      if (!html) throw new Error('Текст поста для Telegram пуст');
      const siteBase = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
      const sent = await sendTelegramChannelAnnouncement(
        state.settings,
        html,
        siteBase
          ? {
              text: String(args.buttonText || '🔥 Открыть прогнозы на сайте →'),
              url: siteBase,
            }
          : undefined,
      );
      if (!sent.sent) throw new Error(sent.error || 'Не удалось отправить пост');
      return {
        record: {
          tool,
          ok: true,
          summary: 'Авторский пост отправлен в ваш Telegram-канал',
        },
      };
    }

    return {
      record: {
        tool,
        ok: false,
        summary: `Команда «${tool || 'без имени'}» не поддерживается; действие не выполнялось.`,
      },
    };
  } catch (err) {
    return {
      record: {
        tool,
        ok: false,
        summary: err instanceof Error ? err.message : 'Ошибка выполнения действия',
      },
    };
  }
}

function createActionFormatDiagnostic(
  recovered: boolean,
  receivedActions: number,
): AiChatErrorDiagnostic {
  return {
    code: recovered ? 'ACTION_FORMAT_RECOVERED' : 'INVALID_AGENT_ACTION',
    title: recovered
      ? 'Нестандартный ответ модели обработан резервным маршрутом'
      : 'Действие модели не распознано или не соответствует запросу',
    technicalDetails: recovered
      ? `Получено элементов actions: ${receivedActions}. Использован локальный диспетчер команды; фактический результат указан ниже.`
      : `Получено элементов actions: ${receivedActions}; неизвестные команды или действия, не соответствующие запросу, не выполнялись.`,
    solutions: recovered
      ? [
          'Сбор выполняется через проверенный сценарий ИИ-автопилота; ориентируйтесь на фактический результат действия ниже.',
          'Формат ответа модели дополнительно нормализован; если предупреждение повторяется, проверьте обновление приложения и формат команды.',
        ]
      : [
          'Повторите запрос обычными словами; пока команда не появилась в списке действий с успешным статусом, считайте её невыполненной.',
          'Ответ модели должен содержать actions с точным полем tool и объектом args.',
        ],
  };
}

function getStructuredReply(parsed: AgentLlmStructuredOutput): string {
  return typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
}

function formatFailedActionReply(actions: AiChatExecutedAction[]): string {
  const failures = actions.filter((action) => !action.ok);
  const successes = actions.filter((action) => action.ok);
  const lines = [
    successes.length > 0
      ? 'Выполнена только часть запрошенных действий:'
      : 'Команда не выполнена:',
    ...successes.map((action) => `✓ ${action.summary}`),
    ...failures.map((action) => `✗ ${action.summary}`),
    'Проверьте фактический статус выше; текстовое обещание модели само по себе не означает выполнение.',
  ];
  return lines.join('\n');
}

interface LlmCallOutcome {
  ok: boolean;
  content: string | null;
  modelLabel?: string;
  diagnostic?: AiChatErrorDiagnostic;
}

const GATEWAY_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function callConfiguredLlmWithDiagnostics(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
): Promise<LlmCallOutcome> {
  const state = await readState();
  const cfg = state.aiAutopilot;
  const key = (cfg.llmApiKey || '').trim();

  // 1. Ключ еще не введен или не сохранен
  if (cfg.llmProvider === 'BUILTIN_QUANT' || key.length <= 8) {
    return {
      ok: false,
      content: null,
      diagnostic: {
        code: 'KEY_NOT_SAVED',
        title:
          'API-ключ нейросети еще не сохранен на сервере (работает локальный встроенный модуль)',
        technicalDetails: `Текущий провайдер в настройках: ${cfg.llmProvider}, длина сохраненного ключа: ${key.length} симв.`,
        solutions: [
          'Нажмите кнопку «Подключить / Проверить ключ API» прямо в верхней плашке этого чата.',
          'Выберите шлюз (например, OrcaRouter.ai или DeepSeek), вставьте ваш секретный токен вида sk-... (со страницы https://www.orcarouter.ai/console/token — кнопка «Копировать» рядом с ключом).',
          'Нажмите «Проверить и сохранить» — ключ и рабочая модель сразу сохранятся в базу, и нейросеть начнет отвечать в свободном диалоге!',
        ],
      },
    };
  }

  // 2. Вместо секретного токена sk-... вставлено его название (например «google_306743 - initial token»)
  if (/\s/.test(key) || key.toLowerCase().includes('initial token')) {
    return {
      ok: false,
      content: null,
      diagnostic: {
        code: 'KEY_IS_NAME_NOT_SECRET',
        title: 'Вместо секретного токена вставлено его название',
        technicalDetails: `В поле ключа указан текст с пробелами («${key.slice(0, 26)}...»), а API-шлюз принимает только секретный код без пробелов (обычно начинается на sk-...).`,
        solutions: [
          'Откройте https://www.orcarouter.ai/console/token в браузере.',
          'В строке вашего ключа нажмите иконку «Копировать» (два листочка) — скопируется длинный секретный ключ вида sk-...',
          'Вставьте его в плашку настройки ключа прямо над этим чатом и нажмите «Проверить и сохранить».',
        ],
      },
    };
  }

  const isPlusVibe =
    key.startsWith('sk-pv-') ||
    cfg.llmProvider === 'PLUSVIBE' ||
    cfg.llmBaseUrl.toLowerCase().includes('plusvibeapi.ru');

  const effectiveProvider = isPlusVibe ? 'PLUSVIBE' : cfg.llmProvider;
  const bases = buildCandidateLlmBaseUrls(cfg.llmBaseUrl, effectiveProvider, key);
  const rawModel = cfg.llmModel.trim();
  const configuredModel =
    isPlusVibe &&
    (!rawModel ||
      rawModel.toLowerCase() === 'orcarouter/auto' ||
      rawModel.toLowerCase().includes('free') ||
      rawModel === 'deepseek-v4.1-flash')
      ? 'deepseek-v4.1-flash-1017'
      : rawModel || 'deepseek-v4.1-flash';

  let lastStatus = 0;
  let lastUrl = bases[0] || cfg.llmBaseUrl;
  let lastRawError = '';
  let discoveredModelsOnToken: string[] = [];
  const perModelErrors: string[] = [];

  for (const base of bases) {
    lastUrl = `${base}/chat/completions`;

    const primaryOut = await postLlmChatCompletion({
      baseUrl: base,
      apiKey: key,
      model: configuredModel,
      temperature: 0.25,
      timeoutMs: 24_000,
      messages,
    });

    if (primaryOut.ok && primaryOut.content) {
      return {
        ok: true,
        content: primaryOut.content,
        modelLabel: `${effectiveProvider} · ${
          primaryOut.returnedModel || configuredModel
        }`,
      };
    }

    lastStatus = primaryOut.status;
    lastRawError = primaryOut.rawError;
    perModelErrors.push(
      `${configuredModel} → HTTP ${primaryOut.status}: ${primaryOut.rawError
        .replace(/\s+/g, ' ')
        .slice(0, 110)}`,
    );

    // Если сам ключ неверный (HTTP 401) или нулевой рублевый баланс (HTTP 402) — перебирать модели не нужно
    if (primaryOut.status === 401 || (isPlusVibe && primaryOut.status === 402)) {
      break;
    }

    // При любой другой ошибке модели — автоматически загружаем /models и проверяем приоритетные модели шлюза!
    try {
      const mRes = await fetch(`${base}/models`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${key}`,
          'User-Agent': GATEWAY_UA,
        },
        signal: AbortSignal.timeout(7500),
        cache: 'no-store',
      });
      if (mRes.ok) {
        const mJson = (await mRes.json()) as {
          data?: Array<{ id?: string; type?: string }>;
        };
        const rawIds = (mJson.data || [])
          .filter((m) => !isNonChatModelId(m.id || '', m.type))
          .map((m) => (m.id || '').trim())
          .filter(Boolean);
        discoveredModelsOnToken = prioritizeModelsFreeFirst(rawIds, {
          isPlusVibe,
        });

        const candidates = discoveredModelsOnToken
          .filter(
            (m) =>
              m !== configuredModel &&
              m.toLowerCase() !== 'orcarouter/auto',
          )
          .slice(0, 7);

        for (const altModel of candidates) {
          const retryOut = await postLlmChatCompletion({
            baseUrl: base,
            apiKey: key,
            model: altModel,
            temperature: 0.25,
            timeoutMs: 22_000,
            messages,
          });

          if (retryOut.ok && retryOut.content) {
            await mutateState((s) => {
              s.aiAutopilot.llmProvider = effectiveProvider;
              s.aiAutopilot.llmBaseUrl = base;
              s.aiAutopilot.llmModel = altModel;
            });
            return {
              ok: true,
              content: retryOut.content,
              modelLabel: `${effectiveProvider} · ${
                retryOut.returnedModel || altModel
              } (автоподбор)`,
            };
          }

          perModelErrors.push(
            `${altModel} → HTTP ${retryOut.status}: ${retryOut.rawError
              .replace(/\s+/g, ' ')
              .slice(0, 100)}`,
          );
        }
      }
    } catch {
      // переходим к формированию детального отчета
    }
  }

  // Формируем понятную человеческую диагностику по точному коду ответа!
  const isHtmlCloudflare =
    lastRawError.includes('<!DOCTYPE html') ||
    lastRawError.includes('<html') ||
    lastRawError.toLowerCase().includes('cloudflare');

  const cleanSnippet = isHtmlCloudflare
    ? 'Шлюз вернул HTML-страницу защиты Cloudflare вместо JSON-ответа API.'
    : lastRawError.replace(/\s+/g, ' ').trim().slice(0, 260) || 'Нет тела ответа';

  const isModelAccessDenied403 =
    lastStatus === 403 &&
    (lastRawError.includes('model_access_denied') ||
      lastRawError.includes('does not have access to model'));

  const perModelReport =
    perModelErrors.length > 0
      ? ` Проверенные модели (${perModelErrors.length} шт.): ${perModelErrors.join(' | ')}`
      : '';

  if (isModelAccessDenied403) {
    return {
      ok: false,
      content: null,
      diagnostic: {
        code: 'MODEL_ACCESS_DENIED_403',
        title:
          'Ключ верный, но в настройках ключа на OrcaRouter ограничен доступ к моделям (HTTP 403 model_access_denied)',
        technicalDetails: `URL: ${lastUrl} ·${perModelReport}`,
        solutions: [
          'Откройте настройки вашего API-ключа на https://www.orcarouter.ai/console/token и нажмите «Редактировать / Управление доступом» рядом с ключом.',
          'В списке разрешенных моделей ключа включите бесплатные модели с пометкой -free (или снимите галочку ограничения по конкретным моделям) и сохраните ключ в консоли OrcaRouter.',
          'После этого нажмите «Проверить связь и СОХРАНИТЬ» вверху этого чата — рабочая бесплатная модель подхватится автоматически!',
        ],
      },
    };
  }

  if (lastStatus === 401 || lastStatus === 403) {
    return {
      ok: false,
      content: null,
      diagnostic: {
        code: `AUTH_HTTP_${lastStatus}`,
        title: isHtmlCloudflare
          ? `Шлюз ${lastUrl} заблокировал запрос защитой Cloudflare (HTTP ${lastStatus})`
          : `Шлюз отклонил API-ключ (HTTP ${lastStatus} — Неверный или заблокированный токен)`,
        technicalDetails: `URL: ${lastUrl} · Модель: ${configuredModel} · Ответ сервера: ${cleanSnippet}`,
        solutions: isHtmlCloudflare
          ? [
              'Убедитесь, что адрес API Base URL указан строго с www: https://www.orcarouter.ai/v1 (или подключите прямой ключ DeepSeek / OpenRouter).',
            ]
          : [
              'Проверьте, что скопирован полный ключ вида sk-orca-... со страницы https://www.orcarouter.ai/console/token без лишних пробелов.',
              'Убедитесь, что сам ключ включен (Active) в личном кабинете шлюза.',
            ],
      },
    };
  }

  if (lastStatus === 402 || lastStatus === 429) {
    return {
      ok: false,
      content: null,
      diagnostic: {
        code: `QUOTA_HTTP_${lastStatus}`,
        title: `Исчерпан баланс токена или лимит бесплатных запросов в минуту (HTTP ${lastStatus})`,
        technicalDetails: `URL: ${lastUrl} ·${perModelReport || ` Ответ шлюза: ${cleanSnippet}`}`,
        solutions: [
          'Если используется бесплатная модель (-free) и вернулся код 429 — подождите 15–30 секунд (лимит бесплатных запросов в минуту) и отправьте сообщение снова.',
          'Либо выберите в выпадающем списке моделей над чатом другую бесплатную модель (-free) из доступных на вашем ключе.',
        ],
      },
    };
  }

  if ([400, 404, 500, 502, 503].includes(lastStatus)) {
    const modelsHint =
      discoveredModelsOnToken.length > 0
        ? `Модели на вашем токене (${discoveredModelsOnToken.length} шт.): ${discoveredModelsOnToken.join(', ')}.`
        : '';
    return {
      ok: false,
      content: null,
      diagnostic: {
        code: `MODEL_OR_CHANNEL_HTTP_${lastStatus}`,
        title: `Модели на токене временно не ответили (HTTP ${lastStatus})`,
        technicalDetails: `URL: ${lastUrl} · ${modelsHint}${perModelReport || ` Ответ: ${cleanSnippet}`}`,
        solutions: [
          'Убедитесь, что Base URL указан строго с www: https://www.orcarouter.ai/v1 (исправлено автоматически!).',
          'Нажмите «Проверить связь и СОХРАНИТЬ» вверху чата — система по очереди опросит все бесплатные модели (-free) вашего ключа и сохранит живую.',
        ],
      },
    };
  }

  return {
    ok: false,
    content: null,
    diagnostic: {
      code: 'NETWORK_OR_TIMEOUT',
      title: 'Не удалось достучаться до сервера нейросети (таймаут или ошибка сети)',
      technicalDetails: `Проверенный адрес: ${lastUrl} · Модель: ${configuredModel} · Детали: ${cleanSnippet}`,
      solutions: [
        'Проверьте правильность адреса API Base URL (для OrcaRouter: https://www.orcarouter.ai/v1, для DeepSeek: https://api.deepseek.com/v1, для OpenRouter: https://openrouter.ai/api/v1).',
        'Нажмите кнопку «Подключить / Проверить ключ API» вверху чата для мгновенного теста связи с вашего сервера.',
      ],
    },
  };
}

/**
 * Локальный командный процессор (выполняет прямые поручения даже при сбое внешнего API + честно объясняет статус)
 */
async function runDeterministicFallbackAssistant(
  userText: string,
  diagnostic?: AiChatErrorDiagnostic,
): Promise<{ reply: string; executedActions: AiChatExecutedAction[] }> {
  const lower = userText.toLowerCase().trim();
  const executedActions: AiChatExecutedAction[] = [];

  // Если спросили «что ты за модель? / кто ты? / привет»
  if (
    lower.includes('модел') ||
    lower.includes('кто ты') ||
    lower === 'привет' ||
    lower.startsWith('привет ')
  ) {
    return {
      executedActions,
      reply:
        diagnostic?.code === 'KEY_NOT_SAVED'
          ? 'Привет! Сейчас внешняя нейросеть еще не подключена (ключ API не сохранен в базе), поэтому вам отвечает встроенный локальный модуль управления VALUEX.\n\nСмотрите блок диагностики выше: нажмите «Подключить / Проверить ключ API» прямо в шапке чата, вставьте ваш токен `sk-...` и нажмите «Проверить и сохранить» — тогда я сразу переключусь на полноценную нейросеть (Gemini / GPT / DeepSeek)!'
          : 'Привет! Я попытался обратиться к вашей внешней модели нейросети, но шлюз API вернул ошибку связи — поэтому временно ответил встроенный модуль сайта. В желто-красном блоке прямо над этим текстом указана точная причина ошибки от сервера и как исправить её за 1 минуту.',
    };
  }

  // Любой запрос про новости / травмы / составы («проверь новости», «найди новости», «что по травмам»)
  if (
    lower.includes('новост') ||
    lower.includes('травм') ||
    lower.includes('состав') ||
    (lower.includes('проверь') && lower.includes('источник'))
  ) {
    const cleanQ = userText
      .replace(
        /найди|проверь|посмотри|свежие|спортивные|новости|инфу|информацию|по матчу|про/gi,
        '',
      )
      .trim();
    const searchTopic = cleanQ.length >= 2 ? cleanQ : 'РПЛ КХЛ футбол хоккей составы травмы';
    const res = await executeAdminAgentTool({
      tool: 'search_open_sources',
      args: { query: searchTopic },
    });
    executedActions.push(res.record);
    const data = res.toolData as
      | { headlines?: string[]; snippets?: string[]; sources?: string[] }
      | undefined;
    const items = [...(data?.headlines || []), ...(data?.snippets || [])].slice(0, 6);
    return {
      executedActions,
      reply:
        items.length > 0
          ? `Проверил открытые источники по теме «${searchTopic}» (${(data?.sources || []).join(', ') || 'RSS / поиск'}):\n\n${items
              .map((x, i) => `${i + 1}. ${x}`)
              .join('\n')}`
          : `Выполнил запрос к открытым источникам по теме «${searchTopic}», но заголовков за последние дни не вернулось (либо требуется подключение внешнего API нейросети — см. блок диагностики выше).`,
    };
  }

  if (isMatchCollectionIntent(userText)) {
    const numMatch = lower.match(/\b([1-8])\b/);
    const count = numMatch ? Number(numMatch[1]) : 3;
    const res = await executeAdminAgentTool({
      tool: 'scan_and_publish_matches',
      args: {
        count,
        publishImmediately: !isDraftOnlyMatchCollectionIntent(userText),
      },
    });
    executedActions.push(res.record);
    return {
      executedActions,
      reply: res.record.summary,
    };
  }

  if (
    isAdminMutationIntent(userText) &&
    (lower.includes('создай') ||
      lower.includes('создайте') ||
      lower.includes('создать')) &&
    (lower.includes('прогноз') || lower.includes('матч'))
  ) {
    return {
      executedActions,
      reply: 'Прямое создание прогноза с произвольным матчем и коэффициентом отключено, чтобы не обходить проверенную линию и AI-фильтры. Ничего не создано; запросите сбор прогнозов из подтверждённой линии.',
    };
  }

  if (
    lower.includes('telegram') ||
    lower.includes('телеграм')
  ) {
    if (lower.includes('сводк') || lower.includes('отчет') || lower.includes('дайджест')) {
      const res = await executeAdminAgentTool({
        tool: 'telegram_channel_post',
        args: { action: 'DAILY_DIGEST' },
      });
      executedActions.push(res.record);
      return {
        executedActions,
        reply: res.record.ok
          ? `Готово! ${res.record.summary}.`
          : `Не удалось отправить в Telegram: ${res.record.summary} (проверьте токен бота и ID канала во вкладке «ЮKassa, Telegram и Реквизиты»).`,
      };
    }
  }

  if (lower.includes('цен') || (lower.includes('включи') && lower.includes('автопилот'))) {
    const priceMatch = lower.match(/(\d{2,5})\s*(?:₽|руб)/);
    if (priceMatch) {
      const pRes = await executeAdminAgentTool({
        tool: 'update_storefront_pricing',
        args: { defaultSinglePriceRub: Number(priceMatch[1]) },
      });
      executedActions.push(pRes.record);
    }
    if (lower.includes('включи') && lower.includes('автопилот')) {
      const aRes = await executeAdminAgentTool({
        tool: 'configure_autopilot',
        args: { mode: 'FULL_AUTOPILOT' },
      });
      executedActions.push(aRes.record);
    }
    if (executedActions.length > 0) {
      return {
        executedActions,
        reply: `Настройки применены:\n• ${executedActions.map((a) => a.summary).join('\n• ')}`,
      };
    }
  }

  if (lower.includes('промокод')) {
    const codeMatch = userText.match(/\b([A-Za-z0-9]{4,16})\b/);
    const pctMatch = userText.match(/(\d{1,2})\s*%/);
    if (codeMatch && pctMatch) {
      const res = await executeAdminAgentTool({
        tool: 'manage_promo_code',
        args: {
          action: 'CREATE',
          code: codeMatch[1].toUpperCase(),
          discountPercent: Number(pctMatch[1]),
        },
      });
      executedActions.push(res.record);
      return {
        executedActions,
        reply: `Готово! ${res.record.summary}.`,
      };
    }
  }

  const snap = await buildPlatformContextSnapshot();
  return {
    executedActions,
    reply: [
      `Сводка по вашему сайту **${snap.brandAndSettings.brandName}** прямо сейчас:`,
      `• Выручка всего: **${snap.financeAndUsers.totalRevenueRub.toLocaleString('ru-RU')} ₽** (за 24ч: ${snap.financeAndUsers.revenue24hRub.toLocaleString('ru-RU')} ₽, оплаченных заказов: ${snap.financeAndUsers.paidOrdersCount})`,
      `• Активных прогнозов на витрине: **${snap.activePredictionsOnStorefront.length} шт.** · Черновиков ИИ: **${snap.autopilot.draftsInQueueCount} шт.**`,
      `• Режим ИИ-Автопилота: **${snap.autopilot.mode}** · Базовая цена: **${snap.brandAndSettings.defaultSinglePriceRub} ₽**`,
      `• Статистика сайта: **${snap.verifiedStats.wins} побед / ${snap.verifiedStats.losses} минусов** (${snap.verifiedStats.allTimeWinRatePct.toFixed(1)}%, прирост +${snap.verifiedStats.allTimeNetProfitPct.toFixed(1)}%)`,
      ``,
      `💡 *Примечание:* сейчас активен встроенный модуль. Когда во вкладке «ИИ-Автопилот 24/7» подключен ваш ключ OrcaRouter / Gemini / DeepSeek, я веду полноценный свободный диалог и выполняю любые сложные поручения по сайту и разбору матчей!`,
    ].join('\n'),
  };
}

/**
 * Главная точка входа ИИ-Чата управляющего с живым доступом ко всей базе и инструментам сайта
 */
export async function processAdminAiChatTurn(userPrompt: string): Promise<{
  userMessage: AiChatMessage;
  assistantMessage: AiChatMessage;
  messages: AiChatMessage[];
}> {
  const cleanPrompt = userPrompt.trim();
  if (!cleanPrompt) {
    throw new Error('Введите сообщение для ИИ-управляющего');
  }

  const userMsg: AiChatMessage = {
    id: `chat_${randomUUID().slice(0, 10)}`,
    role: 'user',
    content: cleanPrompt,
    createdAt: new Date().toISOString(),
  };

  const stateBefore = await readState();
  const recentHistory = stateBefore.aiChatMessages.slice(-10);
  const liveSnapshot = await buildPlatformContextSnapshot();

  const systemPrompt = [
    'Ты — ИИ-помощник администратора платформы VALUEX. Общайся по-русски и используй только перечисленные ниже серверные инструменты; не утверждай, что имеешь неограниченный доступ к базе.',
    'Инструменты:',
    '1) search_open_sources: {"query":"..."} — запросить открытые источники; доступность и полнота поиска зависят от настроенной интеграции.',
    '2) research_specific_match: {"sport":"FOOTBALL|HOCKEY|TENNIS|ESPORTS|BASKETBALL|MMA","leagueName":"...","homeTeam":"...","awayTeam":"...","homeOdds":1.85,"drawOdds":3.5,"awayOdds":4.1} — собрать досье на конкретный матч из доступных источников.',
    '3) scan_and_publish_matches: {"count":3,"publishImmediately":true} — сканировать линию Фонбет/Леон; новости проверяются, если эта настройка включена. Выпускаются только кандидаты, прошедшие кодовые фильтры и AI-комитет; это не обещание выигрыша. При publishImmediately:false прошедшие кандидаты попадут в черновики.',
    '4) replace_demo_matches: {} — удалить стартовые демо-карточки и запустить проверенный сценарий сбора реальных матчей.',
    '5) approve_all_drafts: {} — выпустить накопленные черновики на витрину.',
    '6) run_settlement: {} — запустить автоматическую сверку результатов завершенных игр.',
    '7) update_or_delete_prediction: {"predictionIdOrTeamQuery":"...","action":"SET_PRICE|MAKE_FREE|MAKE_FEATURED|DELETE","priceRub":690} — изменить цену, сделать бесплатным, главным или удалить матч.',
    '8) configure_autopilot: {"mode":"FULL_AUTOPILOT|MODERATION|OFF","morningHourMsk":9,"eveningHourMsk":18,"maxPicksPerRun":3,"defaultAiPriceRub":790,"freeEveryNthPick":4,"insureAiPicks":true,"openSourceResearchEnabled":true} — изменить настройки автопилота.',
    '9) update_storefront_pricing: {"brandName":"...","defaultSinglePriceRub":790,"bundle2DiscountPct":15,"bundle3DiscountPct":25} — изменить цены и скидки за наборы.',
    '10) manage_promo_code: {"action":"CREATE|DELETE","code":"VIP25","discountPercent":25,"maxUses":200} — создать или удалить промокод.',
    '11) manage_user_account: {"email":"...","action":"CREDIT_BALANCE|GRANT_PREDICTION","amountRub":1000,"teamQuery":"..."} — начислить баланс или подарить прогноз клиенту.',
    '12) telegram_channel_post: {"action":"DAILY_DIGEST|CUSTOM_POST","customHtmlText":"...","buttonText":"..."} — отправить сводку или HTML-пост в Telegram-канал.',
    '',
    'ПРАВИЛА ОТВЕТА:',
    '- Прямое создание прогноза через create_prediction намеренно отключено: произвольные команды с придуманными матчами или коэффициентами обходили проверенную линию и AI-проверки. Для новых прогнозов используй только scan_and_publish_matches.',
    '- Примеры сопоставления запросов владельца с инструментами (следуй им точно):',
    '  • «дай новый прогноз» / «дай прогнозы» / «нужен прогноз» / «хочу прогноз» / «сделай прогноз» / «придумай прогноз» / «подготовь прогнозы» / «собери матчи» → scan_and_publish_matches с args.count (если в запросе есть число 1–8, используй его; иначе 3) и publishImmediately:true.',
    '  • «собери прогнозы в черновики» / «без публикации» → scan_and_publish_matches с publishImmediately:false.',
    '  • «дай сводку в телеграм» / «опубликуй сводку в канале» → telegram_channel_post с action DAILY_DIGEST.',
    '  • «создай промокод VIP20 на 20%» → manage_promo_code с action CREATE, code VIP20, discountPercent 20.',
    '  • «поставь цену 790» / «сделай цену прогноза 790» → update_storefront_pricing с defaultSinglePriceRub 790.',
    '  • «включи полный автопилот» → configure_autopilot с mode FULL_AUTOPILOT.',
    '  • «рассчитай результаты» / «сверь матчи» → run_settlement.',
    '  • «проверь новости по РПЛ» / «что по травмам» → search_open_sources с query.',
    '  • «разбери матч Реал — Барса» → research_specific_match с командами и лигой.',
    '  • Вопросы «какая выручка?», «сколько прогнозов?», «дай статистику» — это НЕ команды: верни actions:[] и ответь по живым данным из контекста.',
    '- Не выставляй результат матча вручную и не угадывай счёт: только run_settlement, который рассчитает однозначный рынок после совпадения финального счёта минимум у двух независимых источников.',
    '- Отвечай СТРОГО валидным JSON-объектом вида: {"actions":[{"tool":"scan_and_publish_matches","args":{"count":3,"publishImmediately":true}}],"reply":"Краткий ответ владельцу на русском языке"}.',
    '- Каждый action обязан иметь поле "tool" с точным именем из списка выше и объект "args"; не используй вместо них name, action, function или arguments.',
    '- При прямом запрете публикации или просьбе о черновиках установи args.publishImmediately=false; сервер также принудительно отключает выпуск для таких запросов.',
    '- Никогда не говори, что команда запущена, выполнена или опубликована, пока сервер не вернул результат инструмента. В reply до выполнения опиши только намерение, а итог сформирует сервер по фактическому результату.',
    '- Если владелец просто задает вопрос по выручке, статистике или настройкам и менять ничего не нужно — верни "actions":[].',
    '- Если владелец просит разобрать матч или узнать новости — ОБЯЗАТЕЛЬНО вызови search_open_sources или research_specific_match, НИКОГДА не выдумывай новости или травмы от себя!',
    `- ТЕКУЩИЕ ЖИВЫЕ ДАННЫЕ САЙТА: ${JSON.stringify(liveSnapshot)}`,
  ].join('\n');

  const llmMessages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }> = [
    { role: 'system', content: systemPrompt },
    ...recentHistory.map((m) => ({
      role: m.role,
      content:
        m.role === 'assistant'
          ? JSON.stringify({
              actions: [],
              reply: m.content,
              executedActions: m.executedActions?.map((action) => ({
                tool: action.tool,
                ok: action.ok,
                summary: action.summary,
              })),
              diagnostic: m.diagnostic?.title,
            })
          : m.content,
    })),
    { role: 'user', content: cleanPrompt },
  ];

  const firstOutcome = await callConfiguredLlmWithDiagnostics(llmMessages);
  let finalReply = '';
  let activeModelLabel: string | undefined = firstOutcome.modelLabel;
  let activeDiagnostic: AiChatErrorDiagnostic | undefined =
    firstOutcome.diagnostic;
  const executedActions: AiChatExecutedAction[] = [];

  if (!firstOutcome.ok || !firstOutcome.content) {
    const fb = await runDeterministicFallbackAssistant(
      cleanPrompt,
      firstOutcome.diagnostic,
    );
    finalReply = fb.reply;
    executedActions.push(...fb.executedActions);
  } else {
    const firstRaw = firstOutcome.content;
    const parsed = parseStructuredAgentJson(firstRaw);
    const collectionIntent = isMatchCollectionIntent(cleanPrompt);

    if (!parsed) {
      if (collectionIntent) {
        const fallback = await runDeterministicFallbackAssistant(cleanPrompt);
        finalReply = fallback.reply;
        executedActions.push(...fallback.executedActions);
        activeDiagnostic = createActionFormatDiagnostic(true, 0);
      } else if (isAdminMutationIntent(cleanPrompt)) {
        finalReply =
          'Команда не выполнена: модель не передала серверу распознаваемое действие. Никакие изменения, отправки или публикации не выполнялись.';
        activeDiagnostic = createActionFormatDiagnostic(false, 0);
      } else {
        finalReply = firstRaw;
      }
    } else {
      const actionResolution = resolveAdminAgentActions(parsed, cleanPrompt);
      const {
        actionsToExecute,
        invalidActionCount,
        rawActionCount,
        shouldRunCollectionFallback,
      } = actionResolution;

      if (shouldRunCollectionFallback) {
        const fallback = await runDeterministicFallbackAssistant(cleanPrompt);
        finalReply = fallback.reply;
        executedActions.push(...fallback.executedActions);
        activeDiagnostic = createActionFormatDiagnostic(
          true,
          rawActionCount,
        );
      } else if (
        rawActionCount === 0 &&
        isAdminMutationIntent(cleanPrompt)
      ) {
        finalReply =
          'Команда не выполнена: модель не передала серверу ни одного действия. Никакие изменения, отправки или публикации не выполнялись.';
        activeDiagnostic = createActionFormatDiagnostic(false, 0);
      } else {
        if (invalidActionCount > 0) {
          executedActions.push({
            tool: 'invalid_agent_action',
            ok: false,
            summary: `Отклонено или не распознано действий модели: ${invalidActionCount}; они не выполнялись.`,
          });
          activeDiagnostic = createActionFormatDiagnostic(false, rawActionCount);
        }

        const researchResultsForSecondPass: Array<{
          tool: string;
          data: unknown;
        }> = [];

        for (const action of actionsToExecute) {
          const exec = await executeAdminAgentTool(action);
          executedActions.push(exec.record);
          if (
            exec.record.ok &&
            exec.toolData &&
            (action.tool === 'search_open_sources' ||
              action.tool === 'research_specific_match')
          ) {
            researchResultsForSecondPass.push({
              tool: action.tool,
              data: exec.toolData,
            });
          }
        }

        if (researchResultsForSecondPass.length > 0 &&
            !executedActions.some((action) => !action.ok)) {
          const secondOutcome = await callConfiguredLlmWithDiagnostics([
            ...llmMessages,
            { role: 'assistant', content: firstRaw },
            {
              role: 'user',
              content: `РЕАЛЬНЫЕ РЕЗУЛЬТАТЫ ВЫПОЛНЕННЫХ ИНСТРУМЕНТОВ И ОТКРЫТЫХ ИСТОЧНИКОВ: ${JSON.stringify(
                researchResultsForSecondPass,
              )}. Теперь дай итоговый точный и честный ответ владельцу строго на основе этих реальных данных в формате JSON {"actions":[],"reply":"..."}; укажи, что именно найдено, не заявляй о действиях, которых не выполнял.`,
            },
          ]);
          const secondPassRaw = secondOutcome.content;
          if (secondOutcome.modelLabel) activeModelLabel = secondOutcome.modelLabel;
          if (!secondOutcome.ok && secondOutcome.diagnostic) {
            activeDiagnostic = secondOutcome.diagnostic;
          }

          const parsedSecond = secondPassRaw
            ? parseStructuredAgentJson(secondPassRaw)
            : null;
          if (parsedSecond) {
            const secondRawActions = extractRawAdminAgentActions(parsedSecond);
            if (secondRawActions.length > 0) {
              executedActions.push({
                tool: 'invalid_agent_action',
                ok: false,
                summary: `Второй ответ модели запросил ${secondRawActions.length} дополнительных действий; в режиме итогового отчета они запрещены и не выполнялись.`,
              });
              activeDiagnostic = createActionFormatDiagnostic(
                false,
                secondRawActions.length,
              );
            }
            finalReply = getStructuredReply(parsedSecond);
          }
        }

        if (!finalReply) {
          finalReply =
            getStructuredReply(parsed) ||
            (executedActions.length > 0
              ? executedActions.map((action) => action.summary).join('\n')
              : 'Модель не вернула команду для выполнения. На сайте ничего не изменено.');
        }
      }
    }
  }

  const scanActions = executedActions.filter(
    (action) => action.tool === 'scan_and_publish_matches',
  );
  if (executedActions.some((action) => !action.ok)) {
    finalReply = formatFailedActionReply(executedActions);
  } else if (scanActions.length > 0) {
    finalReply = scanActions.map((action) => action.summary).join('\n');
  }

  const assistantMsg: AiChatMessage = {
    id: `chat_${randomUUID().slice(0, 10)}`,
    role: 'assistant',
    content: finalReply,
    modelLabel: activeModelLabel || 'Локальный модуль сайта',
    executedActions: executedActions.length > 0 ? executedActions : undefined,
    diagnostic: activeDiagnostic,
    createdAt: new Date().toISOString(),
  };

  const allMessages = await mutateState((state) => {
    state.aiChatMessages.push(userMsg, assistantMsg);
    if (state.aiChatMessages.length > 60) {
      state.aiChatMessages = state.aiChatMessages.slice(-60);
    }
    return state.aiChatMessages;
  });

  return {
    userMessage: userMsg,
    assistantMessage: assistantMsg,
    messages: allMessages,
  };
}
