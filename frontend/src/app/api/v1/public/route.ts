import { NextRequest, NextResponse } from 'next/server';
import { ensureInProcessAutopilotDaemon } from '@/server/ai-autopilot';
import { EMBEDDED_REF_COOKIE_NAME, REF_COOKIE_NAME } from '@/server/auth';
import {
  computePlatformAnalytics,
  readState,
  recordReferralClick,
  StorageUnavailableError,
  toPublicPredictionDto,
  toSafeSessionUser,
} from '@/server/database';
import { getOptionalViewer } from '@/server/guards';
import { isLegacyStarterDemoPrediction } from '@/server/prediction-data-policy';
import { isSecureRequest } from '@/server/security-policy';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    ensureInProcessAutopilotDaemon();

    const rawRef = req.nextUrl.searchParams.get('ref')?.trim() || '';
    const ref = /^[a-zA-Z0-9_-]{3,32}$/.test(rawRef) ? rawRef : '';
    if (ref) await recordReferralClick(ref);

    const [state, viewer] = await Promise.all([readState(), getOptionalViewer()]);
    // Even retained/purchased starter examples must never appear on the storefront.
    const storefront = state.predictions.filter((p) => !isLegacyStarterDemoPrediction(p));
    const analytics = computePlatformAnalytics(storefront);
    const predictions = storefront.map((p) => toPublicPredictionDto(p, viewer));

    const res = NextResponse.json({
      brand: {
        brandName: state.settings.brandName,
        supportTelegram: state.settings.supportTelegram,
        freeTelegramUrl: state.settings.freeTelegramUrl,
        legalSellerName: state.settings.legalSellerName,
        legalInn: state.settings.legalInn,
        legalAddress: state.settings.legalAddress || '',
        legalRegistrationNumber: state.settings.legalRegistrationNumber || '',
        supportEmail: state.settings.supportEmail,
        paymentMode: state.settings.paymentMode,
        defaultSinglePriceRub: state.settings.defaultSinglePriceRub,
        bundle2DiscountPct: state.settings.bundle2DiscountPct,
        bundle3DiscountPct: state.settings.bundle3DiscountPct,
        yandexMetrikaId: state.settings.yandexMetrikaId || '',
      },
      viewer: viewer ? toSafeSessionUser(viewer) : null,
      predictions,
      statsByPeriod: analytics.statsByPeriod,
      equityCurve: analytics.equityCurve,
      sportBreakdown: analytics.sportBreakdown,
      recentWinsFeed: analytics.recentWinsFeed,
    });

    if (ref) {
      const secure = isSecureRequest(req);
      res.cookies.set(REF_COOKIE_NAME, ref, {
        httpOnly: false,
        secure,
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 86400,
      });
      if (secure) {
        res.cookies.set(EMBEDDED_REF_COOKIE_NAME, ref, {
          httpOnly: true,
          secure: true,
          sameSite: 'none',
          partitioned: true,
          path: '/',
          maxAge: 30 * 86400,
        });
      }
    }

    return res;
  } catch (err) {
    return NextResponse.json(
      { error: 'Данные сайта временно недоступны. Попробуйте позже.' },
      { status: err instanceof StorageUnavailableError ? 503 : 500 },
    );
  }
}
