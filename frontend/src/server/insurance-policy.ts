import type { OrderTransaction } from './types';

/**
 * New orders allocate every paid ruble exactly once, in their stored item order.
 * Orders without a version retain their historical per-item rounding; changing
 * the formula retroactively could alter already agreed or partially paid terms.
 */
export function insuranceShareForPrediction(
  order: Pick<OrderTransaction, 'amountRub' | 'predictionIds' | 'insuranceAllocationVersion'>,
  predictionId: string,
): number {
  const index = order.predictionIds.indexOf(predictionId);
  if (index < 0) return 0;
  if (!Number.isSafeInteger(order.amountRub) || order.amountRub < 0 || !order.predictionIds.length) {
    throw new Error('Некорректная сумма или состав заказа; требуется ручная сверка начисления.');
  }
  if (order.insuranceAllocationVersion == null) {
    return Math.round(order.amountRub / order.predictionIds.length);
  }
  if (order.insuranceAllocationVersion !== 'EQUAL_REMAINDER_V1' ||
      new Set(order.predictionIds).size !== order.predictionIds.length) {
    throw new Error('Неизвестные или некорректные условия начисления; требуется ручная сверка.');
  }
  const count = order.predictionIds.length;
  return Math.floor(order.amountRub / count) + (index < order.amountRub % count ? 1 : 0);
}
