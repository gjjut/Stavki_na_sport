import type { OrderTransaction, PredictionRecord, UserAccount } from './types';

type PredictionOwner = Pick<UserAccount, 'purchasedPredictionIds'>;
type LinkedOrder = Pick<OrderTransaction, 'status' | 'predictionId' | 'predictionIds'>;

/** Check and remove in the same serialized/transactional state mutation. */
export function deleteUnownedPrediction(state: {
  predictions: PredictionRecord[];
  users: PredictionOwner[];
  transactions: LinkedOrder[];
}, predictionId: string): PredictionRecord {
  const index = state.predictions.findIndex((prediction) => prediction.id === predictionId);
  if (index < 0) throw new Error('Событие не найдено. Обновите данные.');
  const hasAccess = state.users.some((user) => user.purchasedPredictionIds.includes(predictionId));
  const hasActiveOrder = state.transactions.some((order) =>
    (order.status === 'PENDING' || order.status === 'SUCCEEDED') &&
    (order.predictionId === predictionId || order.predictionIds.includes(predictionId)),
  );
  if (hasAccess || hasActiveOrder) {
    throw new Error('Событие нельзя удалить: у клиентов есть доступ или связанный оплаченный/ожидающий заказ.');
  }
  return state.predictions.splice(index, 1)[0];
}

/** Recheck the cart when inserting an order, not only in the earlier read snapshot. */
export function assertPredictionsExistForOrder(
  state: { predictions: Array<Pick<PredictionRecord, 'id'>> },
  predictionIds: readonly string[],
): void {
  const existingIds = new Set(state.predictions.map((prediction) => prediction.id));
  if (predictionIds.some((id) => !existingIds.has(id))) {
    throw new Error('Одно из выбранных событий уже недоступно. Обновите корзину.');
  }
}

export function validatePredictionForPublication(input: {
  sport: unknown;
  accessTier: unknown;
  leagueName: unknown;
  homeTeam: unknown;
  awayTeam: unknown;
  matchStartsAt: unknown;
  selectionTitle: unknown;
  fixedOdds: unknown;
  stakeUnits: unknown;
  analysisTeaser: unknown;
  analysisFull: unknown;
  singlePriceRub?: unknown;
}): void {
  const requiredText: Array<[unknown, string]> = [
    [input.leagueName, 'Лига или турнир'],
    [input.homeTeam, 'Хозяева или первый игрок'],
    [input.awayTeam, 'Гости или второй игрок'],
    [input.selectionTitle, 'Исход'],
    [input.analysisTeaser, 'Публичный анонс'],
    [input.analysisFull, 'Закрытая аналитика'],
  ];
  for (const [value, label] of requiredText) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Поле «${label}» обязательно.`);
  }
  if (!['FOOTBALL', 'HOCKEY', 'TENNIS', 'ESPORTS', 'BASKETBALL', 'MMA'].includes(String(input.sport))) {
    throw new Error('Укажите корректный вид спорта.');
  }
  if (input.accessTier !== 'FREE' && input.accessTier !== 'PAID_SINGLE') {
    throw new Error('Укажите корректный формат продажи.');
  }
  if (typeof input.matchStartsAt !== 'string' || !Number.isFinite(Date.parse(input.matchStartsAt))) {
    throw new Error('Укажите корректное время начала матча.');
  }
  const odds = Number(input.fixedOdds);
  const stake = Number(input.stakeUnits);
  if (!Number.isFinite(odds) || odds < 1.05 || odds > 50) {
    throw new Error('Укажите реальный коэффициент (1.05 – 50)');
  }
  if (!Number.isFinite(stake) || stake < 0.25 || stake > 10) {
    throw new Error('Размер флэта должен быть от 0.25 до 10% банка');
  }
  if (input.accessTier === 'PAID_SINGLE' && input.singlePriceRub != null) {
    const price = Number(input.singlePriceRub);
    if (!Number.isSafeInteger(price) || price < 50) {
      throw new Error('Цена должна быть целым числом не меньше 50 ₽.');
    }
  }
}
