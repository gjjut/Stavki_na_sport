import { NextRequest, NextResponse } from 'next/server';
import { setSessionCookies } from '@/server/session-cookies';

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  setSessionCookies(res, req, '', true);
  return res;
}
