import { NextRequest, NextResponse } from 'next/server';
import {
  createPredictionInStore,
  settlePredictionInStore,
} from '@/server/platformStore';
import type { PredictionResultStatus } from '@/components/predictions/PredictionCard';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const nextState = await createPredictionInStore(body);
    return NextResponse.json(nextState);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка создания прогноза' },
      { status: 400 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      predictionId: string;
      resultStatus: Exclude<PredictionResultStatus, 'PENDING'>;
      cashoutMultiplier?: number;
      finalScore?: string;
    };
    const nextState = await settlePredictionInStore(
      body.predictionId,
      body.resultStatus,
      body.cashoutMultiplier,
      body.finalScore,
    );
    return NextResponse.json(nextState);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка расчета прогноза' },
      { status: 400 },
    );
  }
}
