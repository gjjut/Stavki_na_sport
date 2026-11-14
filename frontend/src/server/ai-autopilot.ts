import { randomUUID } from 'node:crypto';
import {
  createPredictionByAdmin,
  mutateState,
  readState,
  settlePredictionByAdmin,
} from './database';
import {
  gatherMatchOpenSourceIntel,
  type OpenSourceMatchIntel,
} from './ai-research';
import { sendTelegramChannelAnnouncement } from './integrations';
import { runAgentCommittee, buildAgentAnalysis, type AgentCandidateInput } from './ai-agents';
import { normalizeFonbetTeamImageUrl } from './fonbet-team-logos';
import {
  localizeTeamName,
  matchTeamPairOrder,
} from './team-names';
import type {
  AccessTier,
  AiAutopilotConfig,
  AiAutopilotLogEntry,
  AiConnectorDiagnosticItem,
  AiDiagnosticsReport,
  AiDiagnosticsSampleMatch,
  AiPredictionDraft,
  MatchLifecycleStatus,
  PredictionRecord,
  ResultStatus,
  SportType,
} from './types';

interface ScannedFixtureCandidate {
  externalFixtureId: string;
  sport: SportType;
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamEn?: string | null;
  awayTeamEn?: string | null;
  homeLogoUrl?: string | null;
  awayLogoUrl?: string | null;
  fonbetHomeTeamId?: number | null;
  fonbetAwayTeamId?: number | null;
  matchStartsAt: string;
  bookmakerSource: string;
  homeOdds: number;
  drawOdds: number | null;
  awayOdds: number;
  totalLine: number | null;
  overOdds: number | null;
  underOdds: number | null;
  contextNotes: string;
  suggestedMarket: string;
  suggestedOdds: number;
  valueEdgePct: number;
  confidencePct: number;
  priorityBonus: number;
}

const RU_BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.7',
};

const STATIC_FONBET_LINE_HOSTS = [
  'https://line51w.bk6bba-resources.com',
  'https://line52w.bk6bba-resources.com',
  'https://line01w.bk6bba-resources.com',
  'https://line02w.bk6bba-resources.com',
  'https://line04w.bk6bba-resources.com',
  'https://line07w.bk6bba-resources.com',
  'https://line31w.bk6bba-resources.com',
  'https://line11.bk6bba-resources.com',
];

const STATIC_FONBET_RESULTS_HOSTS = [
  'https://clientsapi01w.bk6bba-resources.com',
  'https://clientsapi02w.bk6bba-resources.com',
  'https://clientsapi51w.bk6bba-resources.com',
];

const ESPN_ENDPOINTS: Array<{
  sport: SportType;
  url: string;
  leagueRu: string;
  bonus: number;
}> = [
  {
    sport: 'FOOTBALL',
    url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/rus.1/scoreboard',
    leagueRu: 'Россия · Мир РПЛ',
    bonus: 3.0,
  },
  {
    sport: 'FOOTBALL',
    url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard',
    leagueRu: 'Лига Чемпионов УЕФА',
    bonus: 2.6,
  },
  {
    sport: 'FOOTBALL',
    url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa/scoreboard',
    leagueRu: 'Лига Европы УЕФА',
    bonus: 2.0,
  },
  {
    sport: 'FOOTBALL',
    url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard',
    leagueRu: 'Англия · Премьер-лига',
    bonus: 2.2,
  },
  {
    sport: 'FOOTBALL',
    url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard',
    leagueRu: 'Испания · Ла Лига',
    bonus: 2.1,
  },
  {
    sport: 'FOOTBALL',
    url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard',
    leagueRu: 'Италия · Серия А',
    bonus: 2.0,
  },
  {
    sport: 'FOOTBALL',
    url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/scoreboard',
    leagueRu: 'Германия · Бундеслига',
    bonus: 1.9,
  },
  {
    sport: 'FOOTBALL',
    url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/scoreboard',
    leagueRu: 'Франция · Лига 1',
    bonus: 1.7,
  },
  {
    sport: 'HOCKEY',
    url: 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard',
    leagueRu: 'НХЛ · Регулярный чемпионат',
    bonus: 2.1,
  },
  {
    sport: 'BASKETBALL',
    url: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
    leagueRu: 'НБА · Регулярный сезон',
    bonus: 1.8,
  },
  {
    sport: 'TENNIS',
    url: 'https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard',
    leagueRu: 'ATP Tour · Мужчины',
    bonus: 1.8,
  },
  {
    sport: 'TENNIS',
    url: 'https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard',
    leagueRu: 'WTA Tour · Женщины',
    bonus: 1.7,
  },
  {
    sport: 'MMA',
    url: 'https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard',
    leagueRu: 'UFC · Бойцовский вечер',
    bonus: 2.3,
  },
];

/**
 * Жесткий фильтр мусорных смол-маркетов, статистических под-событий и кибер-симуляций
 */
const GARBAGE_PATTERNS = [
  'угловы',
  'желтые карточ',
  'жк ',
  'фолы',
  'удары в створ',
  'удары от ворот',
  'офсайд',
  'ауты',
  'вбрасыван',
  'штрафн',
  'броски в створ',
  'видеопросмотр',
  'эйсы',
  'двойные ошибк',
  '2x2',
  '3x3',
  '4x4',
  '5x5',
  '2х2',
  '3х3',
  '4х4',
  '5х5',
  'киберфутбол',
  'киберхоккей',
  'кибербаскетбол',
  'кибертеннис',
  'шорт-хоккей',
  'short hockey',
  'товарищеск',
  'молодеж',
  'резерв',
  'женщины. до ',
  'юниор',
  'u18',
  'u19',
  'u20',
  'u21',
  'u23',
  'любител',
  'статистика',
  'специальн',
  'итоги турнир',
  'кто выше',
  'серия буллитов',
  'хозяева - гости',
];

const RU_PRIORITY_KEYWORDS = [
  'мир рпл',
  'россия. премьер-лига',
  'россия · мир рпл',
  'кубок россии',
  'кхл',
  'континентальная хоккейная',
];

const TIER1_LEAGUE_KEYWORDS = [
  'премьер-лига',
  'лига чемпионов',
  'лига европы',
  'ла лига',
  'примера',
  'серия а',
  'бундеслига',
  'лига 1',
  'нхл',
  'nhl',
  'нба',
  'nba',
  'евролига',
  'atp',
  'wta',
  'большого шлема',
  'ufc',
  'blast',
  'esl',
  'major',
  'pgl',
  'iem',
  'international',
];

function parsePositiveTeamId(raw: unknown): number | null {
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function sameFixtureByNamesAndTime(
  candidate: Pick<ScannedFixtureCandidate, 'sport' | 'homeTeam' | 'awayTeam' | 'matchStartsAt'>,
  existing: Pick<PredictionRecord, 'sport' | 'homeTeam' | 'awayTeam' | 'matchStartsAt'> | Pick<AiPredictionDraft, 'sport' | 'homeTeam' | 'awayTeam' | 'matchStartsAt'>,
): boolean {
  if (candidate.sport !== existing.sport) return false;
  if (
    matchTeamPairOrder(
      candidate.homeTeam,
      candidate.awayTeam,
      existing.homeTeam,
      existing.awayTeam,
      candidate.sport,
    ) === null
  ) {
    return false;
  }
  const candidateStart = Date.parse(candidate.matchStartsAt);
  const existingStart = Date.parse(existing.matchStartsAt);
  return Number.isFinite(candidateStart) &&
    Number.isFinite(existingStart) &&
    Math.abs(candidateStart - existingStart) <= 36 * 60 * 60_000;
}

function isCleanMatchAndLeague(
  leagueName: string,
  homeTeam: string,
  awayTeam: string,
): boolean {
  if (!homeTeam.trim() || !awayTeam.trim()) return false;
  if (homeTeam.trim().length < 2 || awayTeam.trim().length < 2) return false;
  const combined = `${leagueName} ${homeTeam} ${awayTeam}`.toLowerCase();
  for (const bad of GARBAGE_PATTERNS) {
    if (combined.includes(bad)) return false;
  }
  return true;
}

function getLeaguePriorityBonus(leagueName: string): number {
  const lower = leagueName.toLowerCase();
  for (const ruKw of RU_PRIORITY_KEYWORDS) {
    if (lower.includes(ruKw)) return 3.2;
  }
  for (const kw of TIER1_LEAGUE_KEYWORDS) {
    if (lower.includes(kw)) return 2.1;
  }
  return 0;
}

async function appendAutopilotLog(
  level: AiAutopilotLogEntry['level'],
  stage: AiAutopilotLogEntry['stage'],
  message: string,
): Promise<void> {
  await mutateState((state) => {
    state.aiLogs.unshift({
      id: `ailog_${randomUUID().slice(0, 8)}`,
      createdAt: new Date().toISOString(),
      level,
      stage,
      message,
    });
    if (state.aiLogs.length > 100) {
      state.aiLogs = state.aiLogs.slice(0, 100);
    }
  });
}

async function fetchJsonWithHeaders<T>(
  url: string,
  timeoutMs = 5500,
  extraHeaders?: Record<string, string>,
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { ...RU_BROWSER_HEADERS, ...extraHeaders },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function discoverFonbetLineUrls(): Promise<string[]> {
  const discovered: string[] = [];
  const urlsCfg = await fetchJsonWithHeaders<{
    line?: string[];
  }>('https://www.fon.bet/urls.json', 3000, {
    Referer: 'https://www.fon.bet/',
  });

  if (Array.isArray(urlsCfg?.line)) {
    for (const rawHost of urlsCfg.line.slice(0, 4)) {
      const normalized = rawHost.startsWith('//')
        ? `https:${rawHost}`
        : rawHost.startsWith('http')
          ? rawHost
          : `https://${rawHost}`;
      discovered.push(
        `${normalized.replace(/\/+$/, '')}/events/listBase?lang=ru&scopeMarket=1600`,
      );
    }
  }

  for (const h of STATIC_FONBET_LINE_HOSTS) {
    const full = `${h}/events/listBase?lang=ru&scopeMarket=1600`;
    if (!discovered.includes(full)) discovered.push(full);
  }
  return discovered;
}

/**
 * Выбор оптимального одиночного исхода в рабочем диапазоне кэфов 1.65 – 2.38
 */
function pickOptimalValueMarket(params: {
  sport: SportType;
  p1?: number;
  px?: number | null;
  p2?: number;
  dc1x?: number;
  dcx2?: number;
  totalLine?: number | null;
  overOdds?: number | null;
  underOdds?: number | null;
  priorityBonus: number;
}): {
  market: string;
  odds: number;
  edgePct: number;
  confidencePct: number;
} | null {
  const options: Array<{ market: string; odds: number; bonus: number }> = [];

  if (params.p1 && params.p1 >= 1.65 && params.p1 <= 2.38) {
    options.push({
      market:
        params.sport === 'HOCKEY' && !params.px ? 'Победа 1 в матче' : 'Победа 1',
      odds: params.p1,
      bonus: 0.45,
    });
  }
  if (params.p2 && params.p2 >= 1.66 && params.p2 <= 2.35) {
    options.push({
      market:
        params.sport === 'HOCKEY' && !params.px ? 'Победа 2 в матче' : 'Победа 2',
      odds: params.p2,
      bonus: 0.35,
    });
  }

  // Для хоккея (3 исхода с ничьей): пересчет в надежную «Победу в матче» с ОТ и буллитами
  if (params.sport === 'HOCKEY' && params.px && params.p1 && params.p2) {
    const ml1 = Number((params.p1 * 0.78).toFixed(2));
    const ml2 = Number((params.p2 * 0.78).toFixed(2));
    if (ml1 >= 1.66 && ml1 <= 2.25) {
      options.push({ market: 'Победа 1 в матче', odds: ml1, bonus: 0.55 });
    }
    if (ml2 >= 1.68 && ml2 <= 2.25) {
      options.push({ market: 'Победа 2 в матче', odds: ml2, bonus: 0.45 });
    }
  }

  // Для явных фаворитов (1.42–1.63): аккуратная минусовая фора с рабочим коэффициентом
  if (params.sport === 'FOOTBALL' && params.p1 && params.p1 >= 1.42 && params.p1 < 1.64) {
    const hcpOdds = Number((params.p1 * 1.27).toFixed(2));
    if (hcpOdds >= 1.72 && hcpOdds <= 2.15) {
      options.push({ market: 'Фора 1 (-1.0)', odds: hcpOdds, bonus: 0.48 });
    }
  }
  if (
    (params.sport === 'TENNIS' || params.sport === 'ESPORTS') &&
    params.p1 &&
    params.p1 >= 1.38 &&
    params.p1 < 1.62
  ) {
    const setHcp = Number((params.p1 * 1.34).toFixed(2));
    if (setHcp >= 1.75 && setHcp <= 2.2) {
      options.push({ market: 'Фора 1 (-1.5)', odds: setHcp, bonus: 0.42 });
    }
  }

  if (params.dc1x && params.dc1x >= 1.65 && params.dc1x <= 2.15) {
    options.push({ market: '1X', odds: params.dc1x, bonus: 0.4 });
  }
  if (params.dcx2 && params.dcx2 >= 1.66 && params.dcx2 <= 2.15) {
    options.push({ market: 'X2', odds: params.dcx2, bonus: 0.3 });
  }
  if (
    params.totalLine !== null &&
    params.totalLine !== undefined &&
    params.overOdds &&
    params.overOdds >= 1.66 &&
    params.overOdds <= 2.25
  ) {
    options.push({
      market: `Тотал больше (${params.totalLine})`,
      odds: params.overOdds,
      bonus: 0.45,
    });
  }
  if (
    params.totalLine !== null &&
    params.totalLine !== undefined &&
    params.underOdds &&
    params.underOdds >= 1.68 &&
    params.underOdds <= 2.22
  ) {
    options.push({
      market: `Тотал меньше (${params.totalLine})`,
      odds: params.underOdds,
      bonus: 0.25,
    });
  }

  if (options.length === 0) return null;

  let marginPenalty = 0;
  if (params.p1 && params.p2) {
    const overround =
      1 / params.p1 + 1 / params.p2 + (params.px ? 1 / params.px : 0) - 1;
    marginPenalty = Math.max(0, (overround - 0.045) * 24);
  }

  options.sort((a, b) => {
    const distA = Math.abs(a.odds - 1.9) - a.bonus;
    const distB = Math.abs(b.odds - 1.9) - b.bonus;
    return distA - distB;
  });

  const best = options[0];
  const rawEdge =
    3.6 +
    Math.min(2.2, params.priorityBonus) +
    best.bonus -
    marginPenalty +
    (1.95 - Math.abs(best.odds - 1.9));
  const edgePct = Number(Math.min(8.6, Math.max(3.2, rawEdge)).toFixed(1));
  const impliedPct = (1 / best.odds) * 100;
  const confidencePct = Math.min(
    83,
    Math.max(63, Math.round(impliedPct + edgePct + 11)),
  );

  return {
    market: best.market,
    odds: Number(best.odds.toFixed(2)),
    edgePct,
    confidencePct,
  };
}

/**
 * УРОВЕНЬ 1: Прямой сбор прематч-линии с российских зеркал Фонбет (0 ₽, русские названия)
 */
async function scanFromFonbetRu(
  config: AiAutopilotConfig,
): Promise<ScannedFixtureCandidate[]> {
  type FonbetPayload = {
    sports?: Array<{
      id: number;
      parentId?: number;
      kind?: string;
      name: string;
    }>;
    events?: Array<{
      id: number;
      level: number;
      sportId: number;
      place?: string;
      name?: string;
      team1?: string;
      team2?: string;
      team1Id?: number | string;
      team2Id?: number | string;
      team1Logo?: string;
      team2Logo?: string;
      logo1?: string;
      logo2?: string;
      startTime: number;
    }>;
    customFactors?: Array<{
      e: number;
      factors?: Array<{ f: number; v: number; p?: number }>;
      f?: number;
      v?: number;
      p?: number;
    }>;
  };

  const lineUrls = await discoverFonbetLineUrls();
  let payload: FonbetPayload | null = null;
  let usedMirror: string | null = null;

  for (const mirror of lineUrls) {
    const data = await fetchJsonWithHeaders<FonbetPayload>(mirror, 11_500, {
      Origin: 'https://www.fon.bet',
      Referer: 'https://www.fon.bet/',
    });
    if (data?.events && data.events.length > 0 && data.sports) {
      payload = data;
      usedMirror = mirror;
      break;
    }
  }

  if (!payload?.events || !payload.sports) return [];

  // Английские названия тех же событий (lang=en, те же id) — для точного
  // матчинга официальных эмблем команд в ESPN/TheSportsDB и сверки счёта.
  const enNamesByEventId = new Map<number, { t1: string; t2: string }>();
  if (usedMirror) {
    const enUrl = usedMirror.replace('lang=ru', 'lang=en');
    const enData = await fetchJsonWithHeaders<FonbetPayload>(enUrl, 11_500, {
      Origin: 'https://www.fon.bet',
      Referer: 'https://www.fon.bet/',
    });
    for (const ev of enData?.events || []) {
      if (ev.level !== 1) continue;
      const t1 = ev.team1?.trim() || '';
      const t2 = ev.team2?.trim() || '';
      if (t1 && t2) enNamesByEventId.set(ev.id, { t1, t2 });
    }
  }

  const sportNodes = new Map<number, { id: number; parentId?: number; name: string }>();
  for (const sp of payload.sports) {
    sportNodes.set(sp.id, sp);
  }

  const mapRootSport = (sportId: number): { sport: SportType | null; leagueName: string } => {
    const leagueNode = sportNodes.get(sportId);
    if (!leagueNode) return { sport: null, leagueName: '' };

    let root = leagueNode;
    let guard = 0;
    while (root.parentId && sportNodes.has(root.parentId) && guard < 8) {
      root = sportNodes.get(root.parentId)!;
      guard += 1;
    }

    const rName = root.name.toLowerCase();
    let mapped: SportType | null = null;
    if (root.id === 1 || rName.includes('футбол')) mapped = 'FOOTBALL';
    else if (root.id === 2 || rName.includes('хоккей')) mapped = 'HOCKEY';
    else if (root.id === 4 || rName.includes('теннис')) mapped = 'TENNIS';
    else if (root.id === 3 || rName.includes('баскетбол')) mapped = 'BASKETBALL';
    else if (
      rName.includes('киберспорт') ||
      rName.includes('esports') ||
      rName.includes('counter-strike') ||
      rName.includes('dota')
    ) {
      mapped = 'ESPORTS';
    } else if (
      rName.includes('единоборств') ||
      rName.includes('мма') ||
      rName.includes('бокс') ||
      rName.includes('ufc')
    ) {
      mapped = 'MMA';
    }

    return { sport: mapped, leagueName: leagueNode.name };
  };

  const factorsByEvent = new Map<number, Map<number, { v: number; p?: number }>>();
  for (const row of payload.customFactors || []) {
    if (!factorsByEvent.has(row.e)) {
      factorsByEvent.set(row.e, new Map());
    }
    const bucket = factorsByEvent.get(row.e)!;
    if (Array.isArray(row.factors)) {
      for (const fc of row.factors) {
        bucket.set(fc.f, { v: fc.v, p: fc.p });
      }
    } else if (typeof row.f === 'number' && typeof row.v === 'number') {
      bucket.set(row.f, { v: row.v, p: row.p });
    }
  }

  const now = Date.now();
  const candidates: ScannedFixtureCandidate[] = [];

  for (const ev of payload.events) {
    if (ev.level !== 1) continue;
    if (ev.place === 'live') continue;

    const startMs = ev.startTime * 1000;
    if (startMs < now + 35 * 60_000 || startMs > now + 72 * 3600_000) continue;

    let t1 = ev.team1?.trim() || '';
    let t2 = ev.team2?.trim() || '';
    if ((!t1 || !t2) && ev.name) {
      const split = ev.name.split(/\s+[—–-]\s+/);
      if (split.length === 2) {
        t1 = split[0].trim();
        t2 = split[1].trim();
      }
    }
    if (!t1 || !t2) continue;

    const { sport, leagueName } = mapRootSport(ev.sportId);
    if (!sport || !config.sportsEnabled.includes(sport)) continue;
    if (!isCleanMatchAndLeague(leagueName, t1, t2)) continue;

    const fMap = factorsByEvent.get(ev.id);
    if (!fMap) continue;

    const isTwoWaySport =
      sport === 'TENNIS' || sport === 'MMA' || sport === 'ESPORTS';
    const p1 = fMap.get(921)?.v;
    const px = isTwoWaySport ? null : fMap.get(922)?.v ?? null;
    const p2 = fMap.get(923)?.v ?? (isTwoWaySport ? fMap.get(922)?.v : undefined);
    const dc1x = fMap.get(927)?.v;
    const dcx2 = fMap.get(929)?.v;
    const overFactor = fMap.get(930) ?? fMap.get(1848);
    const underFactor = fMap.get(931) ?? fMap.get(1849);

    if (!p1 || !p2) continue;

    const totalLine =
      overFactor?.p !== undefined ? Number((overFactor.p / 100).toFixed(2)) : null;
    const priorityBonus = getLeaguePriorityBonus(leagueName);

    const best = pickOptimalValueMarket({
      sport,
      p1,
      px,
      p2,
      dc1x,
      dcx2,
      totalLine,
      overOdds: overFactor?.v ?? null,
      underOdds: underFactor?.v ?? null,
      priorityBonus,
    });
    if (!best) continue;

    candidates.push({
      externalFixtureId: `fonbet_${ev.id}`,
      sport,
      leagueName,
      homeTeam: t1,
      awayTeam: t2,
      homeTeamEn: enNamesByEventId.get(ev.id)?.t1 || null,
      awayTeamEn: enNamesByEventId.get(ev.id)?.t2 || null,
      homeLogoUrl: normalizeFonbetTeamImageUrl(ev.team1Logo || ev.logo1),
      awayLogoUrl: normalizeFonbetTeamImageUrl(ev.team2Logo || ev.logo2),
      fonbetHomeTeamId: parsePositiveTeamId(ev.team1Id),
      fonbetAwayTeamId: parsePositiveTeamId(ev.team2Id),
      matchStartsAt: new Date(startMs).toISOString(),
      bookmakerSource: 'Фонбет',
      homeOdds: Number(p1.toFixed(2)),
      drawOdds: px ? Number(px.toFixed(2)) : null,
      awayOdds: Number(p2.toFixed(2)),
      totalLine,
      overOdds: overFactor?.v ? Number(overFactor.v.toFixed(2)) : null,
      underOdds: underFactor?.v ? Number(underFactor.v.toFixed(2)) : null,
      contextNotes: `Актуальная российская линия БК Фонбет на реальный предстоящий матч: победа «${t1}» идет за ${p1.toFixed(
        2,
      )}, ${px ? `ничья за ${px.toFixed(2)}, ` : ''}победа «${t2}» — за ${p2.toFixed(
        2,
      )}${
        totalLine
          ? `, базовый тотал игры ${totalLine} (больше за ${overFactor?.v?.toFixed(2)})`
          : ''
      }.`,
      suggestedMarket: best.market,
      suggestedOdds: best.odds,
      valueEdgePct: best.edgePct,
      confidencePct: best.confidencePct,
      priorityBonus,
    });
  }

  return candidates
    .sort(
      (a, b) =>
        b.priorityBonus * 2 + b.valueEdgePct - (a.priorityBonus * 2 + a.valueEdgePct),
    )
    .slice(0, 60);
}

/**
 * УРОВЕНЬ 2: Прямой сбор прематч-линии с российского шлюза Leon.ru (0 ₽, русские названия)
 */
async function scanFromLeonRu(
  config: AiAutopilotConfig,
): Promise<ScannedFixtureCandidate[]> {
  type LeonSportNode = {
    family: string;
    name: string;
    regions?: Array<{
      name: string;
      leagues?: Array<{ id: number; name: string; top?: boolean }>;
    }>;
  };

  let baseHost = 'https://www.leon.ru';
  let sportsTree = await fetchJsonWithHeaders<LeonSportNode[]>(
    `${baseHost}/api-2/betline/sports?ctag=ru-RU&flags=urlv2`,
    5000,
    { Referer: 'https://www.leon.ru/', 'X-Requested-With': 'XMLHttpRequest' },
  );

  if (!Array.isArray(sportsTree) || sportsTree.length === 0) {
    baseHost = 'https://leon.ru';
    sportsTree = await fetchJsonWithHeaders<LeonSportNode[]>(
      `${baseHost}/api-2/betline/sports?ctag=ru-RU&flags=urlv2`,
      5000,
      { Referer: 'https://leon.ru/', 'X-Requested-With': 'XMLHttpRequest' },
    );
  }
  if (!Array.isArray(sportsTree) || sportsTree.length === 0) return [];

  const mapFamily = (family: string): SportType | null => {
    const f = family.toLowerCase();
    if (f.includes('soccer') || f.includes('football') || f.includes('футбол')) {
      return 'FOOTBALL';
    }
    if (f.includes('hockey') || f.includes('хоккей')) return 'HOCKEY';
    if (f.includes('tennis') || f.includes('теннис')) return 'TENNIS';
    if (f.includes('basketball') || f.includes('баскетбол')) return 'BASKETBALL';
    if (f.includes('esport') || f.includes('cyber') || f.includes('кибер')) {
      return 'ESPORTS';
    }
    if (f.includes('mma') || f.includes('martial') || f.includes('единобор')) {
      return 'MMA';
    }
    return null;
  };

  const selectedLeagues: Array<{
    id: number;
    sport: SportType;
    title: string;
    bonus: number;
  }> = [];

  for (const sp of sportsTree) {
    const mapped = mapFamily(`${sp.family || ''} ${sp.name || ''}`);
    if (!mapped || !config.sportsEnabled.includes(mapped)) continue;
    for (const reg of sp.regions || []) {
      for (const lg of reg.leagues || []) {
        const fullTitle = `${reg.name} · ${lg.name}`;
        const bonus = getLeaguePriorityBonus(fullTitle);
        if (!lg.top && bonus === 0) continue;
        selectedLeagues.push({
          id: lg.id,
          sport: mapped,
          title: fullTitle,
          bonus: Math.max(bonus, lg.top ? 1.5 : 0),
        });
      }
    }
  }

  selectedLeagues.sort((a, b) => b.bonus - a.bonus);
  const topLeagues = selectedLeagues.slice(0, 14);
  const now = Date.now();

  const perLeagueBatches = await Promise.all(
    topLeagues.map(async (lg) => {
      const evData = await fetchJsonWithHeaders<{
        events?: Array<{
          id: number;
          name: string;
          kickoff: number;
          competitors?: Array<{
            name: string;
            homeAway?: string;
            logo?: string;
          }>;
          markets?: Array<{
            name: string;
            open?: boolean;
            runners?: Array<{ name: string; price: number; param?: string }>;
          }>;
        }>;
      }>(
        `${baseHost}/api-2/betline/events/all?ctag=ru-RU&league_id=${lg.id}&hideClosed=true&flags=reg,urlv2,mm2,rrc,nodup`,
        5500,
        { Referer: `${baseHost}/`, 'X-Requested-With': 'XMLHttpRequest' },
      );

      const batch: ScannedFixtureCandidate[] = [];
      for (const ev of evData?.events || []) {
        if (ev.kickoff < now + 35 * 60_000 || ev.kickoff > now + 72 * 3600_000) {
          continue;
        }

        const splitName = ev.name.split(/\s+[—–-]\s+/);
        const homeCompLeon = ev.competitors?.find((c) => c.homeAway === 'HOME');
        const awayCompLeon = ev.competitors?.find((c) => c.homeAway === 'AWAY');
        const home = homeCompLeon?.name || splitName[0] || '';
        const away = awayCompLeon?.name || splitName[1] || '';
        if (!isCleanMatchAndLeague(lg.title, home, away)) continue;

        const m1x2 = ev.markets?.find(
          (m) =>
            m.open !== false &&
            (m.name === 'Победитель' ||
              m.name === '1X2' ||
              m.name === 'Исход' ||
              m.name.toLowerCase().includes('победитель матча')),
        );
        const mTotal = ev.markets?.find(
          (m) => m.open !== false && m.name.toLowerCase().startsWith('тотал'),
        );

        const runners = m1x2?.runners || [];
        const p1 =
          runners.find((r) => r.name === '1' || r.name === home)?.price ??
          (runners.length === 2 ? runners[0]?.price : undefined);
        const px =
          runners.find((r) => r.name === 'X' || r.name === 'Ничья')?.price ?? null;
        const p2 =
          runners.find((r) => r.name === '2' || r.name === away)?.price ??
          (runners.length === 2 ? runners[1]?.price : undefined);
        if (!p1 || !p2) continue;

        const overRunner = mTotal?.runners?.find(
          (r) =>
            r.name.toLowerCase().includes('больше') || r.name.startsWith('Б'),
        );
        const underRunner = mTotal?.runners?.find(
          (r) =>
            r.name.toLowerCase().includes('меньше') || r.name.startsWith('М'),
        );
        const totalLine = overRunner?.param ? Number(overRunner.param) : null;

        const best = pickOptimalValueMarket({
          sport: lg.sport,
          p1,
          px,
          p2,
          totalLine,
          overOdds: overRunner?.price ?? null,
          underOdds: underRunner?.price ?? null,
          priorityBonus: lg.bonus,
        });
        if (!best) continue;

        batch.push({
          externalFixtureId: `leon_${ev.id}`,
          sport: lg.sport,
          leagueName: lg.title,
          homeTeam: home.trim(),
          awayTeam: away.trim(),
          matchStartsAt: new Date(ev.kickoff).toISOString(),
          bookmakerSource: 'БК Леон',
          homeOdds: Number(p1.toFixed(2)),
          drawOdds: px ? Number(px.toFixed(2)) : null,
          awayOdds: Number(p2.toFixed(2)),
          totalLine,
          overOdds: overRunner?.price ? Number(overRunner.price.toFixed(2)) : null,
          underOdds: underRunner?.price
            ? Number(underRunner.price.toFixed(2))
            : null,
          contextNotes: `Прямая российская линия БК Леон на предстоящий матч: победа «${home.trim()}» оценивается в ${p1.toFixed(
            2,
          )}, ${
            px ? `ничья — ${px.toFixed(2)}, ` : ''
          }победа «${away.trim()}» — ${p2.toFixed(2)}.`,
          suggestedMarket: best.market,
          suggestedOdds: best.odds,
          valueEdgePct: best.edgePct,
          confidencePct: best.confidencePct,
          priorityBonus: lg.bonus,
        });
      }
      return batch;
    }),
  );

  return perLeagueBatches
    .flat()
    .sort(
      (a, b) =>
        b.priorityBonus * 2 + b.valueEdgePct - (a.priorityBonus * 2 + a.valueEdgePct),
    );
}

function americanToDecimal(ml?: number | null): number | null {
  if (typeof ml !== 'number' || !Number.isFinite(ml) || ml === 0) return null;
  if (ml > 0) return Number((1 + ml / 100).toFixed(2));
  return Number((1 + 100 / Math.abs(ml)).toFixed(2));
}

function formatYmdCompact(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/**
 * УРОВЕНЬ 3: Реальное расписание матчей РФ и мира (работает с любого VPS без блокировок WAF)
 * Собирает реальные предстоящие матчи на ближайшие 72 часа с переводом команд на русский язык
 */
async function scanFromLocalizedLiveCenter(
  config: AiAutopilotConfig,
): Promise<ScannedFixtureCandidate[]> {
  const now = Date.now();
  const dateRangeParam = `${formatYmdCompact(now)}-${formatYmdCompact(
    now + 3 * 86_400_000,
  )}`;

  const activeFeeds = ESPN_ENDPOINTS.filter((f) =>
    config.sportsEnabled.includes(f.sport),
  );

  const batches = await Promise.all(
    activeFeeds.map(async (feed) => {
      const urlWithDates = `${feed.url}?dates=${dateRangeParam}`;
      const payload = await fetchJsonWithHeaders<{
        events?: Array<{
          id: string;
          date: string;
          status?: { type?: { state?: string; completed?: boolean } };
          competitions?: Array<{
            competitors?: Array<{
              homeAway?: 'home' | 'away';
              team?: {
                displayName?: string;
                logo?: string;
                logos?: Array<{ href?: string }>;
              };
              athlete?: {
                displayName?: string;
                headshot?: { href?: string };
                flag?: { href?: string };
              };
              records?: Array<{ summary?: string }>;
            }>;
            odds?: Array<{
              overUnder?: number;
              homeTeamOdds?: { moneyLine?: number };
              awayTeamOdds?: { moneyLine?: number };
              drawOdds?: { moneyLine?: number };
            }>;
          }>;
        }>;
      }>(urlWithDates, 5500);

      const items: ScannedFixtureCandidate[] = [];
      if (!payload?.events) return items;

      for (const ev of payload.events.slice(0, 12)) {
        if (ev.status?.type?.completed || ev.status?.type?.state === 'in') continue;
        const startMs = new Date(ev.date).getTime();
        if (startMs < now + 35 * 60_000 || startMs > now + 72 * 3600_000) continue;

        const comp = ev.competitions?.[0];
        const comps = comp?.competitors || [];
        const homeComp =
          comps.find((c) => c.homeAway === 'home') || comps[0];
        const awayComp =
          comps.find((c) => c.homeAway === 'away') || comps[1];
        const rawHome =
          homeComp?.team?.displayName || homeComp?.athlete?.displayName;
        const rawAway =
          awayComp?.team?.displayName || awayComp?.athlete?.displayName;
        if (!rawHome || !rawAway) continue;

        const homeName = localizeTeamName(rawHome, feed.sport);
        const awayName = localizeTeamName(rawAway, feed.sport);
        if (!isCleanMatchAndLeague(feed.leagueRu, homeName, awayName)) continue;

        const homeRec = homeComp?.records?.[0]?.summary || '';
        const awayRec = awayComp?.records?.[0]?.summary || '';

        const oddsObj = comp?.odds?.[0];
        const realP1 = americanToDecimal(oddsObj?.homeTeamOdds?.moneyLine);
        const realP2 = americanToDecimal(oddsObj?.awayTeamOdds?.moneyLine);
        const realPx = americanToDecimal(oddsObj?.drawOdds?.moneyLine);
        const overUnder = oddsObj?.overUnder ?? null;
        // Расписание и сезонные записи не заменяют котировку: исключаем матчи,
        // для которых фид не дал действительную линию букмекера.
        if (!realP1 || !realP2 || (feed.sport === 'FOOTBALL' && !realPx)) continue;

        const p1 = realP1;
        const p2 = realP2;
        const px = realPx;

        const best = pickOptimalValueMarket({
          sport: feed.sport,
          p1,
          px,
          p2,
          totalLine: overUnder,
          overOdds: overUnder ? 1.9 : null,
          underOdds: overUnder ? 1.9 : null,
          priorityBonus: feed.bonus,
        });
        if (!best) continue;

        const recText =
          homeRec && awayRec
            ? `Текущая статистика сезона: «${homeName}» (${homeRec}), «${awayName}» (${awayRec}).`
            : `Официальный матч календаря турнира «${feed.leagueRu}».`;

        const homeLogoUrl =
          homeComp?.team?.logo ||
          homeComp?.team?.logos?.[0]?.href ||
          homeComp?.athlete?.headshot?.href ||
          null;
        const awayLogoUrl =
          awayComp?.team?.logo ||
          awayComp?.team?.logos?.[0]?.href ||
          awayComp?.athlete?.headshot?.href ||
          null;

        items.push({
          externalFixtureId: `espn_${ev.id}`,
          sport: feed.sport,
          leagueName: feed.leagueRu,
          homeTeam: homeName,
          awayTeam: awayName,
          homeLogoUrl,
          awayLogoUrl,
          matchStartsAt: new Date(ev.date).toISOString(),
          bookmakerSource: 'ESPN · Match Center',
          homeOdds: p1,
          drawOdds: px,
          awayOdds: p2,
          totalLine: overUnder,
          overOdds: overUnder ? 1.9 : null,
          underOdds: overUnder ? 1.9 : null,
          contextNotes: recText,
          suggestedMarket: best.market,
          suggestedOdds: best.odds,
          valueEdgePct: best.edgePct,
          confidencePct: best.confidencePct,
          priorityBonus: feed.bonus,
        });
      }

      return items;
    }),
  );

  return batches
    .flat()
    .sort(
      (a, b) =>
        b.priorityBonus * 2 + b.valueEdgePct - (a.priorityBonus * 2 + a.valueEdgePct),
    );
}

/**
 * УРОВЕНЬ 4: Локальный стенд (включается ТОЛЬКО в изолированной песочнице без доступа к внешним спортивным сайтам)
 */
function buildQuantitativeFallbackPool(
  config: AiAutopilotConfig,
): ScannedFixtureCandidate[] {
  const now = Date.now();
  const templates: Array<{
    sport: SportType;
    leagueName: string;
    homeTeam: string;
    awayTeam: string;
    hoursAhead: number;
    market: string;
    odds: number;
    edge: number;
    conf: number;
    notes: string;
  }> = [
    {
      sport: 'FOOTBALL',
      leagueName: 'Россия · Мир РПЛ',
      homeTeam: 'Спартак Москва',
      awayTeam: 'Динамо Москва',
      hoursAhead: 5.5,
      market: 'Индивидуальный тотал 1 больше (1.5)',
      odds: 1.92,
      edge: 5.5,
      conf: 74,
      notes: 'Спартак дома стабильно забивает по 2 и более мяча за игру, а оборона Динамо регулярно допускает моменты в московских дерби.',
    },
    {
      sport: 'HOCKEY',
      leagueName: 'КХЛ · Регулярный сезон',
      homeTeam: 'СКА',
      awayTeam: 'Авангард',
      hoursAhead: 7,
      market: 'Тотал больше (5.0)',
      odds: 1.9,
      edge: 4.9,
      conf: 72,
      notes: 'Обе команды играют в открытый атакующий хоккей, мощно реализуют большинство и наносят свыше 60 бросков в створ за встречу.',
    },
    {
      sport: 'FOOTBALL',
      leagueName: 'Англия · Премьер-лига',
      homeTeam: 'Ливерпуль',
      awayTeam: 'Ньюкасл Юнайтед',
      hoursAhead: 9.5,
      market: 'Фора 1 (-1.0)',
      odds: 1.94,
      edge: 5.3,
      conf: 75,
      notes: 'Ливерпуль мощно проводит домашние матчи с первых минут, тогда как Ньюкасл приехал после тяжелой выездной серии с потерями в защите.',
    },
    {
      sport: 'TENNIS',
      leagueName: 'ATP Masters 1000 · Хард',
      homeTeam: 'Карлос Алькарас',
      awayTeam: 'Александр Зверев',
      hoursAhead: 8.5,
      market: 'Победа 1',
      odds: 1.81,
      edge: 4.6,
      conf: 73,
      notes: 'Алькарас заметно свежее физически и уверенно забирает затяжные розыгрыши на задней линии на этом покрытии.',
    },
    {
      sport: 'ESPORTS',
      leagueName: 'CS2 · Крупный турнир',
      homeTeam: 'Team Spirit',
      awayTeam: 'MOUZ',
      hoursAhead: 6,
      market: 'Победа 1',
      odds: 1.86,
      edge: 5.1,
      conf: 72,
      notes: 'Российский состав Team Spirit выиграл 4 из 5 последних матчей против соперников из топ-10 и сильнее на ключевых картах.',
    },
    {
      sport: 'MMA',
      leagueName: 'UFC · Главный кард',
      homeTeam: 'Ислам Махачев',
      awayTeam: 'Арман Царукян',
      hoursAhead: 13,
      market: 'Победа 1',
      odds: 1.75,
      edge: 4.4,
      conf: 76,
      notes: 'Преимущество Махачева в борьбе, контроле в партере и огромный опыт пятираундовых чемпионских боев.',
    },
  ];

  const dayStamp = new Date().toISOString().slice(0, 10);
  return templates
    .filter((t) => config.sportsEnabled.includes(t.sport))
    .map((t, i) => ({
      externalFixtureId: `quant_${dayStamp}_${i}`,
      sport: t.sport,
      leagueName: t.leagueName,
      homeTeam: t.homeTeam,
      awayTeam: t.awayTeam,
      matchStartsAt: new Date(now + t.hoursAhead * 3600_000).toISOString(),
      bookmakerSource: 'Локальный резервный стенд · синтетические данные (не котировка)',
      homeOdds: t.odds,
      drawOdds: t.sport === 'FOOTBALL' ? 3.65 : null,
      awayOdds:
        t.sport === 'FOOTBALL'
          ? Number((1 / Math.max(0.16, 1.05 - 1 / t.odds - 1 / 3.65)).toFixed(2))
          : Number((1 / Math.max(0.24, 1.05 - 1 / t.odds)).toFixed(2)),
      totalLine: 2.5,
      overOdds: 1.9,
      underOdds: 1.9,
      contextNotes: t.notes,
      suggestedMarket: t.market,
      suggestedOdds: t.odds,
      valueEdgePct: t.edge,
      confidencePct: t.conf,
      priorityBonus: 1.5,
    }));
}

const LLM_BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export function stripReasoningThinkTags(raw: string): string {
  return (raw || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

export const PLUSVIBE_RECOMMENDED_MODELS = [
  'deepseek-v4.1-flash-1017',
  'gpt-6-luna',
  'gemini-3.8-flash',
  'qwen3.8-max',
  'gpt-6.1-sol',
  'claude-sonnet-5.5',
  'claude-opus-5.5',
];

export function isNonChatModelId(id: string, typeField?: string): boolean {
  const t = (typeField || '').toLowerCase();
  if (
    t &&
    t !== 'chat' &&
    t !== 'text' &&
    t !== 'llm' &&
    t !== 'language'
  ) {
    return true;
  }
  return /embed|rerank|whisper|speech-to-text|tts|elevenlabs|flux|midjourney|dall-e|imagen|sora|kling|veo|runway|suno|udio|moderation/i.test(
    id,
  );
}

/**
 * Сортирует список моделей токена под конкретный шлюз:
 * - Для платного PlusVibeAPI (РФ, ₽) ставит вперед оптимальные платные модели (deepseek-v4.1-flash-1017 за 2₽, gpt-6-luna, gemini-3.8-flash, qwen3.8-max, gpt-6.1-sol, claude-sonnet-5.5) и убирает :free.
 * - Для OrcaRouter / OpenRouter ставит БЕСПЛАТНЫЕ (-free, :free) модели первыми.
 */
export function prioritizeModelsFreeFirst(
  models: string[],
  options?: { isPlusVibe?: boolean },
): string[] {
  const isPlusVibe = Boolean(options?.isPlusVibe);
  const filtered = models.filter((m) => {
    if (!m || isNonChatModelId(m)) return false;
    if (isPlusVibe && (m.endsWith(':free') || m.endsWith('-free'))) {
      return false;
    }
    return true;
  });

  if (isPlusVibe) {
    const scorePv = (m: string): number => {
      const low = m.toLowerCase();
      const idx = PLUSVIBE_RECOMMENDED_MODELS.findIndex(
        (rec) => low === rec || low.endsWith(`/${rec}`),
      );
      if (idx !== -1) return 500 - idx * 20;
      let s = 0;
      if (/deepseek|gpt-6|gemini-3|qwen3|claude/i.test(low)) s += 40;
      if (/flash|luna|mini/i.test(low)) s += 20;
      return s;
    };
    return [...filtered].sort((a, b) => {
      const diff = scorePv(b) - scorePv(a);
      return diff !== 0 ? diff : a.localeCompare(b);
    });
  }

  const scoreModel = (m: string): number => {
    const low = m.toLowerCase();
    if (low === 'orcarouter/auto' || low.endsWith('/auto')) return -100;
    let score = 0;
    if (low.includes('free')) score += 100;
    if (low.includes('flash') || low.includes('mini') || low.includes('lite')) {
      score += 25;
    }
    if (/deepseek|gemini|qwen|gpt|claude|llama/i.test(low)) score += 15;
    return score;
  };

  return [...filtered].sort((a, b) => {
    const diff = scoreModel(b) - scoreModel(a);
    return diff !== 0 ? diff : a.localeCompare(b);
  });
}

export async function fetchPlusVibeBalanceRub(
  apiKey: string,
  preferredBaseUrl?: string,
): Promise<number | null> {
  const key = (apiKey || '').trim();
  if (!key) return null;

  const bases = [
    preferredBaseUrl?.replace(/\/+$/, ''),
    'https://plusvibeapi.ru/v1',
    'https://gw.plusvibeapi.ru/v1',
  ].filter((v, idx, arr): v is string => Boolean(v) && arr.indexOf(v) === idx);

  for (const base of bases) {
    try {
      const res = await fetch(`${base}/balance`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${key}`,
          'User-Agent': LLM_BROWSER_UA,
        },
        signal: AbortSignal.timeout(4500),
        cache: 'no-store',
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        balance_rub?: number | string;
        balance?: number | string;
      };
      const rawVal = json.balance_rub ?? json.balance;
      const num = typeof rawVal === 'string' ? Number(rawVal) : rawVal;
      if (typeof num === 'number' && Number.isFinite(num)) {
        return Number(num.toFixed(2));
      }
    } catch {
      // пробуем резервный шлюз
    }
  }
  return null;
}

export function buildCandidateLlmBaseUrls(
  rawBaseUrl: string,
  provider: string,
  apiKey?: string,
): string[] {
  const cleaned = (rawBaseUrl || '').trim();
  const key = (apiKey || '').trim();
  const isPlusVibeKey = key.startsWith('sk-pv-');
  const candidates: string[] = [];

  const pushUnique = (u: string) => {
    let norm = u.replace(/\/+$/, '');
    if (/^https?:\/\/(www\.|api\.)?orcarouter\.ai(\/|$)/i.test(norm)) {
      norm = 'https://www.orcarouter.ai/v1';
    } else if (/^https?:\/\/(www\.)?ollama\.com\/?$/i.test(norm)) {
      norm = 'https://ollama.com/v1';
    } else if (/^https?:\/\/(www\.)?plusvibeapi\.ru(\/|$)/i.test(norm)) {
      norm = 'https://plusvibeapi.ru/v1';
    } else if (/^https?:\/\/gw\.plusvibeapi\.ru\/?$/i.test(norm)) {
      norm = 'https://gw.plusvibeapi.ru/v1';
    }
    if (norm && !candidates.includes(norm)) candidates.push(norm);
  };

  if (isPlusVibeKey && !cleaned.includes('127.0.0.1') && !cleaned.includes('localhost')) {
    pushUnique('https://plusvibeapi.ru/v1');
    pushUnique('https://gw.plusvibeapi.ru/v1');
  }

  if (cleaned) {
    try {
      const parsed = new URL(
        cleaned.startsWith('http') ? cleaned : `https://${cleaned}`,
      );
      if (parsed.hostname.includes('plusvibeapi.ru')) {
        if (parsed.hostname.startsWith('gw.')) {
          pushUnique('https://gw.plusvibeapi.ru/v1');
          pushUnique('https://plusvibeapi.ru/v1');
        } else {
          pushUnique('https://plusvibeapi.ru/v1');
          pushUnique('https://gw.plusvibeapi.ru/v1');
        }
      } else if (parsed.hostname.includes('orcarouter.ai')) {
        pushUnique('https://www.orcarouter.ai/v1');
      } else if (parsed.hostname.includes('ollama.com')) {
        if (parsed.pathname === '/' || parsed.pathname === '') {
          pushUnique('https://ollama.com/v1');
        } else if (parsed.pathname.endsWith('/chat/completions')) {
          pushUnique(
            `${parsed.origin}${parsed.pathname.replace(/\/chat\/completions$/, '')}`,
          );
        } else {
          pushUnique(`${parsed.origin}${parsed.pathname}`);
        }
      } else if (
        parsed.pathname.includes('/console') ||
        parsed.pathname.includes('/dashboard') ||
        parsed.pathname === '/' ||
        parsed.pathname === ''
      ) {
        pushUnique(`${parsed.origin}/v1`);
      } else if (parsed.pathname.endsWith('/chat/completions')) {
        pushUnique(
          `${parsed.origin}${parsed.pathname.replace(/\/chat\/completions$/, '')}`,
        );
      } else {
        pushUnique(`${parsed.origin}${parsed.pathname}`);
      }
    } catch {
      pushUnique(cleaned);
    }
  }

  if (provider === 'PLUSVIBE') {
    pushUnique('https://plusvibeapi.ru/v1');
    pushUnique('https://gw.plusvibeapi.ru/v1');
  } else if (provider === 'OLLAMA') {
    pushUnique('https://ollama.com/v1');
  } else if (provider === 'ORCAROUTER') {
    pushUnique('https://www.orcarouter.ai/v1');
  }

  if (candidates.length === 0) {
    pushUnique('https://plusvibeapi.ru/v1');
  }

  return candidates;
}

/**
 * Надежный POST к /chat/completions с сохранением метода POST при 301/302/307/308 редиректах
 * и автоматическим повтором без system-роли для строгих бесплатных / reasoning моделей.
 */
export async function postLlmChatCompletion(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<{
  ok: boolean;
  status: number;
  content: string;
  returnedModel?: string;
  rawError: string;
}> {
  const sendOnce = async (
    targetUrl: string,
    payloadObj: Record<string, unknown>,
    redirectsLeft = 3,
  ): Promise<Response> => {
    const res = await fetch(targetUrl, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(params.timeoutMs ?? 20_000),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${params.apiKey.trim()}`,
        'User-Agent': LLM_BROWSER_UA,
      },
      body: JSON.stringify(payloadObj),
      cache: 'no-store',
    });

    if (
      redirectsLeft > 0 &&
      [301, 302, 303, 307, 308].includes(res.status)
    ) {
      const loc = res.headers.get('location');
      if (loc) {
        const resolvedLoc = new URL(loc, targetUrl).toString();
        return sendOnce(resolvedLoc, payloadObj, redirectsLeft - 1);
      }
    }
    return res;
  };

  const endpoint = `${params.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const primaryPayload: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
    stream: false,
  };
  if (params.temperature !== undefined) {
    primaryPayload.temperature = params.temperature;
  }
  if (params.maxTokens !== undefined) {
    primaryPayload.max_tokens = params.maxTokens;
  }

  const extractReplyFromJson = (json: {
    model?: string;
    choices?: Array<{
      message?: {
        content?: string | Array<{ text?: string }>;
        reasoning?: string;
        thinking?: string;
        reasoning_content?: string;
      };
    }>;
  }): { text: string; returnedModel?: string } => {
    const msg = json.choices?.[0]?.message;
    let rawText = '';
    if (typeof msg?.content === 'string') {
      rawText = msg.content;
    } else if (Array.isArray(msg?.content)) {
      rawText = msg!.content.map((part) => part?.text || '').join('');
    }
    const cleaned = stripReasoningThinkTags(rawText);
    const fallbackReasoning = (
      msg?.reasoning ||
      msg?.thinking ||
      msg?.reasoning_content ||
      ''
    ).trim();
    return {
      text: cleaned || rawText.trim() || fallbackReasoning,
      returnedModel: json.model,
    };
  };

  try {
    let res = await sendOnce(endpoint, primaryPayload);

    // При превышении лимита частоты (HTTP 429 с Retry-After <= 4 сек) повторяем один раз с паузой
    if (res.status === 429) {
      const retryAfterRaw = Number(res.headers.get('retry-after') || '1.5');
      const waitMs = Math.min(
        4000,
        Math.max(800, (Number.isFinite(retryAfterRaw) ? retryAfterRaw : 1.5) * 1000),
      );
      await new Promise((r) => setTimeout(r, waitMs));
      res = await sendOnce(endpoint, primaryPayload);
    }

    // Если бесплатная / reasoning модель вернула 400 из-за role:"system" или temperature — склеиваем в user без temperature
    if (res.status === 400 && params.messages.some((m) => m.role === 'system')) {
      const mergedMessages: Array<{
        role: 'user' | 'assistant';
        content: string;
      }> = [];
      let sysPrefix = '';
      for (const m of params.messages) {
        if (m.role === 'system') {
          sysPrefix += `${m.content}\n\n`;
        } else if (m.role === 'user' && sysPrefix) {
          mergedMessages.push({ role: 'user', content: `${sysPrefix}${m.content}` });
          sysPrefix = '';
        } else {
          mergedMessages.push({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
          });
        }
      }
      if (mergedMessages.length === 0 && sysPrefix) {
        mergedMessages.push({ role: 'user', content: sysPrefix });
      }
      res = await sendOnce(endpoint, {
        model: params.model,
        messages: mergedMessages,
        ...(params.maxTokens ? { max_tokens: params.maxTokens } : {}),
      });
    }

    if (res.ok) {
      const json = await res.json();
      const { text, returnedModel } = extractReplyFromJson(json);
      if (text) {
        return {
          ok: true,
          status: res.status,
          content: text,
          returnedModel,
          rawError: '',
        };
      }
      return {
        ok: false,
        status: res.status,
        content: '',
        rawError: 'Модель вернула пустой текст ответа',
      };
    }

    const errText = await res.text().catch(() => '');
    return {
      ok: false,
      status: res.status,
      content: '',
      rawError: errText,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      content: '',
      rawError: err instanceof Error ? `${err.name}: ${err.message}` : 'Сбой сети',
    };
  }
}

export interface ModelProbeResultItem {
  model: string;
  ok: boolean;
  status: number;
  detail: string;
}

export async function testLlmConnectionAndModels(input: {
  llmProvider: string;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
}): Promise<{
  ok: boolean;
  detectedProvider?: AiAutopilotConfig['llmProvider'];
  resolvedBaseUrl: string;
  testedModel: string;
  availableModels: string[];
  balanceRub?: number | null;
  modelProbeResults?: ModelProbeResultItem[];
  latencyMs: number;
  message: string;
}> {
  const t0 = Date.now();
  const key = (input.llmApiKey || '').trim();

  if (!key) {
    return {
      ok: false,
      resolvedBaseUrl: input.llmBaseUrl,
      testedModel: input.llmModel,
      availableModels: [],
      latencyMs: 0,
      message:
        'Вставьте ваш API-ключ (например платный ключ PlusVibe sk-pv-... или токен Ollama Cloud) и нажмите «Проверить и сохранить».',
    };
  }

  if (/\s/.test(key) || key.toLowerCase().includes('initial token')) {
    return {
      ok: false,
      resolvedBaseUrl: input.llmBaseUrl,
      testedModel: input.llmModel,
      availableModels: [],
      latencyMs: 0,
      message:
        'В поле ключа указан текст с пробелами (название ключа), а нужен сам секретный токен без пробелов (например sk-pv-...).',
    };
  }

  const isPlusVibe =
    key.startsWith('sk-pv-') ||
    input.llmProvider === 'PLUSVIBE' ||
    input.llmBaseUrl.toLowerCase().includes('plusvibeapi.ru');

  const effectiveProvider: AiAutopilotConfig['llmProvider'] = isPlusVibe
    ? 'PLUSVIBE'
    : (input.llmProvider as AiAutopilotConfig['llmProvider']);

  const baseUrls = buildCandidateLlmBaseUrls(
    input.llmBaseUrl,
    effectiveProvider,
    key,
  );
  let resolvedBaseUrl = baseUrls[0];
  let availableModels: string[] = [];

  const balancePromise = isPlusVibe
    ? fetchPlusVibeBalanceRub(key, resolvedBaseUrl)
    : Promise.resolve(null);

  // 1. Загружаем список моделей (/v1/models или /api/tags), отсеивая эмбеддинги и медиа
  for (const base of baseUrls) {
    try {
      const res = await fetch(`${base}/models`, {
        method: 'GET',
        signal: AbortSignal.timeout(8000),
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${key}`,
          'User-Agent': LLM_BROWSER_UA,
        },
        cache: 'no-store',
      });

      if (res.ok) {
        const json = (await res.json()) as {
          data?: Array<{ id?: string; type?: string }>;
          models?: Array<{ name?: string; model?: string }>;
        };
        const rawIds = [
          ...(json.data || [])
            .filter((m) => !isNonChatModelId(m.id || '', m.type))
            .map((m) => (m.id || '').trim()),
          ...(json.models || []).map((m) => (m.name || m.model || '').trim()),
        ].filter(Boolean);

        if (rawIds.length > 0) {
          resolvedBaseUrl = base;
          availableModels = prioritizeModelsFreeFirst(rawIds, { isPlusVibe });
          break;
        }
      }
    } catch {
      // пробуем следующий URL или переходим напрямую к POST /chat/completions
    }
  }

  if (isPlusVibe) {
    for (const rec of [...PLUSVIBE_RECOMMENDED_MODELS].reverse()) {
      if (!availableModels.includes(rec)) {
        availableModels.unshift(rec);
      }
    }
  } else if (
    (effectiveProvider === 'OLLAMA' || resolvedBaseUrl.includes('ollama.com')) &&
    !availableModels.includes('deepseek-v4.1-flash')
  ) {
    availableModels = ['deepseek-v4.1-flash', ...availableModels];
  }

  // 2. Формируем очередь проверки моделей
  const rawRequested = (input.llmModel || '').trim();
  const requestedModel =
    isPlusVibe &&
    (!rawRequested ||
      rawRequested.toLowerCase() === 'orcarouter/auto' ||
      rawRequested.toLowerCase().includes('free') ||
      rawRequested === 'deepseek-v4.1-flash')
      ? 'deepseek-v4.1-flash-1017'
      : rawRequested;

  const modelsToProbe: string[] = [];

  if (requestedModel && requestedModel.toLowerCase() !== 'orcarouter/auto') {
    modelsToProbe.push(requestedModel);
  }

  if (availableModels.length > 0) {
    if (!isPlusVibe) {
      const freeOnes = availableModels.filter((m) =>
        m.toLowerCase().includes('free'),
      );
      for (const fm of freeOnes) {
        if (!modelsToProbe.includes(fm)) modelsToProbe.push(fm);
      }
    }
    for (const m of availableModels) {
      if (modelsToProbe.length >= 8) break;
      if (!modelsToProbe.includes(m)) modelsToProbe.push(m);
    }
  } else if (modelsToProbe.length === 0) {
    modelsToProbe.push(
      isPlusVibe ? 'deepseek-v4.1-flash-1017' : 'deepseek-v4.1-flash',
    );
  }

  const probeResults: ModelProbeResultItem[] = [];
  let lastErrorText = 'Не удалось достучаться до сервера API';

  for (const candidateModel of modelsToProbe) {
    const out = await postLlmChatCompletion({
      baseUrl: resolvedBaseUrl,
      apiKey: key,
      model: candidateModel,
      timeoutMs: 22_000,
      messages: [{ role: 'user', content: 'Ответь одним словом на русском: Готов' }],
    });

    if (out.ok) {
      const balanceRub = await balancePromise;
      const balanceBadge =
        balanceRub !== null ? ` · Баланс PlusVibe: ${balanceRub.toFixed(2)} ₽` : '';

      probeResults.push({
        model: candidateModel,
        ok: true,
        status: out.status,
        detail: `Ответила: «${out.content.slice(0, 40)}»`,
      });
      return {
        ok: true,
        detectedProvider: effectiveProvider,
        resolvedBaseUrl,
        testedModel: candidateModel,
        availableModels,
        balanceRub,
        modelProbeResults: probeResults,
        latencyMs: Date.now() - t0,
        message: `Отлично! Живая модель «${candidateModel}» проверена и СОХРАНЕНА в базу (ответ: «${out.content.slice(
          0,
          35,
        )}»${balanceBadge}, доступно моделей: ${availableModels.length || 1} шт.).`,
      };
    }

    const cleanSnippet = out.rawError.includes('<html')
      ? 'HTML-блокировка Cloudflare'
      : out.rawError.replace(/\s+/g, ' ').trim().slice(0, 150);

    probeResults.push({
      model: candidateModel,
      ok: false,
      status: out.status,
      detail: `HTTP ${out.status}: ${cleanSnippet}`,
    });
    lastErrorText = `HTTP ${out.status} (${candidateModel}): ${cleanSnippet}`;

    // Останавливаем перебор при HTTP 401 (неверный ключ) или HTTP 402 (нулевой рублевый баланс на платном ключе)
    if (out.status === 401 || out.status === 402) {
      break;
    }
  }

  const balanceRub = await balancePromise;
  if (probeResults.some((r) => r.status === 402)) {
    return {
      ok: false,
      detectedProvider: effectiveProvider,
      resolvedBaseUrl,
      testedModel: modelsToProbe[0] || requestedModel,
      availableModels,
      balanceRub,
      modelProbeResults: probeResults,
      latencyMs: Date.now() - t0,
      message: `Ключ верный, но на балансе недостаточно средств${
        balanceRub !== null ? ` (текущий баланс: ${balanceRub.toFixed(2)} ₽)` : ''
      }. Пополните баланс картой РФ в кабинете https://plusvibeapi.ru/dashboard и повторите проверку.`,
    };
  }

  const summaryPerModel = probeResults
    .map((r) => `• ${r.model} → ${r.detail}`)
    .join('\n');

  return {
    ok: false,
    detectedProvider: effectiveProvider,
    resolvedBaseUrl,
    testedModel: modelsToProbe[0] || requestedModel,
    availableModels,
    balanceRub,
    modelProbeResults: probeResults,
    latencyMs: Date.now() - t0,
    message:
      probeResults.length > 0
        ? `Проверено моделей на вашем токене: ${probeResults.length} шт., ни одна пока не дала ответ:\n${summaryPerModel}`
        : `Не удалось выполнить запрос (${lastErrorText}).`,
  };
}

/**
 * Генерация аналитического досье через API нейросети (OrcaRouter / DeepSeek / OpenRouter / OpenAI)
 * либо встроенный понятный русскоязычный генератор (0 ₽).
 */
/**
 * ЭТАП ОТБОРА (ИИ-Комитет): из широкого шортлиста матчей и собранных фактов из открытых источников
 * нейросеть отсеивает мутные/равные игры и оставляет ТОЛЬКО матчи с максимальной реальной вероятностью захода.
 */
interface CandidateWithIntel {
  cand: ScannedFixtureCandidate;
  intel: OpenSourceMatchIntel;
}

interface CandidateWithAgentEvaluation extends CandidateWithIntel {
  agentInput: AgentCandidateInput;
  evaluation: Awaited<ReturnType<typeof runAgentCommittee>>['evaluations'][number];
  leaderSummary: string;
}

async function evaluateCandidatesWithAgentCommittee(
  shortlist: CandidateWithIntel[],
  limitCount: number,
  config: AiAutopilotConfig,
): Promise<CandidateWithAgentEvaluation[]> {
  if (shortlist.length === 0) return [];

  const agentInputs: AgentCandidateInput[] = shortlist.map(({ cand, intel }) => ({
    id: cand.externalFixtureId,
    sport: cand.sport,
    leagueName: cand.leagueName,
    homeTeam: cand.homeTeam,
    awayTeam: cand.awayTeam,
    market: cand.suggestedMarket,
    odds: cand.suggestedOdds,
    homeOdds: cand.homeOdds,
    drawOdds: cand.drawOdds,
    awayOdds: cand.awayOdds,
    overOdds: cand.overOdds,
    underOdds: cand.underOdds,
    fairHomeProbPct: intel.fairHomeProbPct,
    fairDrawProbPct: intel.fairDrawProbPct,
    fairAwayProbPct: intel.fairAwayProbPct,
    reliabilityScore: intel.reliabilityScore,
    sources: Array.from(new Set([...intel.sourcesChecked, cand.bookmakerSource])),
    facts: Array.from(
      new Set([
        cand.contextNotes,
        ...intel.teamRecordsAndForm,
        ...intel.webSnippets,
      ]),
    ).filter(Boolean).slice(0, 16),
    headlines: intel.newsHeadlines.slice(0, 8),
    riskFlags: intel.riskFlags.slice(0, 8),
  }));

  const minimumConfidencePct = Math.max(
    0,
    Math.min(100, config.minAgentConfidencePct ?? 60),
  );
  const baseUrls = buildCandidateLlmBaseUrls(
    config.llmBaseUrl,
    config.llmProvider,
    config.llmApiKey,
  );
  const committee = await runAgentCommittee({
    candidates: agentInputs,
    limit: limitCount,
    minimumConfidencePct,
    minimumEdgePct: Math.max(0, config.minValueEdgePct),
    // Для любого прямого выпуска/черновика консенсус обязателен. Отключенный LLM не открывает обходной путь.
    requireConsensus: true,
    apiKey: config.llmApiKey,
    model: config.llmModel.trim() || 'deepseek-v4.1-flash',
    baseUrls,
    complete: async (request) => {
      const result = await postLlmChatCompletion({
        baseUrl: request.baseUrl,
        apiKey: request.apiKey,
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        timeoutMs: request.timeoutMs,
      });
      return { ok: result.ok, content: result.content, rawError: result.rawError };
    },
  });

  const evaluationsById = new Map(
    committee.evaluations.map((evaluation) => [evaluation.id, evaluation]),
  );
  const shortlistById = new Map(shortlist.map((item) => [item.cand.externalFixtureId, item]));
  const selected = committee.selectedIds.flatMap((id) => {
    const item = shortlistById.get(id);
    const agentInput = agentInputs.find((candidate) => candidate.id === id);
    const evaluation = evaluationsById.get(id);
    if (!item || !agentInput || !evaluation?.accepted) return [];
    return [{ ...item, agentInput, evaluation, leaderSummary: committee.leaderSummary }];
  });

  const acceptedIds = new Set(committee.selectedIds);
  const rejected = committee.evaluations
    .filter((evaluation) => !acceptedIds.has(evaluation.id))
    .slice(0, 8)
    .map((evaluation) => `${evaluation.id}: ${evaluation.rejectionReason || 'не прошёл финальный отбор лидера'}`);
  const summary = [
    `Агенты ответили: ${committee.modelAgentsAvailable}/3; консенсус отобранных: ${selected.length}/${shortlist.length}.`,
    committee.leaderSummary,
    ...rejected,
  ].join(' | ').slice(0, 1_200);
  await appendAutopilotLog(
    selected.length > 0 ? 'SUCCESS' : 'WARN',
    'AGENTS',
    summary,
  );

  return selected;
}

function classifyMarketFamily(market: string): string {
  const s = market.toLowerCase();
  if (s.includes('тотал')) return 'TOTAL';
  if (s.includes('фора')) return 'HANDICAP';
  if (s === '1x' || s === 'x2' || s.includes('обе забьют')) return 'DOUBLE_BTTS';
  return 'WIN';
}

function selectDiversifiedCandidates(
  pool: ScannedFixtureCandidate[],
  activePredictions: PredictionRecord[],
  limitCount: number,
): ScannedFixtureCandidate[] {
  const sportCounts = new Map<SportType, number>();
  const familyCounts = new Map<string, number>();

  for (const p of activePredictions) {
    if (p.resultStatus !== 'PENDING') continue;
    sportCounts.set(p.sport, (sportCounts.get(p.sport) || 0) + 1);
    const fam = classifyMarketFamily(p.selectionTitle);
    familyCounts.set(fam, (familyCounts.get(fam) || 0) + 1);
  }

  const remaining = [...pool];
  const chosen: ScannedFixtureCandidate[] = [];

  while (chosen.length < limitCount && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i];
      const spCount = sportCounts.get(c.sport) || 0;
      const fam = classifyMarketFamily(c.suggestedMarket);
      const famCount = familyCounts.get(fam) || 0;

      // Поощряем разнообразие видов спорта и типов ставок на витрине
      const sportPenalty = spCount >= 2 ? (spCount - 1) * 1.65 : spCount * 0.55;
      const familyPenalty = famCount >= 2 ? (famCount - 1) * 1.25 : famCount * 0.4;
      const score =
        c.priorityBonus * 1.8 + c.valueEdgePct - sportPenalty - familyPenalty;

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    const picked = remaining.splice(bestIdx, 1)[0];
    chosen.push(picked);
    sportCounts.set(picked.sport, (sportCounts.get(picked.sport) || 0) + 1);
    const pickedFam = classifyMarketFamily(picked.suggestedMarket);
    familyCounts.set(pickedFam, (familyCounts.get(pickedFam) || 0) + 1);
  }

  return chosen;
}
export async function runAiScanAndGenerateCycle(options?: {
  forcePublish?: boolean;
  triggerLabel?: string;
  maxCountOverride?: number;
}): Promise<{
  scannedCount: number;
  createdCount: number;
  publishedDirectly: boolean;
  feedSource: string;
}> {
  const stateSnapshot = await readState();
  const config = stateSnapshot.aiAutopilot;

  const existingFixtureIds = new Set<string>();
  for (const p of stateSnapshot.predictions) {
    if (p.externalFixtureId) existingFixtureIds.add(p.externalFixtureId);
  }
  for (const d of stateSnapshot.aiDrafts) {
    existingFixtureIds.add(d.externalFixtureId);
  }

  let rawCandidates = await scanFromFonbetRu(config);
  let feedSource = 'Фонбет РФ (прямая линия БК)';

  if (rawCandidates.length === 0) {
    rawCandidates = await scanFromLeonRu(config);
    if (rawCandidates.length > 0) {
      feedSource = 'Леон РФ (прямая линия БК)';
    }
  }

  if (rawCandidates.length === 0) {
    rawCandidates = await scanFromLocalizedLiveCenter(config);
    if (rawCandidates.length > 0) {
      feedSource = 'Реальное расписание матчей (RU локализация)';
    }
  }

  if (rawCandidates.length === 0) {
    rawCandidates = buildQuantitativeFallbackPool(config);
    feedSource = 'Локальный резервный стенд (нет доступа к сети)';
  }

  const limitCount = Math.max(
    1,
    options?.maxCountOverride ?? config.maxPicksPerRun,
  );
  const hasVerifiedBookmakerLine =
    feedSource.startsWith('Фонбет РФ') || feedSource.startsWith('Леон РФ');
  const existingMatches = [...stateSnapshot.predictions, ...stateSnapshot.aiDrafts];
  const eligible = hasVerifiedBookmakerLine
    ? rawCandidates.filter(
        (c) =>
          !existingFixtureIds.has(c.externalFixtureId) &&
          !existingMatches.some((match) => sameFixtureByNamesAndTime(c, match)) &&
          c.valueEdgePct >= config.minValueEdgePct &&
          !c.leagueName.toLowerCase().includes('товарищ') &&
          !c.leagueName.toLowerCase().includes('friendly'),
      )
    : [];

  // Шаг 1: формируем расширенный шортлист из реальной линии разных видов спорта
  const shortlistSize = Math.min(10, Math.max(limitCount * 3, 6));
  const shortlist = selectDiversifiedCandidates(
    eligible,
    stateSnapshot.predictions,
    shortlistSize,
  );

  await mutateState((s) => {
    s.aiAutopilot.lastScanAt = new Date().toISOString();
    s.aiAutopilot.lastFeedSource = feedSource;
  });

  if (shortlist.length === 0) {
    await appendAutopilotLog(
      'INFO',
      'SCANNER',
      hasVerifiedBookmakerLine
        ? `${options?.triggerLabel || 'Сканирование'} (${feedSource}, найдено в линии: ${rawCandidates.length}): подходящих новых матчей нет.`
        : `${options?.triggerLabel || 'Сканирование'} (${feedSource}): выпуск остановлен — нет подтверждённой котировки букмекера; расписание и синтетические коэффициенты не используются.`,
    );
    return {
      scannedCount: rawCandidates.length,
      createdCount: 0,
      publishedDirectly: false,
      feedSource,
    };
  }

  // Шаг 2: собираем реальные новости, травмы, таблицу и превью из открытых источников (и PlusVibe RU Web Search при наличии ключа sk-pv-)
  const doResearch = config.openSourceResearchEnabled !== false;
  const pvKey = config.llmApiKey?.trim().startsWith('sk-pv-')
    ? config.llmApiKey.trim()
    : undefined;
  const shortlistWithIntel = await Promise.all(
    shortlist.map(async (cand) => {
      const intel = doResearch
        ? await gatherMatchOpenSourceIntel({
            sport: cand.sport,
            leagueName: cand.leagueName,
            homeTeam: cand.homeTeam,
            awayTeam: cand.awayTeam,
            homeOdds: cand.homeOdds,
            drawOdds: cand.drawOdds,
            awayOdds: cand.awayOdds,
            existingNotes: cand.contextNotes,
            plusVibeApiKey: pvKey,
          })
        : {
            homeTeam: cand.homeTeam,
            awayTeam: cand.awayTeam,
            leagueName: cand.leagueName,
            sport: cand.sport,
            fairHomeProbPct: null,
            fairDrawProbPct: null,
            fairAwayProbPct: null,
            bookmakerMarginPct: null,
            newsHeadlines: [],
            webSnippets: [],
            teamRecordsAndForm: [cand.contextNotes],
            sourcesChecked: ['Котировки линии БК РФ'],
            reliabilityScore: 70,
            riskFlags: [],
            formattedBrief: cand.contextNotes,
          };
      return { cand, intel };
    }),
  );

  // Шаг 3: три специализированных агента оценивают фактическую линию и данные;
  // без двух PASS, при вето или сбое LLM кандидат не проходит к выпуску.
  const selectedWithAgents = await evaluateCandidatesWithAgentCommittee(
    shortlistWithIntel,
    limitCount,
    config,
  );

  const publishImmediately =
    options?.forcePublish === true || config.mode === 'FULL_AUTOPILOT';

  let hasActiveFreeOnStorefront = stateSnapshot.predictions.some(
    (p) =>
      p.resultStatus === 'PENDING' &&
      p.accessTier === 'FREE' &&
      new Date(p.matchStartsAt).getTime() > Date.now(),
  );

  let createdCount = 0;

  for (let idx = 0; idx < selectedWithAgents.length; idx++) {
    const { cand, intel, agentInput, evaluation, leaderSummary } = selectedWithAgents[idx];
    const agentAnalysis = buildAgentAnalysis({
      candidate: agentInput,
      evaluation,
      leaderSummary,
    });
    // Рынок и цена остаются именно теми, что были зафиксированы в линии; LLM их не переписывает.
    const dossier = {
      selectionTitle: cand.suggestedMarket,
      fixedOdds: cand.suggestedOdds,
      stakeUnits: agentAnalysis.stakeUnits,
      confidencePct: evaluation.estimatedWinProbabilityPct,
      valueEdgePct: evaluation.valueEdgePct,
      analysisTeaser: agentAnalysis.teaser,
      analysisFull: agentAnalysis.full,
      agentReport: agentAnalysis.report,
    };

    const nextSeq = stateSnapshot.aiAutopilot.totalGeneratedCount + idx + 1;
    const forceFreeToKeepStorefrontWarm =
      config.freeEveryNthPick > 0 &&
      !hasActiveFreeOnStorefront &&
      selectedWithAgents.length >= 2 &&
      idx === selectedWithAgents.length - 1;
    const isFreeLeadMagnet =
      forceFreeToKeepStorefrontWarm ||
      (config.freeEveryNthPick > 0 && nextSeq % config.freeEveryNthPick === 0);
    if (isFreeLeadMagnet) {
      hasActiveFreeOnStorefront = true;
    }
    const accessTier: AccessTier = isFreeLeadMagnet ? 'FREE' : 'PAID_SINGLE';
    const priceRub = accessTier === 'PAID_SINGLE' ? config.defaultAiPriceRub : null;
    const insured = accessTier === 'PAID_SINGLE' ? config.insureAiPicks : false;

    if (publishImmediately) {
      await createPredictionByAdmin({
        sport: cand.sport,
        leagueName: cand.leagueName,
        homeTeam: cand.homeTeam,
        awayTeam: cand.awayTeam,
        homeLogoUrl: normalizeFonbetTeamImageUrl(cand.homeLogoUrl),
        awayLogoUrl: normalizeFonbetTeamImageUrl(cand.awayLogoUrl),
        fonbetHomeTeamId: cand.fonbetHomeTeamId ?? null,
        fonbetAwayTeamId: cand.fonbetAwayTeamId ?? null,
        agentReport: dossier.agentReport,
        matchStartsAt: cand.matchStartsAt,
        selectionTitle: dossier.selectionTitle,
        fixedOdds: dossier.fixedOdds,
        stakeUnits: dossier.stakeUnits,
        bookmakerSource: cand.bookmakerSource,
        accessTier,
        singlePriceRub: priceRub,
        isFeatured: idx === 0 && accessTier === 'PAID_SINGLE',
        insuredOnLoss: insured,
        authorSource: 'AI_AUTOPILOT',
        externalFixtureId: cand.externalFixtureId,
        aiConfidencePct: dossier.confidencePct,
        aiEdgePct: dossier.valueEdgePct,
        researchSummary: intel.formattedBrief,
        researchSources: intel.sourcesChecked,
        analysisTeaser: dossier.analysisTeaser,
        analysisFull: dossier.analysisFull,
        pushToTelegram: true,
      });

      await mutateState((s) => {
        s.aiAutopilot.totalGeneratedCount += 1;
      });
      createdCount += 1;
    } else {
      const draft: AiPredictionDraft = {
        id: `aidraft_${randomUUID().slice(0, 8)}`,
        externalFixtureId: cand.externalFixtureId,
        sport: cand.sport,
        leagueName: cand.leagueName,
        homeTeam: cand.homeTeam,
        awayTeam: cand.awayTeam,
        homeLogoUrl: normalizeFonbetTeamImageUrl(cand.homeLogoUrl),
        awayLogoUrl: normalizeFonbetTeamImageUrl(cand.awayLogoUrl),
        fonbetHomeTeamId: cand.fonbetHomeTeamId ?? null,
        fonbetAwayTeamId: cand.fonbetAwayTeamId ?? null,
        agentReport: dossier.agentReport,
        matchStartsAt: cand.matchStartsAt,
        selectionTitle: dossier.selectionTitle,
        fixedOdds: dossier.fixedOdds,
        stakeUnits: dossier.stakeUnits,
        bookmakerSource: cand.bookmakerSource,
        accessTier,
        singlePriceRub: priceRub,
        insuredOnLoss: insured,
        confidencePct: dossier.confidencePct,
        valueEdgePct: dossier.valueEdgePct,
        analysisTeaser: dossier.analysisTeaser,
        analysisFull: dossier.analysisFull,
        researchSummary: intel.formattedBrief,
        researchSources: intel.sourcesChecked,
        createdAt: new Date().toISOString(),
      };

      await mutateState((s) => {
        s.aiDrafts.unshift(draft);
        s.aiAutopilot.totalGeneratedCount += 1;
      });
      createdCount += 1;
    }
  }

  await appendAutopilotLog(
    'SUCCESS',
    publishImmediately ? 'PUBLISHER' : 'LLM_ANALYST',
    publishImmediately
      ? `Выставлено ${createdCount} реальных матчей на витрину (+анонс в Telegram). Источник: ${feedSource}.`
      : `Подготовлено ${createdCount} реальных матчей в очередь проверки. Источник: ${feedSource}.`,
  );

  return {
    scannedCount: rawCandidates.length,
    createdCount,
    publishedDirectly: publishImmediately,
    feedSource,
  };
}

/**
 * В 1 клик удаляет стартовые демо-карточки (pred_init_*) и заполняет витрину свежими реальными матчами
 */
export async function replaceDemoWithRealMatches(): Promise<{
  removedDemoCount: number;
  createdCount: number;
  feedSource: string;
}> {
  const removedDemoCount = await mutateState((s) => {
    const before = s.predictions.length;
    s.predictions = s.predictions.filter(
      (p) => !p.id.startsWith('pred_init_') || p.resultStatus !== 'PENDING',
    );
    s.aiDrafts = [];
    return before - s.predictions.length;
  });

  const scanRes = await runAiScanAndGenerateCycle({
    forcePublish: true,
    maxCountOverride: 6,
    triggerLabel: 'Замена стартовых демо на реальные матчи',
  });

  return {
    removedDemoCount,
    createdCount: scanRes.createdCount,
    feedSource: scanRes.feedSource,
  };
}

/**
 * Публикация продающего дайджеста витрины и верифицированной статистики в Telegram-канал (в 1 клик или по автопилоту)
 */
export async function broadcastDailyDigestToTelegram(): Promise<{
  sent: boolean;
  error?: string;
}> {
  const state = await readState();
  const settled = state.predictions.filter((p) => p.resultStatus !== 'PENDING');
  const wins = settled.filter((p) => p.resultStatus === 'WIN').length;
  const losses = settled.filter((p) => p.resultStatus === 'LOSS').length;
  const winRate =
    wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;

  let netUnits = 0;
  for (const p of settled) {
    if (p.resultStatus === 'WIN') netUnits += p.stakeUnits * (p.fixedOdds - 1);
    else if (p.resultStatus === 'LOSS') netUnits -= p.stakeUnits;
  }

  const upcoming = state.predictions
    .filter(
      (p) =>
        p.resultStatus === 'PENDING' &&
        new Date(p.matchStartsAt).getTime() > Date.now(),
    )
    .sort(
      (a, b) =>
        new Date(a.matchStartsAt).getTime() - new Date(b.matchStartsAt).getTime(),
    )
    .slice(0, 5);

  const upcomingLines =
    upcoming.length > 0
      ? upcoming.map((p, idx) => {
          const tStr = new Date(p.matchStartsAt).toLocaleString('ru-RU', {
            timeZone: 'Europe/Moscow',
            hour: '2-digit',
            minute: '2-digit',
          });
          const tag =
            p.accessTier === 'FREE'
              ? '🎁 0 ₽ (бесплатно)'
              : `${p.singlePriceRub ?? state.settings.defaultSinglePriceRub} ₽${
                  p.insuredOnLoss ? ' · 🛡 страховка' : ''
                }`;
          return `${idx + 1}. <b>${p.homeTeam} — ${p.awayTeam}</b> (${tStr} МСК) — ${tag}`;
        })
      : ['Свежая линия загружается — следите за витриной!'];

  const siteBase = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
  const html = [
    `🔥 <b>Сводка линии и результатов на ${state.settings.brandName}</b>`,
    ``,
    `📊 <b>Открытая статистика (защита SHA-256):</b>`,
    `✅ Побед: <b>${wins}</b> · ❌ Минусов: <b>${losses}</b> (${winRate}% прохода)`,
    `📈 Прирост к игровому банку: <b>${netUnits >= 0 ? '+' : ''}${netUnits.toFixed(1)}%</b>`,
    ``,
    `⚡ <b>Сегодня на витрине:</b>`,
    ...upcomingLines,
    ``,
    `💎 Набор из 3 матчей со скидкой <b>−${state.settings.bundle3DiscountPct}%</b> · Промокод новичкам: <code>START15</code> (−15%)`,
  ].join('\n');

  const res = await sendTelegramChannelAnnouncement(
    state.settings,
    html,
    siteBase
      ? { text: '🔥 Открыть витрину матчей →', url: siteBase }
      : undefined,
  );

  if (res.sent) {
    await appendAutopilotLog(
      'SUCCESS',
      'PUBLISHER',
      'В Telegram-канал опубликована сводка актуальных матчей и открытой статистики.',
    );
  }

  return res;
}

/**
 * Одобрение черновика ИИ на витрину в 1 клик
 */
export async function approveAiDraftToStorefront(
  draftId: string,
): Promise<PredictionRecord> {
  const state = await readState();
  const draft = state.aiDrafts.find((d) => d.id === draftId);
  if (!draft) throw new Error('Черновик не найден');

  const created = await createPredictionByAdmin({
    sport: draft.sport,
    leagueName: draft.leagueName,
    homeTeam: draft.homeTeam,
    awayTeam: draft.awayTeam,
    homeLogoUrl: normalizeFonbetTeamImageUrl(draft.homeLogoUrl),
    awayLogoUrl: normalizeFonbetTeamImageUrl(draft.awayLogoUrl),
    fonbetHomeTeamId: draft.fonbetHomeTeamId ?? null,
    fonbetAwayTeamId: draft.fonbetAwayTeamId ?? null,
    agentReport: draft.agentReport ?? null,
    matchStartsAt: draft.matchStartsAt,
    selectionTitle: draft.selectionTitle,
    fixedOdds: draft.fixedOdds,
    stakeUnits: draft.stakeUnits,
    bookmakerSource: draft.bookmakerSource,
    accessTier: draft.accessTier,
    singlePriceRub: draft.singlePriceRub,
    insuredOnLoss: draft.insuredOnLoss,
    authorSource: 'AI_AUTOPILOT',
    externalFixtureId: draft.externalFixtureId,
    aiConfidencePct: draft.confidencePct,
    aiEdgePct: draft.valueEdgePct,
    researchSummary: draft.researchSummary ?? null,
    researchSources: draft.researchSources ?? [],
    analysisTeaser: draft.analysisTeaser,
    analysisFull: draft.analysisFull,
    pushToTelegram: true,
  });

  await mutateState((s) => {
    s.aiDrafts = s.aiDrafts.filter((d) => d.id !== draftId);
  });

  await appendAutopilotLog(
    'SUCCESS',
    'PUBLISHER',
    `Опубликован прогноз «${draft.homeTeam} — ${draft.awayTeam}» (${draft.selectionTitle} @ ${draft.fixedOdds.toFixed(2)}).`,
  );

  return created;
}

/**
 * Точный математический расчет рынка по официальному счету матча
 */
export function evaluateMarketByScore(
  selectionTitle: string,
  homeScore: number,
  awayScore: number,
  isOvertime = false,
  sport?: SportType,
): ResultStatus | null {
  const s = selectionTitle.toLowerCase().trim();
  const total = homeScore + awayScore;
  const diff = homeScore - awayScore;
  const regulationSport = sport === 'FOOTBALL' || sport === 'HOCKEY';
  const winnerOnlySport = sport === 'TENNIS' || sport === 'MMA' || sport === 'ESPORTS';

  // Ищем число линии как в скобках (-1.0), так и без скобок (Тотал больше 2.5 / Фора 1 -1.5)
  const parenMatch = s.match(/\(([+-]?\d+(?:[.,]\d+)?)\)/);
  const tailMatch = s.match(
    /(?:больше|меньше|тб|тм|итб1?|итб2|итм1?|итм2|фора\s*[12])\s*([+-]?\d+(?:[.,]\d+)?)/,
  );
  const rawNum = parenMatch?.[1] ?? tailMatch?.[1] ?? null;
  const lineVal = rawNum !== null ? Number(rawNum.replace(',', '.')) : null;

  // Победа с учетом ОТ и буллитов («Победа 1 в матче», «Итоговая победа 1»)
  if (
    (s.includes('победа 1') || s.startsWith('п1')) &&
    (s.includes('в матче') || s.includes('от') || s.includes('итогов'))
  ) {
    // В футболе отметка ОТ/пенальти не всегда говорит, что score — результат серии;
    // не рассчитываем такой рынок без отдельной структуры для пенальти.
    if (sport === 'FOOTBALL' && isOvertime) return null;
    return homeScore > awayScore ? 'WIN' : 'LOSS';
  }
  if (
    (s.includes('победа 2') || s.startsWith('п2')) &&
    (s.includes('в матче') || s.includes('от') || s.includes('итогов'))
  ) {
    if (sport === 'FOOTBALL' && isOvertime) return null;
    return awayScore > homeScore ? 'WIN' : 'LOSS';
  }

  // Для футбола/хоккея стандартный П1/П2 — исход основного времени;
  // если была ОТ/серия буллитов, основное время завершилось вничью.
  if (s === 'победа 1' || s === 'п1' || s.startsWith('победа 1 ')) {
    if (regulationSport && isOvertime) return 'LOSS';
    return homeScore > awayScore ? 'WIN' : 'LOSS';
  }
  if (s === 'победа 2' || s === 'п2' || s.startsWith('победа 2 ')) {
    if (regulationSport && isOvertime) return 'LOSS';
    return awayScore > homeScore ? 'WIN' : 'LOSS';
  }

  // Для тенниса, MMA и киберспорта без доверенной структуры счёта
  // автоматически рассчитываем только победителя, а не тоталы/форы.
  if (winnerOnlySport) return null;

  if (s === 'ничья' || s === 'x' || s === 'х') {
    if (regulationSport && isOvertime) return 'WIN';
    return homeScore === awayScore ? 'WIN' : 'LOSS';
  }
  if (s === '1x' || s === '1х' || s.includes('первая не проиграет')) {
    if (regulationSport && isOvertime) return 'WIN';
    return homeScore >= awayScore ? 'WIN' : 'LOSS';
  }
  if (s === 'x2' || s === 'х2' || s.includes('вторая не проиграет')) {
    if (regulationSport && isOvertime) return 'WIN';
    return awayScore >= homeScore ? 'WIN' : 'LOSS';
  }

  // После ОТ у обычного футбольного/хоккейного счёта недостаточно данных,
  // чтобы восстановить regulation totals, BTTS или ненулевую фору.
  if (regulationSport && isOvertime) {
    if (s.includes('фора') && lineVal !== null && Math.abs(lineVal) < 0.01) return 'PUSH';
    if (
      s.includes('обе забьют') ||
      s.includes('тотал') ||
      s.startsWith('тб') ||
      s.startsWith('тм') ||
      s.includes('итб') ||
      s.includes('итм') ||
      s.includes('фора')
    ) {
      return null;
    }
  }

  if (s.includes('обе забьют') && (s.includes('тб') || s.includes('больше'))) {
    const reqTotal = lineVal ?? 2.5;
    return homeScore > 0 && awayScore > 0 && total > reqTotal ? 'WIN' : 'LOSS';
  }
  if (s.includes('обе забьют: да') || s === 'обе забьют') {
    return homeScore > 0 && awayScore > 0 ? 'WIN' : 'LOSS';
  }
  if (s.includes('обе забьют: нет')) {
    return homeScore === 0 || awayScore === 0 ? 'WIN' : 'LOSS';
  }

  if (lineVal !== null && Number.isFinite(lineVal)) {
    if (s.includes('индивидуальный тотал 1 больше') || s.includes('итб1')) {
      if (homeScore > lineVal) return 'WIN';
      if (homeScore === lineVal) return 'PUSH';
      return 'LOSS';
    }
    if (s.includes('индивидуальный тотал 2 больше') || s.includes('итб2')) {
      if (awayScore > lineVal) return 'WIN';
      if (awayScore === lineVal) return 'PUSH';
      return 'LOSS';
    }
    if (s.includes('индивидуальный тотал 1 меньше') || s.includes('итм1')) {
      if (homeScore < lineVal) return 'WIN';
      if (homeScore === lineVal) return 'PUSH';
      return 'LOSS';
    }
    if (s.includes('индивидуальный тотал 2 меньше') || s.includes('итм2')) {
      if (awayScore < lineVal) return 'WIN';
      if (awayScore === lineVal) return 'PUSH';
      return 'LOSS';
    }
    if (s.includes('тотал больше') || s.startsWith('тб')) {
      if (total > lineVal) return 'WIN';
      if (total === lineVal) return 'PUSH';
      return 'LOSS';
    }
    if (s.includes('тотал меньше') || s.startsWith('тм')) {
      if (total < lineVal) return 'WIN';
      if (total === lineVal) return 'PUSH';
      return 'LOSS';
    }
    if (s.includes('фора 1')) {
      const regulationScoreUnknown = regulationSport && isOvertime;
      const legacyOvertimeZeroHandicap = sport === undefined && isOvertime;
      const effDiff =
        (regulationScoreUnknown || legacyOvertimeZeroHandicap) && Math.abs(lineVal) < 0.01
          ? 0
          : diff;
      const adj = effDiff + lineVal;
      if (adj > 0.25) return 'WIN';
      if (Math.abs(adj) <= 0.01) return 'PUSH';
      return 'LOSS';
    }
    if (s.includes('фора 2')) {
      const regulationScoreUnknown = regulationSport && isOvertime;
      const legacyOvertimeZeroHandicap = sport === undefined && isOvertime;
      const effDiff =
        (regulationScoreUnknown || legacyOvertimeZeroHandicap) && Math.abs(lineVal) < 0.01
          ? 0
          : -diff;
      const adj = effDiff + lineVal;
      if (adj > 0.25) return 'WIN';
      if (Math.abs(adj) <= 0.01) return 'PUSH';
      return 'LOSS';
    }
  }

  return null;
}

interface MatchObservation {
  externalFixtureId: string;
  sport: SportType | null;
  lifecycle: MatchLifecycleStatus;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  isOvertime: boolean;
  scheduledAt: string | null;
  actualStartedAt: string | null;
  actualFinishedAt: string | null;
  source: string;
  observedAt: string;
}

function parseObservationTimestamp(raw: unknown): string | null {
  const numeric =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && /^\d{10,13}$/.test(raw.trim())
        ? Number(raw.trim())
        : NaN;
  if (Number.isFinite(numeric) && numeric > 0) {
    const milliseconds = numeric > 10_000_000_000 ? numeric : numeric * 1000;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof raw === 'string' && raw.trim()) {
    const date = new Date(raw.trim());
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function parseScorePart(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0) return raw;
  if (typeof raw === 'string' && /^\s*\d+\s*$/.test(raw)) {
    const value = Number(raw.trim());
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  return null;
}

function parseScorePair(
  homeRaw: unknown,
  awayRaw: unknown,
  scoreText?: string | null,
): { homeScore: number | null; awayScore: number | null } {
  const homeScore = parseScorePart(homeRaw);
  const awayScore = parseScorePart(awayRaw);
  if (homeScore !== null && awayScore !== null) return { homeScore, awayScore };
  const match = typeof scoreText === 'string'
    ? scoreText.match(/(?:^|\D)(\d+)\s*[:\-]\s*(\d+)(?:\D|$)/)
    : null;
  if (!match) return { homeScore: null, awayScore: null };
  const parsedHome = Number(match[1]);
  const parsedAway = Number(match[2]);
  return Number.isSafeInteger(parsedHome) && Number.isSafeInteger(parsedAway)
    ? { homeScore: parsedHome, awayScore: parsedAway }
    : { homeScore: null, awayScore: null };
}

function isOvertimeScore(scoreText?: string | null, detail?: string | null): boolean {
  const text = `${scoreText || ''} ${detail || ''}`;
  const overtimeMarker = /(^|[^a-zа-яё0-9])(?:ot|от|overtime)\.?(?=$|[^a-zа-яё0-9])/i.test(text);
  const shootoutMarker =
    /(?:^|[(/])\s*(?:so|s\/o)\s*(?=$|[)\s.,/])/i.test(text) ||
    /(^|[^a-zа-яё0-9])SO(?=$|[^a-zа-яё0-9])/.test(text);
  return overtimeMarker || shootoutMarker || /буллит|пенальт|shoot-?out/i.test(text);
}

function lifecycleFromEspnStatus(status: {
  type?: {
    state?: string;
    completed?: boolean;
    name?: string;
    description?: string;
    detail?: string;
  };
} | undefined): MatchLifecycleStatus {
  const type = status?.type;
  const state = (type?.state || '').toLowerCase();
  const detail = `${type?.name || ''} ${type?.description || ''} ${type?.detail || ''}`.toLowerCase();
  if (/cancel/.test(detail)) return 'CANCELLED';
  if (/postpon/.test(detail)) return 'POSTPONED';
  if (type?.completed === true || state === 'post') return 'FINISHED';
  if (state === 'in') return 'LIVE';
  if (state === 'pre') return 'SCHEDULED';
  return 'UNKNOWN';
}

async function fetchEspnMatchObservations(): Promise<MatchObservation[]> {
  const scoreRange = `${formatYmdCompact(Date.now() - 3 * 86_400_000)}-${formatYmdCompact(
    Date.now() + 2 * 86_400_000,
  )}`;
  const observations = await Promise.all(
    ESPN_ENDPOINTS.map(async (feed) => {
      const payload = await fetchJsonWithHeaders<{
        events?: Array<{
          id: string;
          date?: string;
          status?: {
            actualStartTime?: string | number;
            actualStartedAt?: string | number;
            actualFinishTime?: string | number;
            actualFinishedAt?: string | number;
            type?: {
              state?: string;
              completed?: boolean;
              name?: string;
              description?: string;
              detail?: string;
            };
          };
          competitions?: Array<{
            competitors?: Array<{
              homeAway?: 'home' | 'away';
              score?: string;
              team?: { displayName?: string };
              athlete?: { displayName?: string };
            }>;
          }>;
        }>;
      }>(`${feed.url}?dates=${scoreRange}`, 5000);
      const observedAt = new Date().toISOString();
      const rows: MatchObservation[] = [];
      for (const event of payload?.events || []) {
        const lifecycle = lifecycleFromEspnStatus(event.status);
        if (lifecycle === 'UNKNOWN') continue;
        const competitors = event.competitions?.[0]?.competitors || [];
        const home = competitors.find((row) => row.homeAway?.toLowerCase() === 'home') || competitors[0];
        const away = competitors.find((row) => row.homeAway?.toLowerCase() === 'away') || competitors[1];
        const homeTeam = home?.team?.displayName || home?.athlete?.displayName || '';
        const awayTeam = away?.team?.displayName || away?.athlete?.displayName || '';
        if (!homeTeam || !awayTeam) continue;
        const score = parseScorePair(home?.score, away?.score);
        const details = `${event.status?.type?.name || ''} ${event.status?.type?.detail || ''}`;
        rows.push({
          externalFixtureId: `espn_${event.id}`,
          sport: feed.sport,
          lifecycle,
          homeTeam,
          awayTeam,
          homeScore: score.homeScore,
          awayScore: score.awayScore,
          isOvertime: isOvertimeScore(null, details),
          scheduledAt: parseObservationTimestamp(event.date),
          actualStartedAt: parseObservationTimestamp(
            event.status?.actualStartTime ?? event.status?.actualStartedAt,
          ),
          actualFinishedAt: parseObservationTimestamp(
            event.status?.actualFinishTime ?? event.status?.actualFinishedAt,
          ),
          source: 'ESPN Scoreboard',
          observedAt,
        });
      }
      return rows;
    }),
  );
  return observations.flat();
}

async function fetchFonbetLiveObservations(): Promise<MatchObservation[]> {
  type LineEvent = {
    id: number | string;
    level?: number;
    sportId?: number;
    place?: string;
    name?: string;
    team1?: string;
    team2?: string;
    startTime?: number | string;
    score?: string;
    score1?: number | string;
    score2?: number | string;
  };
  const urls = await discoverFonbetLineUrls();
  for (const url of urls.slice(0, 5)) {
    const data = await fetchJsonWithHeaders<{ events?: LineEvent[] }>(url, 5000, {
      Origin: 'https://www.fon.bet',
      Referer: 'https://www.fon.bet/',
    });
    if (!Array.isArray(data?.events) || data.events.length === 0) continue;
    const observedAt = new Date().toISOString();
    const rows: MatchObservation[] = [];
    for (const event of data.events) {
      if (event.level !== undefined && event.level !== 1) continue;
      let homeTeam = event.team1?.trim() || '';
      let awayTeam = event.team2?.trim() || '';
      if ((!homeTeam || !awayTeam) && event.name) {
        const parts = event.name.split(/\s+[—–-]\s+/);
        if (parts.length === 2) {
          homeTeam = parts[0].trim();
          awayTeam = parts[1].trim();
        }
      }
      if (!homeTeam || !awayTeam) continue;
      const place = (event.place || '').toLowerCase();
      const lifecycle: MatchLifecycleStatus = place === 'live' || place.includes('live')
        ? 'LIVE'
        : place.includes('postpon')
          ? 'POSTPONED'
          : place.includes('cancel')
            ? 'CANCELLED'
            : 'UNKNOWN';
      if (lifecycle === 'UNKNOWN') continue;
      const score = parseScorePair(event.score1, event.score2, event.score);
      rows.push({
        externalFixtureId: `fonbet_${event.id}`,
        sport: null,
        lifecycle,
        homeTeam,
        awayTeam,
        homeScore: score.homeScore,
        awayScore: score.awayScore,
        isOvertime: isOvertimeScore(event.score),
        scheduledAt: parseObservationTimestamp(event.startTime),
        actualStartedAt: null,
        actualFinishedAt: null,
        source: 'Fonbet live line',
        observedAt,
      });
    }
    if (rows.length > 0) return rows;
  }
  return [];
}

async function fetchFonbetFinalObservations(): Promise<MatchObservation[]> {
  type ResultEvent = {
    id: number | string;
    team1?: string;
    team2?: string;
    name?: string;
    status?: number | string;
    score?: string;
    score1?: number | string;
    score2?: number | string;
    startTime?: number | string;
    finishTime?: number | string;
    endTime?: number | string;
  };
  const datesToCheck = [0, 1, 2].map((daysAgo) =>
    new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10),
  );
  const observations: MatchObservation[] = [];

  for (const dateStr of datesToCheck) {
    for (const host of STATIC_FONBET_RESULTS_HOSTS) {
      const data = await fetchJsonWithHeaders<{
        events?: ResultEvent[];
        sections?: Array<{ events?: ResultEvent[] }>;
      }>(`${host}/results/results.json.php?locale=ru&lineDate=${dateStr}`, 5000, {
        Origin: 'https://www.fon.bet',
        Referer: 'https://www.fon.bet/',
      });
      const events = [
        ...(data?.events || []),
        ...(data?.sections?.flatMap((section) => section.events || []) || []),
      ];
      if (events.length === 0) continue;
      const observationCountBeforeMirror = observations.length;
      const observedAt = new Date().toISOString();
      for (const event of events) {
        // Принимаем только явный финальный статус; пустой/неизвестный status не является подтверждением.
        if (Number(event.status) !== 3) continue;
        let homeTeam = event.team1?.trim() || '';
        let awayTeam = event.team2?.trim() || '';
        if ((!homeTeam || !awayTeam) && event.name) {
          const parts = event.name.split(/\s+[—–-]\s+/);
          if (parts.length === 2) {
            homeTeam = parts[0].trim();
            awayTeam = parts[1].trim();
          }
        }
        if (!homeTeam || !awayTeam) continue;
        const score = parseScorePair(event.score1, event.score2, event.score);
        observations.push({
          externalFixtureId: `fonbet_${event.id}`,
          sport: null,
          lifecycle: 'FINISHED',
          homeTeam,
          awayTeam,
          homeScore: score.homeScore,
          awayScore: score.awayScore,
          isOvertime: isOvertimeScore(event.score),
          scheduledAt: parseObservationTimestamp(event.startTime),
          actualStartedAt: null,
          actualFinishedAt: parseObservationTimestamp(event.finishTime ?? event.endTime),
          source: 'Fonbet results',
          observedAt,
        });
      }
      if (
        observations
          .slice(observationCountBeforeMirror)
          .some((observation) => observation.homeScore !== null && observation.awayScore !== null)
      ) {
        break;
      }
    }
  }
  return observations;
}

async function fetchMatchObservations(): Promise<MatchObservation[]> {
  const [fonbetLive, fonbetFinal, espn] = await Promise.all([
    fetchFonbetLiveObservations(),
    fetchFonbetFinalObservations(),
    fetchEspnMatchObservations(),
  ]);
  return [...fonbetLive, ...fonbetFinal, ...espn];
}

function matchObservationToPrediction(
  prediction: PredictionRecord,
  observation: MatchObservation,
): { order: 'DIRECT' | 'SWAPPED'; exactId: boolean } | null {
  if (observation.sport && observation.sport !== prediction.sport) return null;
  const order = matchTeamPairOrder(
    observation.homeTeam,
    observation.awayTeam,
    prediction.homeTeam,
    prediction.awayTeam,
    prediction.sport,
  );
  if (!order) return null;
  const exactId = Boolean(
    prediction.externalFixtureId &&
      observation.externalFixtureId === prediction.externalFixtureId,
  );
  if (!exactId) {
    const predictedAt = Date.parse(prediction.matchStartsAt);
    const observedAt = observation.scheduledAt ? Date.parse(observation.scheduledAt) : NaN;
    if (
      !Number.isFinite(predictedAt) ||
      !Number.isFinite(observedAt) ||
      Math.abs(predictedAt - observedAt) > 36 * 60 * 60_000
    ) {
      return null;
    }
  }
  return { order, exactId };
}

function getOrderedObservationScore(
  observation: MatchObservation,
  order: 'DIRECT' | 'SWAPPED',
): { homeScore: number; awayScore: number } | null {
  if (observation.homeScore === null || observation.awayScore === null) return null;
  return order === 'DIRECT'
    ? { homeScore: observation.homeScore, awayScore: observation.awayScore }
    : { homeScore: observation.awayScore, awayScore: observation.homeScore };
}

function analyzeFinalScoreSources(
  rows: Array<{
    observation: MatchObservation;
    score: { homeScore: number; awayScore: number };
  }>,
): {
  sources: Set<string>;
  scores: Set<string>;
  agree: boolean;
  conflict: boolean;
} {
  const scoresBySource = new Map<string, Set<string>>();
  for (const row of rows) {
    const score = `${row.score.homeScore}:${row.score.awayScore}`;
    if (!scoresBySource.has(row.observation.source)) {
      scoresBySource.set(row.observation.source, new Set());
    }
    scoresBySource.get(row.observation.source)!.add(score);
  }
  const allScores = Array.from(scoresBySource.values()).flatMap((values) => Array.from(values));
  const scores = new Set(allScores);
  const hasInternalSourceConflict = Array.from(scoresBySource.values()).some(
    (values) => values.size > 1,
  );
  return {
    sources: new Set(Array.from(scoresBySource.keys())),
    scores,
    agree: scoresBySource.size >= 2 && scores.size === 1 && !hasInternalSourceConflict,
    conflict: scores.size > 1 || hasInternalSourceConflict,
  };
}

export async function runMatchStatusWatchCycle(): Promise<{
  checkedCount: number;
  updatedCount: number;
  conflictCount: number;
}> {
  const state = await readState();
  const nowMs = Date.now();
  const monitored = state.predictions.filter((prediction) => {
    if (prediction.resultStatus !== 'PENDING') return false;
    const startsAt = Date.parse(prediction.matchStartsAt);
    return Number.isFinite(startsAt) && startsAt >= nowMs - 7 * 86_400_000 && startsAt <= nowMs + 24 * 60 * 60_000;
  });
  if (monitored.length === 0) return { checkedCount: 0, updatedCount: 0, conflictCount: 0 };

  const observations = await fetchMatchObservations();
  if (observations.length === 0) return { checkedCount: monitored.length, updatedCount: 0, conflictCount: 0 };

  let updatedCount = 0;
  let conflictCount = 0;
  let verifiedFinalCount = 0;
  const sourceLog: string[] = [];
  const matchedByPrediction = new Map<string, Array<{
    observation: MatchObservation;
    order: 'DIRECT' | 'SWAPPED';
    exactId: boolean;
  }>>();
  const idConflictIds = new Set<string>();

  for (const prediction of monitored) {
    const idObservations = prediction.externalFixtureId
      ? observations.filter((observation) => observation.externalFixtureId === prediction.externalFixtureId)
      : [];
    const idPairMismatch = idObservations.some((observation) =>
      !matchTeamPairOrder(
        observation.homeTeam,
        observation.awayTeam,
        prediction.homeTeam,
        prediction.awayTeam,
        prediction.sport,
      ),
    );
    const matches = observations.flatMap((observation) => {
      const matched = matchObservationToPrediction(prediction, observation);
      return matched ? [{ observation, order: matched.order, exactId: matched.exactId }] : [];
    });
    if (matches.length > 0 || idPairMismatch) matchedByPrediction.set(prediction.id, matches);
    if (idPairMismatch) idConflictIds.add(prediction.id);

    const finalMatches = matches.filter((row) => row.observation.lifecycle === 'FINISHED');
    const finalsWithScores = finalMatches.flatMap((row) => {
      const score = getOrderedObservationScore(row.observation, row.order);
      return score ? [{ ...row, score }] : [];
    });
    const scoreEvidence = analyzeFinalScoreSources(finalsWithScores);
    const sourcesAgree = scoreEvidence.agree;
    const hasScoreConflict = scoreEvidence.conflict || idPairMismatch;
    const persistentConflict = prediction.matchVerificationConflict && !sourcesAgree;
    const conflict = hasScoreConflict || persistentConflict;
    if (conflict && !prediction.matchVerificationConflict) conflictCount += 1;
    if (finalMatches.length > 0 && sourcesAgree && !conflict) {
      verifiedFinalCount += 1;
    }

    const liveMatches = matches
      .filter((row) => row.observation.lifecycle === 'LIVE')
      .sort((a, b) => Number(b.exactId) - Number(a.exactId));
    const scheduledMatches = matches.filter((row) => row.observation.lifecycle === 'SCHEDULED');
    const cancelledMatch = matches.find((row) => row.observation.lifecycle === 'CANCELLED');
    const postponedMatch = matches.find((row) => row.observation.lifecycle === 'POSTPONED');
    const preferredFinal = [...finalMatches].sort((a, b) => Number(b.exactId) - Number(a.exactId))[0];
    const preferredLive = liveMatches[0];
    const observationAt = preferredFinal?.observation.observedAt ||
      preferredLive?.observation.observedAt ||
      scheduledMatches[0]?.observation.observedAt ||
      cancelledMatch?.observation.observedAt ||
      postponedMatch?.observation.observedAt;
    if (observationAt) sourceLog.push(`${prediction.homeTeam}—${prediction.awayTeam}`);
  }

  const nowIso = new Date().toISOString();
  const mutation = await mutateState((current) => {
    let changed = 0;
    let conflicts = 0;
    for (const prediction of current.predictions) {
      const matches = matchedByPrediction.get(prediction.id) || [];
      if ((!matches.length && !idConflictIds.has(prediction.id)) || prediction.resultStatus !== 'PENDING') continue;
      const idObservations = prediction.externalFixtureId
        ? observations.filter((observation) => observation.externalFixtureId === prediction.externalFixtureId)
        : [];
      const idPairMismatch = idObservations.some((observation) =>
        !matchTeamPairOrder(
          observation.homeTeam,
          observation.awayTeam,
          prediction.homeTeam,
          prediction.awayTeam,
          prediction.sport,
        ),
      );
      const finalMatches = matches.filter((row) => row.observation.lifecycle === 'FINISHED');
      const finalsWithScores = finalMatches.flatMap((row) => {
        const score = getOrderedObservationScore(row.observation, row.order);
        return score ? [{ ...row, score }] : [];
      });
      const scoreEvidence = analyzeFinalScoreSources(finalsWithScores);
      const sourcesAgree = scoreEvidence.agree;
      const conflict = scoreEvidence.conflict || idPairMismatch ||
        (prediction.matchVerificationConflict && !sourcesAgree);
      if (idPairMismatch) {
        const hadConflictingEvidence = Boolean(
          prediction.finalScoreVerified ||
            prediction.finalScoreVerifiedSources?.length ||
            prediction.liveHomeScore !== null && prediction.liveHomeScore !== undefined ||
            prediction.liveAwayScore !== null && prediction.liveAwayScore !== undefined ||
            prediction.finalScoreIsOvertime,
        );
        if (!prediction.matchVerificationConflict) conflicts += 1;
        if (
          !prediction.matchVerificationConflict ||
          hadConflictingEvidence ||
          prediction.matchVerificationSource !== 'External fixture ID / названия команд расходятся'
        ) {
          changed += 1;
        }
        prediction.matchVerificationConflict = true;
        prediction.finalScoreVerified = false;
        prediction.finalScoreVerifiedSources = [];
        prediction.liveHomeScore = null;
        prediction.liveAwayScore = null;
        prediction.finalScoreIsOvertime = false;
        prediction.matchVerifiedAt = nowIso;
        prediction.matchVerificationSource = 'External fixture ID / названия команд расходятся';
        continue;
      }
      const liveMatches = matches
        .filter((row) => row.observation.lifecycle === 'LIVE')
        .sort((a, b) => Number(b.exactId) - Number(a.exactId));
      const scheduledMatches = matches.filter((row) => row.observation.lifecycle === 'SCHEDULED');
      const cancelledMatch = matches.find((row) => row.observation.lifecycle === 'CANCELLED');
      const postponedMatch = matches.find((row) => row.observation.lifecycle === 'POSTPONED');
      const finalMatch = [...finalMatches].sort((a, b) => Number(b.exactId) - Number(a.exactId))[0];
      const liveMatch = liveMatches[0];

      if (finalMatch) {
        const scoreRow = finalsWithScores.find((row) => row.observation === finalMatch.observation) || finalsWithScores[0];
        const sourceNames = Array.from(new Set(finalMatches.map((row) => row.observation.source)));
        const wasFinal = prediction.matchLifecycleStatus === 'FINISHED';
        const previousVerifiedScore = prediction.finalScoreVerified;
        const previousConflict = prediction.matchVerificationConflict;
        const previousHomeScore = prediction.liveHomeScore;
        const previousAwayScore = prediction.liveAwayScore;
        const previousOvertime = prediction.finalScoreIsOvertime;
        const previousVerifiedSources = (prediction.finalScoreVerifiedSources || []).join('|');
        const previousVerificationSource = prediction.matchVerificationSource;
        const previousActualStartedAt = prediction.actualStartedAt;
        const previousActualFinishedAt = prediction.actualFinishedAt;
        prediction.matchStatus = 'FINISHED';
        prediction.matchLifecycleStatus = 'FINISHED';
        if (
          finalMatch.observation.actualStartedAt &&
          prediction.actualStartedAtPrecision !== 'SOURCE_EXACT'
        ) {
          prediction.actualStartedAt = finalMatch.observation.actualStartedAt;
          prediction.actualStartedAtPrecision = 'SOURCE_EXACT';
        }
        if (finalMatch.observation.actualFinishedAt) {
          prediction.actualFinishedAt = finalMatch.observation.actualFinishedAt;
          prediction.actualFinishedAtPrecision = 'SOURCE_EXACT';
        } else if (prediction.actualFinishedAtPrecision === 'FINAL_OBSERVED') {
          // Earlier versions used the poll time as if it were the actual finish time.
          // Keep the observation timestamp in matchVerifiedAt instead.
          prediction.actualFinishedAt = null;
          prediction.actualFinishedAtPrecision = null;
        }
        prediction.matchVerifiedAt = finalMatch.observation.observedAt || nowIso;
        prediction.matchVerificationSource = sourceNames.join(' + ');
        prediction.matchVerificationConflict = conflict;
        prediction.finalScoreVerified = Boolean(scoreRow) && sourcesAgree && !conflict;
        prediction.finalScoreVerifiedSources = prediction.finalScoreVerified
          ? Array.from(scoreEvidence.sources)
          : [];
        if (prediction.finalScoreVerified && scoreRow) {
          prediction.liveHomeScore = scoreRow.score.homeScore;
          prediction.liveAwayScore = scoreRow.score.awayScore;
          // A positive OT/shootout marker is useful even when another feed omits it.
          prediction.finalScoreIsOvertime = finalsWithScores.some(
            (row) => row.observation.isOvertime,
          );
          prediction.liveUpdatedAt = scoreRow.observation.observedAt;
        } else {
          // Keep an uncorroborated final score out of settlement and public score fields.
          prediction.liveHomeScore = null;
          prediction.liveAwayScore = null;
          prediction.finalScoreIsOvertime = false;
          prediction.liveUpdatedAt = finalMatch.observation.observedAt || nowIso;
        }
        if (
          !wasFinal ||
          previousVerifiedScore !== prediction.finalScoreVerified ||
          previousConflict !== prediction.matchVerificationConflict ||
          previousHomeScore !== prediction.liveHomeScore ||
          previousAwayScore !== prediction.liveAwayScore ||
          previousOvertime !== prediction.finalScoreIsOvertime ||
          previousVerifiedSources !== (prediction.finalScoreVerifiedSources || []).join('|') ||
          previousVerificationSource !== prediction.matchVerificationSource ||
          previousActualStartedAt !== prediction.actualStartedAt ||
          previousActualFinishedAt !== prediction.actualFinishedAt
        ) changed += 1;
        if (conflict && !previousConflict) conflicts += 1;
        continue;
      }

      if (liveMatch) {
        const score = getOrderedObservationScore(liveMatch.observation, liveMatch.order);
        const priorLifecycle = prediction.matchLifecycleStatus;
        const wasLive = priorLifecycle === 'LIVE';
        const previousMatchStatus = prediction.matchStatus;
        const previousSource = prediction.matchVerificationSource;
        const startWasMissing = !prediction.actualStartedAt;
        const hadStaleFinalEvidence = Boolean(
          prediction.finalScoreVerified ||
            prediction.finalScoreVerifiedSources?.length ||
            prediction.actualFinishedAt ||
            (!wasLive &&
              (prediction.liveHomeScore !== null && prediction.liveHomeScore !== undefined ||
                prediction.liveAwayScore !== null && prediction.liveAwayScore !== undefined)),
        );
        const scoreChanged = Boolean(
          score &&
            (prediction.liveHomeScore !== score.homeScore || prediction.liveAwayScore !== score.awayScore),
        );
        prediction.matchStatus = 'LIVE';
        prediction.matchLifecycleStatus = 'LIVE';
        if (!wasLive) {
          prediction.liveHomeScore = null;
          prediction.liveAwayScore = null;
          prediction.liveUpdatedAt = null;
          prediction.actualFinishedAt = null;
          prediction.actualFinishedAtPrecision = null;
          if (
            priorLifecycle === 'FINISHED' ||
            priorLifecycle === 'POSTPONED' ||
            priorLifecycle === 'CANCELLED'
          ) {
            prediction.actualStartedAt = null;
            prediction.actualStartedAtPrecision = null;
          }
        }
        prediction.finalScoreVerified = false;
        prediction.finalScoreVerifiedSources = [];
        prediction.finalScoreIsOvertime = false;
        if (!prediction.actualStartedAt) {
          prediction.actualStartedAt = liveMatch.observation.actualStartedAt || liveMatch.observation.observedAt || nowIso;
          prediction.actualStartedAtPrecision = liveMatch.observation.actualStartedAt
            ? 'SOURCE_EXACT'
            : 'LIVE_OBSERVED';
        }
        prediction.matchVerifiedAt = liveMatch.observation.observedAt || nowIso;
        prediction.matchVerificationSource = liveMatch.observation.source;
        if (score) {
          prediction.liveHomeScore = score.homeScore;
          prediction.liveAwayScore = score.awayScore;
          prediction.liveUpdatedAt = liveMatch.observation.observedAt || nowIso;
        }
        if (
          !wasLive ||
          previousMatchStatus !== 'LIVE' ||
          previousSource !== liveMatch.observation.source ||
          startWasMissing ||
          scoreChanged ||
          hadStaleFinalEvidence
        ) {
          changed += 1;
        }
        continue;
      }

      if (cancelledMatch || postponedMatch) {
        const row = cancelledMatch || postponedMatch!;
        const nextStatus = row.observation.lifecycle;
        const needsReset = Boolean(
          prediction.matchLifecycleStatus !== nextStatus ||
            prediction.matchStatus !== 'UPCOMING' ||
            prediction.finalScoreVerified ||
            prediction.finalScoreVerifiedSources?.length ||
            prediction.liveHomeScore !== null && prediction.liveHomeScore !== undefined ||
            prediction.liveAwayScore !== null && prediction.liveAwayScore !== undefined ||
            prediction.actualFinishedAt,
        );
        if (needsReset) changed += 1;
        prediction.matchStatus = 'UPCOMING';
        prediction.matchLifecycleStatus = nextStatus;
        prediction.finalScoreVerified = false;
        prediction.finalScoreVerifiedSources = [];
        prediction.liveHomeScore = null;
        prediction.liveAwayScore = null;
        prediction.liveUpdatedAt = null;
        prediction.finalScoreIsOvertime = false;
        prediction.actualFinishedAt = null;
        prediction.actualFinishedAtPrecision = null;
        prediction.matchVerifiedAt = row.observation.observedAt || nowIso;
        prediction.matchVerificationSource = row.observation.source;
        continue;
      }

      if (scheduledMatches.length > 0 && prediction.matchLifecycleStatus !== 'LIVE') {
        const row = scheduledMatches[0];
        const wasRescheduled =
          prediction.matchLifecycleStatus === 'FINISHED' ||
          prediction.matchLifecycleStatus === 'POSTPONED' ||
          prediction.matchLifecycleStatus === 'CANCELLED';
        const needsReset = Boolean(
          prediction.matchLifecycleStatus !== 'SCHEDULED' ||
            prediction.matchStatus !== 'UPCOMING' ||
            prediction.finalScoreVerified ||
            prediction.finalScoreVerifiedSources?.length ||
            prediction.liveHomeScore !== null && prediction.liveHomeScore !== undefined ||
            prediction.liveAwayScore !== null && prediction.liveAwayScore !== undefined ||
            prediction.actualFinishedAt,
        );
        if (needsReset) changed += 1;
        prediction.matchStatus = 'UPCOMING';
        prediction.matchLifecycleStatus = 'SCHEDULED';
        prediction.finalScoreVerified = false;
        prediction.finalScoreVerifiedSources = [];
        prediction.liveHomeScore = null;
        prediction.liveAwayScore = null;
        prediction.liveUpdatedAt = null;
        prediction.finalScoreIsOvertime = false;
        prediction.actualFinishedAt = null;
        prediction.actualFinishedAtPrecision = null;
        if (wasRescheduled) {
          prediction.actualStartedAt = null;
          prediction.actualStartedAtPrecision = null;
        }
        prediction.matchVerifiedAt = row.observation.observedAt || nowIso;
        prediction.matchVerificationSource = row.observation.source;
      }
    }
    return { changedCount: changed, conflictCount: conflicts };
  });

  updatedCount = mutation.changedCount;
  conflictCount = Math.max(conflictCount, mutation.conflictCount);
  if (updatedCount > 0 || conflictCount > 0) {
    await appendAutopilotLog(
      conflictCount > 0 ? 'WARN' : 'INFO',
      'MATCH_WATCH',
      `Сверка статусов: просмотрено ${monitored.length}, обновлено ${updatedCount}, финальных счётов подтверждено ${verifiedFinalCount}, конфликтов источников ${conflictCount}.${sourceLog.length ? ` Примеры: ${sourceLog.slice(0, 4).join(', ')}.` : ''}`,
    );
  }
  return { checkedCount: monitored.length, updatedCount, conflictCount };
}

/**
 * Автосверка опирается на наблюдаемый LIVE/FINAL статус и проверенный счёт,
 * а не на истечение времени матча по расписанию.
 */
export async function runAutoSettlementCycle(): Promise<{
  checkedCount: number;
  settledCount: number;
  compensatedBuyers: number;
}> {
  await runMatchStatusWatchCycle();
  const state = await readState();
  const duePredictions = state.predictions.filter(
    (prediction) =>
      prediction.resultStatus === 'PENDING' &&
      prediction.matchLifecycleStatus === 'FINISHED',
  );

  await mutateState((current) => {
    current.aiAutopilot.lastSettleAt = new Date().toISOString();
  });

  if (duePredictions.length === 0) {
    return { checkedCount: 0, settledCount: 0, compensatedBuyers: 0 };
  }

  let settledCount = 0;
  let compensatedBuyers = 0;
  for (const prediction of duePredictions) {
    // Exact kickoff/end timestamps are optional feed metadata. Settlement instead
    // requires a verified final lifecycle, two persisted independent score sources,
    // and a valid timestamp/source for when the final observation was recorded.
    const verifiedSources = new Set(
      (prediction.finalScoreVerifiedSources || []).map((source) => source.trim()).filter(Boolean),
    );
    if (
      !prediction.finalScoreVerified ||
      verifiedSources.size < 2 ||
      prediction.matchVerificationConflict ||
      !prediction.matchVerifiedAt ||
      !Number.isFinite(Date.parse(prediction.matchVerifiedAt)) ||
      !prediction.matchVerificationSource?.trim() ||
      !Number.isSafeInteger(prediction.liveHomeScore) ||
      !Number.isSafeInteger(prediction.liveAwayScore)
    ) {
      continue;
    }
    const homeScore = prediction.liveHomeScore as number;
    const awayScore = prediction.liveAwayScore as number;
    const evaluated = evaluateMarketByScore(
      prediction.selectionTitle,
      homeScore,
      awayScore,
      Boolean(prediction.finalScoreIsOvertime),
      prediction.sport,
    );
    if (!evaluated) continue;

    const finalScore = `${homeScore}:${awayScore}${
      prediction.finalScoreIsOvertime ? ' (ОТ)' : ''
    }`;
    const result = await settlePredictionByAdmin({
      predictionId: prediction.id,
      resultStatus: evaluated,
      finalScore,
      pushResultToTelegram: true,
    });
    settledCount += 1;
    compensatedBuyers += result.compensatedUsers;

    await appendAutopilotLog(
      evaluated === 'WIN' ? 'SUCCESS' : 'INFO',
      'SETTLEMENT',
      `Расчёт подтверждённого финального счёта «${prediction.homeTeam} — ${prediction.awayTeam}» (${finalScore}, ${prediction.matchVerificationSource || 'источник не указан'}): ${
        evaluated === 'WIN' ? 'Зашёл' : evaluated === 'PUSH' ? 'Возврат' : 'Не зашёл'
      }.${
        result.compensatedUsers > 0
          ? ` Возвращена страховка на баланс ${result.compensatedUsers} покупателям.`
          : ''
      }`,
    );
  }

  return {
    checkedCount: duePredictions.length,
    settledCount,
    compensatedBuyers,
  };
}

/**
 * Полная самодиагностика всех узлов + живое превью реально найденных матчей
 */
export async function runAutopilotDiagnostics(): Promise<AiDiagnosticsReport> {
  const state = await readState();
  const cfg = state.aiAutopilot;
  const items: AiConnectorDiagnosticItem[] = [];
  let liveSamplePool: Array<{ cand: ScannedFixtureCandidate; src: string }> = [];

  // 1. Тест прямого шлюза Фонбет РФ
  const tFon = Date.now();
  const fonMatches = await scanFromFonbetRu(cfg);
  if (fonMatches.length > 0 && liveSamplePool.length === 0) {
    liveSamplePool = fonMatches.slice(0, 6).map((cand) => ({ cand, src: 'Фонбет РФ' }));
  }
  items.push({
    name: 'Прямая линия БК Фонбет РФ (0 ₽/мес)',
    ok: fonMatches.length > 0,
    latencyMs: Date.now() - tFon,
    details:
      fonMatches.length > 0
        ? `Работает напрямую! Найдено реальных топ-матчей: ${fonMatches.length}`
        : 'Зеркало недоступно с этого IP — переключение на резервный шлюз',
  });

  // 2. Тест прямого шлюза Леон РФ
  const tLeon = Date.now();
  const leonMatches = await scanFromLeonRu(cfg);
  if (leonMatches.length > 0 && liveSamplePool.length === 0) {
    liveSamplePool = leonMatches.slice(0, 6).map((cand) => ({ cand, src: 'Леон РФ' }));
  }
  items.push({
    name: 'Прямая линия БК Леон РФ (0 ₽/мес)',
    ok: leonMatches.length > 0,
    latencyMs: Date.now() - tLeon,
    details:
      leonMatches.length > 0
        ? `Работает напрямую! Найдено реальных матчей: ${leonMatches.length}`
        : 'Защита хостинг-IP у БК — работает канал расписаний ниже',
  });

  // 3. Тест расписания матчей (РПЛ, ЛЧ, АПЛ, НХЛ, UFC)
  const tEspn = Date.now();
  const espnMatches = await scanFromLocalizedLiveCenter(cfg);
  if (espnMatches.length > 0 && liveSamplePool.length === 0) {
    liveSamplePool = espnMatches
      .slice(0, 6)
      .map((cand) => ({ cand, src: 'Матч-центр RU' }));
  }
  items.push({
    name: 'Канал реального расписания (РПЛ, ЛЧ, Топ-5, НХЛ, UFC)',
    ok: espnMatches.length > 0,
    latencyMs: Date.now() - tEspn,
    details:
      espnMatches.length > 0
        ? `Активен! Загружено реальных предстоящих игр: ${espnMatches.length}`
        : 'Ограничен сетью изолированной среды',
  });

  // 4. Тест нейросети-аналитика
  const tLlm = Date.now();
  if (cfg.llmProvider === 'BUILTIN_QUANT' || !cfg.llmApiKey.trim()) {
    items.push({
      name: 'Генератор аналитических разборов',
      ok: true,
      latencyMs: 1,
      details:
        cfg.llmProvider === 'BUILTIN_QUANT'
          ? 'Встроенный русскоязычный аналитик активен (работает бесплатно без ключей)'
          : 'Ключ нейросети не заполнен — работает встроенный русскоязычный аналитик',
    });
  } else {
    const llmCheck = await testLlmConnectionAndModels({
      llmProvider: cfg.llmProvider,
      llmBaseUrl: cfg.llmBaseUrl,
      llmApiKey: cfg.llmApiKey,
      llmModel: cfg.llmModel,
    });
    items.push({
      name: `Нейросеть ${cfg.llmProvider} (${llmCheck.testedModel})`,
      ok: llmCheck.ok,
      latencyMs: llmCheck.latencyMs,
      details: llmCheck.message,
    });
  }

  const mskNow = new Date(Date.now() + 3 * 3600_000);
  const mskHour = mskNow.getUTCHours();
  const mskMin = mskNow.getUTCMinutes();
  const mskTimeFormatted = `${String(mskHour).padStart(2, '0')}:${String(
    mskMin,
  ).padStart(2, '0')} МСК`;

  let nextSlotLabel = `Сегодня в ${String(cfg.morningHourMsk).padStart(2, '0')}:00 МСК`;
  if (mskHour >= cfg.morningHourMsk && mskHour < cfg.eveningHourMsk) {
    nextSlotLabel = `Сегодня в ${String(cfg.eveningHourMsk).padStart(2, '0')}:00 МСК`;
  } else if (mskHour >= cfg.eveningHourMsk) {
    nextSlotLabel = `Завтра в ${String(cfg.morningHourMsk).padStart(2, '0')}:00 МСК`;
  }

  const sampleMatches: AiDiagnosticsSampleMatch[] = liveSamplePool.map(
    ({ cand, src }) => ({
      leagueName: cand.leagueName,
      matchTitle: `${cand.homeTeam} — ${cand.awayTeam}`,
      startsAtFormatted: new Date(cand.matchStartsAt).toLocaleString('ru-RU', {
        timeZone: 'Europe/Moscow',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
      market: cand.suggestedMarket,
      odds: cand.suggestedOdds,
      source: src,
    }),
  );

  return {
    checkedAt: new Date().toISOString(),
    mskTimeFormatted,
    nextSlotLabel,
    items,
    sampleMatches,
  };
}

/**
 * Плановый тик планировщика (вызывается системным Cron каждые 15 минут и внутренним таймером)
 */
let isTickRunning = false;

export async function runScheduledAutopilotTick(): Promise<{
  skipped: boolean;
  reason?: string;
  published?: number;
  settled?: number;
}> {
  if (isTickRunning) {
    return { skipped: true, reason: 'ALREADY_RUNNING' };
  }
  isTickRunning = true;

  try {
    const state = await readState();
    const cfg = state.aiAutopilot;

    let settled = 0;
    if (cfg.autoSettleEnabled) {
      const settleRes = await runAutoSettlementCycle();
      settled = settleRes.settledCount;
    } else {
      await runMatchStatusWatchCycle();
    }

    if (cfg.mode !== 'FULL_AUTOPILOT') {
      return { skipped: false, reason: 'MODE_NOT_FULL_AUTOPILOT', settled };
    }

    const mskNow = new Date(Date.now() + 3 * 3600_000);
    const mskDateStr = mskNow.toISOString().slice(0, 10);
    const mskHour = mskNow.getUTCHours();

    const activeOnStorefront = state.predictions.filter(
      (p) =>
        p.resultStatus === 'PENDING' &&
        new Date(p.matchStartsAt).getTime() > Date.now(),
    ).length;

    const dueMorning =
      mskHour >= cfg.morningHourMsk &&
      mskHour < cfg.eveningHourMsk &&
      cfg.lastMorningRunDate !== mskDateStr;

    const dueEvening =
      mskHour >= cfg.eveningHourMsk && cfg.lastEveningRunDate !== mskDateStr;

    const needsTopUp =
      activeOnStorefront < Math.max(2, Math.floor(cfg.minActiveOnStorefront / 2)) &&
      (!cfg.lastScanAt ||
        Date.now() - new Date(cfg.lastScanAt).getTime() > 2 * 3600_000);

    if (!dueMorning && !dueEvening && !needsTopUp) {
      return { skipped: true, reason: 'WAITING_NEXT_SLOT', settled };
    }

    const slotName = dueMorning
      ? `Утренний автовыпуск (${String(cfg.morningHourMsk).padStart(2, '0')}:00 МСК)`
      : dueEvening
        ? `Вечерний автовыпуск (${String(cfg.eveningHourMsk).padStart(2, '0')}:00 МСК)`
        : 'Автопополнение витрины';

    const scanRes = await runAiScanAndGenerateCycle({
      forcePublish: true,
      triggerLabel: slotName,
    });

    await mutateState((s) => {
      if (dueMorning) s.aiAutopilot.lastMorningRunDate = mskDateStr;
      if (dueEvening) s.aiAutopilot.lastEveningRunDate = mskDateStr;
    });

    return {
      skipped: false,
      published: scanRes.createdCount,
      settled,
    };
  } finally {
    isTickRunning = false;
  }
}

const globalForAutopilot = globalThis as unknown as {
  __valuexAutopilotTimerStarted?: boolean;
};

export function ensureInProcessAutopilotDaemon(): void {
  if (globalForAutopilot.__valuexAutopilotTimerStarted) return;
  globalForAutopilot.__valuexAutopilotTimerStarted = true;

  setInterval(() => {
    void runScheduledAutopilotTick().catch(() => {
      // логируется внутри конвейера
    });
  }, 10 * 60_000).unref?.();
}
