/** The same limit is enforced by the checkout API and all storefronts. */
export const MAX_BUNDLE_ITEMS = 100;

/** Drop no-longer-sellable items and never select more than the server accepts. */
export function toggleBundleSelection(
  selectedIds: string[],
  id: string,
  eligibleIds: string[],
): string[] {
  const eligible = new Set(eligibleIds);
  const current = selectedIds.filter((value) => eligible.has(value));
  if (current.includes(id)) return current.filter((value) => value !== id);
  if (!eligible.has(id) || current.length >= MAX_BUNDLE_ITEMS) return current;
  return [...current, id];
}
