import { randomInt, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  hashPassword,
  SESSION_COOKIE_NAME,
  signSessionToken,
} from '@/server/auth';
import { mutateState, readState, toSafeSessionUser } from '@/server/database';
import { sendTelegramDirectMessage } from '@/server/integrations';
import { checkRateLimit, extractClientIp } from '@/server/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const ip = extractClientIp(req.headers);
    const rl = checkRateLimit({
      key: `pw_reset:${ip}`,
      limit: 10,
      windowMs: 10 * 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Подождите ${rl.retryAfterSec} сек. перед следующей попыткой.` },
        { status: 429 },
      );
    }

    const body = (await req.json()) as
      | { action: 'REQUEST_CODE'; email: string }
      | {
          action: 'CONFIRM_RESET';
          email: string;
          code: string;
          newPassword: string;
        };

    const cleanEmail = (body.email || '').trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return NextResponse.json(
        { error: 'Введите корректный E-mail вашего аккаунта' },
        { status: 400 },
      );
    }

    if (body.action === 'REQUEST_CODE') {
      const state = await readState();
      const target = state.users.find((u) => u.email === cleanEmail);

      if (!target || !target.telegramChatId) {
        return NextResponse.json({
          ok: false,
          needSupport: true,
          supportTelegram: state.settings.supportTelegram,
          message: !target
            ? 'Аккаунт с таким E-mail не найден или к нему еще не был привязан Telegram-бот. Напишите в поддержку — восстановим доступ за пару минут.'
            : 'К этому аккаунту еще не привязан личный Telegram-бот для отправки одноразового кода. Напишите в нашу поддержку в Telegram — оператор выдаст временный пароль.',
        });
      }

      const code = String(randomInt(100000, 999999));
      const expiresIso = new Date(Date.now() + 15 * 60_000).toISOString();

      await mutateState((s) => {
        const u = s.users.find((row) => row.id === target.id);
        if (u) {
          u.passwordResetCode = code;
          u.passwordResetExpiresAt = expiresIso;
        }
      });

      const sendRes = await sendTelegramDirectMessage(
        state.settings,
        target.telegramChatId,
        `🔐 <b>Код восстановления пароля (${state.settings.brandName}):</b>\n\n<code>${code}</code>\n\nКод действует 15 минут. Никому не сообщайте его.`,
      );

      if (!sendRes.sent) {
        return NextResponse.json({
          ok: false,
          needSupport: true,
          supportTelegram: state.settings.supportTelegram,
          message:
            'Не удалось доставить код в Telegram. Обратитесь в поддержку для быстрого сброса пароля.',
        });
      }

      return NextResponse.json({
        ok: true,
        sentViaTelegram: true,
        message: '6-значный код отправлен вам в личные сообщения Telegram!',
      });
    }

    if (body.action === 'CONFIRM_RESET') {
      const cleanCode = (body.code || '').trim();
      if (!/^\d{6}$/.test(cleanCode)) {
        return NextResponse.json(
          { error: 'Введите 6-значный код из Telegram' },
          { status: 400 },
        );
      }
      if (!body.newPassword || body.newPassword.length < 6) {
        return NextResponse.json(
          { error: 'Новый пароль должен содержать минимум 6 символов' },
          { status: 400 },
        );
      }

      const updatedUser = await mutateState((state) => {
        const u = state.users.find((row) => row.email === cleanEmail);
        if (!u || !u.passwordResetCode || !u.passwordResetExpiresAt) {
          throw new Error('Код не запрашивался или уже использован');
        }
        if (new Date(u.passwordResetExpiresAt).getTime() < Date.now()) {
          u.passwordResetCode = null;
          u.passwordResetExpiresAt = null;
          throw new Error('Срок действия кода истек — запросите новый код');
        }

        const a = Buffer.from(u.passwordResetCode);
        const b = Buffer.from(cleanCode);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          throw new Error('Неверный код подтверждения');
        }

        u.passwordHash = hashPassword(body.newPassword);
        u.passwordResetCode = null;
        u.passwordResetExpiresAt = null;
        u.lastLoginAt = new Date().toISOString();
        return u;
      });

      const token = signSessionToken(updatedUser.id, 30);
      const res = NextResponse.json({
        ok: true,
        user: toSafeSessionUser(updatedUser),
      });
      res.cookies.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 86400,
      });
      return res;
    }

    return NextResponse.json({ error: 'Неизвестная операция' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка сброса пароля' },
      { status: 400 },
    );
  }
}
