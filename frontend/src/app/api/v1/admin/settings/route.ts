import { NextRequest, NextResponse } from 'next/server';
import { hashPassword } from '@/server/auth';
import { mutateState, readState } from '@/server/database';
import { requireAdminAccount } from '@/server/guards';
import {
  fetchTelegramBotUsername,
  sendTelegramChannelAnnouncement,
} from '@/server/integrations';
import type { PlatformSettings } from '@/server/types';

export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireAdminAccount();
    const body = (await req.json()) as {
      settings: Partial<PlatformSettings>;
      newAdminEmail?: string;
      newAdminPassword?: string;
    };

    let resolvedBotUsername: string | undefined;
    if (body.settings.telegramBotToken?.trim()) {
      const uname = await fetchTelegramBotUsername(body.settings.telegramBotToken);
      if (uname) resolvedBotUsername = uname;
    }

    const nextSettings = await mutateState((state) => {
      state.settings = {
        ...state.settings,
        ...body.settings,
        ...(resolvedBotUsername !== undefined
          ? { telegramBotUsername: resolvedBotUsername }
          : {}),
      };

      const adminRow = state.users.find((u) => u.id === admin.id);
      if (adminRow) {
        if (body.newAdminEmail && body.newAdminEmail.includes('@')) {
          adminRow.email = body.newAdminEmail.trim().toLowerCase();
        }
        if (body.newAdminPassword && body.newAdminPassword.length >= 6) {
          adminRow.passwordHash = hashPassword(body.newAdminPassword);
        }
      }

      return state.settings;
    });

    return NextResponse.json({ settings: nextSettings });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка сохранения настроек' },
      { status: 400 },
    );
  }
}

export async function POST() {
  try {
    await requireAdminAccount();
    const state = await readState();
    const res = await sendTelegramChannelAnnouncement(
      state.settings,
      `✅ <b>${state.settings.brandName}</b>: подключение Telegram-бота для публикации анонсов успешно проверено!`,
    );
    if (!res.sent) {
      return NextResponse.json(
        { error: res.error || 'Не удалось отправить сообщение в Telegram' },
        { status: 400 },
      );
    }
    return NextResponse.json({ sent: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка проверки Telegram' },
      { status: 400 },
    );
  }
}
