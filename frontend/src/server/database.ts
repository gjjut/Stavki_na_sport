import { createHash, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { explainMarketInPlainRussian } from '../lib/plain-russian';
import { LEGAL_DOCUMENT_VERSION } from '../lib/legal-version';
import { BRAND_NAME, publicBrandName } from '../lib/brand';
import { MAX_BUNDLE_ITEMS } from '../lib/checkout-policy';
import { hashPassword, verifyPassword } from './auth';
import { newTelegramLinkCode, secureTelegramLinkCode } from './security-policy';
import {
  toAdminAutopilotDto,
  toAdminSettingsDto,
} from './admin-secret-policy';
import { hasAiCommitteeProvenance } from './ai-provenance';
import {
  hasCorroboratedFinalScore,
  hasVerifiedSettledResult as hasVerifiedSettledResultWithMarket,
} from './final-score-verification';
import { evaluateMarketByScore } from './market-settlement';
import { initialLlmConfigFromEnv } from './llm-config-policy';
import { canAccessLegacyStarterDemoPrediction, isLegacyStarterDemoPrediction } from './prediction-data-policy';
import { assertPredictionsExistForOrder, assertPredictionSaleTermsUnchanged, validatePredictionForPublication } from './admin-prediction-policy';
import { assertAutopilotConfigUnchanged, assertNewAutopilotFixture, AutopilotCommitConflict } from './autopilot-commit-policy';
import { assertNoOverlappingPendingOrder, assertYooKassaPaymentMatchesOrder, type VerifiedYooKassaPayment } from './payment-policy';
import { insuranceShareForPrediction } from './insurance-policy';
import {
  assertYooKassaLiveConfigured,
  createYooKassaLivePayment,
  escapeTelegramHtml,
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

export function hasVerifiedSettledResult(record: PredictionRecord): boolean {
  return hasVerifiedSettledResultWithMarket(record, evaluateMarketByScore);
}

const DATA_DIR = path.join(process.cwd(), '.data');
const LOCAL_DB_FILE = path.join(DATA_DIR, 'valuex-production.json');
const legacyAdminPasswordRotations = new Map<
  string,
  { email: string; passwordHash: string }
>();

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
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  const canSeedAdmin = adminEmail.includes('@') && adminPassword.length >= 12;

  const settings: PlatformSettings = {
    brandName: BRAND_NAME,
    supportTelegram: 'https://t.me/valuex_support',
    freeTelegramUrl: 'https://t.me/valuex_analytics',
    legalSellerName: 'Самозанятый / ИП (укажите реквизиты в Админ-панели)',
    legalInn: '',
    legalAddress: '',
    legalRegistrationNumber: '',
    supportEmail: '',
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

  const adminUser: UserAccount | null = canSeedAdmin
    ? {
        id: 'usr_admin_root',
        email: adminEmail,
        passwordHash: hashPassword(adminPassword),
        displayName: 'Главный аналитик',
        city: 'Москва',
        role: 'ADMIN',
        status: 'ACTIVE',
        balanceRub: 0,
        referenceBankrollRub: 100_000,
        telegramUsername: null,
        telegramChatId: null,
        telegramBindingVerified: false,
        telegramLinkCode: newTelegramLinkCode(),
        purchasedPredictionIds: [],
        grantedPredictionIds: [],
        referralCode: 'valuex_official',
        referredByUserId: null,
        referredByCode: null,
        revsharePercent: 30,
        affiliateBalanceRub: 0,
        affiliateTotalEarnedRub: 0,
        createdAt: new Date(now - 90 * 86400 * 1000).toISOString(),
        lastLoginAt: new Date(now).toISOString(),
      }
    : null;

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

  const aiAutopilot: AiAutopilotConfig = {
    mode: 'MODERATION',
    ...initialLlmConfigFromEnv(process.env),
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
    totalGeneratedCount: 0,
    lastFeedSource: null,
    lastMorningRunDate: null,
    lastEveningRunDate: null,
    lastScanAt: null,
    lastSettleAt: null,
  };

  return {
    settings,
    users: adminUser ? [adminUser] : [],
    predictions: [],
    transactions: [],
    promoCodes,
    affiliateLinks: adminUser
      ? [
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
        ]
      : [],
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
  const rawSettings = {
    ...((raw.settings || {}) as Partial<PlatformSettings> & {
      telegramVipChannelId?: string;
    }),
  };
  delete rawSettings.telegramBotTokenConfigured;
  delete rawSettings.yookassaSecretKeyConfigured;

  const settings: PlatformSettings = {
    ...fallback.settings,
    ...rawSettings,
    // Legacy installations persisted the old default. Do not overwrite a custom brand.
    brandName: publicBrandName(rawSettings.brandName),
    bundle2DiscountPct: rawSettings.bundle2DiscountPct ?? 15,
    bundle3DiscountPct: rawSettings.bundle3DiscountPct ?? 25,
    telegramChannelId:
      rawSettings.telegramChannelId ??
      rawSettings.telegramVipChannelId ??
      fallback.settings.telegramChannelId,
  };

  // Do not delete records implicitly on read or on an unrelated write. Legacy
  // examples are excluded from public surfaces and can be cleaned up explicitly.
  const predictions = (Array.isArray(raw.predictions) ? raw.predictions : fallback.predictions).map((p, idx) => {
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
    const finalScoreVerified = hasCorroboratedFinalScore({
      ...p,
      finalScoreVerifiedSources,
    });
    const hasUnverifiedFinalLifecycle =
      p.matchLifecycleStatus === 'FINISHED' || p.matchStatus === 'FINISHED';
    const clearUnverifiedScore =
      (hasUnverifiedFinalLifecycle && !finalScoreVerified) ||
      (p.finalScoreVerified === true && !finalScoreVerified);
    const normalizedPrediction: PredictionRecord = {
      ...p,
      authorSource: p.authorSource ?? 'HUMAN',
      externalFixtureId: p.externalFixtureId ?? null,
      aiConfidencePct: p.aiConfidencePct ?? null,
      aiEdgePct: p.aiEdgePct ?? null,
      finalScoreVerified,
      finalScoreVerifiedSources: finalScoreVerified ? finalScoreVerifiedSources : [],
      liveHomeScore: clearUnverifiedScore ? null : p.liveHomeScore ?? null,
      liveAwayScore: clearUnverifiedScore ? null : p.liveAwayScore ?? null,
      finalScoreIsOvertime: clearUnverifiedScore ? false : p.finalScoreIsOvertime ?? false,
      isFeatured: p.isFeatured ?? idx === 0,
      insuredOnLoss: p.insuredOnLoss ?? normalizedTier === 'PAID_SINGLE',
      accessTier: normalizedTier,
      singlePriceRub:
        normalizedTier === 'PAID_SINGLE'
          ? p.singlePriceRub ?? settings.defaultSinglePriceRub
          : null,
    };
    return {
      ...normalizedPrediction,
      settlementVerified: hasVerifiedSettledResult(normalizedPrediction),
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

  const storedUsers = Array.isArray(raw.users) && raw.users.length > 0
    ? raw.users
    : fallback.users;
  const configuredAdminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const configuredAdminPassword = process.env.ADMIN_PASSWORD || '';
  const users = storedUsers.map((u) => {
    let email = u.email;
    let passwordHash = u.passwordHash;
    if (
      u.role === 'ADMIN' &&
      u.email.toLowerCase() === 'admin@valuex.pro' &&
      configuredAdminPassword.length >= 12
    ) {
      const cachedRotation = legacyAdminPasswordRotations.get(passwordHash);
      if (cachedRotation) {
        email = cachedRotation.email || email;
        passwordHash = cachedRotation.passwordHash;
      } else if (verifyPassword('Admin2026!', passwordHash)) {
        const rotation = {
          email: configuredAdminEmail || email,
          passwordHash: hashPassword(configuredAdminPassword),
        };
        legacyAdminPasswordRotations.set(u.passwordHash, rotation);
        email = rotation.email;
        passwordHash = rotation.passwordHash;
      }
    }
    return {
      id: u.id,
      email,
      passwordHash,
      displayName: u.displayName,
      city: u.city || '',
      role: u.role,
      status: u.status,
      balanceRub: u.balanceRub || 0,
      referenceBankrollRub: u.referenceBankrollRub || 50_000,
      telegramUsername: u.telegramUsername ?? null,
      telegramChatId: u.telegramChatId ?? null,
      // Bindings created by the old unauthenticated webhook must be re-confirmed.
      telegramBindingVerified: u.telegramBindingVerified === true,
      telegramLinkCode: secureTelegramLinkCode(u.telegramLinkCode, u.id),
      // Plaintext codes from older releases are not accepted and disappear on the next write.
      passwordResetCode: typeof u.passwordResetCode === 'string' && /^hmac-sha256:[a-f0-9]{64}$/.test(u.passwordResetCode) ? u.passwordResetCode : null,
      passwordResetExpiresAt: typeof u.passwordResetCode === 'string' && /^hmac-sha256:[a-f0-9]{64}$/.test(u.passwordResetCode) ? u.passwordResetExpiresAt ?? null : null,
      passwordResetAttempts: u.passwordResetAttempts ?? 0,
      passwordResetRequestedAt: u.passwordResetRequestedAt ?? null,
      personalDataConsentAt: u.personalDataConsentAt ?? null,
      personalDataConsentVersion: u.personalDataConsentVersion ?? null,
      rulesAcceptedAt: u.rulesAcceptedAt ?? null,
      rulesAcceptedVersion: u.rulesAcceptedVersion ?? null,
      purchasedPredictionIds: Array.isArray(u.purchasedPredictionIds)
        ? u.purchasedPredictionIds
        : [],
      // Absence means this legacy account may have unrecorded gifts; do not invent a history.
      grantedPredictionIds: Array.isArray(u.grantedPredictionIds) && u.grantedPredictionIds.every((id) => typeof id === 'string')
        ? [...new Set(u.grantedPredictionIds)]
        : undefined,
      referralCode: u.referralCode,
      referredByUserId: u.referredByUserId ?? null,
      referredByCode: u.referredByCode ?? null,
      revsharePercent: u.revsharePercent ?? 30,
      affiliateBalanceRub: u.affiliateBalanceRub || 0,
      affiliateTotalEarnedRub: u.affiliateTotalEarnedRub || 0,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
    };
  });

  const rawAi = {
    ...((raw.aiAutopilot || {}) as Partial<AiAutopilotConfig>),
  };
  delete rawAi.llmApiKeyConfigured;
  delete (rawAi as Partial<AiAutopilotConfig> & { cronSecret?: string }).cronSecret;
  const rawSavedKey = (rawAi.llmApiKey || '').trim();
  // A configured provider, URL and model are owner choices, not fields to
  // silently "heal" based on token prefixes or stale model recommendations.
  // Environment defaults may initialize an otherwise unconfigured connection,
  // but must never replace an explicitly saved key/provider pair.
  const environmentConfig = fallback.aiAutopilot;
  const shouldUseEnvironment = !rawSavedKey && Boolean(environmentConfig.llmApiKey.trim()) &&
    (!rawAi.llmProvider || rawAi.llmProvider === 'BUILTIN_QUANT' || rawAi.llmProvider === environmentConfig.llmProvider);
  const effectiveProvider = shouldUseEnvironment
    ? environmentConfig.llmProvider
    : rawAi.llmProvider || environmentConfig.llmProvider;
  const configuredBaseUrl = shouldUseEnvironment
    ? environmentConfig.llmBaseUrl
    : (rawAi.llmBaseUrl || '').trim() || (effectiveProvider === environmentConfig.llmProvider ? environmentConfig.llmBaseUrl : '');
  const configuredModel = shouldUseEnvironment
    ? environmentConfig.llmModel
    : (rawAi.llmModel || '').trim() || (effectiveProvider === environmentConfig.llmProvider ? environmentConfig.llmModel : '');

  const aiAutopilot: AiAutopilotConfig = {
    ...fallback.aiAutopilot,
    ...rawAi,
    llmProvider: effectiveProvider,
    llmBaseUrl: configuredBaseUrl,
    llmApiKey: shouldUseEnvironment ? environmentConfig.llmApiKey : rawSavedKey,
    llmModel: configuredModel,
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
let pgPoolInit: Promise<Pool | null> | null = null;
let pgLastFailAt = 0;
let memoryFallback: PersistentState | null = null;
let localWriteQueue: Promise<unknown> = Promise.resolve();

async function getPostgresPool(): Promise<Pool | null> {
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!dbUrl) return null;
  if (pgPool) return pgPool;
  if (pgPoolInit) return pgPoolInit;

  // Если при старте системы PostgreSQL еще поднимался, пробуем переподключиться раз в 10 секунд.
  if (pgLastFailAt > 0 && Date.now() - pgLastFailAt < 10_000) return null;

  // Concurrent requests share one connection attempt rather than creating multiple pools.
  const init = (async (): Promise<Pool | null> => {
    let pool: Pool | null = null;
    try {
      const candidate = new Pool({
        connectionString: dbUrl,
        connectionTimeoutMillis: 3000,
        idleTimeoutMillis: 30_000,
        max: 8,
      });
      pool = candidate;
      candidate.on('error', () => {
        if (pgPool === candidate) {
          pgPool = null;
          pgLastFailAt = Date.now();
        }
        void candidate.end().catch(() => undefined);
      });
      const createStorageTable = `
        CREATE TABLE IF NOT EXISTS valuex_app_storage (
          store_key VARCHAR(64) PRIMARY KEY,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `;
      try {
        await candidate.query(createStorageTable);
      } catch (err) {
        // IF NOT EXISTS can still race in PostgreSQL's system catalog when
        // several fresh processes initialize simultaneously. Retry only catalog
        // conflict SQLSTATEs, not authentication, network, or arbitrary failures.
        const code = (err as { code?: unknown } | null)?.code;
        if (code !== '23505' && code !== '42P07' && code !== '42710') throw err;
        await candidate.query(createStorageTable);
      }
      pgPool = candidate;
      pgLastFailAt = 0;
      return candidate;
    } catch {
      if (pool) await pool.end().catch(() => undefined);
      pgLastFailAt = Date.now();
      return null;
    }
  })();
  pgPoolInit = init;
  try {
    return await init;
  } finally {
    if (pgPoolInit === init) pgPoolInit = null;
  }
}

export class StorageUnavailableError extends Error {
  constructor(message = 'Хранилище временно недоступно. Проверьте результат операции перед повтором.') {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}

async function postgresOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    // SQL/connection details, including credentials, must not reach API clients.
    throw new StorageUnavailableError();
  }
}

export async function getDatabaseBackendStatus(): Promise<{
  backend: 'postgres' | 'local_file' | 'unavailable';
  databaseUrlConfigured: boolean;
  usingLocalFallback: boolean;
}> {
  const databaseUrlConfigured = Boolean(process.env.DATABASE_URL?.trim());
  const pool = await getPostgresPool();
  return {
    backend: pool ? 'postgres' : databaseUrlConfigured ? 'unavailable' : 'local_file',
    databaseUrlConfigured,
    usingLocalFallback: false,
  };
}

function readLocalFileState(): PersistentState {
  if (memoryFallback) return memoryFallback;
  let contents: string;
  try {
    contents = fs.readFileSync(LOCAL_DB_FILE, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new StorageUnavailableError('Не удалось прочитать локальную базу. Проверьте файл и резервную копию.');
    }
    const initial = createInitialState();
    writeLocalFileState(initial);
    return initial;
  }

  try {
    const raw: unknown = JSON.parse(contents);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid state');
    const fields = raw as Record<string, unknown>;
    // These core collections exist in both current and legacy snapshots. Missing them
    // must not silently turn a truncated but syntactically valid JSON file into a seed.
    if (!fields.settings || typeof fields.settings !== 'object' || Array.isArray(fields.settings) ||
        !Array.isArray(fields.users) || !Array.isArray(fields.predictions) || !Array.isArray(fields.transactions)) {
      throw new Error('Incomplete state');
    }
    const parsed = normalizeLoadedState(fields);
    memoryFallback = parsed;
    return parsed;
  } catch {
    // Never replace an unreadable or invalid file with a new empty seed.
    throw new StorageUnavailableError('Локальная база повреждена. Файл не изменён; проверьте резервную копию.');
  }
}

function writeLocalFileState(state: PersistentState): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmp = `${LOCAL_DB_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, LOCAL_DB_FILE);
    memoryFallback = state;
  } catch {
    throw new StorageUnavailableError('Не удалось сохранить локальную базу. Проверьте результат операции перед повтором.');
  }
}

export async function readState(): Promise<PersistentState> {
  const pool = await getPostgresPool();
  if (!pool) {
    // A configured PostgreSQL is authoritative; never serve a divergent local file.
    if (process.env.DATABASE_URL?.trim()) throw new StorageUnavailableError();
    return readLocalFileState();
  }

  return postgresOperation(async () => {
    const res = await pool.query<{ payload: PersistentState }>(
      `SELECT payload FROM valuex_app_storage WHERE store_key = 'main'`,
    );
    if (res.rows.length > 0) {
      return normalizeLoadedState(
        res.rows[0].payload as unknown as Record<string, unknown>,
      );
    }

    const seeded = createInitialState();
    const inserted = await pool.query<{ payload: PersistentState }>(
      `INSERT INTO valuex_app_storage (store_key, payload, updated_at)
       VALUES ('main', $1::jsonb, NOW())
       ON CONFLICT (store_key) DO NOTHING
       RETURNING payload`,
      [JSON.stringify(seeded)],
    );
    if (inserted.rows.length) return seeded;
    // Another request initialized the row first; read its state instead of returning our unused seed.
    const current = await pool.query<{ payload: PersistentState }>(
      `SELECT payload FROM valuex_app_storage WHERE store_key = 'main'`,
    );
    if (!current.rows.length) throw new Error('PostgreSQL state is missing');
    return normalizeLoadedState(current.rows[0].payload as unknown as Record<string, unknown>);
  });
}

export async function mutateState<T>(
  mutator: (draft: PersistentState) => Promise<T> | T,
): Promise<T> {
  const pool = await getPostgresPool();
  if (!pool) {
    if (process.env.DATABASE_URL?.trim()) throw new StorageUnavailableError();
    // Строгая очередь записи, исключающая гонки при параллельных запросах в одном процессе.
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

  const client = await postgresOperation(() => pool.connect());
  try {
    await postgresOperation(() => client.query('BEGIN'));
    let res = await postgresOperation(() => client.query<{ payload: PersistentState }>(
      `SELECT payload FROM valuex_app_storage WHERE store_key = 'main' FOR UPDATE`,
    ));
    if (res.rows.length === 0) {
      const seeded = createInitialState();
      // Two fresh processes may both observe no row. Let the winning INSERT
      // initialize it, then lock and reread that exact row before mutating.
      await postgresOperation(() => client.query(
        `INSERT INTO valuex_app_storage (store_key, payload, updated_at)
         VALUES ('main', $1::jsonb, NOW())
         ON CONFLICT (store_key) DO NOTHING`,
        [JSON.stringify(seeded)],
      ));
      res = await postgresOperation(() => client.query<{ payload: PersistentState }>(
        `SELECT payload FROM valuex_app_storage WHERE store_key = 'main' FOR UPDATE`,
      ));
      if (!res.rows.length) throw new StorageUnavailableError();
    }

    const draft = normalizeLoadedState(
      structuredClone(res.rows[0].payload) as unknown as Record<string, unknown>,
    );
    const result = await mutator(draft);
    draft.processedWebhooks = draft.processedWebhooks.slice(-1000);
    draft.aiLogs = draft.aiLogs.slice(0, 100);

    await postgresOperation(() => client.query(
      `UPDATE valuex_app_storage SET payload = $1::jsonb, updated_at = NOW() WHERE store_key = 'main'`,
      [JSON.stringify(draft)],
    ));
    await postgresOperation(() => client.query('COMMIT'));
    return result;
  } catch (err) {
    // Preserve the original failure even if the connection also fails during rollback.
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export { toAdminAutopilotDto, toAdminSettingsDto } from './admin-secret-policy';

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
    telegramBindingVerified: user.telegramBindingVerified === true,
    telegramLinkCode: secureTelegramLinkCode(user.telegramLinkCode, user.id),
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
  const hasVerifiedFinal = hasCorroboratedFinalScore(record);
  const isVerifiedSettled = hasVerifiedSettledResult(record);
  const publicResultStatus =
    record.resultStatus === 'PENDING' || isVerifiedSettled
      ? record.resultStatus
      : 'PENDING';
  const effectiveStatus = resolveEffectiveMatchStatus({
    ...record,
    resultStatus: publicResultStatus,
  });
  const isFree = record.accessTier === 'FREE';
  const isSettledPublic =
    record.revealAfterFinish &&
    effectiveStatus === 'FINISHED' &&
    publicResultStatus !== 'PENDING';
  const isBought = Boolean(viewer?.purchasedPredictionIds.includes(record.id) || viewer?.grantedPredictionIds?.includes(record.id));
  const isAdmin = viewer?.role === 'ADMIN';
  const isLegacyDemo = isLegacyStarterDemoPrediction(record);

  const unlocked = isLegacyDemo
    ? canAccessLegacyStarterDemoPrediction(record, viewer)
    : isFree || isSettledPublic || isAdmin || (viewer?.status === 'ACTIVE' && isBought);

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
    finalScoreVerified: hasVerifiedFinal,
    stakePercent: record.stakePercent,
    stakeUnits: record.stakeUnits,
    bookmakerSource: record.bookmakerSource,
    analysisTeaser: record.analysisTeaser,
    isFeatured: Boolean(record.isFeatured),
    insuredOnLoss: Boolean(record.insuredOnLoss),
    isLegacyDemo,
    salesClosed:
      isLegacyDemo ||
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
    resultStatus: publicResultStatus,
    finalScore: isVerifiedSettled ? record.finalScore : null,
    profitUnits: isVerifiedSettled ? record.profitUnits : null,
    profitPercent: isVerifiedSettled ? record.profitPercent : null,
    verificationHash: record.verificationHash,
    oddsLockedAt: record.oddsLockedAt,
    settledAt: isVerifiedSettled ? record.settledAt : null,
    researchSources: record.researchSources ?? [],
    agentReport: unlocked ? record.agentReport ?? null : null,
    liveHomeScore:
      record.matchLifecycleStatus === 'LIVE' || hasVerifiedFinal
        ? record.liveHomeScore ?? null
        : null,
    liveAwayScore:
      record.matchLifecycleStatus === 'LIVE' || hasVerifiedFinal
        ? record.liveAwayScore ?? null
        : null,
    liveUpdatedAt:
      record.matchLifecycleStatus === 'LIVE' || hasVerifiedFinal
        ? record.liveUpdatedAt ?? null
        : null,
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
    .filter((p) => !isLegacyStarterDemoPrediction(p) && hasVerifiedSettledResult(p) && p.profitUnits !== null)
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

  const recentWinsFeed = [...settledChrono]
    .reverse()
    .filter((prediction) => prediction.resultStatus === 'WIN' && (prediction.profitUnits ?? 0) > 0)
    .slice(0, 4)
    .map((win) => ({
      id: `win_${win.id}`,
      sport: win.sport,
      matchTitle: `${win.homeTeam} — ${win.awayTeam}`,
      finalScore: win.finalScore || '',
      fixedOdds: win.fixedOdds,
      profitUnits: win.profitUnits ?? 0,
      settledAt: win.settledAt || '',
    }));

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
    // Pending orders reserve a use until the payment is confirmed or cancelled.
    // Check again while inserting the order so concurrent checkouts cannot
    // exceed the configured cap.
    const reserved = params.state.transactions.filter((order) =>
      order.status === 'PENDING' && order.promoCode?.toUpperCase() === clean,
    ).length;
    const found = params.state.promoCodes.find(
      (c) => c.code.toUpperCase() === clean && c.active && c.usedCount + reserved < c.maxUses,
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
  legalAcceptance?: { personalData: boolean; rules: boolean };
}): Promise<UserAccount> {
  const cleanEmail = typeof params.email === 'string' ? params.email.trim().toLowerCase() : '';
  if (cleanEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error('Введите корректный E-mail');
  if (typeof params.password !== 'string' || params.password.length < 10 || params.password.length > 256) {
    throw new Error('Пароль должен содержать от 10 до 256 символов');
  }
  if (typeof params.displayName !== 'string' || params.displayName.length > 80 || (params.city && (typeof params.city !== 'string' || params.city.length > 80))) {
    throw new Error('Имя и город должны содержать не более 80 символов');
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
      telegramBindingVerified: false,
      telegramLinkCode: newTelegramLinkCode(),
      personalDataConsentAt: params.legalAcceptance?.personalData ? new Date().toISOString() : null,
      personalDataConsentVersion: params.legalAcceptance?.personalData ? LEGAL_DOCUMENT_VERSION : null,
      rulesAcceptedAt: params.legalAcceptance?.rules ? new Date().toISOString() : null,
      rulesAcceptedVersion: params.legalAcceptance?.rules ? LEGAL_DOCUMENT_VERSION : null,
      purchasedPredictionIds: [],
      grantedPredictionIds: [],
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

function assertPredictionAvailableForSale(prediction: PredictionRecord): void {
  if (isLegacyStarterDemoPrediction(prediction)) throw new Error('Архивная демонстрационная запись недоступна для покупки.');
  if (prediction.accessTier !== 'PAID_SINGLE') throw new Error('Бесплатный прогноз не требует покупки');
  if (
    resolveEffectiveMatchStatus(prediction) !== 'UPCOMING' ||
    prediction.matchLifecycleStatus === 'POSTPONED' ||
    prediction.matchLifecycleStatus === 'CANCELLED' ||
    !Number.isFinite(Date.parse(prediction.matchStartsAt)) ||
    Date.now() >= Date.parse(prediction.matchStartsAt)
  ) {
    throw new Error(`Продажа закрыта: матч «${prediction.homeTeam} — ${prediction.awayTeam}» уже начался, перенесён или отменён либо наступило время старта по расписанию`);
  }
}

export async function initiateOrderCheckout(params: {
  userId: string;
  kind: 'SINGLE_PREDICTION' | 'BUNDLE_PREDICTIONS' | 'BALANCE_TOPUP';
  predictionId?: string;
  predictionIds?: string[];
  promoCode?: string | null;
  topupAmountRub?: number;
  paymentMethod: 'yookassa' | 'internal_balance';
  /** Amount and mode explicitly shown to the buyer before their confirmation. */
  expectedAmountRub: number;
  expectedPaymentMode: 'TEST_INSTANT' | 'YOOKASSA_LIVE';
  originUrl: string;
  offerAcceptedVersion?: string;
}): Promise<{ order: OrderTransaction; paidImmediately: boolean }> {
  if (!['SINGLE_PREDICTION', 'BUNDLE_PREDICTIONS', 'BALANCE_TOPUP'].includes(params.kind) ||
      !['yookassa', 'internal_balance'].includes(params.paymentMethod) ||
      !Number.isSafeInteger(params.expectedAmountRub) || params.expectedAmountRub < 50 ||
      !['TEST_INSTANT', 'YOOKASSA_LIVE'].includes(params.expectedPaymentMode) ||
      (params.predictionIds !== undefined && (!Array.isArray(params.predictionIds) ||
        params.predictionIds.length > MAX_BUNDLE_ITEMS || params.predictionIds.some((id) => typeof id !== 'string' || id.length > 128))) ||
      (params.predictionId !== undefined && (typeof params.predictionId !== 'string' || params.predictionId.length > 128)) ||
      (params.promoCode != null && (typeof params.promoCode !== 'string' || params.promoCode.length > 24))) {
    throw new Error('Некорректные параметры заказа');
  }
  if (params.kind === 'BALANCE_TOPUP' && params.paymentMethod !== 'yookassa') {
    throw new Error('Пополнение баланса доступно только внешним платежом');
  }
  if (params.kind === 'BALANCE_TOPUP' && (typeof params.topupAmountRub !== 'number' || !Number.isFinite(params.topupAmountRub) || params.topupAmountRub < 100 || params.topupAmountRub > 10_000_000)) {
    throw new Error('Сумма пополнения должна быть от 100 до 10 000 000 ₽');
  }
  const stateSnap = await readState();
  const userSnap = stateSnap.users.find((u) => u.id === params.userId);
  if (!userSnap || userSnap.status === 'BLOCKED') {
    throw new Error('Авторизуйтесь для совершения покупки');
  }
  if (stateSnap.settings.paymentMode !== params.expectedPaymentMode) {
    throw new Error('Режим оплаты изменился. Обновите страницу и заново проверьте условия заказа.');
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

    targetIds = Array.from(new Set(rawIds));
    if (!targetIds.length) throw new Error('Выберите прогноз для покупки');
    if (targetIds.some((id) => userSnap.purchasedPredictionIds.includes(id))) {
      throw new Error('Часть выбранных прогнозов уже открыта в кабинете. Обновите корзину.');
    }
    assertNoOverlappingPendingOrder(stateSnap.transactions, userSnap.id, targetIds, params.kind);

    const matchedPreds = targetIds.map((id) => {
      const p = stateSnap.predictions.find((row) => row.id === id);
      if (!p) throw new Error('Одно из выбранных событий не найдено');
      assertPredictionAvailableForSale(p);
      return p;
    });

    const pricing = calculateCartPricing({
      state: stateSnap,
      predictionIds: targetIds,
      promoCode: params.promoCode,
    });
    if (params.promoCode?.trim() && !pricing.promoValidCode) {
      throw new Error('Промокод больше не действует. Обновите страницу и проверьте цену до оплаты.');
    }
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
    assertNoOverlappingPendingOrder(stateSnap.transactions, userSnap.id, [], params.kind);
    amountRub = Math.max(100, Math.round(params.topupAmountRub || 1000));
    const bonusPreview = computeWalletTopupBonusRub(amountRub);
    title =
      bonusPreview > 0
        ? `Пополнение баланса на ${amountRub} ₽ (+бонус ${bonusPreview} ₽)`
        : 'Пополнение баланса кабинета';
  }

  // Never charge or create a provider payment for an amount the buyer did not see.
  // This catches stale prices, changed bundle settings and already-purchased items.
  if (params.expectedAmountRub !== amountRub) {
    throw new Error('Цена или состав заказа изменились. Обновите страницу и заново проверьте сумму до оплаты.');
  }
  if (params.paymentMethod === 'internal_balance' && userSnap.balanceRub < amountRub) {
    throw new Error(
      `Недостаточно средств на кошельке (${userSnap.balanceRub} ₽ из ${amountRub} ₽)`,
    );
  }

  const orderId = `ord_${randomUUID().slice(0, 12)}`;
  const idempotenceKey = randomUUID();
  const isLivePayment = params.paymentMethod === 'yookassa' && stateSnap.settings.paymentMode === 'YOOKASSA_LIVE';

  if (isLivePayment) {
    let configuredOrigin: string | null = null;
    try {
      configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL).origin : null;
    } catch {
      throw new Error('Некорректный NEXT_PUBLIC_SITE_URL для платежей.');
    }
    if (!params.originUrl.startsWith('https://') ||
        (process.env.NODE_ENV === 'production' && (!configuredOrigin || configuredOrigin !== params.originUrl))) {
      throw new Error('Для реальных платежей настройте канонический HTTPS-адрес сайта в NEXT_PUBLIC_SITE_URL.');
    }
    // A predictable configuration failure must not strand a reservation.
    assertYooKassaLiveConfigured(stateSnap.settings);
  }

  // Persist the order, its idempotence key and promo reservation BEFORE any
  // provider call. The lock also prevents overlapping concurrent checkouts.
  const createdOrder = await mutateState((state) => {
    assertPredictionsExistForOrder(state, targetIds);
    assertPredictionSaleTermsUnchanged(state.predictions, stateSnap.predictions, targetIds);
    if (state.settings.paymentMode !== params.expectedPaymentMode) {
      throw new Error('Режим оплаты изменился. Обновите страницу и заново проверьте условия заказа.');
    }
    const currentBuyer = state.users.find((user) => user.id === userSnap.id);
    if (!currentBuyer || currentBuyer.status === 'BLOCKED') {
      throw new Error('Авторизуйтесь для совершения покупки');
    }
    if (targetIds.some((id) => currentBuyer.purchasedPredictionIds.includes(id))) {
      throw new Error('Часть выбранных прогнозов уже открыта в кабинете. Обновите корзину.');
    }
    assertNoOverlappingPendingOrder(state.transactions, currentBuyer.id, targetIds, params.kind);
    for (const id of targetIds) {
      const prediction = state.predictions.find((item) => item.id === id);
      if (!prediction) throw new Error('Одно из выбранных событий уже недоступно. Обновите корзину.');
      assertPredictionAvailableForSale(prediction);
    }
    if (targetIds.length) {
      const currentPricing = calculateCartPricing({ state, predictionIds: targetIds, promoCode: params.promoCode });
      if (params.promoCode?.trim() && !currentPricing.promoValidCode) {
        throw new Error('Промокод больше не действует или зарезервирован другими заказами. Обновите корзину.');
      }
      if (currentPricing.finalAmountRub !== amountRub) {
        throw new Error('Цена заказа изменилась. Обновите корзину и проверьте сумму до оплаты.');
      }
    }
    const order: OrderTransaction = {
      id: orderId,
      idempotenceKey,
      externalPaymentId: isLivePayment ? '' : `yk_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
      ...(isLivePayment ? { providerCreationState: 'CREATING' as const } : {}),
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
      paymentModeAtCreation: stateSnap.settings.paymentMode,
      status: 'PENDING',
      insuranceAllocationVersion: targetIds.length ? 'EQUAL_REMAINDER_V1' : null,
      receiptEmail: userSnap.email,
      confirmationUrl: null,
      affiliateUserId: null,
      affiliateCommissionRub: 0,
      createdAt: new Date().toISOString(),
      paidAt: null,
      offerAcceptedAt: params.offerAcceptedVersion ? new Date().toISOString() : null,
      offerAcceptedVersion: params.offerAcceptedVersion || null,
    };
    state.transactions.unshift(order);
    return order;
  });

  if (
    params.paymentMethod === 'internal_balance' ||
    stateSnap.settings.paymentMode === 'TEST_INSTANT'
  ) {
    try {
      const settledOrder = await fulfillOrderPayment(createdOrder.id);
      return { order: settledOrder, paidImmediately: true };
    } catch (error) {
      // A failed local debit/test checkout must not leave an unpayable pending
      // order that blocks another attempt. Never undo a completed transaction.
      await mutateState((state) => {
        const order = state.transactions.find((item) => item.id === createdOrder.id);
        if (order?.status === 'PENDING') order.status = 'CANCELED';
      }).catch(() => undefined);
      throw error;
    }
  }

  let liveResult;
  try {
    liveResult = await createYooKassaLivePayment({
      settings: stateSnap.settings,
      idempotenceKey: createdOrder.idempotenceKey,
      amountRub: createdOrder.amountRub,
      title: createdOrder.title,
      receiptEmail: createdOrder.receiptEmail,
      returnUrl: `${params.originUrl}/payment/return?orderId=${encodeURIComponent(createdOrder.id)}`,
      metadata: { orderId: createdOrder.id, userId: createdOrder.userId, kind: params.kind },
    });
  } catch (error) {
    // Never release an uncertain real payment or its promo reservation. Even a
    // network error or provider 5xx may have created the payment. A webhook or
    // administrator can identify it later from verified provider metadata.
    await mutateState((state) => {
      const order = state.transactions.find((item) => item.id === createdOrder.id);
      if (order?.status === 'PENDING' && !order.externalPaymentId && order.providerCreationState === 'CREATING') {
        order.providerCreationState = 'UNKNOWN';
      }
    }).catch(() => undefined);
    const detail = error instanceof Error ? error.message : 'Нет подтверждения ЮKassa.';
    throw new Error(`Заказ ${createdOrder.id}: ${detail} Проверьте заказ в кабинете или обратитесь в поддержку до повторной оплаты.`);
  }

  let recordedOrder: OrderTransaction;
  try {
    recordedOrder = await mutateState((state) => {
      const order = state.transactions.find((item) => item.id === createdOrder.id);
      if (!order || order.paymentModeAtCreation !== 'YOOKASSA_LIVE' || order.paymentMethod !== 'yookassa') {
        throw new Error('Резерв заказа не найден.');
      }
      if ((order.externalPaymentId && order.externalPaymentId !== liveResult.externalPaymentId) ||
          state.transactions.some((item) => item.id !== order.id && item.externalPaymentId === liveResult.externalPaymentId)) {
        throw new Error('Идентификатор платежа не совпадает с записью заказа.');
      }
      order.externalPaymentId = liveResult.externalPaymentId;
      // A webhook may have already settled or canceled this very order.
      if (order.status === 'PENDING' && liveResult.status === 'pending') {
        order.confirmationUrl = liveResult.confirmationUrl;
        order.providerCreationState = 'READY';
      } else {
        order.providerCreationState = order.confirmationUrl ? 'READY' : 'IDENTIFIED';
      }
      return order;
    });
  } catch (error) {
    const message = `Заказ ${createdOrder.id}: платёж мог быть создан, но не удалось сохранить его данные. Обратитесь в поддержку до повторной оплаты.`;
    if (error instanceof StorageUnavailableError) throw new StorageUnavailableError(message);
    throw new Error(message);
  }
  if (recordedOrder.status === 'SUCCEEDED') return { order: recordedOrder, paidImmediately: true };
  if (recordedOrder.status !== 'PENDING' || !recordedOrder.confirmationUrl) {
    throw new Error(`Заказ ${createdOrder.id}: статус платежа требует проверки. Проверьте его в кабинете или обратитесь в поддержку до повторной оплаты.`);
  }
  return { order: recordedOrder, paidImmediately: false };
}

export async function fulfillOrderPayment(
  orderIdOrExternalId: string,
  verifiedPayment?: VerifiedYooKassaPayment,
): Promise<OrderTransaction> {
  const result = await mutateState((state) => {
    const tx = state.transactions.find(
      (t) => t.id === orderIdOrExternalId || t.externalPaymentId === orderIdOrExternalId,
    );
    if (!tx) throw new Error('Заказ не найден');
    // Verify again under the state lock: the order may have changed during the network request.
    if (verifiedPayment) {
      if (tx.paymentModeAtCreation === 'TEST_INSTANT') {
        throw new Error('Тестовый заказ нельзя подтвердить как реальный платёж.');
      }
      assertYooKassaPaymentMatchesOrder(tx, verifiedPayment);
      if (verifiedPayment.status !== 'succeeded' || !verifiedPayment.paid) {
        throw new Error('Оплата не подтверждена ЮKassa.');
      }
    } else if (tx.paymentMethod === 'yookassa' && tx.paymentModeAtCreation !== 'TEST_INSTANT') {
      // Unknown legacy orders fail closed as well; changing settings later must
      // never turn a real pending payment into a simulated success.
      throw new Error('Для подтверждения платежа требуется проверка ЮKassa.');
    }
    if (tx.status === 'SUCCEEDED') {
      return {
        tx,
        newlySettled: false,
        buyerChatId: null as string | null,
        unlockedPreds: [] as PredictionRecord[],
        settings: state.settings,
      };
    }
    if (tx.status !== 'PENDING') {
      throw new Error('Заказ уже отменён или возвращён; требуется ручная сверка платежа.');
    }
    if (tx.externalRefundNotices?.length) {
      // A refund can arrive before a delayed success notification. Do not grant
      // access or credit a wallet for a payment already under refund review.
      throw new Error('По платежу уже есть возврат ЮKassa; требуется ручная сверка до исполнения заказа.');
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

    // Test mode is not money and must never create a withdrawable partner balance.
    // Provider verification also prevents a later mode change from altering this rule.
    if (tx.paymentMethod === 'yookassa' && verifiedPayment && buyer.referredByUserId) {
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
      buyerChatId: buyer.telegramBindingVerified ? buyer.telegramChatId ?? null : null,
      adminChatIds: state.users
        .filter((u) => u.role === 'ADMIN' && u.telegramBindingVerified && u.telegramChatId && u.id !== buyer.id)
        .map((u) => u.telegramChatId!),
      unlockedPreds,
      settings: state.settings,
    };
  });

  // Мгновенное уведомление владельцу (администратору) о новой продаже
  if (result.newlySettled && result.adminChatIds && result.adminChatIds.length > 0) {
    const isSimulated = result.tx.paymentMethod === 'yookassa' && result.tx.paymentModeAtCreation === 'TEST_INSTANT';
    const adminAlert = [
      isSimulated
        ? `🧪 <b>Тестовый заказ на ${result.tx.amountRub.toLocaleString('ru-RU')} ₽: реальная оплата не поступала</b>`
        : `💸 <b>Новая оплата +${result.tx.amountRub.toLocaleString('ru-RU')} ₽!</b>`,
      `🧾 Номер заказа: <code>${escapeTelegramHtml(result.tx.id)}</code>`,
      `📦 Заказ: ${escapeTelegramHtml(result.tx.kind === 'BALANCE_TOPUP' ? 'Пополнение баланса' : result.tx.title)}`,
      `💳 Способ: ${
        isSimulated ? 'Тестовый режим' : result.tx.paymentMethod === 'yookassa' ? 'ЮKassa' : 'Внутренний баланс'
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
      `💳 <b>Баланс пополнен (${escapeTelegramHtml(result.settings.brandName)})!</b>`,
      result.tx.paymentModeAtCreation === 'TEST_INSTANT' ? 'Тестовый режим: реальные деньги не списывались.' : '',
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
        `🔓 <b>Ваш купленный прогноз открыт (${escapeTelegramHtml(result.settings.brandName)})</b>`,
        ``,
        `🏆 ${escapeTelegramHtml(p.leagueName)}`,
        `⚔️ <b>${escapeTelegramHtml(p.homeTeam)} — ${escapeTelegramHtml(p.awayTeam)}</b>`,
        `🎯 Ставка: <b>${escapeTelegramHtml(p.selectionTitle)}</b>`,
        `📈 Коэффициент: <b>${p.fixedOdds.toFixed(2)}</b> (${p.stakeUnits.toFixed(1)}% от банка)`,
        `📍 <b>Где искать в БК:</b> ${escapeTelegramHtml(plain.whereToFindInBk)}`,
        `✅ <b>Когда выигрыш:</b> ${escapeTelegramHtml(plain.whenYouWin)}`,
        p.insuredOnLoss
          ? `🛡 <b>Страховка:</b> при проигрыше или возврате предусмотрено начисление на баланс сайта по условиям оферты. Ставку у букмекера оно не возмещает.`
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

/**
 * Bind only a provider-verified payment to an order reserved before creation.
 * Never trust IDs, status, amounts or metadata supplied in a webhook body or UI.
 */
export async function attachVerifiedYooKassaPayment(
  orderId: string,
  payment: VerifiedYooKassaPayment,
): Promise<OrderTransaction> {
  if (!payment.id || payment.id.length > 128) throw new Error('Некорректный идентификатор платежа ЮKassa.');
  return mutateState((state) => {
    const order = state.transactions.find((item) => item.id === orderId);
    if (!order || order.paymentMethod !== 'yookassa' || order.paymentModeAtCreation === 'TEST_INSTANT' ||
        (order.paymentModeAtCreation !== 'YOOKASSA_LIVE' && state.settings.paymentMode !== 'YOOKASSA_LIVE')) {
      throw new Error('Реальный заказ для платежа ЮKassa не найден.');
    }
    if (!order.externalPaymentId) {
      if (order.paymentModeAtCreation !== 'YOOKASSA_LIVE' || order.status !== 'PENDING' ||
          (order.providerCreationState !== 'CREATING' && order.providerCreationState !== 'UNKNOWN')) {
        throw new Error('Заказ не допускает привязку неизвестного платежа; требуется ручная сверка.');
      }
      // Compare against a temporary copy before changing any stored value.
      assertYooKassaPaymentMatchesOrder({ ...order, externalPaymentId: payment.id }, payment);
      if (state.transactions.some((item) => item.id !== order.id && item.externalPaymentId === payment.id)) {
        throw new Error('Этот платёж ЮKassa уже связан с другим заказом.');
      }
      order.externalPaymentId = payment.id;
      order.providerCreationState = 'IDENTIFIED';
    } else {
      assertYooKassaPaymentMatchesOrder(order, payment);
    }
    return order;
  });
}

/**
 * The optional payment ID is used only by an authenticated administrator who
 * found it at the provider. Even then all details are fetched and checked.
 */
export async function verifyAndSyncYooKassaOrder(
  orderId: string,
  discoveredPaymentId?: string,
): Promise<OrderTransaction> {
  const state = await readState();
  const tx = state.transactions.find((t) => t.id === orderId);
  if (!tx) throw new Error('Заказ не найден');
  if (tx.status !== 'PENDING') return tx;
  if (tx.paymentMethod !== 'yookassa' || tx.paymentModeAtCreation === 'TEST_INSTANT' ||
      (tx.paymentModeAtCreation !== 'YOOKASSA_LIVE' && state.settings.paymentMode !== 'YOOKASSA_LIVE')) {
    throw new Error('Этот заказ нельзя сверить как реальный платёж ЮKassa.');
  }
  if (discoveredPaymentId && tx.externalPaymentId && discoveredPaymentId !== tx.externalPaymentId) {
    throw new Error('У заказа уже указан другой идентификатор платежа.');
  }
  const paymentId = tx.externalPaymentId || discoveredPaymentId;
  // A response may have been lost before the ID was recorded. No guesses or
  // automatic cancellation: the provider must first identify that payment.
  if (!paymentId) return tx;

  const check = await verifyYooKassaLivePayment(state.settings, paymentId);
  const attached = await attachVerifiedYooKassaPayment(tx.id, check);
  if (check.status === 'succeeded' && check.paid) {
    return fulfillOrderPayment(tx.id, check);
  }
  if (check.status === 'canceled' && !check.paid) {
    return mutateState((draft) => {
      const found = draft.transactions.find((r) => r.id === tx.id);
      if (!found) throw new Error('Заказ не найден');
      assertYooKassaPaymentMatchesOrder(found, check);
      // Do not overwrite a concurrent success or a manual refund.
      if (found.status === 'PENDING' && !found.externalRefundNotices?.length) found.status = 'CANCELED';
      return found;
    });
  }
  return attached;
}

export async function verifyAndSyncOrderFromReturn(orderId: string): Promise<OrderTransaction> {
  const state = await readState();
  const tx = state.transactions.find((t) => t.id === orderId);
  if (!tx) throw new Error('Заказ не найден');
  // Old simulated or internal-balance orders must never contact the provider.
  if (tx.status !== 'PENDING' || tx.paymentMethod !== 'yookassa' || tx.paymentModeAtCreation === 'TEST_INSTANT' ||
      (tx.paymentModeAtCreation !== 'YOOKASSA_LIVE' && state.settings.paymentMode !== 'YOOKASSA_LIVE')) return tx;
  return verifyAndSyncYooKassaOrder(orderId);
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
}, autopilotCommit?: { kind: 'SCAN'; configSnapshot: AiAutopilotConfig } | { kind: 'DRAFT'; draftSnapshot: AiPredictionDraft }): Promise<PredictionRecord> {
  if (input.authorSource === 'AI_AUTOPILOT' && !autopilotCommit) {
    throw new Error('AI-происхождение доступно только проверенному конвейеру автопилота.');
  }
  if (autopilotCommit && (input.authorSource !== 'AI_AUTOPILOT' || !input.externalFixtureId || !input.agentReport?.trim())) {
    throw new Error('Для выпуска автопилота необходимы подтверждённая линия и отчёт ролей модели.');
  }
  validatePredictionForPublication(input);
  const odds = Number(input.fixedOdds);
  const stake = Number(input.stakeUnits);

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
    if (autopilotCommit) {
      if (autopilotCommit.kind === 'SCAN') {
        assertAutopilotConfigUnchanged(state.aiAutopilot, autopilotCommit.configSnapshot);
      } else {
        const savedDraft = state.aiDrafts.find((draft) => draft.id === autopilotCommit.draftSnapshot.id);
        if (!savedDraft || JSON.stringify(savedDraft) !== JSON.stringify(autopilotCommit.draftSnapshot)) {
          throw new AutopilotCommitConflict('DRAFT_CHANGED', 'Черновик уже удалён, изменён или опубликован.');
        }
      }
      assertNewAutopilotFixture(state, input, autopilotCommit.kind === 'DRAFT' ? autopilotCommit.draftSnapshot.id : undefined);
    }
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
    if (autopilotCommit?.kind === 'SCAN') state.aiAutopilot.totalGeneratedCount += 1;
    if (autopilotCommit?.kind === 'DRAFT') {
      state.aiDrafts = state.aiDrafts.filter((draft) => draft.id !== autopilotCommit.draftSnapshot.id);
    }
    return { pred, settings: state.settings };
  });

  if (input.pushToTelegram) {
    const siteBase = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
    const matchUrl = siteBase ? `${siteBase}/predictions/${created.pred.slug}` : '';
    const priceLabel =
      created.pred.accessTier === 'FREE'
        ? '🎁 Открытый бесплатный разбор (0 ₽)'
        : `🔓 Разовый доступ: ${created.pred.singlePriceRub} ₽${
            created.pred.insuredOnLoss ? ' (🛡 начисление на баланс при минусе или возврате по условиям оферты)' : ''
          }`;
    const msg = [
      `📊 <b>Новый прогноз на ${escapeTelegramHtml(created.settings.brandName)}</b>`,
      `🏆 ${escapeTelegramHtml(created.pred.leagueName)}`,
      `⚔️ <b>${escapeTelegramHtml(created.pred.homeTeam)} — ${escapeTelegramHtml(created.pred.awayTeam)}</b>`,
      `💼 Рекомендуемая ставка: <b>${created.pred.stakeUnits.toFixed(1)}% от банка</b>`,
      `${priceLabel}`,
      ``,
      `${escapeTelegramHtml(created.pred.analysisTeaser)}`,
      `Прогноз не гарантирует выигрыш. Начисления на баланс не возмещают ставку у букмекера.`,
    ].join('\n');
    const telegram = await sendTelegramChannelAnnouncement(
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
    ).catch(() => ({ sent: false as const, outcome: 'unknown' as const, error: 'Нет подтверждения отправки. Проверьте канал перед повтором.' }));
    if (input.authorSource === 'AI_AUTOPILOT') {
      try {
        await mutateState((state) => {
          state.aiLogs.unshift({
            id: `ailog_${randomUUID().slice(0, 8)}`,
            createdAt: new Date().toISOString(),
            level: telegram.sent ? 'SUCCESS' : 'WARN',
            stage: 'PUBLISHER',
            message: telegram.sent
              ? `Telegram подтвердил анонс «${created.pred.homeTeam} — ${created.pred.awayTeam}».`
              : `Прогноз «${created.pred.homeTeam} — ${created.pred.awayTeam}» опубликован на сайте; анонс Telegram не подтверждён: ${telegram.error}`,
          });
        });
      } catch {
        // The site publication already happened. A log failure must not invite a duplicate retry.
      }
    }
  }

  return created.pred;
}

export async function settlePredictionByAdmin(params: {
  predictionId: string;
  resultStatus: ResultStatus;
  finalScore?: string | null;
  cashoutMultiplier?: number | null;
  pushResultToTelegram?: boolean;
  // Automatic workers must not repeat a settlement or its Telegram sends.
  onlyIfPending?: boolean;
  requireAutoSettleEnabled?: boolean;
}): Promise<{ prediction: PredictionRecord; compensatedUsers: number; applied: boolean }> {
  const outcome = await mutateState((state) => {
    const pred = state.predictions.find((p) => p.id === params.predictionId);
    if (!pred) throw new Error('Событие не найдено');
    if ((params.onlyIfPending && pred.resultStatus !== 'PENDING') ||
        (params.requireAutoSettleEnabled && !state.aiAutopilot.autoSettleEnabled)) {
      return { prediction: pred, compensatedUsers: 0, settings: state.settings, applied: false };
    }

    let verifiedFinalScore: string | null = null;
    if (params.resultStatus !== 'PENDING') {
      if (!hasCorroboratedFinalScore(pred)) {
        throw new Error(
          'Ручной расчёт заблокирован: финальный счёт должен быть подтверждён минимум двумя независимыми источниками.',
        );
      }
      const homeScore = pred.liveHomeScore;
      const awayScore = pred.liveAwayScore;
      if (typeof homeScore !== 'number' || typeof awayScore !== 'number') {
        throw new Error('Нет подтверждённого структурированного счёта для расчёта рынка.');
      }
      const evaluatedResult = evaluateMarketByScore(
        pred.selectionTitle,
        homeScore,
        awayScore,
        Boolean(pred.finalScoreIsOvertime),
        pred.sport,
      );
      if (!evaluatedResult || evaluatedResult !== params.resultStatus) {
        throw new Error(
          'Указанный результат не совпадает с автоматически рассчитанным исходом по подтверждённому счёту; расчёт отменён.',
        );
      }
      verifiedFinalScore = `${homeScore}:${awayScore}${
        pred.finalScoreIsOvertime ? ' (ОТ)' : ''
      }`;
      if (params.finalScore?.trim() && params.finalScore.trim() !== verifiedFinalScore) {
        throw new Error('Введённый счёт не совпадает с финальным счётом, подтверждённым источниками.');
      }
    }

    pred.resultStatus = params.resultStatus;
    if (verifiedFinalScore) pred.finalScore = verifiedFinalScore;
    else if (params.finalScore !== undefined && params.resultStatus === 'PENDING') {
      pred.finalScore = params.finalScore?.trim() || null;
    }

    if (params.resultStatus === 'PENDING') {
      pred.matchStatus = 'UPCOMING';
      pred.profitUnits = null;
      pred.profitPercent = null;
      pred.settledAt = null;
      return { prediction: pred, compensatedUsers: 0, settings: state.settings, applied: true };
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
        if (u.telegramBindingVerified && u.telegramChatId && u.purchasedPredictionIds.includes(pred.id)) {
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

        const share = insuranceShareForPrediction(tx, pred.id);
        const buyer = state.users.find((u) => u.id === tx.userId);
        if (buyer && share > 0) {
          buyer.balanceRub += share;
          tx.insuredRefundedPredictionIds = [...alreadyRefundedIds, pred.id];
          tx.insuranceRefundedAmountRub = (tx.insuranceRefundedAmountRub || 0) + share;
          tx.insuranceCredited = true;
          compensatedUsers += 1;
          if (buyer.telegramBindingVerified && buyer.telegramChatId) {
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
      applied: true,
    };
  });

  if (!outcome.applied) {
    return { prediction: outcome.prediction, compensatedUsers: 0, applied: false };
  }

  // Рассылка личных уведомлений покупателям в Telegram
  if (outcome.refundedDmQueue && outcome.refundedDmQueue.length > 0) {
    const p = outcome.prediction;
    for (const item of outcome.refundedDmQueue) {
      const dm = [
        `🛡 <b>Начисление по программе «страховка» (${escapeTelegramHtml(outcome.settings.brandName)})</b>`,
        ``,
        `Результат прогноза «<b>${escapeTelegramHtml(p.homeTeam)} — ${escapeTelegramHtml(p.awayTeam)}</b>»: ${escapeTelegramHtml(p.resultStatus === 'PUSH' ? 'возврат' : 'проигрыш')}${p.finalScore ? `, счёт ${escapeTelegramHtml(p.finalScore)}` : ''}.`,
        `💰 На баланс сайта начислено: <b>+${item.amountRub.toLocaleString('ru-RU')} ₽</b> (текущий баланс: <b>${item.newBalance.toLocaleString('ru-RU')} ₽</b>).`,
        `Начисление не возмещает ставку у букмекера и не заменяет предусмотренный законом денежный возврат.`,
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
        `✅ <b>Ваш прогноз ${p.resultStatus === 'CASHOUT' ? 'досрочно закрыт' : 'рассчитан как выигрыш'} (${escapeTelegramHtml(p.finalScore || 'результат')})</b>`,
        `⚔️ <b>${escapeTelegramHtml(p.homeTeam)} — ${escapeTelegramHtml(p.awayTeam)}</b>`,
        `🎯 Исход: <b>${escapeTelegramHtml(p.selectionTitle)}</b> @ <b>${p.fixedOdds.toFixed(2)}</b>`,
      ].join('\n');
      void sendTelegramDirectMessage(outcome.settings, chatId, dm).catch(
        () => undefined,
      );
    }
  }

  if (params.pushResultToTelegram && params.resultStatus !== 'PENDING' && !isLegacyStarterDemoPrediction(outcome.prediction)) {
    const p = outcome.prediction;
    const badge =
      p.resultStatus === 'WIN' || p.resultStatus === 'CASHOUT'
        ? `✅ <b>ПОБЕДА (${escapeTelegramHtml(p.finalScore || 'расчёт')})</b> · +${(p.profitUnits ?? 0).toFixed(2)}% к банку`
        : p.resultStatus === 'PUSH'
          ? `➖ <b>ВОЗВРАТ (${escapeTelegramHtml(p.finalScore || 'расчёт')})</b>${
              outcome.compensatedUsers > 0 ? ' · Начисления по условиям оферты на баланс сайта' : ''
            }`
          : `❌ <b>МИНУС (${escapeTelegramHtml(p.finalScore || 'расчёт')})</b>${
              outcome.compensatedUsers > 0
                ? ' · 🛡 Начисления по условиям оферты на баланс сайта'
                : ''
            }`;

    const siteBase = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
    const statsUrl = siteBase ? `${siteBase}/stats` : '';
    const msg = [
      badge,
      `⚽️ <b>${escapeTelegramHtml(p.homeTeam)} — ${escapeTelegramHtml(p.awayTeam)}</b> (${escapeTelegramHtml(p.leagueName)})`,
      `🎯 Исход: <b>${escapeTelegramHtml(p.selectionTitle)}</b> @ <b>${p.fixedOdds.toFixed(2)}</b>`,
      `🔐 Отпечаток SHA-256: <code>${p.verificationHash.slice(0, 16)}…</code>`,
    ].join('\n');
    const telegram = await sendTelegramChannelAnnouncement(
      outcome.settings,
      msg,
      statsUrl ? { text: '📊 Проверить всю статистику →', url: statsUrl } : undefined,
    ).catch(() => ({ sent: false as const, outcome: 'unknown' as const, error: 'Нет подтверждения отправки. Проверьте канал перед повтором.' }));
    try {
      await mutateState((state) => {
        state.aiLogs.unshift({
          id: `ailog_${randomUUID().slice(0, 8)}`,
          createdAt: new Date().toISOString(),
          level: telegram.sent ? 'SUCCESS' : 'WARN',
          stage: 'SETTLEMENT',
          message: telegram.sent
            ? `Telegram подтвердил сообщение о результате «${p.homeTeam} — ${p.awayTeam}».`
            : `Результат «${p.homeTeam} — ${p.awayTeam}» рассчитан на сайте; сообщение Telegram не подтверждено: ${telegram.error}`,
        });
      });
    } catch {
      // The result and balance credits have already committed; never retry them here.
    }
  }

  return {
    prediction: outcome.prediction,
    compensatedUsers: outcome.compensatedUsers,
    applied: true,
  };
}

export function computeAiPerformanceStats(
  predictions: PredictionRecord[],
): AiPerformanceStats {
  // An AI_AUTOPILOT label alone is not evidence of model analysis.
  const aiItems = predictions.filter((prediction) => !isLegacyStarterDemoPrediction(prediction) && hasAiCommitteeProvenance(prediction));
  const settled = aiItems.filter(hasVerifiedSettledResult);
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
