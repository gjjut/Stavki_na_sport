export function isLegacyStarterDemoPrediction(record: { id?: unknown }): boolean {
  return typeof record.id === 'string' && /^pred_init_\d+$/.test(record.id);
}

export function withoutLegacyStarterDemoPredictions<T extends { id?: unknown }>(
  records: T[],
): T[] {
  return records.filter((record) => !isLegacyStarterDemoPrediction(record));
}
