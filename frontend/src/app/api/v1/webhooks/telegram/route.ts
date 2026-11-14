import { NextRequest, NextResponse } from 'next/server';
import { mutateState } from '@/server/database';
import { sendTelegramDirectMessage } from '@/server/integrations';

export async function POST(req: NextRequest) {
  try {
    const update = (await req.json()) as {
      message?: {
        text?: string;
        chat?: { id?: number | string; username?: string };
      };
    };

    const text = (update.message?.text || '').trim();
    const chatId = update.message?.chat?.id ? String(update.message.chat.id) : null;
    const username = update.message?.chat?.username
      ? `@${update.message.chat.username}`
      : null;

    if (!chatId || !text) {
      return NextResponse.json({ ok: true });
    }

    const codeMatch = text.match(/(vx_[a-f0-9]{8,16})/i);
    if (codeMatch) {
      const linkCode = codeMatch[1].toLowerCase();
      const linked = await mutateState((state) => {
        const u = state.users.find(
          (row) => (row.telegramLinkCode || '').toLowerCase() === linkCode,
        );
        if (!u) return null;
        u.telegramChatId = chatId;
        if (username) u.telegramUsername = username;
        return { email: u.email, settings: state.settings };
      });

      if (linked) {
        await sendTelegramDirectMessage(
          linked.settings,
          chatId,
          `✅ <b>Уведомления успешно подключены к кабинету ${linked.email}!</b>\n\nТеперь все купленные прогнозы, расчеты матчей и возвраты 100% по страховке будут приходить вам прямо в этот чат.`,
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
