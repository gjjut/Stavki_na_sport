import { NextRequest, NextResponse } from 'next/server';
import { attachVerifiedYooKassaPayment, fulfillOrderPayment, mutateState, readState, StorageUnavailableError } from '@/server/database';
import { verifyYooKassaLivePayment, verifyYooKassaLiveRefund } from '@/server/integrations';
import { assertYooKassaPaymentMatchesOrder } from '@/server/payment-policy';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      event?: unknown;
      object?: { id?: unknown; payment_id?: unknown };
    };
    if ((body?.event !== 'payment.succeeded' && body?.event !== 'payment.canceled' &&
         body?.event !== 'refund.succeeded') || typeof body.object?.id !== 'string' || !body.object.id.trim() || body.object.id.length > 128) {
      return NextResponse.json({ error: 'Некорректное тело уведомления' }, { status: 400 });
    }

    const objectId = body.object.id;
    const refundPaymentId = body.object.payment_id;
    const dedupKey = `${body.event}:${objectId}`;
    const state = await readState();
    const candidate = state.transactions.find((order) => order.paymentMethod === 'yookassa' &&
      order.externalPaymentId === (body.event === 'refund.succeeded' ? refundPaymentId : objectId));
    const hasUnidentifiedLiveOrder = state.transactions.some((order) =>
      order.paymentMethod === 'yookassa' && order.paymentModeAtCreation === 'YOOKASSA_LIVE' &&
      order.status === 'PENDING' && !order.externalPaymentId &&
      (order.providerCreationState === 'CREATING' || order.providerCreationState === 'UNKNOWN'),
    );
    // A known or reserved live order remains verifiable after a mode change.
    // Test orders and unidentified legacy orders never become live payments.
    if (state.settings.paymentMode !== 'YOOKASSA_LIVE' &&
        candidate?.paymentModeAtCreation !== 'YOOKASSA_LIVE' && !hasUnidentifiedLiveOrder) {
      return NextResponse.json({ error: 'Уведомления ЮKassa недоступны для тестового или неизвестного заказа.' }, { status: 503 });
    }
    if (candidate?.paymentModeAtCreation === 'TEST_INSTANT') {
      return NextResponse.json({ error: 'Тестовый заказ нельзя подтвердить через ЮKassa.' }, { status: 400 });
    }
    if (state.processedWebhooks.includes(dedupKey)) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (body.event === 'refund.succeeded') {
      // YooKassa supports partial refunds and refunds outside this application. Record only
      // a verified notice; changing balances/access automatically could cause a double refund.
      const refund = await verifyYooKassaLiveRefund(state.settings, objectId);
      if (body.object.payment_id !== undefined && body.object.payment_id !== refund.paymentId) {
        throw new Error('Платёж в уведомлении не совпадает с возвратом ЮKassa.');
      }
      if (refund.status !== 'succeeded') {
        return NextResponse.json({ received: true, ignored: true });
      }
      if (!state.transactions.some((item) => item.paymentMethod === 'yookassa' && item.externalPaymentId === refund.paymentId) && hasUnidentifiedLiveOrder) {
        // The create response may have been lost. A verified refund alone has
        // no order metadata, so also verify the underlying payment before binding.
        const payment = await verifyYooKassaLivePayment(state.settings, refund.paymentId);
        if (typeof payment.metadata.orderId !== 'string') throw new Error('У платежа нет номера заказа для сверки.');
        await attachVerifiedYooKassaPayment(payment.metadata.orderId, payment);
      }
      await mutateState((draft) => {
        const order = draft.transactions.find((item) =>
          item.externalPaymentId === refund.paymentId && item.paymentMethod === 'yookassa',
        );
        if (!order) throw new Error('Заказ для возврата ЮKassa не найден; требуется ручная сверка.');
        if (order.paymentModeAtCreation === 'TEST_INSTANT') throw new Error('Тестовый заказ не является платежом ЮKassa.');
        if (!Array.isArray(order.externalRefundNotices)) order.externalRefundNotices = [];
        if (!order.externalRefundNotices.some((notice) => notice.id === refund.id)) {
          order.externalRefundNotices.push({
            id: refund.id,
            amountValue: refund.amountValue,
            currency: refund.currency,
            verifiedAt: new Date().toISOString(),
          });
        }
        if (!draft.processedWebhooks.includes(dedupKey)) draft.processedWebhooks.push(dedupKey);
      });
      return NextResponse.json({ received: true, reconciliationRequired: true });
    }

    if (!candidate && !hasUnidentifiedLiveOrder) throw new Error('Заказ для платежа ЮKassa не найден.');
    const verified = await verifyYooKassaLivePayment(state.settings, objectId);
    const verifiedOrderId = candidate?.id ?? verified.metadata.orderId;
    if (typeof verifiedOrderId !== 'string') throw new Error('У платежа нет номера заказа для сверки.');
    const order = await attachVerifiedYooKassaPayment(verifiedOrderId, verified);

    if (body.event === 'payment.succeeded') {
      if (verified.status !== 'succeeded' || !verified.paid) {
        return NextResponse.json({ received: true, ignored: true });
      }
      await fulfillOrderPayment(order.id, verified);
    } else {
      if (verified.status !== 'canceled' || verified.paid) {
        return NextResponse.json({ received: true, ignored: true });
      }
      await mutateState((draft) => {
        const current = draft.transactions.find((item) => item.id === order.id);
        if (!current) throw new Error('Заказ не найден.');
        assertYooKassaPaymentMatchesOrder(current, verified);
        if (current.status === 'PENDING' && !current.externalRefundNotices?.length) current.status = 'CANCELED';
      });
    }

    await mutateState((draft) => {
      if (!draft.processedWebhooks.includes(dedupKey)) draft.processedWebhooks.push(dedupKey);
    });
    return NextResponse.json({ received: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка обработки уведомления' },
      { status: err instanceof StorageUnavailableError ? 503 : 400 },
    );
  }
}
