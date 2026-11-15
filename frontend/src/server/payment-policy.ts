import type { OrderTransaction } from './types';

/** Do not create a second payable order for an item already awaiting payment. */
export function assertNoOverlappingPendingOrder(
  orders: readonly OrderTransaction[],
  userId: string,
  predictionIds: readonly string[],
  kind?: OrderTransaction['kind'],
): void {
  const selected = new Set(predictionIds);
  if (orders.some((order) => order.userId === userId && order.status === 'PENDING' &&
      ((kind === 'BALANCE_TOPUP' && order.kind === 'BALANCE_TOPUP') ||
       (order.predictionId !== null && selected.has(order.predictionId)) ||
       order.predictionIds.some((id) => selected.has(id))))) {
    throw new Error(kind === 'BALANCE_TOPUP'
      ? 'У вас уже есть ожидающее пополнение. Проверьте его статус в кабинете до повторной оплаты.'
      : 'Для выбранного прогноза уже есть ожидающий заказ. Проверьте его статус в кабинете до повторной оплаты.');
  }
}

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
