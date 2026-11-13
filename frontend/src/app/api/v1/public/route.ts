import { NextRequest, NextResponse } from 'next/server';
import { REF_COOKIE_NAME } from '@/server/auth';
import {
  computePlatformAnalytics,
  readState,
  recordReferralClick,
  toPublicPredictionDto,
  toSafeSessionUser,
} from '@/server/database';
import { getOptionalViewer } from '@/server/guards';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get('ref')?.trim();
  if (ref) {
    await recordReferralClick(ref);
  }

  const [state, viewer] = await Promise.all([readState(), getOptionalViewer()]);
  const analytics = computePlatformAnalytics(state.predictions);

  const predictions = state.predictions.map((p) => toPublicPredictionDto(p, viewer));

  const res = NextResponse.json({
    brand: {
      brandName: state.settings.brandName,
      supportTelegram: state.settings.supportTelegram,
      freeTelegramUrl: state.settings.freeTelegramUrl,
      legalSellerName: state.settings.legalSellerName,
      legalInn: state.settings.legalInn,
      supportEmail: state.settings.supportEmail,
      paymentMode: state.settings.paymentMode,
      defaultSinglePriceRub: state.settings.defaultSinglePriceRub,
    },
    viewer: viewer ? toSafeSessionUser(viewer) : null,
    predictions,
    tariffs: state.tariffs,
    statsByPeriod: analytics.statsByPeriod,
    equityCurve: analytics.equityCurve,
    sportBreakdown: analytics.sportBreakdown,
    recentWinsFeed: analytics.recentWinsFeed,
  });

  if (ref) {
    res.cookies.set(REF_COOKIE_NAME, ref, {
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 86400,
    });
  }

  return res;
}
