import { NextRequest, NextResponse } from 'next/server';
import { hashPassword, verifyPassword } from '@/server/auth';
import {
  mutateState,
  readState,
  StorageUnavailableError,
  toPublicPredictionDto,
  toSafeSessionUser,
} from '@/server/database';
import { requireAuthenticatedUser } from '@/server/guards';
import {
  fetchTelegramBotUsername,
  pollTelegramUpdatesForLinkCode,
  sendTelegramDirectMessage,
} from '@/server/integrations';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    const state = await readState();

    let botUsername = state.settings.telegramBotUsername || '';
    const botToken = (
      state.settings.telegramBotToken ||
      process.env.TELEGRAM_BOT_TOKEN ||
      ''
    ).trim();

    if (!botUsername && botToken && !botToken.includes('replace_with')) {
      const resolved = await fetchTelegramBotUsername(botToken);
      if (resolved) {
        botUsername = resolved;
        await mutateState((s) => {
          s.settings.telegramBotUsername = resolved;
        });
      }
    }

    const safeUser = toSafeSessionUser(user);
    const purchasedPredictions = state.predictions
      .filter((p) => user.purchasedPredictionIds.includes(p.id))
      .map((p) => toPublicPredictionDto(p, user));

    const myOrders = state.transactions.filter((t) => t.userId === user.id);
    const myAffiliateLinks = state.affiliateLinks.filter((l) => l.userId === user.id);
    const myPayouts = state.payouts.filter((p) => p.userId === user.id);

    return NextResponse.json({
      user: safeUser,
      telegramBotUsername: botUsername,
      telegramBotConfigured: Boolean(botToken && !botToken.includes('replace_with')),
      purchasedPredictions,
      orders: myOrders,
      affiliateLinks: myAffiliateLinks,
      payouts: myPayouts,
    });
  } catch (err) {
    if (err instanceof StorageUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const code = err instanceof Error ? err.message : '';
    return NextResponse.json(
      { error: 'Необходима авторизация' },
      { status: code === 'UNAUTHORIZED' ? 401 : 403 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const sessionUser = await requireAuthenticatedUser();
    const body = (await req.json()) as {
      displayName?: string;
      city?: string;
      telegramUsername?: string;
      referenceBankrollRub?: number;
      currentPassword?: string;
      newPassword?: string;
    };

    const updated = await mutateState((state) => {
      const u = state.users.find((row) => row.id === sessionUser.id);
      if (!u) throw new Error('Пользователь не найден');

      if (typeof body.displayName === 'string' && body.displayName.trim()) {
        u.displayName = body.displayName.trim().slice(0, 80);
      }
      if (typeof body.city === 'string') {
        u.city = body.city.trim().slice(0, 80);
      }
      if (typeof body.telegramUsername === 'string') {
        const cleanTg = body.telegramUsername.trim();
        u.telegramUsername = cleanTg
          ? cleanTg.startsWith('@')
            ? cleanTg
            : `@${cleanTg}`
          : null;
      }
      if (
        typeof body.referenceBankrollRub === 'number' &&
        body.referenceBankrollRub >= 1000
      ) {
        u.referenceBankrollRub = Math.round(body.referenceBankrollRub);
      }
      if (body.newPassword) {
        if (!body.currentPassword || !verifyPassword(body.currentPassword, u.passwordHash)) {
          throw new Error('Текущий пароль указан неверно');
        }
        if (body.newPassword.length < 6) {
          throw new Error('Новый пароль должен содержать минимум 6 символов');
        }
        u.passwordHash = hashPassword(body.newPassword);
      }

      return toSafeSessionUser(u);
    });

    return NextResponse.json({ user: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка обновления профиля' },
      { status: err instanceof StorageUnavailableError ? 503 : 400 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const sessionUser = await requireAuthenticatedUser();
    const body = (await req.json()) as
      | { action: 'VERIFY_TELEGRAM_LINK'; manualChatId?: string }
      | { action: 'UNLINK_TELEGRAM' }
      | { action: 'TEST_TELEGRAM_DM' };

    if (body.action === 'UNLINK_TELEGRAM') {
      const updated = await mutateState((state) => {
        const u = state.users.find((row) => row.id === sessionUser.id);
        if (!u) throw new Error('Пользователь не найден');
        u.telegramChatId = null;
        return toSafeSessionUser(u);
      });
      return NextResponse.json({ user: updated });
    }

    const state = await readState();
    const safeSession = toSafeSessionUser(sessionUser);
    const botToken = (
      state.settings.telegramBotToken ||
      process.env.TELEGRAM_BOT_TOKEN ||
      ''
    ).trim();

    if (!botToken || botToken.includes('replace_with')) {
      return NextResponse.json(
        {
          error:
            'Telegram-бот еще не подключен администратором в настройках платформы.',
        },
        { status: 400 },
      );
    }

    if (body.action === 'TEST_TELEGRAM_DM') {
      if (!safeSession.telegramChatId) {
        return NextResponse.json(
          { error: 'Сначала подключите ваш Telegram' },
          { status: 400 },
        );
      }
      const res = await sendTelegramDirectMessage(
        state.settings,
        safeSession.telegramChatId,
        `🔔 <b>Проверка уведомлений ${state.settings.brandName}</b>\n\nСвязь с вашим кабинетом активна! Сюда будут мгновенно приходить купленные прогнозы и возвраты по страховке.`,
      );
      if (!res.sent) {
        return NextResponse.json(
          { error: res.error || 'Не удалось отправить сообщение' },
          { status: 400 },
        );
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'VERIFY_TELEGRAM_LINK') {
      // Если вебхук уже успел привязать аккаунт
      if (safeSession.telegramChatId) {
        return NextResponse.json({ user: safeSession, linked: true });
      }

      let foundChatId = (body.manualChatId || '').trim();
      let foundUsername: string | null = null;

      if (!foundChatId) {
        const polled = await pollTelegramUpdatesForLinkCode(
          botToken,
          safeSession.telegramLinkCode,
        );
        if (polled) {
          foundChatId = polled.chatId;
          foundUsername = polled.username;
        }
      }

      if (!foundChatId) {
        return NextResponse.json(
          {
            error: `Сообщение от вас еще не найдено. Откройте бота и отправьте команду /start ${safeSession.telegramLinkCode}`,
          },
          { status: 400 },
        );
      }

      const updated = await mutateState((s) => {
        const u = s.users.find((row) => row.id === sessionUser.id);
        if (!u) throw new Error('Пользователь не найден');
        u.telegramChatId = foundChatId;
        if (foundUsername) u.telegramUsername = foundUsername;
        return toSafeSessionUser(u);
      });

      await sendTelegramDirectMessage(
        state.settings,
        foundChatId,
        `✅ <b>Уведомления подключены к вашему кабинету (${updated.email})!</b>\n\nТеперь купленные прогнозы и возвраты 100% по страховке приходят прямо сюда.`,
      );

      return NextResponse.json({ user: updated, linked: true });
    }

    return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка привязки Telegram' },
      { status: err instanceof StorageUnavailableError ? 503 : 400 },
    );
  }
}
