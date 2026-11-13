import { NextResponse } from 'next/server';
import { computePlatformAnalytics, readState, toSafeSessionUser } from '@/server/database';
import { requireAdminAccount } from '@/server/guards';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdminAccount();
    const state = await readState();
    const analytics = computePlatformAnalytics(state.predictions);

    return NextResponse.json({
      settings: state.settings,
      predictions: state.predictions,
      promoCodes: state.promoCodes,
      users: state.users.map((u) => ({
        ...toSafeSessionUser(u),
        referredByCode: u.referredByCode,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
      })),
      transactions: state.transactions,
      affiliateLinks: state.affiliateLinks,
      payouts: state.payouts,
      stats: analytics.statsByPeriod.ALL_TIME,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    return NextResponse.json(
      { error: 'Доступ разрешен только администратору' },
      { status: code === 'UNAUTHORIZED' ? 401 : 403 },
    );
  }
}
