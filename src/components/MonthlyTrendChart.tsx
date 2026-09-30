import React, { useMemo } from 'react';

export interface TrendMonth {
  month: string;
  exportT: number;
  importT: number;
  exportUsd: number;
  importUsd: number;
  trucks: number;
}

interface MonthlyTrendChartProps {
  data: TrendMonth[];
  height?: number;
}

const W = 460;

/** نمودار ترکیبی با پوستهٔ KEMETRA: خط سبز امضایی (صادرات)، آبی (واردات)، ستون کهربایی نازک (کامیون خبری) */
export const MonthlyTrendChart: React.FC<MonthlyTrendChartProps> = ({ data, height = 170 }) => {
  const pad = { top: 14, right: 8, bottom: 24, left: 8 };
  const innerW = W - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const { exportPath, importPath, truckBars, maxT, maxTrucks, points, areaPath } = useMemo(() => {
    const maxT = Math.max(1, ...data.map((d) => Math.max(d.exportT, d.importT)));
    const maxTrucks = Math.max(1, ...data.map((d) => d.trucks));
    const n = data.length;
    const x = (i: number) => pad.left + (n === 1 ? innerW / 2 : (i * innerW) / (n - 1));
    const y = (v: number) => pad.top + innerH - (v / maxT) * innerH;
    const line = (key: 'exportT' | 'importT') =>
      data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ');
    const exp = line('exportT');
    // ناحیهٔ زیر خط صادرات با گرادیان سبز (سبک Vehicle Count در KEMETRA)
    const area =
      n > 1
        ? `${exp} L${x(n - 1).toFixed(1)},${(pad.top + innerH).toFixed(1)} L${x(0).toFixed(1)},${(pad.top + innerH).toFixed(1)} Z`
        : '';
    const barW = Math.max(4, Math.min(16, innerW / Math.max(n, 1) / 3));
    const trucks = data.map((d, i) => {
      const h = (d.trucks / maxTrucks) * innerH;
      return { x: x(i) - barW / 2, y: pad.top + innerH - h, h, w: barW, v: d.trucks, month: d.month };
    });
    const pts = data.map((d, i) => ({ i, x: x(i), exportY: y(d.exportT), importY: y(d.importT), ...d }));
    return { exportPath: exp, importPath: line('importT'), truckBars: trucks, maxT, maxTrucks, points: pts, areaPath: area };
  }, [data, innerH, innerW, pad.left, pad.top]);

  if (data.length === 0) {
    return (
      <div className="text-[10px] text-slate-500 text-center py-6">
        دادهٔ ماهانهٔ کافی برای رسم روند این گذرگاه در دسترس نیست.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label="نمودار روند ماهانه">
        <defs>
          {/* گرادیان سبز امضایی کامند رود برای ناحیهٔ زیر صادرات */}
          <linearGradient id="kemetra-green-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(116,162,30,0.28)" />
            <stop offset="100%" stopColor="rgba(116,162,30,0.02)" />
          </linearGradient>
        </defs>
        {/* خطوط راهنما */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={pad.left}
            x2={W - pad.right}
            y1={pad.top + innerH * f}
            y2={pad.top + innerH * f}
            stroke="rgba(23,37,27,0.08)"
            strokeDasharray="3 4"
          />
        ))}
        {/* ستون کامیون (اخبار) */}
        {truckBars.map((b) =>
          b.h > 1 ? (
            <rect
              key={`t-${b.month}`}
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              rx={2}
              fill="rgba(180,83,9,0.18)"
              stroke="rgba(180,83,9,0.45)"
              strokeWidth={1}
            >
              <title>{`${b.month}: ${b.v} کامیون (خبری)`}</title>
            </rect>
          ) : null
        )}
        {/* ناحیهٔ گرادیانی زیر خط صادرات */}
        {areaPath && <path d={areaPath} fill="url(#kemetra-green-area)" stroke="none" />}
        {/* خط تناژ واردات */}
        <path d={importPath} fill="none" stroke="#0369a1" strokeWidth={2} strokeLinecap="round" opacity={0.85}>
          <title>واردات (تن)</title>
        </path>
        {/* خط تناژ صادرات — سبز امضایی */}
        <path d={exportPath} fill="none" stroke="#74a21e" strokeWidth={2.4} strokeLinecap="round">
          <title>صادرات (تن)</title>
        </path>
        {/* نقاط و برچسب */}
        {points.map((p) => (
          <g key={p.i}>
            <circle cx={p.x} cy={p.exportY} r={3} fill="#74a21e" stroke="#fff" strokeWidth={1}>
              <title>{`${p.month} — صادرات: ${Math.round(p.exportT).toLocaleString('fa-IR')} تن`}</title>
            </circle>
            <circle cx={p.x} cy={p.importY} r={3} fill="#0369a1" stroke="#fff" strokeWidth={1}>
              <title>{`${p.month} — واردات: ${Math.round(p.importT).toLocaleString('fa-IR')} تن`}</title>
            </circle>
          </g>
        ))}
        {/* برچسب ماه‌ها (حداکثر ۸) */}
        {points.map((p, idx) =>
          points.length <= 8 || idx % Math.ceil(points.length / 8) === 0 ? (
            <text
              key={`m-${p.i}`}
              x={p.x}
              y={height - 8}
              textAnchor="middle"
              fontSize={8.5}
              fill="rgba(109,122,111,0.9)"
            >
              {p.month.slice(2)}
            </text>
          ) : null
        )}
      </svg>
      <div className="flex items-center gap-4 text-[9px] text-slate-400 px-1">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-[2px] bg-[var(--cmd-green)] rounded" /> صادرات (تن، سقف{' '}
          {Math.round(maxT).toLocaleString('fa-IR')})
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-[2px] bg-[var(--tone-sky)] rounded" /> واردات
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[var(--tone-amber)]/25 border border-[var(--tone-amber)]/50" />{' '}
          کامیون خبری (سقف {maxTrucks.toLocaleString('fa-IR')})
        </span>
      </div>
    </div>
  );
};
