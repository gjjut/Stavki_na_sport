import { NextRequest, NextResponse } from 'next/server';
import { readState, StorageUnavailableError, verifyAndSyncOrderFromReturn } from '@/server/database';
import { requireAuthenticatedUser } from '@/server/guards';

export async function POST(req: NextRequest) {
  try {
    const viewer = await requireAuthenticatedUser();
    const body = (await req.json()) as { orderId?: unknown };
    if (typeof body.orderId !== 'string' || !body.orderId.trim()) {
      return NextResponse.json({ error: 'Не указан номер заказа.' }, { status: 400 });
    }
    const state = await readState();
    const existing = state.transactions.find((order) => order.id === body.orderId && order.userId === viewer.id);
    if (!existing) {
      return NextResponse.json({ error: 'Заказ не найден.' }, { status: 404 });
    }
    const order = await verifyAndSyncOrderFromReturn(existing.id);
    if (order.userId !== viewer.id) {
      return NextResponse.json({ error: 'Заказ не найден.' }, { status: 404 });
    }
    // The payment result page does not need email, provider IDs, or referral details.
    return NextResponse.json({
      order: {
        id: order.id,
        title: order.title,
        amountRub: order.amountRub,
        kind: order.kind,
        status: order.status,
      },
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    if (code === 'UNAUTHORIZED' || code === 'BLOCKED') {
      return NextResponse.json(
        { error: 'Войдите в аккаунт покупателя, чтобы проверить заказ.' },
        { status: code === 'UNAUTHORIZED' ? 401 : 403 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка проверки оплаты' },
      { status: err instanceof StorageUnavailableError ? 503 : 400 },
    );
  }
}
