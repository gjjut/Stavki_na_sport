export function isLegacyStarterDemoPrediction(record: { id?: unknown }): boolean {
  return typeof record.id === 'string' && /^pred_init_\d+$/.test(record.id);
}

type UserPredictionReferences = { purchasedPredictionIds?: unknown; grantedPredictionIds?: unknown };
type OrderPredictionReferences = { status?: unknown; predictionId?: unknown; predictionIds?: unknown };

/** Starter examples may be retained privately for existing customers, but are never public or for sale. */
export function canAccessLegacyStarterDemoPrediction(
  record: { id?: unknown },
  viewer: (UserPredictionReferences & { role?: unknown; status?: unknown }) | null | undefined,
): boolean {
  if (!isLegacyStarterDemoPrediction(record) || typeof record.id !== 'string' || viewer?.status !== 'ACTIVE') return false;
  return viewer.role === 'ADMIN' ||
    (Array.isArray(viewer.purchasedPredictionIds) && viewer.purchasedPredictionIds.includes(record.id)) ||
    (Array.isArray(viewer.grantedPredictionIds) && viewer.grantedPredictionIds.includes(record.id));
}

/** A currently open storefront offer, not just any unresolved historical record. */
export function isActiveStorefrontPrediction(record: {
  id?: unknown; resultStatus?: unknown; matchStartsAt?: unknown; matchLifecycleStatus?: unknown; matchStatus?: unknown;
}, nowMs = Date.now()): boolean {
  if (isLegacyStarterDemoPrediction(record) || record.resultStatus !== 'PENDING' || typeof record.matchStartsAt !== 'string') return false;
  const startsAt = Date.parse(record.matchStartsAt);
  if (!Number.isFinite(startsAt) || startsAt <= nowMs ||
      ['LIVE', 'FINISHED', 'POSTPONED', 'CANCELLED'].includes(String(record.matchLifecycleStatus))) return false;
  return Boolean(record.matchLifecycleStatus) || !['LIVE', 'FINISHED'].includes(String(record.matchStatus));
}

/** Client access and any historical order protect a prediction even if its ID resembles a demo. */
export function protectedPredictionIds(
  users: readonly UserPredictionReferences[],
  transactions: readonly OrderPredictionReferences[],
): Set<string> {
  const ids = new Set<string>();
  const add = (values: unknown) => {
    if (Array.isArray(values)) for (const id of values) if (typeof id === 'string') ids.add(id);
  };
  for (const user of users) {
    add(user?.purchasedPredictionIds);
    add(user?.grantedPredictionIds);
  }
  for (const order of transactions) {
    // Refunded, cancelled and legacy orders are also historical evidence.
    if (typeof order?.predictionId === 'string') ids.add(order.predictionId);
    add(order?.predictionIds);
  }
  return ids;
}

export function withoutLegacyStarterDemoPredictions<T extends { id?: unknown }>(
  records: T[],
  protectedIds: ReadonlySet<string> = new Set(),
): T[] {
  return records.filter((record) =>
    !isLegacyStarterDemoPrediction(record) ||
    (typeof record.id === 'string' && protectedIds.has(record.id)),
  );
}

/** Remove only unreferenced demo predictions; unrelated drafts and records are untouched. */
export function removeUnownedLegacyDemoPredictions<T extends { id?: unknown }>(state: {
  predictions: T[];
  users: readonly UserPredictionReferences[];
  transactions: readonly OrderPredictionReferences[];
}): number {
  const before = state.predictions.length;
  state.predictions = withoutLegacyStarterDemoPredictions(state.predictions, protectedPredictionIds(state.users, state.transactions));
  return before - state.predictions.length;
}
