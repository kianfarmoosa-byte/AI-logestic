import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ExternalLink,
  Info,
  Loader2,
  Newspaper,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { Crossing } from '../types';
import { MonthlyTrendChart, TrendMonth } from './MonthlyTrendChart';
import { BorderParkLive } from './BorderParkLive';
import { OpsEventsBoard } from './OpsEventsBoard';
import { QueueHistoryPoint } from './QueueTrendChart';

interface BorderFlowRecord {
  id: string;
  gateId: number;
  gateName: string;
  date: string;
  direction: 'import' | 'export' | 'transit-in' | 'transit-out' | 'flow';
  trucks?: number;
  tonnage?: number;
  valueUsd?: number;
  hs2?: string;
  hs6?: string;
  partnerCountry?: string;
  source: 'tccim' | 'rmto' | 'comtrade' | 'cpmm' | 'news' | 'field';
  sourceUrl?: string;
  title?: string;
  snippet?: string;
  confidence: 'high' | 'medium' | 'low';
  collectedAt: string;
}

interface FlowAnomalyRecord {
  id: string;
  gateId: number;
  gateName: string;
  kind: 'surge' | 'drop' | 'implausible' | 'conflict';
  severity: 'critical' | 'warning' | 'info';
  metric: string;
  value: number;
  baseline?: number;
  changePct?: number;
  message: string;
  evidence: { source: string; title: string; url?: string }[];
  detectedAt: string;
}

interface DestinationAgg {
  country: string;
  exportT: number;
  importT: number;
  exportUsd: number;
  importUsd: number;
  confidence: 'high' | 'medium' | 'low';
}

interface Hs2Agg {
  hs2: string;
  exportT: number;
  importT: number;
  exportUsd: number;
  importUsd: number;
}

interface BorderFlowResponse {
  success: boolean;
  cached?: boolean;
  official: BorderFlowRecord[];
  news: BorderFlowRecord[];
  officialAvailable: boolean;
}

interface GateDetailResponse {
  success: boolean;
  gateId: number;
  gateName: string | null;
  official: BorderFlowRecord[];
  news: BorderFlowRecord[];
  destinations: DestinationAgg[];
  hs2Groups: Hs2Agg[];
  anomalies: FlowAnomalyRecord[];
}

const DIRECTION_LABELS: Record<BorderFlowRecord['direction'], string> = {
  import: 'ورودی',
  export: 'خروجی',
  'transit-in': 'ترانزیت ورودی',
  'transit-out': 'ترانزیت خروجی',
  flow: 'جریان',
};

const SOURCE_LABELS: Record<BorderFlowRecord['source'], string> = {
  tccim: 'آمار رسمی گمرک (اتاق تهران)',
  rmto: 'سازمان راهداری',
  comtrade: 'UN Comtrade',
  cpmm: 'ADB — CPMM',
  news: 'خبر رسانه‌ای',
  field: 'گزارش میدانی',
};

const CONF_STYLE: Record<BorderFlowRecord['confidence'], string> = {
  high: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  medium: 'border-amber-500/40 bg-amber-500/10 text-[var(--tone-amber)]',
  low: 'border-slate-600/50 bg-slate-700/30 text-slate-400',
};

const CONF_LABEL: Record<BorderFlowRecord['confidence'], string> = {
  high: 'اعتماد بالا',
  medium: 'اعتماد متوسط',
  low: 'نیازمند تأیید',
};

const DIRECTION_COLORS: Record<BorderFlowRecord['direction'], string> = {
  import: 'text-sky-300',
  export: 'text-emerald-300',
  'transit-in': 'text-violet-300',
  'transit-out': 'text-fuchsia-300',
  flow: 'text-slate-300',
};

/** همان ۱۰ مرز پرترافیک سرور برای پیشفرض نمودار */
const TOP_GATES: { id: number }[] = [
  { id: 0 }, { id: 4 }, { id: 5 }, { id: 6 }, { id: 7 },
  { id: 9 }, { id: 22 }, { id: 21 }, { id: 12 }, { id: 27 },
];

interface BorderFlowDashboardProps {
  crossings: Crossing[];
  onFocusGate?: (crossing: Crossing) => void;
}

export const BorderFlowDashboard: React.FC<BorderFlowDashboardProps> = ({ crossings, onFocusGate }) => {
  const [data, setData] = useState<BorderFlowResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGate, setSelectedGate] = useState<number | 'all'>('all');
  const [trend, setTrend] = useState<TrendMonth[]>([]);
  const [trendGate, setTrendGate] = useState<number | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [anomalies, setAnomalies] = useState<FlowAnomalyRecord[]>([]);
  const [queueSeed, setQueueSeed] = useState<QueueHistoryPoint | null>(null);
  const [gateDetail, setGateDetail] = useState<GateDetailResponse | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/border-flow');
      if (!res.ok) throw new Error(`خطای سرور (${res.status})`);
      setData((await res.json()) as BorderFlowResponse);
    } catch (e: any) {
      setError(e?.message || 'گردآوری داده ناموفق بود');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  /** تجمیع آمار رسمی به سطح گذرگاه: جمع تناژ/ارزش به تفکیک جهت */
  const officialByGate = useMemo(() => {
    if (!data) return [];
    const map = new Map<
      number,
      { gateId: number; exportT: number; importT: number; exportUsd: number; importUsd: number; hs: Map<string, number>; countries: Set<string> }
    >();
    for (const r of data.official) {
      if (r.gateId < 0) continue;
      let agg = map.get(r.gateId);
      if (!agg) {
        agg = { gateId: r.gateId, exportT: 0, importT: 0, exportUsd: 0, importUsd: 0, hs: new Map(), countries: new Set() };
        map.set(r.gateId, agg);
      }
      if (r.direction === 'export') {
        agg.exportT += r.tonnage ?? 0;
        agg.exportUsd += r.valueUsd ?? 0;
      } else {
        agg.importT += r.tonnage ?? 0;
        agg.importUsd += r.valueUsd ?? 0;
      }
      if (r.hs2) agg.hs.set(r.hs2, (agg.hs.get(r.hs2) ?? 0) + (r.tonnage ?? 0));
      if (r.partnerCountry) agg.countries.add(r.partnerCountry);
    }
    return Array.from(map.values()).sort((a, b) => b.exportT + b.importT - (a.exportT + a.importT));
  }, [data]);

  const newsFiltered = useMemo(() => {
    if (!data) return [];
    return selectedGate === 'all' ? data.news : data.news.filter((n) => n.gateId === selectedGate);
  }, [data, selectedGate]);

  const gateNames = useMemo(() => {
    const names = new Map<number, string>();
    for (const n of data?.news ?? []) names.set(n.gateId, n.gateName);
    for (const o of officialByGate) {
      const c = crossings.find((x) => x.id === o.gateId);
      if (c) names.set(o.gateId, c.name);
    }
    return Array.from(names.entries()).sort((a, b) => a[1].localeCompare(b[1], 'fa'));
  }, [data, officialByGate, crossings]);

  const trucksTotal = useMemo(() => data?.news.reduce((sum, n) => sum + (n.trucks ?? 0), 0) ?? 0, [data]);

  // روند ماهانهٔ مرز انتخابی — همیشه یک گذرگاه مشخص را نشان بده (حتی با دادهٔ کم)
  useEffect(() => {
    if (selectedGate !== 'all') {
      setTrendGate(selectedGate);
      return;
    }
    const first =
      TOP_GATES.find((g) => data?.news.some((n) => n.gateId === g.id))?.id ??
      data?.news.find((n) => n.gateId >= 0)?.gateId ??
      TOP_GATES[0]?.id ??
      null;
    setTrendGate(first);
  }, [selectedGate, data]);

  useEffect(() => {
    if (trendGate == null) return;
    let cancelled = false;
    setTrendLoading(true);
    fetch(`/api/border-flow/${trendGate}/trend`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('خطای روند'))))
      .then((j) => {
        if (!cancelled) setTrend(j.trend ?? []);
      })
      .catch(() => {
        if (!cancelled) setTrend([]);
      })
      .finally(() => {
        if (!cancelled) setTrendLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [trendGate]);

  const trendGateName = useMemo(
    () => crossings.find((c) => c.id === trendGate)?.name ?? null,
    [trendGate, crossings]
  );

  // جزئیات مرز انتخابی (مقصد، HS2، آلارمهای همان مرز)
  useEffect(() => {
    if (trendGate == null) {
      setGateDetail(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/border-flow/${trendGate}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('خطای جزئیات مرز'))))
      .then((j: GateDetailResponse) => {
        if (!cancelled) setGateDetail(j);
      })
      .catch(() => {
        if (!cancelled) setGateDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [trendGate, data]);

  // آلارمهای سراسری
  useEffect(() => {
    let cancelled = false;
    fetch('/api/border-flow/anomalies')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('خطای آلارم'))))
      .then((j) => {
        if (!cancelled) setAnomalies(j.anomalies ?? []);
      })
      .catch(() => {
        if (!cancelled) setAnomalies([]);
      });
    return () => {
      cancelled = true;
    };
  }, [data]);

  return (
    <div className="flex flex-col gap-3 p-3 font-['Vazirmatn']">
      {/* سربرگ — کارت سبز امضایی (سربرگ «Trafic Insights») */}
      <div className="bg-[var(--cmd-green-soft)] p-3 rounded-xl border border-[var(--cmd-green-ring)]">
        <div className="text-xs font-bold text-[var(--cmd-green)] mb-1 flex items-center gap-1.5">
          <Activity className="w-4 h-4" />
          <span>جریان مرزها — کامیون و بار ورودی/خروجی</span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          ترکیب منابع رسمی (گمرک×کشور×کالا) و آیندگان خبری ۱۰ مرز پرترافیک با استخراج ساختاریافته. هر رکورد با
          <strong className="text-slate-300"> منبع، تاریخ و امتیاز اعتماد </strong>
          نمایش داده میشود؛ اعداد خبری فقط پس از هم‌رأیی منابع به عدد قطعی ارتقا مییابند.
        </p>
      </div>

      {/* برد رویدادهای عملیاتی — شاخصهای کلیدی، سطح اضطرار و وضعیت واحدها (الگوی KEMETRA) */}
      <OpsEventsBoard
        crossings={crossings}
        anomalies={anomalies}
        newsStats={{ trucks: trucksTotal, news: data?.news.length ?? 0, officialGates: officialByGate.length }}
        onFocusGate={onFocusGate}
        seedPoint={queueSeed}
      />

      {/* کنترل‌ها */}
      <div className="flex items-center gap-2">
        <select
          value={String(selectedGate)}
          onChange={(e) => setSelectedGate(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="flex-1 bg-slate-900/70 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
        >
          <option value="all">همهٔ مرزها</option>
          {gateNames.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="btn-cmd-green flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 shadow-sm"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          به‌روزرسانی
        </button>
      </div>

      {error && (
        <p className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {error}
        </p>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center gap-2 py-8 text-slate-400 text-xs">
          <Loader2 className="w-4 h-4 animate-spin" />
          در حال گردآوری دادههای رسمی و خبری…
        </div>
      )}

      {/* وضعیت زندهٔ صف مرزها (سامانهٔ نوبتدهی رسمی) */}
      <BorderParkLive crossings={crossings} onFocusGate={onFocusGate} onSnapshot={setQueueSeed} />

      {/* آلارمهای نوسان */}
      {anomalies.length > 0 && (
        <div className="bg-slate-900/60 border border-rose-500/30 rounded-xl p-2.5 flex flex-col gap-2">
          <span className="text-[11px] font-bold text-rose-300 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            آلارمهای نوسان ({anomalies.length.toLocaleString('fa-IR')})
          </span>
          {anomalies.slice(0, 6).map((a) => {
            const crossing = crossings.find((x) => x.id === a.gateId);
            const sevStyle =
              a.severity === 'critical'
                ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                : a.severity === 'warning'
                  ? 'border-amber-500/40 bg-amber-500/10 text-[var(--tone-amber)]'
                  : 'border-slate-600/50 bg-slate-700/30 text-slate-300';
            const kindLabel =
              a.kind === 'surge' ? 'جهش' : a.kind === 'drop' ? 'توقف/افت' : a.kind === 'conflict' ? 'تعارض منابع' : 'عدد مشکوک';
            return (
              <div key={a.id} className={`border rounded-lg p-2 ${sevStyle}`}>
                <div className="flex items-center gap-2 flex-wrap text-[10px]">
                  <span className="font-black">{kindLabel}</span>
                  <button
                    onClick={() => {
                      const c = crossings.find((x) => x.id === a.gateId);
                      if (c) {
                        setSelectedGate(a.gateId);
                        onFocusGate?.(c);
                      }
                    }}
                    className="font-bold underline decoration-dotted"
                  >
                    {a.gateName}
                  </button>
                  {typeof a.changePct === 'number' && (
                    <span className="text-[9px]">+{a.changePct.toLocaleString('fa-IR')}٪</span>
                  )}
                </div>
                <p className="text-[10px] text-slate-300 mt-1 leading-relaxed">{a.message}</p>
                {a.evidence[0]?.url && (
                  <a href={a.evidence[0].url} target="_blank" rel="noreferrer" className="text-[9px] text-[var(--cmd-green)]/80 hover:text-[var(--cmd-green)] mt-0.5 inline-block">
                    منبع: {a.evidence[0].title.slice(0, 60)}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* مقاصد و گروههای کالایی مرز انتخابی (از آمار رسمی) */}
      {gateDetail && (gateDetail.destinations.length > 0 || gateDetail.hs2Groups.length > 0) && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-2.5 flex flex-col gap-2">
          <span className="text-[11px] font-bold text-sky-300 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            مقاصد و نوع کالا — {crossings.find((c) => c.id === gateDetail.gateId)?.name}
          </span>
          {gateDetail.destinations.length > 0 && (
            <div className="flex flex-col gap-1">
              {gateDetail.destinations.slice(0, 5).map((d) => (
                <div key={d.country} className="flex items-center justify-between text-[10px] border border-slate-800/80 rounded-lg px-2 py-1.5 bg-slate-950/40">
                  <span className="text-slate-200 font-bold">{d.country}</span>
                  <span className="flex items-center gap-2 text-slate-400">
                    <span className={DIRECTION_COLORS.export}>{Math.round(d.exportT).toLocaleString('fa-IR')} تن خروجی</span>
                    {d.importT > 0 && <span className={DIRECTION_COLORS.import}>{Math.round(d.importT).toLocaleString('fa-IR')} تن ورودی</span>}
                    <span className={`text-[9px] border rounded px-1 ${CONF_STYLE[d.confidence]}`}>{CONF_LABEL[d.confidence]}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
          {gateDetail.hs2Groups.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {gateDetail.hs2Groups.slice(0, 10).map((g) => (
                <span key={g.hs2} className="text-[9px] border border-slate-700 rounded px-1.5 py-0.5 text-slate-300" title={`HS ${g.hs2}`}>
                  HS{g.hs2}: {Math.round(g.exportT + g.importT).toLocaleString('fa-IR')} تن
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* نمودار روند ماهانه */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-2.5 flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-[var(--cmd-green)] flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            روند ماهانه {trendGateName ? `— ${trendGateName}` : ''}
          </span>
          {trendLoading && <Loader2 className="w-3 h-3 animate-spin text-slate-500" />}
        </div>
        <MonthlyTrendChart data={trend} />
      </div>

      {/* آمار رسمی گمرکات */}
      {officialByGate.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-2.5 flex flex-col gap-2">
          <span className="text-[11px] font-bold text-emerald-300 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            آمار رسمی گمرکات (وزن و ارزش به تفکیک جهت)
          </span>
          {officialByGate.slice(0, 8).map((agg) => {
            const crossing = crossings.find((x) => x.id === agg.gateId);
            const topHs = Array.from(agg.hs.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
            return (
              <div key={agg.gateId} className="border border-slate-800/80 rounded-lg p-2 bg-slate-950/40">
                <div className="flex items-center justify-between mb-1">
                  <button
                    onClick={() => crossing && onFocusGate?.(crossing)}
                    className="text-xs font-bold text-slate-100 hover:text-[var(--cmd-green)]"
                    title={crossing ? 'نمایش روی نقشه' : undefined}
                  >
                    {crossing?.name ?? `گمرک ${agg.gateId}`}
                  </button>
                  <span className="text-[9px] text-emerald-400/80 border border-emerald-500/30 bg-emerald-500/10 rounded px-1.5 py-0.5">
                    {CONF_LABEL.high}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <span className={DIRECTION_COLORS.export}>صادرات:</span>{' '}
                    <b className="text-slate-200">{Math.round(agg.exportT).toLocaleString('fa-IR')}</b> تن ·{' '}
                    <span className="text-slate-400">{Math.round(agg.exportUsd / 1e6).toLocaleString('fa-IR')} م.دلار</span>
                  </div>
                  <div>
                    <span className={DIRECTION_COLORS.import}>واردات:</span>{' '}
                    <b className="text-slate-200">{Math.round(agg.importT).toLocaleString('fa-IR')}</b> تن ·{' '}
                    <span className="text-slate-400">{Math.round(agg.importUsd / 1e6).toLocaleString('fa-IR')} م.دلار</span>
                  </div>
                </div>
                {topHs.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {topHs.map(([hs, t]) => (
                      <span key={hs} className="text-[9px] text-slate-400 border border-slate-700 rounded px-1 py-0.5">
                        HS {hs} · {Math.round(t).toLocaleString('fa-IR')} تن
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* اخبار ساختاریافته */}
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-bold text-[var(--tone-amber)] flex items-center gap-1.5">
          <Newspaper className="w-3.5 h-3.5" />
          آیندگان خبری {selectedGate !== 'all' && `— ${gateNames.find(([id]) => id === selectedGate)?.[1]}`}
        </span>
        {newsFiltered.length === 0 && !loading && (
          <p className="text-[10px] text-slate-500 leading-relaxed px-1">خبر تازه‌ای برای این انتخاب یافت نشد.</p>
        )}
        {newsFiltered.map((n) => {
          const crossing = crossings.find((x) => x.id === n.gateId);
          return (
            <div key={n.id} className="border border-slate-800/80 rounded-xl p-2.5 bg-slate-900/50 flex flex-col gap-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold text-slate-200 border border-slate-700 rounded px-1.5 py-0.5">
                  {n.gateName}
                </span>
                <span className={`text-[9px] font-bold ${DIRECTION_COLORS[n.direction]}`}>{DIRECTION_LABELS[n.direction]}</span>
                {typeof n.trucks === 'number' && (
                  <span className="text-[10px] font-black text-[var(--tone-amber)]">
                    {n.trucks.toLocaleString('fa-IR')} کامیون
                  </span>
                )}
                {typeof n.tonnage === 'number' && (
                  <span className="text-[10px] font-bold text-[var(--cmd-green)]">{n.tonnage.toLocaleString('fa-IR')} تن</span>
                )}
                <span className={`text-[9px] border rounded px-1.5 py-0.5 mr-auto ${CONF_STYLE[n.confidence]}`}>
                  {CONF_LABEL[n.confidence]}
                </span>
              </div>
              {n.title && <p className="text-[11px] text-slate-300 leading-relaxed">{n.title}</p>}
              {n.snippet && <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-2">{n.snippet}</p>}
              <div className="flex items-center gap-3 text-[9px] text-slate-500">
                <span>{SOURCE_LABELS[n.source]}</span>
                {n.sourceUrl && (
                  <a
                    href={n.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--cmd-green)]/80 hover:text-[var(--cmd-green)] flex items-center gap-0.5"
                  >
                    منبع <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
                {crossing && onFocusGate && (
                  <button onClick={() => onFocusGate(crossing)} className="text-[var(--tone-amber)]/80 hover:text-[var(--tone-amber)]">
                    نمایش روی نقشه
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* یادداشت روش‌شناسی */}
      <div className="text-[10px] text-slate-500 border border-slate-800 rounded-xl p-2.5 bg-slate-950/60 flex items-start gap-2 leading-relaxed">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-600" />
        <span>
          امتیاز اعتماد هر رکورد از ترکیب «اعتبار منبع × تازگی × هم‌رأیی منابع» محاسبه میشود: آمار رسمی گمرک بالاترین
          اعتبار، اخبار رسانهای نیازمند هم‌رأیی دو منبع برای ارتقا به عدد قطعی.
        </span>
      </div>
    </div>
  );
};
