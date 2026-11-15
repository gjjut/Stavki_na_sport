import { NextRequest, NextResponse } from 'next/server';
import { hashPassword, SESSION_COOKIE_NAME, signSessionToken } from '@/server/auth';
import { sessionCookieOptions } from '@/server/security-policy';
import {
  mutateState,
  readState,
  StorageUnavailableError,
  toAdminSettingsDto,
} from '@/server/database';
import { requireAdminAccount } from '@/server/guards';
import {
  diagnoseTelegramChannel,
  escapeTelegramHtml,
  fetchTelegramBotUsername,
  installTelegramMiniAppAndWebhook,
  sendTelegramChannelAnnouncement,
} from '@/server/integrations';
import type { PlatformSettings } from '@/server/types';

function settingsError(err: unknown, fallback: string) {
  if (err instanceof StorageUnavailableError) return NextResponse.json({ error: err.message }, { status: 503 });
  const code = err instanceof Error ? err.message : '';
  if (code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Войдите как администратор.' }, { status: 401 });
  if (code === 'BLOCKED' || code === 'FORBIDDEN') return NextResponse.json({ error: 'Доступ только для администратора.' }, { status: 403 });
  return NextResponse.json({ error: code || fallback }, { status: 400 });
}

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
          if (body.newAdminPassword.length < 12 || body.newAdminPassword.length > 256) {
            throw new Error('Новый пароль администратора должен содержать от 12 до 256 символов.');
          }
          adminRow.passwordHash = hashPassword(body.newAdminPassword);
          adminRow.passwordResetCode = null;
          adminRow.passwordResetExpiresAt = null;
          adminRow.passwordResetAttempts = 0;
        }
      }

      return { settings: state.settings, passwordHash: adminRow?.passwordHash ?? admin.passwordHash };
    });

    const response = NextResponse.json({ settings: toAdminSettingsDto(nextSettings.settings) });
    if (body.newAdminPassword) {
      response.cookies.set(SESSION_COOKIE_NAME, signSessionToken({ id: admin.id, passwordHash: nextSettings.passwordHash }), sessionCookieOptions(req));
    }
    return response;
  } catch (err) {
    return settingsError(err, 'Ошибка сохранения настроек');
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminAccount();
    const body = (await req.json().catch(() => ({}))) as {
      action?: 'TEST_CHANNEL' | 'DIAGNOSE_CHANNEL' | 'INSTALL_MINI_APP';
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

    if (body.action === 'DIAGNOSE_CHANNEL') {
      return NextResponse.json(await diagnoseTelegramChannel(state.settings));
    }
    if (body.action !== 'TEST_CHANNEL') {
      return NextResponse.json({ error: 'Укажите действие проверки Telegram.' }, { status: 400 });
    }

    const res = await sendTelegramChannelAnnouncement(
      state.settings,
      `✅ <b>${escapeTelegramHtml(state.settings.brandName.slice(0, 100))}</b>: подключение Telegram-бота для публикации анонсов успешно проверено!`,
    );
    if (!res.sent) {
      return NextResponse.json(
        { error: res.error, outcome: res.outcome },
        { status: res.outcome === 'unknown' ? 502 : 400 },
      );
    }
    return NextResponse.json({ sent: true });
  } catch (err) {
    return settingsError(err, 'Ошибка проверки Telegram');
  }
}
