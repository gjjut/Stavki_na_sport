export type UserRole = 'USER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'BLOCKED';

export type SportType =
  | 'FOOTBALL'
  | 'HOCKEY'
  | 'TENNIS'
  | 'ESPORTS'
  | 'BASKETBALL'
  | 'MMA';

export type MatchStatus = 'UPCOMING' | 'LIVE' | 'FINISHED';
export type MatchLifecycleStatus =
  | 'SCHEDULED'
  | 'LIVE'
  | 'FINISHED'
  | 'POSTPONED'
  | 'CANCELLED'
  | 'UNKNOWN';
export type VerificationPrecision = 'SOURCE_EXACT' | 'LIVE_OBSERVED' | 'FINAL_OBSERVED';
export type ResultStatus = 'PENDING' | 'WIN' | 'LOSS' | 'PUSH' | 'CASHOUT';
export type AccessTier = 'FREE' | 'PAID_SINGLE';

export interface UserAccount {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  city: string;
  role: UserRole;
  status: UserStatus;
  balanceRub: number;
  referenceBankrollRub: number;
  telegramUsername: string | null;
  telegramChatId?: string | null;
  telegramLinkCode?: string;
  passwordResetCode?: string | null;
  passwordResetExpiresAt?: string | null;
  purchasedPredictionIds: string[];

  // Партнерская программа (реферальные отчисления с разовых и пакетных покупок)
  referralCode: string;
  referredByUserId: string | null;
  referredByCode: string | null;
  revsharePercent: number;
  affiliateBalanceRub: number;
  affiliateTotalEarnedRub: number;

  createdAt: string;
  lastLoginAt: string;
}

export interface SafeSessionUser {
  id: string;
  email: string;
  displayName: string;
  city: string;
  role: UserRole;
  status: UserStatus;
  balanceRub: number;
  referenceBankrollRub: number;
  telegramUsername: string | null;
  telegramChatId: string | null;
  telegramLinkCode: string;
  purchasedPredictionIds: string[];
  referralCode: string;
  revsharePercent: number;
  affiliateBalanceRub: number;
  affiliateTotalEarnedRub: number;
}

export interface PredictionRecord {
  id: string;
  slug: string;
  sport: SportType;
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
  homeLogoUrl?: string | null;
  awayLogoUrl?: string | null;
  fonbetHomeTeamId?: number | null;
  fonbetAwayTeamId?: number | null;
  matchStartsAt: string;
  matchStatus: MatchStatus;
  matchLifecycleStatus?: MatchLifecycleStatus;
  actualStartedAt?: string | null;
  actualStartedAtPrecision?: VerificationPrecision | null;
  actualFinishedAt?: string | null;
  actualFinishedAtPrecision?: VerificationPrecision | null;
  matchVerifiedAt?: string | null;
  matchVerificationSource?: string | null;
  matchVerificationConflict?: boolean;
  finalScoreVerified?: boolean;
  finalScoreVerifiedSources?: string[];
  finalScoreIsOvertime?: boolean;
  liveHomeScore?: number | null;
  liveAwayScore?: number | null;
  liveUpdatedAt?: string | null;
  stakePercent: number;
  stakeUnits: number;
  bookmakerSource: string;
  analysisTeaser: string;
  isFeatured?: boolean;
  authorSource?: 'HUMAN' | 'AI_AUTOPILOT';
  externalFixtureId?: string | null;
  aiConfidencePct?: number | null;
  aiEdgePct?: number | null;
  researchSummary?: string | null;
  researchSources?: string[];
  agentReport?: string | null;

  // Гарантия возврата стоимости на баланс сайта при минусе или возврате (PUSH)
  insuredOnLoss?: boolean;

  // Секретные поля прогноза (никогда не уходят в JSON до покупки или завершения матча)
  selectionTitle: string;
  fixedOdds: number;
  minAcceptableOdds: number | null;
  analysisFull: string;

  accessTier: AccessTier;
  singlePriceRub: number | null;
  revealAfterFinish: boolean;

  resultStatus: ResultStatus;
  cashoutMultiplier: number | null;
  finalScore: string | null;
  profitUnits: number | null;
  profitPercent: number | null;

  verificationHash: string;
  oddsLockedAt: string;
  settledAt: string | null;
  createdAt: string;
}

export interface PublicPredictionDto {
  id: string;
  slug: string;
  sport: SportType;
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
  homeLogoUrl?: string | null;
  awayLogoUrl?: string | null;
  matchStartsAt: string;
  matchStatus: MatchStatus;
  matchLifecycleStatus?: MatchLifecycleStatus;
  actualStartedAt?: string | null;
  actualStartedAtPrecision?: VerificationPrecision | null;
  actualFinishedAt?: string | null;
  actualFinishedAtPrecision?: VerificationPrecision | null;
  matchVerifiedAt?: string | null;
  matchVerificationSource?: string | null;
  matchVerificationConflict?: boolean;
  finalScoreVerified?: boolean;
  stakePercent: number;
  stakeUnits: number;
  bookmakerSource: string;
  analysisTeaser: string;
  isFeatured: boolean;
  insuredOnLoss: boolean;
  salesClosed: boolean;
  isLocked: boolean;
  isPurchased: boolean;
  accessTier: AccessTier;
  singlePriceRub: number | null;
  selectionTitle: string | null;
  fixedOdds: number | null;
  minAcceptableOdds: number | null;
  analysisFull: string | null;
  resultStatus: ResultStatus;
  finalScore: string | null;
  profitUnits: number | null;
  profitPercent: number | null;
  verificationHash: string;
  oddsLockedAt: string;
  settledAt: string | null;
  researchSources?: string[];
  agentReport?: string | null;
  liveHomeScore?: number | null;
  liveAwayScore?: number | null;
  liveUpdatedAt?: string | null;
}

export interface PromoCodeRecord {
  id: string;
  code: string;
  discountPercent: number; // 5..90
  maxUses: number;
  usedCount: number;
  active: boolean;
  createdAt: string;
}

export interface OrderTransaction {
  id: string;
  idempotenceKey: string;
  externalPaymentId: string;
  userId: string;
  userEmail: string;
  kind: 'SINGLE_PREDICTION' | 'BUNDLE_PREDICTIONS' | 'BALANCE_TOPUP';
  predictionId: string | null;
  predictionIds: string[];
  promoCode: string | null;
  discountRub: number;
  title: string;
  amountRub: number;
  paymentMethod: 'yookassa' | 'internal_balance';
  status: 'PENDING' | 'SUCCEEDED' | 'CANCELED' | 'REFUNDED';
  insuranceCredited?: boolean;
  insuredRefundedPredictionIds?: string[];
  insuranceRefundedAmountRub?: number;
  receiptEmail: string;
  confirmationUrl: string | null;
  affiliateUserId: string | null;
  affiliateCommissionRub: number;
  createdAt: string;
  paidAt: string | null;
}

export interface AffiliateLinkRecord {
  id: string;
  userId: string;
  userEmail: string;
  code: string;
  label: string;
  clicks: number;
  registrations: number;
  buyers: number;
  revenueRub: number;
  createdAt: string;
}

export interface PayoutRequestRecord {
  id: string;
  userId: string;
  userEmail: string;
  amountRub: number;
  method: 'SBP' | 'CARD' | 'USDT_TRC20';
  requisites: string;
  status: 'PENDING' | 'PAID' | 'REJECTED';
  createdAt: string;
  processedAt: string | null;
}

export type AffiliatePayoutRequest = PayoutRequestRecord;

export interface PlatformSettings {
  brandName: string;
  supportTelegram: string;
  freeTelegramUrl: string;
  legalSellerName: string;
  legalInn: string;
  supportEmail: string;

  paymentMode: 'TEST_INSTANT' | 'YOOKASSA_LIVE';
  yookassaShopId: string;
  yookassaSecretKey: string;
  yookassaVatCode: number;
  defaultSinglePriceRub: number;
  bundle2DiscountPct: number; // Скидка за 2 события в корзине (напр. 15%)
  bundle3DiscountPct: number; // Скидка за 3+ событий в корзине (напр. 25%)

  telegramBotToken: string;
  telegramChannelId: string;
  telegramBotUsername?: string;
  yandexMetrikaId?: string;
}

export interface StatsSummary {
  period: 'WEEK' | 'MONTH' | 'ALL_TIME';
  settledCount: number;
  wins: number;
  losses: number;
  pushes: number;
  cashouts: number;
  winRatePct: number;
  avgOdds: number;
  turnoverUnits: number;
  netProfitUnits: number;
  yieldPct: number;
  roiBankrollPct: number;
  currentWinStreak: number;
  maxDrawdownPct: number;
}

export interface SportBreakdownItem {
  sport: SportType;
  bets: number;
  winRatePct: number;
  profitUnits: number;
  yieldPct: number;
}

export interface RecentWinFeedItem {
  id: string;
  name: string;
  city: string;
  sport: SportType;
  wonRub: number;
  matchTitle: string;
}

export interface EquityPoint {
  month: string;
  label: string;
  profitUnits: number;
  cumulativeBankPct: number;
  betsCount: number;
  yieldPct: number;
}

export type AiAutopilotMode = 'OFF' | 'MODERATION' | 'FULL_AUTOPILOT';

export type AiLlmProvider =
  | 'PLUSVIBE'
  | 'OLLAMA'
  | 'ORCAROUTER'
  | 'DEEPSEEK'
  | 'OPENROUTER'
  | 'RU_GATEWAY'
  | 'GEMINI'
  | 'OPENAI'
  | 'BUILTIN_QUANT';

export interface AiAutopilotConfig {
  mode: AiAutopilotMode;
  llmProvider: AiLlmProvider;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  sportsEnabled: SportType[];
  morningHourMsk: number; // напр. 9 (09:00 МСК)
  eveningHourMsk: number; // напр. 18 (18:00 МСК)
  maxPicksPerRun: number; // сколько событий публиковать за слот (напр. 3)
  minActiveOnStorefront: number; // минимум активных карточек на витрине (напр. 6)
  minValueEdgePct: number; // минимальный математический перевес EV% (напр. 3.5)
  defaultAiPriceRub: number; // цена разового прогноза от ИИ (₽)
  freeEveryNthPick: number; // 0 = только платные, 4 = каждый 4-й открытый для привлечения
  insureAiPicks: boolean; // включать ли страховку 100% на баланс при минусе
  autoSettleEnabled: boolean; // автопроверка счета после матча + выплата страховки
  openSourceResearchEnabled?: boolean; // сбор новостей, травм, турнирной таблицы и формы из открытых источников перед отбором
  minAgentConfidencePct?: number; // минимальный консенсус команды (по умолчанию 70)
  requireAgentConsensus?: boolean; // не публиковать без согласия специализированных агентов
  cronSecret: string;
  totalGeneratedCount: number;
  lastFeedSource: string | null;
  lastMorningRunDate: string | null;
  lastEveningRunDate: string | null;
  lastScanAt: string | null;
  lastSettleAt: string | null;
}

export interface AiConnectorDiagnosticItem {
  name: string;
  ok: boolean;
  latencyMs: number;
  details: string;
}

export interface AiDiagnosticsSampleMatch {
  leagueName: string;
  matchTitle: string;
  startsAtFormatted: string;
  market: string;
  odds: number;
  source: string;
}

export interface AiDiagnosticsReport {
  checkedAt: string;
  mskTimeFormatted: string;
  nextSlotLabel: string;
  items: AiConnectorDiagnosticItem[];
  sampleMatches?: AiDiagnosticsSampleMatch[];
}

export interface AiPredictionDraft {
  id: string;
  externalFixtureId: string;
  sport: SportType;
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
  homeLogoUrl?: string | null;
  awayLogoUrl?: string | null;
  matchStartsAt: string;
  selectionTitle: string;
  fixedOdds: number;
  stakeUnits: number;
  bookmakerSource: string;
  accessTier: AccessTier;
  singlePriceRub: number | null;
  insuredOnLoss: boolean;
  confidencePct: number;
  valueEdgePct: number;
  analysisTeaser: string;
  analysisFull: string;
  researchSummary?: string;
  researchSources?: string[];
  agentReport?: string | null;
  fonbetHomeTeamId?: number | null;
  fonbetAwayTeamId?: number | null;
  createdAt: string;
}

export interface AiChatExecutedAction {
  tool: string;
  summary: string;
  ok: boolean;
}

export interface AiChatErrorDiagnostic {
  code: string;
  title: string;
  technicalDetails: string;
  solutions: string[];
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  modelLabel?: string;
  executedActions?: AiChatExecutedAction[];
  diagnostic?: AiChatErrorDiagnostic;
  createdAt: string;
}

export interface AiAutopilotLogEntry {
  id: string;
  createdAt: string;
  level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR';
  stage:
    | 'SCANNER'
    | 'LLM_ANALYST'
    | 'PUBLISHER'
    | 'SETTLEMENT'
    | 'MATCH_WATCH'
    | 'AGENTS';
  message: string;
}

export interface AiPerformanceStats {
  totalAiPredictions: number;
  settledAiPredictions: number;
  wins: number;
  losses: number;
  pushes: number;
  winRatePct: number;
  netProfitUnits: number;
  yieldPct: number;
}
