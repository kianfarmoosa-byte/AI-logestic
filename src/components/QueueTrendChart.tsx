import React, { useMemo, useState } from 'react';
import { AreaChart, Clock, TrendingUp } from 'lucide-react';

/* ------------------------------------------------------------------ *
 * QueueTrendChart — نمودار سری‌زمانی صف مرزها (الگوی Vehicle Count
 * داشبورد KEMETRA): خط سبز امضایی با گرادیان ناحیه، crosshair تعاملی
 * و tooltip، سوییچ بازهٔ زمانی، تغییر سنجه و حالت تفکیک مرزها با
 * چند سری رنگی + نشانگر جهش/افت آشکار صف.
 * ------------------------------------------------------------------ */

export interface QueueGateValue {
  totalQueue: number;
  maxWaitHours: number;
}

export interface QueueSurge {
  kind: 'jump' | 'drop';
  gateSlug: string;
  gateName: string;
  changePct: number;
  from: number;
  to: number;
  windowMin: number;
}

export interface QueueHistoryPoint {
  at: number;
  totalQueue: number;
  maxWaitHours: number;
  liveGates: number;
  gateValues?: Record<string, QueueGateValue>;
  surge?: QueueSurge | null;
}

interface QueueTrendChartProps {
  points: QueueHistoryPoint[];
  /** نام فارسی مرزها بر اساس slug (از سرور) برای لجند حالت تفکیک */
  gateNames?: Record<string, string>;
  /** روند جهش/افت اخیر (از سرور) برای نشانگر هشدار */
  trend?: QueueSurge | null;
  /** نقطهٔ زندهٔ تازه (از کارت وضعیت صف) برای نشاندن اولیهٔ نمودار تا انباشت تاریخچه */
  seedPoint?: QueueHistoryPoint | null;
  height?: number;
}

type Metric = 'totalQueue' | 'maxWaitHours';
type RangeKey = '6h' | '24h' | '7d';

const W = 460;

const RANGES: { key: RangeKey; label: string; ms: number }[] = [
  { key: '6h', label: '۶ ساعت', ms: 6 * 3600_000 },
  { key: '24h', label: '۲۴ ساعت', ms: 24 * 3600_000 },
  { key: '7d', label: '۷ روز', ms: 7 * 86400_000 },
];

const METRICS: Record<Metric, { label: string; unit: string; color: string }> = {
  totalQueue: { label: 'تریلر در صف', unit: 'تریلر', color: '#74a21e' },
  maxWaitHours: { label: 'ساعت انتظار', unit: 'ساعت', color: '#b45309' },
};

/** رنگ ثابت هر مرز در حالت تفکیک (سبز امضایی برای بیشترین صف، بعد پالت معنایی) */
const GATE_COLORS: Record<string, string> = {
  bazargan: '#74a21e',
  jolfa: '#0369a1',
  norduz: '#b45309',
  basharan: '#6d28d9',
  sarakhs: '#0f766e',
  parvizkhan: '#be123c',
};

const FALLBACK_COLORS = ['#74a21e', '#0369a1', '#b45309', '#6d28d9', '#0f766e', '#be123c'];

const hm = (ms: number) =>
  new Date(ms).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', hour12: false });

/** برچسب محور زمان بر حسب بازه */
const tickLabel = (ms: number, range: RangeKey) =>
  range === '7d'
    ? new Date(ms).toLocaleDateString('fa-IR', { month: '2-digit', day: '2-digit' })
    : hm(ms);

/** برچسب زمانی کامل برای tooltip */
const fullTime = (ms: number) =>
  `${new Date(ms).toLocaleDateString('fa-IR', { month: '2-digit', day: '2-digit' })} · ${hm(ms)}`;

const fa = (n: number) => Math.round(n).toLocaleString('fa-IR');

export const QueueTrendChart: React.FC<QueueTrendChartProps> = ({
  points,
  gateNames = {},
  trend = null,
  seedPoint,
  height = 150,
}) => {
  const [range, setRange] = useState<RangeKey>('24h');
  const [metric, setMetric] = useState<Metric>('totalQueue');
  const [hover, setHover] = useState<number | null>(null);
  const [gateMode, setGateMode] = useState(false);
  const [activeGate, setActiveGate] = useState<string | null>(null);

  const pad = { top: 12, right: 10, bottom: 20, left: 10 };
  const innerW = W - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const now = points.length > 0 ? points[points.length - 1].at : Date.now();
  const rangeMs = RANGES.find((r) => r.key === range)?.ms ?? 24 * 3600_000;
  const cutoff = now - rangeMs;

  // اگر تاریخچه هنوز انباشته نشده، نقطهٔ زندهٔ کارت صف را برای نمایش فوری بهره بگیر
  const effectivePoints = useMemo(() => {
    if (points.length > 0 || !seedPoint) return points;
    return [seedPoint];
  }, [points, seedPoint]);

  const window = useMemo(() => effectivePoints.filter((p) => p.at >= cutoff), [effectivePoints, cutoff]);

  /** مرزهای موجود در بازه (حالت تفکیک) — مرتب بر بیشینهٔ صف */
  const gateSlugs = useMemo(() => {
    const totals = new Map<string, number>();
    for (const p of window) {
      if (!p.gateValues) continue;
      for (const [slug, v] of Object.entries(p.gateValues)) {
        totals.set(slug, Math.max(totals.get(slug) ?? 0, v[metric]));
      }
    }
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([slug]) => slug);
  }, [window, metric]);

  const hasGateData = window.some((p) => p.gateValues && Object.keys(p.gateValues).length > 0);

  const view = useMemo(() => {
    if (window.length === 0) return null;

    if (gateMode && hasGateData) {
      // حالت تفکیک: چند خط هم‌زمان برای مرزهای پرصف (نمایش ۴ مرز برتر)
      const chosen = gateSlugs.slice(0, 4);
      const series = chosen.map((slug) => {
        const vals = window.map((p) => p.gateValues?.[slug]?.[metric] ?? 0);
        const pts = window.map((p, i) => ({
          at: p.at,
          v: p.gateValues?.[slug]?.[metric] ?? 0,
          x: 0,
          y: 0,
        }));
        return { slug, vals, pts };
      });
      const allVals = series.flatMap((s) => s.vals);
      const maxV = Math.max(1, ...allVals);
      const yMax = metric === 'totalQueue' ? Math.ceil(maxV / 50) * 50 : Math.ceil(maxV / 24) * 24;
      const x = (i: number) =>
        pad.left + (window.length === 1 ? innerW / 2 : (i * innerW) / (window.length - 1));
      const y = (v: number) => pad.top + innerH - (v / yMax) * innerH;
      for (const s of series) {
        s.pts = s.pts.map((p, i) => ({ ...p, x: x(i), y: y(s.vals[i]) }));
      }
      const paths = series.map((s) => ({
        slug: s.slug,
        d: s.vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '),
      }));
      return {
        mode: 'gates' as const,
        paths,
        pts: series.map((s) => ({ slug: s.slug, pts: s.pts })),
        yMax,
        avg: allVals.reduce((s, v) => s + v, 0) / Math.max(1, allVals.length),
        deltaPct: null,
        minV: Math.min(...allVals),
        maxV,
        slugs: chosen,
      };
    }

    // حالت سراسری: یک خط
    const values = window.map((p) => p[metric]);
    const maxV = Math.max(1, ...values);
    const yMax = metric === 'totalQueue' ? Math.ceil(maxV / 50) * 50 : Math.ceil(maxV / 24) * 24;
    const x = (i: number) => pad.left + (window.length === 1 ? innerW / 2 : (i * innerW) / (window.length - 1));
    const y = (v: number) => pad.top + innerH - (v / yMax) * innerH;
    const path = window.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p[metric]).toFixed(1)}`).join(' ');
    const area =
      window.length > 1
        ? `${path} L${x(window.length - 1).toFixed(1)},${(pad.top + innerH).toFixed(1)} L${x(0).toFixed(1)},${(pad.top + innerH).toFixed(1)} Z`
        : '';
    const pts = window.map((p, i) => ({ at: p.at, v: p[metric], gates: p.liveGates, x: x(i), y: y(p[metric]) }));
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const deltaPct =
      values.length >= 2 && values[0] > 0 ? ((values[values.length - 1] - values[0]) / values[0]) * 100 : null;
    return {
      mode: 'total' as const,
      path,
      area,
      pts,
      yMax,
      avg,
      deltaPct,
      minV: Math.min(...values),
      maxV,
    };
  }, [window, metric, innerW, innerH, gateMode, hasGateData, gateSlugs]);

  const color = METRICS[metric].color;
  const hoverPt = hover != null && view?.mode === 'total' ? view.pts[hover] : undefined;
  const gateColor = (slug: string, idx: number) => GATE_COLORS[slug] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length];

  if (!view || window.length === 0) {
    return (
      <div className="text-[10px] text-slate-500 text-center py-4 leading-relaxed">
        <AreaChart className="w-4 h-4 mx-auto mb-1.5 opacity-50" />
        در حال انباشت تاریخچهٔ صف… با هر بهروزرسانی سامانهٔ نوبتدهی (هر ۱۵ دقیقه) نقطهٔ تازه‌ای ثبت میشود.
      </div>
    );
  }

  // برچسب‌های محور زمان — حداکثر ۶ عدد با گام طبیعی
  const tickEvery = Math.max(1, Math.ceil(window.length / 6));

  return (
    <div className="flex flex-col gap-1.5">
      {/* سربرگ: سوییچ سنجه + بازهٔ زمانی + تفکیک (پیل‌های KEMETRA) */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-slate-950/50 border border-slate-800 rounded-lg p-0.5">
          {(Object.keys(METRICS) as Metric[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMetric(m);
                setHover(null);
              }}
              className={`text-[9px] font-bold rounded-md px-2 py-1 transition-colors ${
                metric === m ? 'tab-active-green' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {METRICS[m].label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-slate-950/50 border border-slate-800 rounded-lg p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => {
                setRange(r.key);
                setHover(null);
              }}
              className={`text-[9px] font-bold rounded-md px-2 py-1 flex items-center gap-1 transition-colors ${
                range === r.key ? 'tab-active-green' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Clock className="w-2.5 h-2.5" />
              {r.label}
            </button>
          ))}
        </div>
        {hasGateData && (
          <button
            onClick={() => {
              setGateMode((g) => !g);
              setHover(null);
              setActiveGate(null);
            }}
            className={`text-[9px] font-bold rounded-lg px-2 py-1.5 border transition-colors ${
              gateMode
                ? 'tab-active-green border'
                : 'border-slate-800 text-slate-400 hover:text-slate-200 bg-slate-950/50'
            }`}
            title="نمایش صف به تفکیک هر مرز"
          >
            تفکیک مرزها
          </button>
        )}
      </div>

      {/* خلاصهٔ آماری بازه + نشانگر جهش/افت */}
      <div className="flex items-center gap-3 text-[9px] text-slate-400 px-1 flex-wrap">
        {view.mode === 'total' ? (
          <>
            <span>
              میانگین: <b className="text-slate-200">{fa(view.avg)}</b> {METRICS[metric].unit}
            </span>
            <span>
              دامنه: <b className="text-slate-200">{fa(view.minV)}</b> تا <b className="text-slate-200">{fa(view.maxV)}</b>
            </span>
            {view.deltaPct != null && (
              <span className={view.deltaPct >= 0 ? 'text-[var(--tone-rose)]' : 'text-[var(--tone-emerald)]'}>
                {view.deltaPct >= 0 ? '▲' : '▼'} {fa(Math.abs(view.deltaPct))}٪ در بازه
              </span>
            )}
          </>
        ) : (
          <span>
            مقایسهٔ {fa(view.slugs.length)} مرز پرصف · میانگین نمونهها:{' '}
            <b className="text-slate-200">{fa(view.avg)}</b>
          </span>
        )}
        <span className="mr-auto">{fa(window.length)} نمونه · هر {fa(15)} دقیقه</span>
      </div>

      {/* نشانگر جهش/افت آشکار صف — تشخیص خودکار سرور */}
      {trend && (
        <div
          className={`flex items-center gap-1.5 text-[10px] rounded-lg px-2 py-1.5 border ${
            trend.kind === 'jump'
              ? 'border-rose-500/30 bg-rose-500/10 text-[var(--tone-rose)]'
              : 'border-emerald-500/30 bg-emerald-500/10 text-[var(--tone-emerald)]'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5 shrink-0" />
          <span className="font-bold">
            {trend.kind === 'jump' ? 'جهش صف' : 'کاهش چشمگیر صف'} —{' '}
            {trend.gateSlug === '*' ? 'کل مرزها' : gateNames[trend.gateSlug] ?? trend.gateName}:{' '}
            {fa(Math.abs(trend.changePct))}٪ در ~{fa(trend.windowMin)} دقیقه ({fa(trend.from)} ← {fa(trend.to)}{' '}
            {METRICS.totalQueue.unit})
          </span>
        </div>
      )}

      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="w-full touch-none"
        role="img"
        aria-label={`نمودار روند ${METRICS[metric].label} صف مرزها`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          if (gateMode) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          let best = 0;
          let bestD = Infinity;
          if (view.mode === 'total') {
            view.pts.forEach((p, i) => {
              const d = Math.abs(p.x - px);
              if (d < bestD) {
                bestD = d;
                best = i;
              }
            });
            setHover(best);
          }
        }}
      >
        <defs>
          <linearGradient id={`queue-area-${metric}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={metric === 'totalQueue' ? 'rgba(116,162,30,0.26)' : 'rgba(180,83,9,0.26)'} />
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

        {/* حالت تفکیک: چند خط رنگی */}
        {view.mode === 'gates' &&
          view.paths.map((s, idx) => (
            <path
              key={s.slug}
              d={s.d}
              fill="none"
              stroke={gateColor(s.slug, idx)}
              strokeWidth={activeGate === s.slug ? 3 : 1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={activeGate == null || activeGate === s.slug ? 1 : 0.25}
              style={{ cursor: 'pointer' }}
              onClick={() => setActiveGate((g) => (g === s.slug ? null : s.slug))}
            />
          ))}

        {/* حالت سراسری: ناحیهٔ گرادیانی + خط اصلی */}
        {view.mode === 'total' && (
          <>
            {view.area && <path d={view.area} fill={`url(#queue-area-${metric})`} />}
            <path d={view.path} fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}

        {/* crosshair تعاملی (فقط حالت سراسری) */}
        {hoverPt && (
          <g>
            <line
              x1={hoverPt.x}
              x2={hoverPt.x}
              y1={pad.top}
              y2={pad.top + innerH}
              stroke={color}
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.6}
            />
            <circle cx={hoverPt.x} cy={hoverPt.y} r={3.5} fill={color} stroke="#fff" strokeWidth={1.5} />
          </g>
        )}

        {/* برچسب زمان (محور افقی — حالت سراسری) */}
        {view.mode === 'total' &&
          view.pts.map((p, i) =>
            i % tickEvery === 0 || i === view.pts.length - 1 ? (
              <text
                key={`t-${p.at}`}
                x={p.x}
                y={height - 6}
                textAnchor="middle"
                fontSize={8}
                fill="rgba(109,122,111,0.9)"
              >
                {tickLabel(p.at, range)}
              </text>
            ) : null
          )}
        {/* برچسب زمان حالت تفکیک (مختصات از پنجره) */}
        {view.mode === 'gates' &&
          window.map((p, i) =>
            i % tickEvery === 0 || i === window.length - 1 ? (
              <text
                key={`g-${p.at}`}
                x={pad.left + (window.length === 1 ? innerW / 2 : (i * innerW) / (window.length - 1))}
                y={height - 6}
                textAnchor="middle"
                fontSize={8}
                fill="rgba(109,122,111,0.9)"
              >
                {tickLabel(p.at, range)}
              </text>
            ) : null
          )}
        {/* برچسب سقف محور */}
        <text x={pad.left + 2} y={pad.top + 8} fontSize={8} fill="rgba(109,122,111,0.75)">
          {fa(view.yMax)}
        </text>
      </svg>

      {/* tooltip تعاملی — باکس سفید KEMETRA با متن تیره */}
      <div className="flex items-center justify-between bg-slate-950/50 border border-slate-800 rounded-lg px-2 py-1.5 text-[10px] min-h-[30px] flex-wrap gap-1">
        {view.mode === 'total' && hoverPt ? (
          <>
            <span className="flex items-center gap-1.5 text-slate-300 font-bold">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
              {fa(hoverPt.v)} {METRICS[metric].unit}
            </span>
            <span className="text-slate-400">
              {fullTime(hoverPt.at)} · {fa(hoverPt.gates)} مرز زنده
            </span>
          </>
        ) : view.mode === 'gates' ? (
          <>
            <span className="flex items-center gap-2 flex-wrap">
              {view.slugs.map((slug, idx) => (
                <button
                  key={slug}
                  onClick={() => setActiveGate((g) => (g === slug ? null : slug))}
                  className={`flex items-center gap-1 text-[9px] font-bold rounded-full px-1.5 py-0.5 border transition-all ${
                    activeGate === slug
                      ? 'border-slate-700 bg-slate-800/60 text-slate-100'
                      : activeGate == null
                        ? 'border-transparent text-slate-300 hover:bg-slate-800/40'
                        : 'border-transparent text-slate-500'
                  }`}
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ background: gateColor(slug, idx) }}
                  />
                  {gateNames[slug] ?? slug}
                </button>
              ))}
            </span>
            <span className="text-slate-500">{activeGate ? 'کلیک: نمایش همه' : 'کلیک روی مرز: برجستهسازی'}</span>
          </>
        ) : (
          <span className="text-slate-500">برای دیدن مقدار هر لحظه، نشانگر را روی نمودار ببرید.</span>
        )}
      </div>
    </div>
  );
};
