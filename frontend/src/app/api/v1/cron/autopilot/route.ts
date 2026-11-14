import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { runScheduledAutopilotTick } from '@/server/ai-autopilot';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handleCronRequest(req);
}

export async function POST(req: NextRequest) {
  return handleCronRequest(req);
}

function hasValidCronSecret(expected: string, supplied: string): boolean {
  const expectedBytes = Buffer.from(expected, 'utf8');
  const suppliedBytes = Buffer.from(supplied, 'utf8');
  return (
    expectedBytes.length >= 32 &&
    expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes)
  );
}

async function handleCronRequest(req: NextRequest) {
  const expectedSecret = process.env.AUTOPILOT_CRON_SECRET?.trim() || '';
  if (expectedSecret.length < 32) {
    return NextResponse.json(
      { error: 'Cron authentication is not configured; set AUTOPILOT_CRON_SECRET to a random value of at least 32 characters.' },
      { status: 503 },
    );
  }

  const suppliedSecret =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
  if (!hasValidCronSecret(expectedSecret, suppliedSecret)) {
    return NextResponse.json({ error: 'Invalid cron secret' }, { status: 401 });
  }

  const result = await runScheduledAutopilotTick();
  return NextResponse.json({ ok: true, ...result });
}
