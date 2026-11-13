import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { hashPassword, verifyPassword } from './auth';
import {
  createYooKassaLivePayment,
  sendTelegramChannelAnnouncement,
  verifyYooKassaLivePayment,
} from './integrations';
import type {
  AccessTier,
  AffiliateLinkRecord,
  EquityPoint,
  MatchStatus,
  OrderTransaction,
  PayoutRequestRecord,
  PlatformSettings,
  PredictionRecord,
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
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramChannelId: process.env.TELEGRAM_VIP_CHANNEL_ID || '',
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
      bookmakerSource: 'Pinnacle / Фонбет',
      analysisTeaser: opts.teaser,
      isFeatured: Boolean(opts.featured),
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
    // Актуальная витрина событий (6 карточек для сетки 3x2)
    makeSeed(1, {
      sport: 'FOOTBALL',
      league: 'Лига Чемпионов · Плей-офф',
      home: 'Реал Мадрид',
      away: 'Бавария',
      offsetHours: 2.4,
      matchStatus: 'UPCOMING',
      stake: 2.5,
      odds: 2.08,
      minOdds: 1.94,
      selection: 'Азиатская фора 1 (-0.75)',
      teaser:
        'Кадровая потеря левого фланга обороны гостей и +0.62 xG перевес хозяев в домашних вечерних матчах плей-офф.',
      full: '1. У «Баварии» пропускает игру основной опорник-разрушитель, что резко повышает нагрузку на центр обороны.\n2. По модели ожидаемых моментов справедливый коэффициент на хозяев — 1.84, в линии держится 2.08.\n3. Рекомендуемый вход: от 1.94 и выше.',
      tier: 'PAID_SINGLE',
      price: 990,
      result: 'PENDING',
      score: null,
      featured: true,
    }),
    makeSeed(2, {
      sport: 'HOCKEY',
      league: 'КХЛ · Регулярный чемпионат',
      home: 'Локомотив',
      away: 'СКА',
      offsetHours: 1.3,
      matchStatus: 'UPCOMING',
      stake: 2.0,
      odds: 1.98,
      minOdds: 1.86,
      selection: 'Индивидуальный тотал 1-й больше (2.5)',
      teaser:
        'Третий выездной матч подряд для гостей за 5 суток при подтвержденном втором номере в воротах.',
      full: '1. Спецбригада большинства ярославцев дома реализует 25.8% попыток.\n2. Соперник заметно проседает по скорости возврата в оборону во втором и третьем периодах выездной серии.',
      tier: 'PAID_SINGLE',
      price: 790,
      result: 'PENDING',
      score: null,
    }),
    makeSeed(3, {
      sport: 'ESPORTS',
      league: 'CS2 · Major Playoffs',
      home: 'Team Spirit',
      away: 'MOUZ',
      offsetHours: 4.0,
      matchStatus: 'UPCOMING',
      stake: 2.5,
      odds: 2.06,
      minOdds: 1.92,
      selection: 'Фора по картам: Team Spirit (-1.5)',
      teaser:
        'Структура вето карт в BO3 вынуждает соперника оставить открытыми Nuke и Mirage с 84% винрейта у Spirit.',
      full: 'Перманентный бан Anubis со стороны MOUZ лишает их главного контр-пика. По огневой мощи на пистолетных и оружейных раундах перевес Spirit превышает 11%.',
      tier: 'PAID_SINGLE',
      price: 890,
      result: 'PENDING',
      score: null,
    }),
    makeSeed(4, {
      sport: 'TENNIS',
      league: 'ATP Masters · Хард',
      home: 'Карлос Алькарас',
      away: 'Алекс де Минаур',
      offsetHours: 5.5,
      matchStatus: 'UPCOMING',
      stake: 2.0,
      odds: 1.91,
      minOdds: 1.82,
      selection: 'Тотал геймов меньше (22.5)',
      teaser:
        'Медленный отскок корта нивелирует контратаки австралийца на приеме второй подачи.',
      full: 'В очных встречах на медленном харде процент удержания подачи у испанца выше на 14 пунктов. Ожидаем закрытие встречи в двух рабочих партиях.',
      tier: 'PAID_SINGLE',
      price: 690,
      result: 'PENDING',
      score: null,
    }),
    makeSeed(5, {
      sport: 'BASKETBALL',
      league: 'Евролига · Мужчины',
      home: 'Панатинаикос',
      away: 'Монако',
      offsetHours: 6.8,
      matchStatus: 'UPCOMING',
      stake: 1.5,
      odds: 1.89,
      minOdds: 1.80,
      selection: 'Фора 1 (-4.5) с ОТ',
      teaser:
        'Открытый бесплатный разбор дня: домашний темп греков и 42% реализации трехочковых из углов.',
      full: 'Открытая демонстрация аналитического подхода: «Монако» проводит вторую игру сдвоенной недели на выезде с усеченной ротацией больших игроков.',
      tier: 'FREE',
      price: null,
      result: 'PENDING',
      score: null,
    }),
    makeSeed(6, {
      sport: 'FOOTBALL',
      league: 'Англия · Премьер-лига',
      home: 'Арсенал',
      away: 'Ньюкасл',
      offsetHours: -0.5,
      matchStatus: 'LIVE',
      stake: 2.0,
      odds: 1.94,
      minOdds: 1.84,
      selection: 'Индивидуальный тотал 1-й больше (2.0)',
      teaser:
        'Матч уже идет: котировка зафиксирована за 5 часов до стартового свистка до просадки линии.',
      full: 'Интенсивный прессинг хозяев в первой трети поля и стандарты у ворот ослабленной защиты гостей.',
      tier: 'PAID_SINGLE',
      price: 790,
      result: 'PENDING',
      score: "1:0 (34')",
    }),

    // Рассчитанный архив по месяцам (для честного расчета Yield и графика Equity Curve)
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

  return {
    settings,
    users: [adminUser],
    predictions,
    transactions: [],
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
  };
}

// Автоматическая миграция старых записей БД (без подписок и VIP_ONLY)
function normalizeLoadedState(raw: Partial<PersistentState> & Record<string, unknown>): PersistentState {
  const fallback = createInitialState();
  const rawSettings = (raw.settings || {}) as Partial<PlatformSettings> & {
    telegramVipChannelId?: string;
  };

  const settings: PlatformSettings = {
    ...fallback.settings,
    ...rawSettings,
    telegramChannelId:
      rawSettings.telegramChannelId ??
      rawSettings.telegramVipChannelId ??
      fallback.settings.telegramChannelId,
  };

  const predictions = (raw.predictions || fallback.predictions).map((p, idx) => {
    const legacyTier = p.accessTier as string;
    const normalizedTier: AccessTier = legacyTier === 'FREE' ? 'FREE' : 'PAID_SINGLE';
    return {
      ...p,
      isFeatured: p.isFeatured ?? idx === 0,
      accessTier: normalizedTier,
      singlePriceRub:
        normalizedTier === 'PAID_SINGLE'
          ? p.singlePriceRub ?? settings.defaultSinglePriceRub
          : null,
    };
  });

  const transactions = (raw.transactions || []).filter(
    (t) => t.kind === 'SINGLE_PREDICTION' || t.kind === 'BALANCE_TOPUP',
  );

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

  return {
    settings,
    users,
    predictions,
    transactions,
    affiliateLinks: raw.affiliateLinks || fallback.affiliateLinks,
    payouts: raw.payouts || [],
    processedWebhooks: raw.processedWebhooks || [],
  };
}

// =============================================================================
// ДРАЙВЕР ХРАНЕНИЯ: POSTGRESQL (НА СЕРВЕРЕ) + ЛОКАЛЬНЫЙ ФАЙЛ (ДЛЯ ПРЕВЬЮ)
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
    return normalizeLoadedState(res.rows[0].payload as unknown as Record<string, unknown>);
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
    const cloned = structuredClone(state);
    const result = await mutator(cloned);
    writeLocalFileState(cloned);
    return result;
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
    matchStartsAt: record.matchStartsAt,
    matchStatus: record.matchStatus,
    stakePercent: record.stakePercent,
    stakeUnits: record.stakeUnits,
    bookmakerSource: record.bookmakerSource,
    analysisTeaser: record.analysisTeaser,
    isFeatured: Boolean(record.isFeatured),
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
// БИЗНЕС-ОПЕРАЦИИ (АВТОРИЗАЦИЯ, РАЗОВЫЕ ОПЛАТЫ СОБЫТИЙ, ПРОГНОЗЫ, АДМИНКА)
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

    const newUser: UserAccount = {
      id: `usr_${randomUUID().slice(0, 12)}`,
      email: cleanEmail,
      passwordHash: hashPassword(params.password),
      displayName: params.displayName.trim() || cleanEmail.split('@')[0],
      city: params.city?.trim() || '',
      role: 'USER',
      status: 'ACTIVE',
      balanceRub: 0,
      referenceBankrollRub: 50_000,
      telegramUsername: null,
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
  kind: 'SINGLE_PREDICTION' | 'BALANCE_TOPUP';
  predictionId?: string;
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
  let title = '';

  if (params.kind === 'SINGLE_PREDICTION') {
    const pred = stateSnap.predictions.find((p) => p.id === params.predictionId);
    if (!pred) throw new Error('Событие не найдено');
    if (userSnap.purchasedPredictionIds.includes(pred.id)) {
      throw new Error('Этот прогноз уже куплен и открыт в вашем кабинете');
    }
    amountRub = pred.singlePriceRub ?? stateSnap.settings.defaultSinglePriceRub;
    title = `Аналитический прогноз: ${pred.homeTeam} — ${pred.awayTeam}`;
  } else {
    amountRub = Math.max(100, Math.round(params.topupAmountRub || 1000));
    title = `Пополнение кошелька кабинета (${userSnap.email})`;
  }

  if (params.paymentMethod === 'internal_balance' && userSnap.balanceRub < amountRub) {
    throw new Error(
      `Недостаточно средств на балансе кабинета (${userSnap.balanceRub} ₽ из ${amountRub} ₽)`,
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
      kind: params.kind,
      predictionId: params.predictionId ?? null,
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
  return mutateState((state) => {
    const tx = state.transactions.find(
      (t) => t.id === orderIdOrExternalId || t.externalPaymentId === orderIdOrExternalId,
    );
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
    } else if (tx.kind === 'BALANCE_TOPUP') {
      buyer.balanceRub += tx.amountRub;
    }

    // Начисление реферального вознаграждения с разовой покупки / пополнения через ЮKassa
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

    if (tx.kind === 'SINGLE_PREDICTION' && tx.predictionId) {
      buyer.purchasedPredictionIds = buyer.purchasedPredictionIds.filter(
        (pid) => pid !== tx.predictionId,
      );
    }
  });
}

export async function createPredictionByAdmin(input: {
  sport: SportType;
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
  matchStartsAt: string;
  selectionTitle: string;
  fixedOdds: number;
  minAcceptableOdds?: number | null;
  stakeUnits: number;
  bookmakerSource?: string;
  accessTier: AccessTier;
  singlePriceRub?: number | null;
  isFeatured?: boolean;
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
      matchStartsAt: startsIso,
      matchStatus: 'UPCOMING',
      stakePercent: stake,
      stakeUnits: stake,
      bookmakerSource: input.bookmakerSource?.trim() || 'Pinnacle / Фонбет',
      analysisTeaser: input.analysisTeaser.trim(),
      isFeatured: Boolean(input.isFeatured),
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
    const priceLabel =
      created.pred.accessTier === 'FREE'
        ? 'Открытый бесплатный разбор'
        : `Разовый доступ: ${created.pred.singlePriceRub} ₽`;
    const msg = [
      `📊 <b>Новый разбор на ${created.settings.brandName}</b>`,
      `🏆 ${created.pred.leagueName}`,
      `⚔️ <b>${created.pred.homeTeam} — ${created.pred.awayTeam}</b>`,
      `💼 Флэт: <b>${created.pred.stakeUnits.toFixed(2)}% банка</b>`,
      `🔓 ${priceLabel}`,
      ``,
      `${created.pred.analysisTeaser}`,
    ].join('\n');
    await sendTelegramChannelAnnouncement(created.settings, msg);
  }

  return created.pred;
}

export async function settlePredictionByAdmin(params: {
  predictionId: string;
  resultStatus: ResultStatus;
  finalScore?: string | null;
  cashoutMultiplier?: number | null;
}): Promise<PredictionRecord> {
  return mutateState((state) => {
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
      return pred;
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
    return pred;
  });
}
