import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  MatchLifecycleStatus,
  PredictionAccessTier,
  PredictionCardData,
  PredictionResultStatus,
  SportType,
} from '@/components/predictions/PredictionCard';
import {
  EQUITY_CURVE_MONTHS,
  INITIAL_AFFILIATES,
  INITIAL_CRM_USERS,
  SOCIAL_PROOF_FEED,
  STATS_BY_PERIOD,
  type AffiliatePartnerRow,
  type CrmUserRow,
  type EquityPoint,
  type VerifiedStatsSnapshot,
} from '@/data/mockPlatformData';

export interface StoredPredictionRecord {
  id: string;
  slug: string;
  sport: SportType;
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
  matchStartsAt: string;
  matchStatus: MatchLifecycleStatus;
  stakePercent: number;
  stakeUnits: number;
  bookmakerSource: string;
  analysisTeaser: string | null;
  accessTier: PredictionAccessTier;
  singlePriceRub: number | null;
  revealAfterFinish: boolean;

  // Секретные поля (хранятся ТОЛЬКО на сервере)
  selectionTitle: string;
  fixedOdds: number;
  minAcceptableOdds: number | null;
  analysisFull: string;

  // Расчет и криптографическая фиксация
  resultStatus: PredictionResultStatus;
  cashoutMultiplier: number | null;
  finalScore: string | null;
  profitUnits: number | null;
  profitPercent: number | null;
  verificationHash: string;
  oddsLockedAt: string;
  isHistoricalSeed?: boolean;
}

export interface TariffPlanConfig {
  code: 'VIP_7D' | 'VIP_30D' | 'VIP_LIFETIME';
  name: string;
  badge: string;
  durationDays: number | null;
  priceRub: number;
  oldPriceRub: number;
  supportsAutoRenew: boolean;
  features: string[];
}

export interface TransactionRecord {
  id: string;
  idempotenceKey: string;
  yookassaPaymentId: string;
  userId: string;
  userEmail: string;
  txType: 'SINGLE_PREDICTION' | 'VIP_SUBSCRIPTION' | 'BALANCE_TOPUP';
  predictionId: string | null;
  planCode: 'VIP_7D' | 'VIP_30D' | 'VIP_LIFETIME' | null;
  title: string;
  amountRub: number;
  paymentMethod: 'sbp' | 'bank_card' | 'internal_balance';
  status: 'PENDING' | 'SUCCEEDED' | 'CANCELED' | 'REFUNDED';
  receiptEmail: string;
  receiptStatus: 'PENDING' | 'REGISTERED' | 'FAILED';
  autoRenew: boolean;
  referredByCode: string | null;
  commissionAccruedRub: number;
  vipInviteLink: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface TelegramDispatchRecord {
  id: string;
  type: 'NEW_PREDICTION_CHANNEL' | 'SETTLEMENT_CHANNEL' | 'ONE_TIME_VIP_INVITE';
  recipientTarget: string;
  messagePreview: string;
  deliveredCount: number;
  mode: 'LIVE_BOT_API' | 'SANDBOX_LOG';
  createdAt: string;
}

export interface ViewerSessionState {
  userId: string;
  email: string;
  status: 'ACTIVE' | 'BLOCKED';
  hasActiveVip: boolean;
  vipPlanLabel: string | null;
  vipExpiresAt: string | null;
  autoRenewEnabled: boolean;
  vipInviteLink: string | null;
  purchasedPredictionIds: string[];
  referenceBankrollRub: number;
  balanceRub: number;
  attributedRefCode: string | null;
}

interface PlatformDatabaseShape {
  predictions: StoredPredictionRecord[];
  tariffs: TariffPlanConfig[];
  defaultSinglePriceRub: number;
  transactions: TransactionRecord[];
  processedWebhookKeys: string[];
  crmUsers: CrmUserRow[];
  affiliates: AffiliatePartnerRow[];
  telegramDispatches: TelegramDispatchRecord[];
  viewer: ViewerSessionState;
}

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'platform-store.json');

export function computePredictionSha256(params: {
  matchStartsAt: string;
  selectionTitle: string;
  fixedOdds: number;
  stakeUnits: number;
}): { canonicalPayload: string; sha256: string } {
  const canonicalPayload = [
    params.matchStartsAt,
    params.selectionTitle.trim(),
    params.fixedOdds.toFixed(3),
    params.stakeUnits.toFixed(2),
  ].join('|');

  const sha256 = createHash('sha256').update(canonicalPayload, 'utf8').digest('hex');
  return { canonicalPayload, sha256 };
}

function buildSeedDatabase(): PlatformDatabaseShape {
  const now = Date.now();
  const in42Min = new Date(now + 42 * 60 * 1000).toISOString();
  const in3Hours = new Date(now + 3 * 3600 * 1000 + 20 * 60 * 1000).toISOString();
  const started35MinAgo = new Date(now - 35 * 60 * 1000).toISOString();
  const yesterday = new Date(now - 20 * 3600 * 1000).toISOString();
  const twoDaysAgo = new Date(now - 44 * 3600 * 1000).toISOString();
  const threeDaysAgo = new Date(now - 68 * 3600 * 1000).toISOString();

  const rawSeeds: Array<Omit<StoredPredictionRecord, 'verificationHash'>> = [
    {
      id: 'pred_khl_1',
      slug: 'lokomotiv-ska-khl',
      sport: 'HOCKEY',
      leagueName: 'КХЛ · Регулярный чемпионат',
      homeTeam: 'Локомотив',
      awayTeam: 'СКА',
      matchStartsAt: in42Min,
      matchStatus: 'UPCOMING',
      stakePercent: 2.0,
      stakeUnits: 2.0,
      bookmakerSource: 'Pinnacle / Фонбет',
      analysisTeaser:
        'Подтверждена замена стартового вратаря гостей на утренней раскатке. Перевес по модели xG спецбригад +9.1% к текущей линии.',
      accessTier: 'PAID_SINGLE',
      singlePriceRub: 790,
      revealAfterFinish: true,
      selectionTitle: 'Индивидуальный тотал 1-й Больше (2.5)',
      fixedOdds: 1.98,
      minAcceptableOdds: 1.86,
      analysisFull:
        '1. У гостей бэкап-вратарь впервые за 3 недели выходит в старте против топ-2 спецбригады большинства Востока.\n2. По xG в равных составах хозяева создают 3.18 ожидаемых шайб за игру дома.\n3. Справедливый кэф по пиннакл-модели — 1.80, забираем перевес +9.1% над маржой.',
      resultStatus: 'PENDING',
      cashoutMultiplier: null,
      finalScore: null,
      profitUnits: null,
      profitPercent: null,
      oddsLockedAt: new Date(now - 2 * 3600 * 1000).toISOString(),
      isHistoricalSeed: true,
    },
    {
      id: 'pred_cs2_2',
      slug: 'spirit-mouz-cs2-major',
      sport: 'ESPORTS',
      leagueName: 'CS2 · Major Championship (Playoffs)',
      homeTeam: 'Team Spirit',
      awayTeam: 'MOUZ',
      matchStartsAt: in3Hours,
      matchStatus: 'UPCOMING',
      stakePercent: 2.5,
      stakeUnits: 2.5,
      bookmakerSource: 'Pinnacle / BetBoom',
      analysisTeaser:
        'Жесткий перекос вето карт в BO3: соперник обязан банить свой пермабан, отдавая пик с 84% винрейтом.',
      accessTier: 'PAID_SINGLE',
      singlePriceRub: 890,
      revealAfterFinish: true,
      selectionTitle: 'Фора по картам: Team Spirit (-1.5)',
      fixedOdds: 2.06,
      minAcceptableOdds: 1.92,
      analysisFull:
        'Маппул соперника вынуждает банить Ancient в первой фазе, оставляя открытыми Nuke и Mirage (винрейт Spirit за 3 месяца — 84% и 79%). По пистолетным раундам перевес +14%.',
      resultStatus: 'PENDING',
      cashoutMultiplier: null,
      finalScore: null,
      profitUnits: null,
      profitPercent: null,
      oddsLockedAt: new Date(now - 3 * 3600 * 1000).toISOString(),
      isHistoricalSeed: true,
    },
    {
      id: 'pred_ucl_live',
      slug: 'arsenal-inter-ucl',
      sport: 'FOOTBALL',
      leagueName: 'Лига Чемпионов УЕФА',
      homeTeam: 'Арсенал',
      awayTeam: 'Интер',
      matchStartsAt: started35MinAgo,
      matchStatus: 'LIVE',
      stakePercent: 2.0,
      stakeUnits: 2.0,
      bookmakerSource: 'Pinnacle',
      analysisTeaser:
        'Прогноз взят по утренней линии до просадки кэфа на 0.18 пункта. Доступен внутри VIP-подписки.',
      accessTier: 'VIP_ONLY',
      singlePriceRub: null,
      revealAfterFinish: true,
      selectionTitle: 'Азиатская фора 1 (-1.0)',
      fixedOdds: 1.91,
      minAcceptableOdds: 1.82,
      analysisFull:
        'Интенсивность прессинга PPDA у хозяев — 7.4, у гостей травмирован опорный полузащитник. Ставка зафиксирована по ранней линии за 6 часов до стартового свистка.',
      resultStatus: 'PENDING',
      cashoutMultiplier: null,
      finalScore: "1:0 (41')",
      profitUnits: null,
      profitPercent: null,
      oddsLockedAt: new Date(now - 7 * 3600 * 1000).toISOString(),
      isHistoricalSeed: true,
    },
    {
      id: 'pred_atp_settled_win',
      slug: 'sinner-medvedev-atp',
      sport: 'TENNIS',
      leagueName: 'ATP Finals · Хард в помещении',
      homeTeam: 'Янник Синнер',
      awayTeam: 'Даниил Медведев',
      matchStartsAt: yesterday,
      matchStatus: 'FINISHED',
      stakePercent: 2.0,
      stakeUnits: 2.0,
      bookmakerSource: 'Pinnacle / PARI',
      analysisTeaser:
        'Быстрый закрытый хард в Турине дает +11% к очкам на первой подаче Синнера. Полный разбор открыт для проверки.',
      accessTier: 'PAID_SINGLE',
      singlePriceRub: 790,
      revealAfterFinish: true,
      selectionTitle: 'Фора 1 по геймам (-3.5)',
      fixedOdds: 2.08,
      minAcceptableOdds: 1.95,
      analysisFull:
        'Процент выигрыша первой подачи Синнера на индоре — 83.4%, при этом процент двойных ошибок соперника за турнир превысил 7.2%. Зафиксировали 2.08 за 8 часов до игры (к старту линия упала до 1.87). Уверенный заход 6:3, 6:4.',
      resultStatus: 'WIN',
      cashoutMultiplier: null,
      finalScore: '2:0 (6:3, 6:4)',
      profitUnits: 2.16,
      profitPercent: 2.16,
      oddsLockedAt: new Date(now - 28 * 3600 * 1000).toISOString(),
      isHistoricalSeed: true,
    },
    {
      id: 'pred_epl_cashout',
      slug: 'newcastle-chelsea-epl',
      sport: 'FOOTBALL',
      leagueName: 'АПЛ · 11-й тур',
      homeTeam: 'Ньюкасл',
      awayTeam: 'Челси',
      matchStartsAt: twoDaysAgo,
      matchStatus: 'FINISHED',
      stakePercent: 2.0,
      stakeUnits: 2.0,
      bookmakerSource: 'Фонбет / ЦУПИС',
      analysisTeaser:
        'Досрочная фиксация прибыли в VIP-канале на 74-й минуте после удаления у хозяев.',
      accessTier: 'VIP_ONLY',
      singlePriceRub: null,
      revealAfterFinish: true,
      selectionTitle: 'Победа 1 с форой (0)',
      fixedOdds: 2.02,
      minAcceptableOdds: 1.9,
      analysisFull:
        'При счете 1:0 на 74-й минуте хозяева получили красную карточку. В VIP-боте мгновенно вышел сигнал на Cashout с множителем 1.55 — зафиксировали чистые +1.10 u без валидола в концовке (матч закончился 1:1).',
      resultStatus: 'CASHOUT',
      cashoutMultiplier: 1.55,
      finalScore: '1:1 (Cashout при 1:0)',
      profitUnits: 1.1,
      profitPercent: 1.1,
      oddsLockedAt: new Date(now - 52 * 3600 * 1000).toISOString(),
      isHistoricalSeed: true,
    },
    {
      id: 'pred_nhl_honest_loss',
      slug: 'rangers-winnipeg-nhl',
      sport: 'HOCKEY',
      leagueName: 'НХЛ · Регулярный сезон',
      homeTeam: 'НЙ Рейнджерс',
      awayTeam: 'Виннипег Джетс',
      matchStartsAt: threeDaysAgo,
      matchStatus: 'FINISHED',
      stakePercent: 1.5,
      stakeUnits: 1.5,
      bookmakerSource: 'Pinnacle',
      analysisTeaser:
        'Мы не удаляем минусы: открытый архив всех ставок. По xG перевес был 3.84 против 2.41, но вратарь гостей поймал кураж.',
      accessTier: 'PAID_SINGLE',
      singlePriceRub: 790,
      revealAfterFinish: true,
      selectionTitle: 'Тотал меньше (5.5)',
      fixedOdds: 1.94,
      minAcceptableOdds: 1.85,
      analysisFull:
        'Две шайбы в пустые ворота на 59-й минуте пробили тотал. Благодаря строгому флэту 1.5% убыток составил контролируемые -1.50 u, которые были перекрыты следующей же победной серией.',
      resultStatus: 'LOSS',
      cashoutMultiplier: null,
      finalScore: '3:4',
      profitUnits: -1.5,
      profitPercent: -1.5,
      oddsLockedAt: new Date(now - 75 * 3600 * 1000).toISOString(),
      isHistoricalSeed: true,
    },
  ];

  const predictions: StoredPredictionRecord[] = rawSeeds.map((seed) => ({
    ...seed,
    verificationHash: computePredictionSha256({
      matchStartsAt: seed.matchStartsAt,
      selectionTitle: seed.selectionTitle,
      fixedOdds: seed.fixedOdds,
      stakeUnits: seed.stakeUnits,
    }).sha256,
  }));

  const tariffs: TariffPlanConfig[] = [
    {
      code: 'VIP_7D',
      name: 'VIP · 1 неделя',
      badge: 'Тест-драйв системы',
      durationDays: 7,
      priceRub: 1_990,
      oldPriceRub: 2_900,
      supportsAutoRenew: true,
      features: [
        'Все прогнозы на сайте без размытия (15–20 ставок)',
        'Одноразовый инвайт в закрытый VIP Telegram-канал',
        'Уведомления о ранней линии и Live Cashout',
      ],
    },
    {
      code: 'VIP_30D',
      name: 'VIP · 1 месяц',
      badge: 'Оптимальная дистанция',
      durationDays: 30,
      priceRub: 4_990,
      oldPriceRub: 9_900,
      supportsAutoRenew: true,
      features: [
        'Полный доступ ко всем смолл-маркетам и пиннакл-валуям',
        'Мгновенные пуши в закрытый VIP Telegram за секунду до просадки',
        'Персональный калькулятор Флэта и защита от тильта',
      ],
    },
    {
      code: 'VIP_LIFETIME',
      name: 'VIP · Навсегда',
      badge: 'Без повторных платежей',
      durationDays: null,
      priceRub: 24_900,
      oldPriceRub: 45_000,
      supportsAutoRenew: false,
      features: [
        'Пожизненный доступ ко всем прогнозам и закрытому VIP-клубу',
        'Приоритетная рассылка смолл-маркетов до прогрузки линии',
        'Прямая обратная связь с главным аналитиком по вашему банку',
      ],
    },
  ];

  const initialTransactions: TransactionRecord[] = [
    {
      id: 'tx_seed_101',
      idempotenceKey: '8a112233-4455-4666-8777-9900aabbcc01',
      yookassaPaymentId: '2e91b8a0-000f-5000-8000-1b64728ac901',
      userId: 'u1',
      userEmail: 'm.voronov@mail.ru',
      txType: 'VIP_SUBSCRIPTION',
      predictionId: null,
      planCode: 'VIP_30D',
      title: 'VIP · 1 месяц',
      amountRub: 4_990,
      paymentMethod: 'sbp',
      status: 'SUCCEEDED',
      receiptEmail: 'm.voronov@mail.ru',
      receiptStatus: 'REGISTERED',
      autoRenew: true,
      referredByCode: 'khl_insider',
      commissionAccruedRub: 1_996,
      vipInviteLink: 'https://t.me/+VIP_mVoronov_7xQ2',
      createdAt: new Date(now - 3 * 3600 * 1000).toISOString(),
      paidAt: new Date(now - 3 * 3600 * 1000 + 8000).toISOString(),
    },
    {
      id: 'tx_seed_102',
      idempotenceKey: '8a112233-4455-4666-8777-9900aabbcc02',
      yookassaPaymentId: '2e91b8a0-000f-5000-8000-1b64728ac902',
      userId: 'viewer_current',
      userEmail: 'bettor@example.ru',
      txType: 'SINGLE_PREDICTION',
      predictionId: 'pred_atp_settled_win',
      planCode: null,
      title: 'Прогноз ATP Finals: Янник Синнер — Даниил Медведев',
      amountRub: 790,
      paymentMethod: 'sbp',
      status: 'SUCCEEDED',
      receiptEmail: 'bettor@example.ru',
      receiptStatus: 'REGISTERED',
      autoRenew: false,
      referredByCode: null,
      commissionAccruedRub: 0,
      vipInviteLink: null,
      createdAt: new Date(now - 26 * 3600 * 1000).toISOString(),
      paidAt: new Date(now - 26 * 3600 * 1000 + 5000).toISOString(),
    },
  ];

  const telegramDispatches: TelegramDispatchRecord[] = [
    {
      id: 'tg_seed_1',
      type: 'NEW_PREDICTION_CHANNEL',
      recipientTarget: 'VIP Канал (-1002145987654) + 318 DM',
      messagePreview: '🔥 VIP ПРОГНОЗ | КХЛ · Локомотив — СКА | Исход зафиксирован (SHA-256)',
      deliveredCount: 319,
      mode: 'SANDBOX_LOG',
      createdAt: new Date(now - 2 * 3600 * 1000).toISOString(),
    },
    {
      id: 'tg_seed_2',
      type: 'ONE_TIME_VIP_INVITE',
      recipientTarget: '@max_bettor (m.voronov@mail.ru)',
      messagePreview: 'Выдана одноразовая ссылка member_limit=1 после Webhook ЮKassa #2e91b8a0',
      deliveredCount: 1,
      mode: 'SANDBOX_LOG',
      createdAt: new Date(now - 3 * 3600 * 1000).toISOString(),
    },
  ];

  return {
    predictions,
    tariffs,
    defaultSinglePriceRub: 790,
    transactions: initialTransactions,
    processedWebhookKeys: ['payment.succeeded:2e91b8a0-000f-5000-8000-1b64728ac901'],
    crmUsers: INITIAL_CRM_USERS,
    affiliates: INITIAL_AFFILIATES,
    telegramDispatches,
    viewer: {
      userId: 'viewer_current',
      email: 'bettor@example.ru',
      status: 'ACTIVE',
      hasActiveVip: false,
      vipPlanLabel: null,
      vipExpiresAt: null,
      autoRenewEnabled: false,
      vipInviteLink: null,
      purchasedPredictionIds: ['pred_atp_settled_win'],
      referenceBankrollRub: 100_000,
      balanceRub: 1_500,
      attributedRefCode: null,
    },
  };
}

let memoryCache: PlatformDatabaseShape | null = null;

function readDb(): PlatformDatabaseShape {
  if (memoryCache) return memoryCache;
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      memoryCache = JSON.parse(raw) as PlatformDatabaseShape;
      return memoryCache;
    }
  } catch {
    // Fallback to clean seed
  }
  const seeded = buildSeedDatabase();
  saveDb(seeded);
  return seeded;
}

function saveDb(nextDb: PlatformDatabaseShape): void {
  memoryCache = nextDb;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpPath = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(nextDb, null, 2), 'utf8');
    fs.renameSync(tmpPath, DATA_FILE);
  } catch {
    // Работает из памяти, если ФС только для чтения
  }
}

/**
 * Строгая Server-Side маскировка закрытых прогнозов (исключает утечку через DevTools)
 */
export function serializePredictionForViewer(
  record: StoredPredictionRecord,
  viewer: ViewerSessionState,
): PredictionCardData {
  const isFree = record.accessTier === 'FREE';
  const isSettledPublic =
    record.revealAfterFinish &&
    record.matchStatus === 'FINISHED' &&
    record.resultStatus !== 'PENDING';
  const isPurchasedSingle = viewer.purchasedPredictionIds.includes(record.id);

  const isUnlocked =
    viewer.status === 'ACTIVE' &&
    (isFree ||
      isSettledPublic ||
      viewer.hasActiveVip ||
      (record.accessTier === 'PAID_SINGLE' && isPurchasedSingle));

  return {
    id: record.id,
    slug: record.slug,
    sport: record.sport,
    leagueName: record.leagueName,
    homeTeam: record.homeTeam,
    awayTeam: record.awayTeam,
    matchStartsAt: record.matchStartsAt,
    matchStatus: record.matchStatus,
    stakePercent: record.stakePercent,
    stakeUnits: record.stakeUnits,
    bookmakerSource: record.bookmakerSource,
    analysisTeaser: record.analysisTeaser,
    isLocked: !isUnlocked,
    accessTier: record.accessTier,
    singlePriceRub: record.singlePriceRub,
    selectionTitle: isUnlocked ? record.selectionTitle : null,
    fixedOdds: isUnlocked ? record.fixedOdds : null,
    minAcceptableOdds: isUnlocked ? record.minAcceptableOdds : null,
    analysisFull: isUnlocked ? record.analysisFull : null,
    resultStatus: record.resultStatus,
    finalScore: record.finalScore,
    profitUnits: record.profitUnits,
    profitPercent: record.profitPercent,
    verificationHash: record.verificationHash,
    oddsLockedAt: record.oddsLockedAt,
  };
}

/**
 * Динамический пересчет верифицированной статистики (ROI, Yield, WinRate, Streak) и Equity Curve
 */
function computeVerifiedAnalytics(predictions: StoredPredictionRecord[]): {
  statsByPeriod: Record<'ALL_TIME' | 'MONTH' | 'WEEK', VerifiedStatsSnapshot>;
  equityCurve: EquityPoint[];
} {
  const customSettled = predictions.filter(
    (p) => !p.isHistoricalSeed && p.resultStatus !== 'PENDING' && p.profitUnits !== null,
  );

  const deltaUnits = customSettled.reduce((acc, p) => acc + (p.profitUnits ?? 0), 0);
  const deltaTurnover = customSettled.reduce((acc, p) => acc + p.stakeUnits, 0);
  const deltaWins = customSettled.filter((p) => p.resultStatus === 'WIN').length;
  const deltaLosses = customSettled.filter((p) => p.resultStatus === 'LOSS').length;
  const deltaPushes = customSettled.filter((p) => p.resultStatus === 'PUSH').length;
  const deltaCashouts = customSettled.filter((p) => p.resultStatus === 'CASHOUT').length;

  // Считаем изменение текущей серии побед по новым ставкам
  let streakAfterNew = STATS_BY_PERIOD.ALL_TIME.currentWinStreak;
  for (const item of [...customSettled].reverse()) {
    if (item.resultStatus === 'WIN') streakAfterNew += 1;
    else if (item.resultStatus === 'LOSS') streakAfterNew = 0;
  }

  const adjustSnapshot = (base: VerifiedStatsSnapshot): VerifiedStatsSnapshot => {
    const wins = base.wins + deltaWins;
    const losses = base.losses + deltaLosses;
    const pushes = base.pushes + deltaPushes;
    const cashouts = base.cashouts + deltaCashouts;
    const settledBets = base.settledBets + customSettled.length;
    const netProfitUnits = Number((base.netProfitUnits + deltaUnits).toFixed(2));
    const roiBankrollPct = Number((base.roiBankrollPct + deltaUnits).toFixed(2));
    const approxBaseTurnover = (base.netProfitUnits / Math.max(1, base.yieldPct)) * 100;
    const nextTurnover = approxBaseTurnover + deltaTurnover;
    const yieldPct = Number(((netProfitUnits / Math.max(1, nextTurnover)) * 100).toFixed(1));
    const winRatePct =
      wins + losses > 0 ? Number(((wins / (wins + losses)) * 100).toFixed(1)) : base.winRatePct;

    return {
      ...base,
      settledBets,
      wins,
      losses,
      pushes,
      cashouts,
      netProfitUnits,
      roiBankrollPct,
      yieldPct,
      winRatePct,
      currentWinStreak: streakAfterNew,
    };
  };

  const equityCurve = EQUITY_CURVE_MONTHS.map((pt, idx) => {
    if (idx !== EQUITY_CURVE_MONTHS.length - 1 || customSettled.length === 0) return pt;
    return {
      ...pt,
      profitUnits: Number((pt.profitUnits + deltaUnits).toFixed(2)),
      cumulativeBankPct: Number((pt.cumulativeBankPct + deltaUnits).toFixed(2)),
      betsCount: pt.betsCount + customSettled.length,
    };
  });

  return {
    statsByPeriod: {
      ALL_TIME: adjustSnapshot(STATS_BY_PERIOD.ALL_TIME),
      MONTH: adjustSnapshot(STATS_BY_PERIOD.MONTH),
      WEEK: adjustSnapshot(STATS_BY_PERIOD.WEEK),
    },
    equityCurve,
  };
}

/**
 * Отправка реального сообщения в Telegram Bot API (если задан TELEGRAM_BOT_TOKEN),
 * плюс запись в журнал рассылок админ-панели.
 */
async function dispatchTelegramPush(
  db: PlatformDatabaseShape,
  entry: Omit<TelegramDispatchRecord, 'id' | 'mode' | 'createdAt'>,
  realTelegramText?: string,
): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const channelId = process.env.TELEGRAM_VIP_CHANNEL_ID;
  let mode: 'LIVE_BOT_API' | 'SANDBOX_LOG' = 'SANDBOX_LOG';

  if (botToken && channelId && realTelegramText) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: channelId,
          parse_mode: 'HTML',
          text: realTelegramText,
        }),
      });
      if (res.ok) {
        mode = 'LIVE_BOT_API';
      }
    } catch {
      mode = 'SANDBOX_LOG';
    }
  }

  db.telegramDispatches.unshift({
    id: `tg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    ...entry,
    mode,
    createdAt: new Date().toISOString(),
  });
}

// =============================================================================
// ПУБЛИЧНЫЕ СЕРВЕРНЫЕ ОПЕРАЦИИ (ВЫЗЫВАЮТСЯ ИЗ ROUTE HANDLERS /api/v1/*)
// =============================================================================

export function getBootstrapPayload(refCode?: string | null) {
  const db = readDb();

  // Если посетитель перешел по партнерской ссылке ?ref=... — фиксируем клик и атрибуцию
  if (refCode) {
    const cleanRef = refCode.trim();
    const partner = db.affiliates.find((a) => a.code.toLowerCase() === cleanRef.toLowerCase());
    if (partner) {
      partner.clicks += 1;
      if (!db.viewer.attributedRefCode) {
        db.viewer.attributedRefCode = partner.code;
        partner.registrations += 1;
      }
      saveDb(db);
    }
  }

  const analytics = computeVerifiedAnalytics(db.predictions);

  return {
    predictions: db.predictions.map((p) => serializePredictionForViewer(p, db.viewer)),
    statsByPeriod: analytics.statsByPeriod,
    equityCurve: analytics.equityCurve,
    tariffs: db.tariffs,
    defaultSinglePriceRub: db.defaultSinglePriceRub,
    socialProof: SOCIAL_PROOF_FEED,
    viewer: db.viewer,
    // Админские срезы (в боевом окружении защищены RoleGuard JWT)
    admin: {
      transactions: db.transactions,
      crmUsers: db.crmUsers,
      affiliates: db.affiliates,
      telegramDispatches: db.telegramDispatches,
    },
  };
}

export function verifyPredictionHashProof(predictionId: string) {
  const db = readDb();
  const record = db.predictions.find((p) => p.id === predictionId);
  if (!record) {
    throw new Error('Прогноз не найден');
  }

  const viewerCard = serializePredictionForViewer(record, db.viewer);
  if (viewerCard.isLocked) {
    throw new Error(
      'Полная строка прообраза SHA-256 раскрывается после завершения матча или покупки прогноза, чтобы нельзя было подобрать исход перебором до игры.',
    );
  }

  const { canonicalPayload, sha256 } = computePredictionSha256({
    matchStartsAt: record.matchStartsAt,
    selectionTitle: record.selectionTitle,
    fixedOdds: record.fixedOdds,
    stakeUnits: record.stakeUnits,
  });

  return {
    predictionId: record.id,
    matchLabel: `${record.homeTeam} — ${record.awayTeam}`,
    oddsLockedAt: record.oddsLockedAt,
    canonicalPayload,
    storedHash: record.verificationHash,
    recomputedHash: sha256,
    isAuthentic: sha256 === record.verificationHash,
  };
}

export async function createPredictionInStore(input: {
  sport: SportType;
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
  matchStartsAt: string;
  matchStatus: MatchLifecycleStatus;
  selectionTitle: string;
  fixedOdds: number;
  minAcceptableOdds: number | null;
  bookmakerSource: string;
  stakePercent: number;
  stakeUnits: number;
  accessTier: PredictionAccessTier;
  singlePriceRub: number | null;
  resultStatus: PredictionResultStatus;
  cashoutMultiplier: number | null;
  finalScore: string | null;
  analysisTeaser: string;
  analysisFull: string;
  pushToVipChannel: boolean;
  pushToBotDm: boolean;
}) {
  const db = readDb();

  let profitUnits: number | null = null;
  if (input.resultStatus === 'WIN') {
    profitUnits = Number((input.stakeUnits * (input.fixedOdds - 1)).toFixed(2));
  } else if (input.resultStatus === 'LOSS') {
    profitUnits = -input.stakeUnits;
  } else if (input.resultStatus === 'PUSH') {
    profitUnits = 0;
  } else if (input.resultStatus === 'CASHOUT') {
    const mult = input.cashoutMultiplier ?? 1;
    profitUnits = Number((input.stakeUnits * (mult - 1)).toFixed(2));
  }

  const { sha256 } = computePredictionSha256({
    matchStartsAt: input.matchStartsAt,
    selectionTitle: input.selectionTitle,
    fixedOdds: input.fixedOdds,
    stakeUnits: input.stakeUnits,
  });

  const newRecord: StoredPredictionRecord = {
    id: `pred_${Date.now()}`,
    slug: `${input.homeTeam}-${input.awayTeam}-${Date.now()}`.toLowerCase().replace(/\s+/g, '-'),
    sport: input.sport,
    leagueName: input.leagueName,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    matchStartsAt: input.matchStartsAt,
    matchStatus: input.resultStatus !== 'PENDING' ? 'FINISHED' : input.matchStatus,
    stakePercent: input.stakePercent,
    stakeUnits: input.stakeUnits,
    bookmakerSource: input.bookmakerSource,
    analysisTeaser: input.analysisTeaser,
    accessTier: input.accessTier,
    singlePriceRub:
      input.accessTier === 'PAID_SINGLE'
        ? (input.singlePriceRub ?? db.defaultSinglePriceRub)
        : null,
    revealAfterFinish: true,
    selectionTitle: input.selectionTitle,
    fixedOdds: input.fixedOdds,
    minAcceptableOdds: input.minAcceptableOdds,
    analysisFull: input.analysisFull,
    resultStatus: input.resultStatus,
    cashoutMultiplier: input.cashoutMultiplier,
    finalScore: input.finalScore,
    profitUnits,
    profitPercent: profitUnits,
    verificationHash: sha256,
    oddsLockedAt: new Date().toISOString(),
    isHistoricalSeed: false,
  };

  db.predictions.unshift(newRecord);

  if (input.pushToVipChannel || input.pushToBotDm) {
    const targets = [
      input.pushToVipChannel ? 'VIP Канал' : null,
      input.pushToBotDm ? '318 DM бота' : null,
    ]
      .filter(Boolean)
      .join(' + ');

    await dispatchTelegramPush(
      db,
      {
        type: 'NEW_PREDICTION_CHANNEL',
        recipientTarget: targets,
        messagePreview: `🔥 VIP ПРОГНОЗ | ${input.leagueName}: ${input.homeTeam} — ${input.awayTeam} | ${input.selectionTitle} @ ${input.fixedOdds.toFixed(
          2,
        )} (${input.stakePercent}% флэт)`,
        deliveredCount: input.pushToBotDm ? 319 : 1,
      },
      `🔥 <b>VIP ПРОГНОЗ | ${input.leagueName}</b>\n🏟 <b>${input.homeTeam} — ${input.awayTeam}</b>\n🎯 Исход: <b>${input.selectionTitle}</b>\n📈 Кэф: <b>${input.fixedOdds.toFixed(
        2,
      )}</b>\n💼 Флэт: <b>${input.stakePercent}% (${input.stakeUnits} u)</b>\n🔐 <code>SHA-256: ${sha256.slice(
        0,
        16,
      )}...</code>`,
    );
  }

  saveDb(db);
  return getBootstrapPayload();
}

export async function settlePredictionInStore(
  predictionId: string,
  resultStatus: Exclude<PredictionResultStatus, 'PENDING'>,
  cashoutMultiplier?: number,
  finalScore?: string,
) {
  const db = readDb();
  const record = db.predictions.find((p) => p.id === predictionId);
  if (!record) throw new Error('Прогноз не найден');

  const mult = cashoutMultiplier ?? record.cashoutMultiplier ?? 1.5;
  let profit = 0;
  if (resultStatus === 'WIN') {
    profit = Number((record.stakeUnits * (record.fixedOdds - 1)).toFixed(2));
  } else if (resultStatus === 'LOSS') {
    profit = -record.stakeUnits;
  } else if (resultStatus === 'PUSH') {
    profit = 0;
  } else if (resultStatus === 'CASHOUT') {
    profit = Number((record.stakeUnits * (mult - 1)).toFixed(2));
    record.cashoutMultiplier = mult;
  }

  record.matchStatus = 'FINISHED';
  record.resultStatus = resultStatus;
  record.profitUnits = profit;
  record.profitPercent = profit;
  record.finalScore = finalScore?.trim() || record.finalScore || 'Завершен';
  record.isHistoricalSeed = false;

  await dispatchTelegramPush(db, {
    type: 'SETTLEMENT_CHANNEL',
    recipientTarget: 'VIP Канал + Открытый отчет',
    messagePreview: `📊 Расчет матча ${record.homeTeam} — ${record.awayTeam}: ${resultStatus} (${
      profit > 0 ? '+' : ''
    }${profit.toFixed(2)} u)`,
    deliveredCount: 319,
  });

  saveDb(db);
  return getBootstrapPayload();
}

export function initiateCheckoutInStore(params: {
  kind: 'SINGLE_PREDICTION' | 'VIP_SUBSCRIPTION';
  predictionId?: string;
  planCode?: 'VIP_7D' | 'VIP_30D' | 'VIP_LIFETIME';
  receiptEmail: string;
  paymentMethod: 'sbp' | 'bank_card' | 'internal_balance';
  autoRenew: boolean;
}) {
  const db = readDb();
  if (db.viewer.status === 'BLOCKED') {
    throw new Error('Ваш аккаунт заблокирован администратором службы безопасности.');
  }

  let amountRub = 0;
  let title = '';

  if (params.kind === 'SINGLE_PREDICTION') {
    const pred = db.predictions.find((p) => p.id === params.predictionId);
    if (!pred) throw new Error('Прогноз не найден');
    amountRub = pred.singlePriceRub ?? db.defaultSinglePriceRub;
    title = `Прогноз: ${pred.homeTeam} — ${pred.awayTeam}`;
  } else {
    const plan = db.tariffs.find((t) => t.code === params.planCode);
    if (!plan) throw new Error('Тариф не найден');
    amountRub = plan.priceRub;
    title = plan.name;
  }

  if (params.paymentMethod === 'internal_balance' && db.viewer.balanceRub < amountRub) {
    throw new Error('Недостаточно средств на внутреннем депозите');
  }

  const tx: TransactionRecord = {
    id: `tx_${Date.now()}`,
    idempotenceKey: randomUUID(),
    yookassaPaymentId: `2f00${randomUUID().slice(4)}`,
    userId: db.viewer.userId,
    userEmail: params.receiptEmail,
    txType: params.kind,
    predictionId: params.predictionId ?? null,
    planCode: params.planCode ?? null,
    title,
    amountRub,
    paymentMethod: params.paymentMethod,
    status: 'PENDING',
    receiptEmail: params.receiptEmail,
    receiptStatus: 'PENDING',
    autoRenew: params.autoRenew,
    referredByCode: db.viewer.attributedRefCode,
    commissionAccruedRub: 0,
    vipInviteLink: null,
    createdAt: new Date().toISOString(),
    paidAt: null,
  };

  db.transactions.unshift(tx);
  saveDb(db);
  return tx;
}

export async function processYooKassaWebhookInStore(params: {
  event: 'payment.succeeded' | 'payment.canceled' | 'refund.succeeded';
  yookassaPaymentId: string;
}) {
  const db = readDb();
  const dedupKey = `${params.event}:${params.yookassaPaymentId}`;

  // Строгая идемпотентность: повторный вебхук не дублирует выдачу и комиссию
  if (db.processedWebhookKeys.includes(dedupKey)) {
    return { duplicate: true, state: getBootstrapPayload() };
  }

  const tx = db.transactions.find((t) => t.yookassaPaymentId === params.yookassaPaymentId);
  if (!tx) throw new Error('Транзакция не найдена');

  db.processedWebhookKeys.push(dedupKey);

  if (params.event === 'payment.succeeded' && tx.status !== 'SUCCEEDED') {
    if (tx.paymentMethod === 'internal_balance') {
      db.viewer.balanceRub = Math.max(0, db.viewer.balanceRub - tx.amountRub);
    }

    tx.status = 'SUCCEEDED';
    tx.receiptStatus = 'REGISTERED';
    tx.paidAt = new Date().toISOString();

    if (tx.txType === 'SINGLE_PREDICTION' && tx.predictionId) {
      if (!db.viewer.purchasedPredictionIds.includes(tx.predictionId)) {
        db.viewer.purchasedPredictionIds.push(tx.predictionId);
      }
    } else if (tx.txType === 'VIP_SUBSCRIPTION' && tx.planCode) {
      const plan = db.tariffs.find((p) => p.code === tx.planCode);
      db.viewer.hasActiveVip = true;
      db.viewer.vipPlanLabel = plan?.name ?? 'VIP Подписка';
      db.viewer.autoRenewEnabled = tx.autoRenew;
      db.viewer.vipExpiresAt = plan?.durationDays
        ? new Date(Date.now() + plan.durationDays * 86400 * 1000).toISOString()
        : null;

      const oneTimeInvite = `https://t.me/+VIP_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
      tx.vipInviteLink = oneTimeInvite;
      db.viewer.vipInviteLink = oneTimeInvite;

      await dispatchTelegramPush(db, {
        type: 'ONE_TIME_VIP_INVITE',
        recipientTarget: tx.receiptEmail,
        messagePreview: `Выдана одноразовая ссылка (member_limit=1): ${oneTimeInvite}`,
        deliveredCount: 1,
      });
    }

    // Начисление партнерского вознаграждения вебмастеру (RevShare)
    if (tx.referredByCode) {
      const partner = db.affiliates.find((a) => a.code === tx.referredByCode);
      if (partner) {
        const commission = Math.round((tx.amountRub * partner.revsharePct) / 100);
        tx.commissionAccruedRub = commission;
        partner.buyers += 1;
        partner.revenueRub += tx.amountRub;
      }
    }
  } else if (params.event === 'payment.canceled') {
    tx.status = 'CANCELED';
    tx.receiptStatus = 'FAILED';
  } else if (params.event === 'refund.succeeded' && tx.status === 'SUCCEEDED') {
    tx.status = 'REFUNDED';

    // Автоматический отзыв доступа при возврате средств
    if (tx.txType === 'SINGLE_PREDICTION' && tx.predictionId) {
      db.viewer.purchasedPredictionIds = db.viewer.purchasedPredictionIds.filter(
        (id) => id !== tx.predictionId,
      );
    } else if (tx.txType === 'VIP_SUBSCRIPTION' && tx.userId === db.viewer.userId) {
      db.viewer.hasActiveVip = false;
      db.viewer.vipPlanLabel = null;
      db.viewer.autoRenewEnabled = false;
      db.viewer.vipInviteLink = null;
    }

    // Сторнирование реферальной комиссии вебмастера
    if (tx.referredByCode && tx.commissionAccruedRub > 0) {
      const partner = db.affiliates.find((a) => a.code === tx.referredByCode);
      if (partner) {
        partner.revenueRub = Math.max(0, partner.revenueRub - tx.amountRub);
      }
      tx.commissionAccruedRub = 0;
    }
  }

  saveDb(db);
  return { duplicate: false, transaction: tx, state: getBootstrapPayload() };
}

export function updateViewerSettingsInStore(patch: {
  referenceBankrollRub?: number;
  cancelAutoRenew?: boolean;
  topupBalanceRub?: number;
  bindRefCode?: string;
}) {
  const db = readDb();

  if (typeof patch.referenceBankrollRub === 'number' && patch.referenceBankrollRub >= 1000) {
    db.viewer.referenceBankrollRub = Math.round(patch.referenceBankrollRub);
  }
  if (patch.cancelAutoRenew) {
    db.viewer.autoRenewEnabled = false;
  }
  if (typeof patch.topupBalanceRub === 'number' && patch.topupBalanceRub > 0) {
    db.viewer.balanceRub += Math.round(patch.topupBalanceRub);
  }
  if (patch.bindRefCode) {
    const partner = db.affiliates.find(
      (a) => a.code.toLowerCase() === patch.bindRefCode!.trim().toLowerCase(),
    );
    if (partner) {
      partner.clicks += 1;
      db.viewer.attributedRefCode = partner.code;
    }
  }

  saveDb(db);
  return getBootstrapPayload();
}

export function updateTariffsInStore(patch: {
  defaultSinglePriceRub?: number;
  tariffs?: Array<{ code: 'VIP_7D' | 'VIP_30D' | 'VIP_LIFETIME'; priceRub: number; oldPriceRub: number }>;
}) {
  const db = readDb();

  if (typeof patch.defaultSinglePriceRub === 'number' && patch.defaultSinglePriceRub >= 0) {
    db.defaultSinglePriceRub = Math.round(patch.defaultSinglePriceRub);
    for (const pred of db.predictions) {
      if (pred.accessTier === 'PAID_SINGLE' && pred.resultStatus === 'PENDING') {
        pred.singlePriceRub = db.defaultSinglePriceRub;
      }
    }
  }

  if (patch.tariffs) {
    for (const item of patch.tariffs) {
      const target = db.tariffs.find((t) => t.code === item.code);
      if (target && item.priceRub > 0) {
        target.priceRub = Math.round(item.priceRub);
        target.oldPriceRub = Math.max(target.priceRub, Math.round(item.oldPriceRub));
      }
    }
  }

  saveDb(db);
  return getBootstrapPayload();
}

export function updateCrmUserInStore(
  userId: string,
  action: 'TOGGLE_BLOCK' | 'GRANT_PROMO_VIP',
) {
  const db = readDb();

  if (userId === 'viewer_current') {
    if (action === 'TOGGLE_BLOCK') {
      db.viewer.status = db.viewer.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE';
    } else {
      db.viewer.hasActiveVip = true;
      db.viewer.vipPlanLabel = 'Промо VIP (7 дней · CRM)';
      db.viewer.vipInviteLink = 'https://t.me/+PROMO_VIP_7d_Invite';
    }
    saveDb(db);
    return getBootstrapPayload();
  }

  const user = db.crmUsers.find((u) => u.id === userId);
  if (user) {
    if (action === 'TOGGLE_BLOCK') {
      user.status = user.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE';
    } else {
      user.planLabel = 'Промо VIP (7 дней · Выдан админом)';
    }
    saveDb(db);
  }
  return getBootstrapPayload();
}

export function createOrUpdateAffiliateInStore(params: {
  action: 'CREATE_LINK' | 'UPDATE_RATE';
  affiliateId?: string;
  revsharePct?: number;
  code?: string;
  source?: string;
  webmaster?: string;
}) {
  const db = readDb();

  if (params.action === 'CREATE_LINK' && params.code) {
    const cleanCode = params.code.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (cleanCode && !db.affiliates.some((a) => a.code === cleanCode)) {
      db.affiliates.unshift({
        id: `af_${Date.now()}`,
        webmaster: params.webmaster?.trim() || 'Вебмастер (Новый поток)',
        code: cleanCode,
        source: params.source?.trim() || 'Telegram трафик',
        clicks: 0,
        registrations: 0,
        buyers: 0,
        revenueRub: 0,
        revsharePct: 35,
      });
    }
  } else if (
    params.action === 'UPDATE_RATE' &&
    params.affiliateId &&
    typeof params.revsharePct === 'number'
  ) {
    const found = db.affiliates.find((a) => a.id === params.affiliateId);
    if (found) {
      found.revsharePct = Math.min(80, Math.max(0, Math.round(params.revsharePct)));
    }
  }

  saveDb(db);
  return getBootstrapPayload();
}
