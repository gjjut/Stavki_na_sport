import { NextRequest, NextResponse } from 'next/server';
import { runScheduledAutopilotTick } from '@/server/ai-autopilot';
import { readState } from '@/server/database';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handleCronRequest(req);
}

export async function POST(req: NextRequest) {
  return handleCronRequest(req);
}

async function handleCronRequest(req: NextRequest) {
  const state = await readState();
  const expectedSecret = state.aiAutopilot.cronSecret;

  const querySecret = req.nextUrl.searchParams.get('secret') || '';
  const authHeader =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  const forwardedFor = (req.headers.get('x-forwarded-for') || '').trim();
  const host = (req.headers.get('host') || '').trim();

  const isLocalHost = host.startsWith('127.0.0.1') || host.startsWith('localhost');
  const isLocalIp =
    !forwardedFor ||
    forwardedFor === '127.0.0.1' ||
    forwardedFor === '::1' ||
    forwardedFor === '::ffff:127.0.0.1';

  const isLocalLoopback = isLocalHost && isLocalIp;

  if (
    !isLocalLoopback &&
    expectedSecret &&
    querySecret !== expectedSecret &&
    authHeader !== expectedSecret
  ) {
    return NextResponse.json({ error: 'Invalid cron secret' }, { status: 401 });
  }

  const result = await runScheduledAutopilotTick();
  return NextResponse.json({ ok: true, ...result });
}
