import { NextRequest, NextResponse } from 'next/server';
import { verifyAndSyncOrderFromReturn } from '@/server/database';

export async function POST(req: NextRequest) {
  try {
    const { orderId } = (await req.json()) as { orderId: string };
    const order = await verifyAndSyncOrderFromReturn(orderId);
    return NextResponse.json({ order });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка проверки оплаты' },
      { status: 400 },
    );
  }
}
