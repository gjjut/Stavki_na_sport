import { NextRequest, NextResponse } from 'next/server';
import { mutateState, refundOrderTransaction } from '@/server/database';
import { requireAdminAccount } from '@/server/guards';

export async function PATCH(req: NextRequest) {
  try {
    await requireAdminAccount();
    const body = (await req.json()) as
      | {
          action: 'SAVE_DEFAULT_PRICE';
          defaultSinglePriceRub: number;
          applyToPending?: boolean;
        }
      | { action: 'REFUND_ORDER'; orderId: string }
      | {
          action: 'PROCESS_PAYOUT';
          payoutId: string;
          decision: 'PAID' | 'REJECTED';
        };

    if (body.action === 'SAVE_DEFAULT_PRICE') {
      await mutateState((state) => {
        state.settings.defaultSinglePriceRub = Math.max(
          50,
          Math.round(body.defaultSinglePriceRub),
        );
        if (body.applyToPending) {
          for (const p of state.predictions) {
            if (p.accessTier === 'PAID_SINGLE' && p.resultStatus === 'PENDING') {
              p.singlePriceRub = state.settings.defaultSinglePriceRub;
            }
          }
        }
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'REFUND_ORDER') {
      await refundOrderTransaction(body.orderId);
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'PROCESS_PAYOUT') {
      await mutateState((state) => {
        const payout = state.payouts.find((p) => p.id === body.payoutId);
        if (!payout || payout.status !== 'PENDING') return;
        payout.status = body.decision;
        payout.processedAt = new Date().toISOString();

        if (body.decision === 'REJECTED') {
          const partner = state.users.find((u) => u.id === payout.userId);
          if (partner) {
            partner.affiliateBalanceRub += payout.amountRub;
          }
        }
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Неизвестная операция' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка финансового модуля' },
      { status: 400 },
    );
  }
}
