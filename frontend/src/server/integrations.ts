import type { PlatformSettings } from './types';

export interface YooKassaCreateResult {
  externalPaymentId: string;
  confirmationUrl: string;
  status: string;
}

export async function createYooKassaLivePayment(params: {
  settings: PlatformSettings;
  idempotenceKey: string;
  amountRub: number;
  title: string;
  receiptEmail: string;
  returnUrl: string;
  savePaymentMethod: boolean;
  metadata: Record<string, string>;
}): Promise<YooKassaCreateResult> {
  const shopId = params.settings.yookassaShopId || process.env.YOOKASSA_SHOP_ID || '';
  const secretKey = params.settings.yookassaSecretKey || process.env.YOOKASSA_SECRET_KEY || '';

  if (!shopId || !secretKey) {
    throw new Error(
      'Не заполнены ключи ЮKassa (Shop ID и Secret Key). Укажите их в Настройках админ-панели.',
    );
  }

  const auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');
  const valueStr = params.amountRub.toFixed(2);

  const body: Record<string, unknown> = {
    amount: { value: valueStr, currency: 'RUB' },
    capture: true,
    confirmation: {
      type: 'redirect',
      return_url: params.returnUrl,
    },
    description: params.title.slice(0, 128),
    metadata: params.metadata,
    receipt: {
      customer: { email: params.receiptEmail },
      items: [
        {
          description: `Доступ к аналитическому материалу: ${params.title}`.slice(0, 128),
          quantity: '1.00',
          amount: { value: valueStr, currency: 'RUB' },
          vat_code: params.settings.yookassaVatCode || 1,
          payment_mode: 'full_payment',
          payment_subject: 'service',
        },
      ],
    },
  };

  if (params.savePaymentMethod) {
    body.save_payment_method = true;
  }

  const res = await fetch('https://api.yookassa.ru/v3/payments', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Idempotence-Key': params.idempotenceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ЮKassa вернула ошибку (${res.status}): ${errText.slice(0, 180)}`);
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
  const shopId = settings.yookassaShopId || process.env.YOOKASSA_SHOP_ID || '';
  const secretKey = settings.yookassaSecretKey || process.env.YOOKASSA_SECRET_KEY || '';

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

export async function sendTelegramVipChannelMessage(
  settings: PlatformSettings,
  htmlText: string,
): Promise<{ sent: boolean; error?: string }> {
  const token = (settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = (settings.telegramVipChannelId || process.env.TELEGRAM_VIP_CHANNEL_ID || '').trim();

  if (!token || !chatId || token.includes('replace_with')) {
    return { sent: false, error: 'Токен бота или ID канала не указаны' };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        parse_mode: 'HTML',
        text: htmlText,
      }),
    });
    const data = (await res.json()) as { ok: boolean; description?: string };
    if (!data.ok) {
      return { sent: false, error: data.description || 'Ошибка Telegram API' };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : 'Сетевая ошибка Telegram' };
  }
}

export async function generateTelegramOneTimeInvite(
  settings: PlatformSettings,
  label: string,
): Promise<string | null> {
  const token = (settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = (settings.telegramVipChannelId || process.env.TELEGRAM_VIP_CHANNEL_ID || '').trim();

  if (!token || !chatId || token.includes('replace_with')) {
    return settings.freeTelegramUrl || null;
  }

  try {
    const expireUnix = Math.floor(Date.now() / 1000) + 7 * 86400;
    const res = await fetch(`https://api.telegram.org/bot${token}/createChatInviteLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        name: label.slice(0, 32),
        expire_date: expireUnix,
        member_limit: 1,
      }),
    });
    const data = (await res.json()) as { ok: boolean; result?: { invite_link: string } };
    if (data.ok && data.result?.invite_link) {
      return data.result.invite_link;
    }
    return settings.freeTelegramUrl || null;
  } catch {
    return settings.freeTelegramUrl || null;
  }
}
