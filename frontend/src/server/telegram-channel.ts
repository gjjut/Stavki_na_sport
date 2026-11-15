import type { PlatformSettings } from './types';

const REQUEST_TIMEOUT_MS = 12_000;

export type TelegramChannelSendResult =
  | { sent: true; outcome: 'sent'; messageId: number; warning?: string }
  | { sent: false; outcome: 'rejected' | 'unknown'; error: string };

export interface TelegramChannelDiagnostic {
  ok: boolean;
  message: string;
}

type TelegramReply = {
  ok?: boolean;
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number };
  result?: Record<string, unknown>;
};

type TelegramRequestResult =
  | { ok: true; result: Record<string, unknown> }
  | { ok: false; outcome: 'rejected' | 'unknown'; message: string };

export function escapeTelegramHtml(value: string): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function credentials(settings: PlatformSettings):
  | { token: string; chatId: string }
  | { error: string } {
  const token = [settings.telegramBotToken, process.env.TELEGRAM_BOT_TOKEN]
    .map((s) => (s || '').trim()).find(Boolean) || '';
  const chatId = [
    settings.telegramChannelId,
    process.env.TELEGRAM_CHANNEL_ID,
    process.env.TELEGRAM_VIP_CHANNEL_ID, // прежнее имя переменной для совместимости
  ].map((s) => (s || '').trim()).find(Boolean) || '';

  if (!token || token.includes('replace_with') || !chatId || chatId.includes('replace_with')) {
    return { error: 'Сохраните Bot Token и ID канала в разделе «Настройки → Telegram».' };
  }
  // The token becomes part of a URL path, so never accept separators or control characters.
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
    return { error: 'Формат Bot Token неверный. Скопируйте токен бота целиком из BotFather и сохраните его.' };
  }
  if (!/^(?:@[A-Za-z0-9_]+|-?\d+)$/.test(chatId)) {
    return { error: 'ID канала должен быть в формате @channel или числовом формате -100…, а не ссылкой t.me.' };
  }
  return { token, chatId };
}

function networkDetail(err: unknown, timedOut: boolean): string {
  if (timedOut || (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError'))) {
    return 'превышено время ожидания';
  }
  const allowed = new Set([
    'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET',
    'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT',
    'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_INVALID',
  ]);
  let current: unknown = err;
  for (let i = 0; i < 4 && current && typeof current === 'object'; i += 1) {
    const item = current as { code?: unknown; cause?: unknown };
    if (typeof item.code === 'string' && allowed.has(item.code)) {
      if (item.code === 'ENOTFOUND' || item.code === 'EAI_AGAIN') return `ошибка DNS (${item.code})`;
      if (item.code.startsWith('CERT_') || item.code.startsWith('ERR_TLS_') || item.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
        return `ошибка TLS-сертификата (${item.code})`;
      }
      return `ошибка сети (${item.code})`;
    }
    current = item.cause;
  }
  // Do not expose raw exceptions: fetch errors can contain the URL with the bot token.
  return 'ошибка соединения или ответа';
}

function rejectedMessage(code: number, data: TelegramReply): string {
  const description = typeof data.description === 'string' ? data.description.toLowerCase() : '';
  if (code === 401) return 'Telegram отклонил Bot Token (HTTP 401). Проверьте токен в BotFather и сохраните его заново.';
  if (code === 429) {
    const seconds = data.parameters?.retry_after;
    const wait = typeof seconds === 'number' && Number.isInteger(seconds) && seconds > 0 && seconds <= 86_400
      ? ` Подождите не менее ${seconds} сек.` : ' Подождите перед повтором.';
    return `Telegram ограничил частоту запросов (HTTP 429).${wait}`;
  }
  if (description.includes('chat not found')) {
    return 'Telegram не нашёл канал (HTTP 400). Проверьте @username или числовой ID и добавьте бота в администраторы канала.';
  }
  if (code === 403 || /not enough rights|not a member|have no rights|forbidden|kicked/.test(description)) {
    return `Telegram отклонил доступ (HTTP ${code}). Добавьте бота в администраторы канала с правом публиковать сообщения.`;
  }
  if (/parse entities|unsupported start tag|can't parse|message is too long/i.test(description)) {
    return 'Telegram отклонил формат или длину сообщения (HTTP 400). Проверьте текст и HTML-разметку.';
  }
  return `Telegram отклонил запрос (HTTP ${code}). Проверьте настройки канала и текст сообщения.`;
}

/** Each call makes exactly one request. In particular, sendMessage is never retried. */
async function requestTelegram(
  token: string,
  method: 'sendMessage' | 'getMe' | 'getChat' | 'getChatMember',
  body?: Record<string, unknown>,
): Promise<TelegramRequestResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      redirect: 'error',
      cache: 'no-store',
    });
    let data: TelegramReply | null = null;
    try {
      data = (await response.json()) as TelegramReply;
    } catch (err) {
      if (controller.signal.aborted) throw err;
      // An unreadable response is not proof that sendMessage failed.
    }

    if (response.ok && data?.ok === true && data.result && typeof data.result === 'object') {
      return { ok: true, result: data.result };
    }
    // Even a 5xx response can arrive after Telegram accepted a sendMessage.
    const code = typeof data?.error_code === 'number' ? data.error_code : response.status;
    if (response.status >= 400 && response.status < 500 && data?.ok === false && code >= 400 && code < 500) {
      return { ok: false, outcome: 'rejected', message: rejectedMessage(code, data) };
    }
    return {
      ok: false,
      outcome: 'unknown',
      message: response.status >= 500
        ? `Telegram или промежуточный сервер вернул HTTP ${response.status}.`
        : 'Получен неполный или непонятный ответ Telegram.',
    };
  } catch (err) {
    return {
      ok: false,
      outcome: 'unknown',
      message: `Нет подтверждённого ответа от api.telegram.org: ${networkDetail(err, timedOut)}. Проверьте DNS, исходящий HTTPS и TLS на сервере.`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function sendTelegramChannelAnnouncement(
  settings: PlatformSettings,
  htmlText: string,
  button?: { text: string; url: string },
): Promise<TelegramChannelSendResult> {
  const configured = credentials(settings);
  if ('error' in configured) return { sent: false, outcome: 'rejected', error: configured.error };
  if (!htmlText.trim()) return { sent: false, outcome: 'rejected', error: 'Текст сообщения для Telegram пуст.' };

  let canAttachButton = false;
  try {
    const url = new URL(button?.url || '');
    canAttachButton = ['http:', 'https:'].includes(url.protocol) &&
      !['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch { /* No usable public button URL. */ }

  const reply = await requestTelegram(configured.token, 'sendMessage', {
    chat_id: configured.chatId,
    parse_mode: 'HTML',
    text: htmlText,
    ...(canAttachButton ? { reply_markup: { inline_keyboard: [[{ text: button!.text, url: button!.url }]] } } : {}),
  });
  if (!reply.ok) {
    return {
      sent: false,
      outcome: reply.outcome,
      error: reply.outcome === 'unknown'
        ? `${reply.message} Итог публикации неизвестен: проверьте канал перед повтором, чтобы не создать дубль.`
        : reply.message,
    };
  }
  const messageId = reply.result.message_id;
  if (typeof messageId !== 'number' || !Number.isInteger(messageId)) {
    return {
      sent: false,
      outcome: 'unknown',
      error: 'Telegram не вернул подтверждение сообщения. Итог публикации неизвестен: проверьте канал перед повтором, чтобы не создать дубль.',
    };
  }
  return { sent: true, outcome: 'sent', messageId };
}

/** Read-only checks: no message is sent and the previous send's outcome cannot be inferred. */
export async function diagnoseTelegramChannel(settings: PlatformSettings): Promise<TelegramChannelDiagnostic> {
  const configured = credentials(settings);
  if ('error' in configured) return { ok: false, message: configured.error };

  const me = await requestTelegram(configured.token, 'getMe');
  if (!me.ok) return { ok: false, message: `Проверка бота: ${me.message}` };
  const botId = me.result.id;
  if (typeof botId !== 'number' || !Number.isSafeInteger(botId)) {
    return { ok: false, message: 'Telegram вернул неполные сведения о боте. Публикация при проверке не выполнялась.' };
  }
  const chat = await requestTelegram(configured.token, 'getChat', { chat_id: configured.chatId });
  if (!chat.ok) return { ok: false, message: `Проверка канала: ${chat.message}` };
  if (chat.result.type !== 'channel') {
    return { ok: false, message: 'Указанный ID не относится к Telegram-каналу. Проверьте ID в настройках.' };
  }
  const member = await requestTelegram(configured.token, 'getChatMember', {
    chat_id: configured.chatId,
    user_id: botId,
  });
  if (!member.ok) return { ok: false, message: `Проверка прав бота: ${member.message}` };
  if (member.result.status !== 'creator' &&
      !(member.result.status === 'administrator' && member.result.can_post_messages === true)) {
    return { ok: false, message: 'У бота нет подтверждённого права публиковать сообщения. Добавьте его в администраторы канала и включите это право.' };
  }
  const username = typeof me.result.username === 'string' && /^[A-Za-z0-9_]{4,32}$/.test(me.result.username)
    ? ` @${me.result.username}` : '';
  return {
    ok: true,
    message: `Бот${username} доступен и имеет право публиковать в канале. Это проверка на текущий момент: сообщений не отправляли, статус предыдущего поста она не определяет.`,
  };
}
