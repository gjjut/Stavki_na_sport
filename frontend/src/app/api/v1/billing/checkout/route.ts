import { NextRequest, NextResponse } from 'next/server';
import { initiateCheckoutInStore } from '@/server/platformStore';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      kind: 'SINGLE_PREDICTION' | 'VIP_SUBSCRIPTION';
      predictionId?: string;
      planCode?: 'VIP_7D' | 'VIP_30D' | 'VIP_LIFETIME';
      receiptEmail: string;
      paymentMethod: 'sbp' | 'bank_card' | 'internal_balance';
      autoRenew: boolean;
    };

    const tx = initiateCheckoutInStore(body);
    return NextResponse.json({ transaction: tx });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка инициализации платежа' },
      { status: 400 },
    );
  }
}
