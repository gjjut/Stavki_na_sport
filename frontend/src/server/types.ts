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
  purchasedPredictionIds: string[];

  // Партнерская программа (реферальные отчисления с разовых покупок)
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
  isFeatured?: boolean;

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
  matchStartsAt: string;
  matchStatus: MatchStatus;
  stakePercent: number;
  stakeUnits: number;
  bookmakerSource: string;
  analysisTeaser: string;
  isFeatured: boolean;
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
}

export interface OrderTransaction {
  id: string;
  idempotenceKey: string;
  externalPaymentId: string;
  userId: string;
  userEmail: string;
  kind: 'SINGLE_PREDICTION' | 'BALANCE_TOPUP';
  predictionId: string | null;
  title: string;
  amountRub: number;
  paymentMethod: 'yookassa' | 'internal_balance';
  status: 'PENDING' | 'SUCCEEDED' | 'CANCELED' | 'REFUNDED';
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

  telegramBotToken: string;
  telegramChannelId: string;
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
