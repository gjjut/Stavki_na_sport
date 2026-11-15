import type { PlatformSettings } from './types';
import type { VerifiedYooKassaPayment } from './payment-policy';
import { telegramWebhookSecret } from './security-policy';

export interface YooKassaCreatePaymentArgs {
  settings: PlatformSettings;
  idempotenceKey: string;
  amountRub: number;
  title: string;
  receiptEmail: string;
  returnUrl: string;
  metadata: Record<string, string>;
}

export interface YooKassaCreatedPayment {
  externalPaymentId: string;
  confirmationUrl: string;
  status: string;
}

function yooKassaCredentials(settings: PlatformSettings): { shopId: string; secretKey: string } {
  const shopId = (settings.yookassaShopId || process.env.YOOKASSA_SHOP_ID || '').trim();
  const secretKey = (settings.yookassaSecretKey || process.env.YOOKASSA_SECRET_KEY || '').trim();
  if (!shopId || !secretKey || shopId.includes('replace_with') || secretKey.includes('replace_with')) {
    throw new Error(
      'Боевые ключи ЮKassa еще не указаны. Заполните Shop ID и Секретный ключ в настройках админ-панели или включите Тестовый режим.',
    );
  }
  return { shopId, secretKey };
}

/** Check deterministic configuration errors before reserving a live order. */
export function assertYooKassaLiveConfigured(settings: PlatformSettings): void {
  yooKassaCredentials(settings);
}

export async function createYooKassaLivePayment(
  args: YooKassaCreatePaymentArgs,
): Promise<YooKassaCreatedPayment> {
  const { shopId, secretKey } = yooKassaCredentials(args.settings);
  const amountStr = args.amountRub.toFixed(2);
  const auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');

  const payload = {
    amount: {
      value: amountStr,
      currency: 'RUB',
    },
    capture: true,
    confirmation: {
      type: 'redirect',
      return_url: args.returnUrl,
    },
    description: args.title.slice(0, 128),
    metadata: args.metadata,
    receipt: {
      customer: {
        email: args.receiptEmail,
      },
      items: [
        {
          description: args.title.slice(0, 128),
          quantity: '1.00',
          amount: {
            value: amountStr,
            currency: 'RUB',
          },
          vat_code: args.settings.yookassaVatCode || 1,
          payment_mode: 'full_payment',
          payment_subject: 'service',
        },
      ],
    },
  };

  let res: Response;
  try {
    res = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Basic ${auth}`,
        'Idempotence-Key': args.idempotenceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // A lost response does not establish whether the provider created a payment.
    throw new Error('Нет подтверждения от ЮKassa. До повторной оплаты обратитесь в поддержку для проверки заказа.');
  }

  if (!res.ok) {
    // Do not return raw provider response bodies to a customer.
    throw new Error(`ЮKassa не подтвердила создание платежа (${res.status}). До повтора обратитесь в поддержку.`);
  }

  let data: { id?: unknown; status?: unknown; confirmation?: { confirmation_url?: unknown } };
  try {
    data = await res.json();
  } catch {
    throw new Error('Получен неполный ответ ЮKassa. До повторной оплаты обратитесь в поддержку для проверки заказа.');
  }
  let confirmationUrl: URL;
  try {
    if (typeof data?.id !== 'string' || !data.id.trim() || data.id.length > 128 || typeof data.status !== 'string' ||
        typeof data.confirmation?.confirmation_url !== 'string') throw new Error('invalid');
    confirmationUrl = new URL(data.confirmation.confirmation_url);
    if (confirmationUrl.protocol !== 'https:' || confirmationUrl.username || confirmationUrl.password) throw new Error('invalid');
  } catch {
    throw new Error('ЮKassa вернула некорректные данные платежа. До повтора обратитесь в поддержку.');
  }

  return {
    externalPaymentId: data.id as string,
    confirmationUrl: confirmationUrl.href,
    status: data.status as string,
  };
}

export async function verifyYooKassaLivePayment(
  settings: PlatformSettings,
  externalPaymentId: string,
): Promise<VerifiedYooKassaPayment> {
  if (typeof externalPaymentId !== 'string' || !externalPaymentId.trim() || externalPaymentId.length > 128) {
    throw new Error('Не указан корректный идентификатор платежа ЮKassa.');
  }
  const shopId = (settings.yookassaShopId || process.env.YOOKASSA_SHOP_ID || '').trim();
  const secretKey = (
    settings.yookassaSecretKey ||
    process.env.YOOKASSA_SECRET_KEY ||
    ''
  ).trim();

  if (!shopId || !secretKey) {
    throw new Error('Ключи ЮKassa не настроены');
  }

  const auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');
  const res = await fetch(
    `https://api.yookassa.ru/v3/payments/${encodeURIComponent(externalPaymentId)}`,
    {
      method: 'GET',
      signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Basic ${auth}` },
    },
  );

  if (!res.ok) {
    throw new Error(`Не удалось проверить статус платежа в ЮKassa (${res.status})`);
  }

  const data = (await res.json()) as {
    id?: unknown;
    status?: unknown;
    paid?: unknown;
    amount?: { value?: unknown; currency?: unknown };
    metadata?: { orderId?: unknown; userId?: unknown };
  };
  if (data.id !== externalPaymentId || typeof data.status !== 'string' ||
      typeof data.paid !== 'boolean' || typeof data.amount?.value !== 'string' ||
      typeof data.amount?.currency !== 'string' || !data.metadata || typeof data.metadata !== 'object') {
    throw new Error('ЮKassa вернула неполные данные платежа; требуется ручная проверка.');
  }

  return {
    id: data.id,
    status: data.status,
    paid: data.paid,
    amountValue: data.amount.value,
    currency: data.amount.currency,
    metadata: data.metadata,
  };
}

export interface VerifiedYooKassaRefund {
  id: string;
  paymentId: string;
  status: string;
  amountValue: string;
  currency: string;
}

/** Fetch the refund object itself with the shop credentials; webhook bodies are not proof. */
export async function verifyYooKassaLiveRefund(
  settings: PlatformSettings,
  refundId: string,
): Promise<VerifiedYooKassaRefund> {
  const shopId = (settings.yookassaShopId || process.env.YOOKASSA_SHOP_ID || '').trim();
  const secretKey = (settings.yookassaSecretKey || process.env.YOOKASSA_SECRET_KEY || '').trim();
  if (!shopId || !secretKey) throw new Error('Ключи ЮKassa не настроены');

  const auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');
  const res = await fetch(`https://api.yookassa.ru/v3/refunds/${encodeURIComponent(refundId)}`, {
    method: 'GET',
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`Не удалось проверить возврат в ЮKassa (${res.status})`);
  const data = (await res.json()) as {
    id?: unknown;
    payment_id?: unknown;
    status?: unknown;
    amount?: { value?: unknown; currency?: unknown };
  };
  if (data?.id !== refundId || typeof data.payment_id !== 'string' || !data.payment_id ||
      typeof data.status !== 'string' || typeof data.amount?.value !== 'string' ||
      !/^\d{1,16}(?:\.\d{1,2})?$/.test(data.amount.value) || Number(data.amount.value) <= 0 ||
      typeof data.amount?.currency !== 'string' || !/^[A-Z]{3}$/.test(data.amount.currency)) {
    throw new Error('ЮKassa вернула неполные или некорректные данные возврата.');
  }
  return {
    id: refundId,
    paymentId: data.payment_id,
    status: data.status,
    amountValue: data.amount.value,
    currency: data.amount.currency,
  };
}

export { diagnoseTelegramChannel, escapeTelegramHtml, sendTelegramChannelAnnouncement } from './telegram-channel';
export type { TelegramChannelSendResult } from './telegram-channel';

export async function sendTelegramDirectMessage(
  settings: PlatformSettings,
  chatId: string | null | undefined,
  htmlText: string,
): Promise<{ sent: boolean; error?: string }> {
  const token = (settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const cleanChat = (chatId || '').trim();
  if (!token || !cleanChat || token.includes('replace_with')) {
    return { sent: false, error: 'Бот или Chat ID не подключены' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cleanChat,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        text: htmlText,
      }),
    });
    const data = (await res.json()) as { ok?: boolean };
    if (!res.ok || !data.ok) {
      return { sent: false, error: 'Telegram отклонил сообщение. Проверьте привязку и настройки бота.' };
    }
    return { sent: true };
  } catch {
    // Raw fetch errors may contain the URL with the bot token. A timeout or
    // broken connection also does not prove that Telegram failed to deliver.
    return { sent: false, error: 'Нет подтверждения отправки. Проверьте Telegram перед повтором.' };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchTelegramBotUsername(
  botToken: string,
): Promise<string | null> {
  const token = (botToken || '').trim();
  if (!token || token.includes('replace_with')) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    const json = (await res.json()) as {
      ok?: boolean;
      result?: { username?: string };
    };
    if (json.ok && json.result?.username) {
      return json.result.username.replace(/^@/, '');
    }
    return null;
  } catch {
    return null;
  }
}

export async function pollTelegramUpdatesForLinkCode(
  botToken: string,
  linkCode: string,
): Promise<{ chatId: string; username: string | null } | null> {
  const token = (botToken || '').trim();
  if (!token || !linkCode || token.includes('replace_with')) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(
      `https://api.telegram.org/bot${token}/getUpdates?limit=60&allowed_updates=%5B%22message%22%5D`,
      { signal: controller.signal, cache: 'no-store' },
    );
    clearTimeout(timer);
    const json = (await res.json()) as {
      ok?: boolean;
      result?: Array<{
        message?: {
          text?: string;
          chat?: { id?: number | string; username?: string; type?: string };
        };
      }>;
    };
    if (!json.ok || !Array.isArray(json.result)) return null;

    for (let i = json.result.length - 1; i >= 0; i--) {
      const msg = json.result[i]?.message;
      const text = (msg?.text || '').trim();
      if (
        msg?.chat?.id && msg.chat.type === 'private' &&
        (text === `/start ${linkCode}` || text === linkCode)
      ) {
        return {
          chatId: String(msg.chat.id),
          username: msg.chat.username ? `@${msg.chat.username}` : null,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function installTelegramMiniAppAndWebhook(
  settings: PlatformSettings,
  originUrl: string,
): Promise<{ ok: boolean; message: string }> {
  const token = (
    settings.telegramBotToken ||
    process.env.TELEGRAM_BOT_TOKEN ||
    ''
  ).trim();
  if (!token || token.includes('replace_with')) {
    return {
      ok: false,
      message: 'Сначала укажите и сохраните Telegram Bot Token (@BotFather)',
    };
  }

  const webhookSecret = telegramWebhookSecret();
  if (!webhookSecret) {
    return { ok: false, message: 'Настройте SESSION_SECRET перед установкой защищённого Telegram webhook.' };
  }

  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (process.env.NODE_ENV === 'production' && !configuredUrl) {
    return { ok: false, message: 'Для Telegram настройте канонический HTTPS-адрес в NEXT_PUBLIC_SITE_URL.' };
  }
  let base: string;
  try {
    const parsed = new URL(configuredUrl || originUrl);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('invalid');
    base = parsed.origin;
  } catch {
    return { ok: false, message: 'Telegram Mini App и webhook требуют корректный HTTPS-адрес сайта в NEXT_PUBLIC_SITE_URL.' };
  }

  let webhookInstalled = false;
  try {
    const whRes = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: `${base}/api/v1/webhooks/telegram`,
          secret_token: webhookSecret,
          allowed_updates: ['message'],
        }),
      },
    );
    const whJson = (await whRes.json()) as { ok?: boolean };
    if (!whRes.ok || !whJson.ok) {
      return { ok: false, message: 'Telegram отклонил установку webhook. Проверьте токен бота и HTTPS-адрес сайта.' };
    }
    webhookInstalled = true;

    const menuRes = await fetch(
      `https://api.telegram.org/bot${token}/setChatMenuButton`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menu_button: {
            type: 'web_app',
            text: '🔥 Витрина прогнозов',
            web_app: { url: `${base}/tg-app` },
          },
        }),
      },
    );
    const menuJson = (menuRes.ok
      ? await menuRes.json()
      : { ok: false, description: 'Ошибка установки кнопки меню' }) as {
      ok?: boolean;
      description?: string;
    };

    if (!menuRes.ok || !menuJson.ok) {
      return { ok: false, message: 'Webhook установлен, но Telegram отклонил кнопку Mini App. Проверьте настройки бота и адрес сайта.' };
    }

    return {
      ok: true,
      message: `Готово! В вашего Telegram-бота установлена кнопка Mini App («🔥 Витрина прогнозов» → ${base}/tg-app) и активирован Webhook уведомлений!`,
    };
  } catch {
    // Never expose an exception containing the token-bearing Telegram URL.
    return {
      ok: false,
      message: webhookInstalled
        ? 'Webhook установлен, но нет подтверждения установки кнопки Mini App. Проверьте настройки бота.'
        : 'Нет подтверждения установки webhook. Проверьте настройки бота перед повтором.',
    };
  }
}

