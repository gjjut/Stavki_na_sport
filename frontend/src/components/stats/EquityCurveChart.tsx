'use client';

import React, { useMemo, useState } from 'react';
import type { EquityPoint } from '@/server/types';

interface EquityCurveChartProps {
  points: EquityPoint[];
}

export const EquityCurveChart: React.FC<EquityCurveChartProps> = ({ points }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const width = 640;
  const height = 220;
  const padLeft = 44;
  const padRight = 20;
  const padY = 24;

  const { pathD, areaD, coords, minVal, maxVal } = useMemo(() => {
    if (!points.length) {
      return { pathD: '', areaD: '', coords: [], minVal: 95, maxVal: 115 };
    }
    const vals = points.map((p) => p.cumulativeBankPct);
    const min = Math.min(96, ...vals) - 2;
    const max = Math.max(108, ...vals) + 3;
    const span = max - min || 1;

    const plotW = width - padLeft - padRight;
    const plotH = height - padY * 2;

    const mapped = points.map((p, idx) => {
      const x =
        points.length === 1
          ? padLeft + plotW / 2
          : padLeft + (idx / (points.length - 1)) * plotW;
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
    <div>
      {activePoint && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs">
          <div className="font-semibold text-slate-700">
            {activePoint.point.label}{' '}
            <span className="text-slate-400">
              · матчей: {activePoint.point.betsCount}
            </span>
          </div>
          <div className="font-mono font-black text-blue-600">
            За месяц: {activePoint.point.profitUnits >= 0 ? '+' : ''}
            {activePoint.point.profitUnits.toFixed(1)}% · Банк:{' '}
            {activePoint.point.cumulativeBankPct.toFixed(1)}%
          </div>
        </div>
      )}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-44 w-full select-none overflow-visible sm:h-52"
      >
        <defs>
          <linearGradient id="equityFillCobalt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563EB" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#2563EB" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padY + (height - padY * 2) * t;
          const val = maxVal - (maxVal - minVal) * t;
          return (
            <g key={t}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="#E2E8F0"
                strokeDasharray="4 4"
              />
              <text
                x={0}
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
            strokeWidth="3"
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
              onClick={() => setHoveredIdx(idx)}
            >
              <circle cx={c.x} cy={c.y} r={14} fill="transparent" />
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
                y={height - 2}
                textAnchor="middle"
                fill="#64748B"
                fontSize="11"
              >
                {c.point.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
