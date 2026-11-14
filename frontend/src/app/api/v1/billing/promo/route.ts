import { NextRequest, NextResponse } from 'next/server';
import { calculateCartPricing, readState } from '@/server/database';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      predictionIds: string[];
      promoCode?: string;
    };
    const state = await readState();
    const pricing = calculateCartPricing({
      state,
      predictionIds: body.predictionIds || [],
      promoCode: body.promoCode,
    });

    if (body.promoCode?.trim() && !pricing.promoValidCode) {
      return NextResponse.json(
        { error: 'Промокод не найден или исчерпан', pricing },
        { status: 400 },
      );
    }

    return NextResponse.json({ pricing });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка расчета скидки' },
      { status: 400 },
    );
  }
}
