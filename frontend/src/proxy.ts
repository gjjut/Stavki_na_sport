import { NextRequest, NextResponse } from 'next/server';
import { isAllowedApiMutation } from '@/lib/request-origin-policy';

export function proxy(request: NextRequest) {
  if (!isAllowedApiMutation({
    method: request.method,
    pathname: request.nextUrl.pathname,
    requestUrl: request.url,
    headers: request.headers,
  })) {
    return NextResponse.json({ error: 'Запрос отклонён: обновите страницу и повторите действие с сайта.' }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: '/api/v1/:path*' };
