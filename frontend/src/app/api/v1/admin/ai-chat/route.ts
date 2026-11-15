import { NextRequest, NextResponse } from 'next/server';
import { processAdminAiChatTurn } from '@/server/ai-admin-chat';
import { mutateState, readState, StorageUnavailableError } from '@/server/database';
import { requireAdminAccount } from '@/server/guards';

export const dynamic = 'force-dynamic';

function chatError(err: unknown, fallback: string) {
  if (err instanceof StorageUnavailableError) return NextResponse.json({ error: err.message }, { status: 503 });
  const code = err instanceof Error ? err.message : '';
  if (code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Войдите как администратор.' }, { status: 401 });
  if (code === 'BLOCKED' || code === 'FORBIDDEN') return NextResponse.json({ error: 'Доступ только для администратора.' }, { status: 403 });
  return NextResponse.json({ error: code || fallback }, { status: 400 });
}

export async function GET() {
  try {
    await requireAdminAccount();
    const state = await readState();
    return NextResponse.json({ messages: state.aiChatMessages });
  } catch (err) {
    return chatError(err, 'Не удалось загрузить историю чата');
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminAccount();
    const body = (await req.json()) as { message?: unknown };
    if (typeof body.message !== 'string') throw new Error('Введите сообщение для ИИ-управляющего');
    const result = await processAdminAiChatTurn(body.message);
    return NextResponse.json(result);
  } catch (err) {
    return chatError(err, 'Ошибка ответа ИИ-управляющего');
  }
}

export async function DELETE() {
  try {
    await requireAdminAccount();
    await mutateState((state) => { state.aiChatMessages = []; });
    return NextResponse.json({ ok: true, messages: [] });
  } catch (err) {
    return chatError(err, 'Не удалось очистить историю диалога');
  }
}
