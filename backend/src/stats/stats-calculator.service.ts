import { Injectable } from '@nestjs/common';

export interface SettledBetRow {
  settledAt: Date;
  stakeUnits: number;
  stakePercent: number;
  fixedOdds: number;
  resultStatus: 'WIN' | 'LOSS' | 'PUSH' | 'CASHOUT';
  profitUnits: number;
  profitPercent: number;
}

export interface ComputedStatsMetrics {
  settledBetsCount: number;
  winsCount: number;
  lossesCount: number;
  pushesCount: number;
  cashoutsCount: number;
  winRatePct: number;
  avgOdds: number;
  turnoverUnits: number;
  netProfitUnits: number;
  yieldPct: number;
  roiBankrollPct: number;
  currentWinStreak: number;
  bestWinStreak: number;
  maxDrawdownPct: number;
}

/**
 * Сервис строгого математического расчета беттинг-статистики для таблицы `statistics_snapshots`
 * и точек графика `equity_curve_points` (без погрешностей округления).
 */
@Injectable()
export class StatsCalculatorService {
  computeSnapshot(rowsChronological: SettledBetRow[]): ComputedStatsMetrics {
    let wins = 0;
    let losses = 0;
    let pushes = 0;
    let cashouts = 0;

    let turnoverUnits = 0;
    let netProfitUnits = 0;
    let roiBankrollPct = 0;
    let oddsSum = 0;

    let currentStreak = 0;
    let bestStreak = 0;

    // Расчет максимальной просадки (Peak-to-Trough Drawdown) от индекса банка 100%
    let runningBankPct = 100;
    let peakBankPct = 100;
    let maxDrawdownPct = 0;

    for (const row of rowsChronological) {
      turnoverUnits += row.stakeUnits;
      netProfitUnits += row.profitUnits;
      roiBankrollPct += row.profitPercent;
      oddsSum += row.fixedOdds;

      if (row.resultStatus === 'WIN') {
        wins += 1;
        currentStreak += 1;
        if (currentStreak > bestStreak) bestStreak = currentStreak;
      } else if (row.resultStatus === 'LOSS') {
        losses += 1;
        currentStreak = 0;
      } else if (row.resultStatus === 'PUSH') {
        pushes += 1;
        // Возврат (Push) не прерывает победную серию, но и не увеличивает её
      } else if (row.resultStatus === 'CASHOUT') {
        cashouts += 1;
        if (row.profitUnits < 0) currentStreak = 0;
      }

      runningBankPct += row.profitPercent;
      if (runningBankPct > peakBankPct) {
        peakBankPct = runningBankPct;
      }
      const drawdown = peakBankPct - runningBankPct;
      if (drawdown > maxDrawdownPct) {
        maxDrawdownPct = drawdown;
      }
    }

    const total = rowsChronological.length;
    const decisiveCount = wins + losses;
    const winRatePct = decisiveCount > 0 ? (wins / decisiveCount) * 100 : 0;
    const avgOdds = total > 0 ? oddsSum / total : 0;
    const yieldPct = turnoverUnits > 0 ? (netProfitUnits / turnoverUnits) * 100 : 0;

    return {
      settledBetsCount: total,
      winsCount: wins,
      lossesCount: losses,
      pushesCount: pushes,
      cashoutsCount: cashouts,
      winRatePct: Number(winRatePct.toFixed(2)),
      avgOdds: Number(avgOdds.toFixed(3)),
      turnoverUnits: Number(turnoverUnits.toFixed(3)),
      netProfitUnits: Number(netProfitUnits.toFixed(3)),
      yieldPct: Number(yieldPct.toFixed(2)),
      roiBankrollPct: Number(roiBankrollPct.toFixed(2)),
      currentWinStreak: currentStreak,
      bestWinStreak: bestStreak,
      maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
    };
  }
}
