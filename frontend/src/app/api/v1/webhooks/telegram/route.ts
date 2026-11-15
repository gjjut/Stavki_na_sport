import { NextRequest, NextResponse } from 'next/server';
import { mutateState } from '@/server/database';
import { escapeTelegramHtml, sendTelegramDirectMessage } from '@/server/integrations';
import { newTelegramLinkCode, secretsEqual, telegramWebhookSecret } from '@/server/security-policy';

export async function POST(req: NextRequest) {
  const expected = telegramWebhookSecret();
  if (!expected) return NextResponse.json({ error: 'Webhook is not configured' }, { status: 503 });
  if (!secretsEqual(req.headers.get('x-telegram-bot-api-secret-token'), expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const update = (await req.json()) as {
      message?: {
        text?: string;
        chat?: { id?: number | string; username?: string; type?: string };
      };
    };
    const message = update.message;
    const text = typeof message?.text === 'string' ? message.text.trim() : '';
    const chatId = message?.chat?.id ? String(message.chat.id) : null;
    // A binding must come from a private Telegram chat and contain only the one-time command.
    const codeMatch = text.match(/^\/start(?:@[a-z0-9_]+)?\s+(vx_[a-f0-9]{32})$/i);
    if (!chatId || message?.chat?.type !== 'private' || !codeMatch) {
      return NextResponse.json({ ok: true });
    }
    const username = message.chat.username ? `@${message.chat.username}` : null;
    const linked = await mutateState((state) => {
      const u = state.users.find((row) => row.telegramLinkCode === codeMatch[1].toLowerCase());
      // Never let a replay or a second chat replace an existing binding.
      if (!u || u.status !== 'ACTIVE' || u.telegramChatId) return null;
      u.telegramChatId = chatId;
      u.telegramBindingVerified = true;
      u.telegramLinkCode = newTelegramLinkCode();
      if (username) u.telegramUsername = username;
      return { email: u.email, settings: state.settings };
    });

    if (linked) {
      await sendTelegramDirectMessage(
        linked.settings,
        chatId,
        `✅ <b>Уведомления подключены к кабинету ${escapeTelegramHtml(linked.email)}.</b>\n\nСообщения о покупках и начислениях будут приходить в этот чат.`,
      );
    }
    return NextResponse.json({ ok: true });
  } catch {
    // Telegram can retry a storage failure; no private error details are sent back.
    return NextResponse.json({ error: 'Temporary webhook error' }, { status: 503 });
  }
}
