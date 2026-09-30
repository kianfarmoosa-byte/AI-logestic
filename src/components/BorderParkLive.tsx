import React, { useEffect, useState } from 'react';
import { Clock, ExternalLink, Layers, Loader2, MapPin, RefreshCw, RadioTower, Truck } from 'lucide-react';
import { Crossing } from '../types';
import { readJsonOrThrow } from '../services/api';
import { QueueHistoryPoint as QHP } from './QueueTrendChart';

interface BorderParkQueueRow {
  queueTitle: string;
  total: number;
  called: number;
  awaitingEntry: number;
  accepted: number;
  waitHours: number;
}

interface BorderParkTirPark {
  name: string;
  capacityTrailers: number | null;
  services: string[];
}

interface BorderParkSnapshot {
  gateId: number | null;
  gateSlug: string;
  gateNameFa: string;
  observedAt: string;
  sourceUpdatedAt?: string;
  overview: { customsAcceptance: number; transit: number; export: number; loading: number } | null;
  tirParks: BorderParkTirPark[];
  queues: BorderParkQueueRow[];
  totalQueue: number;
  maxWaitHours: number;
  fetchPath: 'jina' | 'direct' | 'none';
  confidence: 'high' | 'medium' | 'low';
  rawTitle?: string;
}

interface BorderParkLiveProps {
  crossings: Crossing[];
  onFocusGate?: (crossing: Crossing) => void;
  /** انتشار آخرین وضعیت زنده به‌صورت نقطهٔ سری‌زمانی (برای نشاندن اولیهٔ نمودار روند صف) */
  onSnapshot?: (point: QHP) => void;
}

const CONF_BADGE: Record<BorderParkSnapshot['confidence'], { cls: string; label: string }> = {
  high: { cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300', label: 'زنده' },
  medium: { cls: 'border-amber-500/40 bg-amber-500/10 text-[var(--tone-amber)]', label: 'جزئی' },
  low: { cls: 'border-slate-600/50 bg-slate-700/30 text-slate-400', label: 'غیرفعال' },
};

/** رنگ شدت زمان انتظار */
function waitTone(hours: number): string {
  if (hours >= 200) return 'text-rose-300';
  if (hours >= 72) return 'text-[var(--tone-amber)]';
  if (hours >= 12) return 'text-[var(--cmd-green)]';
  return 'text-slate-400';
}

export const BorderParkLive: React.FC<BorderParkLiveProps> = ({ crossings, onFocusGate, onSnapshot }) => {
  const [gates, setGates] = useState<BorderParkSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/border-park/status');
      const data = await readJsonOrThrow<{ gates?: BorderParkSnapshot[] }>(res, 'خطای سرور');
      const gates: BorderParkSnapshot[] = data.gates ?? [];
      setGates(gates);
      // آخرین وضعیت را به نمودار روند صف بده تا بدون انتظار برای انباشت، یک نقطه داشته باشد
      if (onSnapshot) {
        const live = gates.filter((g) => g.confidence !== 'low');
        if (live.length > 0) {
          onSnapshot({
            at: Date.now(),
            totalQueue: live.reduce((s, g) => s + g.totalQueue, 0),
            maxWaitHours: live.reduce((mx, g) => Math.max(mx, g.maxWaitHours), 0),
            liveGates: live.length,
          });
        }
      }
    } catch (e: any) {
      setError(e?.message || 'دریافت وضعیت زنده ناموفق بود');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const liveGates = gates.filter((g) => g.confidence !== 'low');
  const totalQueueAll = liveGates.reduce((s, g) => s + g.totalQueue, 0);
  const worstWait = liveGates.reduce((mx, g) => Math.max(mx, g.maxWaitHours), 0);
  const worstGate = liveGates.find((g) => g.maxWaitHours === worstWait);

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-2.5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-[var(--cmd-green)] flex items-center gap-1.5">
          <RadioTower className="w-3.5 h-3.5" />
          وضعیت زندهٔ صف مرزها — سامانهٔ نوبتدهی رسمی گمرک
        </span>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="text-[10px] text-slate-400 hover:text-[var(--cmd-green)] flex items-center gap-1 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          بهروزرسانی
        </button>
      </div>

      {error && <p className="text-[10px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2">{error}</p>}

      {loading && gates.length === 0 && (
        <div className="flex items-center justify-center gap-2 py-6 text-slate-400 text-xs">
          <Loader2 className="w-4 h-4 animate-spin" />
          در حال دریافت وضعیت زندهٔ ۶ مرز…
        </div>
      )}

      {/* نوار خلاصه */}
      {liveGates.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-950/50 rounded-lg p-2 text-center border border-slate-800">
            <div className="text-sm font-black text-[var(--tone-amber)]">{totalQueueAll.toLocaleString('fa-IR')}</div>
            <div className="text-[9px] text-slate-400 flex items-center justify-center gap-1">
              <Truck className="w-2.5 h-2.5" /> تریلی در صف
            </div>
          </div>
          <div className="bg-slate-950/50 rounded-lg p-2 text-center border border-slate-800">
            <div className={`text-sm font-black ${waitTone(worstWait)}`}>{worstWait.toLocaleString('fa-IR')}</div>
            <div className="text-[9px] text-slate-400 flex items-center justify-center gap-1">
              <Clock className="w-2.5 h-2.5" /> ساعت انتظار ({worstGate?.gateNameFa})
            </div>
          </div>
          <div className="bg-slate-950/50 rounded-lg p-2 text-center border border-slate-800">
            <div className="text-sm font-black text-[var(--cmd-green)]">{liveGates.length.toLocaleString('fa-IR')}</div>
            <div className="text-[9px] text-slate-400 flex items-center justify-center gap-1">
              <Layers className="w-2.5 h-2.5" /> مرز با دادهٔ زنده
            </div>
          </div>
        </div>
      )}

      {/* کارت هر مرز */}
      <div className="flex flex-col gap-1.5">
        {gates.map((g) => {
          const crossing = crossings.find((c) => c.id === g.gateId);
          const conf = CONF_BADGE[g.confidence];
          const isOpen = expanded === g.gateSlug;
          return (
            <div key={g.gateSlug} className="border border-slate-800/80 rounded-lg bg-slate-950/40 overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : g.gateSlug)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-right hover:bg-slate-900/60 transition-colors"
              >
                <span className="text-xs font-bold text-slate-100">{g.gateNameFa}</span>
                {g.totalQueue > 0 && (
                  <span className="text-[10px] text-[var(--tone-amber)] font-bold">{g.totalQueue.toLocaleString('fa-IR')} تریلی</span>
                )}
                {g.maxWaitHours > 0 && (
                  <span className={`text-[10px] font-bold ${waitTone(g.maxWaitHours)}`}>{g.maxWaitHours.toLocaleString('fa-IR')} ساعت</span>
                )}
                <span className={`text-[9px] border rounded px-1.5 py-0.5 mr-auto ${conf.cls}`}>{conf.label}</span>
              </button>

              {isOpen && g.confidence !== 'low' && (
                <div className="px-2 pb-2 flex flex-col gap-1.5 border-t border-slate-800/60 pt-1.5">
                  {/* جدول صفها */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-[9px] text-slate-300">
                      <thead>
                        <tr className="text-slate-500 border-b border-slate-800">
                          <th className="text-right py-0.5 font-medium">صف</th>
                          <th className="text-center font-medium">کل</th>
                          <th className="text-center font-medium">فراخوان</th>
                          <th className="text-center font-medium">پذیرش</th>
                          <th className="text-center font-medium">انتظار (ساعت)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.queues
                          .filter((q) => q.total > 0 || q.called > 0 || q.waitHours > 0)
                          .slice(0, 8)
                          .map((q) => (
                            <tr key={q.queueTitle} className="border-b border-slate-800/40">
                              <td className="py-0.5">{q.queueTitle}</td>
                              <td className="text-center font-bold text-[var(--tone-amber)]">{q.total.toLocaleString('fa-IR')}</td>
                              <td className="text-center">{q.called.toLocaleString('fa-IR')}</td>
                              <td className="text-center">{q.accepted.toLocaleString('fa-IR')}</td>
                              <td className={`text-center font-bold ${waitTone(q.waitHours)}`}>{q.waitHours.toLocaleString('fa-IR')}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>

                  {/* تیرپارکها */}
                  {g.tirParks.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {g.tirParks.map((p) => (
                        <span key={p.name} className="text-[9px] border border-slate-700 rounded px-1.5 py-0.5 text-slate-400">
                          {p.name}
                          {p.capacityTrailers ? ` · ${p.capacityTrailers.toLocaleString('fa-IR')} تریلی` : ''}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-[9px] text-slate-500">
                    {g.sourceUpdatedAt && <span>بهروزرسانی سامانه: {g.sourceUpdatedAt}</span>}
                    <a
                      href={`https://borderpark.ir/${g.gateSlug}_api/Fa/status`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--cmd-green)]/80 hover:text-[var(--cmd-green)] flex items-center gap-0.5"
                    >
                      سامانه <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                    {crossing && onFocusGate && (
                      <button onClick={() => onFocusGate(crossing)} className="text-[var(--tone-amber)]/80 hover:text-[var(--tone-amber)] flex items-center gap-0.5">
                        <MapPin className="w-2.5 h-2.5" /> نقشه
                      </button>
                    )}
                  </div>
                </div>
              )}

              {isOpen && g.confidence === 'low' && (
                <p className="px-2 pb-2 text-[9px] text-slate-500 leading-relaxed">
                  {g.rawTitle || 'دادهٔ زنده از این مرز در دسترس نیست (صفحهٔ سامانه رندر سنگین دارد).'}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[9px] text-slate-500 leading-relaxed">
        منبع: سامانهٔ نوبتدهی ناوگان مرزی گمرک (Border Park) — دادهٔ رسمی صف، نوبتدهی و تیرپارکها؛ حافظهٔ نهان ۱۵ دقیقهای.
        همین داده به استعلام هوشمند تزریق میشود تا پاسخها بر عدد رسمی صف تکیه کنند.
      </p>
    </div>
  );
};
