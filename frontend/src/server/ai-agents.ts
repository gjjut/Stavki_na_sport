import type { SportType } from './types';

export type AgentVerdict = 'PASS' | 'CAUTION' | 'VETO';
export type ForecastAgentId = 'FORM' | 'NEWS' | 'MATCHUP';

export interface AgentCandidateInput {
  id: string;
  sport: SportType;
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
  market: string;
  odds: number;
  homeOdds: number;
  drawOdds: number | null;
  awayOdds: number;
  overOdds: number | null;
  underOdds: number | null;
  fairHomeProbPct: number | null;
  fairDrawProbPct: number | null;
  fairAwayProbPct: number | null;
  reliabilityScore: number;
  sources: string[];
  facts: string[];
  headlines: string[];
  riskFlags: string[];
}

export interface AgentOpinion {
  agent: ForecastAgentId;
  verdict: AgentVerdict;
  probabilityPct: number | null;
  confidencePct: number;
  riskScore: number;
  reason: string;
}

export interface AgentEvaluation {
  id: string;
  quantitativeProbabilityPct: number | null;
  marketImpliedProbabilityPct: number;
  estimatedWinProbabilityPct: number;
  confidencePct: number;
  valueEdgePct: number;
  riskScore: number;
  accepted: boolean;
  rejectionReason: string | null;
  opinions: AgentOpinion[];
  report: string;
}

export interface AgentCommitteeResult {
  evaluations: AgentEvaluation[];
  selectedIds: string[];
  leaderSummary: string;
  leaderModelReviewed: boolean;
  specialistRolesResponded: number;
}

export interface AgentChatRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export type AgentChatCompletion = (
  params: AgentChatRequest,
) => Promise<{ ok: boolean; content: string; rawError: string }>;

interface AgentResponseRow {
  id: string;
  verdict: AgentVerdict;
  probabilityPct: number;
  confidencePct: number;
  riskScore: number;
  reason: string;
}

const AGENT_PROFILES: Array<{
  id: ForecastAgentId;
  name: string;
  responsibility: string;
  instructions: string;
}> = [
  {
    id: 'FORM',
    name: 'Агент формы и данных',
    responsibility: 'качество и достаточность формы, таблицы и предоставленных фактов',
    instructions:
      'Проверь только предоставленные сведения о форме и турнирных показателях. Не придумывай прошлые результаты, составы, травмы или статистику. Если фактов о форме нет, ставь CAUTION и снижай уверенность; не заменяй отсутствие фактов общими словами.',
  },
  {
    id: 'NEWS',
    name: 'Агент новостей и составов',
    responsibility: 'свежие новости, травмы, дисквалификации и неопределённость состава',
    instructions:
      'Оцени только переданные заголовки, выдержки и riskFlags. Не делай вывод «потерь нет», если данных нет. Подтверждённый серьёзный риск для выбранной стороны отмечай VETO; отсутствие новостей отмечай CAUTION, а не PASS.',
  },
  {
    id: 'MATCHUP',
    name: 'Агент матча и рынка',
    responsibility: 'соответствие выбранного исхода характеру матча и устойчивость рынка',
    instructions:
      'Проверь выбранный рынок, котировки и имеющиеся факты. Не предлагай другой рынок или коэффициент. Не приписывай командам стиль игры, мотивацию или очные встречи, если этих фактов нет во входных данных. Не завышай шанс исхода ради оптимизма.',
  },
];

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function parsePct(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? clamp(n, 0, 100) : null;
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Returns an independently calculable probability only when comparable prices exist. */
function probabilityFromAvailableMarketData(candidate: AgentCandidateInput): number | null {
  const market = candidate.market.toLowerCase().replace(/ё/g, 'е').trim();
  const h = candidate.fairHomeProbPct;
  const d = candidate.fairDrawProbPct;
  const a = candidate.fairAwayProbPct;

  if (
    market === 'победа 1' ||
    market === 'п1' ||
    market.startsWith('победа 1 (основное время)')
  ) return h;
  if (
    market === 'победа 2' ||
    market === 'п2' ||
    market.startsWith('победа 2 (основное время)')
  ) return a;
  if (market === 'ничья' || market === 'x' || market === 'х') return d;
  if (market === '1x' || market === '1х') {
    return h !== null && d !== null ? h + d : null;
  }
  if (market === 'x2' || market === 'х2') {
    return a !== null && d !== null ? a + d : null;
  }
  if (
    (market.includes('тотал больше') || market.includes('тотал меньше')) &&
    candidate.overOdds &&
    candidate.underOdds &&
    candidate.overOdds > 1 &&
    candidate.underOdds > 1
  ) {
    const over = 1 / candidate.overOdds;
    const under = 1 / candidate.underOdds;
    return (market.includes('тотал больше') ? over : under) / (over + under) * 100;
  }
  return null;
}

function baselineRisk(candidate: AgentCandidateInput): number {
  let risk = 18;
  if (candidate.reliabilityScore < 70) risk += (70 - candidate.reliabilityScore) * 0.55;
  if (candidate.sources.length < 2) risk += 12;
  if (candidate.headlines.length === 0) risk += 8;
  risk += Math.min(30, candidate.riskFlags.length * 12);
  if (candidate.odds > 2.2) risk += 10;
  return Math.round(clamp(risk, 0, 90));
}

function unavailableOpinion(
  candidate: AgentCandidateInput,
  agent: ForecastAgentId,
): AgentOpinion {
  return {
    agent,
    verdict: 'CAUTION',
    probabilityPct: null,
    confidencePct: 0,
    riskScore: baselineRisk(candidate),
    reason: 'Агент не ответил; автоматическая оценка не заменяет дополнительную проверку.',
  };
}

async function runOneAgent(
  profile: (typeof AGENT_PROFILES)[number],
  candidates: AgentCandidateInput[],
  params: {
    apiKey: string;
    model: string;
    baseUrls: string[];
    complete: AgentChatCompletion;
  },
): Promise<Map<string, AgentOpinion>> {
  const map = new Map<string, AgentOpinion>();
  const userPayload = candidates.map((candidate) => ({
    id: candidate.id,
    sport: candidate.sport,
    league: candidate.leagueName,
    match: `${candidate.homeTeam} — ${candidate.awayTeam}`,
    proposedMarket: candidate.market,
    offeredOdds: candidate.odds,
    marketImpliedPct: Number((100 / candidate.odds).toFixed(1)),
    availableOdds: {
      home: candidate.homeOdds,
      draw: candidate.drawOdds,
      away: candidate.awayOdds,
      over: candidate.overOdds,
      under: candidate.underOdds,
    },
    fair1x2: {
      home: candidate.fairHomeProbPct,
      draw: candidate.fairDrawProbPct,
      away: candidate.fairAwayProbPct,
    },
    reliabilityScore: candidate.reliabilityScore,
    sources: candidate.sources,
    formAndFacts: candidate.facts,
    headlines: candidate.headlines,
    riskFlags: candidate.riskFlags,
  }));

  const systemPrompt = [
    `Ты — специализированная роль «${profile.name}» в многоэтапной системе оценки VALUEX.`,
    `Твоя единственная зона ответственности: ${profile.responsibility}.`,
    profile.instructions,
    'Оцени вероятность выигрыша именно предложенного исхода отдельно от уверенности в своей оценке. Это модельная оценка, не гарантия. Не выдавай точность выше, чем позволяют факты. Вето используй только при существенном конкретном риске; при нехватке данных — CAUTION.',
    'Котировка и рынок зафиксированы: не меняй их. Используй только входные факты, не додумывай форму, состав, счёт или новости.',
    'Верни только JSON: {"opinions":[{"id":"...","verdict":"PASS|CAUTION|VETO","probabilityPct":55,"confidencePct":60,"riskScore":35,"reason":"кратко"}]}. Для каждого id из входа должен быть ровно один объект. Без Markdown.',
  ].join(' ');

  for (const baseUrl of params.baseUrls) {
    try {
      const out = await params.complete({
        baseUrl,
        apiKey: params.apiKey,
        model: params.model,
        temperature: 0.1,
        maxTokens: 1800,
        timeoutMs: 18_000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(userPayload) },
        ],
      });
      if (!out.ok) continue;
      const parsed = extractJson(out.content) as { opinions?: unknown } | null;
      if (!Array.isArray(parsed?.opinions)) continue;

      for (const raw of parsed.opinions) {
        if (!raw || typeof raw !== 'object') continue;
        const row = raw as Partial<AgentResponseRow>;
        const id = typeof row.id === 'string' ? row.id : '';
        if (!candidates.some((candidate) => candidate.id === id)) continue;
        const verdict = row.verdict;
        if (verdict !== 'PASS' && verdict !== 'CAUTION' && verdict !== 'VETO') continue;
        const probabilityPct = parsePct(row.probabilityPct);
        const confidencePct = parsePct(row.confidencePct);
        if (probabilityPct === null || confidencePct === null) continue;
        map.set(id, {
          agent: profile.id,
          verdict,
          probabilityPct,
          confidencePct,
          riskScore: parsePct(row.riskScore) ?? 50,
          reason:
            typeof row.reason === 'string'
              ? row.reason.replace(/\s+/g, ' ').trim().slice(0, 240)
              : 'Обоснование не предоставлено.',
        });
      }
      if (map.size === candidates.length) return map;
    } catch {
      // пробуем следующую базовую точку шлюза, если модель или JSON не ответили
    }
  }
  return map;
}

function makeEvaluation(
  candidate: AgentCandidateInput,
  opinions: AgentOpinion[],
  options: { minimumConfidencePct: number; minimumEdgePct: number; requireConsensus: boolean },
): AgentEvaluation {
  const quantitative = probabilityFromAvailableMarketData(candidate);
  const quantitativeProbabilityPct =
    quantitative === null ? null : Number(clamp(quantitative, 5, 95).toFixed(1));
  const marketImpliedProbabilityPct = Number((100 / candidate.odds).toFixed(1));
  const available = opinions.filter(
    (opinion) => opinion.probabilityPct !== null && opinion.confidencePct > 0,
  );
  const passing = available.filter((opinion) => opinion.verdict === 'PASS');
  const vetoes = opinions.filter((opinion) => opinion.verdict === 'VETO');
  const estimates = available.map((opinion) => opinion.probabilityPct as number);
  const sortedEstimates = [...estimates].sort((a, b) => a - b);
  const median = sortedEstimates.length
    ? sortedEstimates[Math.floor((sortedEstimates.length - 1) / 2)]
    : quantitativeProbabilityPct ?? marketImpliedProbabilityPct;
  const spread = estimates.length > 1 ? Math.max(...estimates) - Math.min(...estimates) : 0;
  const meanAgentRisk = available.length
    ? available.reduce((sum, opinion) => sum + opinion.riskScore, 0) / available.length
    : baselineRisk(candidate);
  const confidencePct = available.length
    ? Math.round(available.reduce((sum, opinion) => sum + opinion.confidencePct, 0) / available.length)
    : 0;
  const riskScore = Math.round(
    clamp(baselineRisk(candidate) * 0.55 + meanAgentRisk * 0.45, 0, 95),
  );
  const lowEvidencePenalty = candidate.reliabilityScore < 70
    ? Math.min(8, (70 - candidate.reliabilityScore) * 0.25)
    : 0;
  const disagreementPenalty = Math.min(10, spread * 0.2);
  const marketWeightedProbability =
    quantitativeProbabilityPct === null
      ? median
      : quantitativeProbabilityPct * 0.42 + median * 0.58;
  // При отсутствии сопоставимой вероятности для рынка LLM не может создать безграничный value edge.
  const boundedProbability =
    quantitativeProbabilityPct === null
      ? Math.min(marketWeightedProbability, marketImpliedProbabilityPct + 8)
      : marketWeightedProbability;
  const estimatedWinProbabilityPct = Math.round(
    clamp(boundedProbability - lowEvidencePenalty - disagreementPenalty, 5, 95),
  );
  const valueEdgePct = Number(
    (estimatedWinProbabilityPct - marketImpliedProbabilityPct).toFixed(1),
  );
  const enoughPassingOpinions = available.length >= 2 && passing.length >= 2;
  const consensusOk = !options.requireConsensus || enoughPassingOpinions;
  let rejectionReason: string | null = null;

  if (vetoes.length > 0) {
    rejectionReason = `Вето ${vetoes.map((opinion) => opinion.agent).join(', ')}: ${vetoes[0].reason}`;
  } else if (!consensusOk) {
    rejectionReason = 'Нет консенсуса минимум двух ответивших специализированных агентов с вердиктом PASS.';
  } else if (riskScore >= 70) {
    rejectionReason = `Высокий риск матча (${riskScore}/100).`;
  } else if (confidencePct < options.minimumConfidencePct) {
    rejectionReason = `Уверенность команды ${confidencePct}% ниже порога ${options.minimumConfidencePct}%.`;
  } else if (valueEdgePct < options.minimumEdgePct) {
    rejectionReason = `Оценённый перевес ${valueEdgePct} п.п. ниже порога ${options.minimumEdgePct} п.п.`;
  }

  const report = [
    `Количественная оценка по сопоставимым котировкам: ${quantitativeProbabilityPct === null ? 'нет достаточных данных для этого рынка' : `${quantitativeProbabilityPct}%`}; подразумеваемая вероятность выбранной котировки ${marketImpliedProbabilityPct}%.`,
    ...opinions.map(
      (opinion) =>
        `${opinion.agent}: ${opinion.verdict}, вероятность исхода ${opinion.probabilityPct ?? 'нет данных'}%, уверенность ${opinion.confidencePct}%, риск ${opinion.riskScore}/100 — ${opinion.reason}`,
    ),
    `Риск-менеджер: риск ${riskScore}/100; разброс оценок ${Math.round(spread)} п.п.; консенсусная вероятность ${estimatedWinProbabilityPct}%; средняя уверенность агентов ${confidencePct}%; перевес к подразумеваемой вероятности ${valueEdgePct} п.п.`,
    rejectionReason
      ? `РЕШЕНИЕ: ОТКЛОНЁН — ${rejectionReason}`
      : 'РЕШЕНИЕ: прошёл количественные пороги и агентский консенсус; допущен к финальному отбору.',
  ].join('\n');

  return {
    id: candidate.id,
    quantitativeProbabilityPct,
    marketImpliedProbabilityPct,
    estimatedWinProbabilityPct,
    confidencePct,
    valueEdgePct,
    riskScore,
    accepted: !rejectionReason,
    rejectionReason,
    opinions,
    report,
  };
}

export async function runAgentCommittee(params: {
  candidates: AgentCandidateInput[];
  limit: number;
  minimumConfidencePct: number;
  minimumEdgePct: number;
  requireConsensus: boolean;
  apiKey: string;
  model: string;
  baseUrls: string[];
  complete: AgentChatCompletion;
}): Promise<AgentCommitteeResult> {
  const profilesWithResponses = params.apiKey.trim()
    ? await Promise.all(
        AGENT_PROFILES.map((profile) =>
          runOneAgent(profile, params.candidates, {
            apiKey: params.apiKey,
            model: params.model,
            baseUrls: params.baseUrls,
            complete: params.complete,
          }),
        ),
      )
    : AGENT_PROFILES.map(() => new Map<string, AgentOpinion>());

  const evaluations = params.candidates.map((candidate) => {
    const opinions = profilesWithResponses.map(
      (rows, index) => rows.get(candidate.id) || unavailableOpinion(candidate, AGENT_PROFILES[index].id),
    );
    return makeEvaluation(candidate, opinions, {
      minimumConfidencePct: params.minimumConfidencePct,
      minimumEdgePct: params.minimumEdgePct,
      requireConsensus: params.requireConsensus,
    });
  });

  const eligible = evaluations
    .filter((evaluation) => evaluation.accepted)
    .sort(
      (a, b) =>
        b.confidencePct * 1.8 + b.valueEdgePct - b.riskScore * 0.14 -
        (a.confidencePct * 1.8 + a.valueEdgePct - a.riskScore * 0.14),
    )
    .slice(0, Math.max(0, params.limit));

  let leaderSummary = eligible.length
    ? `Серверные пороги и консенсус оставили ${eligible.length} кандидатов: ${eligible.map((item) => item.id).join(', ')}.`
    : `Ни один кандидат не прошёл пороги уверенности, value edge, риска и консенсуса; выпуск запрещён.`;
  let leaderModelReviewed = false;

  if (eligible.length > 0 && params.apiKey.trim()) {
    const compact = eligible.map((evaluation) => ({
      id: evaluation.id,
      estimatedWinProbabilityPct: evaluation.estimatedWinProbabilityPct,
      confidencePct: evaluation.confidencePct,
      valueEdgePct: evaluation.valueEdgePct,
      riskScore: evaluation.riskScore,
      agents: evaluation.opinions.map((opinion) => ({
        agent: opinion.agent,
        verdict: opinion.verdict,
        probabilityPct: opinion.probabilityPct,
        reason: opinion.reason,
      })),
    }));
    const leaderPrompt = [
      'Ты — дополнительная роль финального аналитика VALUEX. Доступны результаты ответивших специализированных ролей, фактические котировки, сведения и риски.',
      'Сделай только финальную проверку противоречий: не повышай вероятность, не снимай вето, не меняй рынок или коэффициент. При сомнении или явном противоречии исключай кандидата.',
      'Ответ только JSON: {"selectedIds":["id"],"summary":"краткое обоснование на русском"}. Выбирай только из переданных id и не добавляй новых кандидатов.',
    ].join(' ');
    for (const baseUrl of params.baseUrls) {
      try {
        const out = await params.complete({
          baseUrl,
          apiKey: params.apiKey,
          model: params.model,
          temperature: 0.05,
          maxTokens: 700,
          timeoutMs: 14_000,
          messages: [
            { role: 'system', content: leaderPrompt },
            { role: 'user', content: JSON.stringify(compact) },
          ],
        });
        if (!out.ok) continue;
        const parsed = extractJson(out.content) as {
          selectedIds?: unknown;
          summary?: unknown;
        } | null;
        if (!Array.isArray(parsed?.selectedIds)) continue;
        const allow = new Set(eligible.map((evaluation) => evaluation.id));
        const selected = parsed.selectedIds.filter(
          (id): id is string => typeof id === 'string' && allow.has(id),
        );
        const selectedSet = new Set(selected);
        const filtered = eligible.filter((evaluation) => selectedSet.has(evaluation.id));
        eligible.splice(0, eligible.length, ...filtered);
        leaderModelReviewed = true;
        leaderSummary =
          typeof parsed.summary === 'string' && parsed.summary.trim()
            ? parsed.summary.replace(/\s+/g, ' ').trim().slice(0, 360)
            : `Дополнительная роль финального аналитика оставила ${filtered.length} из ${allow.size} кандидатов.`;
        break;
      } catch {
        // Консенсус трёх специалистов остается основным фильтром; лидер не добавляет кандидатов.
      }
    }
  }

  return {
    evaluations,
    selectedIds: eligible.map((evaluation) => evaluation.id),
    leaderSummary,
    leaderModelReviewed,
    specialistRolesResponded: profilesWithResponses.filter((rows) => rows.size > 0).length,
  };
}

export function buildAgentAnalysis(params: {
  candidate: AgentCandidateInput;
  evaluation: AgentEvaluation;
  leaderSummary: string;
}): { teaser: string; full: string; report: string; stakeUnits: number } {
  const { candidate, evaluation } = params;
  const strongestReasons = evaluation.opinions
    .filter((opinion) => opinion.verdict === 'PASS')
    .map((opinion) => `${opinion.agent}: ${opinion.reason}`)
    .slice(0, 3);
  // A valid response may report zero confidence; the fallback opinion has no probability.
  const answeredRoleCount = evaluation.opinions.filter(
    (opinion) => opinion.probabilityPct !== null,
  ).length;
  const riskText = candidate.riskFlags.length
    ? candidate.riskFlags.join('; ')
    : 'Подтверждённых критических флагов в собранных данных нет; отсутствие новости не означает отсутствие риска.';
  const teaser = `Аналитическая система сравнила котировки и доступные проверяемые сведения о матче «${candidate.homeTeam} — ${candidate.awayTeam}». Публикуются только варианты, прошедшие несколько специализированных проверок и контроль риска.`;
  const full = [
    `ИТОГ МНОГОЭТАПНОЙ AI-ПРОВЕРКИ: выбран рынок «${candidate.market}» по зафиксированной котировке ${candidate.odds.toFixed(2)}. Консенсусная модельная вероятность исхода — ${evaluation.estimatedWinProbabilityPct}%, расчётный перевес к подразумеваемой вероятности линии — ${evaluation.valueEdgePct} п.п. Это оценка, не гарантия результата.`,
    `МЕТОД: три специализированные роли одной настроенной AI-модели; по этому кандидату ответили ${answeredRoleCount}/3 роли. Это не три независимые модели.`,
    `ОЦЕНКИ СПЕЦИАЛИЗИРОВАННЫХ РОЛЕЙ: ${strongestReasons.length ? strongestReasons.join(' | ') : 'роли не обнаружили достаточных подтверждённых фактов для уверенного позитивного вывода.'}`,
    `ФИНАЛЬНЫЙ ОТБОР: ${params.leaderSummary}`,
    `РИСК-МЕНЕДЖЕР: общий индекс риска ${evaluation.riskScore}/100; доступные факторы: ${riskText}. Рекомендуемый консервативный флэт — ${evaluation.riskScore < 35 ? '1.0' : '0.5'}% банка; не увеличивайте сумму из-за одной оценки модели.`,
  ].join('\n\n');
  const report = [
    evaluation.report,
    `Финальный отбор: ${params.leaderSummary}`,
  ].join('\n\n');
  return {
    teaser,
    full,
    report,
    stakeUnits: evaluation.riskScore < 35 ? 1 : 0.5,
  };
}
