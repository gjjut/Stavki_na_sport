import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, signSessionToken } from '@/server/auth';
import { loginUserAccount, toSafeSessionUser } from '@/server/database';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email: string; password: string };
    const user = await loginUserAccount(body.email, body.password);
    const token = signSessionToken(user.id);

    const res = NextResponse.json({ user: toSafeSessionUser(user) });
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 86400,
    });
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка входа' },
      { status: 400 },
    );
  }
}
