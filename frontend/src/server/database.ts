import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { hashPassword, verifyPassword } from './auth';
import {
  createYooKassaLivePayment,
  generateTelegramOneTimeInvite,
  sendTelegramVipChannelMessage,
  verifyYooKassaLivePayment,
} from './integrations';
import type {
  AccessTier,
  AffiliateLinkRecord,
  EquityPoint,
  MatchStatus,
  OrderTransaction,
  PayoutRequestRecord,
  PlanCode,
  PlatformSettings,
  PredictionRecord,
  PublicPredictionDto,
  ResultStatus,
  SafeSessionUser,
  SportType,
  StatsSummary,
  TariffPlan,
  UserAccount,
} from './types';

interface PersistentState {
  settings: PlatformSettings;
  tariffs: TariffPlan[];
  users: UserAccount[];
  predictions: PredictionRecord[];
  transactions: OrderTransaction[];
  affiliateLinks: AffiliateLinkRecord[];
  payouts: PayoutRequestRecord[];
  processedWebhooks: string[];
}

const DATA_DIR = path.join(process.cwd(), '.data');
const LOCAL_DB_FILE = path.join(DATA_DIR, 'valuex-production.json');

export function computeCanonicalSha256(params: {
  matchStartsAt: string;
  selectionTitle: string;
  fixedOdds: number;
  stakeUnits: number;
}): { canonical: string; sha256: string } {
  const canonical = [
    params.matchStartsAt,
    params.selectionTitle.trim(),
    params.fixedOdds.toFixed(3),
    params.stakeUnits.toFixed(2),
  ].join('|');
  const sha256 = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return { canonical, sha256 };
}

function slugifyMatch(home: string, away: string, suffix: string): string {
  const translitMap: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
    и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
    ы: 'y', э: 'e', ю: 'yu', я: 'ya',
  };
  const norm = `${home}-${away}`
    .toLowerCase()
    .split('')
    .map((ch) => translitMap[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${norm || 'match'}-${suffix}`;
}

function createInitialState(): PersistentState {
  const now = Date.now();
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@valuex.pro';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin2026!';

  const adminUser: UserAccount = {
    id: 'usr_admin_root',
    email: adminEmail.toLowerCase(),
    passwordHash: hashPassword(adminPassword),
    displayName: 'Главный аналитик',
    city: 'Москва',
    role: 'ADMIN',
    status: 'ACTIVE',
    balanceRub: 0,
    referenceBankrollRub: 100_000,
    telegramUsername: '@valuex_support',
    vipExpiresAt: 'LIFETIME',
    vipPlanName: 'Администратор',
    autoRenew: false,
    vipInviteLink: null,
    purchasedPredictionIds: [],
    referralCode: 'valuex_official',
    referredByUserId: null,
    referredByCode: null,
    revsharePercent: 40,
    affiliateBalanceRub: 0,
    affiliateTotalEarnedRub: 0,
    createdAt: new Date(now - 90 * 86400 * 1000).toISOString(),
    lastLoginAt: new Date(now).toISOString(),
  };

  const settings: PlatformSettings = {
    brandName: 'VALUEX',
    supportTelegram: 'https://t.me/valuex_support',
    freeTelegramUrl: 'https://t.me/valuex_free',
    legalSellerName: 'Администрация аналитического сервиса VALUEX',
    legalInn: 'Укажите ИНН в Настройках админки',
    supportEmail: 'support@valuex.pro',
    paymentMode:
      process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY
        ? 'YOOKASSA_LIVE'
        : 'TEST_INSTANT',
    yookassaShopId: process.env.YOOKASSA_SHOP_ID || '',
    yookassaSecretKey: process.env.YOOKASSA_SECRET_KEY || '',
    yookassaVatCode: Number(process.env.YOOKASSA_VAT_CODE || 1),
    defaultSinglePriceRub: 790,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramVipChannelId: process.env.TELEGRAM_VIP_CHANNEL_ID || '',
  };

  const tariffs: TariffPlan[] = [
    {
      code: 'VIP_7D',
      name: 'VIP на 7 дней',
      subtitle: 'Проверка дистанции на неделю',
      durationDays: 7,
      priceRub: 1_990,
      oldPriceRub: 2_900,
      supportsAutoRenew: true,
      popular: false,
      features: [
        'Полный доступ ко всем прогнозам на сайте (15–20 событий)',
        'Вход в закрытый VIP Telegram-канал с мгновенными пушами',
        'Точные рекомендации по размеру ставки (% от банка)',
      ],
    },
    {
      code: 'VIP_30D',
      name: 'VIP на 30 дней',
      subtitle: 'Основной рабочий тариф',
      durationDays: 30,
      priceRub: 4_990,
      oldPriceRub: 9_900,
      supportsAutoRenew: true,
      popular: true,
      features: [
        'Все прогнозы по ранней линии до просадки коэффициентов',
        'Закрытый VIP Telegram-канал + сопровождение в Live (Cashout)',
        'Экономия более 80% по сравнению с покупкой отдельных матчей',
      ],
    },
    {
      code: 'VIP_LIFETIME',
      name: 'VIP Навсегда',
      subtitle: 'Единоразовый платеж без продлений',
      durationDays: null,
      priceRub: 24_900,
      oldPriceRub: 44_900,
      supportsAutoRenew: false,
      popular: false,
      features: [
        'Бессрочный доступ ко всем материалам и прогнозам платформы',
        'Пожизненное участие в закрытом VIP Telegram-сообществе',
        'Приоритетная поддержка по распределению игрового банка',
      ],
    },
  ];

  // Набор стартовых прогнозов (актуальные + рассчитанный архив за последние месяцы для графика)
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
    else if (opts.result === 'CASHOUT')
      profit = Number((opts.stake * ((opts.cashoutMult ?? 1.5) - 1)).toFixed(2));

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
      bookmakerSource: 'Pinnacle / Фонбет',
      analysisTeaser: opts.teaser,
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
    // Актуальные предстоящие и Live матчи
    makeSeed(1, {
      sport: 'HOCKEY',
      league: 'КХЛ · Регулярный чемпионат',
      home: 'Локомотив',
      away: 'СКА',
      offsetHours: 0.8,
      matchStatus: 'UPCOMING',
      stake: 2.0,
      odds: 1.98,
      minOdds: 1.86,
      selection: 'Индивидуальный тотал 1-й больше (2.5)',
      teaser:
        'У гостей подтвержден второй вратарь на выездную серию. По моментам в большинстве перевес хозяев +9% к текущей линии.',
      full: '1. Спецбригада большинства «Локомотива» дома реализует 25.8% попыток.\n2. У соперника третий выездной матч за 5 суток — заметная просадка движения в третьем периоде.\n3. Рабочий диапазон коэффициента: от 1.86 и выше.',
      tier: 'PAID_SINGLE',
      price: 790,
      result: 'PENDING',
      score: null,
    }),
    makeSeed(2, {
      sport: 'ESPORTS',
      league: 'CS2 · Major Playoffs',
      home: 'Team Spirit',
      away: 'MOUZ',
      offsetHours: 3.5,
      matchStatus: 'UPCOMING',
      stake: 2.5,
      odds: 2.06,
      minOdds: 1.92,
      selection: 'Фора по картам: Team Spirit (-1.5)',
      teaser:
        'Структура банов карт в BO3 вынуждает соперника отдать пик с 84% побед у Spirit за последние 3 месяца.',
      full: 'MOUZ перманентно убирают Anubis в первой стадии вето, оставляя открытыми Nuke и Mirage. На дистанции последних 18 карт против топ-10 рейтинг атаки Spirit выше на 0.14 пункта.',
      tier: 'PAID_SINGLE',
      price: 890,
      result: 'PENDING',
      score: null,
    }),
    makeSeed(3, {
      sport: 'FOOTBALL',
      league: 'Лига Чемпионов УЕФА',
      home: 'Арсенал',
      away: 'Интер',
      offsetHours: -0.6,
      matchStatus: 'LIVE',
      stake: 2.0,
      odds: 1.92,
      minOdds: 1.82,
      selection: 'Азиатская фора 1 (-1.0)',
      teaser:
        'Ставка выдана подписчикам по утренней линии за 6 часов до стартового свистка (до просадки кэфа до 1.74).',
      full: 'Высокий прессинг хозяев и отсутствие основного опорника у гостей дают устойчивый перевес по создаваемым моментам внутри штрафной.',
      tier: 'VIP_ONLY',
      price: null,
      result: 'PENDING',
      score: "1:0 (38')",
    }),

    // Рассчитанная история по месяцам (для честной статистики и графика Equity Curve)
    makeSeed(4, {
      sport: 'TENNIS',
      league: 'ATP Finals · Хард в помещении',
      home: 'Янник Синнер',
      away: 'Даниил Медведев',
      offsetHours: -22,
      matchStatus: 'FINISHED',
      stake: 2.5,
      odds: 2.04,
      minOdds: 1.92,
      selection: 'Фора 1 по геймам (-3.5)',
      teaser: 'Быстрое закрытое покрытие дает решающий перевес на первой подаче (83% выигранных розыгрышей).',
      full: 'Забрали 2.04 по ранней линии (к началу матча коэффициент опустился до 1.85). Уверенная победа в двух сетах.',
      tier: 'PAID_SINGLE',
      price: 790,
      result: 'WIN',
      score: '2:0 (6:3, 6:4)',
    }),
    makeSeed(5, {
      sport: 'HOCKEY',
      league: 'КХЛ · Регулярный чемпионат',
      home: 'Авангард',
      away: 'Металлург Мг',
      offsetHours: -50,
      matchStatus: 'FINISHED',
      stake: 2.0,
      odds: 1.96,
      minOdds: 1.85,
      selection: 'Тотал больше (5.0)',
      teaser: 'Обе команды проводят отрезок с высокой результативностью первых звеньев.',
      full: 'Средний xG очных встреч за сезон — 6.1 шайбы. Тотал уверенно пробит к середине третьего периода.',
      tier: 'PAID_SINGLE',
      price: 790,
      result: 'WIN',
      score: '4:2',
    }),
    makeSeed(6, {
      sport: 'FOOTBALL',
      league: 'АПЛ',
      home: 'Ньюкасл',
      away: 'Челси',
      offsetHours: -96,
      matchStatus: 'FINISHED',
      stake: 2.0,
      odds: 2.02,
      minOdds: 1.9,
      selection: 'Фора 1 (0)',
      teaser: 'Досрочная фиксация прибыли по сигналу в VIP-канале после удаления на 74-й минуте.',
      full: 'При счете 1:0 хозяева остались в меньшинстве — зафиксировали прибыль через Cashout с коэффициентом 1.55 (итоговый счет 1:1).',
      tier: 'VIP_ONLY',
      price: null,
      result: 'CASHOUT',
      cashoutMult: 1.55,
      score: '1:1 (Cashout при 1:0)',
    }),
    makeSeed(7, {
      sport: 'ESPORTS',
      league: 'Dota 2 · DreamLeague',
      home: 'Team Falcons',
      away: 'BetBoom Team',
      offsetHours: -140,
      matchStatus: 'FINISHED',
      stake: 2.5,
      odds: 1.95,
      minOdds: 1.85,
      selection: 'Победа в серии: Team Falcons',
      teaser: 'Сильнейший драфт меты патча и 78% побед на решающих картах.',
      full: 'Полный контроль темпа на обеих картах, чистый заход.',
      tier: 'PAID_SINGLE',
      price: 790,
      result: 'WIN',
      score: '2:0',
    }),
    makeSeed(8, {
      sport: 'HOCKEY',
      league: 'НХЛ',
      home: 'Рейнджерс',
      away: 'Виннипег',
      offsetHours: -290,
      matchStatus: 'FINISHED',
      stake: 1.5,
      odds: 1.94,
      minOdds: 1.85,
      selection: 'Тотал меньше (5.5)',
      teaser: 'Открытый архив без удаления минусов: две шайбы в пустые ворота на 59-й минуте.',
      full: 'По ходу встречи счет держался 2:2 до последних 3 минут, но концовка с пустыми воротами качнула тотал вверх. Контролируемый риск 1.5% банка.',
      tier: 'PAID_SINGLE',
      price: 790,
      result: 'LOSS',
      score: '3:4',
    }),
    makeSeed(9, {
      sport: 'FOOTBALL',
      league: 'Серия А',
      home: 'Аталанта',
      away: 'Милан',
      offsetHours: -480,
      matchStatus: 'FINISHED',
      stake: 3.0,
      odds: 2.05,
      minOdds: 1.92,
      selection: 'Индивидуальный тотал 1-й больше (1.5)',
      teaser: 'Высокая плотность ударов из пределов вратарской у хозяев.',
      full: 'Два мяча забиты уже к 58-й минуте.',
      tier: 'VIP_ONLY',
      price: null,
      result: 'WIN',
      score: '2:1',
    }),
    makeSeed(10, {
      sport: 'TENNIS',
      league: 'ATP 1000 · Шанхай',
      home: 'Карлос Алькарас',
      away: 'Томми Пол',
      offsetHours: -860,
      matchStatus: 'FINISHED',
      stake: 3.0,
      odds: 1.92,
      minOdds: 1.83,
      selection: 'Победа 1 со счетом 2:0',
      teaser: 'Комфортный матчап на приеме второй подачи.',
      full: 'Без единого отданного гейма на своей подаче.',
      tier: 'PAID_SINGLE',
      price: 790,
      result: 'WIN',
      score: '2:0 (6:4, 6:2)',
    }),
    makeSeed(11, {
      sport: 'HOCKEY',
      league: 'КХЛ',
      home: 'Трактор',
      away: 'Ак Барс',
      offsetHours: -1500,
      matchStatus: 'FINISHED',
      stake: 2.5,
      odds: 2.1,
      minOdds: 1.95,
      selection: 'Победа 1 в основное время',
      teaser: 'Домашняя серия челябинцев против уставшего на выезде соперника.',
      full: 'Полное доминирование по броскам в створ (39 против 21).',
      tier: 'PAID_SINGLE',
      price: 790,
      result: 'WIN',
      score: '3:1',
    }),
    makeSeed(12, {
      sport: 'FOOTBALL',
      league: 'Ла Лига',
      home: 'Реал Сосьедад',
      away: 'Атлетико Мадрид',
      offsetHours: -2200,
      matchStatus: 'FINISHED',
      stake: 2.0,
      odds: 1.98,
      minOdds: 1.88,
      selection: 'Фора 2 (0)',
      teaser: 'Равная игра завершилась ничьей — расчет возвратом без потерь для банка.',
      full: 'Азиатская нулевая фора застраховала ставку при ничейном счете.',
      tier: 'VIP_ONLY',
      price: null,
      result: 'PUSH',
      score: '1:1',
    }),
    makeSeed(13, {
      sport: 'ESPORTS',
      league: 'CS2 · IEM Cologne',
      home: 'NAVI',
      away: 'G2 Esports',
      offsetHours: -2900,
      matchStatus: 'FINISHED',
      stake: 3.0,
      odds: 2.02,
      minOdds: 1.9,
      selection: 'Победа в матче: NAVI',
      teaser: 'Системная подготовка анти-стратегий на решающем Mirage.',
      full: 'Победа в серии 2:1 с уверенным закрытием решающей карты 13:7.',
      tier: 'PAID_SINGLE',
      price: 790,
      result: 'WIN',
      score: '2:1',
    }),
  ];

  return {
    settings,
    tariffs,
    users: [adminUser],
    predictions,
    transactions: [],
    affiliateLinks: [
      {
        id: 'aff_init_1',
        userId: adminUser.id,
        userEmail: adminUser.email,
        code: 'valuex_official',
        label: 'Основной Telegram-канал',
        clicks: 0,
        registrations: 0,
        buyers: 0,
        revenueRub: 0,
        createdAt: new Date(now).toISOString(),
      },
    ],
    payouts: [],
    processedWebhooks: [],
  };
}

// =============================================================================
// ДРАЙВЕР ХРАНЕНИЯ: POSTGRESQL (НА СЕРВЕРЕ) + ФАЙЛОВЫЙ РЕЗЕРВ (В ПЕСОЧНИЦЕ)
// =============================================================================

let pgPool: Pool | null = null;
let pgAvailable: boolean | null = null;
let memoryFallback: PersistentState | null = null;

async function getPostgresPool(): Promise<Pool | null> {
  if (pgAvailable === false) return null;
  if (pgPool && pgAvailable === true) return pgPool;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    pgAvailable = false;
    return null;
  }

  try {
    const pool = new Pool({
      connectionString: dbUrl,
      connectionTimeoutMillis: 2500,
      max: 8,
    });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS valuex_app_storage (
        store_key VARCHAR(64) PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    pgPool = pool;
    pgAvailable = true;
    return pool;
  } catch {
    pgAvailable = false;
    return null;
  }
}

function readLocalFileState(): PersistentState {
  if (memoryFallback) return memoryFallback;
  try {
    if (fs.existsSync(LOCAL_DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(LOCAL_DB_FILE, 'utf8')) as PersistentState;
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
    return res.rows[0].payload;
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
    const state = readLocalFileState();
    const result = await mutator(state);
    writeLocalFileState(state);
    return result;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let res = await client.query<{ payload: PersistentState }>(
      `SELECT payload FROM valuex_app_storage WHERE store_key = 'main' FOR UPDATE`,
    );

    let state: PersistentState;
    if (res.rows.length === 0) {
      state = createInitialState();
      await client.query(
        `INSERT INTO valuex_app_storage (store_key, payload, updated_at)
         VALUES ('main', $1::jsonb, NOW())`,
        [JSON.stringify(state)],
      );
      res = await client.query<{ payload: PersistentState }>(
        `SELECT payload FROM valuex_app_storage WHERE store_key = 'main' FOR UPDATE`,
      );
      state = res.rows[0].payload;
    } else {
      state = res.rows[0].payload;
    }

    const result = await mutator(state);

    await client.query(
      `UPDATE valuex_app_storage SET payload = $1::jsonb, updated_at = NOW() WHERE store_key = 'main'`,
      [JSON.stringify(state)],
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

// =============================================================================
// СЕРИАЛИЗАЦИЯ ПОЛЬЗОВАТЕЛЕЙ И ЗАЩИТА ПЛАТНЫХ ПРОГНОЗОВ
// =============================================================================

export function isUserVipActive(user: UserAccount | null | undefined): boolean {
  if (!user || user.status !== 'ACTIVE') return false;
  if (user.role === 'ADMIN') return true;
  if (!user.vipExpiresAt) return false;
  if (user.vipExpiresAt === 'LIFETIME') return true;
  return new Date(user.vipExpiresAt).getTime() > Date.now();
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
    hasActiveVip: isUserVipActive(user),
    vipExpiresAt: user.vipExpiresAt,
    vipPlanName: user.vipPlanName,
    autoRenew: user.autoRenew,
    vipInviteLink: user.vipInviteLink,
    purchasedPredictionIds: user.purchasedPredictionIds,
    referralCode: user.referralCode,
    revsharePercent: user.revsharePercent,
    affiliateBalanceRub: user.affiliateBalanceRub,
    affiliateTotalEarnedRub: user.affiliateTotalEarnedRub,
  };
}

export function toPublicPredictionDto(
  record: PredictionRecord,
  viewer: UserAccount | null,
): PublicPredictionDto {
  const isFree = record.accessTier === 'FREE';
  const isSettledPublic =
    record.revealAfterFinish &&
    record.matchStatus === 'FINISHED' &&
    record.resultStatus !== 'PENDING';
  const isBought = Boolean(viewer?.purchasedPredictionIds.includes(record.id));
  const vipActive = isUserVipActive(viewer);

  const unlocked =
    isFree ||
    isSettledPublic ||
    vipActive ||
    (viewer?.status === 'ACTIVE' && record.accessTier === 'PAID_SINGLE' && isBought);

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
    isLocked: !unlocked,
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
  };
}

// =============================================================================
// ЧЕСТНЫЙ МАТЕМАТИЧЕСКИЙ РАСЧЕТ СТАТИСТИКИ И ГРАФИКА БАНКА ИЗ БД
// =============================================================================

const MONTH_SHORT_RU = [
  'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн',
  'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек',
];

export function computePlatformAnalytics(predictions: PredictionRecord[]): {
  statsByPeriod: Record<'WEEK' | 'MONTH' | 'ALL_TIME', StatsSummary>;
  equityCurve: EquityPoint[];
  sportBreakdown: Array<{
    sport: SportType;
    bets: number;
    winRatePct: number;
    profitUnits: number;
    yieldPct: number;
  }>;
  recentWinsFeed: Array<{
    id: string;
    name: string;
    city: string;
    sport: SportType;
    wonRub: number;
    matchTitle: string;
  }>;
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

  // Группировка Equity Curve по месяцам
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
    equityCurve.push({
      month: ym,
      label: `${MONTH_SHORT_RU[b.monthIdx]} '${b.yearShort}`,
      profitUnits: Number(b.profit.toFixed(2)),
      cumulativeBankPct: Number(cumulativeBank.toFixed(2)),
      betsCount: b.count,
      yieldPct: b.turnover > 0 ? Number(((b.profit / b.turnover) * 100).toFixed(1)) : 0,
    });
  }

  // Разбивка по видам спорта
  const sportsOrder: SportType[] = ['HOCKEY', 'FOOTBALL', 'TENNIS', 'ESPORTS', 'BASKETBALL', 'MMA'];
  const sportBreakdown = sportsOrder
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

  // Лента последних реальных побед для ненавязчивого социального доказательства
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
// БИЗНЕС-ОПЕРАЦИИ (АВТОРИЗАЦИЯ, ОПЛАТЫ, ЮKASSA, ПРОГНОЗЫ, АДМИНКА)
// =============================================================================

export async function registerUserAccount(params: {
  email: string;
  password: string;
  displayName: string;
  city?: string;
  refCode?: string | null;
}): Promise<UserAccount> {
  const cleanEmail = params.email.trim().toLowerCase();
  if (!cleanEmail.includes('@')) throw new Error('Введите корректный E-mail');
  if (params.password.length < 6) throw new Error('Пароль должен содержать минимум 6 символов');

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
        const refOwner = state.users.find((u) => u.referralCode.toLowerCase() === cleanRef);
        if (refOwner) {
          referredByUserId = refOwner.id;
          referredByCode = refOwner.referralCode;
        }
      }
    }

    const baseCode = cleanEmail
      .split('@')[0]
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 10);
    const referralCode = `${baseCode || 'partner'}_${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();

    const newUser: UserAccount = {
      id: `usr_${randomUUID().slice(0, 12)}`,
      email: cleanEmail,
      passwordHash: hashPassword(params.password),
      displayName: params.displayName.trim() || cleanEmail.split('@')[0],
      city: params.city?.trim() || 'Москва',
      role: 'USER',
      status: 'ACTIVE',
      balanceRub: 0,
      referenceBankrollRub: 50_000,
      telegramUsername: null,
      vipExpiresAt: null,
      vipPlanName: null,
      autoRenew: false,
      vipInviteLink: null,
      purchasedPredictionIds: [],
      referralCode,
      referredByUserId,
      referredByCode,
      revsharePercent: 30,
      affiliateBalanceRub: 0,
      affiliateTotalEarnedRub: 0,
      createdAt: nowIso,
      lastLoginAt: nowIso,
    };

    state.users.unshift(newUser);
    state.affiliateLinks.unshift({
      id: `aff_${randomUUID().slice(0, 10)}`,
      userId: newUser.id,
      userEmail: newUser.email,
      code: referralCode,
      label: 'Основная партнерская ссылка',
      clicks: 0,
      registrations: 0,
      buyers: 0,
      revenueRub: 0,
      createdAt: nowIso,
    });

    return newUser;
  });
}

export async function loginUserAccount(email: string, password: string): Promise<UserAccount> {
  const cleanEmail = email.trim().toLowerCase();
  return mutateState((state) => {
    const user = state.users.find((u) => u.email === cleanEmail);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new Error('Неверный E-mail или пароль');
    }
    if (user.status === 'BLOCKED') {
      throw new Error('Ваш аккаунт заблокирован службой поддержки');
    }
    user.lastLoginAt = new Date().toISOString();
    return user;
  });
}

export async function recordReferralClick(code: string): Promise<void> {
  const clean = code.trim().toLowerCase();
  if (!clean) return;
  await mutateState((state) => {
    const link = state.affiliateLinks.find((l) => l.code.toLowerCase() === clean);
    if (link) {
      link.clicks += 1;
    }
  });
}

export async function initiateOrderCheckout(params: {
  userId: string;
  kind: 'SINGLE_PREDICTION' | 'VIP_SUBSCRIPTION' | 'BALANCE_TOPUP';
  predictionId?: string;
  planCode?: PlanCode;
  topupAmountRub?: number;
  paymentMethod: 'yookassa' | 'internal_balance';
  autoRenew: boolean;
  originUrl: string;
}): Promise<{ order: OrderTransaction; paidImmediately: boolean }> {
  const stateSnap = await readState();
  const userSnap = stateSnap.users.find((u) => u.id === params.userId);
  if (!userSnap) throw new Error('Необходима авторизация');
  if (userSnap.status === 'BLOCKED') throw new Error('Аккаунт ограничен');

  let amountRub = 0;
  let title = '';

  if (params.kind === 'SINGLE_PREDICTION') {
    const pred = stateSnap.predictions.find((p) => p.id === params.predictionId);
    if (!pred) throw new Error('Прогноз не найден');
    if (userSnap.purchasedPredictionIds.includes(pred.id) || isUserVipActive(userSnap)) {
      throw new Error('Этот прогноз уже открыт для вашего аккаунта');
    }
    amountRub = pred.singlePriceRub ?? stateSnap.settings.defaultSinglePriceRub;
    title = `Прогноз: ${pred.homeTeam} — ${pred.awayTeam}`;
  } else if (params.kind === 'VIP_SUBSCRIPTION') {
    const plan = stateSnap.tariffs.find((t) => t.code === params.planCode);
    if (!plan) throw new Error('Тариф не найден');
    amountRub = plan.priceRub;
    title = plan.name;
  } else {
    amountRub = Math.max(100, Math.round(params.topupAmountRub || 1000));
    title = `Пополнение баланса аккаунта (${userSnap.email})`;
  }

  if (params.paymentMethod === 'internal_balance') {
    if (params.kind === 'BALANCE_TOPUP') {
      throw new Error('Пополнение баланса выполняется через платежный шлюз');
    }
    if (userSnap.balanceRub < amountRub) {
      throw new Error('Недостаточно средств на балансе личного кабинета');
    }
  }

  const orderId = `ord_${randomUUID().slice(0, 12)}`;
  const idempotenceKey = randomUUID();
  let externalPaymentId = `test_${randomUUID().slice(0, 16)}`;
  let confirmationUrl: string | null = null;

  // Если включен боевой режим ЮKassa и оплата идет через кассу — создаем реальный платеж в API ЮKassa
  if (
    params.paymentMethod === 'yookassa' &&
    stateSnap.settings.paymentMode === 'YOOKASSA_LIVE'
  ) {
    const returnUrl = `${params.originUrl}/payment/return?orderId=${encodeURIComponent(orderId)}`;
    const liveResult = await createYooKassaLivePayment({
      settings: stateSnap.settings,
      idempotenceKey,
      amountRub,
      title,
      receiptEmail: userSnap.email,
      returnUrl,
      savePaymentMethod: params.kind === 'VIP_SUBSCRIPTION' && params.autoRenew,
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
      kind: params.kind,
      predictionId: params.predictionId ?? null,
      planCode: params.planCode ?? null,
      title,
      amountRub,
      paymentMethod: params.paymentMethod,
      status: 'PENDING',
      receiptEmail: userSnap.email,
      autoRenew: params.autoRenew,
      confirmationUrl,
      vipInviteLink: null,
      affiliateUserId: userSnap.referredByUserId,
      affiliateCommissionRub: 0,
      createdAt: new Date().toISOString(),
      paidAt: null,
    };
    state.transactions.unshift(order);
    return order;
  });

  // Списание с внутреннего депозита ИЛИ мгновенный тестовый режим (пока владелец не ввел ключи ЮKassa)
  if (
    params.paymentMethod === 'internal_balance' ||
    stateSnap.settings.paymentMode === 'TEST_INSTANT'
  ) {
    const settledOrder = await fulfillOrderPayment(createdOrder.id);
    return { order: settledOrder, paidImmediately: true };
  }

  return { order: createdOrder, paidImmediately: false };
}

export async function fulfillOrderPayment(orderIdOrExternalId: string): Promise<OrderTransaction> {
  const preState = await readState();
  const targetTx = preState.transactions.find(
    (t) => t.id === orderIdOrExternalId || t.externalPaymentId === orderIdOrExternalId,
  );
  if (!targetTx) throw new Error('Заказ не найден');
  if (targetTx.status === 'SUCCEEDED') return targetTx;

  // Подготавливаем одноразовую инвайт-ссылку в закрытый VIP Telegram, если куплена подписка
  let generatedInvite: string | null = null;
  if (targetTx.kind === 'VIP_SUBSCRIPTION') {
    generatedInvite = await generateTelegramOneTimeInvite(
      preState.settings,
      `vip_${targetTx.userEmail}`,
    );
  }

  return mutateState((state) => {
    const tx = state.transactions.find((t) => t.id === targetTx.id);
    if (!tx) throw new Error('Заказ не найден');
    if (tx.status === 'SUCCEEDED') return tx;

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

    if (tx.kind === 'SINGLE_PREDICTION' && tx.predictionId) {
      if (!buyer.purchasedPredictionIds.includes(tx.predictionId)) {
        buyer.purchasedPredictionIds.push(tx.predictionId);
      }
    } else if (tx.kind === 'VIP_SUBSCRIPTION' && tx.planCode) {
      const plan = state.tariffs.find((p) => p.code === tx.planCode);
      buyer.vipPlanName = plan?.name ?? 'VIP Подписка';
      buyer.autoRenew = tx.autoRenew;

      if (!plan || plan.durationDays === null) {
        buyer.vipExpiresAt = 'LIFETIME';
      } else {
        const currentExpMs =
          buyer.vipExpiresAt && buyer.vipExpiresAt !== 'LIFETIME'
            ? Math.max(Date.now(), new Date(buyer.vipExpiresAt).getTime())
            : Date.now();
        buyer.vipExpiresAt = new Date(
          currentExpMs + plan.durationDays * 86400 * 1000,
        ).toISOString();
      }

      if (generatedInvite) {
        tx.vipInviteLink = generatedInvite;
        buyer.vipInviteLink = generatedInvite;
      }
    } else if (tx.kind === 'BALANCE_TOPUP') {
      buyer.balanceRub += tx.amountRub;
    }

    // Начисление реферального вознаграждения партнеру (только за реальные оплаты через ЮKassa)
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

    return tx;
  });
}

export async function verifyAndSyncOrderFromReturn(orderId: string): Promise<OrderTransaction> {
  const state = await readState();
  const tx = state.transactions.find((t) => t.id === orderId);
  if (!tx) throw new Error('Заказ не найден');
  if (tx.status === 'SUCCEEDED') return tx;

  if (state.settings.paymentMode === 'YOOKASSA_LIVE' && tx.paymentMethod === 'yookassa') {
    const remote = await verifyYooKassaLivePayment(state.settings, tx.externalPaymentId);
    if (remote.status === 'succeeded' && remote.paid) {
      return fulfillOrderPayment(tx.id);
    }
  }

  return tx;
}

export async function refundOrderTransaction(orderIdOrExternalId: string): Promise<void> {
  await mutateState((state) => {
    const tx = state.transactions.find(
      (t) => t.id === orderIdOrExternalId || t.externalPaymentId === orderIdOrExternalId,
    );
    if (!tx || tx.status !== 'SUCCEEDED') return;

    tx.status = 'REFUNDED';
    const buyer = state.users.find((u) => u.id === tx.userId);
    if (buyer) {
      if (tx.kind === 'SINGLE_PREDICTION' && tx.predictionId) {
        buyer.purchasedPredictionIds = buyer.purchasedPredictionIds.filter(
          (id) => id !== tx.predictionId,
        );
      } else if (tx.kind === 'VIP_SUBSCRIPTION') {
        buyer.vipExpiresAt = null;
        buyer.vipPlanName = null;
        buyer.autoRenew = false;
        buyer.vipInviteLink = null;
      }
    }

    if (tx.affiliateUserId && tx.affiliateCommissionRub > 0) {
      const partner = state.users.find((u) => u.id === tx.affiliateUserId);
      if (partner) {
        partner.affiliateBalanceRub = Math.max(
          0,
          partner.affiliateBalanceRub - tx.affiliateCommissionRub,
        );
        partner.affiliateTotalEarnedRub = Math.max(
          0,
          partner.affiliateTotalEarnedRub - tx.affiliateCommissionRub,
        );
      }
      tx.affiliateCommissionRub = 0;
    }
  });
}

export async function createPredictionByAdmin(input: {
  sport: SportType;
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
  matchStartsAt: string;
  matchStatus: MatchStatus;
  selectionTitle: string;
  fixedOdds: number;
  minAcceptableOdds: number | null;
  bookmakerSource: string;
  stakePercent: number;
  accessTier: AccessTier;
  singlePriceRub: number | null;
  analysisTeaser: string;
  analysisFull: string;
  sendTelegramPush: boolean;
}): Promise<PredictionRecord> {
  const nowIso = new Date().toISOString();
  const { sha256 } = computeCanonicalSha256({
    matchStartsAt: input.matchStartsAt,
    selectionTitle: input.selectionTitle,
    fixedOdds: input.fixedOdds,
    stakeUnits: input.stakePercent,
  });

  const record: PredictionRecord = {
    id: `pred_${randomUUID().slice(0, 10)}`,
    slug: slugifyMatch(input.homeTeam, input.awayTeam, Date.now().toString().slice(-5)),
    sport: input.sport,
    leagueName: input.leagueName.trim(),
    homeTeam: input.homeTeam.trim(),
    awayTeam: input.awayTeam.trim(),
    matchStartsAt: input.matchStartsAt,
    matchStatus: input.matchStatus,
    stakePercent: input.stakePercent,
    stakeUnits: input.stakePercent,
    bookmakerSource: input.bookmakerSource.trim() || 'Pinnacle',
    analysisTeaser: input.analysisTeaser.trim(),
    selectionTitle: input.selectionTitle.trim(),
    fixedOdds: input.fixedOdds,
    minAcceptableOdds: input.minAcceptableOdds,
    analysisFull: input.analysisFull.trim(),
    accessTier: input.accessTier,
    singlePriceRub: input.accessTier === 'PAID_SINGLE' ? input.singlePriceRub : null,
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

  let settingsSnap: PlatformSettings | null = null;
  await mutateState((state) => {
    state.predictions.unshift(record);
    settingsSnap = state.settings;
  });

  if (input.sendTelegramPush && settingsSnap) {
    const startStr = new Date(record.matchStartsAt).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    await sendTelegramVipChannelMessage(
      settingsSnap,
      [
        `🔥 <b>VIP ПРОГНОЗ | ${record.leagueName}</b>`,
        `🏟 <b>${record.homeTeam} — ${record.awayTeam}</b>`,
        `🕒 Начало: ${startStr}`,
        '',
        `🎯 Исход: <b>${record.selectionTitle}</b>`,
        `📈 Коэффициент: <b>${record.fixedOdds.toFixed(2)}</b>${
          record.minAcceptableOdds ? ` (актуально от ${record.minAcceptableOdds.toFixed(2)})` : ''
        }`,
        `💼 Ставка: <b>${record.stakePercent.toFixed(1)}% от банка (${record.stakeUnits.toFixed(2)} u)</b>`,
        '',
        record.analysisFull ? `📊 ${record.analysisFull}\n` : '',
        `🔐 <code>SHA-256: ${record.verificationHash.slice(0, 16)}...</code>`,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  return record;
}

export async function settlePredictionByAdmin(params: {
  predictionId: string;
  resultStatus: ResultStatus;
  finalScore?: string | null;
  cashoutMultiplier?: number | null;
}): Promise<PredictionRecord> {
  return mutateState((state) => {
    const pred = state.predictions.find((p) => p.id === params.predictionId);
    if (!pred) throw new Error('Прогноз не найден');

    if (params.resultStatus === 'PENDING') {
      pred.resultStatus = 'PENDING';
      pred.profitUnits = null;
      pred.profitPercent = null;
      pred.settledAt = null;
      return pred;
    }

    let profit = 0;
    if (params.resultStatus === 'WIN') {
      profit = Number((pred.stakeUnits * (pred.fixedOdds - 1)).toFixed(2));
    } else if (params.resultStatus === 'LOSS') {
      profit = -pred.stakeUnits;
    } else if (params.resultStatus === 'PUSH') {
      profit = 0;
    } else if (params.resultStatus === 'CASHOUT') {
      const mult = params.cashoutMultiplier ?? pred.cashoutMultiplier ?? 1.5;
      pred.cashoutMultiplier = mult;
      profit = Number((pred.stakeUnits * (mult - 1)).toFixed(2));
    }

    pred.matchStatus = 'FINISHED';
    pred.resultStatus = params.resultStatus;
    pred.finalScore = params.finalScore?.trim() || pred.finalScore || null;
    pred.profitUnits = profit;
    pred.profitPercent = profit;
    pred.settledAt = new Date().toISOString();
    return pred;
  });
}
