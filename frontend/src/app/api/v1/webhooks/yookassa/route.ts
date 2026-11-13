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
      event: 'payment.succeeded' | 'payment.canceled' | 'refund.succeeded';
      object: { id: string; payment_id?: string };
    };

    const dedupKey = `${body.event}:${body.object.id}`;
    const state = await readState();

    if (state.processedWebhooks.includes(dedupKey)) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    if (body.event === 'payment.succeeded') {
      if (state.settings.paymentMode === 'YOOKASSA_LIVE') {
        const verified = await verifyYooKassaLivePayment(state.settings, body.object.id);
        if (verified.status !== 'succeeded' || !verified.paid) {
          return NextResponse.json({ received: true, ignored: true });
        }
      }
      await fulfillOrderPayment(body.object.id);
    } else if (body.event === 'payment.canceled') {
      await mutateState((draft) => {
        const tx = draft.transactions.find((t) => t.externalPaymentId === body.object.id);
        if (tx && tx.status === 'PENDING') {
          tx.status = 'CANCELED';
        }
      });
    } else if (body.event === 'refund.succeeded') {
      const targetId = body.object.payment_id || body.object.id;
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
