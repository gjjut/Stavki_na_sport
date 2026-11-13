import { NextRequest, NextResponse } from 'next/server';
import { updateTariffsInStore } from '@/server/platformStore';

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const nextState = updateTariffsInStore(body);
    return NextResponse.json(nextState);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка обновления тарифов' },
      { status: 400 },
    );
  }
}
