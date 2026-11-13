import { NextRequest, NextResponse } from 'next/server';
import { hashPassword, verifyPassword } from '@/server/auth';
import {
  mutateState,
  readState,
  toPublicPredictionDto,
  toSafeSessionUser,
} from '@/server/database';
import { requireAuthenticatedUser } from '@/server/guards';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    const state = await readState();

    const unlockedPredictions = state.predictions
      .map((p) => toPublicPredictionDto(p, user))
      .filter((dto) => user.purchasedPredictionIds.includes(dto.id) || !dto.isLocked);

    const myOrders = state.transactions.filter((t) => t.userId === user.id);
    const myAffiliateLinks = state.affiliateLinks.filter((l) => l.userId === user.id);
    const myPayouts = state.payouts.filter((p) => p.userId === user.id);

    return NextResponse.json({
      user: toSafeSessionUser(user),
      unlockedPredictions,
      orders: myOrders,
      affiliateLinks: myAffiliateLinks,
      payouts: myPayouts,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    return NextResponse.json(
      { error: 'Необходима авторизация' },
      { status: code === 'UNAUTHORIZED' ? 401 : 403 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const sessionUser = await requireAuthenticatedUser();
    const body = (await req.json()) as {
      displayName?: string;
      city?: string;
      telegramUsername?: string;
      referenceBankrollRub?: number;
      cancelAutoRenew?: boolean;
      currentPassword?: string;
      newPassword?: string;
    };

    const updated = await mutateState((state) => {
      const u = state.users.find((row) => row.id === sessionUser.id);
      if (!u) throw new Error('Пользователь не найден');

      if (typeof body.displayName === 'string' && body.displayName.trim()) {
        u.displayName = body.displayName.trim().slice(0, 80);
      }
      if (typeof body.city === 'string') {
        u.city = body.city.trim().slice(0, 80);
      }
      if (typeof body.telegramUsername === 'string') {
        const cleanTg = body.telegramUsername.trim();
        u.telegramUsername = cleanTg ? (cleanTg.startsWith('@') ? cleanTg : `@${cleanTg}`) : null;
      }
      if (typeof body.referenceBankrollRub === 'number' && body.referenceBankrollRub >= 1000) {
        u.referenceBankrollRub = Math.round(body.referenceBankrollRub);
      }
      if (body.cancelAutoRenew) {
        u.autoRenew = false;
      }
      if (body.newPassword) {
        if (!body.currentPassword || !verifyPassword(body.currentPassword, u.passwordHash)) {
          throw new Error('Текущий пароль указан неверно');
        }
        if (body.newPassword.length < 6) {
          throw new Error('Новый пароль должен содержать минимум 6 символов');
        }
        u.passwordHash = hashPassword(body.newPassword);
      }

      return toSafeSessionUser(u);
    });

    return NextResponse.json({ user: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка обновления профиля' },
      { status: 400 },
    );
  }
}
