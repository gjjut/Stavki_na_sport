import { NextRequest, NextResponse } from 'next/server';
import {
  computeCanonicalSha256,
  readState,
  toPublicPredictionDto,
} from '@/server/database';
import { getOptionalViewer } from '@/server/guards';

export async function POST(req: NextRequest) {
  try {
    const { predictionId } = (await req.json()) as { predictionId: string };
    const [state, viewer] = await Promise.all([readState(), getOptionalViewer()]);
    const record = state.predictions.find((p) => p.id === predictionId);
    if (!record) {
      return NextResponse.json({ error: 'Прогноз не найден' }, { status: 404 });
    }

    const dto = toPublicPredictionDto(record, viewer);
    if (dto.isLocked) {
      return NextResponse.json(
        {
          error:
            'Полная строка проверки открывается после завершения матча или покупки прогноза, чтобы исключить подбор исхода до начала встречи.',
        },
        { status: 403 },
      );
    }

    const { canonical, sha256 } = computeCanonicalSha256({
      matchStartsAt: record.matchStartsAt,
      selectionTitle: record.selectionTitle,
      fixedOdds: record.fixedOdds,
      stakeUnits: record.stakeUnits,
    });

    return NextResponse.json({
      predictionId: record.id,
      matchLabel: `${record.homeTeam} — ${record.awayTeam}`,
      oddsLockedAt: record.oddsLockedAt,
      canonicalPayload: canonical,
      storedHash: record.verificationHash,
      recomputedHash: sha256,
      isAuthentic: sha256 === record.verificationHash,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка проверки хеша' },
      { status: 400 },
    );
  }
}
