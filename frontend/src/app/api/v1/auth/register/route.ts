import { NextRequest, NextResponse } from 'next/server';
import {
  getRefCodeFromCookies,
  isSessionSigningAvailable,
  signSessionToken,
} from '@/server/auth';
import { registerUserAccount, StorageUnavailableError, toSafeSessionUser } from '@/server/database';
import { checkRateLimit, extractClientIp } from '@/server/rate-limit';
import { setSessionCookies } from '@/server/session-cookies';
import { LEGAL_DOCUMENT_VERSION } from '@/lib/legal-version';

export async function POST(req: NextRequest) {
  try {
    const ip = extractClientIp(req.headers);
    const rl = checkRateLimit({
      key: `register:${ip}`,
      limit: 8,
      windowMs: 15 * 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: `Превышен лимит регистраций с одного адреса. Подождите ${rl.retryAfterSec} сек.`,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rl.retryAfterSec) },
        },
      );
    }

    const body = (await req.json()) as {
      email: string;
      password: string;
      displayName: string;
      city?: string;
      refCode?: string;
      personalDataConsent?: boolean;
      rulesAccepted?: boolean;
      legalVersion?: string;
    };
    if (body.personalDataConsent !== true || body.rulesAccepted !== true || body.legalVersion !== LEGAL_DOCUMENT_VERSION) {
      return NextResponse.json({ error: 'Подтвердите правила сайта и отдельное согласие на обработку данных. Если страница открыта давно, обновите её.' }, { status: 400 });
    }

    // Fail before creating an account if a session could not be issued.
    if (!isSessionSigningAvailable()) {
      return NextResponse.json({ error: 'Регистрация временно недоступна. Обратитесь в поддержку.' }, { status: 503 });
    }
    const refCode = (typeof body.refCode === 'string' ? body.refCode.trim().slice(0, 32) : '') || (await getRefCodeFromCookies());
    const user = await registerUserAccount({
      email: body.email,
      password: body.password,
      displayName: body.displayName,
      city: body.city,
      refCode,
      legalAcceptance: { personalData: true, rules: true },
    });

    const token = signSessionToken(user);
    const res = NextResponse.json({ user: toSafeSessionUser(user) });
    setSessionCookies(res, req, token);
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка регистрации' },
      { status: err instanceof StorageUnavailableError ? 503 : 400 },
    );
  }
}
