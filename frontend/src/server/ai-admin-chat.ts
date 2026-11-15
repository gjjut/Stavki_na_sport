import { randomUUID } from 'node:crypto';
import { isPaidPredictionSale, paidAtMs } from '../lib/admin-metrics';
import { BRAND_NAME } from '../lib/brand';
import {
  approveAiDraftToStorefront,
  broadcastDailyDigestToTelegram,
  buildCandidateLlmBaseUrls,
  postLlmChatCompletion,
  replaceDemoWithRealMatches,
  runAiScanAndGenerateCycle,
  runAutoSettlementCycle,
} from './ai-autopilot';
import {
  gatherMatchOpenSourceIntel,
  plusVibeSearchConnection,
  searchOpenSourcesForAdmin,
} from './ai-research';
import {
  computeAiPerformanceStats,
  computePlatformAnalytics,
  hasVerifiedSettledResult,
  mutateState,
  readState,
  StorageUnavailableError,
} from './database';
import { sendTelegramChannelAnnouncement } from './integrations';
import { assertInsuranceChangeAllowed, deleteUnownedPrediction, grantPredictionAccess } from './admin-prediction-policy';
import { applyAutopilotConfigPatch } from './autopilot-config-policy';
import { isActiveStorefrontPrediction, isLegacyStarterDemoPrediction } from './prediction-data-policy';
import {
  extractRawAdminAgentActions,
  formatAdminMatchScanSummary,
  isAdminMutationIntent,
  isDirectTelegramDigestCommand,
  isDraftOnlyMatchCollectionIntent,
  isMatchCollectionIntent,
  parseStructuredAgentJson,
  requestedMatchCount,
  resolveAdminAgentActions,
  SUPPORTED_ADMIN_AGENT_TOOLS,
} from './ai-admin-chat-protocol';
import type {
  AgentActionRequest,
  AgentLlmStructuredOutput,
} from './ai-admin-chat-protocol';
import type {
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

  const paidOrders = state.transactions.filter(isPaidPredictionSale);
  const totalRevenueRub = paidOrders.reduce((acc, t) => acc + t.amountRub, 0);
  const now = Date.now();
  const dayAgo = now - 24 * 3600_000;
  const revenue24hRub = paidOrders
    .filter((t) => paidAtMs(t) >= dayAgo && paidAtMs(t) <= now)
    .reduce((acc, t) => acc + t.amountRub, 0);

  const activePredictions = state.predictions
    .filter((p) => isActiveStorefrontPrediction(p))
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
    .filter((p) => !isLegacyStarterDemoPrediction(p) && hasVerifiedSettledResult(p))
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
      revenueBasis: 'Продажи прогнозов без пополнений, возвратов и заказов на сверке; страховка не вычтена. Это не денежный поток.',
      externalRefundReviewCount: state.transactions.filter((order) => order.externalRefundNotices?.length).length,
      totalUsersCount: state.users.length,
      pendingPartnerPayoutsCount: state.payouts.filter(
        (p) => p.status === 'PENDING',
      ).length,
      // Do not send customer emails or balances to the external model by default.
      // An explicit administrator prompt may still contain identifiers, so it must be handled carefully.
      recentUsersCount: Math.min(state.users.length, 10),
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
      const res = await searchOpenSourcesForAdmin(query, plusVibeSearchConnection(snap.aiAutopilot));
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
      const intel = await gatherMatchOpenSourceIntel({
        sport,
        leagueName,
        homeTeam,
        awayTeam,
        homeOdds: Number(args.homeOdds || 1.9),
        drawOdds: args.drawOdds ? Number(args.drawOdds) : null,
        awayOdds: Number(args.awayOdds || 2.0),
        plusVibeSearch: plusVibeSearchConnection(snap.aiAutopilot),
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
      }) + (res.warning ? ` ${res.warning}` : '');
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
          summary: `Удалено начальных демо-карточек: ${res.removedDemoCount}. Сканировано событий: ${res.scannedCount}; опубликовано прогнозов: ${res.createdCount} (${res.feedSource}).${res.warning ? ` ${res.warning}` : ''}`,
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
          ok: !res.warning,
          summary: `Сверка результатов: рассчитано матчей ${res.settledCount}, начислений на баланс ${res.compensatedBuyers}.${res.warning ? ` ${res.warning}` : ''}`,
        },
        toolData: res,
      };
    }

    if (tool === 'update_or_delete_prediction') {
      const q = String(args.predictionIdOrTeamQuery || '')
        .trim()
        .toLowerCase();
      const subAction = String(args.action || '').toUpperCase();
      if (!q) throw new Error('Укажите ID или название конкретного матча.');
      if (!['DELETE', 'MAKE_FREE', 'MAKE_FEATURED', 'SET_PRICE'].includes(subAction)) {
        throw new Error('Неизвестное действие с прогнозом.');
      }
      if (subAction === 'SET_PRICE' && (!Number.isFinite(Number(args.priceRub)) || Number(args.priceRub) < 50)) {
        throw new Error('Укажите корректную цену прогноза от 50 ₽.');
      }

      const msg = await mutateState((state) => {
        const exact = state.predictions.filter((p) => p.id.toLowerCase() === q);
        const matches = exact.length ? exact : state.predictions.filter(
          (p) => `${p.homeTeam} ${p.awayTeam}`.toLowerCase().includes(q),
        );
        if (matches.length === 0) throw new Error(`Матч по запросу «${q}» не найден`);
        if (matches.length > 1) throw new Error('Найдено несколько матчей. Укажите точный ID нужного прогноза.');
        const target = matches[0];

        if (subAction === 'DELETE') {
          deleteUnownedPrediction(state, target.id);
          return `Удален матч «${target.homeTeam} — ${target.awayTeam}»`;
        }
        if (subAction === 'MAKE_FREE') {
          assertInsuranceChangeAllowed(state, target, false);
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
        const nextPrice = Math.round(Number(args.priceRub));
        target.accessTier = 'PAID_SINGLE';
        target.singlePriceRub = nextPrice;
        return `Цена на матч «${target.homeTeam} — ${target.awayTeam}» изменена на ${nextPrice} ₽`;
      });

      return { record: { tool, ok: true, summary: msg } };
    }

    if (tool === 'configure_autopilot') {
      const summaryParts: string[] = [];
      await mutateState((state) => {
        // The chat cannot bypass the same validation used by the admin form.
        const next = applyAutopilotConfigPatch(state.aiAutopilot, args).config;
        state.aiAutopilot = next;
        if (args.mode !== undefined) summaryParts.push(`режим: ${next.mode}`);
        if (args.morningHourMsk !== undefined) summaryParts.push(`утро: ${next.morningHourMsk}:00 МСК`);
        if (args.eveningHourMsk !== undefined) summaryParts.push(`вечер: ${next.eveningHourMsk}:00 МСК`);
        if (args.maxPicksPerRun !== undefined) summaryParts.push(`матчей за слот: ${next.maxPicksPerRun}`);
        if (args.defaultAiPriceRub !== undefined) summaryParts.push(`цена: ${next.defaultAiPriceRub} ₽`);
        if (args.freeEveryNthPick !== undefined) summaryParts.push(`бесплатный каждый N-й: ${next.freeEveryNthPick}`);
        if (args.insureAiPicks !== undefined) summaryParts.push(`страховка: ${next.insureAiPicks ? 'вкл' : 'выкл'}`);
        if (args.openSourceResearchEnabled !== undefined) summaryParts.push(`поиск источников: ${next.openSourceResearchEnabled ? 'вкл' : 'выкл'}`);
      });
      return { record: { tool, ok: true, summary: `Настройки автопилота обновлены (${summaryParts.join(', ')})` } };
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
          state.aiAutopilot.runRevision = randomUUID();
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
      const code = String(args.code || '').trim().toUpperCase();
      if (!/^[A-Z0-9_-]{2,32}$/.test(code)) throw new Error('Укажите код промокода латиницей, без пробелов и посторонних символов.');
      const sub = String(args.action || '').toUpperCase();
      if (!['CREATE', 'DELETE'].includes(sub)) throw new Error('Неизвестное действие с промокодом.');
      const pct = Number(args.discountPercent);
      const maxUses = args.maxUses === undefined ? 200 : Number(args.maxUses);
      if (sub === 'CREATE' && (!Number.isInteger(pct) || pct < 5 || pct > 80 || !Number.isSafeInteger(maxUses) || maxUses < 1)) {
        throw new Error('Укажите скидку от 5 до 80% и положительный целый лимит активаций.');
      }

      const msg = await mutateState((state) => {
        if (sub === 'DELETE') {
          if (!state.promoCodes.some((c) => c.code.toUpperCase() === code)) throw new Error(`Промокод ${code} не найден.`);
          state.promoCodes = state.promoCodes.filter(
            (c) => c.code.toUpperCase() !== code,
          );
          return `Промокод ${code} удален`;
        }
        const existing = state.promoCodes.find(
          (c) => c.code.toUpperCase() === code,
        );
        if (existing) {
          throw new Error(`Промокод ${code} уже существует; существующий код не изменён.`);
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
          const q = String(args.teamQuery || '').trim().toLowerCase();
          if (!q) throw new Error('Укажите конкретный матч для подарка.');
          const candidates = state.predictions.filter((pred) =>
            pred.resultStatus === 'PENDING' &&
            (pred.id.toLowerCase() === q || `${pred.homeTeam} ${pred.awayTeam}`.toLowerCase().includes(q)),
          );
          if (candidates.length === 0) throw new Error('Подходящий активный матч не найден');
          if (candidates.length > 1) throw new Error('Найдено несколько матчей. Укажите точный ID прогноза.');
          const p = candidates[0];
          grantPredictionAccess(u, p.id);
          return `Клиенту ${u.email} открыт бесплатный доступ к матчу «${p.homeTeam} — ${p.awayTeam}»`;
        }
        if (sub !== 'CREDIT_BALANCE' || !Number.isFinite(Number(args.amountRub)) || Number(args.amountRub) <= 0) {
          throw new Error('Укажите положительную сумму начисления.');
        }
        const delta = Math.round(Number(args.amountRub));
        u.balanceRub += delta;
        return `Баланс клиента ${u.email} изменен (${delta >= 0 ? '+' : ''}${delta} ₽ → текущий: ${u.balanceRub} ₽)`;
      });

      return { record: { tool, ok: true, summary: msg } };
    }

    if (tool === 'telegram_channel_post') {
      const sub = String(args.action || 'DAILY_DIGEST').toUpperCase();
      if (sub === 'DAILY_DIGEST') {
        const res = await broadcastDailyDigestToTelegram();
        if (!res.sent) {
          return { record: { tool, ok: false, summary: res.error, ...(res.outcome === 'unknown' ? { outcome: 'unknown' as const } : {}) } };
        }
        return {
          record: {
            tool,
            ok: true,
            summary: `В Telegram-канал опубликована сводка матчей и открытой статистики.${res.warning ? ` ${res.warning}` : ''}`,
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
      if (!sent.sent) {
        return { record: { tool, ok: false, summary: sent.error, ...(sent.outcome === 'unknown' ? { outcome: 'unknown' as const } : {}) } };
      }
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
    // Multi-step operations may have committed some work before a later error.
    const outcomeUnknown = err instanceof StorageUnavailableError ||
      ['scan_and_publish_matches', 'replace_demo_matches', 'approve_all_drafts', 'run_settlement'].includes(tool);
    const message = err instanceof Error ? err.message : 'Ошибка выполнения действия';
    return {
      record: {
        tool,
        ok: false,
        ...(outcomeUnknown ? { outcome: 'unknown' as const } : {}),
        summary: outcomeUnknown
          ? `${message} Итог может быть частичным или неизвестным; проверьте витрину, черновики и журнал перед повтором.`
          : message,
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
  const hasUnknown = failures.some((action) => action.outcome === 'unknown');
  const lines = [
    hasUnknown
      ? 'Итог некоторых действий не подтверждён:'
      : successes.length > 0
        ? 'Выполнена только часть запрошенных действий:'
        : 'Команда не выполнена:',
    ...successes.map((action) => `✓ ${action.summary}`),
    ...failures.map((action) => `${action.outcome === 'unknown' ? '?' : '✗'} ${action.summary}`),
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

async function callConfiguredLlmWithDiagnostics(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
): Promise<LlmCallOutcome> {
  const cfg = (await readState()).aiAutopilot;
  const key = (cfg.llmApiKey || '').trim();
  if (cfg.llmProvider === 'BUILTIN_QUANT' || key.length <= 8) {
    return {
      ok: false, content: null,
      diagnostic: {
        code: 'KEY_NOT_SAVED',
        title: cfg.llmProvider === 'BUILTIN_QUANT'
          ? 'Выбран локальный режим: внешняя нейросеть не используется'
          : 'API-ключ нейросети не сохранён',
        technicalDetails: `Провайдер в настройках: ${cfg.llmProvider}.`,
        solutions: [
          'Откройте «Подключить / Проверить ключ API» вверху чата.',
          'Выберите провайдера, укажите его адрес, ключ и точный ID модели, затем нажмите «Проверить и сохранить».',
        ],
      },
    };
  }
  if (/\s/.test(key) || key.toLowerCase().includes('initial token')) {
    return {
      ok: false, content: null,
      diagnostic: {
        code: 'KEY_IS_NAME_NOT_SECRET', title: 'Некорректный формат сохранённого API-ключа',
        technicalDetails: 'В ключе есть пробелы или указано название вместо секретного токена.',
        solutions: ['Скопируйте сам секретный ключ у провайдера и сохраните его заново.'],
      },
    };
  }
  const base = buildCandidateLlmBaseUrls(cfg.llmBaseUrl, cfg.llmProvider, key)[0];
  const model = cfg.llmModel.trim();
  if (!base || !model) {
    return {
      ok: false, content: null,
      diagnostic: {
        code: 'INVALID_LLM_CONFIG', title: 'Проверьте провайдера, адрес API и ID модели',
        technicalDetails: 'Адрес должен использовать HTTPS и не содержать ключ или параметры в URL; ключ PlusVibe предназначен для соответствующего провайдера.',
        solutions: ['Укажите подходящий провайдер, адрес, ключ и точный ID модели в настройках подключения.'],
      },
    };
  }
  const result = await postLlmChatCompletion({
    baseUrl: base, apiKey: key, model, temperature: 0.25,
    timeoutMs: 24_000, allowRetry: false, messages,
  });
  if (result.ok && result.content) {
    const returnedModel = result.returnedModel && !result.returnedModel.includes(key)
      ? result.returnedModel : null;
    const requestedModel = model.includes(key) ? '[скрыто]' : model;
    const label = returnedModel
      ? `ID по ответу провайдера: ${returnedModel}`
      : `Запрошена: ${requestedModel}; ID в ответе не указан`;
    return { ok: true, content: result.content, modelLabel: `${cfg.llmProvider} · ${label}` };
  }
  const status = result.status;
  const snippet = result.rawError.toLowerCase().includes('<html')
    ? 'Шлюз вернул HTML вместо ответа API.'
    : result.rawError.replace(/\s+/g, ' ').trim().slice(0, 200) || 'Нет данных об ошибке.';
  const title = status === 401 || status === 403
    ? `Провайдер отклонил ключ или доступ к модели (HTTP ${status})`
    : status === 402
      ? 'Провайдер сообщил о платёжном ограничении (HTTP 402)'
      : status === 429
        ? 'Провайдер ограничил частоту запросов (HTTP 429)'
        : status
          ? `Выбранная модель не ответила (HTTP ${status})`
          : 'Не удалось связаться с сервером нейросети';
  return {
    ok: false, content: null,
    diagnostic: {
      code: status ? `LLM_HTTP_${status}` : 'NETWORK_OR_TIMEOUT',
      title,
      technicalDetails: `API: ${base} · Модель: ${model} · ${snippet}`,
      solutions: [
        'Проверьте соединение сервера, ключ и точный ID модели у выбранного провайдера.',
        'Кнопка проверки запускает один тестовый запрос выбранной модели; другие модели автоматически не подбираются.',
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
    !isAdminMutationIntent(userText) &&
    (lower.includes('модел') ||
      lower.includes('кто ты') ||
      lower === 'привет' ||
      lower.startsWith('привет '))
  ) {
    return {
      executedActions,
      reply:
        diagnostic?.code === 'KEY_NOT_SAVED'
          ? `Привет! В выбранной конфигурации внешняя нейросеть сейчас не используется; отвечает встроенный алгоритм управления ${BRAND_NAME}.\n\nОткройте «Подключить / Проверить ключ API», выберите провайдера и точный ID модели. Результат каждого последующего запроса будет показан отдельно; проверка соединения не гарантирует доступность модели.`
          : 'Привет! Запрос к внешней модели не дал ответа, поэтому отвечает встроенный модуль сайта. В блоке диагностики указаны доступные сведения об ошибке и шаги для проверки.',
    };
  }

  if (isDirectTelegramDigestCommand(userText)) {
    const res = await executeAdminAgentTool({ tool: 'telegram_channel_post', args: { action: 'DAILY_DIGEST' } });
    executedActions.push(res.record);
    return { executedActions, reply: res.record.summary };
  }

  // Любой запрос про новости / травмы / составы («проверь новости», «найди новости», «что по травмам»)
  if (
    !/(?:^|[\s,;:])не(?:\s+(?:надо|нужно))?\s+(?:ищи|ищите|искать|найди|проверяй|проверяйте|проверять|изучай|анализируй|запрашивай)/.test(lower) &&
    (lower.includes('новост') ||
      lower.includes('травм') ||
      lower.includes('состав') ||
      (lower.includes('проверь') && lower.includes('источник')))
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
    const count = requestedMatchCount(userText);
    if (count === null) return { executedActions, reply: 'Укажите от 1 до 8 прогнозов за один запуск. Сбор и публикация не выполнялись.' };
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

  if (isAdminMutationIntent(userText) && (lower.includes('цен') || lower.includes('автопилот'))) {
    const priceMatch = lower.match(/цен[ауые]?[^0-9]{0,20}(\d{2,7})/) || lower.match(/(\d{2,7})\s*(?:₽|руб)/);
    const proposed: AgentActionRequest[] = [];
    if (priceMatch) proposed.push({ tool: 'update_storefront_pricing', args: { defaultSinglePriceRub: Number(priceMatch[1]) } });
    if (lower.includes('включи') && lower.includes('автопилот')) {
      proposed.push({ tool: 'configure_autopilot', args: { mode: 'FULL_AUTOPILOT' } });
    }
    const resolution = resolveAdminAgentActions({ actions: proposed }, userText);
    for (const action of resolution.actionsToExecute) {
      const result = await executeAdminAgentTool(action);
      executedActions.push(result.record);
    }
    if (executedActions.length > 0) {
      return { executedActions, reply: executedActions.map((action) => action.summary).join('\n') };
    }
  }

  if (isAdminMutationIntent(userText) && lower.includes('промокод')) {
    const codeMatch = userText.match(/\b([A-Za-z0-9_-]{4,32})\b/);
    const pctMatch = userText.match(/(\d{1,2})\s*%/);
    const limitMatch = lower.match(/(\d+)\s*(?:активац|использован|раз)/);
    if (codeMatch && pctMatch) {
      const proposed = {
        tool: 'manage_promo_code',
        args: {
          action: 'CREATE', code: codeMatch[1].toUpperCase(), discountPercent: Number(pctMatch[1]),
          ...(limitMatch ? { maxUses: Number(limitMatch[1]) } : {}),
        },
      };
      const [action] = resolveAdminAgentActions({ actions: [proposed] }, userText).actionsToExecute;
      if (action) {
        const res = await executeAdminAgentTool(action);
        executedActions.push(res.record);
        return { executedActions, reply: res.record.summary };
      }
    }
  }

  if (isAdminMutationIntent(userText)) {
    return {
      executedActions,
      reply: 'Не удалось однозначно распознать поручение без внешней модели. Никаких изменений или публикаций не выполнялось. Уточните команду или воспользуйтесь соответствующим разделом админки.',
    };
  }

  const snap = await buildPlatformContextSnapshot();
  return {
    executedActions,
    reply: [
      `Сводка по вашему сайту **${snap.brandAndSettings.brandName}** прямо сейчас:`,
      `• Продажи прогнозов: **${snap.financeAndUsers.totalRevenueRub.toLocaleString('ru-RU')} ₽** (за 24ч: ${snap.financeAndUsers.revenue24hRub.toLocaleString('ru-RU')} ₽, заказов: ${snap.financeAndUsers.paidOrdersCount}). Пополнения, возвраты и заказы на сверке исключены; страховка не вычтена. Это не денежный поток.`,
      `• Возвратов ЮKassa на ручной сверке: **${snap.financeAndUsers.externalRefundReviewCount}**`,
      `• Активных прогнозов на витрине: **${snap.activePredictionsOnStorefront.length} шт.** · Черновиков ИИ: **${snap.autopilot.draftsInQueueCount} шт.**`,
      `• Режим ИИ-Автопилота: **${snap.autopilot.mode}** · Базовая цена: **${snap.brandAndSettings.defaultSinglePriceRub} ₽**`,
      `• Статистика сайта: **${snap.verifiedStats.wins} побед / ${snap.verifiedStats.losses} минусов** (${snap.verifiedStats.allTimeWinRatePct.toFixed(1)}%, результат ${snap.verifiedStats.allTimeNetProfitPct >= 0 ? '+' : ''}${snap.verifiedStats.allTimeNetProfitPct.toFixed(1)} ед.)`,
      ``,
      `💡 *Примечание:* этот ответ составлен алгоритмом сайта. При подключении внешней модели её текст и поддерживаемые команды дополнительно проверяются сервером. Наличие ключа не гарантирует доступность модели или выполнение любого поручения; фактический результат показан отдельно.`,
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
  historyStatus: 'saved' | 'unconfirmed';
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
    `Ты — ИИ-помощник администратора платформы ${BRAND_NAME}. Общайся по-русски и используй только перечисленные ниже серверные инструменты; не утверждай, что имеешь неограниченный доступ к базе.`,
    'Инструменты:',
    '1) search_open_sources: {"query":"..."} — запросить открытые источники; доступность и полнота поиска зависят от настроенной интеграции.',
    '2) research_specific_match: {"sport":"FOOTBALL|HOCKEY|TENNIS|ESPORTS|BASKETBALL|MMA","leagueName":"...","homeTeam":"...","awayTeam":"...","homeOdds":1.85,"drawOdds":3.5,"awayOdds":4.1} — собрать досье на конкретный матч из доступных источников.',
    '3) scan_and_publish_matches: {"count":3,"publishImmediately":true} — сканировать линию Фонбет/Леон; новости проверяются, если эта настройка включена. Выпускаются только кандидаты, прошедшие кодовые фильтры и AI-комитет; это не обещание выигрыша. При publishImmediately:false прошедшие кандидаты попадут в черновики.',
    '4) replace_demo_matches: {} — удалить стартовые демо-карточки и запустить проверенный сценарий сбора реальных матчей.',
    '5) approve_all_drafts: {} — выпустить всю очередь черновиков только по явно выраженной просьбе одобрить все черновики.',
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

  // The standard single-purpose digest command uses the verified site data directly;
  // it must not depend on an LLM generating a tool call or invented statistics.
  const firstOutcome: LlmCallOutcome = isDirectTelegramDigestCommand(cleanPrompt)
    ? { ok: false, content: null }
    : await callConfiguredLlmWithDiagnostics(llmMessages);
  let finalReply = '';
  // This tracks the actual displayed text, not merely whether a model was called.
  let replySource: 'MODEL' | 'SERVER' = 'SERVER';
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
        replySource = 'MODEL';
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
            if (finalReply) {
              replySource = 'MODEL';
              activeModelLabel = secondOutcome.modelLabel || activeModelLabel;
            }
          }
        }

        if (!finalReply) {
          const modelReply = getStructuredReply(parsed);
          if (modelReply) {
            finalReply = modelReply;
            replySource = 'MODEL';
          } else {
            finalReply = executedActions.length > 0
              ? executedActions.map((action) => action.summary).join('\n')
              : 'Модель не вернула команду для выполнения. На сайте ничего не изменено.';
          }
        }
      }
    }
  }

  const scanActions = executedActions.filter(
    (action) => action.tool === 'scan_and_publish_matches',
  );
  if (executedActions.some((action) => !action.ok)) {
    finalReply = formatFailedActionReply(executedActions);
    replySource = 'SERVER';
  } else if (scanActions.length > 0 || executedActions.some((action) => action.tool === 'telegram_channel_post')) {
    // Never rely on a model's pre-execution promise to describe a real publication.
    finalReply = executedActions.map((action) => action.summary).join('\n');
    replySource = 'SERVER';
  }

  const assistantMsg: AiChatMessage = {
    id: `chat_${randomUUID().slice(0, 10)}`,
    role: 'assistant',
    content: finalReply,
    replySource,
    modelLabel: activeModelLabel,
    executedActions: executedActions.length > 0 ? executedActions : undefined,
    diagnostic: activeDiagnostic,
    createdAt: new Date().toISOString(),
  };

  try {
    const allMessages = await mutateState((state) => {
      state.aiChatMessages.push(userMsg, assistantMsg);
      if (state.aiChatMessages.length > 60) {
        state.aiChatMessages = state.aiChatMessages.slice(-60);
      }
      return state.aiChatMessages;
    });
    return { userMessage: userMsg, assistantMessage: assistantMsg, messages: allMessages, historyStatus: 'saved' };
  } catch {
    // An action may already have completed before the history write or its
    // acknowledgement failed. Return its actual result rather than a false
    // request failure, and do not claim the history definitely was not saved.
    if (assistantMsg.replySource === 'MODEL') assistantMsg.replySource = 'MIXED';
    const telegram = executedActions.some((action) => action.tool === 'telegram_channel_post');
    assistantMsg.content += `\n\nВнимание: сохранение истории чата не подтверждено; этот ответ может пропасть после обновления страницы.${
      executedActions.length > 0
        ? ` Перед повтором проверьте результат действий${telegram ? ' и Telegram-канал' : ' на сайте'}.`
        : ''
    }`;
    return {
      userMessage: userMsg,
      assistantMessage: assistantMsg,
      messages: [...stateBefore.aiChatMessages, userMsg, assistantMsg].slice(-60),
      historyStatus: 'unconfirmed',
    };
  }
}
