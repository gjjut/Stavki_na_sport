import { NextRequest, NextResponse } from 'next/server';
import {
  fulfillOrderPayment,
  mutateState,
  readState,
  refundOrderTransaction,
} from '@/server/database';
import { verifyYooKassaLivePayment } from '@/server/integrations';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      event?: 'payment.succeeded' | 'payment.canceled' | 'refund.succeeded';
      object?: { id?: string; payment_id?: string };
    };

    if (!body?.event || !body?.object?.id) {
      return NextResponse.json({ error: 'Некорректное тело уведомления' }, { status: 400 });
    }

    const objectId = body.object.id;
    const dedupKey = `${body.event}:${objectId}`;
    const state = await readState();

    if (state.processedWebhooks.includes(dedupKey)) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    const isLive = state.settings.paymentMode === 'YOOKASSA_LIVE';

    if (body.event === 'payment.succeeded') {
      if (isLive) {
        const verified = await verifyYooKassaLivePayment(state.settings, objectId);
        if (verified.status !== 'succeeded' || !verified.paid) {
          return NextResponse.json({ received: true, ignored: true });
        }
      }
      await fulfillOrderPayment(objectId);
    } else if (body.event === 'payment.canceled') {
      if (isLive) {
        const verified = await verifyYooKassaLivePayment(state.settings, objectId);
        if (verified.status !== 'canceled') {
          return NextResponse.json({ received: true, ignored: true });
        }
      }
      await mutateState((draft) => {
        const tx = draft.transactions.find((t) => t.externalPaymentId === objectId);
        if (tx && tx.status === 'PENDING') {
          tx.status = 'CANCELED';
        }
      });
    } else if (body.event === 'refund.succeeded') {
      const targetId = body.object.payment_id || objectId;
      if (isLive && body.object.payment_id) {
        // Проверяем, что исходный платеж действительно существует в ЮKassa магазина
        await verifyYooKassaLivePayment(state.settings, body.object.payment_id);
      }
      await refundOrderTransaction(targetId);
    }

    await mutateState((draft) => {
      if (!draft.processedWebhooks.includes(dedupKey)) {
        draft.processedWebhooks.push(dedupKey);
      }
    });

    return NextResponse.json({ received: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка обработки уведомления' },
      { status: 400 },
    );
  }
}
