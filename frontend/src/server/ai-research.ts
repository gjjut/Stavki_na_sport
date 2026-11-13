import type { SportType } from './types';

export interface OpenSourceMatchIntel {
  homeTeam: string;
  awayTeam: string;
  leagueName: string;
  sport: SportType;
  fairHomeProbPct: number | null;
  fairDrawProbPct: number | null;
  fairAwayProbPct: number | null;
  bookmakerMarginPct: number | null;
  newsHeadlines: string[];
  webSnippets: string[];
  teamRecordsAndForm: string[];
  sourcesChecked: string[];
  reliabilityScore: number; // 0..100 — насколько прозрачен и предсказуем матч по данным
  riskFlags: string[];
  formattedBrief: string;
}

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function decodeXmlEntities(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Снятие маржи букмекера и расчет чистой вероятности исходов
 */
export function computeFairMarketProbabilities(params: {
  homeOdds: number;
  drawOdds: number | null;
  awayOdds: number;
}): {
  fairHomeProbPct: number | null;
  fairDrawProbPct: number | null;
  fairAwayProbPct: number | null;
  bookmakerMarginPct: number | null;
} {
  const { homeOdds, drawOdds, awayOdds } = params;
  if (!homeOdds || !awayOdds || homeOdds <= 1.01 || awayOdds <= 1.01) {
    return {
      fairHomeProbPct: null,
      fairDrawProbPct: null,
      fairAwayProbPct: null,
      bookmakerMarginPct: null,
    };
  }

  const invHome = 1 / homeOdds;
  const invDraw = drawOdds && drawOdds > 1.05 ? 1 / drawOdds : 0;
  const invAway = 1 / awayOdds;
  const sumInv = invHome + invDraw + invAway;

  if (sumInv <= 0) {
    return {
      fairHomeProbPct: null,
      fairDrawProbPct: null,
      fairAwayProbPct: null,
      bookmakerMarginPct: null,
    };
  }

  return {
    fairHomeProbPct: Number(((invHome / sumInv) * 100).toFixed(1)),
    fairDrawProbPct:
      invDraw > 0 ? Number(((invDraw / sumInv) * 100).toFixed(1)) : null,
    fairAwayProbPct: Number(((invAway / sumInv) * 100).toFixed(1)),
    bookmakerMarginPct: Number(((sumInv - 1) * 100).toFixed(2)),
  };
}

/**
 * 1. Свежие новости спорта на русском (Google News RU RSS — Sports.ru, Чемпионат, СЭ и др.)
 */
async function fetchRussianSportsNewsRss(
  query: string,
  maxItems = 5,
): Promise<{ headlines: string[]; sourceTag: string | null }> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
      query,
    )}&hl=ru&gl=RU&ceid=RU:ru`;
    const res = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/rss+xml,text/xml' },
      signal: AbortSignal.timeout(4200),
      cache: 'no-store',
    });
    if (!res.ok) return { headlines: [], sourceTag: null };
    const xml = await res.text();
    const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    const now = Date.now();
    const headlines: string[] = [];

    for (const block of itemBlocks) {
      if (headlines.length >= maxItems) break;
      const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
      const pubMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
      if (!titleMatch) continue;

      if (pubMatch) {
        const ts = Date.parse(pubMatch[1].trim());
        // Берем только свежие материалы за последние 14 суток
        if (!Number.isNaN(ts) && now - ts > 14 * 86400_000) continue;
      }

      const cleanTitle = decodeXmlEntities(titleMatch[1]);
      if (cleanTitle.length > 15 && !headlines.includes(cleanTitle)) {
        headlines.push(cleanTitle);
      }
    }

    return {
      headlines,
      sourceTag: headlines.length > 0 ? 'Google News RU (СМИ РФ)' : null,
    };
  } catch {
    return { headlines: [], sourceTag: null };
  }
}

/**
 * 2. Резервный новостной поток Bing News RSS (открытый XML без ключей)
 */
async function fetchBingSportsNewsRss(
  query: string,
  maxItems = 4,
): Promise<{ headlines: string[]; sourceTag: string | null }> {
  try {
    const url = `https://www.bing.com/news/search?q=${encodeURIComponent(
      query,
    )}&format=rss&mkt=ru-RU`;
    const res = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
    });
    if (!res.ok) return { headlines: [], sourceTag: null };
    const xml = await res.text();
    const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    const headlines: string[] = [];

    for (const block of itemBlocks) {
      if (headlines.length >= maxItems) break;
      const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
      const descMatch = block.match(/<description>([\s\S]*?)<\/description>/i);
      if (!titleMatch) continue;
      const title = decodeXmlEntities(titleMatch[1]);
      const desc = descMatch ? decodeXmlEntities(descMatch[1]).slice(0, 140) : '';
      const combined = desc ? `${title} — ${desc}` : title;
      if (combined.length > 18 && !headlines.includes(combined)) {
        headlines.push(combined);
      }
    }

    return {
      headlines,
      sourceTag: headlines.length > 0 ? 'Bing Sports RSS' : null,
    };
  } catch {
    return { headlines: [], sourceTag: null };
  }
}

/**
 * 3. Поиск открытых аналитических сниппетов (DuckDuckGo HTML Lite — превью матчей, травмы, статистика)
 */
async function fetchOpenWebPreviewSnippets(
  query: string,
  maxSnippets = 4,
): Promise<{ snippets: string[]; sourceTag: string | null }> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(
      query,
    )}&kl=ru-ru`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept-Language': 'ru-RU,ru;q=0.9',
      },
      signal: AbortSignal.timeout(4200),
      cache: 'no-store',
    });
    if (!res.ok) return { snippets: [], sourceTag: null };
    const html = await res.text();
    const snippetMatches =
      html.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi) || [];

    const snippets: string[] = [];
    for (const raw of snippetMatches) {
      if (snippets.length >= maxSnippets) break;
      const inner = raw.replace(/^class="result__snippet"[^>]*>/i, '');
      const text = decodeXmlEntities(inner);
      if (text.length >= 35 && !snippets.includes(text)) {
        snippets.push(text.slice(0, 220));
      }
    }

    return {
      snippets,
      sourceTag: snippets.length > 0 ? 'Открытый веб-поиск превью' : null,
    };
  } catch {
    return { snippets: [], sourceTag: null };
  }
}

/**
 * 4. Официальная статистика сезона, форма и показатели из открытого API ESPN
 */
function mapSportToEspnPaths(sport: SportType, leagueName: string): string[] {
  const l = leagueName.toLowerCase();
  if (sport === 'FOOTBALL') {
    if (l.includes('рпл') || l.includes('росси')) return ['soccer/rus.1'];
    if (l.includes('чемпион')) return ['soccer/uefa.champions'];
    if (l.includes('европ')) return ['soccer/uefa.europa'];
    if (l.includes('англия') || l.includes('премьер')) return ['soccer/eng.1'];
    if (l.includes('испан') || l.includes('ла лиг')) return ['soccer/esp.1'];
    if (l.includes('итал') || l.includes('серия')) return ['soccer/ita.1'];
    if (l.includes('герман') || l.includes('бундес')) return ['soccer/ger.1'];
    if (l.includes('франц')) return ['soccer/fra.1'];
    return ['soccer/rus.1', 'soccer/eng.1', 'soccer/uefa.champions'];
  }
  if (sport === 'HOCKEY') return ['hockey/nhl'];
  if (sport === 'BASKETBALL') return ['basketball/nba'];
  if (sport === 'TENNIS') return ['tennis/atp', 'tennis/wta'];
  if (sport === 'MMA') return ['mma/ufc'];
  return [];
}

async function fetchEspnTeamFormAndRecords(
  sport: SportType,
  leagueName: string,
  homeTeam: string,
  awayTeam: string,
): Promise<{ records: string[]; sourceTag: string | null }> {
  const paths = mapSportToEspnPaths(sport, leagueName);
  if (paths.length === 0) return { records: [], sourceTag: null };

  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]/gi, '')
      .slice(0, 8);
  const hKey = normalize(homeTeam);
  const aKey = normalize(awayTeam);
  const records: string[] = [];

  for (const p of paths.slice(0, 2)) {
    try {
      const res = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/${p}/scoreboard`,
        {
          headers: { 'User-Agent': BROWSER_UA },
          signal: AbortSignal.timeout(3800),
          cache: 'no-store',
        },
      );
      if (!res.ok) continue;
      const json = (await res.json()) as {
        events?: Array<{
          competitions?: Array<{
            competitors?: Array<{
              homeAway?: string;
              form?: string;
              team?: { displayName?: string };
              records?: Array<{ summary?: string; type?: string }>;
            }>;
            headlines?: Array<{ shortLinkText?: string; description?: string }>;
          }>;
        }>;
      };

      for (const ev of json.events || []) {
        const comp = ev.competitions?.[0];
        if (!comp?.competitors) continue;
        const names = comp.competitors.map((c) =>
          normalize(c.team?.displayName || ''),
        );
        const matched =
          (hKey.length >= 3 && names.some((n) => n.includes(hKey) || hKey.includes(n))) ||
          (aKey.length >= 3 && names.some((n) => n.includes(aKey) || aKey.includes(n)));
        if (!matched) continue;

        for (const c of comp.competitors) {
          const tName = c.team?.displayName || '';
          const totalRec = c.records?.[0]?.summary;
          const form = c.form ? `, серия последних игр: ${c.form}` : '';
          if (totalRec) {
            records.push(`${tName}: баланс сезона ${totalRec}${form}`);
          }
        }
        const hl = comp.headlines?.[0]?.description || comp.headlines?.[0]?.shortLinkText;
        if (hl) {
          records.push(`Превью лиги: ${decodeXmlEntities(hl).slice(0, 180)}`);
        }
      }
    } catch {
      // переходим к следующему источнику
    }
  }

  return {
    records: records.slice(0, 4),
    sourceTag: records.length > 0 ? 'Статистика турнирной таблицы ESPN' : null,
  };
}

/**
 * Комплексный сбор фактов из открытых источников по конкретному матчу
 */
export async function gatherMatchOpenSourceIntel(params: {
  sport: SportType;
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
  homeOdds: number;
  drawOdds: number | null;
  awayOdds: number;
  existingNotes?: string;
}): Promise<OpenSourceMatchIntel> {
  const fair = computeFairMarketProbabilities({
    homeOdds: params.homeOdds,
    drawOdds: params.drawOdds,
    awayOdds: params.awayOdds,
  });

  const matchQuery = `${params.homeTeam} ${params.awayTeam}`;
  const previewQuery = `${params.homeTeam} ${params.awayTeam} прогноз состав форма травмы`;

  const [gNews, bNews, webPrev, espnData] = await Promise.all([
    fetchRussianSportsNewsRss(matchQuery, 4),
    fetchBingSportsNewsRss(`${matchQuery} спорт`, 3),
    fetchOpenWebPreviewSnippets(previewQuery, 3),
    fetchEspnTeamFormAndRecords(
      params.sport,
      params.leagueName,
      params.homeTeam,
      params.awayTeam,
    ),
  ]);

  const sourcesChecked: string[] = ['Котировки и маржа БК РФ'];
  if (gNews.sourceTag) sourcesChecked.push(gNews.sourceTag);
  if (bNews.sourceTag) sourcesChecked.push(bNews.sourceTag);
  if (webPrev.sourceTag) sourcesChecked.push(webPrev.sourceTag);
  if (espnData.sourceTag) sourcesChecked.push(espnData.sourceTag);

  const newsHeadlines = Array.from(
    new Set([...gNews.headlines, ...bNews.headlines]),
  ).slice(0, 5);
  const webSnippets = webPrev.snippets.slice(0, 3);
  const teamRecordsAndForm = [...espnData.records];
  if (params.existingNotes?.trim()) {
    teamRecordsAndForm.unshift(params.existingNotes.trim());
  }

  // Флаги риска (товарищеские игры, слишком равная монетка без перевеса, тревожные слова о травмах лидера)
  const riskFlags: string[] = [];
  const lowerLeague = params.leagueName.toLowerCase();
  if (
    lowerLeague.includes('товарищ') ||
    lowerLeague.includes('friendly') ||
    lowerLeague.includes('предсезон')
  ) {
    riskFlags.push('Товарищеский/предсезонный статус — повышенная ротация составов');
  }

  const maxFairProb = Math.max(
    fair.fairHomeProbPct ?? 0,
    fair.fairAwayProbPct ?? 0,
  );
  if (maxFairProb > 0 && maxFairProb < 41) {
    riskFlags.push(
      'Равный непредсказуемый матч на три исхода — безопасно рассматривать только тоталы или нулевую фору',
    );
  }

  const combinedText = [...newsHeadlines, ...webSnippets].join(' ').toLowerCase();
  if (
    combinedText.includes('травм') ||
    combinedText.includes('дисквалиф') ||
    combinedText.includes('пропустит') ||
    combinedText.includes('не сыграет')
  ) {
    riskFlags.push(
      'В новостях упоминаются кадровые потери / травмы — обязательно учесть при выборе стороны!',
    );
  }

  // Расчет индекса надежности и прозрачности матча (0..100)
  let reliabilityScore = 58;
  if (maxFairProb >= 55) reliabilityScore += 14;
  else if (maxFairProb >= 48) reliabilityScore += 8;
  if (newsHeadlines.length > 0) reliabilityScore += 10;
  if (webSnippets.length > 0) reliabilityScore += 8;
  if (teamRecordsAndForm.length > 0) reliabilityScore += 8;
  if (lowerLeague.includes('товарищ') || lowerLeague.includes('friendly')) {
    reliabilityScore -= 25;
  }
  reliabilityScore = Math.max(25, Math.min(96, reliabilityScore));

  const briefLines: string[] = [];
  if (fair.fairHomeProbPct !== null && fair.fairAwayProbPct !== null) {
    briefLines.push(
      `Чистая вероятность рынка (без маржи БК ${fair.bookmakerMarginPct ?? 5}%): Хозяева ${fair.fairHomeProbPct}%${
        fair.fairDrawProbPct !== null ? ` · Ничья ${fair.fairDrawProbPct}%` : ''
      } · Гости ${fair.fairAwayProbPct}%`,
    );
  }
  if (teamRecordsAndForm.length > 0) {
    briefLines.push(`Таблица и форма: ${teamRecordsAndForm.join(' | ')}`);
  }
  if (newsHeadlines.length > 0) {
    briefLines.push(
      `Свежие заголовки СМИ: ${newsHeadlines
        .map((h, i) => `(${i + 1}) ${h}`)
        .join(' ')}`,
    );
  }
  if (webSnippets.length > 0) {
    briefLines.push(`Выдержки превью: ${webSnippets.join(' // ')}`);
  }
  if (riskFlags.length > 0) {
    briefLines.push(`Факторы внимания: ${riskFlags.join('; ')}`);
  }

  return {
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
    leagueName: params.leagueName,
    sport: params.sport,
    ...fair,
    newsHeadlines,
    webSnippets,
    teamRecordsAndForm,
    sourcesChecked,
    reliabilityScore,
    riskFlags,
    formattedBrief: briefLines.join('\n'),
  };
}

/**
 * Поиск в открытых источниках по произвольному запросу (для ИИ-Чата администратора)
 */
export async function searchOpenSourcesForAdmin(query: string): Promise<{
  query: string;
  headlines: string[];
  snippets: string[];
  sources: string[];
}> {
  const [gNews, bNews, webPrev] = await Promise.all([
    fetchRussianSportsNewsRss(query, 6),
    fetchBingSportsNewsRss(query, 4),
    fetchOpenWebPreviewSnippets(query, 5),
  ]);

  const sources: string[] = [];
  if (gNews.sourceTag) sources.push(gNews.sourceTag);
  if (bNews.sourceTag) sources.push(bNews.sourceTag);
  if (webPrev.sourceTag) sources.push(webPrev.sourceTag);

  return {
    query,
    headlines: Array.from(new Set([...gNews.headlines, ...bNews.headlines])).slice(
      0,
      8,
    ),
    snippets: webPrev.snippets.slice(0, 5),
    sources,
  };
}
