declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready?: () => void;
        expand?: () => void;
        openLink?: (url: string) => void;
        initData?: string;
        platform?: string;
        initDataUnsafe?: { user?: { first_name?: string; username?: string } };
      };
    };
  }
}

/** Determine this at click time, not during server rendering. */
export function isEmbeddedBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const webApp = window.Telegram?.WebApp;
  if (webApp?.initData || (webApp?.platform && webApp.platform !== 'unknown')) return true;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/** Telegram requires openLink to be called directly from a user gesture. */
export function openTelegramExternalLink(url: string): boolean {
  if (typeof window === 'undefined') return false;
  const webApp = window.Telegram?.WebApp;
  if (!webApp?.openLink || !(webApp.initData || (webApp.platform && webApp.platform !== 'unknown'))) return false;
  try {
    const target = new URL(url, window.location.href);
    if (target.protocol !== 'https:') return false;
    webApp.openLink(target.href);
    return true;
  } catch {
    return false;
  }
}
