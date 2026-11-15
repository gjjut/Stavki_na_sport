/** Check the session actually survived the browser's cookie/storage policy. */
export async function isBrowserSessionConfirmed(expectedUserId: string | undefined): Promise<boolean> {
  if (!expectedUserId) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch('/api/v1/auth/me', { cache: 'no-store', signal: controller.signal });
    if (!response.ok) return false;
    const body = (await response.json()) as { user?: { id?: string } | null };
    return body.user?.id === expectedUserId;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
