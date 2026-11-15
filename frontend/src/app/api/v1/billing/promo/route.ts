import { NextRequest, NextResponse } from 'next/server';
import { MAX_BUNDLE_ITEMS } from '@/lib/checkout-policy';
import { calculateCartPricing, readState, resolveEffectiveMatchStatus, StorageUnavailableError } from '@/server/database';
import { checkRateLimit, extractClientIp } from '@/server/rate-limit';
import { isLegacyStarterDemoPrediction } from '@/server/prediction-data-policy';

export async function POST(req: NextRequest) {
  try {
    const limit = checkRateLimit({ key: `promo:${extractClientIp(req.headers)}`, limit: 60, windowMs: 60_000 });
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Слишком много проверок промокода. Попробуйте позже.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } });
    }
    const body = (await req.json()) as { predictionIds?: unknown; promoCode?: unknown } | null;
    if (!body || !Array.isArray(body.predictionIds) || !body.predictionIds.length ||
        body.predictionIds.length > MAX_BUNDLE_ITEMS ||
        body.predictionIds.some((id) => typeof id !== 'string' || !id || id.length > 128) ||
        typeof body.promoCode !== 'string' || !body.promoCode.trim() || body.promoCode.length > 24) {
      return NextResponse.json({ error: 'Выберите прогнозы и укажите корректный промокод.' }, { status: 400 });
    }
    const state = await readState();
    for (const id of new Set(body.predictionIds as string[])) {
      const prediction = state.predictions.find((item) => item.id === id);
      if (!prediction || isLegacyStarterDemoPrediction(prediction) || prediction.accessTier !== 'PAID_SINGLE' ||
          resolveEffectiveMatchStatus(prediction) !== 'UPCOMING' ||
          prediction.matchLifecycleStatus === 'POSTPONED' || prediction.matchLifecycleStatus === 'CANCELLED' ||
          Date.now() >= new Date(prediction.matchStartsAt).getTime()) {
        return NextResponse.json({ error: 'Один из прогнозов недоступен для покупки. Обновите корзину.' }, { status: 400 });
      }
    }
    const pricing = calculateCartPricing({ state, predictionIds: body.predictionIds as string[], promoCode: body.promoCode });
    if (!pricing.promoValidCode) {
      return NextResponse.json({ error: 'Промокод не найден или исчерпан', pricing }, { status: 400 });
    }
    return NextResponse.json({ pricing });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof StorageUnavailableError ? 'Данные сайта временно недоступны.' : 'Не удалось проверить промокод.' },
      { status: err instanceof StorageUnavailableError ? 503 : 400 },
    );
  }
}
