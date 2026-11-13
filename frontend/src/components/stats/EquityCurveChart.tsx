'use client';

import React, { useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import type { EquityPoint } from '@/server/types';

interface EquityCurveChartProps {
  points: EquityPoint[];
}

export const EquityCurveChart: React.FC<EquityCurveChartProps> = ({ points }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const width = 760;
  const height = 250;
  const padX = 48;
  const padY = 26;

  const { pathD, areaD, coords, minVal, maxVal } = useMemo(() => {
    if (!points.length) {
      return { pathD: '', areaD: '', coords: [], minVal: 95, maxVal: 115 };
    }
    const vals = points.map((p) => p.cumulativeBankPct);
    const min = Math.min(96, ...vals) - 2;
    const max = Math.max(108, ...vals) + 3;
    const span = max - min || 1;

    const plotW = width - padX * 2;
    const plotH = height - padY * 2;

    const mapped = points.map((p, idx) => {
      const x =
        points.length === 1
          ? padX + plotW / 2
          : padX + (idx / (points.length - 1)) * plotW;
      const y = padY + plotH - ((p.cumulativeBankPct - min) / span) * plotH;
      return { x, y, point: p };
    });

    const line = mapped
      .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(' ');

    const baseY = padY + plotH;
    const area = `${line} L ${mapped[mapped.length - 1].x.toFixed(1)} ${baseY.toFixed(
      1,
    )} L ${mapped[0].x.toFixed(1)} ${baseY.toFixed(1)} Z`;

    return { pathD: line, areaD: area, coords: mapped, minVal: min, maxVal: max };
  }, [points]);

  const activePoint =
    hoveredIdx !== null && coords[hoveredIdx]
      ? coords[hoveredIdx]
      : coords[coords.length - 1];

  return (
    <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-[0_2px_12px_rgba(15,23,42,0.03)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-600">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>График роста банка (Equity Curve)</span>
          </div>
          <h3 className="mt-1 text-lg font-extrabold text-slate-950">
            Накопительная доходность по всем рассчитанным событиям
          </h3>
        </div>

        {activePoint && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-right">
            <div className="text-[11px] font-medium text-slate-500">
              {activePoint.point.label} · событий: {activePoint.point.betsCount}
            </div>
            <div className="font-mono text-sm font-black text-blue-600">
              Банк: {activePoint.point.cumulativeBankPct.toFixed(2)}% (
              {activePoint.point.profitUnits >= 0 ? '+' : ''}
              {activePoint.point.profitUnits.toFixed(2)} u)
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-56 w-full min-w-[520px] select-none overflow-visible"
        >
          <defs>
            <linearGradient id="equityFillCobalt" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563EB" stopOpacity="0.20" />
              <stop offset="100%" stopColor="#2563EB" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = padY + (height - padY * 2) * t;
            const val = maxVal - (maxVal - minVal) * t;
            return (
              <g key={t}>
                <line
                  x1={padX}
                  y1={y}
                  x2={width - padX}
                  y2={y}
                  stroke="#E2E8F0"
                  strokeDasharray="4 4"
                />
                <text
                  x={4}
                  y={y + 4}
                  fill="#64748B"
                  fontSize="11"
                  fontFamily="monospace"
                >
                  {val.toFixed(0)}%
                </text>
              </g>
            );
          })}

          {areaD && <path d={areaD} fill="url(#equityFillCobalt)" />}
          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke="#2563EB"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {coords.map((c, idx) => {
            const isWin = c.point.profitUnits >= 0;
            const isActive = hoveredIdx === idx;
            return (
              <g
                key={`${c.point.month}-${idx}`}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                <circle cx={c.x} cy={c.y} r={12} fill="transparent" />
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={isActive ? 6.5 : 4.5}
                  fill={isWin ? '#2563EB' : '#E11D48'}
                  stroke="#FFFFFF"
                  strokeWidth="2.5"
                />
                <text
                  x={c.x}
                  y={height - 4}
                  textAnchor="middle"
                  fill="#64748B"
                  fontSize="10.5"
                >
                  {c.point.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
