import { NextRequest, NextResponse } from 'next/server';
import {
  getRefCodeFromCookies,
  SESSION_COOKIE_NAME,
  signSessionToken,
} from '@/server/auth';
import { registerUserAccount, toSafeSessionUser } from '@/server/database';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      email: string;
      password: string;
      displayName: string;
      city?: string;
      refCode?: string;
    };

    const refCode = body.refCode?.trim() || getRefCodeFromCookies();
    const user = await registerUserAccount({
      email: body.email,
      password: body.password,
      displayName: body.displayName,
      city: body.city,
      refCode,
    });

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
      { error: err instanceof Error ? err.message : 'Ошибка регистрации' },
      { status: 400 },
    );
  }
}
