import { NextRequest, NextResponse } from 'next/server';
import { isSessionSigningAvailable, signSessionToken } from '@/server/auth';
import { loginUserAccount, StorageUnavailableError, toSafeSessionUser } from '@/server/database';
import { accountRateKey, checkRateLimit, extractClientIp } from '@/server/rate-limit';
import { setSessionCookies } from '@/server/session-cookies';

export async function POST(req: NextRequest) {
  try {
    const ip = extractClientIp(req.headers);
    const rl = checkRateLimit({
      key: `login:${ip}`,
      limit: 12,
      windowMs: 10 * 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: `Слишком много попыток входа. Повторите через ${rl.retryAfterSec} сек.`,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rl.retryAfterSec) },
        },
      );
    }

    const body = (await req.json()) as { email: string; password: string };
    if (typeof body.email !== 'string' || body.email.length > 254 || typeof body.password !== 'string' || body.password.length > 256) {
      return NextResponse.json({ error: 'Неверный E-mail или пароль' }, { status: 400 });
    }
    const accountLimit = checkRateLimit({ key: `login-account:${accountRateKey(body.email)}`, limit: 20, windowMs: 10 * 60_000 });
    if (!accountLimit.allowed) {
      return NextResponse.json({ error: 'Слишком много попыток входа. Попробуйте позже.' }, { status: 429, headers: { 'Retry-After': String(accountLimit.retryAfterSec) } });
    }
    if (!isSessionSigningAvailable()) {
      return NextResponse.json({ error: 'Вход временно недоступен. Обратитесь в поддержку.' }, { status: 503 });
    }
    const user = await loginUserAccount(body.email, body.password);
    const token = signSessionToken(user);

    const res = NextResponse.json({ user: toSafeSessionUser(user) });
    setSessionCookies(res, req, token);
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка входа' },
      { status: err instanceof StorageUnavailableError ? 503 : 400 },
    );
  }
}
