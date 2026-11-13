import { NextRequest, NextResponse } from 'next/server';
import { updateViewerSettingsInStore } from '@/server/platformStore';

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      referenceBankrollRub?: number;
      cancelAutoRenew?: boolean;
      topupBalanceRub?: number;
      bindRefCode?: string;
    };
    const nextState = updateViewerSettingsInStore(body);
    return NextResponse.json(nextState);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка обновления профиля' },
      { status: 400 },
    );
  }
}
