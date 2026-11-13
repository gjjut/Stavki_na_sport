import { NextRequest, NextResponse } from 'next/server';
import { mutateState, readState, toSafeSessionUser } from '@/server/database';
import { requireAdminAccount } from '@/server/guards';
import { generateTelegramOneTimeInvite } from '@/server/integrations';

export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireAdminAccount();
    const body = (await req.json()) as {
      userId: string;
      action:
        | 'TOGGLE_BLOCK'
        | 'GRANT_VIP_7D'
        | 'GRANT_VIP_30D'
        | 'GRANT_VIP_LIFETIME'
        | 'REVOKE_VIP'
        | 'ADD_BALANCE'
        | 'SET_REVSHARE';
      amountRub?: number;
      revsharePercent?: number;
    };

    let promoInvite: string | null = null;
    if (
      body.action === 'GRANT_VIP_7D' ||
      body.action === 'GRANT_VIP_30D' ||
      body.action === 'GRANT_VIP_LIFETIME'
    ) {
      const snap = await readState();
      promoInvite = await generateTelegramOneTimeInvite(snap.settings, `promo_${body.userId}`);
    }

    const updated = await mutateState((state) => {
      const u = state.users.find((row) => row.id === body.userId);
      if (!u) throw new Error('Пользователь не найден');

      if (body.action === 'TOGGLE_BLOCK') {
        if (u.id === admin.id) {
          throw new Error('Нельзя заблокировать собственный аккаунт администратора');
        }
        u.status = u.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE';
      } else if (body.action === 'GRANT_VIP_7D') {
        u.vipExpiresAt = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
        u.vipPlanName = 'Промо VIP (7 дней)';
        if (promoInvite) u.vipInviteLink = promoInvite;
      } else if (body.action === 'GRANT_VIP_30D') {
        u.vipExpiresAt = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
        u.vipPlanName = 'Промо VIP (30 дней)';
        if (promoInvite) u.vipInviteLink = promoInvite;
      } else if (body.action === 'GRANT_VIP_LIFETIME') {
        u.vipExpiresAt = 'LIFETIME';
        u.vipPlanName = 'VIP Навсегда';
        if (promoInvite) u.vipInviteLink = promoInvite;
      } else if (body.action === 'REVOKE_VIP') {
        u.vipExpiresAt = null;
        u.vipPlanName = null;
        u.autoRenew = false;
        u.vipInviteLink = null;
      } else if (body.action === 'ADD_BALANCE' && typeof body.amountRub === 'number') {
        u.balanceRub = Math.max(0, u.balanceRub + Math.round(body.amountRub));
      } else if (body.action === 'SET_REVSHARE' && typeof body.revsharePercent === 'number') {
        u.revsharePercent = Math.min(80, Math.max(0, Math.round(body.revsharePercent)));
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
