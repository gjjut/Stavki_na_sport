import { NextRequest, NextResponse } from 'next/server';
import { initiateOrderCheckout } from '@/server/database';
import { requireAuthenticatedUser } from '@/server/guards';

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();
    const body = (await req.json()) as {
      kind: 'SINGLE_PREDICTION' | 'BUNDLE_PREDICTIONS' | 'BALANCE_TOPUP';
      predictionId?: string;
      predictionIds?: string[];
      promoCode?: string | null;
      topupAmountRub?: number;
      paymentMethod: 'yookassa' | 'internal_balance';
    };

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
      paymentMethod: body.paymentMethod,
      originUrl,
    });

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Ошибка оформления заказа';
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json(
        {
          error: 'Войдите в аккаунт или зарегистрируйтесь для покупки прогноза',
          code: 'UNAUTHORIZED',
        },
        { status: 401 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
