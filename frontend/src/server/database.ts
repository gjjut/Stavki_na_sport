import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { explainMarketInPlainRussian } from '../lib/plain-russian';
import { hashPassword, verifyPassword } from './auth';
import {
  createYooKassaLivePayment,
  sendTelegramChannelAnnouncement,
  sendTelegramDirectMessage,
  verifyYooKassaLivePayment,
} from './integrations';
import type {
  AccessTier,
  AffiliateLinkRecord,
  AiAutopilotConfig,
  AiAutopilotLogEntry,
  AiChatMessage,
  AiPerformanceStats,
  AiPredictionDraft,
  EquityPoint,
  MatchStatus,
  OrderTransaction,
  PayoutRequestRecord,
  PlatformSettings,
  PredictionRecord,
  PromoCodeRecord,
  PublicPredictionDto,
  RecentWinFeedItem,
  ResultStatus,
  SafeSessionUser,
  SportBreakdownItem,
  SportType,
  StatsSummary,
  UserAccount,
} from './types';

export interface PersistentState {
  settings: PlatformSettings;
  users: UserAccount[];
  predictions: PredictionRecord[];
  transactions: OrderTransaction[];
  promoCodes: PromoCodeRecord[];
  affiliateLinks: AffiliateLinkRecord[];
  payouts: PayoutRequestRecord[];
  processedWebhooks: string[];
  aiAutopilot: AiAutopilotConfig;
  aiDrafts: AiPredictionDraft[];
  aiLogs: AiAutopilotLogEntry[];
  aiChatMessages: AiChatMessage[];
}

const DATA_DIR = path.join(process.cwd(), '.data');
const LOCAL_DB_FILE = path.join(DATA_DIR, 'valuex-production.json');

export function computeCanonicalSha256(params: {
  matchStartsAt: string;
  selectionTitle: string;
  fixedOdds: number;
  stakeUnits: number;
}): { canonical: string; sha256: string } {
  const canonical = `${params.matchStartsAt}|${params.selectionTitle.trim()}|${params.fixedOdds.toFixed(
    3,
  )}|${params.stakeUnits.toFixed(2)}`;
  const sha256 = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return { canonical, sha256 };
}

const CYR_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ы: 'y', э: 'e', ю: 'yu', я: 'ya',
};

function slugifyMatch(home: string, away: string, suffix: string): string {
  const raw = `${home}-${away}`
    .toLowerCase()
    .split('')
    .map((ch) => CYR_MAP[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${raw || 'match'}-${suffix}`;
}

function makeUserTelegramLinkCode(userId: string): string {
  const hash = createHash('sha256')
    .update(`tglink:${userId}`, 'utf8')
    .digest('hex')
    .slice(0, 10);
  return `vx_${hash}`;
}

function createInitialState(): PersistentState {
  const now = Date.now();
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@valuex.pro').trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin2026!';

  const settings: PlatformSettings = {
    brandName: 'VALUEX',
    supportTelegram: 'https://t.me/valuex_support',
    freeTelegramUrl: 'https://t.me/valuex_analytics',
    legalSellerName: 'Самозанятый / ИП (укажите реквизиты в Админ-панели)',
    legalInn: 'ИНН 000000000000',
    supportEmail: 'support@valuex.pro',
    paymentMode: 'TEST_INSTANT',
    yookassaShopId: process.env.YOOKASSA_SHOP_ID || '',
    yookassaSecretKey: process.env.YOOKASSA_SECRET_KEY || '',
    yookassaVatCode: Number(process.env.YOOKASSA_VAT_CODE || 1),
    defaultSinglePriceRub: 790,
    bundle2DiscountPct: 15,
    bundle3DiscountPct: 25,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramChannelId:
      process.env.TELEGRAM_CHANNEL_ID || process.env.TELEGRAM_VIP_CHANNEL_ID || '',
    telegramBotUsername: '',
    yandexMetrikaId: process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID || '',
  };

  const adminUser: UserAccount = {
    id: 'usr_admin_root',
    email: adminEmail,
    passwordHash: hashPassword(adminPassword),
    displayName: 'Главный аналитик',
    city: 'Москва',
    role: 'ADMIN',
    status: 'ACTIVE',
    balanceRub: 0,
    referenceBankrollRub: 100_000,
    telegramUsername: '@valuex_admin',
    telegramChatId: null,
    telegramLinkCode: makeUserTelegramLinkCode('usr_admin_root'),
    purchasedPredictionIds: [],
    referralCode: 'valuex_official',
    referredByUserId: null,
    referredByCode: null,
    revsharePercent: 30,
    affiliateBalanceRub: 0,
    affiliateTotalEarnedRub: 0,
    createdAt: new Date(now - 90 * 86400 * 1000).toISOString(),
    lastLoginAt: new Date(now).toISOString(),
  };

  const makeSeed = (
    idx: number,
    opts: {
      sport: SportType;
      league: string;
      home: string;
      away: string;
      offsetHours: number;
      matchStatus: MatchStatus;
      stake: number;
      odds: number;
      minOdds: number;
      selection: string;
      teaser: string;
      full: string;
      tier: AccessTier;
      price: number | null;
      result: ResultStatus;
      score: string | null;
      featured?: boolean;
      insured?: boolean;
      cashoutMult?: number;
    },
  ): PredictionRecord => {
    const startsIso = new Date(now + opts.offsetHours * 3600 * 1000).toISOString();
    const lockedIso = new Date(now + (opts.offsetHours - 5) * 3600 * 1000).toISOString();
    const settledIso =
      opts.result !== 'PENDING'
        ? new Date(now + (opts.offsetHours + 3) * 3600 * 1000).toISOString()
        : null;

    let profit: number | null = null;
    if (opts.result === 'WIN') profit = Number((opts.stake * (opts.odds - 1)).toFixed(2));
    else if (opts.result === 'LOSS') profit = -opts.stake;
    else if (opts.result === 'PUSH') profit = 0;
    else if (opts.result === 'CASHOUT') {
      profit = Number((opts.stake * ((opts.cashoutMult ?? 1.5) - 1)).toFixed(2));
    }

    const { sha256 } = computeCanonicalSha256({
      matchStartsAt: startsIso,
      selectionTitle: opts.selection,
      fixedOdds: opts.odds,
      stakeUnits: opts.stake,
    });

    return {
      id: `pred_init_${idx}`,
      slug: slugifyMatch(opts.home, opts.away, String(100 + idx)),
      sport: opts.sport,
      leagueName: opts.league,
      homeTeam: opts.home,
      awayTeam: opts.away,
      matchStartsAt: startsIso,
      matchStatus: opts.matchStatus,
      stakePercent: opts.stake,
      stakeUnits: opts.stake,
      bookmakerSource: 'Фонбет · Винлайн · Пари',
      analysisTeaser: opts.teaser,
      isFeatured: Boolean(opts.featured),
      insuredOnLoss: opts.insured ?? opts.tier === 'PAID_SINGLE',
      selectionTitle: opts.selection,
      fixedOdds: opts.odds,
      minAcceptableOdds: opts.minOdds,
      analysisFull: opts.full,
      accessTier: opts.tier,
      singlePriceRub: opts.price,
      revealAfterFinish: true,
      resultStatus: opts.result,
      cashoutMultiplier: opts.cashoutMult ?? null,
      finalScore: opts.score,
      profitUnits: profit,
      profitPercent: profit,
      verificationHash: sha256,
      oddsLockedAt: lockedIso,
      settledAt: settledIso,
      createdAt: lockedIso,
    };
  };

  const predictions: PredictionRecord[] = [
    makeSeed(1, {
      sport: 'FOOTBALL',
      league: 'Лига Чемпионов · Плей-офф',
      home: 'Реал Мадрид',
      away: 'Бавария',
      offsetHours: 2.8,
      matchStatus: 'UPCOMING',
      stake: 2.5,
      odds: 2.04,
      minOdds: 1.9,
      selection: 'Фора 1 (-1.0)',
      teaser:
        'У гостей из-за травмы не сыграет ключевой защитник левого края, а мадридцы дома стабильно забивают по 2–3 мяча в вечерних играх плей-офф.',
      full: '1. У «Баварии» пропускает встречу основной опорный полузащитник, из-за чего оборона гостей регулярно проваливается при быстрых атаках.\n2. Дома на «Сантьяго Бернабеу» мадридцы мощно проводят концовки обоих таймов. При победе в 2+ мяча ставка приносит чистый плюс, а при победе ровно в 1 мяч (например, 1:0 или 2:1) букмекер полностью вернет вам сумму ставки.\n3. Выгодно брать в Фонбет, Винлайн или Пари при коэффициенте от 1.90 и выше.',
      tier: 'PAID_SINGLE',
      price: 990,
      result: 'PENDING',
      score: null,
      featured: true,
      insured: true,
    }),
    makeSeed(2, {
      sport: 'HOCKEY',
      league: 'КХЛ · Регулярный чемпионат',
      home: 'Локомотив',
      away: 'СКА',
      offsetHours: 1.6,
      matchStatus: 'UPCOMING',
      stake: 2.0,
      odds: 1.98,
      minOdds: 1.86,
      selection: 'Индивидуальный тотал 1 больше (2.5)',
      teaser:
        'Для гостей это уже третья тяжелая выездная игра подряд за 5 дней, и сегодня место в воротах займет запасной вратарь.',
      full: '1. Ярославский «Локомотив» отлично реализует большинство на домашнем льду — почти каждая четвертая попытка заканчивается шайбой.\n2. На фоне усталости после перелетов гости заметно сбавляют скорость во втором и третьем периодах и начинают чаще удаляться. Для выигрыша ставки нужно минимум 3 шайбы от «Локомотива».',
      tier: 'PAID_SINGLE',
      price: 790,
      result: 'PENDING',
      score: null,
      insured: true,
    }),
    makeSeed(3, {
      sport: 'FOOTBALL',
      league: 'Россия · Мир РПЛ',
      home: 'Краснодар',
      away: 'Зенит',
      offsetHours: 4.2,
      matchStatus: 'UPCOMING',
      stake: 2.0,
      odds: 1.88,
      minOdds: 1.78,
      selection: 'Обе забьют: Да',
      teaser:
        'Бесплатный открытый прогноз дня: принципиальная битва лидеров РПЛ при полных трибунах в Краснодаре, где команды традиционно играют на встречных курсах.',
      full: '1. Открытый пример нашего разбора: в 5 последних очных встречах подряд в Краснодаре обе команды неизменно забивали друг другу.\n2. Турнирная таблица вынуждает оба клуба играть только на победу — отсиживаться в обороне никто не будет, а линии атаки обеих команд в полном боевом составе.\n3. Ставка выиграет при любом счете, где забьют обе стороны (1:1, 2:1, 1:2 и т.д.).',
      tier: 'FREE',
      price: null,
      result: 'PENDING',
      score: null,
      insured: false,
    }),
    makeSeed(4, {
      sport: 'ESPORTS',
      league: 'CS2 · Плей-офф турнира',
      home: 'Team Spirit',
      away: 'MOUZ',
      offsetHours: 5.5,
      matchStatus: 'UPCOMING',
      stake: 2.0,
      odds: 1.92,
      minOdds: 1.82,
      selection: 'Победа 1',
      teaser:
        'Российская команда Team Spirit подходит к матчу на серии из 5 уверенных побед и имеет явное преимущество на любимых картах.',
      full: '1. Сопернику придется убрать свою сильнейшую карту еще до старта, поэтому игра пойдет на удобных для Spirit локациях.\n2. Лидеры нашей команды находятся в отличной индивидуальной форме и забирают более 80% ключевых раундов.',
      tier: 'PAID_SINGLE',
      price: 790,
      result: 'PENDING',
      score: null,
      insured: true,
    }),
    makeSeed(5, {
      sport: 'TENNIS',
      league: 'ATP Masters · Хард',
      home: 'Карлос Алькарас',
      away: 'Алекс де Минаур',
      offsetHours: 6.8,
      matchStatus: 'UPCOMING',
      stake: 2.0,
      odds: 1.91,
      minOdds: 1.82,
      selection: 'Тотал геймов меньше (22.5)',
      teaser:
        'Медленное покрытие корта идеально подходит под мощные удары Алькараса и лишает соперника главного козыря — быстрых контратак.',
      full: '1. В личных встречах на таком покрытии Алькарас уверенно держит свою подачу и регулярно делает брейки в середине каждого сета.\n2. Ожидаем спокойную победу фаворита в двух партиях (например, 6:4, 6:3) без затяжного третьего сета.',
      tier: 'PAID_SINGLE',
      price: 690,
      result: 'PENDING',
      score: null,
      insured: true,
    }),
    makeSeed(6, {
      sport: 'FOOTBALL',
      league: 'Англия · Премьер-лига',
      home: 'Арсенал',
      away: 'Ньюкасл',
      offsetHours: -0.4,
      matchStatus: 'LIVE',
      stake: 2.0,
      odds: 1.94,
      minOdds: 1.84,
      selection: 'Индивидуальный тотал 1 больше (2.0)',
      teaser:
        'Матч уже начался: прогноз был опубликован заранее за 5 часов до стартового свистка по высокому коэффициенту.',
      full: 'Мощное давление хозяев с первых минут и опасные угловые у ворот ослабленной защиты гостей.',
      tier: 'PAID_SINGLE',
      price: 790,
      result: 'PENDING',
      score: "1:0 (34')",
      insured: true,
    }),

    // Рассчитанный архив
    makeSeed(7, {
      sport: 'TENNIS',
      league: 'ATP Finals · Хард',
      home: 'Янник Синнер',
      away: 'Даниил Медведев',
      offsetHours: -24,
      matchStatus: 'FINISHED',
      stake: 2.5,
      odds: 2.04,
      minOdds: 1.92,
      selection: 'Фора 1 по геймам (-3.5)',
      teaser: 'Закрытое покрытие дало решающий перевес на первой подаче (83% выигранных мячей).',
      full: 'Забрали 2.04 по ранней линии (к началу матча коэффициент опустился до 1.85). Победа в двух сетах.',
      tier: 'PAID_SINGLE',
      price: 790,
      result: 'WIN',
      score: '6:3, 6:4',
    }),
    makeSeed(8, {
      sport: 'HOCKEY',
      league: 'КХЛ · Регулярный чемпионат',
      home: 'Авангард',
      away: 'Металлург Мг',
      offsetHours: -54,
      matchStatus: 'FINISHED',
      stake: 2.0,
      odds: 1.96,
      minOdds: 1.85,
      selection: 'Тотал матча больше (5.0)',
      teaser: 'Высокий темп бросков в створ в первых двух периодах обеспечил пробитие тотала.',
      full: 'Обе спецбригады большинства отличились дважды уже к 45-й минуте встречи.',
      tier: 'PAID_SINGLE',
      price: 790,
      result: 'WIN',
      score: '4:2',
    }),
    makeSeed(9, {
      sport: 'FOOTBALL',
      league: 'Серия А · Италия',
      home: 'Аталанта',
      away: 'Наполи',
      offsetHours: -110,
      matchStatus: 'FINISHED',
      stake: 2.0,
      odds: 2.02,
      minOdds: 1.9,
      selection: 'Обе забьют и ТБ (2.5)',
      teaser: 'Гости закрылись после раннего гола — открытый учет минуса в архиве без правок.',
      full: 'При 2.48 суммарных xG команды ограничились двумя мячами. Честная фиксация минуса в статистике.',
      tier: 'PAID_SINGLE',
      price: 790,
      result: 'LOSS',
      score: '1:1',
    }),
    makeSeed(10, {
      sport: 'MMA',
      league: 'UFC · Номерной турнир',
      home: 'Ислам Махачев',
      away: 'Арман Царукян',
      offsetHours: -420,
      matchStatus: 'FINISHED',
      stake: 3.0,
      odds: 1.95,
      minOdds: 1.85,
      selection: 'Тотал раундов больше (2.5)',
      teaser: 'Взаимная нейтрализация партера перевела поединок в чемпионские отрезки.',
      full: 'Как и закладывалось в модели темпа боя, первые два раунда прошли в тактической работе с минимальным риском.',
      tier: 'PAID_SINGLE',
      price: 990,
      result: 'WIN',
      score: '5 раундов',
    }),
    makeSeed(11, {
      sport: 'BASKETBALL',
      league: 'НБА · Регулярный сезон',
      home: 'Денвер Наггетс',
      away: 'Бостон Селтикс',
      offsetHours: -980,
      matchStatus: 'FINISHED',
      stake: 2.5,
      odds: 1.97,
      minOdds: 1.87,
      selection: 'Победа 1 с учетом ОТ',
      teaser: 'Фактор среднегорья Денвера против гостевого турне соперника.',
      full: 'Контроль щита во второй половине (51 против 38 подборов) решил исход концовки.',
      tier: 'PAID_SINGLE',
      price: 790,
      result: 'WIN',
      score: '115:109',
    }),
    makeSeed(12, {
      sport: 'FOOTBALL',
      league: 'Ла Лига · Испания',
      home: 'Реал Сосьедад',
      away: 'Атлетико Мадрид',
      offsetHours: -1750,
      matchStatus: 'FINISHED',
      stake: 2.0,
      odds: 1.98,
      minOdds: 1.88,
      selection: 'Фора 2 (0)',
      teaser: 'Ничейный исход при нулевой форе рассчитан расходным возвратом без потерь.',
      full: 'Страховка нулевой форой полностью сохранила флэт при счете 1:1.',
      tier: 'PAID_SINGLE',
      price: 790,
      result: 'PUSH',
      score: '1:1',
    }),
    makeSeed(13, {
      sport: 'ESPORTS',
      league: 'CS2 · IEM Cologne',
      home: 'NAVI',
      away: 'G2 Esports',
      offsetHours: -2500,
      matchStatus: 'FINISHED',
      stake: 3.0,
      odds: 2.02,
      minOdds: 1.9,
      selection: 'Победа в серии: NAVI',
      teaser: 'Подготовленные анти-раунды на решающем Mirage закрыли серию в пользу фаворита модели.',
      full: 'Победа 2:1 по картам с доминирующей стороной защиты на третьей карте (13:7).',
      tier: 'PAID_SINGLE',
      price: 890,
      result: 'WIN',
      score: '2:1',
    }),
  ];

  const promoCodes: PromoCodeRecord[] = [
    {
      id: 'promo_start15',
      code: 'START15',
      discountPercent: 15,
      maxUses: 500,
      usedCount: 0,
      active: true,
      createdAt: new Date(now).toISOString(),
    },
  ];

  const envPlusVibeKey = (process.env.PLUSVIBE_API_KEY || '').trim();
  const envOllamaKey = (process.env.OLLAMA_API_KEY || '').trim();
  const envGenericKey = (process.env.AI_LLM_API_KEY || '').trim();
  const genericIsPlusVibe = envGenericKey.startsWith('sk-pv-');

  const aiAutopilot: AiAutopilotConfig = {
    mode: 'MODERATION',
    llmProvider:
      envPlusVibeKey || genericIsPlusVibe
        ? 'PLUSVIBE'
        : envOllamaKey
          ? 'OLLAMA'
          : envGenericKey
            ? 'DEEPSEEK'
            : 'BUILTIN_QUANT',
    llmBaseUrl:
      envPlusVibeKey || genericIsPlusVibe
        ? process.env.PLUSVIBE_BASE_URL || 'https://plusvibeapi.ru/v1'
        : envOllamaKey
          ? process.env.OLLAMA_BASE_URL || 'https://ollama.com/v1'
          : process.env.AI_LLM_BASE_URL || 'https://plusvibeapi.ru/v1',
    llmApiKey: envPlusVibeKey || envOllamaKey || envGenericKey || '',
    llmModel:
      envPlusVibeKey || genericIsPlusVibe
        ? process.env.PLUSVIBE_MODEL || 'deepseek-v4.1-flash-1017'
        : envOllamaKey
          ? process.env.OLLAMA_MODEL || 'deepseek-v4.1-flash'
          : process.env.AI_LLM_MODEL || 'deepseek-v4.1-flash-1017',
    sportsEnabled: ['FOOTBALL', 'HOCKEY', 'TENNIS', 'BASKETBALL', 'ESPORTS', 'MMA'],
    morningHourMsk: 9,
    eveningHourMsk: 18,
    maxPicksPerRun: 3,
    minActiveOnStorefront: 6,
    minValueEdgePct: 3.5,
    defaultAiPriceRub: settings.defaultSinglePriceRub,
    freeEveryNthPick: 4,
    insureAiPicks: true,
    autoSettleEnabled: true,
    openSourceResearchEnabled: true,
    minAgentConfidencePct: 60,
    requireAgentConsensus: true,
    cronSecret: process.env.AUTOPILOT_CRON_SECRET || 'valuex-autopilot-2026',
    totalGeneratedCount: 0,
    lastFeedSource: null,
    lastMorningRunDate: null,
    lastEveningRunDate: null,
    lastScanAt: null,
    lastSettleAt: null,
  };

  return {
    settings,
    users: [adminUser],
    predictions: predictions.map((p, idx) => ({
      ...p,
      authorSource: idx % 2 === 0 ? 'AI_AUTOPILOT' : 'HUMAN',
      aiConfidencePct: idx % 2 === 0 ? 72 : null,
      aiEdgePct: idx % 2 === 0 ? 4.8 : null,
    })),
    transactions: [],
    promoCodes,
    affiliateLinks: [
      {
        id: 'aff_init_1',
        userId: adminUser.id,
        userEmail: adminUser.email,
        code: 'valuex_official',
        label: 'Основной канал проекта',
        clicks: 0,
        registrations: 0,
        buyers: 0,
        revenueRub: 0,
        createdAt: new Date(now).toISOString(),
      },
    ],
    payouts: [],
    processedWebhooks: [],
    aiAutopilot,
    aiDrafts: [],
    aiLogs: [
      {
        id: 'log_init_1',
        createdAt: new Date(now).toISOString(),
        level: 'INFO',
        stage: 'SCANNER',
        message:
          'Модуль ИИ-Автопилота готов к работе. Доступны режимы «Премодерация черновиков» и «Полный автопилот 24/7» (09:00 и 18:00 МСК).',
      },
    ],
    aiChatMessages: [],
  };
}

function normalizeLoadedState(
  raw: Partial<PersistentState> & Record<string, unknown>,
): PersistentState {
  const fallback = createInitialState();
  const rawSettings = (raw.settings || {}) as Partial<PlatformSettings> & {
    telegramVipChannelId?: string;
  };

  const settings: PlatformSettings = {
    ...fallback.settings,
    ...rawSettings,
    bundle2DiscountPct: rawSettings.bundle2DiscountPct ?? 15,
    bundle3DiscountPct: rawSettings.bundle3DiscountPct ?? 25,
    telegramChannelId:
      rawSettings.telegramChannelId ??
      rawSettings.telegramVipChannelId ??
      fallback.settings.telegramChannelId,
  };

  const predictions = (raw.predictions || fallback.predictions).map((p, idx) => {
    const legacyTier = p.accessTier as string;
    const normalizedTier: AccessTier = legacyTier === 'FREE' ? 'FREE' : 'PAID_SINGLE';
    const finalScoreVerifiedSources = Array.isArray(p.finalScoreVerifiedSources)
      ? Array.from(
          new Set(
            p.finalScoreVerifiedSources
              .filter((source): source is string => typeof source === 'string')
              .map((source) => source.trim())
              .filter(Boolean),
          ),
        )
      : [];
    const invalidateUncorroboratedFinal =
      p.resultStatus === 'PENDING' &&
      p.finalScoreVerified === true &&
      finalScoreVerifiedSources.length < 2;
    return {
      ...p,
      authorSource: p.authorSource ?? 'HUMAN',
      externalFixtureId: p.externalFixtureId ?? null,
      aiConfidencePct: p.aiConfidencePct ?? null,
      aiEdgePct: p.aiEdgePct ?? null,
      finalScoreVerified: invalidateUncorroboratedFinal ? false : p.finalScoreVerified ?? false,
      finalScoreVerifiedSources,
      liveHomeScore: invalidateUncorroboratedFinal ? null : p.liveHomeScore ?? null,
      liveAwayScore: invalidateUncorroboratedFinal ? null : p.liveAwayScore ?? null,
      finalScoreIsOvertime: invalidateUncorroboratedFinal ? false : p.finalScoreIsOvertime ?? false,
      isFeatured: p.isFeatured ?? idx === 0,
      insuredOnLoss: p.insuredOnLoss ?? normalizedTier === 'PAID_SINGLE',
      accessTier: normalizedTier,
      singlePriceRub:
        normalizedTier === 'PAID_SINGLE'
          ? p.singlePriceRub ?? settings.defaultSinglePriceRub
          : null,
    };
  });

  const transactions = (raw.transactions || [])
    .filter(
      (t) =>
        t.kind === 'SINGLE_PREDICTION' ||
        t.kind === 'BUNDLE_PREDICTIONS' ||
        t.kind === 'BALANCE_TOPUP',
    )
    .map((t) => ({
      ...t,
      predictionIds: Array.isArray(t.predictionIds)
        ? t.predictionIds
        : t.predictionId
          ? [t.predictionId]
          : [],
      promoCode: t.promoCode ?? null,
      discountRub: t.discountRub ?? 0,
    }));

  const users = (raw.users || fallback.users).map((u) => ({
    id: u.id,
    email: u.email,
    passwordHash: u.passwordHash,
    displayName: u.displayName,
    city: u.city || '',
    role: u.role,
    status: u.status,
    balanceRub: u.balanceRub || 0,
    referenceBankrollRub: u.referenceBankrollRub || 50_000,
    telegramUsername: u.telegramUsername ?? null,
    telegramChatId: u.telegramChatId ?? null,
    telegramLinkCode: u.telegramLinkCode || makeUserTelegramLinkCode(u.id),
    passwordResetCode: u.passwordResetCode ?? null,
    passwordResetExpiresAt: u.passwordResetExpiresAt ?? null,
    purchasedPredictionIds: Array.isArray(u.purchasedPredictionIds)
      ? u.purchasedPredictionIds
      : [],
    referralCode: u.referralCode,
    referredByUserId: u.referredByUserId ?? null,
    referredByCode: u.referredByCode ?? null,
    revsharePercent: u.revsharePercent ?? 30,
    affiliateBalanceRub: u.affiliateBalanceRub || 0,
    affiliateTotalEarnedRub: u.affiliateTotalEarnedRub || 0,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
  }));

  const rawAi = (raw.aiAutopilot || {}) as Partial<AiAutopilotConfig>;
  const rawSavedKey = (rawAi.llmApiKey || '').trim();
  const envPlusVibeKey = (process.env.PLUSVIBE_API_KEY || '').trim();
  const envOllamaKey = (process.env.OLLAMA_API_KEY || '').trim();

  const savedIsPlusVibeKey = rawSavedKey.startsWith('sk-pv-');
  const shouldAutoActivateEnvPlusVibe =
    Boolean(envPlusVibeKey) &&
    (!rawSavedKey ||
      rawAi.llmProvider === 'BUILTIN_QUANT' ||
      rawAi.llmProvider === 'ORCAROUTER');

  const shouldAutoActivateEnvOllama =
    !shouldAutoActivateEnvPlusVibe &&
    !savedIsPlusVibeKey &&
    Boolean(envOllamaKey) &&
    (!rawSavedKey ||
      rawAi.llmProvider === 'BUILTIN_QUANT' ||
      rawAi.llmProvider === 'ORCAROUTER');

  const effectiveProvider: AiAutopilotConfig['llmProvider'] =
    shouldAutoActivateEnvPlusVibe || savedIsPlusVibeKey
      ? 'PLUSVIBE'
      : shouldAutoActivateEnvOllama
        ? 'OLLAMA'
        : rawAi.llmProvider || fallback.aiAutopilot.llmProvider;

  const rawBaseUrl = shouldAutoActivateEnvPlusVibe
    ? process.env.PLUSVIBE_BASE_URL || 'https://plusvibeapi.ru/v1'
    : shouldAutoActivateEnvOllama
      ? process.env.OLLAMA_BASE_URL || 'https://ollama.com/v1'
      : (rawAi.llmBaseUrl || '').trim();

  const isPlusVibe =
    effectiveProvider === 'PLUSVIBE' ||
    savedIsPlusVibeKey ||
    rawBaseUrl.toLowerCase().includes('plusvibeapi.ru');
  const isOrca =
    !isPlusVibe &&
    (effectiveProvider === 'ORCAROUTER' ||
      rawBaseUrl.toLowerCase().includes('orcarouter.ai'));
  const isOllama =
    !isPlusVibe &&
    (effectiveProvider === 'OLLAMA' ||
      rawBaseUrl.toLowerCase().includes('ollama.com'));

  const healedBaseUrl = isPlusVibe
    ? rawBaseUrl.toLowerCase().includes('gw.plusvibeapi.ru')
      ? 'https://gw.plusvibeapi.ru/v1'
      : 'https://plusvibeapi.ru/v1'
    : isOrca
      ? 'https://www.orcarouter.ai/v1'
      : isOllama
        ? 'https://ollama.com/v1'
        : rawBaseUrl || fallback.aiAutopilot.llmBaseUrl;

  const rawModel = shouldAutoActivateEnvPlusVibe
    ? process.env.PLUSVIBE_MODEL || 'deepseek-v4.1-flash-1017'
    : shouldAutoActivateEnvOllama
      ? process.env.OLLAMA_MODEL || 'deepseek-v4.1-flash'
      : (rawAi.llmModel || '').trim();

  const healedModel =
    isPlusVibe &&
    (!rawModel ||
      rawModel.toLowerCase() === 'orcarouter/auto' ||
      rawModel.toLowerCase().includes('free') ||
      rawModel === 'deepseek-v4.1-flash')
      ? 'deepseek-v4.1-flash-1017'
      : isOrca &&
          (!rawModel ||
            rawModel.toLowerCase() === 'orcarouter/auto' ||
            rawModel === 'gemini-2.5-flash')
        ? 'deepseek/deepseek-v4.1-flash-free'
        : isOllama && !rawModel
          ? 'deepseek-v4.1-flash'
          : rawModel || fallback.aiAutopilot.llmModel;

  const aiAutopilot: AiAutopilotConfig = {
    ...fallback.aiAutopilot,
    ...rawAi,
    llmProvider: effectiveProvider,
    llmBaseUrl: healedBaseUrl,
    llmApiKey: shouldAutoActivateEnvPlusVibe
      ? envPlusVibeKey
      : shouldAutoActivateEnvOllama
        ? envOllamaKey
        : rawAi.llmApiKey ?? fallback.aiAutopilot.llmApiKey,
    llmModel: healedModel,
    sportsEnabled:
      Array.isArray(rawAi.sportsEnabled) && rawAi.sportsEnabled.length > 0
        ? rawAi.sportsEnabled
        : fallback.aiAutopilot.sportsEnabled,
    minAgentConfidencePct: Number.isFinite(Number(rawAi.minAgentConfidencePct))
      ? Math.max(0, Math.min(100, Number(rawAi.minAgentConfidencePct)))
      : fallback.aiAutopilot.minAgentConfidencePct,
    // Обязательный серверный fail-closed порог для любого выпуска.
    requireAgentConsensus: true,
  };

  return {
    settings,
    users,
    predictions,
    transactions,
    promoCodes: Array.isArray(raw.promoCodes) ? raw.promoCodes : fallback.promoCodes,
    affiliateLinks: raw.affiliateLinks || fallback.affiliateLinks,
    payouts: raw.payouts || [],
    processedWebhooks: Array.isArray(raw.processedWebhooks)
      ? raw.processedWebhooks.slice(-1000)
      : [],
    aiAutopilot,
    aiDrafts: Array.isArray(raw.aiDrafts) ? raw.aiDrafts : [],
    aiLogs: Array.isArray(raw.aiLogs) ? raw.aiLogs.slice(0, 100) : fallback.aiLogs,
    aiChatMessages: Array.isArray(raw.aiChatMessages)
      ? raw.aiChatMessages.slice(-60)
      : [],
  };
}

let pgPool: Pool | null = null;
let pgLastFailAt = 0;
let memoryFallback: PersistentState | null = null;
let localWriteQueue: Promise<unknown> = Promise.resolve();

async function getPostgresPool(): Promise<Pool | null> {
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!dbUrl) {
    return null;
  }

  if (pgPool) return pgPool;

  // Если при старте системы PostgreSQL еще поднимался, пробуем переподключиться раз в 10 секунд
  if (pgLastFailAt > 0 && Date.now() - pgLastFailAt < 10_000) {
    return null;
  }

  try {
    const pool = new Pool({
      connectionString: dbUrl,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 30_000,
      max: 8,
    });
    pool.on('error', () => {
      pgPool = null;
      pgLastFailAt = Date.now();
    });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS valuex_app_storage (
        store_key VARCHAR(64) PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    pgPool = pool;
    pgLastFailAt = 0;
    return pool;
  } catch {
    pgLastFailAt = Date.now();
    return null;
  }
}

export async function getDatabaseBackendStatus(): Promise<'postgres' | 'local_file'> {
  const pool = await getPostgresPool();
  return pool ? 'postgres' : 'local_file';
}

function readLocalFileState(): PersistentState {
  if (memoryFallback) return memoryFallback;
  try {
    if (fs.existsSync(LOCAL_DB_FILE)) {
      const parsed = normalizeLoadedState(
        JSON.parse(fs.readFileSync(LOCAL_DB_FILE, 'utf8')),
      );
      memoryFallback = parsed;
      return parsed;
    }
  } catch {
    // create fresh seed
  }
  const initial = createInitialState();
  writeLocalFileState(initial);
  return initial;
}

function writeLocalFileState(state: PersistentState): void {
  memoryFallback = state;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmp = `${LOCAL_DB_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, LOCAL_DB_FILE);
  } catch {
    // in-memory fallback
  }
}

export async function readState(): Promise<PersistentState> {
  const pool = await getPostgresPool();
  if (!pool) {
    return readLocalFileState();
  }

  const res = await pool.query<{ payload: PersistentState }>(
    `SELECT payload FROM valuex_app_storage WHERE store_key = 'main'`,
  );
  if (res.rows.length > 0) {
    return normalizeLoadedState(
      res.rows[0].payload as unknown as Record<string, unknown>,
    );
  }

  const seeded = createInitialState();
  await pool.query(
    `INSERT INTO valuex_app_storage (store_key, payload, updated_at)
     VALUES ('main', $1::jsonb, NOW())
     ON CONFLICT (store_key) DO NOTHING`,
    [JSON.stringify(seeded)],
  );
  return seeded;
}

export async function mutateState<T>(
  mutator: (draft: PersistentState) => Promise<T> | T,
): Promise<T> {
  const pool = await getPostgresPool();
  if (!pool) {
    // Строгая очередь записи, исключающая гонки при параллельных запросах
    const runTask = localWriteQueue.then(async () => {
      const state = readLocalFileState();
      const cloned = structuredClone(state);
      const result = await mutator(cloned);
      cloned.processedWebhooks = cloned.processedWebhooks.slice(-1000);
      cloned.aiLogs = cloned.aiLogs.slice(0, 100);
      writeLocalFileState(cloned);
      return result;
    });
    localWriteQueue = runTask.catch(() => undefined);
    return runTask;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let res = await client.query<{ payload: PersistentState }>(
      `SELECT payload FROM valuex_app_storage WHERE store_key = 'main' FOR UPDATE`,
    );
    if (res.rows.length === 0) {
      const seeded = createInitialState();
      await client.query(
        `INSERT INTO valuex_app_storage (store_key, payload, updated_at)
         VALUES ('main', $1::jsonb, NOW())`,
        [JSON.stringify(seeded)],
      );
      res = { rows: [{ payload: seeded }] } as typeof res;
    }

    const draft = normalizeLoadedState(
      structuredClone(res.rows[0].payload) as unknown as Record<string, unknown>,
    );
    const result = await mutator(draft);
    draft.processedWebhooks = draft.processedWebhooks.slice(-1000);
    draft.aiLogs = draft.aiLogs.slice(0, 100);

    await client.query(
      `UPDATE valuex_app_storage SET payload = $1::jsonb, updated_at = NOW() WHERE store_key = 'main'`,
      [JSON.stringify(draft)],
    );
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export function toSafeSessionUser(user: UserAccount): SafeSessionUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    city: user.city,
    role: user.role,
    status: user.status,
    balanceRub: user.balanceRub,
    referenceBankrollRub: user.referenceBankrollRub,
    telegramUsername: user.telegramUsername,
    telegramChatId: user.telegramChatId ?? null,
    telegramLinkCode: user.telegramLinkCode || makeUserTelegramLinkCode(user.id),
    purchasedPredictionIds: user.purchasedPredictionIds,
    referralCode: user.referralCode,
    revsharePercent: user.revsharePercent,
    affiliateBalanceRub: user.affiliateBalanceRub,
    affiliateTotalEarnedRub: user.affiliateTotalEarnedRub,
  };
}

export function resolveEffectiveMatchStatus(record: PredictionRecord): MatchStatus {
  if (record.resultStatus !== 'PENDING') return 'FINISHED';
  if (record.matchLifecycleStatus === 'LIVE') return 'LIVE';
  if (record.matchLifecycleStatus === 'FINISHED') return 'FINISHED';
  // Отложенные/отменённые матчи не завершены: lifecycle остаётся доступен DTO,
  // а отдельная проверка ниже закрывает продажу, пока статус не прояснится.
  if (
    record.matchLifecycleStatus === 'POSTPONED' ||
    record.matchLifecycleStatus === 'CANCELLED'
  ) {
    return 'UPCOMING';
  }
  // Для новых записей время расписания не доказывает, что игра началась.
  // Статус LIVE устанавливается только наблюдением источника; старые записи
  // без lifecycle продолжают работать по прежнему поведению.
  if (
    record.matchLifecycleStatus === 'SCHEDULED' ||
    record.matchLifecycleStatus === 'UNKNOWN'
  ) {
    return 'UPCOMING';
  }
  if (record.matchStatus === 'FINISHED') return 'FINISHED';
  if (record.matchStatus === 'LIVE') return 'LIVE';
  if (Date.now() >= new Date(record.matchStartsAt).getTime()) return 'LIVE';
  return 'UPCOMING';
}

export function toPublicPredictionDto(
  record: PredictionRecord,
  viewer: UserAccount | null,
): PublicPredictionDto {
  const effectiveStatus = resolveEffectiveMatchStatus(record);
  const isFree = record.accessTier === 'FREE';
  const isSettledPublic =
    record.revealAfterFinish &&
    effectiveStatus === 'FINISHED' &&
    record.resultStatus !== 'PENDING';
  const isBought = Boolean(viewer?.purchasedPredictionIds.includes(record.id));
  const isAdmin = viewer?.role === 'ADMIN';

  const unlocked =
    isFree ||
    isSettledPublic ||
    isAdmin ||
    (viewer?.status === 'ACTIVE' && isBought);

  return {
    id: record.id,
    slug: record.slug,
    sport: record.sport,
    leagueName: record.leagueName,
    homeTeam: record.homeTeam,
    awayTeam: record.awayTeam,
    homeLogoUrl: record.homeLogoUrl ?? null,
    awayLogoUrl: record.awayLogoUrl ?? null,
    matchStartsAt: record.matchStartsAt,
    matchStatus: effectiveStatus,
    matchLifecycleStatus: record.matchLifecycleStatus,
    actualStartedAt: record.actualStartedAt ?? null,
    actualStartedAtPrecision: record.actualStartedAtPrecision ?? null,
    actualFinishedAt: record.actualFinishedAt ?? null,
    actualFinishedAtPrecision: record.actualFinishedAtPrecision ?? null,
    matchVerifiedAt: record.matchVerifiedAt ?? null,
    matchVerificationSource: record.matchVerificationSource ?? null,
    matchVerificationConflict: record.matchVerificationConflict ?? false,
    finalScoreVerified: record.finalScoreVerified ?? false,
    stakePercent: record.stakePercent,
    stakeUnits: record.stakeUnits,
    bookmakerSource: record.bookmakerSource,
    analysisTeaser: record.analysisTeaser,
    isFeatured: Boolean(record.isFeatured),
    insuredOnLoss: Boolean(record.insuredOnLoss),
    salesClosed:
      effectiveStatus !== 'UPCOMING' ||
      record.matchLifecycleStatus === 'POSTPONED' ||
      record.matchLifecycleStatus === 'CANCELLED' ||
      Date.now() >= new Date(record.matchStartsAt).getTime(),
    isLocked: !unlocked,
    isPurchased: isBought,
    accessTier: record.accessTier,
    singlePriceRub: record.singlePriceRub,
    selectionTitle: unlocked ? record.selectionTitle : null,
    fixedOdds: unlocked ? record.fixedOdds : null,
    minAcceptableOdds: unlocked ? record.minAcceptableOdds : null,
    analysisFull: unlocked ? record.analysisFull : null,
    resultStatus: record.resultStatus,
    finalScore: record.finalScore,
    profitUnits: record.profitUnits,
    profitPercent: record.profitPercent,
    verificationHash: record.verificationHash,
    oddsLockedAt: record.oddsLockedAt,
    settledAt: record.settledAt,
    researchSources: record.researchSources ?? [],
    agentReport: unlocked ? record.agentReport ?? null : null,
    liveHomeScore: record.liveHomeScore ?? null,
    liveAwayScore: record.liveAwayScore ?? null,
    liveUpdatedAt: record.liveUpdatedAt ?? null,
  };
}

// =============================================================================
// МАТЕМАТИЧЕСКИЙ РАСЧЕТ ВЕРИФИЦИРОВАННОЙ СТАТИСТИКИ
// =============================================================================

const MONTH_SHORT_RU = [
  'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн',
  'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек',
];

export function computePlatformAnalytics(predictions: PredictionRecord[]): {
  statsByPeriod: Record<'WEEK' | 'MONTH' | 'ALL_TIME', StatsSummary>;
  equityCurve: EquityPoint[];
  sportBreakdown: SportBreakdownItem[];
  recentWinsFeed: RecentWinFeedItem[];
} {
  const settledChrono = predictions
    .filter((p) => p.resultStatus !== 'PENDING' && p.profitUnits !== null)
    .sort(
      (a, b) =>
        new Date(a.settledAt || a.matchStartsAt).getTime() -
        new Date(b.settledAt || b.matchStartsAt).getTime(),
    );

  const nowMs = Date.now();
  const calcForSubset = (
    period: 'WEEK' | 'MONTH' | 'ALL_TIME',
    rows: PredictionRecord[],
  ): StatsSummary => {
    let wins = 0;
    let losses = 0;
    let pushes = 0;
    let cashouts = 0;
    let turnover = 0;
    let netProfit = 0;
    let oddsSum = 0;
    let streak = 0;
    let runningBank = 100;
    let peakBank = 100;
    let maxDrawdown = 0;

    for (const r of rows) {
      const p = r.profitUnits ?? 0;
      turnover += r.stakeUnits;
      netProfit += p;
      oddsSum += r.fixedOdds;

      if (r.resultStatus === 'WIN') {
        wins += 1;
        streak += 1;
      } else if (r.resultStatus === 'LOSS') {
        losses += 1;
        streak = 0;
      } else if (r.resultStatus === 'PUSH') {
        pushes += 1;
      } else if (r.resultStatus === 'CASHOUT') {
        cashouts += 1;
        if (p < 0) streak = 0;
      }

      runningBank += p;
      if (runningBank > peakBank) peakBank = runningBank;
      const dd = peakBank - runningBank;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    const decisive = wins + losses;
    return {
      period,
      settledCount: rows.length,
      wins,
      losses,
      pushes,
      cashouts,
      winRatePct: decisive > 0 ? Number(((wins / decisive) * 100).toFixed(1)) : 0,
      avgOdds: rows.length > 0 ? Number((oddsSum / rows.length).toFixed(2)) : 0,
      turnoverUnits: Number(turnover.toFixed(2)),
      netProfitUnits: Number(netProfit.toFixed(2)),
      yieldPct: turnover > 0 ? Number(((netProfit / turnover) * 100).toFixed(1)) : 0,
      roiBankrollPct: Number(netProfit.toFixed(2)),
      currentWinStreak: streak,
      maxDrawdownPct: Number(maxDrawdown.toFixed(2)),
    };
  };

  const weekRows = settledChrono.filter(
    (r) => nowMs - new Date(r.settledAt || r.matchStartsAt).getTime() <= 7 * 86400 * 1000,
  );
  const monthRows = settledChrono.filter(
    (r) => nowMs - new Date(r.settledAt || r.matchStartsAt).getTime() <= 30 * 86400 * 1000,
  );

  const buckets = new Map<
    string,
    { profit: number; turnover: number; count: number; monthIdx: number; yearShort: string }
  >();
  for (const r of settledChrono) {
    const d = new Date(r.settledAt || r.matchStartsAt);
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const prev = buckets.get(ym) ?? {
      profit: 0,
      turnover: 0,
      count: 0,
      monthIdx: d.getUTCMonth(),
      yearShort: String(d.getUTCFullYear()).slice(-2),
    };
    prev.profit += r.profitUnits ?? 0;
    prev.turnover += r.stakeUnits;
    prev.count += 1;
    buckets.set(ym, prev);
  }

  let cumulativeBank = 100;
  const equityCurve: EquityPoint[] = [
    {
      month: 'Старт',
      label: 'Старт',
      profitUnits: 0,
      cumulativeBankPct: 100,
      betsCount: 0,
      yieldPct: 0,
    },
  ];

  for (const [ym, b] of Array.from(buckets.entries()).sort(([a], [z]) => a.localeCompare(z))) {
    cumulativeBank += b.profit;
    const lbl = `${MONTH_SHORT_RU[b.monthIdx]} '${b.yearShort}`;
    equityCurve.push({
      month: ym,
      label: lbl,
      profitUnits: Number(b.profit.toFixed(2)),
      cumulativeBankPct: Number(cumulativeBank.toFixed(2)),
      betsCount: b.count,
      yieldPct: b.turnover > 0 ? Number(((b.profit / b.turnover) * 100).toFixed(1)) : 0,
    });
  }

  const allSports: SportType[] = [
    'FOOTBALL',
    'HOCKEY',
    'TENNIS',
    'ESPORTS',
    'BASKETBALL',
    'MMA',
  ];
  const sportBreakdown = allSports
    .map((sp) => {
      const spRows = settledChrono.filter((r) => r.sport === sp);
      const st = calcForSubset('ALL_TIME', spRows);
      return {
        sport: sp,
        bets: st.settledCount,
        winRatePct: st.winRatePct,
        profitUnits: st.netProfitUnits,
        yieldPct: st.yieldPct,
      };
    })
    .filter((item) => item.bets > 0);

  const sampleBuyers = [
    { name: 'Иван', city: 'Москва', bank: 150_000 },
    { name: 'Алексей', city: 'Красноярск', bank: 100_000 },
    { name: 'Дмитрий', city: 'Санкт-Петербург', bank: 200_000 },
    { name: 'Руслан', city: 'Казань', bank: 120_000 },
  ];

  const recentWinsFeed = [...settledChrono]
    .reverse()
    .filter((r) => r.resultStatus === 'WIN' && (r.profitUnits ?? 0) > 0)
    .slice(0, 4)
    .map((win, idx) => {
      const buyer = sampleBuyers[idx % sampleBuyers.length];
      const wonRub = Math.round((buyer.bank * (win.profitPercent ?? 2)) / 100);
      return {
        id: `win_${win.id}`,
        name: buyer.name,
        city: buyer.city,
        sport: win.sport,
        wonRub,
        matchTitle: `${win.homeTeam} — ${win.awayTeam}`,
      };
    });

  return {
    statsByPeriod: {
      WEEK: calcForSubset('WEEK', weekRows),
      MONTH: calcForSubset('MONTH', monthRows),
      ALL_TIME: calcForSubset('ALL_TIME', settledChrono),
    },
    equityCurve,
    sportBreakdown,
    recentWinsFeed,
  };
}

// =============================================================================
// РАСЧЕТ ПАКЕТНЫХ СКИДОК И ПРОМОКОДОВ
// =============================================================================

export function calculateCartPricing(params: {
  state: PersistentState;
  predictionIds: string[];
  promoCode?: string | null;
}): {
  subtotalRub: number;
  bundleDiscountPct: number;
  promoDiscountPct: number;
  promoValidCode: string | null;
  discountRub: number;
  finalAmountRub: number;
} {
  const uniqueIds = Array.from(new Set(params.predictionIds));
  let subtotalRub = 0;
  for (const pid of uniqueIds) {
    const p = params.state.predictions.find((row) => row.id === pid);
    if (p && p.accessTier === 'PAID_SINGLE') {
      subtotalRub += p.singlePriceRub ?? params.state.settings.defaultSinglePriceRub;
    }
  }

  let bundleDiscountPct = 0;
  if (uniqueIds.length >= 3) {
    bundleDiscountPct = params.state.settings.bundle3DiscountPct;
  } else if (uniqueIds.length === 2) {
    bundleDiscountPct = params.state.settings.bundle2DiscountPct;
  }

  let promoDiscountPct = 0;
  let promoValidCode: string | null = null;
  if (params.promoCode?.trim()) {
    const clean = params.promoCode.trim().toUpperCase();
    const found = params.state.promoCodes.find(
      (c) => c.code.toUpperCase() === clean && c.active && c.usedCount < c.maxUses,
    );
    if (found) {
      promoDiscountPct = found.discountPercent;
      promoValidCode = found.code;
    }
  }

  // Пакетная скидка и промокод суммируются с разумным потолком 60%
  const combinedPct = Math.min(60, bundleDiscountPct + promoDiscountPct);
  const finalAmountRub = Math.max(
    50,
    Math.round((subtotalRub * (100 - combinedPct)) / 100),
  );
  const discountRub = Math.max(0, subtotalRub - finalAmountRub);

  return {
    subtotalRub,
    bundleDiscountPct,
    promoDiscountPct,
    promoValidCode,
    discountRub,
    finalAmountRub,
  };
}

export function computeWalletTopupBonusRub(amountRub: number): number {
  const clean = Math.round(amountRub || 0);
  if (clean >= 5000) return Math.round(clean * 0.2); // +20% (от 5 000 ₽ -> +1 000 ₽)
  if (clean >= 2500) return Math.round(clean * 0.1); // +10% (от 2 500 ₽ -> +250 ₽)
  return 0;
}

export async function registerUserAccount(params: {
  email: string;
  password: string;
  displayName: string;
  city?: string;
  refCode?: string | null;
}): Promise<UserAccount> {
  const cleanEmail = params.email.trim().toLowerCase();
  if (!cleanEmail.includes('@')) throw new Error('Введите корректный E-mail');
  if (params.password.length < 6) {
    throw new Error('Пароль должен содержать минимум 6 символов');
  }

  return mutateState((state) => {
    if (state.users.some((u) => u.email === cleanEmail)) {
      throw new Error('Пользователь с таким E-mail уже зарегистрирован');
    }

    let referredByUserId: string | null = null;
    let referredByCode: string | null = null;

    if (params.refCode) {
      const cleanRef = params.refCode.trim().toLowerCase();
      const link = state.affiliateLinks.find((l) => l.code.toLowerCase() === cleanRef);
      if (link) {
        referredByUserId = link.userId;
        referredByCode = link.code;
        link.registrations += 1;
      } else {
        const refOwner = state.users.find(
          (u) => u.referralCode.toLowerCase() === cleanRef,
        );
        if (refOwner) {
          referredByUserId = refOwner.id;
          referredByCode = refOwner.referralCode;
        }
      }
    }

    const baseCode = cleanEmail
      .split('@')[0]
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 12);
    const referralCode = `${baseCode || 'partner'}_${randomUUID().slice(0, 4)}`;

    const newId = `usr_${randomUUID().slice(0, 12)}`;
    const newUser: UserAccount = {
      id: newId,
      email: cleanEmail,
      passwordHash: hashPassword(params.password),
      displayName: params.displayName.trim() || cleanEmail.split('@')[0],
      city: params.city?.trim() || '',
      role: 'USER',
      status: 'ACTIVE',
      balanceRub: 0,
      referenceBankrollRub: 50_000,
      telegramUsername: null,
      telegramChatId: null,
      telegramLinkCode: makeUserTelegramLinkCode(newId),
      purchasedPredictionIds: [],
      referralCode,
      referredByUserId,
      referredByCode,
      revsharePercent: 30,
      affiliateBalanceRub: 0,
      affiliateTotalEarnedRub: 0,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };

    state.users.unshift(newUser);
    state.affiliateLinks.unshift({
      id: `aff_${randomUUID().slice(0, 10)}`,
      userId: newUser.id,
      userEmail: newUser.email,
      code: referralCode,
      label: 'Личная реферальная ссылка',
      clicks: 0,
      registrations: 0,
      buyers: 0,
      revenueRub: 0,
      createdAt: new Date().toISOString(),
    });

    return newUser;
  });
}

export async function loginUserAccount(
  email: string,
  password: string,
): Promise<UserAccount> {
  const cleanEmail = email.trim().toLowerCase();
  return mutateState((state) => {
    const user = state.users.find((u) => u.email === cleanEmail);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new Error('Неверный E-mail или пароль');
    }
    if (user.status === 'BLOCKED') {
      throw new Error('Учетная запись заблокирована администратором');
    }
    user.lastLoginAt = new Date().toISOString();
    return user;
  });
}

export async function recordReferralClick(refCode: string): Promise<void> {
  const clean = refCode.trim().toLowerCase();
  if (!clean) return;
  await mutateState((state) => {
    const link = state.affiliateLinks.find((l) => l.code.toLowerCase() === clean);
    if (link) link.clicks += 1;
  });
}

export async function initiateOrderCheckout(params: {
  userId: string;
  kind: 'SINGLE_PREDICTION' | 'BUNDLE_PREDICTIONS' | 'BALANCE_TOPUP';
  predictionId?: string;
  predictionIds?: string[];
  promoCode?: string | null;
  topupAmountRub?: number;
  paymentMethod: 'yookassa' | 'internal_balance';
  originUrl: string;
}): Promise<{ order: OrderTransaction; paidImmediately: boolean }> {
  const stateSnap = await readState();
  const userSnap = stateSnap.users.find((u) => u.id === params.userId);
  if (!userSnap || userSnap.status === 'BLOCKED') {
    throw new Error('Авторизуйтесь для совершения покупки');
  }

  let amountRub = 0;
  let discountRub = 0;
  let promoValidCode: string | null = null;
  let targetIds: string[] = [];
  let title = '';

  if (params.kind === 'SINGLE_PREDICTION' || params.kind === 'BUNDLE_PREDICTIONS') {
    const rawIds =
      params.kind === 'BUNDLE_PREDICTIONS' && params.predictionIds?.length
        ? params.predictionIds
        : params.predictionId
          ? [params.predictionId]
          : [];

    targetIds = Array.from(new Set(rawIds)).filter(
      (id) => !userSnap.purchasedPredictionIds.includes(id),
    );

    if (!targetIds.length) {
      throw new Error('Выбранные события уже куплены и открыты в вашем кабинете');
    }

    const matchedPreds = targetIds.map((id) => {
      const p = stateSnap.predictions.find((row) => row.id === id);
      if (!p) throw new Error('Одно из выбранных событий не найдено');
      if (
        resolveEffectiveMatchStatus(p) !== 'UPCOMING' ||
        p.matchLifecycleStatus === 'POSTPONED' ||
        p.matchLifecycleStatus === 'CANCELLED' ||
        Date.now() >= new Date(p.matchStartsAt).getTime()
      ) {
        throw new Error(`Продажа закрыта: матч «${p.homeTeam} — ${p.awayTeam}» уже начался, перенесён или отменён либо наступило время старта по расписанию`);
      }
      return p;
    });

    const pricing = calculateCartPricing({
      state: stateSnap,
      predictionIds: targetIds,
      promoCode: params.promoCode,
    });
    amountRub = pricing.finalAmountRub;
    discountRub = pricing.discountRub;
    promoValidCode = pricing.promoValidCode;

    if (matchedPreds.length === 1) {
      title = `Прогноз: ${matchedPreds[0].homeTeam} — ${matchedPreds[0].awayTeam}`;
    } else {
      title = `Пакет из ${matchedPreds.length} прогнозов (${matchedPreds
        .map((m) => m.homeTeam)
        .join(', ')})`;
    }
  } else {
    amountRub = Math.max(100, Math.round(params.topupAmountRub || 1000));
    const bonusPreview = computeWalletTopupBonusRub(amountRub);
    title =
      bonusPreview > 0
        ? `Пополнение баланса на ${amountRub} ₽ (+бонус ${bonusPreview} ₽)`
        : `Пополнение баланса кабинета (${userSnap.email})`;
  }

  if (params.paymentMethod === 'internal_balance' && userSnap.balanceRub < amountRub) {
    throw new Error(
      `Недостаточно средств на кошельке (${userSnap.balanceRub} ₽ из ${amountRub} ₽)`,
    );
  }

  const orderId = `ord_${randomUUID().slice(0, 12)}`;
  const idempotenceKey = randomUUID();
  let externalPaymentId = `yk_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  let confirmationUrl: string | null = null;

  if (
    params.paymentMethod === 'yookassa' &&
    stateSnap.settings.paymentMode === 'YOOKASSA_LIVE'
  ) {
    const returnUrl = `${params.originUrl}/payment/return?orderId=${encodeURIComponent(
      orderId,
    )}`;
    const liveResult = await createYooKassaLivePayment({
      settings: stateSnap.settings,
      idempotenceKey,
      amountRub,
      title,
      receiptEmail: userSnap.email,
      returnUrl,
      metadata: {
        orderId,
        userId: userSnap.id,
        kind: params.kind,
      },
    });
    externalPaymentId = liveResult.externalPaymentId;
    confirmationUrl = liveResult.confirmationUrl;
  }

  const createdOrder = await mutateState((state) => {
    const order: OrderTransaction = {
      id: orderId,
      idempotenceKey,
      externalPaymentId,
      userId: userSnap.id,
      userEmail: userSnap.email,
      kind:
        targetIds.length > 1
          ? 'BUNDLE_PREDICTIONS'
          : params.kind === 'BALANCE_TOPUP'
            ? 'BALANCE_TOPUP'
            : 'SINGLE_PREDICTION',
      predictionId: targetIds[0] ?? null,
      predictionIds: targetIds,
      promoCode: promoValidCode,
      discountRub,
      title,
      amountRub,
      paymentMethod: params.paymentMethod,
      status: 'PENDING',
      receiptEmail: userSnap.email,
      confirmationUrl,
      affiliateUserId: userSnap.referredByUserId,
      affiliateCommissionRub: 0,
      createdAt: new Date().toISOString(),
      paidAt: null,
    };
    state.transactions.unshift(order);
    return order;
  });

  if (
    params.paymentMethod === 'internal_balance' ||
    stateSnap.settings.paymentMode === 'TEST_INSTANT'
  ) {
    const settledOrder = await fulfillOrderPayment(createdOrder.id);
    return { order: settledOrder, paidImmediately: true };
  }

  return { order: createdOrder, paidImmediately: false };
}

export async function fulfillOrderPayment(
  orderIdOrExternalId: string,
): Promise<OrderTransaction> {
  const result = await mutateState((state) => {
    const tx = state.transactions.find(
      (t) => t.id === orderIdOrExternalId || t.externalPaymentId === orderIdOrExternalId,
    );
    if (!tx) throw new Error('Заказ не найден');
    if (tx.status === 'SUCCEEDED') {
      return {
        tx,
        newlySettled: false,
        buyerChatId: null as string | null,
        unlockedPreds: [] as PredictionRecord[],
        settings: state.settings,
      };
    }

    const buyer = state.users.find((u) => u.id === tx.userId);
    if (!buyer) throw new Error('Покупатель не найден');

    if (tx.paymentMethod === 'internal_balance') {
      if (buyer.balanceRub < tx.amountRub) {
        throw new Error('Недостаточно средств на балансе');
      }
      buyer.balanceRub -= tx.amountRub;
    }

    tx.status = 'SUCCEEDED';
    tx.paidAt = new Date().toISOString();

    if (tx.promoCode) {
      const promo = state.promoCodes.find(
        (c) => c.code.toUpperCase() === tx.promoCode!.toUpperCase(),
      );
      if (promo) promo.usedCount += 1;
    }

    const unlockedPreds: PredictionRecord[] = [];
    if (tx.kind === 'SINGLE_PREDICTION' || tx.kind === 'BUNDLE_PREDICTIONS') {
      const unlockIds = tx.predictionIds.length
        ? tx.predictionIds
        : tx.predictionId
          ? [tx.predictionId]
          : [];
      for (const pid of unlockIds) {
        if (!buyer.purchasedPredictionIds.includes(pid)) {
          buyer.purchasedPredictionIds.push(pid);
        }
        const foundPred = state.predictions.find((p) => p.id === pid);
        if (foundPred) unlockedPreds.push(foundPred);
      }
    } else if (tx.kind === 'BALANCE_TOPUP') {
      const bonusRub = computeWalletTopupBonusRub(tx.amountRub);
      buyer.balanceRub += tx.amountRub + bonusRub;
    }

    if (tx.paymentMethod === 'yookassa' && buyer.referredByUserId) {
      const partner = state.users.find((u) => u.id === buyer.referredByUserId);
      if (partner) {
        const comm = Math.round((tx.amountRub * partner.revsharePercent) / 100);
        tx.affiliateUserId = partner.id;
        tx.affiliateCommissionRub = comm;
        partner.affiliateBalanceRub += comm;
        partner.affiliateTotalEarnedRub += comm;

        const refLink = state.affiliateLinks.find(
          (l) => l.code === buyer.referredByCode || l.userId === partner.id,
        );
        if (refLink) {
          refLink.buyers += 1;
          refLink.revenueRub += tx.amountRub;
        }
      }
    }

    return {
      tx,
      newlySettled: true,
      buyerChatId: buyer.telegramChatId ?? null,
      adminChatIds: state.users
        .filter((u) => u.role === 'ADMIN' && u.telegramChatId && u.id !== buyer.id)
        .map((u) => u.telegramChatId!),
      unlockedPreds,
      settings: state.settings,
    };
  });

  // Мгновенное уведомление владельцу (администратору) о новой продаже
  if (result.newlySettled && result.adminChatIds && result.adminChatIds.length > 0) {
    const adminAlert = [
      `💸 <b>Новая оплата +${result.tx.amountRub.toLocaleString('ru-RU')} ₽!</b>`,
      `👤 Покупатель: <b>${result.tx.userEmail}</b>`,
      `📦 Заказ: ${result.tx.title}`,
      `💳 Способ: ${
        result.tx.paymentMethod === 'yookassa' ? 'Карта РФ / СБП' : 'Внутренний баланс'
      }`,
    ].join('\n');
    for (const admChat of result.adminChatIds) {
      void sendTelegramDirectMessage(result.settings, admChat, adminAlert).catch(
        () => undefined,
      );
    }
  }

  if (
    result.newlySettled &&
    result.buyerChatId &&
    result.tx.kind === 'BALANCE_TOPUP'
  ) {
    const bonusRub = computeWalletTopupBonusRub(result.tx.amountRub);
    const creditedTotal = result.tx.amountRub + bonusRub;
    const topupMsg = [
      `💳 <b>Баланс успешно пополнен (${result.settings.brandName})!</b>`,
      `Зачислено на счет: <b>+${creditedTotal.toLocaleString('ru-RU')} ₽</b>${
        bonusRub > 0 ? ` (включая подарок +${bonusRub.toLocaleString('ru-RU')} ₽)` : ''
      }`,
      `Теперь вы можете открывать любые прогнозы на сайте в 1 клик без ввода карты.`,
    ].join('\n');
    void sendTelegramDirectMessage(
      result.settings,
      result.buyerChatId,
      topupMsg,
    ).catch(() => undefined);
  }

  if (
    result.newlySettled &&
    result.buyerChatId &&
    result.unlockedPreds.length > 0
  ) {
    for (const p of result.unlockedPreds) {
      const plain = explainMarketInPlainRussian(
        p.selectionTitle,
        p.homeTeam,
        p.awayTeam,
      );
      const dmHtml = [
        `🔓 <b>Ваш купленный прогноз открыт (${result.settings.brandName})</b>`,
        ``,
        `🏆 ${p.leagueName}`,
        `⚔️ <b>${p.homeTeam} — ${p.awayTeam}</b>`,
        `🎯 Ставка: <b>${p.selectionTitle}</b>`,
        `📈 Коэффициент: <b>${p.fixedOdds.toFixed(2)}</b> (${p.stakeUnits.toFixed(1)}% от банка)`,
        `📍 <b>Где искать в БК:</b> ${plain.whereToFindInBk}`,
        `✅ <b>Когда выигрыш:</b> ${plain.whenYouWin}`,
        p.insuredOnLoss
          ? `🛡 <b>Страховка активна:</b> если не зайдет — 100% суммы вернется на ваш баланс!`
          : '',
      ]
        .filter(Boolean)
        .join('\n');

      void sendTelegramDirectMessage(
        result.settings,
        result.buyerChatId,
        dmHtml,
      ).catch(() => undefined);
    }
  }

  return result.tx;
}

export async function verifyAndSyncOrderFromReturn(
  orderId: string,
): Promise<OrderTransaction> {
  const state = await readState();
  const tx = state.transactions.find((t) => t.id === orderId);
  if (!tx) throw new Error('Заказ не найден');

  if (tx.status === 'SUCCEEDED') return tx;

  if (
    tx.paymentMethod === 'yookassa' &&
    state.settings.paymentMode === 'YOOKASSA_LIVE'
  ) {
    const check = await verifyYooKassaLivePayment(state.settings, tx.externalPaymentId);
    if (check.status === 'succeeded' && check.paid) {
      return fulfillOrderPayment(tx.id);
    }
    if (check.status === 'canceled') {
      return mutateState((draft) => {
        const found = draft.transactions.find((r) => r.id === tx.id);
        if (!found) throw new Error('Заказ не найден');
        found.status = 'CANCELED';
        return found;
      });
    }
  }

  return tx;
}

export async function refundOrderTransaction(orderIdOrExternal: string): Promise<void> {
  await mutateState((state) => {
    const tx = state.transactions.find(
      (t) => t.id === orderIdOrExternal || t.externalPaymentId === orderIdOrExternal,
    );
    if (!tx || tx.status === 'REFUNDED') return;
    tx.status = 'REFUNDED';

    const buyer = state.users.find((u) => u.id === tx.userId);
    if (!buyer) return;

    if (tx.paymentMethod === 'internal_balance') {
      buyer.balanceRub += tx.amountRub;
    }

    const revokeIds = tx.predictionIds.length
      ? tx.predictionIds
      : tx.predictionId
        ? [tx.predictionId]
        : [];
    if (revokeIds.length) {
      buyer.purchasedPredictionIds = buyer.purchasedPredictionIds.filter(
        (pid) => !revokeIds.includes(pid),
      );
    }
  });
}

export async function createPredictionByAdmin(input: {
  sport: SportType;
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
  homeLogoUrl?: string | null;
  awayLogoUrl?: string | null;
  fonbetHomeTeamId?: number | null;
  fonbetAwayTeamId?: number | null;
  agentReport?: string | null;
  matchStartsAt: string;
  selectionTitle: string;
  fixedOdds: number;
  minAcceptableOdds?: number | null;
  stakeUnits: number;
  bookmakerSource?: string;
  accessTier: AccessTier;
  singlePriceRub?: number | null;
  isFeatured?: boolean;
  insuredOnLoss?: boolean;
  authorSource?: 'HUMAN' | 'AI_AUTOPILOT';
  externalFixtureId?: string | null;
  aiConfidencePct?: number | null;
  aiEdgePct?: number | null;
  researchSummary?: string | null;
  researchSources?: string[];
  analysisTeaser: string;
  analysisFull: string;
  pushToTelegram?: boolean;
}): Promise<PredictionRecord> {
  const odds = Number(input.fixedOdds);
  const stake = Number(input.stakeUnits);
  if (odds < 1.05 || odds > 50) throw new Error('Укажите реальный коэффициент (1.05 – 50)');
  if (stake < 0.25 || stake > 10) {
    throw new Error('Размер флэта должен быть от 0.25 до 10% банка');
  }

  const startsIso = new Date(input.matchStartsAt).toISOString();
  const nowIso = new Date().toISOString();
  const shortId = randomUUID().slice(0, 8);

  const { sha256 } = computeCanonicalSha256({
    matchStartsAt: startsIso,
    selectionTitle: input.selectionTitle,
    fixedOdds: odds,
    stakeUnits: stake,
  });

  const created = await mutateState((state) => {
    if (input.isFeatured) {
      for (const existing of state.predictions) {
        existing.isFeatured = false;
      }
    }

    const pred: PredictionRecord = {
      id: `pred_${shortId}`,
      slug: slugifyMatch(input.homeTeam, input.awayTeam, shortId.slice(0, 4)),
      sport: input.sport,
      leagueName: input.leagueName.trim(),
      homeTeam: input.homeTeam.trim(),
      awayTeam: input.awayTeam.trim(),
      homeLogoUrl: input.homeLogoUrl?.trim() || null,
      awayLogoUrl: input.awayLogoUrl?.trim() || null,
      fonbetHomeTeamId: input.fonbetHomeTeamId ?? null,
      fonbetAwayTeamId: input.fonbetAwayTeamId ?? null,
      agentReport: input.agentReport?.trim() || null,
      matchStartsAt: startsIso,
      matchStatus: 'UPCOMING',
      matchLifecycleStatus: 'SCHEDULED',
      actualStartedAt: null,
      actualStartedAtPrecision: null,
      actualFinishedAt: null,
      actualFinishedAtPrecision: null,
      matchVerifiedAt: null,
      matchVerificationSource: null,
      matchVerificationConflict: false,
      finalScoreVerified: false,
      finalScoreVerifiedSources: [],
      finalScoreIsOvertime: false,
      liveHomeScore: null,
      liveAwayScore: null,
      liveUpdatedAt: null,
      stakePercent: stake,
      stakeUnits: stake,
      bookmakerSource: input.bookmakerSource?.trim() || 'Фонбет · Винлайн · Пари',
      analysisTeaser: input.analysisTeaser.trim(),
      isFeatured: Boolean(input.isFeatured),
      authorSource: input.authorSource ?? 'HUMAN',
      externalFixtureId: input.externalFixtureId ?? null,
      aiConfidencePct: input.aiConfidencePct ?? null,
      aiEdgePct: input.aiEdgePct ?? null,
      researchSummary: input.researchSummary ?? null,
      researchSources: input.researchSources ?? [],
      insuredOnLoss:
        input.accessTier === 'PAID_SINGLE' ? Boolean(input.insuredOnLoss ?? true) : false,
      selectionTitle: input.selectionTitle.trim(),
      fixedOdds: odds,
      minAcceptableOdds: input.minAcceptableOdds ? Number(input.minAcceptableOdds) : null,
      analysisFull: input.analysisFull.trim(),
      accessTier: input.accessTier,
      singlePriceRub:
        input.accessTier === 'PAID_SINGLE'
          ? Math.max(50, Number(input.singlePriceRub) || state.settings.defaultSinglePriceRub)
          : null,
      revealAfterFinish: true,
      resultStatus: 'PENDING',
      cashoutMultiplier: null,
      finalScore: null,
      profitUnits: null,
      profitPercent: null,
      verificationHash: sha256,
      oddsLockedAt: nowIso,
      settledAt: null,
      createdAt: nowIso,
    };

    state.predictions.unshift(pred);
    return { pred, settings: state.settings };
  });

  if (input.pushToTelegram) {
    const siteBase = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
    const matchUrl = siteBase ? `${siteBase}/predictions/${created.pred.slug}` : '';
    const priceLabel =
      created.pred.accessTier === 'FREE'
        ? '🎁 Открытый бесплатный разбор (0 ₽)'
        : `🔓 Разовый доступ: ${created.pred.singlePriceRub} ₽${
            created.pred.insuredOnLoss ? ' (🛡 со страховкой 100% на баланс)' : ''
          }`;
    const msg = [
      `📊 <b>Новый прогноз на ${created.settings.brandName}</b>`,
      `🏆 ${created.pred.leagueName}`,
      `⚔️ <b>${created.pred.homeTeam} — ${created.pred.awayTeam}</b>`,
      `💼 Рекомендуемая ставка: <b>${created.pred.stakeUnits.toFixed(1)}% от банка</b>`,
      `${priceLabel}`,
      ``,
      `${created.pred.analysisTeaser}`,
    ].join('\n');
    await sendTelegramChannelAnnouncement(
      created.settings,
      msg,
      matchUrl
        ? {
            text:
              created.pred.accessTier === 'FREE'
                ? '🔥 Смотреть бесплатный прогноз →'
                : `🔓 Открыть прогноз (${created.pred.singlePriceRub} ₽) →`,
            url: matchUrl,
          }
        : undefined,
    );
  }

  return created.pred;
}

export async function settlePredictionByAdmin(params: {
  predictionId: string;
  resultStatus: ResultStatus;
  finalScore?: string | null;
  cashoutMultiplier?: number | null;
  pushResultToTelegram?: boolean;
}): Promise<{ prediction: PredictionRecord; compensatedUsers: number }> {
  const outcome = await mutateState((state) => {
    const pred = state.predictions.find((p) => p.id === params.predictionId);
    if (!pred) throw new Error('Событие не найдено');

    pred.resultStatus = params.resultStatus;
    if (params.finalScore !== undefined) {
      pred.finalScore = params.finalScore?.trim() || null;
    }

    if (params.resultStatus === 'PENDING') {
      pred.matchStatus = 'UPCOMING';
      pred.profitUnits = null;
      pred.profitPercent = null;
      pred.settledAt = null;
      return { prediction: pred, compensatedUsers: 0, settings: state.settings };
    }

    pred.matchStatus = 'FINISHED';
    pred.settledAt = new Date().toISOString();

    let profit = 0;
    if (params.resultStatus === 'WIN') {
      profit = Number((pred.stakeUnits * (pred.fixedOdds - 1)).toFixed(2));
    } else if (params.resultStatus === 'LOSS') {
      profit = -pred.stakeUnits;
    } else if (params.resultStatus === 'PUSH') {
      profit = 0;
    } else if (params.resultStatus === 'CASHOUT') {
      const mult = Number(params.cashoutMultiplier || 1.4);
      pred.cashoutMultiplier = mult;
      profit = Number((pred.stakeUnits * (mult - 1)).toFixed(2));
    }

    pred.profitUnits = profit;
    pred.profitPercent = profit;

    // Автоматическая страховка покупателей: независимый возврат доли каждого матча (включая наборы из 2-3 игр)
    let compensatedUsers = 0;
    const refundedDmQueue: Array<{ chatId: string; amountRub: number; newBalance: number }> = [];
    const winDmChatIds: string[] = [];

    if (params.resultStatus === 'WIN' || params.resultStatus === 'CASHOUT') {
      for (const u of state.users) {
        if (u.telegramChatId && u.purchasedPredictionIds.includes(pred.id)) {
          winDmChatIds.push(u.telegramChatId);
        }
      }
    }

    if (
      pred.insuredOnLoss &&
      (params.resultStatus === 'LOSS' || params.resultStatus === 'PUSH')
    ) {
      for (const tx of state.transactions) {
        if (tx.status !== 'SUCCEEDED' || !tx.predictionIds.includes(pred.id)) {
          continue;
        }
        const alreadyRefundedIds = Array.isArray(tx.insuredRefundedPredictionIds)
          ? tx.insuredRefundedPredictionIds
          : tx.insuranceCredited
            ? [...tx.predictionIds]
            : [];

        if (alreadyRefundedIds.includes(pred.id)) {
          continue;
        }

        const share = Math.round(tx.amountRub / Math.max(1, tx.predictionIds.length));
        const buyer = state.users.find((u) => u.id === tx.userId);
        if (buyer && share > 0) {
          buyer.balanceRub += share;
          tx.insuredRefundedPredictionIds = [...alreadyRefundedIds, pred.id];
          tx.insuranceRefundedAmountRub = (tx.insuranceRefundedAmountRub || 0) + share;
          tx.insuranceCredited = true;
          compensatedUsers += 1;
          if (buyer.telegramChatId) {
            refundedDmQueue.push({
              chatId: buyer.telegramChatId,
              amountRub: share,
              newBalance: buyer.balanceRub,
            });
          }
        }
      }
    }

    return {
      prediction: pred,
      compensatedUsers,
      refundedDmQueue,
      winDmChatIds,
      settings: state.settings,
    };
  });

  // Рассылка личных уведомлений покупателям в Telegram
  if (outcome.refundedDmQueue && outcome.refundedDmQueue.length > 0) {
    const p = outcome.prediction;
    for (const item of outcome.refundedDmQueue) {
      const dm = [
        `🛡 <b>Сработала страховка 100% (${outcome.settings.brandName})!</b>`,
        ``,
        `Матч «<b>${p.homeTeam} — ${p.awayTeam}</b>» завершился со счетом ${p.finalScore || 'не в нашу пользу'}.`,
        `💰 На ваш кошелек автоматически возвращено: <b>+${item.amountRub.toLocaleString('ru-RU')} ₽</b> (текущий баланс: <b>${item.newBalance.toLocaleString('ru-RU')} ₽</b>).`,
        `Заходите на витрину и открывайте любой следующий прогноз бесплатно с баланса!`,
      ].join('\n');
      void sendTelegramDirectMessage(outcome.settings, item.chatId, dm).catch(
        () => undefined,
      );
    }
  }

  if (outcome.winDmChatIds && outcome.winDmChatIds.length > 0) {
    const p = outcome.prediction;
    for (const chatId of outcome.winDmChatIds) {
      const dm = [
        `✅ <b>С победой! Ваш прогноз зашел (${p.finalScore || 'Победа'})</b>`,
        `⚔️ <b>${p.homeTeam} — ${p.awayTeam}</b>`,
        `🎯 Исход: <b>${p.selectionTitle}</b> @ <b>${p.fixedOdds.toFixed(2)}</b>`,
      ].join('\n');
      void sendTelegramDirectMessage(outcome.settings, chatId, dm).catch(
        () => undefined,
      );
    }
  }

  if (params.pushResultToTelegram && params.resultStatus !== 'PENDING') {
    const p = outcome.prediction;
    const badge =
      p.resultStatus === 'WIN' || p.resultStatus === 'CASHOUT'
        ? `✅ <b>ПОБЕДА (${p.finalScore || 'расчет'})</b> · +${(p.profitUnits ?? 0).toFixed(2)}% к банку`
        : p.resultStatus === 'PUSH'
          ? `➖ <b>ВОЗВРАТ (${p.finalScore || 'расчет'})</b>${
              outcome.compensatedUsers > 0 ? ' · Страховка 100% начислена на баланс' : ''
            }`
          : `❌ <b>МИНУС (${p.finalScore || 'расчет'})</b>${
              outcome.compensatedUsers > 0
                ? ' · 🛡 Страховка 100% возвращена на баланс покупателям'
                : ''
            }`;

    const siteBase = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
    const statsUrl = siteBase ? `${siteBase}/stats` : '';
    const msg = [
      badge,
      `⚽️ <b>${p.homeTeam} — ${p.awayTeam}</b> (${p.leagueName})`,
      `🎯 Исход: <b>${p.selectionTitle}</b> @ <b>${p.fixedOdds.toFixed(2)}</b>`,
      `🔐 Проверка честности: <code>${p.verificationHash.slice(0, 16)}…</code>`,
    ].join('\n');
    await sendTelegramChannelAnnouncement(
      outcome.settings,
      msg,
      statsUrl ? { text: '📊 Проверить всю статистику →', url: statsUrl } : undefined,
    );
  }

  return {
    prediction: outcome.prediction,
    compensatedUsers: outcome.compensatedUsers,
  };
}

export function computeAiPerformanceStats(
  predictions: PredictionRecord[],
): AiPerformanceStats {
  const aiItems = predictions.filter((p) => p.authorSource === 'AI_AUTOPILOT');
  const settled = aiItems.filter((p) => p.resultStatus !== 'PENDING');
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let turnover = 0;
  let netProfit = 0;

  for (const item of settled) {
    turnover += item.stakeUnits;
    netProfit += item.profitUnits ?? 0;
    if (item.resultStatus === 'WIN' || item.resultStatus === 'CASHOUT') wins += 1;
    else if (item.resultStatus === 'LOSS') losses += 1;
    else pushes += 1;
  }

  const decisive = wins + losses;
  const winRatePct = decisive > 0 ? Number(((wins / decisive) * 100).toFixed(1)) : 0;
  const yieldPct = turnover > 0 ? Number(((netProfit / turnover) * 100).toFixed(1)) : 0;

  return {
    totalAiPredictions: aiItems.length,
    settledAiPredictions: settled.length,
    wins,
    losses,
    pushes,
    winRatePct,
    netProfitUnits: Number(netProfit.toFixed(2)),
    yieldPct,
  };
}
