import { NextRequest, NextResponse } from 'next/server';
import { hashPassword } from '@/server/auth';
import { mutateState, toSafeSessionUser } from '@/server/database';
import { requireAdminAccount } from '@/server/guards';

export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireAdminAccount();
    const body = (await req.json()) as {
      userId: string;
      action:
        | 'TOGGLE_BLOCK'
        | 'ADD_BALANCE'
        | 'SET_REVSHARE'
        | 'GRANT_PREDICTION'
        | 'RESET_PASSWORD';
      amountRub?: number;
      revsharePercent?: number;
      predictionId?: string;
      newPassword?: string;
    };

    const updated = await mutateState((state) => {
      const u = state.users.find((row) => row.id === body.userId);
      if (!u) throw new Error('Пользователь не найден');

      if (body.action === 'TOGGLE_BLOCK') {
        if (u.id === admin.id) {
          throw new Error('Нельзя заблокировать собственный аккаунт администратора');
        }
        u.status = u.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE';
      } else if (body.action === 'ADD_BALANCE' && typeof body.amountRub === 'number') {
        u.balanceRub = Math.max(0, u.balanceRub + Math.round(body.amountRub));
      } else if (
        body.action === 'SET_REVSHARE' &&
        typeof body.revsharePercent === 'number'
      ) {
        u.revsharePercent = Math.min(80, Math.max(0, Math.round(body.revsharePercent)));
      } else if (body.action === 'GRANT_PREDICTION' && body.predictionId) {
        if (!u.purchasedPredictionIds.includes(body.predictionId)) {
          u.purchasedPredictionIds.push(body.predictionId);
        }
      } else if (body.action === 'RESET_PASSWORD') {
        const cleanPass = (body.newPassword || '').trim();
        if (cleanPass.length < 6) {
          throw new Error('Новый пароль должен содержать минимум 6 символов');
        }
        u.passwordHash = hashPassword(cleanPass);
      }

      return toSafeSessionUser(u);
    });

    return NextResponse.json({ user: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка управления пользователем' },
      { status: 400 },
    );
  }
}
