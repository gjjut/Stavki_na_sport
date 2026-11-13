import { NextRequest, NextResponse } from 'next/server';
import { getBootstrapPayload } from '@/server/platformStore';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get('ref');
  const payload = getBootstrapPayload(ref);
  return NextResponse.json(payload);
}
