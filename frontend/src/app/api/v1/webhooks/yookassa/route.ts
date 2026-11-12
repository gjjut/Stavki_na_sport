import { NextRequest, NextResponse } from 'next/server';
import { processYooKassaWebhookInStore } from '@/server/platformStore';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      event: 'payment.succeeded' | 'payment.canceled' | 'refund.succeeded';
      object: { id: string; payment_id?: string };
    };

    const yookassaPaymentId =
      body.event === 'refund.succeeded' && body.object.payment_id
        ? body.object.payment_id
        : body.object.id;

    const result = await processYooKassaWebhookInStore({
      event: body.event,
      yookassaPaymentId,
    });

    return NextResponse.json({ received: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка обработки Webhook ЮKassa' },
      { status: 400 },
    );
  }
}
