import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  getRefCodeFromCookies,
  isSessionSigningAvailable,
  signSessionToken,
} from '@/server/auth';
import {
  initiateOrderCheckout,
  loginUserAccount,
  readState,
  registerUserAccount,
  StorageUnavailableError,
  toSafeSessionUser,
} from '@/server/database';
import { getOptionalViewer } from '@/server/guards';
import { accountRateKey, checkRateLimit, extractClientIp } from '@/server/rate-limit';
import { toCustomerOrder } from '@/server/order-dto';
import { setSessionCookies } from '@/server/session-cookies';
import { LEGAL_DOCUMENT_VERSION } from '@/lib/legal-version';
import { MAX_BUNDLE_ITEMS } from '@/lib/checkout-policy';
import { externalRequestOrigin } from '@/lib/request-origin-policy';
import { configuredSiteOrigin } from '@/lib/site-origin';

export async function POST(req: NextRequest) {
  let newSessionCookieToken: string | null = null;
  let autoCreatedAccount: { email: string; generatedPassword: string } | null = null;
  try {
    const body = (await req.json()) as {
      kind: 'SINGLE_PREDICTION' | 'BUNDLE_PREDICTIONS' | 'BALANCE_TOPUP';
      predictionId?: string;
      predictionIds?: string[];
      promoCode?: string | null;
      topupAmountRub?: number;
      paymentMethod: 'yookassa' | 'internal_balance';
      expectedAmountRub: number;
      expectedPaymentMode: 'TEST_INSTANT' | 'YOOKASSA_LIVE';
      guestEmail?: string;
      guestPassword?: string;
      offerAccepted?: boolean;
      rulesAccepted?: boolean;
      personalDataConsent?: boolean;
      legalVersion?: string;
    };
    if (!body || !['SINGLE_PREDICTION', 'BUNDLE_PREDICTIONS', 'BALANCE_TOPUP'].includes(body.kind) ||
        !['yookassa', 'internal_balance'].includes(body.paymentMethod) ||
        !Number.isSafeInteger(body.expectedAmountRub) || body.expectedAmountRub < 50 ||
        !['TEST_INSTANT', 'YOOKASSA_LIVE'].includes(body.expectedPaymentMode) ||
        (body.predictionId !== undefined && (typeof body.predictionId !== 'string' || body.predictionId.length > 128)) ||
        (body.predictionIds !== undefined && (!Array.isArray(body.predictionIds) || body.predictionIds.length > MAX_BUNDLE_ITEMS || body.predictionIds.some((id) => typeof id !== 'string' || id.length > 128))) ||
        (body.promoCode != null && (typeof body.promoCode !== 'string' || body.promoCode.length > 24))) {
      return NextResponse.json({ error: 'Некорректные параметры заказа. Обновите страницу и проверьте условия оплаты.' }, { status: 400 });
    }
    if (body.offerAccepted !== true || body.legalVersion !== LEGAL_DOCUMENT_VERSION) {
      return NextResponse.json({ error: 'Подтвердите актуальную оферту перед оформлением заказа.' }, { status: 400 });
    }

    const configuredUrl = configuredSiteOrigin();
    const requestOrigin = externalRequestOrigin(req.url, req.headers);
    if (process.env.NEXT_PUBLIC_SITE_URL?.trim() && !configuredUrl) {
      throw new Error('Укажите корректный адрес сайта в NEXT_PUBLIC_SITE_URL.');
    }
    if (process.env.NODE_ENV === 'production' && body.expectedPaymentMode === 'YOOKASSA_LIVE' &&
        (!configuredUrl || !configuredUrl.startsWith('https://') || requestOrigin !== configuredUrl)) {
      // Host-only sessions cannot follow a return from www/another domain to
      // the canonical host. Refuse before creating a guest account or payment.
      const error = configuredUrl?.startsWith('https://')
        ? `Реальная оплата доступна только на основном HTTPS-адресе ${configuredUrl}. Откройте его и повторите оформление.`
        : 'Реальная оплата временно недоступна: основной HTTPS-адрес сайта не настроен. Обратитесь в поддержку.';
      return NextResponse.json({ error }, { status: 400 });
    }
    let user = await getOptionalViewer();

    // Гостевой заказ создаёт кабинет или входит в существующий.
    if (!user) {
      if (!isSessionSigningAvailable()) {
        return NextResponse.json({ error: 'Оформление заказа временно недоступно. Обратитесь в поддержку.' }, { status: 503 });
      }
      if (body.personalDataConsent !== true || body.rulesAccepted !== true) {
        return NextResponse.json({ error: 'Подтвердите правила сайта и отдельное согласие на обработку данных для гостевого заказа.' }, { status: 400 });
      }
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

      const cleanEmail = typeof body.guestEmail === 'string' ? body.guestEmail.trim().toLowerCase() : '';
      if (cleanEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return NextResponse.json(
          {
            error:
              'Укажите действующий E-mail для кабинета и получения чека при реальной оплате',
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
        const accountLimit = checkRateLimit({ key: `login-account:${accountRateKey(cleanEmail)}`, limit: 20, windowMs: 10 * 60_000 });
        if (!accountLimit.allowed) {
          return NextResponse.json({ error: 'Слишком много попыток входа. Попробуйте позже.' }, { status: 429, headers: { 'Retry-After': String(accountLimit.retryAfterSec) } });
        }
        user = await loginUserAccount(cleanEmail, body.guestPassword);
        newSessionCookieToken = signSessionToken(user, 30);
      } else {
        const generatedPassword = randomBytes(18).toString('base64url');
        user = await registerUserAccount({
          email: cleanEmail,
          password: generatedPassword,
          displayName: (cleanEmail.split('@')[0] || 'Покупатель').slice(0, 80),
          refCode: await getRefCodeFromCookies(),
          legalAcceptance: { personalData: true, rules: true },
        });
        newSessionCookieToken = signSessionToken(user, 30);
        autoCreatedAccount = {
          email: cleanEmail,
          generatedPassword,
        };
      }
    }

    // Never construct a payment return URL from the caller-controlled Origin header.
    const originUrl = configuredUrl || requestOrigin || req.nextUrl.origin;

    const result = await initiateOrderCheckout({
      userId: user.id,
      kind: body.kind,
      predictionId: body.predictionId,
      predictionIds: body.predictionIds,
      promoCode: body.promoCode,
      topupAmountRub: body.topupAmountRub,
      paymentMethod: autoCreatedAccount ? 'yookassa' : body.paymentMethod,
      expectedAmountRub: body.expectedAmountRub,
      expectedPaymentMode: body.expectedPaymentMode,
      originUrl,
      offerAcceptedVersion: LEGAL_DOCUMENT_VERSION,
    });

    const response = NextResponse.json({
      order: toCustomerOrder(result.order),
      paidImmediately: result.paidImmediately,
      viewer: toSafeSessionUser(user),
      autoCreatedAccount,
    });

    if (newSessionCookieToken) {
      setSessionCookies(response, req, newSessionCookieToken);
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
    const response = NextResponse.json(
      { error: msg, ...(autoCreatedAccount ? { autoCreatedAccount } : {}) },
      { status: err instanceof StorageUnavailableError ? 503 : 400 },
    );
    // A guest account may already exist even if the subsequent order failed.
    // Return its credentials and session instead of silently locking the owner out.
    if (newSessionCookieToken && autoCreatedAccount) {
      setSessionCookies(response, req, newSessionCookieToken);
    }
    return response;
  }
}
