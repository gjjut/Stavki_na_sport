import type { PredictionCardData, SportType } from '@/components/predictions/PredictionCard';

export interface SecretPickVaultItem {
  selectionTitle: string;
  fixedOdds: number;
  minAcceptableOdds: number | null;
  analysisFull: string;
}

export interface VerifiedStatsSnapshot {
  periodLabel: string;
  roiBankrollPct: number;
  yieldPct: number;
  winRatePct: number;
  avgOdds: number;
  netProfitUnits: number;
  settledBets: number;
  wins: number;
  losses: number;
  pushes: number;
  cashouts: number;
  currentWinStreak: number;
  maxDrawdownPct: number;
}

export interface EquityPoint {
  month: string;
  label: string;
  profitUnits: number;
  cumulativeBankPct: number;
  betsCount: number;
  yieldPct: number;
}

export interface CrmUserRow {
  id: string;
  name: string;
  email: string;
  telegram: string;
  planLabel: string;
  spentRub: number;
  status: 'ACTIVE' | 'BLOCKED';
  lastActive: string;
}

export interface AffiliatePartnerRow {
  id: string;
  webmaster: string;
  code: string;
  source: string;
  clicks: number;
  registrations: number;
  buyers: number;
  revenueRub: number;
  revsharePct: number;
}

export const STATS_BY_PERIOD: Record<'ALL_TIME' | 'MONTH' | 'WEEK', VerifiedStatsSnapshot> = {
  ALL_TIME: {
    periodLabel: 'За 12 месяцев',
    roiBankrollPct: 84.6,
    yieldPct: 11.4,
    winRatePct: 61.8,
    avgOdds: 1.94,
    netProfitUnits: 84.6,
    settledBets: 412,
    wins: 238,
    losses: 147,
    pushes: 18,
    cashouts: 9,
    currentWinStreak: 6,
    maxDrawdownPct: 7.4,
  },
  MONTH: {
    periodLabel: 'За 30 дней',
    roiBankrollPct: 14.8,
    yieldPct: 13.9,
    winRatePct: 64.7,
    avgOdds: 1.96,
    netProfitUnits: 14.8,
    settledBets: 54,
    wins: 33,
    losses: 18,
    pushes: 2,
    cashouts: 1,
    currentWinStreak: 6,
    maxDrawdownPct: 3.5,
  },
  WEEK: {
    periodLabel: 'За 7 дней',
    roiBankrollPct: 6.45,
    yieldPct: 18.4,
    winRatePct: 71.4,
    avgOdds: 1.93,
    netProfitUnits: 6.45,
    settledBets: 15,
    wins: 10,
    losses: 4,
    pushes: 1,
    cashouts: 0,
    currentWinStreak: 6,
    maxDrawdownPct: 1.5,
  },
};

export const EQUITY_CURVE_MONTHS: EquityPoint[] = [
  { month: '2025-12', label: 'Дек', profitUnits: 5.4, cumulativeBankPct: 105.4, betsCount: 34, yieldPct: 8.9 },
  { month: '2026-01', label: 'Янв', profitUnits: 7.2, cumulativeBankPct: 112.6, betsCount: 38, yieldPct: 10.6 },
  { month: '2026-02', label: 'Фев', profitUnits: -2.1, cumulativeBankPct: 110.5, betsCount: 29, yieldPct: -3.8 },
  { month: '2026-03', label: 'Мар', profitUnits: 9.6, cumulativeBankPct: 120.1, betsCount: 41, yieldPct: 12.8 },
  { month: '2026-04', label: 'Апр', profitUnits: 8.3, cumulativeBankPct: 128.4, betsCount: 36, yieldPct: 11.9 },
  { month: '2026-05', label: 'Май', profitUnits: 6.9, cumulativeBankPct: 135.3, betsCount: 33, yieldPct: 10.4 },
  { month: '2026-06', label: 'Июн', profitUnits: 4.5, cumulativeBankPct: 139.8, betsCount: 24, yieldPct: 9.8 },
  { month: '2026-07', label: 'Июл', profitUnits: 7.8, cumulativeBankPct: 147.6, betsCount: 31, yieldPct: 12.5 },
  { month: '2026-08', label: 'Авг', profitUnits: 10.4, cumulativeBankPct: 158.0, betsCount: 39, yieldPct: 14.1 },
  { month: '2026-09', label: 'Сен', profitUnits: 11.8, cumulativeBankPct: 169.8, betsCount: 42, yieldPct: 14.6 },
  { month: '2026-10', label: 'Окт', profitUnits: 8.35, cumulativeBankPct: 178.15, betsCount: 37, yieldPct: 11.7 },
  { month: '2026-11', label: 'Ноя', profitUnits: 6.45, cumulativeBankPct: 184.6, betsCount: 28, yieldPct: 13.9 },
];

export function createInitialPredictions(nowMs: number): {
  cards: PredictionCardData[];
  vault: Record<string, SecretPickVaultItem>;
} {
  const in38Min = new Date(nowMs + 38 * 60 * 1000).toISOString();
  const in3Hours = new Date(nowMs + 3 * 3600 * 1000 + 20 * 60 * 1000).toISOString();
  const started40MinAgo = new Date(nowMs - 40 * 60 * 1000).toISOString();
  const yesterday = new Date(nowMs - 20 * 3600 * 1000).toISOString();
  const twoDaysAgo = new Date(nowMs - 44 * 3600 * 1000).toISOString();
  const threeDaysAgo = new Date(nowMs - 68 * 3600 * 1000).toISOString();

  const vault: Record<string, SecretPickVaultItem> = {
    pred_khl_1: {
      selectionTitle: 'Индивидуальный тотал 1-й Больше (2.5)',
      fixedOdds: 1.98,
      minAcceptableOdds: 1.86,
      analysisFull:
        '1. У гостей бэкап-вратарь впервые за 3 недели выходит в старте против топ-2 спецбригады большинства Востока.\n2. По xG в равных составах хозяева создают 3.18 ожидаемых шайб за игру дома.\n3. Справедливый кэф по пиннакл-модели — 1.80, забираем перевес +9.1% над маржой.',
    },
    pred_cs2_2: {
      selectionTitle: 'Фора по картам: Team Spirit (-1.5)',
      fixedOdds: 2.06,
      minAcceptableOdds: 1.92,
      analysisFull:
        'Маппул соперника вынуждает банить Ancient в первой фазе, оставляя открытыми Nuke и Mirage (винрейт Spirit за 3 месяца — 84% и 79%). По пистолетным раундам перевес +14%.',
    },
    pred_ucl_live: {
      selectionTitle: 'Азиатская фора 1 (-1.0)',
      fixedOdds: 1.91,
      minAcceptableOdds: 1.82,
      analysisFull:
        'Интенсивность прессинга PPDA у хозяев — 7.4, у гостей травмирован опорный полузащитник. Ставка зафиксирована по ранней линии за 6 часов до стартового свистка.',
    },
  };

  const cards: PredictionCardData[] = [
    {
      id: 'pred_khl_1',
      slug: 'lokomotiv-ska-khl',
      sport: 'HOCKEY',
      leagueName: 'КХЛ · Регулярный чемпионат',
      homeTeam: 'Локомотив',
      awayTeam: 'СКА',
      matchStartsAt: in38Min, // Менее 60 мин -> сработает огненный FOMO-индикатор!
      matchStatus: 'UPCOMING',
      stakePercent: 2.0,
      stakeUnits: 2.0,
      bookmakerSource: 'Pinnacle / Фонбет',
      analysisTeaser:
        'Подтверждена замена стартового вратаря гостей на утренней раскатке. Перевес по модели xG спецбригад +9.1% к текущей линии.',
      isLocked: true,
      accessTier: 'PAID_SINGLE',
      singlePriceRub: 790,
      selectionTitle: null,
      fixedOdds: null,
      minAcceptableOdds: null,
      analysisFull: null,
      resultStatus: 'PENDING',
      finalScore: null,
      profitUnits: null,
      profitPercent: null,
      verificationHash: '9f84c2e1b7a6054d8e321a90c4f78d1e52a9b30c71e84d2a6f91c0b3e47d82a1',
      oddsLockedAt: new Date(nowMs - 2 * 3600 * 1000).toISOString(),
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
      isLocked: true,
      accessTier: 'PAID_SINGLE',
      singlePriceRub: 890,
      selectionTitle: null,
      fixedOdds: null,
      minAcceptableOdds: null,
      analysisFull: null,
      resultStatus: 'PENDING',
      finalScore: null,
      profitUnits: null,
      profitPercent: null,
      verificationHash: '4a71e9b0c3d825f1609e4b7c2d8a19f3e60b5c4d7a2198f0e3c6b5a491827364',
      oddsLockedAt: new Date(nowMs - 3 * 3600 * 1000).toISOString(),
    },
    {
      id: 'pred_ucl_live',
      slug: 'arsenal-inter-ucl',
      sport: 'FOOTBALL',
      leagueName: 'Лига Чемпионов УЕФА',
      homeTeam: 'Арсенал',
      awayTeam: 'Интер',
      matchStartsAt: started40MinAgo,
      matchStatus: 'LIVE',
      stakePercent: 2.0,
      stakeUnits: 2.0,
      bookmakerSource: 'Pinnacle',
      analysisTeaser:
        'Прогноз взят по утренней линии до просадки кэфа на 0.18 пункта. Доступен внутри VIP-подписки.',
      isLocked: true,
      accessTier: 'VIP_ONLY',
      singlePriceRub: null,
      selectionTitle: null,
      fixedOdds: null,
      minAcceptableOdds: null,
      analysisFull: null,
      resultStatus: 'PENDING',
      finalScore: '1:0 (41\')',
      profitUnits: null,
      profitPercent: null,
      verificationHash: '7c2e91f4a08b36d51e92c4a7b80d3f6e15a29c8b4d70e1f3a6c92b5d80e471a9',
      oddsLockedAt: new Date(nowMs - 7 * 3600 * 1000).toISOString(),
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
      isLocked: false,
      accessTier: 'PAID_SINGLE',
      singlePriceRub: 790,
      selectionTitle: 'Фора 1 по геймам (-3.5)',
      fixedOdds: 2.08,
      minAcceptableOdds: 1.95,
      analysisFull:
        'Процент выигрыша первой подачи Синнера на индоре — 83.4%, при этом процент двойных ошибок соперника за турнир превысил 7.2%. Зафиксировали 2.08 за 8 часов до игры (к старту линия упала до 1.87). Уверенный заход 6:3, 6:4.',
      resultStatus: 'WIN',
      finalScore: '2:0 (6:3, 6:4)',
      profitUnits: 2.16,
      profitPercent: 2.16,
      verificationHash: '1e8b4d92a7c305f6819a2e4c7b0d5f3e92a1c6b84d70f3e1a5c92b4d80e673c2',
      oddsLockedAt: new Date(nowMs - 28 * 3600 * 1000).toISOString(),
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
      isLocked: false,
      accessTier: 'VIP_ONLY',
      singlePriceRub: null,
      selectionTitle: 'Победа 1 с форой (0)',
      fixedOdds: 2.02,
      minAcceptableOdds: 1.9,
      analysisFull:
        'При счете 1:0 на 74-й минуте хозяева получили красную карточку. В VIP-боте мгновенно вышел сигнал на Cashout с множителем 1.55 — зафиксировали чистые +1.10 u без валидола в концовке (матч закончился 1:1).',
      resultStatus: 'CASHOUT',
      finalScore: '1:1 (Cashout при 1:0)',
      profitUnits: 1.1,
      profitPercent: 1.1,
      verificationHash: '6d3a90f2c4e817b50a92d4c7e81f3b6a05c29d8e4b71f0a3c6e92d5b80a471f8',
      oddsLockedAt: new Date(nowMs - 52 * 3600 * 1000).toISOString(),
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
      isLocked: false,
      accessTier: 'PAID_SINGLE',
      singlePriceRub: 790,
      selectionTitle: 'Тотал меньше (5.5)',
      fixedOdds: 1.94,
      minAcceptableOdds: 1.85,
      analysisFull:
        'Две шайбы в пустые ворота на 59-й минуте пробили тотал. Благодаря строгому флэту 1.5% убыток составил контролируемые -1.50 u, которые были перекрыты следующей же победной серией.',
      resultStatus: 'LOSS',
      finalScore: '3:4',
      profitUnits: -1.5,
      profitPercent: -1.5,
      verificationHash: '3b91e4c7a08d26f51c92e4a7d80b3f6c15e29a8d4b70c1f3e6a92d5b80c471e3',
      oddsLockedAt: new Date(nowMs - 75 * 3600 * 1000).toISOString(),
    },
  ];

  return { cards, vault };
}

export const SOCIAL_PROOF_FEED: Array<{
  id: string;
  name: string;
  city: string;
  sport: SportType;
  sportLabel: string;
  wonRub: number;
  timeAgo: string;
}> = [
  { id: 'sp1', name: 'Иван', city: 'Москва', sport: 'HOCKEY', sportLabel: 'Хоккей (КХЛ)', wonRub: 15_400, timeAgo: '2 мин. назад' },
  { id: 'sp2', name: 'Алексей', city: 'Красноярск', sport: 'TENNIS', sportLabel: 'Теннис (ATP)', wonRub: 10_800, timeAgo: '6 мин. назад' },
  { id: 'sp3', name: 'Дмитрий', city: 'Санкт-Петербург', sport: 'ESPORTS', sportLabel: 'CS2 Major', wonRub: 22_500, timeAgo: '11 мин. назад' },
  { id: 'sp4', name: 'Руслан', city: 'Казань', sport: 'FOOTBALL', sportLabel: 'Лига Чемпионов', wonRub: 18_200, timeAgo: '17 мин. назад' },
];

export const INITIAL_CRM_USERS: CrmUserRow[] = [
  { id: 'u1', name: 'Максим Воронов', email: 'm.voronov@mail.ru', telegram: '@max_bettor', planLabel: 'VIP 30 дней (Авто)', spentRub: 14_970, status: 'ACTIVE', lastActive: 'Онлайн' },
  { id: 'u2', name: 'Артем Соколов', email: 'sokolov.khl@yandex.ru', telegram: '@artem_sokol', planLabel: 'Разовые покупки (3)', spentRub: 2_370, status: 'ACTIVE', lastActive: '14 мин. назад' },
  { id: 'u3', name: 'Денис Кравцов', email: 'denis.resell@gmail.com', telegram: '@skladchina_bot', planLabel: 'Без подписки', spentRub: 790, status: 'BLOCKED', lastActive: 'Вчера (Попытка слива)' },
  { id: 'u4', name: 'Илья Громов', email: 'ilya.vip@bk.ru', telegram: '@gromov_pro', planLabel: 'VIP Навсегда', spentRub: 24_900, status: 'ACTIVE', lastActive: '38 мин. назад' },
];

export const INITIAL_AFFILIATES: AffiliatePartnerRow[] = [
  { id: 'af1', webmaster: 'TG «Шайба Инсайд»', code: 'khl_insider', source: 'Telegram посевы', clicks: 4_820, registrations: 612, buyers: 94, revenueRub: 468_500, revsharePct: 40 },
  { id: 'af2', webmaster: 'YouTube «xG Разбор»', code: 'xg_analytics', source: 'YouTube интеграции', clicks: 3_190, registrations: 405, buyers: 61, revenueRub: 312_000, revsharePct: 35 },
  { id: 'af3', webmaster: 'SeoBet ArbTeam', code: 'cs2_major_vip', source: 'Контекст + Дорвеи', clicks: 7_450, registrations: 530, buyers: 52, revenueRub: 219_800, revsharePct: 30 },
];
