/** Public product identity. Storage and session identifiers intentionally keep their legacy names. */
export const BRAND_NAME = 'PredictLab';
export const BRAND_MONOGRAM = 'PL';

/** Migrate only the exact old default; preserve names explicitly chosen by the owner. */
export function publicBrandName(storedName: string | null | undefined): string {
  return storedName === 'VALUEX' || storedName == null ? BRAND_NAME : storedName;
}
