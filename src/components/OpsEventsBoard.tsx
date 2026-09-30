import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  AreaChart,
  Clock,
  Container,
  ListChecks,
  Loader2,
  MapPin,
  Newspaper,
  RadioTower,
  ShieldCheck,
  Siren,
  Truck,
} from 'lucide-react';
import { Crossing } from '../types';
import { QueueTrendChart, QueueHistoryPoint as QHP, QueueSurge as QSurge } from './QueueTrendChart';

/* ------------------------------------------------------------------ *
 * برد رویدادهای عملیاتی — الگوی کارت‌های «Events / CTECC / Key Metrics»
 * داشبورد مرجع KEMETRA روی دادهٔ واقعی همین پروژه:
 *  ۱) ردیف شاخص‌های کلیدی با آیکن مربع گرد رنگی
 *  ۲) کارت «رویدادهای مرزی» با نوار ۵ پلهٔ سطح اضطرار + لیست key-value
 *  ۳) ستون «وضعیت پاسخ عملیاتی» با پیل‌های رنگی وضعیت برای گیت‌های پرتضحیم
 * ------------------------------------------------------------------ */

interface ParkGateLite {
  gateId: number | null;
  gateSlug: string;
  gateNameFa: string;
  totalQueue: number;
  maxWaitHours: number;
  confidence: 'high' | 'medium' | 'low';
  sourceUpdatedAt?: string;
}

interface AnomalyLite {
  severity: 'critical' | 'warning' | 'info';
}

interface OpsEventsBoardProps {
  crossings: Crossing[];
  anomalies: AnomalyLite[];
  newsStats: { trucks: number; news: number; officialGates: number };
  onFocusGate?: (crossing: Crossing) => void;
  /** نقطهٔ زندهٔ صف برای نشاندن اولیهٔ نمودار روند (از کارت وضعیت زندهٔ صف) */
  seedPoint?: QHP | null;
}

const fa = (n: number) => Math.round(n).toLocaleString('fa-IR');

/** رنگ شدت زمان انتظار — هم‌قرارداد با BorderParkLive */
function waitTone(hours: number): string {
  if (hours >= 200) return 'text-[var(--tone-rose)]';
  if (hours >= 72) return 'text-[var(--tone-amber)]';
  if (hours >= 12) return 'text-[var(--cmd-green)]';
  return 'text-slate-400';
}

/** پیل وضعیت پاسخ عملیاتی — الگوی In Progress / Dispatched / Notified */
type OpStatus = 'critical' | 'high' | 'watch' | 'normal';

const STATUS_PILL: Record<OpStatus, { cls: string; label: string }> = {
  critical: {
    cls: 'bg-rose-500/10 border border-rose-500/30 text-[var(--tone-rose)]',
    label: 'بحرانی — اطلاع‌رسانی شد',
  },
  high: {
    cls: 'bg-amber-500/10 border border-amber-500/30 text-[var(--tone-amber)]',
    label: 'فشار بالا — در جریان',
  },
  watch: {
    cls: 'bg-[var(--cmd-green-soft)] border border-[var(--cmd-green-ring)] text-[var(--cmd-green)]',
    label: 'پایش فعال',
  },
  normal: {
    cls: 'bg-slate-500/10 border border-slate-500/20 text-slate-500',
    label: 'عادی',
  },
};

function statusOf(maxWaitHours: number): OpStatus {
  if (maxWaitHours >= 200) return 'critical';
  if (maxWaitHours >= 72) return 'high';
  if (maxWaitHours >= 12) return 'watch';
  return 'normal';
}

/** ردیف key-value کارت رویدادها — رنگ مقدار بر معنا (خیر=سبز، بله=سرخ و…) */
const KvRow: React.FC<{ label: string; value: string; tone?: string }> = ({ label, value, tone }) => (
  <div className="flex items-center justify-between gap-2 py-1 border-b border-slate-800/60 last:border-b-0">
    <span className="text-[10px] text-slate-400">{label}</span>
    <span className={`text-[10px] font-bold ${tone ?? 'text-slate-200'}`}>{value}</span>
  </div>
);

/** کارت شاخص کلیدی — آیکن داخل مربع گرد رنگی (الگوی Key Metrics) */
const MetricCard: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  toneCls: string;
  value: string;
  label: string;
}> = ({ icon: Icon, toneCls, value, label }) => (
  <div className="bg-slate-900 border border-slate-800 rounded-xl p-2 flex flex-col gap-1 shadow-sm">
    <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${toneCls}`}>
      <Icon className="w-3.5 h-3.5" />
    </span>
    <span className="text-sm font-black text-slate-100 leading-none">{value}</span>
    <span className="text-[9px] text-slate-400 leading-tight">{label}</span>
  </div>
);

export const OpsEventsBoard: React.FC<OpsEventsBoardProps> = ({ crossings, anomalies, newsStats, onFocusGate, seedPoint }) => {
  const [gates, setGates] = useState<ParkGateLite[]>([]);
  const [history, setHistory] = useState<QHP[]>([]);
  const [gateNames, setGateNames] = useState<Record<string, string>>({});
  const [trend, setTrend] = useState<QSurge | null>(null);
  const [loading, setLoading] = useState(true);

  // وضعیت زندهٔ صف (سرور ۱۵ دقیقه کش می‌کند) — برای شاخص‌های صف و ستون پاسخ
  useEffect(() => {
    let alive = true;
    fetch('/api/border-park/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d?.gates) setGates(d.gates as ParkGateLite[]);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // تاریخچهٔ صف برای نمودار سری‌زمانی (هر ۵ دقیقه — نقاط سرور هر ۱۰–۱۵ دقیقه تازه میشوند)
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch('/api/border-park/history')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!alive || !d?.points) return;
          setHistory(d.points as QHP[]);
          if (d.gateNames) setGateNames(d.gateNames as Record<string, string>);
          if (d.trend !== undefined) setTrend(d.trend as QSurge | null);
        })
        .catch(() => {});
    load();
    const t = window.setInterval(load, 5 * 60_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  const liveGates = useMemo(() => gates.filter((g) => g.confidence !== 'low'), [gates]);
  const totalQueueAll = useMemo(() => liveGates.reduce((s, g) => s + g.totalQueue, 0), [liveGates]);
  const worstWait = useMemo(() => liveGates.reduce((mx, g) => Math.max(mx, g.maxWaitHours), 0), [liveGates]);
  const criticalQueues = useMemo(() => liveGates.filter((g) => g.maxWaitHours >= 200), [liveGates]);
  const criticalAnoms = anomalies.filter((a) => a.severity === 'critical');
  const warnAnoms = anomalies.filter((a) => a.severity === 'warning');

  /** سطح اضطرار ۱..۵ — ترکیب انتظار زندهٔ صف و شدت ناهنجاری‌های جریان */
  const emergencyLevel = useMemo(() => {
    let level = 1;
    if (worstWait >= 12 || anomalies.length > 0) level = 2;
    if (worstWait >= 72 || warnAnoms.length > 0) level = 3;
    if (criticalQueues.length > 0 || criticalAnoms.length > 0) level = 4;
    if (criticalQueues.length >= 2 || criticalAnoms.length >= 3 || criticalQueues.some((g) => g.maxWaitHours >= 300)) level = 5;
    return level;
  }, [worstWait, anomalies.length, warnAnoms.length, criticalQueues, criticalAnoms.length]);

  /** گیت‌های نیازمند پاسخ عملیاتی (برای ستون وضعیت واحدها) */
  const responseRows = useMemo(
    () =>
      liveGates
        .filter((g) => g.maxWaitHours > 0 || g.totalQueue > 0)
        .sort((a, b) => b.maxWaitHours - a.maxWaitHours || b.totalQueue - a.totalQueue)
        .slice(0, 5),
    [liveGates]
  );

  const lastUpdate = useMemo(
    () =>
      liveGates
        .map((g) => g.sourceUpdatedAt)
        .filter((t): t is string => Boolean(t))
        .sort()
        .at(-1) ?? '—',
    [liveGates]
  );

  const eventCount = criticalQueues.length + anomalies.length;

  return (
    <div className="flex flex-col gap-3">
      {/* ۱) ردیف شاخص‌های کلیدی — ۶ کارت آیکن‌دار (الگوی Key Metrics) */}
      <div className="grid grid-cols-3 gap-2">
        <MetricCard
          icon={Truck}
          toneCls="bg-[var(--cmd-green-soft)] text-[var(--cmd-green)]"
          value={fa(newsStats.trucks)}
          label="کامیون پایش‌شده (خبر ۲ هفته)"
        />
        <MetricCard
          icon={Newspaper}
          toneCls="bg-sky-500/10 text-[var(--tone-sky)]"
          value={fa(newsStats.news)}
          label="خبر ساختاریافته"
        />
        <MetricCard
          icon={ShieldCheck}
          toneCls="bg-amber-500/10 text-[var(--tone-amber)]"
          value={fa(newsStats.officialGates)}
          label="گمرک با آمار رسمی"
        />
        <MetricCard
          icon={AlertTriangle}
          toneCls="bg-rose-500/10 text-[var(--tone-rose)]"
          value={fa(anomalies.length)}
          label="ناهنجاری جریان فعال"
        />
        <MetricCard
          icon={Container}
          toneCls="bg-violet-500/10 text-[var(--tone-violet)]"
          value={loading ? '…' : fa(totalQueueAll)}
          label="تریلر در صف زنده"
        />
        <MetricCard
          icon={Clock}
          toneCls="bg-emerald-500/10 text-[var(--tone-emerald)]"
          value={loading ? '…' : fa(worstWait)}
          label="بیشینه انتظار (ساعت)"
        />
      </div>

      {/* ۲) کارت رویدادهای مرزی — نوار سطح اضطرار + لیست key-value (الگوی Events) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 shadow-sm flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-[var(--cmd-green)] flex items-center gap-1.5">
            <Siren className="w-3.5 h-3.5" />
            رویدادهای مرزی — پایش ۲۴ ساعته
          </span>
          {eventCount > 0 && (
            <span className="text-[9px] font-bold border border-amber-500/30 bg-amber-500/10 text-[var(--tone-amber)] rounded px-1.5 py-0.5">
              {fa(eventCount)} رویداد
            </span>
          )}
        </div>

        {/* نوار سطح اضطرار — ۵ باریک عمودی؛ پلهٔ فعال با شدت ≥۳ کهربایی */}
        <div className="flex items-center gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => {
            const filled = i < emergencyLevel;
            const isTop = i === emergencyLevel - 1;
            const cls = !filled
              ? 'bg-slate-500/20'
              : isTop && emergencyLevel >= 3
                ? 'bg-[var(--tone-amber)]'
                : 'bg-[var(--cmd-green)]';
            return <span key={i} className={`w-2 h-5 rounded-sm ${cls}`} />;
          })}
          <span className="text-[10px] font-black text-slate-200 mr-1">
            سطح اضطرار {fa(emergencyLevel)} از ۵
          </span>
        </div>

        <div className="flex flex-col">
          <KvRow
            label="صف بحرانی فعال (انتظار ≥ ۲۰۰ ساعت)"
            value={criticalQueues.length > 0 ? `بله (${fa(criticalQueues.length)} مرز)` : 'خیر'}
            tone={criticalQueues.length > 0 ? 'text-[var(--tone-rose)]' : 'text-[var(--tone-emerald)]'}
          />
          <KvRow
            label="ناهنجاری جریان — بحرانی / هشدار"
            value={`${fa(criticalAnoms.length)} / ${fa(warnAnoms.length)}`}
            tone={criticalAnoms.length > 0 ? 'text-[var(--tone-rose)]' : warnAnoms.length > 0 ? 'text-[var(--tone-amber)]' : 'text-[var(--tone-emerald)]'}
          />
          <KvRow
            label="بالاترین انتظار زندهٔ مرزها"
            value={loading ? '…' : `${fa(worstWait)} ساعت`}
            tone={loading ? undefined : waitTone(worstWait)}
          />
          <KvRow
            label="تریلر در صف (سامانهٔ نوبتدهی)"
            value={loading ? '…' : fa(totalQueueAll)}
            tone={loading ? undefined : totalQueueAll > 0 ? 'text-[var(--tone-amber)]' : 'text-[var(--tone-emerald)]'}
          />
          <KvRow
            label="پایش زندهٔ مرزها"
            value={loading ? '…' : `${fa(liveGates.length)} از ۶`}
            tone="text-[var(--cmd-green)]"
          />
          <KvRow label="آخرین دادهٔ سامانهٔ نوبتدهی" value={lastUpdate} tone="text-slate-400" />
        </div>
      </div>

      {/* ۳) نمودار سری‌زمانی صف — روند تاریخی تریلر/انتظار (الگوی KEMETRA) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 shadow-sm flex flex-col gap-1.5">
        <span className="text-[11px] font-bold text-[var(--tone-sky)] flex items-center gap-1.5">
          <AreaChart className="w-3.5 h-3.5" />
          روند صف مرزها
        </span>
        <QueueTrendChart points={history} gateNames={gateNames} trend={trend} seedPoint={seedPoint} />
      </div>

      {/* ۴) وضعیت پاسخ عملیاتی — ردیف واحدها با پیل رنگی (الگوی CTECC) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 shadow-sm flex flex-col gap-1.5">
        <span className="text-[11px] font-bold text-[var(--tone-teal)] flex items-center gap-1.5">
          <ListChecks className="w-3.5 h-3.5" />
          وضعیت پاسخ عملیاتی واحدها
        </span>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-4 text-slate-400 text-[10px]">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            دریافت وضعیت واحدهای مرزی…
          </div>
        )}

        {!loading && responseRows.length === 0 && (
          <p className="text-[10px] text-slate-500 leading-relaxed py-2">
            همهٔ واحدها در وضعیت عادی است — موردی برای ارجاع عملیاتی نیست.
          </p>
        )}

        {!loading &&
          responseRows.map((g) => {
            const st = STATUS_PILL[statusOf(g.maxWaitHours)];
            const crossing = crossings.find((c) => c.id === g.gateId);
            return (
              <div
                key={g.gateSlug}
                className="flex items-center gap-2 flex-wrap border border-slate-800/70 rounded-lg px-2 py-1.5 bg-slate-950/40"
              >
                <button
                  onClick={() => crossing && onFocusGate?.(crossing)}
                  className="text-[11px] font-bold text-slate-100 hover:text-[var(--cmd-green)] flex items-center gap-1"
                  title={crossing ? 'نمایش روی نقشه' : undefined}
                >
                  {g.gateNameFa}
                  {crossing && <MapPin className="w-2.5 h-2.5 text-slate-500" />}
                </button>
                {g.totalQueue > 0 && (
                  <span className="text-[9px] text-slate-400 flex items-center gap-0.5">
                    <Container className="w-2.5 h-2.5" />
                    {fa(g.totalQueue)} تریلر
                  </span>
                )}
                {g.maxWaitHours > 0 && (
                  <span className={`text-[9px] font-bold flex items-center gap-0.5 ${waitTone(g.maxWaitHours)}`}>
                    <Clock className="w-2.5 h-2.5" />
                    {fa(g.maxWaitHours)} ساعت
                  </span>
                )}
                <span className={`text-[9px] font-bold rounded-full px-2 py-0.5 mr-auto ${st.cls}`}>{st.label}</span>
              </div>
            );
          })}

        <p className="text-[9px] text-slate-500 leading-relaxed">
          پیل وضعیت از انتظار زندهٔ سامانهٔ نوبتدهی محاسبه میشود: بحرانی ≥ ۲۰۰ ساعت (اطلاع‌رسانی مرکز اعلان)، فشار بالا ≥
          ۷۲ ساعت، پایش فعال ≥ ۱۲ ساعت.
        </p>
      </div>

      {/* ارجاع به مرکز اعلان برای صف‌های بحرانی زنده */}
      <div className="text-[9px] text-slate-500 flex items-center gap-1 px-1">
        <RadioTower className="w-3 h-3 text-[var(--cmd-green)]" />
        صف‌های بحرانی به مرکز اعلان (زنگ بالای صفحه) و در صورت تنظیم NTFY_TOPIC به موبایل اپراتور هم push میشوند.
      </div>
    </div>
  );
};
