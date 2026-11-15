import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { mutateState, StorageUnavailableError } from '@/server/database';
import { requireAuthenticatedUser } from '@/server/guards';
import { sendTelegramDirectMessage } from '@/server/integrations';

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
      if (typeof body.code !== 'string' || (body.label !== undefined && typeof body.label !== 'string')) {
        throw new Error('Укажите код и название партнёрской ссылки');
      }
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
          label: body.label?.trim().slice(0, 80) || 'Партнерский канал',
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
        if (!u || typeof u.affiliateBalanceRub !== 'number' || !Number.isFinite(u.affiliateBalanceRub) || u.affiliateBalanceRub < 50 ||
            typeof u.balanceRub !== 'number' || !Number.isFinite(u.balanceRub)) {
          throw new Error('Для перевода на баланс нужно минимум 50 ₽ партнёрских начислений и корректный баланс');
        }
        const amt = u.affiliateBalanceRub;
        u.affiliateBalanceRub = 0;
        u.balanceRub += amt;
        return amt;
      });

      return NextResponse.json({ transferredRub });
    }

    if (body.action === 'REQUEST_PAYOUT') {
      // JSON may contain strings, null or huge numbers despite the TypeScript type.
      // In particular NaN must never reach subtraction or the persisted JSON state.
      if (typeof body.amountRub !== 'number' || !Number.isSafeInteger(body.amountRub) || body.amountRub < 500) {
        throw new Error('Укажите сумму выплаты целым числом рублей, не менее 500 ₽');
      }
      const amount = body.amountRub;
      if (!['SBP', 'CARD', 'USDT_TRC20'].includes(body.method)) {
        throw new Error('Укажите поддерживаемый способ выплаты');
      }
      if (typeof body.requisites !== 'string' || !body.requisites.trim() || body.requisites.trim().length > 160) {
        throw new Error('Укажите реквизиты выплаты (не более 160 символов)');
      }

      const { payout, adminChats, settings } = await mutateState((state) => {
        const u = state.users.find((row) => row.id === user.id);
        if (!u || typeof u.affiliateBalanceRub !== 'number' || !Number.isFinite(u.affiliateBalanceRub) || u.affiliateBalanceRub < amount) {
          throw new Error('Недостаточно партнерских средств для вывода');
        }
        u.affiliateBalanceRub -= amount;

        const reqRow = {
          id: `pay_${randomUUID().slice(0, 10)}`,
          userId: u.id,
          userEmail: u.email,
          amountRub: amount,
          method: body.method,
          requisites: body.requisites.trim(),
          status: 'PENDING' as const,
          createdAt: new Date().toISOString(),
          processedAt: null,
        };
        state.payouts.unshift(reqRow);
        const adminChats = state.users
          .filter((a) => a.role === 'ADMIN' && a.telegramBindingVerified && a.telegramChatId)
          .map((a) => a.telegramChatId!);
        return { payout: reqRow, adminChats, settings: state.settings };
      });

      for (const chatId of adminChats) {
        void sendTelegramDirectMessage(
          settings,
          chatId,
          `🏦 <b>Новая заявка партнёра на выплату: ${payout.amountRub.toLocaleString('ru-RU')} ₽</b>\nНомер заявки: <code>${payout.id}</code>\nДанные и реквизиты доступны в защищённой админ-панели.`,
        ).catch(() => undefined);
      }

      return NextResponse.json({ payout });
    }

    return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 });
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    return NextResponse.json(
      { error: code === 'UNAUTHORIZED' ? 'Необходима авторизация' : code === 'BLOCKED' ? 'Доступ ограничен' : code || 'Ошибка партнёрского кабинета' },
      { status: err instanceof StorageUnavailableError ? 503 : code === 'UNAUTHORIZED' ? 401 : code === 'BLOCKED' ? 403 : 400 },
    );
  }
}
