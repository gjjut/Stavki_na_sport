import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { mutateState } from '@/server/database';
import { requireAuthenticatedUser } from '@/server/guards';

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();
    const body = (await req.json()) as
      | { action: 'CREATE_LINK'; code: string; label: string }
      | {
          action: 'REQUEST_PAYOUT';
          amountRub: number;
          method: 'SBP' | 'CARD' | 'USDT_TRC20';
          requisites: string;
        }
      | { action: 'CONVERT_TO_BALANCE' };

    if (body.action === 'CREATE_LINK') {
      const cleanCode = body.code.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
      if (cleanCode.length < 3) {
        throw new Error('Код ссылки должен содержать минимум 3 латинских символа или цифры');
      }

      const created = await mutateState((state) => {
        if (state.affiliateLinks.some((l) => l.code.toLowerCase() === cleanCode.toLowerCase())) {
          throw new Error('Такой код партнерской ссылки уже занят');
        }
        const link = {
          id: `aff_${randomUUID().slice(0, 10)}`,
          userId: user.id,
          userEmail: user.email,
          code: cleanCode,
          label: body.label?.trim() || 'Партнерский канал',
          clicks: 0,
          registrations: 0,
          buyers: 0,
          revenueRub: 0,
          createdAt: new Date().toISOString(),
        };
        state.affiliateLinks.unshift(link);
        return link;
      });

      return NextResponse.json({ link: created });
    }

    if (body.action === 'CONVERT_TO_BALANCE') {
      const transferredRub = await mutateState((state) => {
        const u = state.users.find((row) => row.id === user.id);
        if (!u || u.affiliateBalanceRub < 50) {
          throw new Error('Для перевода на баланс нужно минимум 50 ₽ партнерских начислений');
        }
        const amt = u.affiliateBalanceRub;
        u.affiliateBalanceRub = 0;
        u.balanceRub += amt;
        return amt;
      });

      return NextResponse.json({ transferredRub });
    }

    if (body.action === 'REQUEST_PAYOUT') {
      const amount = Math.round(body.amountRub || 0);
      if (amount < 500) {
        throw new Error('Минимальная сумма вывода на карту или СБП — 500 ₽');
      }
      if (!body.requisites?.trim()) {
        throw new Error('Укажите телефон для СБП (и банк) или номер карты МИР');
      }

      const payout = await mutateState((state) => {
        const u = state.users.find((row) => row.id === user.id);
        if (!u || u.affiliateBalanceRub < amount) {
          throw new Error('Недостаточно партнерских средств для вывода');
        }
        u.affiliateBalanceRub -= amount;

        const reqRow = {
          id: `pay_${randomUUID().slice(0, 10)}`,
          userId: u.id,
          userEmail: u.email,
          amountRub: amount,
          method: body.method,
          requisites: body.requisites.trim().slice(0, 160),
          status: 'PENDING' as const,
          createdAt: new Date().toISOString(),
          processedAt: null,
        };
        state.payouts.unshift(reqRow);
        return reqRow;
      });

      return NextResponse.json({ payout });
    }

    return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка партнерского кабинета' },
      { status: 400 },
    );
  }
}
