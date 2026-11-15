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
  // The tool approves the entire queue, not a selected draft or subset.
  if (!containsAnyStandaloneVerb(lower, ['все', 'каждый', 'каждую', 'all']) ||
      /не\s+все|кроме|за исключением|только/.test(lower)) return false;
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
  // This tool also scans and can publish real forecasts. A request merely to
  // delete demos is not authorization for those extra side effects.
  return lower.includes('демо') && /реальн|настоящ/.test(lower) &&
    containsAnyStandaloneVerb(lower, ['замени', 'замените', 'заменить']);
}

function isReadOnlyResearchIntent(userText: string): boolean {
  const lower = userText.toLowerCase().replace(/ё/g, 'е');
  if (/(?:^|[\s,;:])не(?:\s+(?:надо|нужно))?\s+(?:ищи|ищите|искать|найди|проверяй|проверяйте|проверять|изучай|анализируй|запрашивай)/.test(lower)) return false;
  return [
    'новост', 'травм', 'состав', 'источник', 'матч', 'команд', 'турнир',
    'информац', 'разбор', 'анализ', 'исслед', 'форма',
  ].some((topic) => lower.includes(topic));
}

export function isMatchCollectionIntent(userText: string): boolean {
  // A request to post a summary of matches in Telegram is not a request to scan/publish forecasts.
  if (isTelegramDigestPublicationIntent(userText)) return false;
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

export function requestedMatchCount(userText: string): number | null {
  const lower = userText.toLowerCase().replace(/ё/g, 'е');
  const match = lower.match(/(?:^|[^а-яa-z0-9])(\d{1,3}|один|одну|одно|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять)\s+(?:(?:самых|надежных|лучших|новых|свежих)\s+){0,3}(?:матч|прогноз)/);
  if (!match) return 3;
  const words: Record<string, number> = { один: 1, одну: 1, одно: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10 };
  const count = words[match[1]] ?? Number(match[1]);
  return Number.isInteger(count) && count >= 1 && count <= 8 ? count : null;
}

function hasExplicitNegatedMutation(userText: string): boolean {
  const lower = userText.toLowerCase().replace(/ё/g, 'е').trim();
  return /(?:^|[\s,;:])не(?:\s+(?:надо|нужно|следует|стоит))?\s+(?:созда|удал|измен|меня|поменя|установ|постав|ставь|сдела|делай|добав|отправ|опублику|опубликов|публику|публиков|выпусти|выпуск|вылож|выклады|размещ|включ|выключ|отключ|останов|откро|закреп|запусти|запуск|начни|начин|настро|одобр|утвержд|начисл|подари|переключ|обнов|провед|свер|рассчита|собира|подбира|дай|давай|придума|подготов|трогай)/.test(
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
    'размести', 'разместите', 'разместить', 'запости', 'запостить',
    'включи', 'включите', 'включить',
    'выключи', 'выключите', 'выключить', 'отключи', 'отключите', 'отключить',
    'останови', 'остановите', 'остановить', 'открой', 'откройте', 'открыть',
    'закрепи', 'закрепите', 'закрепить',
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

export function isTelegramDigestPublicationIntent(userText: string): boolean {
  const lower = userText.toLowerCase().replace(/ё/g, 'е');
  return isAdminMutationIntent(userText) &&
    /telegram|телеграм|канал/.test(lower) &&
    /сводк|дайджест|отчет|статистик/.test(lower) &&
    containsAnyStandaloneVerb(lower, [
      'опубликуй', 'опубликуйте', 'опубликовать', 'публикуй', 'публикуйте',
      'отправь', 'отправьте', 'отправить', 'выложи', 'выложите',
      'размести', 'разместите', 'запости', 'дай', 'давай',
    ]);
}

/** Only unambiguous, single-purpose commands bypass the model. */
export function isDirectTelegramDigestCommand(userText: string): boolean {
  if (!isTelegramDigestPublicationIntent(userText)) return false;
  const lower = userText.toLowerCase().replace(/ё/g, 'е').replace(/[.!]+$/g, '').replace(/\s+/g, ' ').trim();
  return /^(?:пожалуйста,? )?(?:опубликуй|отправь|выложи|дай) (?:(?:красивую|дневную|ежедневную|сегодняшнюю|нашу) )*(?:сводку(?: дня)?(?: и статистик[иуы])?|дайджест)(?: дня)? (?:в|на) (?:наш |нашем |нашего )?(?:telegram(?:[- ]канал(?:е)?)?|телеграм(?:[- ]канал(?:е)?)?|канал(?:е)?)$/.test(lower);
}

function hasUserNumber(lower: string, value: unknown): boolean {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return false;
  const str = String(n).replace('.', '[.,]');
  return new RegExp(`(?:^|[^a-z0-9])${str}(?![0-9])`).test(lower);
}

function userContainsExactCode(lower: string, value: unknown): boolean {
  if (typeof value !== 'string' || value.trim().length < 2) return false;
  const escaped = value.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const boundary = value.includes('@') ? '[^a-z0-9_@.+-]' : '[^a-z0-9_-]';
  return new RegExp(`(?:^|${boundary})${escaped}(?=$|${boundary})`).test(lower);
}

function hasRequestedPrice(lower: string, value: unknown): boolean {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 50) return false;
  const match = lower.match(/(?:цен[ауые]?|стоимост[ьи]?)[^0-9]{0,35}(\d+)(?![0-9.,])/);
  return Boolean(match && Number(match[1]) === number);
}

function hasRequestedBundleDiscount(lower: string, value: unknown, bundleSize: 2 | 3): boolean {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > (bundleSize === 2 ? 60 : 70)) return false;
  const size = bundleSize === 2 ? '(?:2|два|двух)' : '(?:3|три|трех)';
  const noun = '(?:матч|событи|прогноз)[а-я]*';
  const afterSize = new RegExp(`скидк[а-я]*[^0-9]{0,20}${size}\\s*${noun}[^0-9%]{0,20}(\\d{1,2})\\s*%`).exec(lower);
  const beforeSize = new RegExp(`скидк[а-я]*[^0-9]{0,20}(\\d{1,2})\\s*%[^0-9]{0,20}${size}\\s*${noun}`).exec(lower);
  return Number(afterSize?.[1] ?? beforeSize?.[1]) === number;
}

function userContainsLiteral(lower: string, value: unknown): boolean {
  const text = typeof value === 'string' ? value.trim().toLowerCase().replace(/ё/g, 'е') : '';
  if (text.length < 3) return false;
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, 'u').test(lower);
}

function requestClauses(lower: string): string[] {
  return lower.split(/\s+(?:и|но|а|затем)\s+|[;!?\n]/).map((part) => part.trim()).filter(Boolean);
}

const PRICE_CHANGE_VERBS = [
  'поставь', 'поставьте', 'поставить', 'установи', 'установите', 'установить',
  'измени', 'измените', 'изменить', 'поменяй', 'поменяйте', 'поменять', 'сделай', 'сделайте', 'сделать',
];

function isGeneralPriceClause(clause: string): boolean {
  if (/стандарт|базов|по умолчанию|общ|всех прогноз/.test(clause)) return true;
  return /^(?:пожалуйста,?\s*)?(?:поставь|поставьте|поставить|установи|установите|установить|измени|измените|изменить|поменяй|поменяйте|поменять|сделай|сделайте|сделать)\s+(?:цен[ауые]?|стоимост[ьи]?)(?:\s+(?:прогноза|прогнозов|на прогноз))?\s*(?:на\s*)?\d+(?:\s*(?:₽|руб(?:лей|ля|ль)?))?\s*\.?$/.test(clause);
}

/** Reject unrelated or invented side effects instead of trusting the model's general mutation intent. */
function isToolRequested(action: AgentActionRequest, userPrompt: string): boolean {
  const lower = userPrompt.toLowerCase().replace(/ё/g, 'е');
  const args = action.args;
  const sub = typeof args.action === 'string' ? args.action.toUpperCase() : '';
  const verbs = (list: string[]) => containsAnyStandaloneVerb(lower, list);
  const clauses = requestClauses(lower);
  if (!isAdminMutationIntent(userPrompt)) return false;

  switch (action.tool) {
    case 'telegram_channel_post':
      if (!/telegram|телеграм|канал/.test(lower) || !verbs([
        'опубликуй', 'опубликуйте', 'опубликовать', 'публикуй', 'публикуйте',
        'отправь', 'отправьте', 'отправить', 'выложи', 'выложите', 'размести', 'разместите', 'запости', 'дай', 'давай',
      ])) return false;
      if (isTelegramDigestPublicationIntent(userPrompt)) return true;
      return /пост|сообщени|текст/.test(lower) && sub === 'CUSTOM_POST';
    case 'run_settlement':
      return /результат|матч|счет|прогноз/.test(lower) && verbs([
        'сверь', 'сверьте', 'сверить', 'рассчитай', 'рассчитайте', 'рассчитать',
      ]);
    case 'update_or_delete_prediction': {
      const matching = clauses.filter((clause) => /матч|прогноз|событи/.test(clause) && userContainsLiteral(clause, args.predictionIdOrTeamQuery));
      if (matching.length !== 1) return false;
      const clause = matching[0];
      if (sub === 'DELETE') return containsAnyStandaloneVerb(clause, ['удали', 'удалите', 'удалить']);
      if (sub === 'MAKE_FREE') return /бесплатн|открыт.*доступ/.test(clause) && containsAnyStandaloneVerb(clause, ['сделай', 'сделайте', 'сделать', 'открой', 'откройте', 'открыть']);
      if (sub === 'MAKE_FEATURED') return /главн|закреп/.test(clause) && containsAnyStandaloneVerb(clause, ['сделай', 'сделайте', 'сделать', 'закрепи', 'закрепите', 'закрепить']);
      if (sub === 'SET_PRICE') return containsAnyStandaloneVerb(clause, PRICE_CHANGE_VERBS) && hasRequestedPrice(clause, args.priceRub);
      return false;
    }
    case 'manage_promo_code': {
      const code = typeof args.code === 'string' ? args.code.trim() : '';
      if (!/^[a-z0-9_-]{2,32}$/i.test(code)) return false;
      const matching = clauses.filter((clause) => /промокод/.test(clause) && userContainsExactCode(clause, code));
      if (matching.length !== 1) return false;
      const clause = matching[0];
      if (sub === 'DELETE') return containsAnyStandaloneVerb(clause, ['удали', 'удалите', 'удалить']);
      if (sub !== 'CREATE' || !containsAnyStandaloneVerb(clause, ['создай', 'создайте', 'создать'])) return false;
      const percents = [...clause.matchAll(/(?:^|[^0-9])(\d{1,2})\s*%/g)];
      if (percents.length !== 1 || Number(percents[0][1]) !== Number(args.discountPercent)) return false;
      const limitMatch = clause.match(/(?:^|[^a-z0-9])(\d+)\s*(?:активац|использован|раз)/) ||
        clause.match(/лимит[а-я]*\s*(?:на\s*|в\s*)?(\d+)/);
      if (!limitMatch) return args.maxUses === undefined;
      const limit = Number(args.maxUses);
      return Number.isSafeInteger(limit) && limit > 0 && limit === Number(limitMatch[1]);
    }
    case 'manage_user_account': {
      const email = typeof args.email === 'string' ? args.email.trim().toLowerCase() : '';
      const matching = clauses.filter((clause) => /клиент|пользовател|аккаунт|баланс|доступ/.test(clause) && userContainsExactCode(clause, email));
      if (matching.length !== 1) return false;
      const clause = matching[0];
      if (sub === 'CREDIT_BALANCE') {
        const amount = Number(args.amountRub);
        if (!containsAnyStandaloneVerb(clause, ['начисли', 'начислите', 'начислить']) || !Number.isSafeInteger(amount) || amount <= 0) return false;
        const withoutEmail = clause.replace(email, ' ');
        const numbers = [...withoutEmail.matchAll(/(?:^|[^a-z0-9_.,])(\d+)(?![a-z0-9_.,])/g)];
        return numbers.length === 1 && Number(numbers[0][1]) === amount;
      }
      if (sub === 'GRANT_PREDICTION') {
        return /прогноз|матч/.test(clause) && containsAnyStandaloneVerb(clause, ['подари', 'подарите', 'подарить', 'открой', 'откройте']) && userContainsLiteral(clause, args.teamQuery);
      }
      return false;
    }
    case 'update_storefront_pricing': {
      const keys = Object.keys(args);
      if (keys.length === 0) return false;
      return keys.every((key) => {
        if (key === 'brandName') return clauses.some((clause) => /бренд|название/.test(clause) && containsAnyStandaloneVerb(clause, PRICE_CHANGE_VERBS) && userContainsLiteral(clause, args[key]));
        if (key === 'defaultSinglePriceRub') return clauses.some((clause) => containsAnyStandaloneVerb(clause, PRICE_CHANGE_VERBS) && isGeneralPriceClause(clause) && hasRequestedPrice(clause, args[key]));
        if (key === 'bundle2DiscountPct') return clauses.some((clause) => containsAnyStandaloneVerb(clause, PRICE_CHANGE_VERBS) && hasRequestedBundleDiscount(clause, args[key], 2));
        if (key === 'bundle3DiscountPct') return clauses.some((clause) => containsAnyStandaloneVerb(clause, PRICE_CHANGE_VERBS) && hasRequestedBundleDiscount(clause, args[key], 3));
        return false;
      });
    }
    case 'configure_autopilot': {
      if (!lower.includes('автопилот')) return false;
      const keys = Object.keys(args);
      if (keys.length === 0) return false;
      const segments = clauses.flatMap((clause) => clause.split(',').map((part) => part.trim()));
      const toggle = (subject: RegExp, value: unknown) => typeof value === 'boolean' && segments.some((segment) =>
        subject.test(segment) && (value ? /включ/.test(segment) && !/выключ|отключ/.test(segment) : /выключ|отключ/.test(segment)),
      );
      return keys.every((key) => {
        if (key === 'mode') {
          const mode = String(args[key] || '').toUpperCase();
          return segments.some((segment) => {
            if (!segment.includes('автопилот')) return false;
            if (mode === 'FULL_AUTOPILOT') return /включ|запуст|переключ|постав/.test(segment) && /полн|24\/7/.test(segment);
            if (mode === 'MODERATION') return /включ|переключ|постав|настро/.test(segment) && /модерац|чернов/.test(segment);
            if (mode === 'OFF') return /выключ|отключ|пауз|останов/.test(segment);
            return false;
          });
        }
        if (key === 'morningHourMsk' || key === 'eveningHourMsk') {
          const hour = Number(args[key]);
          return Number.isInteger(hour) && hour >= 0 && hour <= 23 && segments.some((segment) =>
            (key === 'morningHourMsk' ? /утр/.test(segment) : /вечер/.test(segment)) && hasUserNumber(segment, hour),
          );
        }
        if (key === 'maxPicksPerRun') {
          const count = Number(args[key]);
          return Number.isInteger(count) && count >= 1 && count <= 8 && segments.some((segment) => /матч|прогноз/.test(segment) && hasUserNumber(segment, count));
        }
        if (key === 'defaultAiPriceRub') return segments.some((segment) => containsAnyStandaloneVerb(segment, PRICE_CHANGE_VERBS) && hasRequestedPrice(segment, args[key]));
        if (key === 'freeEveryNthPick') {
          const count = Number(args[key]);
          return Number.isSafeInteger(count) && count > 0 && segments.some((segment) =>
            /бесплатн/.test(segment) && new RegExp(`кажд[а-я]*\\s+${count}(?![0-9])`).test(segment),
          );
        }
        if (key === 'insureAiPicks') return toggle(/страхов/, args[key]);
        if (key === 'openSourceResearchEnabled') return toggle(/источник|поиск/, args[key]);
        return false;
      });
    }
    default:
      return false;
  }
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
  const matchCount = requestedMatchCount(userPrompt);
  const isActionRequested = (action: AgentActionRequest) => {
    if (action.tool === 'scan_and_publish_matches') return collectionIntent;
    if (action.tool === 'approve_all_drafts') {
      return isExplicitDraftApprovalIntent(userPrompt);
    }
    if (action.tool === 'replace_demo_matches') {
      return isAdminMutationIntent(userPrompt) && isDemoReplacementIntent(userPrompt);
    }
    if (
      action.tool === 'search_open_sources' ||
      action.tool === 'research_specific_match'
    ) {
      return isReadOnlyResearchIntent(userPrompt);
    }
    return isToolRequested(action, userPrompt);
  };
  const seenTools = new Set<string>();
  const requestedActions = collectionIntent
    ? normalizedActions
        .filter((action) => action.tool === 'scan_and_publish_matches' && matchCount !== null)
        .slice(0, 1)
    : normalizedActions.filter((action) => {
        if (action.tool === 'scan_and_publish_matches' || !isActionRequested(action) || seenTools.has(action.tool)) return false;
        seenTools.add(action.tool);
        return true;
      });
  const actionsToExecute = requestedActions.map((action) => {
    if (action.tool === 'scan_and_publish_matches') {
      return { ...action, args: { ...action.args, count: matchCount, ...(draftOnly ? { publishImmediately: false } : {}) } };
    }
    // Summaries and statistics must come from verified site data, not model-written numbers.
    if (action.tool === 'telegram_channel_post' && isTelegramDigestPublicationIntent(userPrompt)) {
      return { tool: action.tool, args: { action: 'DAILY_DIGEST' } };
    }
    return action;
  });
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
