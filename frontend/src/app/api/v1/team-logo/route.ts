import { NextRequest, NextResponse } from 'next/server';
import { resolveTeamLogoResponse } from '@/server/team-logos';
import type { SportType } from '@/server/types';

export const dynamic = 'force-dynamic';

const VALID_SPORTS = new Set<SportType>([
  'FOOTBALL',
  'HOCKEY',
  'TENNIS',
  'BASKETBALL',
  'ESPORTS',
  'MMA',
]);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const team = (searchParams.get('team') || 'Team').trim();
  const rawSport = (searchParams.get('sport') || '').toUpperCase() as SportType;
  const sport = VALID_SPORTS.has(rawSport) ? rawSport : undefined;
  const directUrl = searchParams.get('url');
  const enName = searchParams.get('en');

  const resolved = await resolveTeamLogoResponse({
    teamName: team,
    sport,
    directUrl,
    enName,
  });

  if (!resolved.isOfficialBinary) {
    // Нет подтверждённой эмблемы Фонбет — отдаём 404, чтобы TeamAvatar показал монограмму,
    // а не выдуманный/сгенерированный герб.
    return new NextResponse(null, {
      status: 404,
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  }

  const payload =
    typeof resolved.body === 'string'
      ? resolved.body
      : new Uint8Array(resolved.body);

  return new NextResponse(payload, {
    status: 200,
    headers: {
      'Content-Type': resolved.contentType,
      'Cache-Control': resolved.isOfficialBinary
        ? 'public, max-age=604800, stale-while-revalidate=2592000'
        : 'public, max-age=300, stale-while-revalidate=1800',
    },
  });
}
