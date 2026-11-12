import { NextRequest, NextResponse } from 'next/server';
import {
  createOrUpdateAffiliateInStore,
  updateCrmUserInStore,
} from '@/server/platformStore';

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as
      | { domain: 'USER'; userId: string; action: 'TOGGLE_BLOCK' | 'GRANT_PROMO_VIP' }
      | {
          domain: 'AFFILIATE';
          action: 'CREATE_LINK' | 'UPDATE_RATE';
          affiliateId?: string;
          revsharePct?: number;
          code?: string;
          source?: string;
          webmaster?: string;
        };

    if (body.domain === 'USER') {
      return NextResponse.json(updateCrmUserInStore(body.userId, body.action));
    }

    return NextResponse.json(createOrUpdateAffiliateInStore(body));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка операции CRM' },
      { status: 400 },
    );
  }
}
