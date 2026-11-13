import type { PlatformSettings } from './types';

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

export async function createYooKassaLivePayment(
  args: YooKassaCreatePaymentArgs,
): Promise<YooKassaCreatedPayment> {
  const shopId = (args.settings.yookassaShopId || process.env.YOOKASSA_SHOP_ID || '').trim();
  const secretKey = (
    args.settings.yookassaSecretKey ||
    process.env.YOOKASSA_SECRET_KEY ||
    ''
  ).trim();

  if (!shopId || !secretKey || secretKey.includes('replace_with')) {
    throw new Error(
      'Боевые ключи ЮKassa еще не указаны. Заполните Shop ID и Секретный ключ в настройках админ-панели или включите Тестовый режим.',
    );
  }

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

  const res = await fetch('https://api.yookassa.ru/v3/payments', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Idempotence-Key': args.idempotenceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ошибка ЮKassa (${res.status}): ${errText.slice(0, 220)}`);
  }

  const data = (await res.json()) as {
    id: string;
    status: string;
    confirmation?: { confirmation_url?: string };
  };

  if (!data.confirmation?.confirmation_url) {
    throw new Error('ЮKassa не вернула ссылку на страницу оплаты');
  }

  return {
    externalPaymentId: data.id,
    confirmationUrl: data.confirmation.confirmation_url,
    status: data.status,
  };
}

export async function verifyYooKassaLivePayment(
  settings: PlatformSettings,
  externalPaymentId: string,
): Promise<{ status: string; paid: boolean; amountValue: string }> {
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
      headers: { Authorization: `Basic ${auth}` },
    },
  );

  if (!res.ok) {
    throw new Error(`Не удалось проверить статус платежа в ЮKassa (${res.status})`);
  }

  const data = (await res.json()) as {
    status: string;
    paid: boolean;
    amount: { value: string };
  };

  return {
    status: data.status,
    paid: Boolean(data.paid),
    amountValue: data.amount.value,
  };
}

export async function sendTelegramChannelAnnouncement(
  settings: PlatformSettings,
  htmlText: string,
  button?: { text: string; url: string },
): Promise<{ sent: boolean; error?: string }> {
  const token = (settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = (
    settings.telegramChannelId ||
    process.env.TELEGRAM_VIP_CHANNEL_ID ||
    ''
  ).trim();

  if (!token || !chatId || token.includes('replace_with')) {
    return { sent: false, error: 'Токен бота или ID канала не указаны' };
  }

  const canAttachButton =
    button?.url &&
    /^https?:\/\//i.test(button.url) &&
    !button.url.includes('localhost') &&
    !button.url.includes('127.0.0.1');

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        parse_mode: 'HTML',
        text: htmlText,
        ...(canAttachButton
          ? {
              reply_markup: {
                inline_keyboard: [[{ text: button!.text, url: button!.url }]],
              },
            }
          : {}),
      }),
    });
    const data = (await res.json()) as { ok: boolean; description?: string };
    if (!data.ok) {
      return { sent: false, error: data.description || 'Ошибка Telegram API' };
    }
    return { sent: true };
  } catch (err) {
    return {
      sent: false,
      error: err instanceof Error ? err.message : 'Сетевая ошибка Telegram',
    };
  }
}

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

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
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
    clearTimeout(timer);
    const data = (await res.json()) as { ok: boolean; description?: string };
    if (!data.ok) {
      return { sent: false, error: data.description || 'Ошибка отправки в Telegram' };
    }
    return { sent: true };
  } catch (err) {
    return {
      sent: false,
      error: err instanceof Error ? err.message : 'Сетевая ошибка Telegram',
    };
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
          chat?: { id?: number | string; username?: string };
        };
      }>;
    };
    if (!json.ok || !Array.isArray(json.result)) return null;

    for (let i = json.result.length - 1; i >= 0; i--) {
      const msg = json.result[i]?.message;
      const text = (msg?.text || '').trim();
      if (
        msg?.chat?.id &&
        (text === `/start ${linkCode}` ||
          text === linkCode ||
          text.endsWith(` ${linkCode}`))
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

  const base = (process.env.NEXT_PUBLIC_SITE_URL || originUrl).replace(/\/+$/, '');
  if (!base.startsWith('https://')) {
    return {
      ok: false,
      message: `Telegram Mini App и Webhook требуют HTTPS-домен (сейчас адрес ${base}). Привяжите домен командой: bash deploy/setup-domain-ssl.sh ваш-домен.ru ваш@email.ru — и кнопка установится за 1 секунду!`,
    };
  }

  try {
    const whRes = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: `${base}/api/v1/webhooks/telegram`,
          allowed_updates: ['message'],
        }),
      },
    );
    const whJson = (await whRes.json()) as { ok?: boolean; description?: string };

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

    if (!whJson.ok || !menuJson.ok) {
      return {
        ok: false,
        message:
          menuJson.description ||
          whJson.description ||
          'Ошибка ответа Telegram API',
      };
    }

    return {
      ok: true,
      message: `Готово! В вашего Telegram-бота установлена кнопка Mini App («🔥 Витрина прогнозов» → ${base}/tg-app) и активирован Webhook уведомлений!`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Сетевая ошибка Telegram',
    };
  }
}

