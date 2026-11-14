export interface AgentActionRequest {
  tool: string;
  args: Record<string, unknown>;
}

export interface AgentLlmStructuredOutput {
  [key: string]: unknown;
}

export const SUPPORTED_ADMIN_AGENT_TOOLS = new Set([
  'search_open_sources',
  'research_specific_match',
  'scan_and_publish_matches',
  'replace_demo_matches',
  'approve_all_drafts',
  'run_settlement',
  'update_or_delete_prediction',
  'configure_autopilot',
  'update_storefront_pricing',
  'manage_promo_code',
  'manage_user_account',
  'telegram_channel_post',
]);

const TOOL_ALIASES: Record<string, string> = {
  collect_matches: 'scan_and_publish_matches',
  collect_and_publish_matches: 'scan_and_publish_matches',
  scan_matches: 'scan_and_publish_matches',
  search_web: 'search_open_sources',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Проверяет, что глагол встречается как отдельное слово, а не как подстрока
 * другого слова (например, «дай» внутри «создай» или «дайджест»).
 */
function containsStandaloneVerb(lower: string, verb: string): boolean {
  const escaped = verb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^а-яёa-z0-9])${escaped}(?:$|[^а-яёa-z0-9])`).test(lower);
}

function containsAnyStandaloneVerb(lower: string, verbs: string[]): boolean {
  return verbs.some((verb) => containsStandaloneVerb(lower, verb));
}

export function parseStructuredAgentJson(
  raw: string,
): AgentLlmStructuredOutput | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  try {
    const direct = JSON.parse(cleaned) as unknown;
    if (isRecord(direct)) return direct;
  } catch {
    // Allow harmless text before/after one valid JSON object.
  }

  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < cleaned.length; i += 1) {
    const char = cleaned[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (char === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        try {
          const parsed = JSON.parse(cleaned.slice(start, i + 1)) as unknown;
          if (isRecord(parsed)) return parsed;
        } catch {
          start = -1;
        }
      }
    }
  }
  return null;
}

function canonicalizeAdminToolName(value: string): string | null {
  const normalized = value
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^(?:functions?|tools?)[.:/]+/i, '')
    .replace(/\(.*$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  const tool = TOOL_ALIASES[normalized] || normalized;
  return SUPPORTED_ADMIN_AGENT_TOOLS.has(tool) ? tool : null;
}

function parseActionArguments(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function normalizeAdminAgentAction(
  value: unknown,
): AgentActionRequest | null {
  let root: Record<string, unknown> | null = null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      root = isRecord(parsed) ? parsed : { tool: value };
    } catch {
      root = { tool: value };
    }
  } else if (isRecord(value)) {
    root = value;
  }
  if (!root) return null;

  const actionRecord = isRecord(root.action) ? root.action : null;
  const functionRecord = isRecord(root.function) ? root.function : null;
  const functionCallRecord = isRecord(root.function_call)
    ? root.function_call
    : isRecord(root.functionCall)
      ? root.functionCall
      : null;
  const toolRecord = isRecord(root.tool) ? root.tool : null;
  const toolCallRecord = isRecord(root.tool_call)
    ? root.tool_call
    : isRecord(root.toolCall)
      ? root.toolCall
      : null;
  const nestedFunctionRecord = isRecord(actionRecord?.function)
    ? actionRecord.function
    : isRecord(functionCallRecord?.function)
      ? functionCallRecord.function
      : null;
  const containers = [
    root,
    actionRecord,
    functionRecord,
    functionCallRecord,
    toolRecord,
    toolCallRecord,
    nestedFunctionRecord,
  ].filter((item): item is Record<string, unknown> => item !== null);

  let rawName: string | null = null;
  for (const container of containers) {
    const candidates = [
      container.tool,
      container.name,
      container.toolName,
      container.tool_name,
      container.functionName,
      container.function_name,
      container.function,
      container.action,
    ];
    const candidate = candidates.find(
      (item) => typeof item === 'string' && item.trim().length > 0,
    );
    if (typeof candidate === 'string') {
      rawName = candidate;
      break;
    }
  }
  const tool = rawName ? canonicalizeAdminToolName(rawName) : null;
  if (!tool) return null;

  for (const container of containers) {
    for (const key of [
      'args',
      'arguments',
      'parameters',
      'input',
      'toolInput',
      'tool_input',
    ]) {
      if (container[key] === undefined || container[key] === null) continue;
      const args = parseActionArguments(container[key]);
      if (args) return { tool, args };
    }
  }
  return { tool, args: {} };
}

export function extractRawAdminAgentActions(
  parsed: AgentLlmStructuredOutput,
): unknown[] {
  for (const key of [
    'actions',
    'tool_calls',
    'toolCalls',
    'function_calls',
    'functionCalls',
  ]) {
    const value = parsed[key];
    if (Array.isArray(value) && value.length > 0) return value.slice(0, 5);
    if (value !== undefined && value !== null && !Array.isArray(value)) {
      return [value];
    }
  }

  if (
    [
      'tool',
      'name',
      'action',
      'function',
      'function_call',
      'functionCall',
      'tool_call',
      'toolCall',
    ].some((key) => parsed[key] !== undefined)
  ) {
    return [parsed];
  }
  return [];
}

export function isDraftOnlyMatchCollectionIntent(userText: string): boolean {
  const lower = userText.toLowerCase().replace(/ё/g, 'е');
  return [
    'чернов',
    'в очередь',
    'на модерацию',
    'без публикации',
    'без выпуска',
    'не отправляй на витрину',
    'не отправляйте на витрину',
    'не публикуй',
    'не публикуйте',
    'не опубликуй',
    'не опубликуйте',
    'не публиковать',
    'не опубликовать',
    'не выкладывай',
    'не выложи',
    'не выложите',
    'не выкладывать',
    'не выпускай',
    'не выпусти',
    'не выпускать',
    'не размещай',
    'не размещать',
    'не надо публиковать',
    'не нужно публиковать',
    'не надо выкладывать',
    'не нужно выкладывать',
  ].some((phrase) => lower.includes(phrase));
}

export function isExplicitDraftApprovalIntent(userText: string): boolean {
  const lower = userText.toLowerCase().replace(/ё/g, 'е').trim();
  if (!lower.includes('чернов') && !lower.includes('draft')) return false;
  if (
    [
      'как ', 'почему ', 'что ', 'сколько ', 'какой ', 'какая ', 'какие ',
      'где ', 'когда ', 'можно ', 'можно ли ', 'нужно ли ', 'есть ли ',
      'можешь ли ', 'можете ли ', 'можешь ', 'можете ', 'сможешь ли ',
      'сможете ли ', 'сможешь ', 'сможете ', 'могу ', 'покажи ', 'список ',
      'статус ', 'подскажи', 'расскажи',
    ].some((prefix) => lower.startsWith(prefix)) ||
    lower.includes(' можно ли ') ||
    lower.includes(' можно ') ||
    lower.includes(' нужно ли ') ||
    lower.includes(' есть ли ') ||
    lower.includes(' могу ли ') ||
    lower.includes(' можешь ли ') ||
    lower.includes(' можешь ') ||
    lower.includes(' можете ') ||
    lower.includes(' сможешь ') ||
    lower.includes(' сможете ') ||
    lower.includes(' могу ')
  ) {
    return false;
  }

  const negativeApprovalPhrases = [
    'не одобри', 'не одобряй', 'не одобрите', 'не одобряйте', 'не одобрять',
    'не надо одобр', 'не нужно одобр',
    'не утверди', 'не утверждай', 'не утвердите', 'не утверждайте', 'не утверждать',
    'не публикуй', 'не публикуйте', 'не публиковать',
    'не надо публиковать', 'не нужно публиковать',
    'не опубликуй', 'не опубликуйте', 'не опубликовать',
    'не надо опубликовать', 'не нужно опубликовать',
    'не выкладывай', 'не выложи', 'не выложите', 'не выкладывать',
    'не надо выкладывать', 'не нужно выкладывать',
    'не выпускай', 'не выпусти', 'не выпускать',
    'не надо выпускать', 'не нужно выпускать',
    'не размещай', 'не размещать', 'без публикации', 'без выпуска',
  ];
  if (negativeApprovalPhrases.some((phrase) => lower.includes(phrase))) return false;

  return [
    'одобри', 'одобрите', 'одобрить', 'утверди', 'утвердите', 'утвердить',
    'опубликуй', 'опубликуйте', 'опубликовать', 'публикуй', 'публикуйте',
    'публиковать', 'выпусти', 'выпустите', 'выпустить', 'выложи', 'выложите',
    'выложить', 'размести', 'разместите', 'разместить', 'выстави', 'выставьте',
    'выставить',
  ].some((verb) => lower.includes(verb));
}

function isDemoReplacementIntent(userText: string): boolean {
  const lower = userText.toLowerCase().replace(/ё/g, 'е');
  return (
    lower.includes('демо') &&
    ['замени', 'замените', 'заменить', 'убери', 'уберите', 'удали', 'удалите', 'очисти', 'очистите']
      .some((verb) => lower.includes(verb))
  );
}

function isReadOnlyResearchIntent(userText: string): boolean {
  const lower = userText.toLowerCase().replace(/ё/g, 'е');
  return [
    'новост', 'травм', 'состав', 'источник', 'матч', 'команд', 'турнир',
    'информац', 'разбор', 'анализ', 'исслед', 'форма',
  ].some((topic) => lower.includes(topic));
}

export function isMatchCollectionIntent(userText: string): boolean {
  const lower = userText.toLowerCase().replace(/ё/g, 'е');
  if (
    [
      'как ', 'почему ', 'что ', 'сколько ', 'какой ', 'какая ', 'какие ',
      'где ', 'когда ', 'можно ', 'можно ли ', 'нужно ли ', 'нужен ли ',
      'нужны ли ', 'есть ли ',
      'могу ли ', 'можешь ли ', 'можете ли ', 'можешь ', 'можете ',
      'сможешь ли ', 'сможете ли ', 'сможешь ', 'сможете ', 'могу ',
      'стоит ли ', 'надо ли ', 'покажи ', 'список ', 'статус ',
    ].some((prefix) => lower.startsWith(prefix)) ||
    lower.includes(' можно ли ') ||
    lower.includes(' можно ') ||
    lower.includes(' нужно ли ') ||
    lower.includes(' нужен ли ') ||
    lower.includes(' нужны ли ') ||
    lower.includes(' есть ли ') ||
    lower.includes(' можешь ли ') ||
    lower.includes(' могу ли ') ||
    lower.includes(' можешь ') ||
    lower.includes(' можете ') ||
    lower.includes(' сможешь ') ||
    lower.includes(' сможете ') ||
    lower.includes(' могу ') ||
    [
      'не собери', 'не соберите', 'не собрать', 'не собирай', 'не собирайте',
      'не создавай', 'не создайте', 'не создавать', 'не нужно создавать',
      'не надо создавать',
      'не надо собирать', 'не нужно собирать', 'не подбери', 'не подберите',
      'не подобрать', 'не подбирай', 'не надо подбирать', 'не нужно подбирать',
      'не дай', 'не давай', 'не давайте', 'не делай', 'не делайте',
      'не придумывай', 'не придумывайте', 'не готовь', 'не готовьте',
      'не нужен', 'не нужны', 'не нужно подбирать', 'не надо подбирать',
      'не хочу',
    ].some((negativeCommand) => lower.includes(negativeCommand))
  ) {
    return false;
  }
  const hasCollectionVerb = containsAnyStandaloneVerb(lower, [
    'собери', 'соберите', 'собрать', 'собирай',
    'подбери', 'подберите', 'подобрать', 'подбирай',
    'дай', 'давай', 'давайте',
    'сделай', 'сделайте', 'сделать',
    'придумай', 'придумайте', 'придумать',
    'подготовь', 'подготовьте', 'подготовить',
    'нужен', 'нужны', 'нужно',
    'хочу',
  ]);
  const hasNewPredictionPhrase = [
    'новый прогноз', 'новые прогнозы', 'новый матч', 'новые матчи',
    'свежий прогноз', 'свежие прогнозы', 'свежий матч', 'свежие матчи',
  ].some((phrase) => lower.includes(phrase));
  const hasPublicationVerb = [
    'выложи', 'выложите', 'выложить',
    'выпусти', 'выпустите', 'выпустить',
    'опубликуй', 'опубликуйте', 'опубликовать',
    'публикуй', 'публикуйте', 'публиковать',
    'добавь', 'добавьте', 'добавить',
  ].some((verb) => lower.includes(verb));
  const startsCollectionFlow = [
    'запусти сбор', 'запустить сбор', 'начни сбор', 'начать сбор',
    'сделай подбор', 'сделать подбор', 'запусти публикац',
    'запустить публикац', 'начни публикац', 'начать публикац',
  ].some((phrase) => lower.includes(phrase));
  const hasPositiveCollectionIntent =
    hasCollectionVerb || hasPublicationVerb || startsCollectionFlow || hasNewPredictionPhrase;
  const mentionsMatches = lower.includes('матч') || lower.includes('прогноз');

  if (isDraftOnlyMatchCollectionIntent(userText) && !hasCollectionVerb && !hasNewPredictionPhrase) return false;
  return hasPositiveCollectionIntent && mentionsMatches;
}

function hasExplicitNegatedMutation(userText: string): boolean {
  const lower = userText.toLowerCase().replace(/ё/g, 'е').trim();
  return /(?:^|[\s,;:])не(?:\s+(?:надо|нужно|следует|стоит))?\s+(?:созда|удал|измен|меня|поменя|установ|постав|сдела|добав|отправ|опублику|опубликов|публику|публиков|выпусти|выпуск|вылож|размещ|включ|выключ|запусти|запуск|начни|начин|настро|одобр|утвержд|начисл|подари|переключ|обнов|провед|свер|рассчита|собира|подбира|дай|давай|придума|подготов)/.test(
    lower,
  );
}

export function isAdminMutationIntent(userText: string): boolean {
  const lower = userText.toLowerCase().replace(/ё/g, 'е').trim();
  if (hasExplicitNegatedMutation(lower)) return false;
  if (
    [
      'как ', 'почему ', 'что ', 'сколько ', 'какой ', 'какая ', 'какие ',
      'где ', 'когда ', 'можно ', 'можно ли ', 'нужно ли ', 'есть ли ',
      'могу ли ', 'можешь ли ', 'можете ли ', 'можешь ', 'можете ',
      'сможешь ли ', 'сможете ли ', 'сможешь ', 'сможете ', 'могу ',
      'стоит ли ', 'надо ли ', 'подскажи', 'расскажи',
    ].some((prefix) => lower.startsWith(prefix)) ||
    lower.includes(' как ') ||
    lower.includes(' можно ли ') ||
    lower.includes(' можно ') ||
    lower.includes(' нужно ли ') ||
    lower.includes(' есть ли ') ||
    lower.includes(' можешь ли ') ||
    lower.includes(' могу ли ') ||
    lower.includes(' можешь ') ||
    lower.includes(' можете ') ||
    lower.includes(' сможешь ') ||
    lower.includes(' сможете ') ||
    lower.includes(' могу ')
  ) {
    return false;
  }
  return containsAnyStandaloneVerb(lower, [
    'создай', 'создайте', 'создать',
    'удали', 'удалите', 'удалить',
    'измени', 'измените', 'изменить',
    'поменяй', 'поменяйте', 'поменять',
    'замени', 'замените', 'заменить',
    'установи', 'установите', 'установить',
    'поставь', 'поставьте', 'поставить',
    'сделай', 'сделайте', 'сделать',
    'добавь', 'добавьте', 'добавить',
    'отправь', 'отправьте', 'отправить',
    'опубликуй', 'опубликуйте', 'опубликовать',
    'публикуй', 'публикуйте', 'публиковать',
    'выпусти', 'выпустите', 'выпустить',
    'выложи', 'выложите', 'выложить',
    'включи', 'включите', 'включить',
    'выключи', 'выключите', 'выключить',
    'запусти', 'запустите', 'запустить',
    'начни', 'начните', 'начать',
    'настрой', 'настройте', 'настроить',
    'одобри', 'одобрите', 'одобрить',
    'начисли', 'начислите', 'начислить',
    'подари', 'подарите', 'подарить',
    'переключи', 'переключите', 'переключить',
    'обнови', 'обновите', 'обновить',
    'проведи', 'проведите', 'провести',
    'сверь', 'сверьте', 'сверить',
    'рассчитай', 'рассчитайте', 'рассчитать',
    'собери', 'соберите', 'собрать',
    'подбери', 'подберите', 'подобрать',
    'дай', 'давай', 'давайте',
    'придумай', 'придумайте', 'придумать',
    'подготовь', 'подготовьте', 'подготовить',
  ]);
}

export function resolveAdminAgentActions(
  parsed: AgentLlmStructuredOutput,
  userPrompt: string,
): {
  collectionIntent: boolean;
  rawActionCount: number;
  actionsToExecute: AgentActionRequest[];
  invalidActionCount: number;
  shouldRunCollectionFallback: boolean;
} {
  const rawActions = extractRawAdminAgentActions(parsed);
  const normalizedActions = rawActions
    .map(normalizeAdminAgentAction)
    .filter((action): action is AgentActionRequest => action !== null);
  const collectionIntent = isMatchCollectionIntent(userPrompt);
  const draftOnly = isDraftOnlyMatchCollectionIntent(userPrompt);
  const isActionRequested = (action: AgentActionRequest) => {
    if (action.tool === 'scan_and_publish_matches') return collectionIntent;
    if (action.tool === 'approve_all_drafts') {
      return isExplicitDraftApprovalIntent(userPrompt);
    }
    if (action.tool === 'replace_demo_matches') {
      return isDemoReplacementIntent(userPrompt);
    }
    if (
      action.tool === 'search_open_sources' ||
      action.tool === 'research_specific_match'
    ) {
      return isReadOnlyResearchIntent(userPrompt);
    }
    return isAdminMutationIntent(userPrompt);
  };
  const requestedActions = collectionIntent
    ? normalizedActions
        .filter((action) => action.tool === 'scan_and_publish_matches')
        .slice(0, 1)
    : normalizedActions.filter(
        (action) =>
          action.tool !== 'scan_and_publish_matches' &&
          isActionRequested(action),
      );
  const actionsToExecute = requestedActions.map((action) =>
    action.tool === 'scan_and_publish_matches' && draftOnly
      ? { ...action, args: { ...action.args, publishImmediately: false } }
      : action,
  );
  const suppressedActionCount = normalizedActions.length - actionsToExecute.length;

  return {
    collectionIntent,
    rawActionCount: rawActions.length,
    actionsToExecute,
    invalidActionCount:
      rawActions.length - normalizedActions.length + suppressedActionCount,
    shouldRunCollectionFallback:
      collectionIntent &&
      !actionsToExecute.some((action) => action.tool === 'scan_and_publish_matches'),
  };
}

export function formatAdminMatchScanSummary(params: {
  feedSource: string;
  scannedCount: number;
  createdCount: number;
  publishImmediately: boolean;
}): string {
  const destination = params.publishImmediately
    ? `опубликовано на витрину прогнозов: ${params.createdCount}`
    : `создано черновиков: ${params.createdCount}; автоматической публикации на витрину не было`;
  const emptyResultNote =
    params.createdCount === 0 ? ' Итог: новых прогнозов не создано.' : '';
  return `Сканирование завершено (${params.feedSource}): просмотрено кандидатов ${params.scannedCount}; ${destination}.${emptyResultNote}`;
}
