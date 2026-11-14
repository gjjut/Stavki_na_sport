import { NextRequest, NextResponse } from 'next/server';
import {
  createPredictionByAdmin,
  mutateState,
  settlePredictionByAdmin,
} from '@/server/database';
import { requireAdminAccount } from '@/server/guards';
import { assertInsuranceChangeAllowed, deleteUnownedPrediction } from '@/server/admin-prediction-policy';
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
      editMeta?: {
        singlePriceRub?: number;
        insuredOnLoss?: boolean;
        analysisTeaser?: string;
        analysisFull?: string;
      };
      resultStatus?: ResultStatus;
      matchStatus?: MatchStatus;
      finalScore?: string | null;
      cashoutMultiplier?: number | null;
    };

    if (body.setFeatured) {
      const updated = await mutateState((state) => {
        const selected = state.predictions.find((p) => p.id === body.predictionId);
        if (!selected) throw new Error('Событие не найдено');
        for (const p of state.predictions) {
          p.isFeatured = p.id === body.predictionId;
        }
        return selected;
      });
      return NextResponse.json({ prediction: updated });
    }

    if (body.editMeta) {
      const updated = await mutateState((state) => {
        const pred = state.predictions.find((p) => p.id === body.predictionId);
        if (!pred) throw new Error('Событие не найдено');
        const requestedPrice = body.editMeta!.singlePriceRub;
        const nextTier = typeof requestedPrice === 'number'
          ? requestedPrice <= 0 ? 'FREE' : 'PAID_SINGLE'
          : pred.accessTier;
        const nextInsured = typeof requestedPrice === 'number' && requestedPrice <= 0
          ? false
          : typeof body.editMeta!.insuredOnLoss === 'boolean'
            ? nextTier === 'PAID_SINGLE' && body.editMeta!.insuredOnLoss
            : Boolean(pred.insuredOnLoss);
        assertInsuranceChangeAllowed(state, pred, nextInsured);
        if (typeof body.editMeta!.singlePriceRub === 'number') {
          if (body.editMeta!.singlePriceRub <= 0) {
            pred.accessTier = 'FREE';
            pred.singlePriceRub = null;
            pred.insuredOnLoss = false;
          } else {
            pred.accessTier = 'PAID_SINGLE';
            pred.singlePriceRub = Math.round(body.editMeta!.singlePriceRub);
          }
        }
        if (typeof body.editMeta!.insuredOnLoss === 'boolean') {
          pred.insuredOnLoss = pred.accessTier === 'PAID_SINGLE' && body.editMeta!.insuredOnLoss;
        }
        if (typeof body.editMeta!.analysisTeaser === 'string' && body.editMeta!.analysisTeaser.trim()) {
          pred.analysisTeaser = body.editMeta!.analysisTeaser.trim();
        }
        if (typeof body.editMeta!.analysisFull === 'string' && body.editMeta!.analysisFull.trim()) {
          pred.analysisFull = body.editMeta!.analysisFull.trim();
        }
        return pred;
      });
      return NextResponse.json({ prediction: updated });
    }

    if (body.matchStatus && !body.resultStatus) {
      const updated = await mutateState((state) => {
        const pred = state.predictions.find((p) => p.id === body.predictionId);
        if (!pred) throw new Error('Событие не найдено');
        const previousLifecycle = pred.matchLifecycleStatus;
        pred.matchStatus = body.matchStatus!;
        pred.matchLifecycleStatus =
          body.matchStatus === 'LIVE'
            ? 'LIVE'
            : body.matchStatus === 'FINISHED'
              ? 'FINISHED'
              : 'SCHEDULED';
        const verifiedAt = new Date().toISOString();
        pred.matchVerifiedAt = verifiedAt;
        pred.matchVerificationSource = 'Ручная отметка администратора';
        pred.finalScoreVerified = false;
        pred.finalScoreVerifiedSources = [];
        pred.liveHomeScore = null;
        pred.liveAwayScore = null;
        pred.finalScoreIsOvertime = false;
        if (body.matchStatus === 'UPCOMING') {
          pred.actualStartedAt = null;
          pred.actualStartedAtPrecision = null;
          pred.actualFinishedAt = null;
          pred.actualFinishedAtPrecision = null;
        }
        if (body.matchStatus === 'LIVE') {
          if (
            previousLifecycle === 'FINISHED' ||
            previousLifecycle === 'POSTPONED' ||
            previousLifecycle === 'CANCELLED'
          ) {
            pred.actualStartedAt = null;
            pred.actualStartedAtPrecision = null;
          }
          pred.actualFinishedAt = null;
          pred.actualFinishedAtPrecision = null;
          if (!pred.actualStartedAt) {
            pred.actualStartedAt = verifiedAt;
            pred.actualStartedAtPrecision = 'LIVE_OBSERVED';
          }
        }
        if (
          body.matchStatus === 'FINISHED' &&
          pred.actualFinishedAtPrecision === 'FINAL_OBSERVED'
        ) {
          // This is an admin verification time, not a source-reported actual finish time.
          pred.actualFinishedAt = null;
          pred.actualFinishedAtPrecision = null;
        }
        if (body.finalScore !== undefined) pred.finalScore = body.finalScore;
        return pred;
      });
      return NextResponse.json({ prediction: updated });
    }

    const res = await settlePredictionByAdmin({
      predictionId: body.predictionId,
      resultStatus: body.resultStatus ?? 'PENDING',
      finalScore: body.finalScore,
      cashoutMultiplier: body.cashoutMultiplier,
    });
    return NextResponse.json(res);
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
      deleteUnownedPrediction(state, id);
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка удаления события' },
      { status: 400 },
    );
  }
}
