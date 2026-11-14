import type { OrderTransaction } from './types';

/** A payment fetched from YooKassa, not values supplied in a webhook body. */
export interface VerifiedYooKassaPayment {
  id: string;
  status: string;
  paid: boolean;
  amountValue: string;
  currency: string;
  metadata: { orderId?: unknown; userId?: unknown };
}

function matchesIntegerRubles(value: string, expectedRub: number): boolean {
  if (!Number.isSafeInteger(expectedRub) || expectedRub < 0 || !/^\d{1,16}(?:\.\d{1,2})?$/.test(value)) {
    return false;
  }
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) === expectedRub && (fraction + '00').slice(0, 2) === '00';
}

/** Verify the externally fetched payment against the exact local order. */
export function assertYooKassaPaymentMatchesOrder(
  order: OrderTransaction,
  payment: VerifiedYooKassaPayment,
): void {
  if (order.paymentMethod !== 'yookassa' || payment.id !== order.externalPaymentId) {
    throw new Error('Платёж ЮKassa не соответствует заказу; требуется ручная проверка.');
  }
  if (payment.currency !== 'RUB' || !matchesIntegerRubles(payment.amountValue, order.amountRub)) {
    throw new Error('Сумма или валюта платежа ЮKassa не совпадает с заказом; требуется ручная проверка.');
  }
  if (payment.metadata.orderId !== order.id || payment.metadata.userId !== order.userId) {
    throw new Error('Метаданные платежа ЮKassa не совпадают с заказом; требуется ручная проверка.');
  }
}
