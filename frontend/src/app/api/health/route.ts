import { NextResponse } from 'next/server';
import { isSessionSigningAvailable } from '@/server/auth';
import { isStorageDegraded } from '@/server/health-policy';
import {
  getDatabaseBackendStatus,
  hasVerifiedSettledResult,
  readState,
  StorageUnavailableError,
} from '@/server/database';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const storage = await getDatabaseBackendStatus();
    const sessionAuthConfigured = isSessionSigningAvailable();
    const cronAuthConfigured = (process.env.AUTOPILOT_CRON_SECRET || '').trim().length >= 32;
    let state: Awaited<ReturnType<typeof readState>>;
    try {
      state = await readState();
    } catch (err) {
      if (!(err instanceof StorageUnavailableError)) throw err;
      // Return actionable health without reading a fallback or exposing database errors.
      return NextResponse.json(
        {
          status: 'degraded',
          storage: 'unavailable',
          databaseUrlConfigured: storage.databaseUrlConfigured,
          storageDegraded: true,
          sessionAuthConfigured,
          cronAuthConfigured,
          timestamp: new Date().toISOString(),
        },
        { status: 503 },
      );
    }
    const storageDegraded = isStorageDegraded({
      production: process.env.NODE_ENV === 'production',
      ...storage,
    });
    const adminAccountConfigured = state.users.some(
      (user) => user.role === 'ADMIN' && user.status === 'ACTIVE',
    );
    const productionSecurityDegraded =
      process.env.NODE_ENV === 'production' &&
      (!sessionAuthConfigured || !adminAccountConfigured || !cronAuthConfigured);
    const degraded = storageDegraded || productionSecurityDegraded;

    const activePredictions = state.predictions.filter(
      (p) => p.resultStatus === 'PENDING',
    ).length;
    const settledPredictions = state.predictions.filter(hasVerifiedSettledResult).length;
    const unverifiedSettlements = state.predictions.filter(
      (p) => p.resultStatus !== 'PENDING' && !hasVerifiedSettledResult(p),
    ).length;
    const mskDate = new Date(Date.now() + 3 * 3600_000);
    const mskTime = `${String(mskDate.getUTCHours()).padStart(2, '0')}:${String(
      mskDate.getUTCMinutes(),
    ).padStart(2, '0')} МСК`;

    return NextResponse.json(
      {
        status: degraded ? 'degraded' : 'ok',
        storage: storage.backend,
        databaseUrlConfigured: storage.databaseUrlConfigured,
        storageDegraded,
        sessionAuthConfigured,
        adminAccountConfigured,
        cronAuthConfigured,
        uptimeSec: Math.round(process.uptime()),
        mskTime,
        autopilotMode: state.aiAutopilot.mode,
        lastFeedSource: state.aiAutopilot.lastFeedSource,
        activePredictions,
        settledPredictions,
        unverifiedSettlements,
        timestamp: new Date().toISOString(),
      },
      { status: degraded ? 503 : 200 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        status: 'error',
        error: err instanceof Error ? err.message : 'Healthcheck failed',
      },
      { status: 500 },
    );
  }
}
