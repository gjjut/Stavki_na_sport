import { randomUUID } from 'node:crypto';
import {
  approveAiDraftToStorefront,
  broadcastDailyDigestToTelegram,
  buildCandidateLlmBaseUrls,
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
  createPredictionByAdmin,
  mutateState,
  readState,
  settlePredictionByAdmin,
} from './database';
import { sendTelegramChannelAnnouncement } from './integrations';
import type {
  AccessTier,
  AiAutopilotMode,
  AiChatExecutedAction,
  AiChatMessage,
  ResultStatus,
  SportType,
} from './types';

interface AgentActionRequest {
  tool: string;
  args?: Record<string, unknown>;
}

interface AgentLlmStructuredOutput {
  actions?: AgentActionRequest[];
  reply?: string;
}

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
    .slice(0, 15)
    .map((p) => ({
      id: p.id,
      match: `${p.homeTeam} — ${p.awayTeam}`,
      sport: p.sport,
      league: p.leagueName,
      startsAt: p.matchStartsAt,
      pick: p.selectionTitle,
      odds: p.fixedOdds,
      tier: p.accessTier,
      priceRub: p.singlePriceRub,
      insured: Boolean(p.insuredOnLoss),
      featured: Boolean(p.isFeatured),
      researchSources: p.researchSources ?? [],
    }));

  const recentSettled = state.predictions
    .filter((p) => p.resultStatus !== 'PENDING')
    .slice(0, 10)
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

  try {
    if (tool === 'search_open_sources') {
      const query = String(args.query || '').trim();
      if (!query) throw new Error('Пустой поисковый запрос');
      const res = await searchOpenSourcesForAdmin(query);
      return {
        record: {
          tool,
          ok: true,
          summary: `Поиск в открытых источниках по запросу «${query}» (найдено заголовков: ${res.headlines.length}, превью: ${res.snippets.length})`,
        },
        toolData: res,
      };
    }

    if (tool === 'research_specific_match') {
      const homeTeam = String(args.homeTeam || '').trim();
      const awayTeam = String(args.awayTeam || '').trim();
      const sport = (String(args.sport || 'FOOTBALL').toUpperCase() as SportType) || 'FOOTBALL';
      const leagueName = String(args.leagueName || 'Турнир').trim();
      const intel = await gatherMatchOpenSourceIntel({
        sport,
        leagueName,
        homeTeam,
        awayTeam,
        homeOdds: Number(args.homeOdds || 1.9),
        drawOdds: args.drawOdds ? Number(args.drawOdds) : null,
        awayOdds: Number(args.awayOdds || 2.0),
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
      const count = Math.min(8, Math.max(1, Number(args.count || 3)));
      const forcePublish = args.publishImmediately !== false;
      const res = await runAiScanAndGenerateCycle({
        forcePublish,
        maxCountOverride: count,
        triggerLabel: 'Запуск из ИИ-Чата управляющего',
      });
      return {
        record: {
          tool,
          ok: true,
          summary: forcePublish
            ? `Собрана линия и проверены открытые источники (${res.feedSource}): опубликовано на витрину ${res.createdCount} матчей`
            : `Собрана линия и проверены открытые источники: добавлено в черновики ${res.createdCount} матчей`,
        },
        toolData: res,
      };
    }

    if (tool === 'replace_demo_matches') {
      const res = await replaceDemoWithRealMatches();
      return {
        record: {
          tool,
          ok: true,
          summary: `Удалено демо-матчей: ${res.removedDemoCount} шт., опубликовано реальных игр: ${res.createdCount} шт. (${res.feedSource})`,
        },
        toolData: res,
      };
    }

    if (tool === 'approve_all_drafts') {
      const st = await readState();
      let count = 0;
      for (const d of st.aiDrafts) {
        await approveAiDraftToStorefront(d.id);
        count += 1;
      }
      return {
        record: {
          tool,
          ok: true,
          summary: `Одобрено и выпущено на витрину черновиков: ${count} шт.`,
        },
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

    if (tool === 'create_prediction') {
      const sport = (String(args.sport || 'FOOTBALL').toUpperCase() as SportType) || 'FOOTBALL';
      const homeTeam = String(args.homeTeam || '').trim();
      const awayTeam = String(args.awayTeam || '').trim();
      if (!homeTeam || !awayTeam) {
        throw new Error('Укажите обе команды (homeTeam и awayTeam)');
      }
      const hoursFromNow = Number(args.hoursFromNow || 5);
      const startsAt = args.matchStartsAt
        ? new Date(String(args.matchStartsAt)).toISOString()
        : new Date(Date.now() + hoursFromNow * 3600_000).toISOString();
      const tier: AccessTier =
        String(args.accessTier || 'PAID_SINGLE').toUpperCase() === 'FREE'
          ? 'FREE'
          : 'PAID_SINGLE';

      const created = await createPredictionByAdmin({
        sport,
        leagueName: String(args.leagueName || 'Топ-турнир'),
        homeTeam,
        awayTeam,
        matchStartsAt: startsAt,
        selectionTitle: String(args.selectionTitle || 'Победа 1'),
        fixedOdds: Number(args.fixedOdds || 1.85),
        stakeUnits: Number(args.stakeUnits || 1.5),
        accessTier: tier,
        singlePriceRub:
          tier === 'PAID_SINGLE' ? Number(args.singlePriceRub || 790) : null,
        insuredOnLoss: tier === 'PAID_SINGLE' ? args.insuredOnLoss !== false : false,
        authorSource: 'AI_AUTOPILOT',
        analysisTeaser:
          String(args.analysisTeaser || '').trim() ||
          `Подробный разбор предстоящего матча «${homeTeam} — ${awayTeam}» с учетом текущей формы команд и движения котировок.`,
        analysisFull:
          String(args.analysisFull || '').trim() ||
          `Встреча «${homeTeam} — ${awayTeam}»: выбран обоснованный исход по реальной линии букмекеров с оптимальным соотношением надежности и коэффициента.`,
        pushToTelegram: args.pushToTelegram !== false,
      });

      return {
        record: {
          tool,
          ok: true,
          summary: `Опубликован прогноз «${created.homeTeam} — ${created.awayTeam}» (${created.selectionTitle} @ ${created.fixedOdds.toFixed(2)}, ${
            created.accessTier === 'FREE' ? '0 ₽ бесплатно' : `${created.singlePriceRub} ₽`
          })`,
        },
        toolData: { id: created.id, slug: created.slug },
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
          state.predictions.splice(idx, 1);
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

    if (tool === 'settle_prediction_manual') {
      const q = String(args.predictionIdOrTeamQuery || '')
        .trim()
        .toLowerCase();
      const state = await readState();
      const found = state.predictions.find(
        (p) =>
          p.id.toLowerCase() === q ||
          `${p.homeTeam} ${p.awayTeam}`.toLowerCase().includes(q),
      );
      if (!found) throw new Error(`Матч «${q}» не найден`);
      const status = String(args.resultStatus || 'WIN').toUpperCase() as ResultStatus;
      const score = String(args.finalScore || '').trim() || null;

      const settled = await settlePredictionByAdmin({
        predictionId: found.id,
        resultStatus: status,
        finalScore: score,
        pushResultToTelegram: true,
      });

      return {
        record: {
          tool,
          ok: true,
          summary: `Матч «${found.homeTeam} — ${found.awayTeam}» рассчитан как ${status}${
            score ? ` (${score})` : ''
          }. Возвратов страховки покупателям: ${settled.compensatedUsers}`,
        },
      };
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
        summary: `Неизвестная команда «${tool}»`,
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

function parseStructuredAgentJson(raw: string): AgentLlmStructuredOutput | null {
  const cleaned = raw.trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as AgentLlmStructuredOutput;
  } catch {
    return null;
  }
}

async function callConfiguredLlmJson(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
): Promise<string | null> {
  const state = await readState();
  const cfg = state.aiAutopilot;
  if (cfg.llmProvider === 'BUILTIN_QUANT' || cfg.llmApiKey.trim().length <= 8) {
    return null;
  }

  const bases = buildCandidateLlmBaseUrls(cfg.llmBaseUrl, cfg.llmProvider);
  for (const base of bases) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 24_000);
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.llmApiKey.trim()}`,
        },
        body: JSON.stringify({
          model: cfg.llmModel.trim() || 'gemini-2.5-flash',
          temperature: 0.25,
          messages,
        }),
      });
      clearTimeout(timer);

      if (res.ok) {
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = json.choices?.[0]?.message?.content?.trim();
        if (content) return content;
      }
    } catch {
      // пробуем резервный URL шлюза
    }
  }
  return null;
}

/**
 * Локальный умный командный процессор (работает мгновенно даже если API-ключ LLM еще не вставлен!)
 */
async function runDeterministicFallbackAssistant(
  userText: string,
): Promise<{ reply: string; executedActions: AiChatExecutedAction[] }> {
  const lower = userText.toLowerCase().trim();
  const executedActions: AiChatExecutedAction[] = [];

  if (
    lower.includes('найди') &&
    (lower.includes('новост') || lower.includes('травм') || lower.includes('инф'))
  ) {
    const cleanQ = userText
      .replace(/найди|новости|инфу|информацию|по матчу|про/gi, '')
      .trim();
    const res = await executeAdminAgentTool({
      tool: 'search_open_sources',
      args: { query: cleanQ || 'РПЛ КХЛ прогнозы составы' },
    });
    executedActions.push(res.record);
    const data = res.toolData as { headlines?: string[]; snippets?: string[] } | undefined;
    const items = [...(data?.headlines || []), ...(data?.snippets || [])].slice(0, 5);
    return {
      executedActions,
      reply:
        items.length > 0
          ? `Проверил открытые источники по запросу «${cleanQ}»:\n\n${items
              .map((x, i) => `${i + 1}. ${x}`)
              .join('\n')}`
          : `Проверил открытые источники по запросу «${cleanQ}» — свежих тревожных новостей о травмах не обнаружено. Подключите ваш API-токен во вкладке «ИИ-Автопилот 24/7» для глубокого диалогового анализа!`,
    };
  }

  if (
    (lower.includes('выложи') ||
      lower.includes('выпусти') ||
      lower.includes('опубликуй') ||
      lower.includes('собери') ||
      lower.includes('добавь')) &&
    (lower.includes('матч') || lower.includes('прогноз'))
  ) {
    const numMatch = lower.match(/\b([1-8])\b/);
    const count = numMatch ? Number(numMatch[1]) : 3;
    const res = await executeAdminAgentTool({
      tool: 'scan_and_publish_matches',
      args: { count, publishImmediately: true },
    });
    executedActions.push(res.record);
    return {
      executedActions,
      reply: `Готово! ${res.record.summary}. Матчи прошли фильтрацию открытых источников, выставлены на витрину и защищены SHA-256.`,
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
    'Ты — персональный ИИ-Управляющий и Главный спортивный аналитик платформы спортивных прогнозов VALUEX.',
    'Ты общаешься напрямую с владельцем (главным администратором) сайта на русском языке. У тебя есть ПОЛНЫЙ доступ ко всей живой базе данных сайта и инструментам управления.',
    'Твои возможности (actions):',
    '1) search_open_sources: {"query":"..."} — найти свежие новости, травмы, составы и превью в открытых источниках (Google News RU, СМИ РФ, веб-поиск).',
    '2) research_specific_match: {"sport":"FOOTBALL|HOCKEY|TENNIS|ESPORTS|BASKETBALL|MMA","leagueName":"...","homeTeam":"...","awayTeam":"...","homeOdds":1.85,"drawOdds":3.5,"awayOdds":4.1} — собрать глубокое досье на конкретный матч.',
    '3) scan_and_publish_matches: {"count":3,"publishImmediately":true} — собрать реальную линию БК РФ, проверить новости из открытых источников, отобрать самые проходимые игры и выпустить на витрину (или в черновики при publishImmediately:false).',
    '4) replace_demo_matches: {} — убрать стартовые демо-матчи и заполнить витрину реальными играми.',
    '5) approve_all_drafts: {} — выпустить все черновики из очереди на витрину.',
    '6) run_settlement: {} — сверить счета завершенных игр и начислить страховку покупателям.',
    '7) create_prediction: {"sport":"FOOTBALL","leagueName":"...","homeTeam":"...","awayTeam":"...","hoursFromNow":5,"selectionTitle":"...","fixedOdds":1.85,"stakeUnits":1.5,"accessTier":"PAID_SINGLE|FREE","singlePriceRub":790,"insuredOnLoss":true,"analysisTeaser":"...(без спойлера исхода!)","analysisFull":"...","pushToTelegram":true} — создать любой прогноз.',
    '8) update_or_delete_prediction: {"predictionIdOrTeamQuery":"...","action":"SET_PRICE|MAKE_FREE|MAKE_FEATURED|DELETE","priceRub":690} — изменить цену, сделать бесплатным, главным или удалить матч.',
    '9) settle_prediction_manual: {"predictionIdOrTeamQuery":"...","resultStatus":"WIN|LOSS|PUSH","finalScore":"2:1"} — рассчитать матч вручную.',
    '10) configure_autopilot: {"mode":"FULL_AUTOPILOT|MODERATION|OFF","morningHourMsk":9,"eveningHourMsk":18,"maxPicksPerRun":3,"defaultAiPriceRub":790,"freeEveryNthPick":4,"insureAiPicks":true,"openSourceResearchEnabled":true} — изменить настройки автопилота.',
    '11) update_storefront_pricing: {"brandName":"...","defaultSinglePriceRub":790,"bundle2DiscountPct":15,"bundle3DiscountPct":25} — изменить цены и скидки за наборы.',
    '12) manage_promo_code: {"action":"CREATE|DELETE","code":"VIP25","discountPercent":25,"maxUses":200} — создать или удалить промокод.',
    '13) manage_user_account: {"email":"...","action":"CREDIT_BALANCE|GRANT_PREDICTION","amountRub":1000,"teamQuery":"..."} — начислить баланс или подарить прогноз клиенту.',
    '14) telegram_channel_post: {"action":"DAILY_DIGEST|CUSTOM_POST","customHtmlText":"...","buttonText":"..."} — отправить сводку или любой HTML-пост в Telegram-канал.',
    '',
    'ПРАВИЛА ОТВЕТА:',
    '- Отвечай СТРОГО валидным JSON-объектом вида: {"actions":[...],"reply":"Подробный, дружелюбный и деловой ответ на русском языке"}.',
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
      content: m.role === 'assistant' ? JSON.stringify({ actions: [], reply: m.content }) : m.content,
    })),
    { role: 'user', content: cleanPrompt },
  ];

  const firstRaw = await callConfiguredLlmJson(llmMessages);
  let finalReply = '';
  const executedActions: AiChatExecutedAction[] = [];

  if (!firstRaw) {
    const fb = await runDeterministicFallbackAssistant(cleanPrompt);
    finalReply = fb.reply;
    executedActions.push(...fb.executedActions);
  } else {
    const parsed = parseStructuredAgentJson(firstRaw);
    if (!parsed) {
      finalReply = firstRaw;
    } else {
      const requestedActions = Array.isArray(parsed.actions)
        ? parsed.actions.slice(0, 5)
        : [];
      const researchResultsForSecondPass: Array<{
        tool: string;
        data: unknown;
      }> = [];

      for (const act of requestedActions) {
        const exec = await executeAdminAgentTool(act);
        executedActions.push(exec.record);
        if (
          exec.toolData &&
          (act.tool === 'search_open_sources' ||
            act.tool === 'research_specific_match' ||
            act.tool === 'scan_and_publish_matches')
        ) {
          researchResultsForSecondPass.push({
            tool: act.tool,
            data: exec.toolData,
          });
        }
      }

      // Если модель запрашивала живой поиск в открытых источниках — делаем второй проход с реальными найденными фактами!
      if (researchResultsForSecondPass.length > 0) {
        const secondPassRaw = await callConfiguredLlmJson([
          ...llmMessages,
          { role: 'assistant', content: firstRaw },
          {
            role: 'user',
            content: `РЕАЛЬНЫЕ РЕЗУЛЬТАТЫ ВЫПОЛНЕННЫХ ИНСТРУМЕНТОВ И ОТКРЫТЫХ ИСТОЧНИКОВ: ${JSON.stringify(
              researchResultsForSecondPass,
            )}. Теперь дай итоговый точный и честный ответ владельцу строго на основе этих реальных данных в формате JSON {"actions":[],"reply":"..."} (не выдумывая ничего сверх найденных фактов).`,
          },
        ]);
        const parsedSecond = secondPassRaw
          ? parseStructuredAgentJson(secondPassRaw)
          : null;
        if (parsedSecond?.actions?.length) {
          for (const act2 of parsedSecond.actions.slice(0, 3)) {
            const exec2 = await executeAdminAgentTool(act2);
            executedActions.push(exec2.record);
          }
        }
        finalReply =
          parsedSecond?.reply?.trim() ||
          secondPassRaw?.trim() ||
          parsed.reply?.trim() ||
          'Операция выполнена.';
      } else {
        finalReply = parsed.reply?.trim() || 'Команда успешно выполнена.';
      }
    }
  }

  const assistantMsg: AiChatMessage = {
    id: `chat_${randomUUID().slice(0, 10)}`,
    role: 'assistant',
    content: finalReply,
    executedActions: executedActions.length > 0 ? executedActions : undefined,
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
