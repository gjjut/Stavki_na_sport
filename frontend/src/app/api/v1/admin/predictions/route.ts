import { NextRequest, NextResponse } from 'next/server';
import {
  createPredictionByAdmin,
  mutateState,
  settlePredictionByAdmin,
} from '@/server/database';
import { requireAdminAccount } from '@/server/guards';
import type { MatchStatus, ResultStatus } from '@/server/types';

export async function POST(req: NextRequest) {
  try {
    await requireAdminAccount();
    const body = await req.json();
    const created = await createPredictionByAdmin(body);
    return NextResponse.json({ prediction: created });
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Доступ запрещен' }, { status: 403 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка создания прогноза' },
      { status: 400 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdminAccount();
    const body = (await req.json()) as {
      predictionId: string;
      setFeatured?: boolean;
      singlePriceRub?: number;
      resultStatus?: ResultStatus;
      matchStatus?: MatchStatus;
      finalScore?: string | null;
      cashoutMultiplier?: number | null;
    };

    if (body.setFeatured) {
      const updated = await mutateState((state) => {
        for (const p of state.predictions) {
          p.isFeatured = p.id === body.predictionId;
        }
        return state.predictions.find((p) => p.id === body.predictionId);
      });
      return NextResponse.json({ prediction: updated });
    }

    if (typeof body.singlePriceRub === 'number' && !body.resultStatus) {
      const updated = await mutateState((state) => {
        const pred = state.predictions.find((p) => p.id === body.predictionId);
        if (!pred) throw new Error('Событие не найдено');
        if (body.singlePriceRub! <= 0) {
          pred.accessTier = 'FREE';
          pred.singlePriceRub = null;
        } else {
          pred.accessTier = 'PAID_SINGLE';
          pred.singlePriceRub = Math.round(body.singlePriceRub!);
        }
        return pred;
      });
      return NextResponse.json({ prediction: updated });
    }

    if (body.matchStatus && !body.resultStatus) {
      const updated = await mutateState((state) => {
        const pred = state.predictions.find((p) => p.id === body.predictionId);
        if (!pred) throw new Error('Событие не найдено');
        pred.matchStatus = body.matchStatus!;
        if (body.finalScore !== undefined) pred.finalScore = body.finalScore;
        return pred;
      });
      return NextResponse.json({ prediction: updated });
    }

    const settled = await settlePredictionByAdmin({
      predictionId: body.predictionId,
      resultStatus: body.resultStatus ?? 'PENDING',
      finalScore: body.finalScore,
      cashoutMultiplier: body.cashoutMultiplier,
    });
    return NextResponse.json({ prediction: settled });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка обновления прогноза' },
      { status: 400 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAdminAccount();
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Не указан ID события' }, { status: 400 });
    }
    await mutateState((state) => {
      state.predictions = state.predictions.filter((p) => p.id !== id);
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка удаления события' },
      { status: 400 },
    );
  }
}
