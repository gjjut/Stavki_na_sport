import { NextRequest, NextResponse } from 'next/server';
import { processAdminAiChatTurn } from '@/server/ai-admin-chat';
import { mutateState, readState } from '@/server/database';
import { requireAdminAccount } from '@/server/guards';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdminAccount();
    const state = await readState();
    return NextResponse.json({ messages: state.aiChatMessages });
  } catch {
    return NextResponse.json(
      { error: 'Доступ только для администратора' },
      { status: 403 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminAccount();
    const body = (await req.json()) as { message?: string };
    const result = await processAdminAiChatTurn(body.message || '');
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Ошибка ответа ИИ-управляющего',
      },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  try {
    await requireAdminAccount();
    await mutateState((state) => {
      state.aiChatMessages = [];
    });
    return NextResponse.json({ ok: true, messages: [] });
  } catch {
    return NextResponse.json(
      { error: 'Не удалось очистить историю диалога' },
      { status: 400 },
    );
  }
}
