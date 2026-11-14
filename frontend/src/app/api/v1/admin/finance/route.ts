import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { mutateState, StorageUnavailableError } from '@/server/database';
import { applyAdminBalanceRefund, applyPayoutDecision } from '@/lib/admin-finance-policy';
import { requireAdminAccount } from '@/server/guards';

export async function PATCH(req: NextRequest) {
  try {
    await requireAdminAccount();
    const body = (await req.json()) as
      | {
          action: 'SAVE_PRICING_RULES';
          defaultSinglePriceRub: number;
          bundle2DiscountPct: number;
          bundle3DiscountPct: number;
          applyToPending?: boolean;
        }
      | {
          action: 'CREATE_PROMO';
          code: string;
          discountPercent: number;
          maxUses: number;
        }
      | { action: 'DELETE_PROMO'; promoId: string }
      | { action: 'REFUND_ORDER'; orderId: string }
      | {
          action: 'PROCESS_PAYOUT';
          payoutId: string;
          decision: 'PAID' | 'REJECTED';
        };

    if (body.action === 'SAVE_PRICING_RULES') {
      await mutateState((state) => {
        state.settings.defaultSinglePriceRub = Math.max(
          50,
          Math.round(body.defaultSinglePriceRub),
        );
        state.settings.bundle2DiscountPct = Math.min(
          50,
          Math.max(0, Math.round(body.bundle2DiscountPct)),
        );
        state.settings.bundle3DiscountPct = Math.min(
          60,
          Math.max(0, Math.round(body.bundle3DiscountPct)),
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

    if (body.action === 'CREATE_PROMO') {
      const cleanCode = body.code
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, '')
        .slice(0, 24);
      if (cleanCode.length < 3) {
        throw new Error('Код промокода должен содержать от 3 символов (латиница/цифры)');
      }
      await mutateState((state) => {
        if (state.promoCodes.some((c) => c.code === cleanCode)) {
          throw new Error('Такой промокод уже существует');
        }
        state.promoCodes.unshift({
          id: `promo_${randomUUID().slice(0, 8)}`,
          code: cleanCode,
          discountPercent: Math.min(80, Math.max(5, Math.round(body.discountPercent))),
          maxUses: Math.max(1, Math.round(body.maxUses || 100)),
          usedCount: 0,
          active: true,
          createdAt: new Date().toISOString(),
        });
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'DELETE_PROMO') {
      await mutateState((state) => {
        state.promoCodes = state.promoCodes.filter((c) => c.id !== body.promoId);
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'REFUND_ORDER') {
      const refund = await mutateState((state) =>
        applyAdminBalanceRefund(state, body.orderId, new Date().toISOString()),
      );
      return NextResponse.json({ ok: true, ...refund });
    }

    if (body.action === 'PROCESS_PAYOUT') {
      await mutateState((state) =>
        applyPayoutDecision(state, body.payoutId, body.decision, new Date().toISOString()),
      );
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Неизвестная операция' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка финансового модуля' },
      { status: err instanceof StorageUnavailableError ? 503 : 400 },
    );
  }
}
