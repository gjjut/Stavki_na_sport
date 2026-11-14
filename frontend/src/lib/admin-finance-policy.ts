import type { OrderTransaction, PayoutRequestRecord, UserAccount } from '@/server/types';

export type BalanceRefundQuote =
  | { ok: true; creditRub: number; insuranceRub: number }
  | { ok: false; reason: string };

/** A store-credit refund is not a refund to the original payment method. */
export function quoteBalanceRefund(order: OrderTransaction): BalanceRefundQuote {
  if (Array.isArray(order.externalRefundNotices) && order.externalRefundNotices.length > 0) {
    return { ok: false, reason: 'По заказу есть возврат в ЮKassa; сначала нужна ручная сверка, чтобы не вернуть деньги дважды.' };
  }
  if (order.status !== 'SUCCEEDED') {
    return { ok: false, reason: 'Возврат доступен только для оплаченного заказа.' };
  }
  if (order.kind !== 'SINGLE_PREDICTION' && order.kind !== 'BUNDLE_PREDICTIONS') {
    return { ok: false, reason: 'Пополнение баланса нельзя вернуть этим способом.' };
  }
  if (order.paymentMethod !== 'yookassa' && order.paymentMethod !== 'internal_balance') {
    return { ok: false, reason: 'Неизвестный способ оплаты.' };
  }
  if (!Number.isSafeInteger(order.amountRub) || order.amountRub < 0) {
    return { ok: false, reason: 'Некорректная сумма заказа; требуется ручная проверка.' };
  }
  if (order.insuranceCredited && order.insuranceRefundedAmountRub == null) {
    return { ok: false, reason: 'Сумма ранее выплаченной страховки неизвестна; требуется ручная проверка.' };
  }
  const insuranceRub = order.insuranceRefundedAmountRub ?? 0;
  if (!Number.isSafeInteger(insuranceRub) || insuranceRub < 0) {
    return { ok: false, reason: 'Некорректная сумма страховки; требуется ручная проверка.' };
  }
  return {
    ok: true,
    creditRub: Math.max(0, order.amountRub - insuranceRub),
    insuranceRub,
  };
}

type RefundUser = Pick<UserAccount, 'id' | 'balanceRub' | 'purchasedPredictionIds' | 'grantedPredictionIds'>;

/** Mutate only inside the database's serialized/transactional state update. */
export function applyAdminBalanceRefund(
  state: { transactions: OrderTransaction[]; users: RefundUser[] },
  orderId: string,
  now: string,
): { creditedRub: number; retainedPredictionIds: string[] } {
  const order = state.transactions.find((item) => item.id === orderId);
  if (!order) throw new Error('Заказ не найден.');
  const quote = quoteBalanceRefund(order);
  if (!quote.ok) throw new Error(quote.reason);
  const buyer = state.users.find((user) => user.id === order.userId);
  if (!buyer) throw new Error('Покупатель не найден; возврат не выполнен.');
  if (!Number.isSafeInteger(buyer.balanceRub) || buyer.balanceRub < 0 || !Number.isSafeInteger(buyer.balanceRub + quote.creditRub)) {
    throw new Error('Некорректный баланс покупателя; требуется ручная проверка.');
  }

  const predictionIds = [...new Set(order.predictionIds.length
    ? order.predictionIds
    : order.predictionId ? [order.predictionId] : [])];
  const retainedPredictionIds = predictionIds.filter((id) => {
    if (!buyer.purchasedPredictionIds.includes(id)) return false;
    // Old accounts did not distinguish gifts from purchases, so do not destroy uncertain access.
    if (!Array.isArray(buyer.grantedPredictionIds) || buyer.grantedPredictionIds.includes(id)) return true;
    return state.transactions.some((other) =>
      other.id !== order.id && other.userId === buyer.id && other.status === 'SUCCEEDED' &&
      (other.predictionId === id || other.predictionIds.includes(id)),
    );
  });
  const retain = new Set(retainedPredictionIds);
  buyer.balanceRub += quote.creditRub;
  buyer.purchasedPredictionIds = buyer.purchasedPredictionIds.filter((id) => !predictionIds.includes(id) || retain.has(id));
  order.status = 'REFUNDED';
  order.refundDestination = 'BALANCE';
  order.refundBalanceAmountRub = quote.creditRub;
  order.refundedAt = now;
  return { creditedRub: quote.creditRub, retainedPredictionIds };
}

type PayoutUser = Pick<UserAccount, 'id' | 'affiliateBalanceRub'>;

/** Marking a payout as paid is bookkeeping only; no external transfer is made. */
export function applyPayoutDecision(
  state: { payouts: PayoutRequestRecord[]; users: PayoutUser[] },
  payoutId: string,
  decision: 'PAID' | 'REJECTED',
  now: string,
): void {
  if (decision !== 'PAID' && decision !== 'REJECTED') throw new Error('Неизвестное решение по выплате.');
  const payout = state.payouts.find((item) => item.id === payoutId);
  if (!payout) throw new Error('Заявка на выплату не найдена.');
  if (payout.status !== 'PENDING') throw new Error('Заявка уже обработана. Обновите данные.');
  if (!Number.isSafeInteger(payout.amountRub) || payout.amountRub <= 0) {
    throw new Error('Некорректная сумма выплаты; требуется ручная проверка.');
  }
  if (decision === 'REJECTED') {
    const partner = state.users.find((user) => user.id === payout.userId);
    if (!partner) throw new Error('Партнёр не найден; заявка не изменена.');
    if (!Number.isSafeInteger(partner.affiliateBalanceRub) || partner.affiliateBalanceRub < 0 ||
        !Number.isSafeInteger(partner.affiliateBalanceRub + payout.amountRub)) {
      throw new Error('Некорректный партнёрский баланс; требуется ручная проверка.');
    }
    partner.affiliateBalanceRub += payout.amountRub;
  }
  payout.status = decision;
  payout.processedAt = now;
}
