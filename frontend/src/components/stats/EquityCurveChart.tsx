'use client';

import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, TrendingUp } from 'lucide-react';
import type { EquityPoint } from '@/data/mockPlatformData';

export interface EquityCurveChartProps {
  points: EquityPoint[];
}

export const EquityCurveChart: React.FC<EquityCurveChartProps> = ({ points }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number>(points.length - 1);

  const chartGeometry = useMemo(() => {
    const width = 820;
    const height = 270;
    const padX = 44;
    const padY = 26;

    const values = points.map((p) => p.cumulativeBankPct);
    const minVal = Math.min(98, ...values);
    const maxVal = Math.max(190, ...values);
    const span = Math.max(1, maxVal - minVal);

    const coords = points.map((pt, idx) => {
      const x =
        padX + (idx / Math.max(1, points.length - 1)) * (width - padX * 2);
      const y =
        height - padY - ((pt.cumulativeBankPct - minVal) / span) * (height - padY * 2);
      return { ...pt, x, y };
    });

    const linePath = coords
      .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(' ');

    const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(
      height - padY
    ).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(height - padY).toFixed(1)} Z`;

    return { width, height, padX, padY, minVal, maxVal, coords, linePath, areaPath };
  }, [points]);

  const activePoint = chartGeometry.coords[hoveredIdx] ?? chartGeometry.coords[0];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>Equity Curve · Верифицированная кривая роста банка</span>
          </div>
          <h3 className="mt-1 text-xl font-bold text-white">
            Динамика прироста банка по месяцам (старт = 100.0%)
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">
            Строгий Флэт 1–3% на ставку. Включая реальные просадочные отрезки без удаления минусов.
          </p>
        </div>

        {activePoint && (
          <div className="flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5">
            <div>
              <div className="text-[11px] text-slate-400">Месяц ({activePoint.month})</div>
              <div
                className={`font-mono text-sm font-bold ${
                  activePoint.profitUnits >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {activePoint.profitUnits >= 0 ? '+' : ''}
                {activePoint.profitUnits.toFixed(2)} u (Yield {activePoint.yieldPct >= 0 ? '+' : ''}
                {activePoint.yieldPct.toFixed(1)}%)
              </div>
            </div>
            <div className="border-l border-slate-800 pl-4">
              <div className="text-[11px] text-slate-400">Индекс банка</div>
              <div className="font-mono text-base font-extrabold text-white">
                {activePoint.cumulativeBankPct.toFixed(1)}%
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SVG-график */}
      <div className="mt-5 overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
          className="h-64 w-full min-w-[620px] select-none"
        >
          <defs>
            <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.34" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Горизонтальные линии сетки */}
          {[100, 125, 150, 175].map((gridVal) => {
            const y =
              chartGeometry.height -
              chartGeometry.padY -
              ((gridVal - chartGeometry.minVal) /
                (chartGeometry.maxVal - chartGeometry.minVal)) *
                (chartGeometry.height - chartGeometry.padY * 2);
            return (
              <g key={gridVal}>
                <line
                  x1={chartGeometry.padX}
                  x2={chartGeometry.width - chartGeometry.padX}
                  y1={y}
                  y2={y}
                  stroke="#1e293b"
                  strokeDasharray="4 4"
                />
                <text
                  x={8}
                  y={y + 4}
                  fill="#64748b"
                  fontSize="11"
                  fontFamily="monospace"
                >
                  {gridVal}%
                </text>
              </g>
            );
          })}

          <path d={chartGeometry.areaPath} fill="url(#equityFill)" />

          <motion.path
            d={chartGeometry.linePath}
            fill="none"
            stroke="#10b981"
            strokeWidth="3"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          />

          {/* Точки по месяцам */}
          {chartGeometry.coords.map((pt, idx) => {
            const isActive = idx === hoveredIdx;
            const isNegativeMonth = pt.profitUnits < 0;
            return (
              <g
                key={pt.month}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIdx(idx)}
                onClick={() => setHoveredIdx(idx)}
              >
                <circle cx={pt.x} cy={pt.y} r={14} fill="transparent" />
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isActive ? 6 : 4}
                  fill={isNegativeMonth ? '#fb7185' : '#10b981'}
                  stroke="#020617"
                  strokeWidth="2"
                />
                <text
                  x={pt.x}
                  y={chartGeometry.height - 6}
                  textAnchor="middle"
                  fill={isActive ? '#e2e8f0' : '#64748b'}
                  fontSize="11"
                  fontWeight={isActive ? '700' : '500'}
                >
                  {pt.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3 text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span>
            Каждая точка графика строится строго из закрытых прогнозов с зафиксированным до матча SHA-256 хешем
          </span>
        </div>
        <span className="font-mono text-emerald-300">
          Суммарно: +84.60 u (+84.6% к начальному банку)
        </span>
      </div>
    </div>
  );
};
