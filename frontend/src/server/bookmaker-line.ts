export interface VerifiedBookmakerQuote {
  externalFixtureId: string;
  sport: string;
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
  matchStartsAt: string;
  bookmakerSource: string;
  suggestedMarket: string;
  suggestedOdds: number;
}

function normalizeTeamName(value: string): string {
  return value.trim().toLocaleLowerCase('ru-RU');
}

/**
 * Fail-closed comparison used immediately before publishing a selected quote.
 * Odds are compared at the same two-decimal precision persisted by the line
 * scanners; invalid prices or timestamps can never count as a match.
 */
export function hasSameVerifiedBookmakerQuote(
  expected: VerifiedBookmakerQuote,
  current: VerifiedBookmakerQuote,
): boolean {
  const expectedStart = Date.parse(expected.matchStartsAt);
  const currentStart = Date.parse(current.matchStartsAt);
  if (
    !expected.externalFixtureId.trim() ||
    !current.externalFixtureId.trim() ||
    !expected.bookmakerSource.trim() ||
    !current.bookmakerSource.trim() ||
    !expected.suggestedMarket.trim() ||
    !current.suggestedMarket.trim() ||
    !Number.isFinite(expectedStart) ||
    !Number.isFinite(currentStart) ||
    !Number.isFinite(expected.suggestedOdds) ||
    !Number.isFinite(current.suggestedOdds) ||
    expected.suggestedOdds <= 1 ||
    current.suggestedOdds <= 1
  ) {
    return false;
  }

  return (
    expected.externalFixtureId === current.externalFixtureId &&
    expected.sport === current.sport &&
    expected.leagueName === current.leagueName &&
    normalizeTeamName(expected.homeTeam) === normalizeTeamName(current.homeTeam) &&
    normalizeTeamName(expected.awayTeam) === normalizeTeamName(current.awayTeam) &&
    expectedStart === currentStart &&
    expected.bookmakerSource === current.bookmakerSource &&
    expected.suggestedMarket === current.suggestedMarket &&
    expected.suggestedOdds.toFixed(2) === current.suggestedOdds.toFixed(2)
  );
}
