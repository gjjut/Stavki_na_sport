import type { ResultStatus, SportType } from './types';

const LINE_PATTERN = String.raw`([+-]?\d+(?:[.,]\d+)?)`;
const EPSILON = 1e-8;

function parseLine(raw: string | undefined): number | null {
  if (!raw) return null;
  const line = Number(raw.replace(',', '.'));
  if (!Number.isFinite(line)) return null;
  // Only ordinary integer/half-point lines can be represented as WIN/LOSS/PUSH.
  // Quarter lines can produce half wins or half losses, which this result model
  // cannot express safely.
  const quarterUnits = line * 4;
  const roundedQuarterUnits = Math.round(quarterUnits);
  if (Math.abs(quarterUnits - roundedQuarterUnits) > EPSILON) return null;
  if (Math.abs(roundedQuarterUnits % 2) === 1) return null;
  return line;
}

function compareOverUnder(total: number, line: number, over: boolean): ResultStatus {
  if (total === line) return 'PUSH';
  const wins = over ? total > line : total < line;
  return wins ? 'WIN' : 'LOSS';
}

function compareHandicap(difference: number, line: number): ResultStatus {
  const adjusted = difference + line;
  if (Math.abs(adjusted) <= EPSILON) return 'PUSH';
  return adjusted > 0 ? 'WIN' : 'LOSS';
}

function matchWinnerSide(market: string): 1 | 2 | null {
  const match = market.match(
    /^(?:(?:победа\s*([12])|п([12]))\s*(?:в матче|с учетом\s+(?:от|overtime|овертайма?|буллитов?))|итоговая победа\s*([12]))$/,
  );
  if (!match) return null;
  return Number(match[1] || match[2] || match[3]) as 1 | 2;
}

function regulationWinnerSide(market: string): 1 | 2 | null {
  const match = market.match(
    /^(?:победа\s*([12])|п([12]))(?:\s*(?:\(\s*основное время\s*\)|в основное время))?$/,
  );
  if (!match) return null;
  return Number(match[1] || match[2]) as 1 | 2;
}

function parseBttsResult(market: string): boolean | null {
  if (!/^(?:обе забьют|обе команды забьют)(?::?\s*(?:да|нет))?$/.test(market)) {
    return null;
  }
  return !market.endsWith('нет');
}

export function evaluateMarketByScore(
  selectionTitle: string,
  homeScore: number,
  awayScore: number,
  isOvertime = false,
  sport?: SportType,
): ResultStatus | null {
  if (
    !Number.isSafeInteger(homeScore) ||
    !Number.isSafeInteger(awayScore) ||
    homeScore < 0 ||
    awayScore < 0
  ) {
    return null;
  }

  const market = selectionTitle.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  if (!market) return null;

  const regulationSport = sport === 'FOOTBALL' || sport === 'HOCKEY';
  const total = homeScore + awayScore;
  const difference = homeScore - awayScore;

  const matchWinner = matchWinnerSide(market);
  if (matchWinner !== null) {
    // A football score with extra time/penalties does not identify the full-time
    // match-winner market; hockey and other sports have a structured final score.
    if ((sport === 'FOOTBALL' && isOvertime) || homeScore === awayScore) return null;
    return (matchWinner === 1 ? homeScore > awayScore : awayScore > homeScore)
      ? 'WIN'
      : 'LOSS';
  }

  const regulationWinner = regulationWinnerSide(market);
  if (regulationWinner !== null) {
    // If a regulation-time sport reached overtime, its regulation score was tied.
    if (regulationSport && isOvertime) return 'LOSS';
    return (regulationWinner === 1 ? homeScore > awayScore : awayScore > homeScore)
      ? 'WIN'
      : 'LOSS';
  }

  if (market === 'ничья' || market === 'x' || market === 'х') {
    if (regulationSport && isOvertime) return 'WIN';
    return homeScore === awayScore ? 'WIN' : 'LOSS';
  }
  if (market === '1x' || market === '1х' || market === 'первая не проиграет') {
    if (regulationSport && isOvertime) return 'WIN';
    return homeScore >= awayScore ? 'WIN' : 'LOSS';
  }
  if (market === 'x2' || market === 'х2' || market === 'вторая не проиграет') {
    if (regulationSport && isOvertime) return 'WIN';
    return awayScore >= homeScore ? 'WIN' : 'LOSS';
  }

  // Support explicitly named both-teams-to-score + total combinations only.
  // Any other compound market falls through as unknown instead of being reduced
  // to one of its components.
  const bttsTotal = market.match(
    /^(обе забьют|обе команды забьют)(?::?\s*(да|нет))?\s*(?:и|\+|&)\s*(?:тотал(?: матча)?\s*)?(больше|меньше|тб|тм)\s*\(?\s*([+-]?\d+(?:[.,]\d+)?)\s*\)?$/,
  );
  if (bttsTotal) {
    const line = parseLine(bttsTotal[4]);
    // Integer Asian totals can push; combined-market settlement rules vary by
    // book, so only unambiguous half-point totals are calculated here.
    if (line === null || Number.isInteger(line) || (regulationSport && isOvertime)) return null;
    const wantsBothToScore = bttsTotal[2] !== 'нет';
    const bttsWins = (homeScore > 0 && awayScore > 0) === wantsBothToScore;
    const over = bttsTotal[3] === 'больше' || bttsTotal[3] === 'тб';
    const totalWins = over ? total > line : total < line;
    return bttsWins && totalWins ? 'WIN' : 'LOSS';
  }

  const bttsResult = parseBttsResult(market);
  if (bttsResult !== null) {
    if (regulationSport && isOvertime) return null;
    return (homeScore > 0 && awayScore > 0) === bttsResult ? 'WIN' : 'LOSS';
  }

  const teamTotal = market.match(
    new RegExp(
      String.raw`^(?:индивидуальный\s+тотал\s*([12])\s*(больше|меньше)|ит([бм])([12]))\s*\(?\s*${LINE_PATTERN}\s*\)?$`,
    ),
  );
  if (teamTotal) {
    const team = Number(teamTotal[1] || teamTotal[4]);
    const direction = teamTotal[2] || (teamTotal[3] === 'б' ? 'больше' : 'меньше');
    const line = parseLine(teamTotal[5]);
    if (line === null || (regulationSport && isOvertime)) return null;
    const score = team === 1 ? homeScore : awayScore;
    return compareOverUnder(score, line, direction === 'больше');
  }

  const totalMarket = market.match(
    new RegExp(
      String.raw`^(?:тотал(?:\s+матча)?\s*(больше|меньше)|т([бм]))\s*\(?\s*${LINE_PATTERN}\s*\)?$`,
    ),
  );
  if (totalMarket) {
    const direction = totalMarket[1] || (totalMarket[2] === 'б' ? 'больше' : 'меньше');
    const line = parseLine(totalMarket[3]);
    if (line === null || (regulationSport && isOvertime)) return null;
    return compareOverUnder(total, line, direction === 'больше');
  }

  const handicap = market.match(
    new RegExp(String.raw`^(?:фора\s*([12])|ф([12]))\s*\(?\s*${LINE_PATTERN}\s*\)?$`),
  );
  if (handicap) {
    const team = Number(handicap[1] || handicap[2]);
    const line = parseLine(handicap[3]);
    if (line === null) return null;
    // Reaching overtime means the regulation score was tied; a regulation
    // handicap remains calculable from that fact, without using the OT score.
    const regulationDifference = regulationSport && isOvertime ? 0 : difference;
    return compareHandicap(team === 1 ? regulationDifference : -regulationDifference, line);
  }

  return null;
}
