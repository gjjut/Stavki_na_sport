import type { AiAutopilotConfig, AiLlmProvider } from './types';

export function initialLlmConfigFromEnv(
  env: NodeJS.ProcessEnv,
): Pick<AiAutopilotConfig, 'llmProvider' | 'llmBaseUrl' | 'llmApiKey' | 'llmModel'> {
  const plusVibeKey = (env.PLUSVIBE_API_KEY || '').trim();
  const ollamaKey = (env.OLLAMA_API_KEY || '').trim();
  const genericKey = (env.AI_LLM_API_KEY || '').trim();
  if (plusVibeKey) return {
    llmProvider: 'PLUSVIBE', llmApiKey: plusVibeKey,
    llmBaseUrl: env.PLUSVIBE_BASE_URL?.trim() || 'https://plusvibeapi.ru/v1',
    llmModel: env.PLUSVIBE_MODEL?.trim() || 'deepseek-v4.1-flash',
  };
  if (ollamaKey) return {
    llmProvider: 'OLLAMA', llmApiKey: ollamaKey,
    llmBaseUrl: env.OLLAMA_BASE_URL?.trim() || 'https://ollama.com/v1',
    llmModel: env.OLLAMA_MODEL?.trim() || 'deepseek-v4.1-flash',
  };
  if (genericKey.startsWith('sk-pv-')) return {
    llmProvider: 'PLUSVIBE', llmApiKey: genericKey,
    llmBaseUrl: env.AI_LLM_BASE_URL?.trim() || env.PLUSVIBE_BASE_URL?.trim() || 'https://plusvibeapi.ru/v1',
    llmModel: env.AI_LLM_MODEL?.trim() || env.PLUSVIBE_MODEL?.trim() || 'deepseek-v4.1-flash',
  };
  if (genericKey) return {
    llmProvider: 'DEEPSEEK', llmApiKey: genericKey,
    llmBaseUrl: env.AI_LLM_BASE_URL?.trim() || 'https://api.deepseek.com/v1',
    llmModel: env.AI_LLM_MODEL?.trim() || 'deepseek-chat',
  };
  return {
    llmProvider: 'BUILTIN_QUANT', llmApiKey: '',
    llmBaseUrl: 'https://plusvibeapi.ru/v1', llmModel: 'deepseek-v4.1-flash',
  };
}

const DEFAULT_BASE_URLS: Partial<Record<AiLlmProvider, string>> = {
  PLUSVIBE: 'https://plusvibeapi.ru/v1',
  OLLAMA: 'https://ollama.com/v1',
  ORCAROUTER: 'https://www.orcarouter.ai/v1',
  DEEPSEEK: 'https://api.deepseek.com/v1',
  OPENROUTER: 'https://openrouter.ai/api/v1',
  RU_GATEWAY: 'https://api.proxyapi.ru/openai/v1',
  OPENAI: 'https://api.openai.com/v1',
};

export function normalizeLlmBaseUrl(raw: string, provider: AiLlmProvider | string): string {
  const value = (raw || '').trim() || DEFAULT_BASE_URLS[provider as AiLlmProvider] || '';
  if (!value) throw new Error('Укажите API Base URL для выбранного провайдера.');
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && !/^https?:\/\//i.test(value)) {
    throw new Error('API Base URL должен использовать HTTPS.');
  }
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    throw new Error('Некорректный API Base URL.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('API Base URL не должен содержать логин, пароль, параметры запроса или фрагмент.');
  }
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localHttp) {
    throw new Error('API Base URL должен использовать HTTPS (HTTP допустим только для локального сервера).');
  }
  let pathname = url.pathname.replace(/\/+$/, '');
  if (!pathname || /^\/(?:console|dashboard)(?:\/|$)/.test(pathname)) pathname = '/v1';
  pathname = pathname.replace(/\/chat\/completions$/, '');
  return `${url.origin}${pathname}`;
}

/** A previously stored secret can only be reused for its existing provider and origin. */
export function assertLlmKeyScope(
  current: Pick<AiAutopilotConfig, 'llmProvider' | 'llmBaseUrl' | 'llmApiKey'>,
  next: Pick<AiAutopilotConfig, 'llmProvider' | 'llmBaseUrl'>,
  submittedKey: string,
): void {
  if (submittedKey || !current.llmApiKey.trim() || next.llmProvider === 'BUILTIN_QUANT') return;
  let sameOrigin = false;
  try {
    sameOrigin = new URL(normalizeLlmBaseUrl(current.llmBaseUrl, current.llmProvider)).origin ===
      new URL(normalizeLlmBaseUrl(next.llmBaseUrl, next.llmProvider)).origin;
  } catch { /* Do not send a saved key when its original scope is unclear. */ }
  if (current.llmProvider !== next.llmProvider || !sameOrigin) {
    throw new Error('При смене провайдера или адреса API введите ключ для нового подключения. Сохранённый ключ не отправляется на другой адрес.');
  }
}

export function assertLlmKeyMatchesProvider(key: string, provider: AiLlmProvider | string): void {
  if (key.trim().startsWith('sk-pv-') && provider !== 'PLUSVIBE' && provider !== 'BUILTIN_QUANT') {
    throw new Error('Ключ PlusVibe нельзя использовать с другим провайдером. Выберите PlusVibe или введите соответствующий ключ.');
  }
}

export function validateLlmProvider(provider: string): asserts provider is AiLlmProvider {
  if (!['PLUSVIBE', 'OLLAMA', 'ORCAROUTER', 'DEEPSEEK', 'OPENROUTER', 'RU_GATEWAY', 'GEMINI', 'OPENAI', 'BUILTIN_QUANT'].includes(provider)) {
    throw new Error('Неизвестный провайдер нейросети.');
  }
}
