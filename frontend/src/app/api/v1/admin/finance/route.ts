import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { mutateState, StorageUnavailableError, verifyAndSyncYooKassaOrder } from '@/server/database';
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
      | { action: 'SYNC_PAYMENT'; orderId: string; externalPaymentId?: string }
      | {
          action: 'PROCESS_PAYOUT';
          payoutId: string;
          decision: 'PAID' | 'REJECTED';
        };

    if (body.action === 'SAVE_PRICING_RULES') {
      if (!Number.isSafeInteger(body.defaultSinglePriceRub) || body.defaultSinglePriceRub < 50 || body.defaultSinglePriceRub > 10_000_000 ||
          !Number.isSafeInteger(body.bundle2DiscountPct) || body.bundle2DiscountPct < 0 || body.bundle2DiscountPct > 50 ||
          !Number.isSafeInteger(body.bundle3DiscountPct) || body.bundle3DiscountPct < 0 || body.bundle3DiscountPct > 60 ||
          (body.applyToPending !== undefined && typeof body.applyToPending !== 'boolean')) {
        throw new Error('Укажите целую цену от 50 до 10 000 000 ₽ и скидки в допустимых пределах.');
      }
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
      const cleanCode = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
      if (!/^[A-Z0-9_-]{3,24}$/.test(cleanCode)) {
        throw new Error('Код промокода: 3–24 символа латиницы, цифры, дефис или подчёркивание.');
      }
      if (!Number.isSafeInteger(body.discountPercent) || body.discountPercent < 5 || body.discountPercent > 60 ||
          !Number.isSafeInteger(body.maxUses) || body.maxUses < 1 || body.maxUses > 1_000_000) {
        throw new Error('Скидка должна быть от 5 до 60%, лимит — целым числом от 1 до 1 000 000.');
      }
      await mutateState((state) => {
        if (state.promoCodes.some((c) => c.code === cleanCode)) {
          throw new Error('Такой промокод уже существует');
        }
        state.promoCodes.unshift({
          id: `promo_${randomUUID().slice(0, 8)}`,
          code: cleanCode,
          discountPercent: body.discountPercent,
          maxUses: body.maxUses,
          usedCount: 0,
          active: true,
          createdAt: new Date().toISOString(),
        });
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'DELETE_PROMO') {
      await mutateState((state) => {
        const promo = state.promoCodes.find((item) => item.id === body.promoId);
        if (!promo) throw new Error('Промокод не найден. Обновите данные.');
        if (state.transactions.some((order) => order.status === 'PENDING' && order.promoCode?.toUpperCase() === promo.code.toUpperCase())) {
          throw new Error('Промокод зарезервирован ожидающими заказами. Дождитесь подтверждения или отмены платежей и при необходимости сверьте их с ЮKassa.');
        }
        state.promoCodes = state.promoCodes.filter((c) => c.id !== body.promoId);
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'SYNC_PAYMENT') {
      if (typeof body.orderId !== 'string' || !body.orderId.trim() || body.orderId.length > 128 ||
          (body.externalPaymentId !== undefined && (typeof body.externalPaymentId !== 'string' ||
            !body.externalPaymentId.trim() || body.externalPaymentId.length > 128))) {
        throw new Error('Укажите корректные идентификаторы заказа и платежа.');
      }
      const order = await verifyAndSyncYooKassaOrder(body.orderId.trim(), body.externalPaymentId?.trim());
      if (!order.externalPaymentId && order.status === 'PENDING') {
        throw new Error('Сначала найдите идентификатор платежа в ЮKassa по номеру заказа и укажите его для проверки. Не отменяйте заказ без сверки.');
      }
      return NextResponse.json({ ok: true, order: { id: order.id, status: order.status } });
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
