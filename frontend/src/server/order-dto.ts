import type { CustomerOrder, OrderTransaction } from './types';

/** Never expose provider identifiers, idempotence keys or affiliate details to a buyer. */
export function toCustomerOrder(order: OrderTransaction): CustomerOrder {
  let confirmationUrl: string | null = null;
  if (order.status === 'PENDING' && order.paymentMethod === 'yookassa' && order.confirmationUrl) {
    try {
      const url = new URL(order.confirmationUrl);
      if (url.protocol === 'https:' && !url.username && !url.password) confirmationUrl = url.href;
    } catch {
      // Corrupt or old unsafe redirect URLs are not presented to the browser.
    }
  }
  return {
    id: order.id,
    kind: order.kind,
    title: order.title,
    amountRub: order.amountRub,
    paymentMethod: order.paymentMethod,
    paymentModeAtCreation: order.paymentModeAtCreation,
    status: order.status,
    confirmationUrl,
    promoCode: order.promoCode,
    discountRub: order.discountRub,
    createdAt: order.createdAt,
    insuranceCredited: order.insuranceCredited,
    insuranceRefundedAmountRub: order.insuranceRefundedAmountRub,
    refundDestination: order.refundDestination,
  };
}
