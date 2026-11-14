import { NextResponse } from 'next/server';
import { getDatabaseBackendStatus, readState } from '@/server/database';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [storageBackend, state] = await Promise.all([
      getDatabaseBackendStatus(),
      readState(),
    ]);

    const activePredictions = state.predictions.filter(
      (p) => p.resultStatus === 'PENDING',
    ).length;
    const settledPredictions = state.predictions.length - activePredictions;
    const mskDate = new Date(Date.now() + 3 * 3600_000);
    const mskTime = `${String(mskDate.getUTCHours()).padStart(2, '0')}:${String(
      mskDate.getUTCMinutes(),
    ).padStart(2, '0')} МСК`;

    return NextResponse.json({
      status: 'ok',
      storage: storageBackend,
      uptimeSec: Math.round(process.uptime()),
      mskTime,
      autopilotMode: state.aiAutopilot.mode,
      lastFeedSource: state.aiAutopilot.lastFeedSource,
      activePredictions,
      settledPredictions,
      timestamp: new Date().toISOString(),
    });
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
