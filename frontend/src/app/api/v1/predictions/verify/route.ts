import { NextRequest, NextResponse } from 'next/server';
import { verifyPredictionHashProof } from '@/server/platformStore';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { predictionId: string };
    const proof = verifyPredictionHashProof(body.predictionId);
    return NextResponse.json(proof);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ошибка верификации хеша' },
      { status: 400 },
    );
  }
}
