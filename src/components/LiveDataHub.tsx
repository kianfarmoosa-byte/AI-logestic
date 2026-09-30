import React, { useEffect, useMemo, useState } from 'react';
import {
  Radar,
  CloudSun,
  Wind,
  Eye,
  Thermometer,
  Droplets,
  CloudRain,
  Gauge,
  Coins,
  ShieldCheck,
  KeyRound,
  CircleDot,
  RefreshCw,
  Loader2,
  AlertCircle,
  Search,
  Database,
  Zap,
  ExternalLink,
  Route,
} from 'lucide-react';
import { Crossing } from '../types';
import { DATA } from '../data/atlasData';
import {
  CAPABILITIES,
  CAPABILITY_STATUS_CLASS,
  CAPABILITY_STATUS_LABEL,
  CAPABILITY_SUMMARY,
  CapabilityStatus,
  groupCapabilitiesByCategory,
} from '../data/liveDataCapabilities';
import {
  computeTransitRisk,
  fetchLiveFxRates,
  fetchLiveWeather,
  FX_LABELS,
  LiveFxRates,
  LiveWeather,
  weatherCodeToFa,
} from '../services/liveData';

interface LiveDataHubProps {
  selectedCrossing: Crossing | null;
  onSelectCrossing?: (crossing: Crossing) => void;
}

const STATUS_FILTERS: { id: 'all' | CapabilityStatus; label: string }[] = [
  { id: 'all', label: 'همه' },
  { id: 'active', label: 'فعال' },
  { id: 'keyless', label: 'بدون کلید' },
  { id: 'needs_key', label: 'نیازمند کلید' },
  { id: 'planned', label: 'نقشه راه' },
];

const RISK_CLASS: Record<string, string> = {
  کم: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
  متوسط: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
  بالا: 'text-orange-300 border-orange-500/40 bg-orange-500/10',
  بحرانی: 'text-red-300 border-red-500/40 bg-red-500/10',
};

export const LiveDataHub: React.FC<LiveDataHubProps> = ({ selectedCrossing, onSelectCrossing }) => {
  const [gateId, setGateId] = useState<number | null>(selectedCrossing ? selectedCrossing.id : DATA.crossings[0]?.id ?? null);
  const [weather, setWeather] = useState<LiveWeather | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [fx, setFx] = useState<LiveFxRates | null>(null);
  const [fxLoading, setFxLoading] = useState(false);
  const [fxError, setFxError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | CapabilityStatus>('all');
  const [search, setSearch] = useState('');

  const gate = useMemo(
    () => DATA.crossings.find((c) => c.id === gateId) || DATA.crossings[0] || null,
    [gateId]
  );

  // همگام‌سازی با گذرگاه انتخاب‌شده روی نقشه
  useEffect(() => {
    if (selectedCrossing) setGateId(selectedCrossing.id);
  }, [selectedCrossing]);

  const loadWeather = async (lat: number, lng: number) => {
    setWeatherLoading(true);
    setWeatherError(null);
    try {
      setWeather(await fetchLiveWeather(lat, lng));
    } catch (err: any) {
      setWeather(null);
      setWeatherError(err?.message === 'The operation was aborted.' ? 'مهلت دریافت داده جوی به پایان رسید' : err?.message || 'خطا در دریافت داده جوی زنده');
    } finally {
      setWeatherLoading(false);
    }
  };

  const loadFx = async () => {
    setFxLoading(true);
    setFxError(null);
    try {
      setFx(await fetchLiveFxRates('USD'));
    } catch (err: any) {
      setFx(null);
      setFxError(err?.message || 'خطا در دریافت نرخ ارز زنده');
    } finally {
      setFxLoading(false);
    }
  };

  useEffect(() => {
    if (!gate) return;
    loadWeather(gate.lat, gate.lng);
  }, [gate?.id]);

  useEffect(() => {
    loadFx();
  }, []);

  const risk = useMemo(() => computeTransitRisk(weather), [weather]);

  const filteredCapabilities = useMemo(() => {
    const q = search.trim().toLowerCase();
    return CAPABILITIES.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = `${c.title} ${c.category} ${c.purpose} ${c.provider} ${c.compute.join(' ')}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [statusFilter, search]);

  const grouped = useMemo(() => groupCapabilitiesByCategory(filteredCapabilities), [filteredCapabilities]);

  return (
    <div className="flex flex-col gap-4 p-3 font-['Vazirmatn']">
      {/* Hero — کارت سبز امضایی */}
      <div className="relative overflow-hidden bg-[var(--cmd-green-soft)] border border-[var(--cmd-green-ring)] rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-2 text-[var(--cmd-green)] font-bold text-sm mb-1">
          <Radar className="w-4 h-4" />
          <span>زیرساخت داده زنده و معتبر</span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          فهرست کامل کارکردهای محاسباتی و پردازشی لازم برای تغذیه اطلس با داده‌های زنده. نقشه پایه سامانه روی{' '}
          <strong className="text-amber-300">OpenFreeMap و OpenStreetMap</strong> منبع‌باز و بدون کلید API اجرا می‌شود و
          داده‌های عملیاتی از سرویس‌های آزاد و رایگان دریافت می‌گردد.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-2 text-center">
          <span className="block text-[10px] text-slate-400">کل قابلیت‌ها</span>
          <b className="text-slate-100 text-base">{CAPABILITY_SUMMARY.total}</b>
        </div>
        <div className="bg-slate-900/70 border border-[var(--tone-emerald)]/30 rounded-xl p-2 text-center">
          <span className="block text-[10px] text-[var(--tone-emerald)]">فعال</span>
          <b className="text-[var(--tone-emerald)] text-base">{CAPABILITY_SUMMARY.active}</b>
        </div>
        <div className="bg-slate-900/70 border border-[var(--cmd-green-ring)] rounded-xl p-2 text-center">
          <span className="block text-[10px] text-[var(--cmd-green)]">بدون کلید</span>
          <b className="text-[var(--cmd-green)] text-base">{CAPABILITY_SUMMARY.keyless}</b>
        </div>
        <div className="bg-slate-900/70 border border-[var(--tone-amber)]/30 rounded-xl p-2 text-center">
          <span className="block text-[10px] text-[var(--tone-amber)]">نیازمند کلید</span>
          <b className="text-[var(--tone-amber)] text-base">{CAPABILITY_SUMMARY.needsKey}</b>
        </div>
      </div>

      {/* سنجش زنده */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--cmd-green)]">
            <Zap className="w-4 h-4" />
            <span>سنجش زنده (بدون کلید API)</span>
          </div>
          <span className="text-[10px] text-slate-500">منابع: Open-Meteo · ECB</span>
        </div>

        {/* انتخاب گذرگاه */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex flex-col gap-2">
          <label className="text-[11px] text-slate-400">گذرگاه مورد پایش:</label>
          <div className="flex gap-2">
            <select
              value={gate?.id ?? ''}
              onChange={(e) => {
                const id = Number(e.target.value);
                setGateId(id);
                const c = DATA.crossings.find((x) => x.id === id);
                if (c && onSelectCrossing) onSelectCrossing(c);
              }}
              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-100"
            >
              {DATA.crossings.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.country}
                </option>
              ))}
            </select>
            <button
              onClick={() => gate && loadWeather(gate.lat, gate.lng)}
              disabled={weatherLoading || !gate}
              className="px-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 disabled:opacity-50"
              title="به‌روزرسانی داده جوی"
            >
              {weatherLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </button>
          </div>

          {weatherError && (
            <div className="flex items-center gap-2 p-2 bg-red-950/40 border border-red-500/40 rounded-lg text-red-300 text-[11px]">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{weatherError}</span>
            </div>
          )}

          {weather && !weatherError && (
            <>
              <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800 pt-2">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <CloudSun className="w-3.5 h-3.5 text-amber-400" />
                  {weatherCodeToFa(weather.weatherCode)}
                </span>
                <span>{weather.observedAt ? `مشاهده: ${weather.observedAt.replace('T', ' ')}` : ''}</span>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <Metric icon={<Thermometer className="w-3.5 h-3.5 text-orange-400" />} label="دما" value={fmt(weather.temperatureC, '°C')} />
                <Metric icon={<Thermometer className="w-3.5 h-3.5 text-red-400" />} label="دمای محسوس" value={fmt(weather.apparentC, '°C')} />
                <Metric icon={<Droplets className="w-3.5 h-3.5 text-blue-400" />} label="رطوبت" value={fmt(weather.humidityPct, '٪')} />
                <Metric icon={<CloudRain className="w-3.5 h-3.5 text-sky-400" />} label="بارش" value={fmt(weather.precipitationMm, 'mm')} />
                <Metric icon={<Wind className="w-3.5 h-3.5 text-teal-400" />} label="باد / تندباد" value={`${fmt(weather.windKmh)} / ${fmt(weather.gustsKmh)}`} unit="km/h" />
                <Metric icon={<Eye className="w-3.5 h-3.5 text-slate-300" />} label="دید افقی" value={fmt(weather.visibilityKm, 'km')} />
              </div>

              {/* شاخص ریسک ترانزیت */}
              <div className={`mt-1 border rounded-xl p-2.5 ${RISK_CLASS[risk.level]}`}>
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="flex items-center gap-1.5">
                    <Gauge className="w-3.5 h-3.5" />
                    شاخص ریسک ترانزیت: {risk.level}
                  </span>
                  <b>{risk.score} / 100</b>
                </div>
                <div className="mt-1.5 h-1.5 bg-slate-950/60 rounded-full overflow-hidden">
                  <div className="h-full bg-current transition-all duration-700" style={{ width: `${risk.score}%` }} />
                </div>
                <ul className="mt-1.5 space-y-0.5 text-[10px] opacity-90">
                  {risk.reasons.map((r, i) => (
                    <li key={i}>• {r}</li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {weatherLoading && !weather && (
            <div className="flex items-center gap-2 text-[11px] text-slate-400 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>در حال دریافت داده جوی زنده از Open-Meteo…</span>
            </div>
          )}
        </div>

        {/* نرخ ارز زنده */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-amber-300">
              <Coins className="w-3.5 h-3.5" />
              نرخ ارز مرجع زنده (پایه: دلار آمریکا)
            </span>
            <button
              onClick={loadFx}
              disabled={fxLoading}
              className="text-slate-400 hover:text-slate-100 disabled:opacity-50"
              title="به‌روزرسانی نرخ ارز"
            >
              {fxLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </button>
          </div>

          {fxError && (
            <div className="flex items-center gap-2 p-2 bg-red-950/40 border border-red-500/40 rounded-lg text-red-300 text-[11px]">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{fxError}</span>
            </div>
          )}

          {fx && (
            <>
              <div className="grid grid-cols-5 gap-1.5">
                {Object.entries(fx.rates).map(([code, rate]) => (
                  <div
                    key={code}
                    title={FX_LABELS[code] || code}
                    className="bg-slate-950/70 border border-slate-800 rounded-lg p-1.5 text-center"
                  >
                    <span className="block text-[9px] text-slate-400">{code}</span>
                    <b className="text-slate-100 text-[11px]">{Number(rate).toLocaleString('fa-IR', { maximumFractionDigits: 2 })}</b>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>تاریخ اعتبار نرخ: {fx.date}</span>
                <a href="https://frankfurter.dev" target="_blank" rel="noopener noreferrer" className="hover:text-teal-400 flex items-center gap-1">
                  Frankfurter / ECB <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </>
          )}
        </div>
      </div>

      {/* فهرست قابلیت‌ها */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-1.5 text-xs font-bold text-teal-300">
          <Database className="w-4 h-4" />
          <span>فهرست قابلیت‌های محاسباتی و پردازشی داده</span>
        </div>

        <div className="flex flex-col gap-2 bg-slate-900/50 border border-slate-800 rounded-xl p-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجو در قابلیت‌ها، ارائه‌دهنده‌ها و مراحل پردازش…"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg py-1.5 pr-8 pl-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-400"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                className={`text-[10px] px-2.5 py-1 rounded-full border transition-all ${
                  statusFilter === f.id
                    ? 'tab-active-green font-bold'
                    : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {grouped.length === 0 && (
          <div className="text-center text-[11px] text-slate-500 py-6">قابلیتی با این فیلتر یافت نشد.</div>
        )}

        {grouped.map((cat) => (
          <div key={cat.name} className="flex flex-col gap-2">
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[11px] font-bold text-slate-200">{cat.name}</span>
              <span className="text-[10px] text-slate-500">{cat.items.length} قابلیت</span>
              <span className="flex-1 h-px bg-slate-800" />
            </div>

            {cat.items.map((c) => (
              <div
                key={c.id}
                className="bg-slate-900/70 border border-slate-800 hover:border-teal-500/40 rounded-xl p-3 flex flex-col gap-2 transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-xs text-slate-100">{c.title}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${CAPABILITY_STATUS_CLASS[c.status]}`}>
                        {CAPABILITY_STATUS_LABEL[c.status]}
                      </span>
                      {c.keyless ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-teal-500/40 bg-teal-500/10 text-teal-300 flex items-center gap-1">
                          <ShieldCheck className="w-2.5 h-2.5" /> بدون کلید
                        </span>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300 flex items-center gap-1">
                          <KeyRound className="w-2.5 h-2.5" /> {c.envKey || 'کلید API'}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed mt-1">{c.purpose}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  <Info label="ارائه‌دهنده" value={c.provider} />
                  <Info label="مجوز" value={c.license} />
                  <Info label="هزینه" value={c.cost} />
                  <Info label="به‌روزرسانی" value={c.refresh} />
                </div>

                {c.endpoint && (
                  <div className="text-[10px] bg-slate-950/70 border border-slate-800 rounded-lg p-1.5 font-mono text-teal-300/90 break-all" dir="ltr">
                    {c.endpoint}
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                    <Route className="w-3 h-3 text-amber-400" />
                    مراحل محاسباتی و پردازشی لازم:
                  </span>
                  <ul className="space-y-0.5">
                    {c.compute.map((step, i) => (
                      <li key={i} className="text-[10px] text-slate-300 flex gap-1.5">
                        <CircleDot className="w-2.5 h-2.5 text-teal-400 shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

const Metric: React.FC<{ icon: React.ReactNode; label: string; value: string; unit?: string }> = ({ icon, label, value, unit }) => (
  <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-1.5">
    <span className="flex items-center gap-1 text-[9.5px] text-slate-400">
      {icon}
      {label}
    </span>
    <b className="text-slate-100 text-[11px]">
      {value}
      {unit ? <span className="text-[9px] text-slate-500 font-normal"> {unit}</span> : null}
    </b>
  </div>
);

const Info: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-slate-950/50 border border-slate-800/80 rounded-lg p-1.5">
    <span className="block text-[9px] text-slate-500">{label}</span>
    <span className="text-slate-300 leading-snug">{value}</span>
  </div>
);

function fmt(value: number | null, unit = ''): string {
  if (value === null || Number.isNaN(value)) return '—';
  return `${Number(value).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}${unit ? ' ' + unit : ''}`;
}
