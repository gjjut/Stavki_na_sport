export type UserRole = 'USER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'BLOCKED';

export type SportType = 'FOOTBALL' | 'HOCKEY' | 'TENNIS' | 'ESPORTS' | 'BASKETBALL' | 'MMA';
export type MatchStatus = 'UPCOMING' | 'LIVE' | 'FINISHED';
export type ResultStatus = 'PENDING' | 'WIN' | 'LOSS' | 'PUSH' | 'CASHOUT';
export type AccessTier = 'FREE' | 'PAID_SINGLE' | 'VIP_ONLY';
export type PlanCode = 'VIP_7D' | 'VIP_30D' | 'VIP_LIFETIME';

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

  // Подписка пользователя
  vipExpiresAt: string | null; // ISO date или 'LIFETIME' или null
  vipPlanName: string | null;
  autoRenew: boolean;
  vipInviteLink: string | null;
  purchasedPredictionIds: string[];

  // Партнерская программа (каждый юзер может быть партнером, админ может менять %)
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
  hasActiveVip: boolean;
  vipExpiresAt: string | null;
  vipPlanName: string | null;
  autoRenew: boolean;
  vipInviteLink: string | null;
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
  matchStartsAt: string;
  matchStatus: MatchStatus;
  stakePercent: number;
  stakeUnits: number;
  bookmakerSource: string;
  analysisTeaser: string;

  // Секретные поля прогноза (никогда не уходят на клиент до покупки/VIP или расчета)
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
  matchStartsAt: string;
  matchStatus: MatchStatus;
  stakePercent: number;
  stakeUnits: number;
  bookmakerSource: string;
  analysisTeaser: string;
  isLocked: boolean;
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
}

export interface TariffPlan {
  code: PlanCode;
  name: string;
  subtitle: string;
  durationDays: number | null; // null = Навсегда
  priceRub: number;
  oldPriceRub: number;
  supportsAutoRenew: boolean;
  popular: boolean;
  features: string[];
}

export interface OrderTransaction {
  id: string;
  idempotenceKey: string;
  externalPaymentId: string;
  userId: string;
  userEmail: string;
  kind: 'SINGLE_PREDICTION' | 'VIP_SUBSCRIPTION' | 'BALANCE_TOPUP';
  predictionId: string | null;
  planCode: PlanCode | null;
  title: string;
  amountRub: number;
  paymentMethod: 'yookassa' | 'internal_balance';
  status: 'PENDING' | 'SUCCEEDED' | 'CANCELED' | 'REFUNDED';
  receiptEmail: string;
  autoRenew: boolean;
  confirmationUrl: string | null;
  vipInviteLink: string | null;
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

  telegramBotToken: string;
  telegramVipChannelId: string;
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

export type AffiliatePayoutRequest = PayoutRequestRecord;

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
