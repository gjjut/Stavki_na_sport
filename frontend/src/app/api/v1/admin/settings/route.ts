import { NextRequest, NextResponse } from 'next/server';
import { hashPassword } from '@/server/auth';
import {
  mutateState,
  readState,
  toAdminSettingsDto,
} from '@/server/database';
import { requireAdminAccount } from '@/server/guards';
import {
  fetchTelegramBotUsername,
  installTelegramMiniAppAndWebhook,
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

    const incomingSettings = { ...body.settings };
    delete incomingSettings.telegramBotTokenConfigured;
    delete incomingSettings.yookassaSecretKeyConfigured;
    const incomingBotToken = incomingSettings.telegramBotToken?.trim() || '';
    const incomingYooKassaSecret = incomingSettings.yookassaSecretKey?.trim() || '';

    let resolvedBotUsername: string | undefined;
    if (incomingBotToken) {
      const uname = await fetchTelegramBotUsername(incomingBotToken);
      if (uname) resolvedBotUsername = uname;
    }

    const nextSettings = await mutateState((state) => {
      state.settings = {
        ...state.settings,
        ...incomingSettings,
        yookassaSecretKey: incomingYooKassaSecret
          ? incomingYooKassaSecret
          : state.settings.yookassaSecretKey,
        telegramBotToken: incomingBotToken
          ? incomingBotToken
          : state.settings.telegramBotToken,
        ...(resolvedBotUsername !== undefined
          ? { telegramBotUsername: resolvedBotUsername }
          : {}),
      };

      const adminRow = state.users.find((u) => u.id === admin.id);
      if (adminRow) {
        if (body.newAdminEmail && body.newAdminEmail.includes('@')) {
          adminRow.email = body.newAdminEmail.trim().toLowerCase();
        }
        if (body.newAdminPassword) {
          if (body.newAdminPassword.length < 12) {
            throw new Error('Новый пароль администратора должен содержать минимум 12 символов.');
          }
          adminRow.passwordHash = hashPassword(body.newAdminPassword);
        }
      }

      return state.settings;
    });

    return NextResponse.json({ settings: toAdminSettingsDto(nextSettings) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка сохранения настроек' },
      { status: 400 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminAccount();
    const body = (await req.json().catch(() => ({}))) as {
      action?: 'TEST_CHANNEL' | 'INSTALL_MINI_APP';
    };
    const state = await readState();

    if (body.action === 'INSTALL_MINI_APP') {
      const origin = new URL(req.url).origin;
      const result = await installTelegramMiniAppAndWebhook(
        state.settings,
        origin,
      );
      if (!result.ok) {
        return NextResponse.json({ error: result.message }, { status: 400 });
      }
      return NextResponse.json({ ok: true, message: result.message });
    }

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
