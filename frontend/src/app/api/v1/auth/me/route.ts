import { NextResponse } from 'next/server';
import { toSafeSessionUser } from '@/server/database';
import { getOptionalViewer } from '@/server/guards';

export const dynamic = 'force-dynamic';

export async function GET() {
  const viewer = await getOptionalViewer();
  return NextResponse.json({
    user: viewer ? toSafeSessionUser(viewer) : null,
  });
}
