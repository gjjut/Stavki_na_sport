import { randomInt } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  getRefCodeFromCookies,
  SESSION_COOKIE_NAME,
  signSessionToken,
} from '@/server/auth';
import {
  initiateOrderCheckout,
  loginUserAccount,
  readState,
  registerUserAccount,
  toSafeSessionUser,
} from '@/server/database';
import { getOptionalViewer } from '@/server/guards';
import { checkRateLimit, extractClientIp } from '@/server/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      kind: 'SINGLE_PREDICTION' | 'BUNDLE_PREDICTIONS' | 'BALANCE_TOPUP';
      predictionId?: string;
      predictionIds?: string[];
      promoCode?: string | null;
      topupAmountRub?: number;
      paymentMethod: 'yookassa' | 'internal_balance';
      guestEmail?: string;
      guestPassword?: string;
    };

    let user = await getOptionalViewer();
    let newSessionCookieToken: string | null = null;
    let autoCreatedAccount: { email: string; generatedPassword: string } | null = null;

    // Бесшовная покупка в 1 шаг по Email для новых гостей (и быстрый вход для постоянных клиентов)
    if (!user) {
      const ip = extractClientIp(req.headers);
      const rl = checkRateLimit({
        key: `guest_checkout:${ip}`,
        limit: 12,
        windowMs: 10 * 60_000,
      });
      if (!rl.allowed) {
        return NextResponse.json(
          {
            error: `Слишком много попыток. Повторите через ${rl.retryAfterSec} сек.`,
          },
          { status: 429 },
        );
      }

      const cleanEmail = (body.guestEmail || '').trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
        return NextResponse.json(
          {
            error:
              'Укажите ваш рабочий E-mail — на него придет чек 54-ФЗ и откроется личный кабинет с прогнозом',
            code: 'GUEST_EMAIL_REQUIRED',
          },
          { status: 400 },
        );
      }

      const state = await readState();
      const existing = state.users.find((u) => u.email === cleanEmail);

      if (existing) {
        if (!body.guestPassword) {
          return NextResponse.json(
            {
              error:
                'Этот E-mail уже зарегистрирован у нас. Введите ваш пароль ниже — покупка и баланс сразу привяжутся к вашему кабинету.',
              code: 'EMAIL_EXISTS_NEED_PASSWORD',
            },
            { status: 409 },
          );
        }
        user = await loginUserAccount(cleanEmail, body.guestPassword);
        newSessionCookieToken = signSessionToken(user.id, 30);
      } else {
        const generatedPassword = `Vx${randomInt(100000, 999999)}`;
        user = await registerUserAccount({
          email: cleanEmail,
          password: generatedPassword,
          displayName: cleanEmail.split('@')[0] || 'Покупатель',
          refCode: getRefCodeFromCookies(),
        });
        newSessionCookieToken = signSessionToken(user.id, 30);
        autoCreatedAccount = {
          email: cleanEmail,
          generatedPassword,
        };
      }
    }

    const proto = req.headers.get('x-forwarded-proto') || 'http';
    const host =
      req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
    const originUrl = req.headers.get('origin') || `${proto}://${host}`;

    const result = await initiateOrderCheckout({
      userId: user.id,
      kind: body.kind,
      predictionId: body.predictionId,
      predictionIds: body.predictionIds,
      promoCode: body.promoCode,
      topupAmountRub: body.topupAmountRub,
      paymentMethod: autoCreatedAccount ? 'yookassa' : body.paymentMethod,
      originUrl,
    });

    const response = NextResponse.json({
      ...result,
      viewer: toSafeSessionUser(user),
      autoCreatedAccount,
    });

    if (newSessionCookieToken) {
      response.cookies.set(SESSION_COOKIE_NAME, newSessionCookieToken, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 86400,
      });
    }

    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Ошибка оформления заказа';
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json(
        {
          error: 'Укажите ваш E-mail для оформления заказа',
          code: 'UNAUTHORIZED',
        },
        { status: 401 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
