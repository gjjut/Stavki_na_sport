import { randomInt } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { hashPassword, isSessionSigningAvailable, signSessionToken } from '@/server/auth';
import { mutateState, readState, StorageUnavailableError, toSafeSessionUser } from '@/server/database';
import { escapeTelegramHtml, sendTelegramDirectMessage } from '@/server/integrations';
import { checkRateLimit, extractClientIp } from '@/server/rate-limit';
import { passwordResetDigest, verifyPasswordResetCode } from '@/server/security-policy';
import { setSessionCookies } from '@/server/session-cookies';

const MAX_CODE_ATTEMPTS = 5;
const REQUEST_COOLDOWN_MS = 60_000;

export async function POST(req: NextRequest) {
  try {
    const ip = extractClientIp(req.headers);
    const rl = checkRateLimit({ key: `pw_reset:${ip}`, limit: 10, windowMs: 10 * 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Подождите ${rl.retryAfterSec} сек. перед следующей попыткой.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      );
    }

    if (!isSessionSigningAvailable()) {
      return NextResponse.json({ error: 'Восстановление временно недоступно. Обратитесь в поддержку.' }, { status: 503 });
    }
    const body = (await req.json()) as {
      action?: string; email?: string; code?: string; newPassword?: string;
    };
    const cleanEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!cleanEmail.includes('@') || cleanEmail.length > 254) {
      return NextResponse.json({ error: 'Введите корректный E-mail вашего аккаунта' }, { status: 400 });
    }

    if (body.action === 'REQUEST_CODE') {
      const state = await readState();
      const target = state.users.find((u) => u.email === cleanEmail);
      if (target?.telegramChatId && target.telegramBindingVerified && target.status === 'ACTIVE') {
        const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
        const now = Date.now();
        const delivery = await mutateState((s) => {
          const u = s.users.find((row) => row.id === target.id);
          if (!u || !u.telegramChatId || !u.telegramBindingVerified || u.status !== 'ACTIVE') return null;
          const lastRequested = Date.parse(u.passwordResetRequestedAt || '');
          if (Number.isFinite(lastRequested) && now - lastRequested < REQUEST_COOLDOWN_MS) return null;
          u.passwordResetCode = passwordResetDigest(u.id, code);
          u.passwordResetExpiresAt = new Date(now + 15 * 60_000).toISOString();
          u.passwordResetAttempts = 0;
          u.passwordResetRequestedAt = new Date(now).toISOString();
          return { chatId: u.telegramChatId, settings: s.settings };
        });
        if (delivery) {
          await sendTelegramDirectMessage(
            delivery.settings,
            delivery.chatId,
            `🔐 <b>Код восстановления пароля (${escapeTelegramHtml(delivery.settings.brandName)}):</b>\n\n<code>${code}</code>\n\nКод действует 15 минут. Никому не сообщайте его.`,
          );
        }
      }
      // The response is identical for unknown accounts, unavailable Telegram and throttled requests.
      return NextResponse.json({
        ok: true,
        sentViaTelegram: true,
        supportTelegram: state.settings.supportTelegram,
        message: 'Если к активному аккаунту привязан и подтверждён Telegram, код отправлен туда. Если код не пришёл, обратитесь в поддержку. Новый запрос доступен через минуту.',
      });
    }

    if (body.action === 'CONFIRM_RESET') {
      const cleanCode = typeof body.code === 'string' ? body.code.trim() : '';
      if (!/^\d{6}$/.test(cleanCode)) {
        return NextResponse.json({ error: 'Введите 6-значный код из Telegram' }, { status: 400 });
      }
      if (typeof body.newPassword !== 'string' || body.newPassword.length < 10 || body.newPassword.length > 256) {
        return NextResponse.json({ error: 'Новый пароль должен содержать от 10 до 256 символов' }, { status: 400 });
      }
      const newPassword = body.newPassword;
      const outcome = await mutateState((state) => {
        const u = state.users.find((row) => row.email === cleanEmail);
        if (!u || u.status !== 'ACTIVE' || !u.telegramChatId || !u.telegramBindingVerified || !u.passwordResetCode || !u.passwordResetExpiresAt) {
          return { user: null, error: 'Код недействителен. Запросите новый код или обратитесь в поддержку.' };
        }
        const expires = Date.parse(u.passwordResetExpiresAt);
        if (!Number.isFinite(expires) || expires <= Date.now() || !u.passwordResetCode.startsWith('hmac-sha256:')) {
          u.passwordResetCode = null;
          u.passwordResetExpiresAt = null;
          u.passwordResetAttempts = 0;
          return { user: null, error: 'Срок действия кода истёк или код устарел. Запросите новый.' };
        }
        if ((u.passwordResetAttempts ?? 0) >= MAX_CODE_ATTEMPTS || !verifyPasswordResetCode(u.id, cleanCode, u.passwordResetCode)) {
          u.passwordResetAttempts = (u.passwordResetAttempts ?? 0) + 1;
          if (u.passwordResetAttempts >= MAX_CODE_ATTEMPTS) {
            u.passwordResetCode = null;
            u.passwordResetExpiresAt = null;
          }
          return { user: null, error: 'Неверный код или число попыток исчерпано. При необходимости запросите новый код.' };
        }
        u.passwordHash = hashPassword(newPassword);
        u.passwordResetCode = null;
        u.passwordResetExpiresAt = null;
        u.passwordResetAttempts = 0;
        u.lastLoginAt = new Date().toISOString();
        return { user: u, error: null };
      });
      if (!outcome.user) return NextResponse.json({ error: outcome.error }, { status: 400 });
      const res = NextResponse.json({ ok: true, user: toSafeSessionUser(outcome.user) });
      setSessionCookies(res, req, signSessionToken(outcome.user, 30));
      return res;
    }
    return NextResponse.json({ error: 'Неизвестная операция' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof StorageUnavailableError ? 'Сервис временно недоступен.' : 'Не удалось обработать запрос восстановления.' },
      { status: err instanceof StorageUnavailableError ? 503 : 400 },
    );
  }
}
