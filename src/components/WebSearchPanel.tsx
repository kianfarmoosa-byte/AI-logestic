import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Crosshair,
  Download,
  ExternalLink,
  Globe,
  KeyRound,
  Loader2,
  MapPin,
  Newspaper,
  RefreshCw,
  Route,
  Search,
  Sparkles,
} from 'lucide-react';
import { Corridor, CountryRoadNetwork, Crossing, GeoTag, MapFocusTarget, MapSearchPin } from '../types';
import {
  QUICK_SEARCHES,
  WebSearchMode,
  WebSearchResponse,
  WebSearchStatus,
  WEB_SEARCH_MODE_LABELS,
  fetchWebSearchStatus,
  searchWeb,
} from '../services/webSearch';
import {
  GEO_DISTANCE_LABELS,
  GEO_TAG_COLORS,
  GEO_TAG_LABELS,
  GeoTaggedResults,
  ROAD_PATH_LIMIT,
  attachRoadPaths,
  buildGazetteer,
  buildSearchGeoJSON,
  downloadGeoJson,
  geoTagResults,
  normalizeFa,
} from '../services/geoTagging';

interface WebSearchPanelProps {
  selectedCrossing?: Crossing | null;
  crossings: Crossing[];
  roadNetwork: Record<string, CountryRoadNetwork>;
  corridors: Corridor[];
  onOpenAiGrounding: (query: string) => void;
  onDrawPins: (pins: MapSearchPin[]) => void;
  onFocusPoint: (target: MapFocusTarget) => void;
}

const PROVIDER_TONE: Record<string, string> = {
  exa: 'border-violet-500/50 bg-violet-500/10 text-violet-200',
  wikipedia: 'border-slate-600/60 bg-slate-700/30 text-slate-200',
};

export const WebSearchPanel: React.FC<WebSearchPanelProps> = ({
  selectedCrossing,
  crossings,
  roadNetwork,
  corridors,
  onOpenAiGrounding,
  onDrawPins,
  onFocusPoint,
}) => {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<WebSearchMode>('web');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<WebSearchResponse | null>(null);
  const [status, setStatus] = useState<WebSearchStatus | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [geo, setGeo] = useState<GeoTaggedResults | null>(null);
  const [onlyMapped, setOnlyMapped] = useState(false);
  const [geoCopied, setGeoCopied] = useState(false);
  // فاصلهٔ نزدیک‌ترین گذرگاه: جاده‌ای واقعی (OSRM) یا هوایی
  const [roadDistance, setRoadDistance] = useState(true);
  const [pathsLoading, setPathsLoading] = useState(false);
  // جلوگیری از پس‌چسب‌شدن پاسخ جستجوی قدیمی روی نتایج جدید
  const pathRequest = useRef(0);

  const pinByLabel = useMemo(() => {
    const map = new Map<string, MapSearchPin>();
    (geo?.pins || []).forEach((pin) => map.set(normalizeFa(pin.label), pin));
    return map;
  }, [geo]);

  /** پس‌چسب‌کردن هندسهٔ واقعی مسیرها پس از نمایش نشانه‌ها */
  const loadRoadPaths = async (
    tagged: GeoTaggedResults,
    _query: string
  ) => {
    const requestId = ++pathRequest.current;
    setPathsLoading(true);
    try {
      const patched = await attachRoadPaths(tagged.pins, { limit: ROAD_PATH_LIMIT });
      if (requestId !== pathRequest.current) return;
      setGeo({ ...tagged, pins: patched });
      onDrawPins(patched);
    } finally {
      if (requestId === pathRequest.current) setPathsLoading(false);
    }
  };

  const roadPathCount = useMemo(
    () => (geo?.pins || []).filter((pin) => (pin.nearestGatePath?.length ?? 0) >= 2).length,
    [geo]
  );

  const buildExportGeoJson = () => {
    if (!response || !geo) return null;
    return buildSearchGeoJSON({
      query: response.query,
      provider: response.providerLabel,
      results: response.results,
      pins: geo.pins,
      tagsByIndex: geo.tagsByIndex,
    });
  };

  const handleExportGeoJson = () => {
    const data = buildExportGeoJson();
    if (data) downloadGeoJson(`atlas-search-results-${new Date().toISOString().slice(0, 10)}`, data);
  };

  const handleCopyGeoJson = async () => {
    const data = buildExportGeoJson();
    if (!data) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setGeoCopied(true);
      setTimeout(() => setGeoCopied(false), 1600);
    } catch {
      // دسترسی به کلیپ‌بورد ممکن نبود؛ کاربر می‌تواند فایل را دانلود کند
    }
  };

  // فهرست مكانی اطلس برای مکان‌یابی نتایج (بدون هیچ کلید یا سرویس بیرونی)
  const gazetteer = useMemo(
    () => buildGazetteer({ crossings, roadNetwork, corridors }),
    [crossings, roadNetwork, corridors]
  );

  const focusOn = (tag: GeoTag) =>
    onFocusPoint({ lat: tag.lat, lng: tag.lng, zoom: tag.kind === 'country' ? 5 : 8, seq: Date.now() });

  useEffect(() => {
    let alive = true;
    fetchWebSearchStatus().then((s) => {
      if (alive) setStatus(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (selectedCrossing) {
      setQuery(`آخرین وضعیت مرز ${selectedCrossing.name} (${selectedCrossing.country}) صف کامیون، ساعات کاری و محدودیت‌ها`);
    }
  }, [selectedCrossing]);

  const runSearch = async (overrideQuery?: string, overrideMode?: WebSearchMode, overrideRoad?: boolean) => {
    const q = (overrideQuery ?? query).trim();
    if (!q) return;
    const useMode = overrideMode ?? mode;
    const useRoad = overrideRoad ?? roadDistance;
    setLoading(true);
    setError(null);
    try {
      const data = await searchWeb({ query: q, mode: useMode, num: 8 });
      setResponse(data);
      // مکان‌یابی نتایج روی نقشه با داده‌های خود اطلس (نشانه‌ها فوراً نمایش داده می‌شوند)
      const tagged = await geoTagResults(data.results, gazetteer, crossings, { roadDistance: useRoad });
      setGeo(tagged);
      onDrawPins(tagged.pins);
      setLoading(false);
      // سپس مسیرهای واقعی جاده‌ای در پس‌زمینه پس‌چسب می‌شوند
      if (useRoad && tagged.roadDistanceApplied) void loadRoadPaths(tagged, data.query);
      return;
    } catch (err: any) {
      setResponse(null);
      setGeo(null);
      onDrawPins([]);
      setError(err?.message || 'جستجو ناموفق بود.');
    } finally {
      setLoading(false);
    }
  };

  const engines = useMemo(() => {
    if (!status) return [];
    return [
      { id: 'exa', ...status.exa },
      { id: 'wikipedia', ...status.wikipedia },
      { id: 'ai', ...status.ai },
    ];
  }, [status]);

  const missingKeys = useMemo(() => {
    if (!status) return [];
    const keys = new Set<string>();
    [status.exa, status.ai].forEach((engine) => engine.missing.forEach((k) => keys.add(k)));
    return Array.from(keys);
  }, [status]);

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // دسترسی به کلیپ‌بورد ممکن نبود؛ نشانی در همان کارت قابل انتخاب است
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3 font-['Vazirmatn']">
      <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <div className="text-xs font-bold text-amber-400 mb-1 flex items-center gap-1.5">
          <Globe className="w-4 h-4" />
          <span>جستجوی واقعی وب</span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          جستجوی زندهٔ وب در پراکسی سمت سرور؛ در نبود کلید، به‌ترتیب موتور معنایی وب و دانش‌نامهٔ ویکی‌پدیا پاسخ می‌دهند و سپس دستیار هوشمند
          سامانه نتایج را تحلیل می‌کند. هیچ کلیدی به مرورگر نشت نمی‌کند.
        </p>
      </div>

      {/* وضعیت موتورها */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-2.5 flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-[var(--cmd-green)] flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5" />
            موتورهای جستجوی متصل
          </span>
          <button
            onClick={() => fetchWebSearchStatus().then(setStatus)}
            className="text-[10px] text-slate-400 hover:text-[var(--cmd-green)] flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${status ? '' : 'animate-spin'}`} />
            بررسی مجدد
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
          {engines.length === 0 && <span className="text-slate-500">در حال بررسی وضعیت کلیدها…</span>}
          {engines.map((engine) => (
            <div
              key={engine.id}
              className={`rounded-lg border p-1.5 flex flex-col gap-0.5 ${
                engine.available
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                  : 'border-slate-800 bg-slate-950/60 text-slate-400'
              }`}
              title={engine.missing.length ? `کلیدهای لازم: ${engine.missing.join(' · ')}` : engine.label}
            >
              <span className="font-bold truncate">{engine.label}</span>
              <span className="text-[9px] opacity-80">{engine.available ? 'فعال' : 'نیازمند کلید'}</span>
            </div>
          ))}
        </div>

        {missingKeys.length > 0 && (
          <p className="text-[10px] text-slate-500 leading-relaxed">
            کلیدهای اختیاری برای جستجوی وب و دستیار هوشمند:{' '}
            {missingKeys.map((key) => (
              <code key={key} className="text-amber-300 mx-0.5">
                {key}
              </code>
            ))}
            — در Settings › Environment (Keys) ثبت کنید. جستجو در همین حال با موتورهای فعال کار می‌کند.
          </p>
        )}
      </div>

      {/* فرم جستجو */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 flex flex-col gap-2.5">
        <div className="flex gap-1.5">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') runSearch();
            }}
            placeholder="مثال: وضعیت صف کامیون مرز بازرگان امروز"
            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-100"
          />
          <button
            onClick={() => runSearch()}
            disabled={loading}
            className="btn-cmd-green disabled:opacity-60 font-bold px-3 rounded-lg text-xs flex items-center gap-1.5"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            <span>{loading && roadDistance ? 'جستجو و رسم مسیر جاده‌ای…' : 'جستجو'}</span>
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 text-[10px]">
          {(Object.keys(WEB_SEARCH_MODE_LABELS) as WebSearchMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2 py-1 rounded-lg border transition-all ${
                mode === m
                  ? 'border-teal-500/60 bg-[var(--cmd-green-soft)] text-[var(--cmd-green)] font-bold'
                  : 'border-slate-800 bg-slate-950/60 text-slate-300'
              }`}
            >
              {WEB_SEARCH_MODE_LABELS[m]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5 text-[10px] border-t border-slate-800 pt-2">
          {QUICK_SEARCHES.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                setQuery(item.query);
                setMode(item.mode);
                runSearch(item.query, item.mode);
              }}
              className="px-2 py-1 rounded-lg border border-slate-800 bg-slate-950/60 text-slate-300 hover:border-amber-500/50 hover:text-amber-200 transition-all"
            >
              {item.label}
            </button>
          ))}
        </div>

        {error && (
          <p className="text-[10px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2 leading-relaxed flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {error}
          </p>
        )}
      </div>

      {/* خلاصهٔ تحلیل دستیار هوشمند */}
      {response?.text && (
        <div className="bg-[var(--cmd-green-soft)] border border-[var(--cmd-green-ring)] rounded-xl p-3">
          <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5 mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            جمع‌بندی هوشمند نتایج زندهٔ وب
          </span>
          <p className="text-[11px] text-slate-200 leading-relaxed whitespace-pre-wrap">{response.text}</p>
        </div>
      )}

      {/* نشانه‌های نقشه */}
      {geo && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-2.5 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              مکان‌یابی نتایج روی نقشه
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportGeoJson}
                className="text-[10px] text-[var(--cmd-green)] hover:text-[var(--cmd-green)] flex items-center gap-1"
                title="دانلود فایل GeoJSON با نشانه‌ها، اماکن و خطوط اتصال"
              >
                <Download className="w-3 h-3" />
                GeoJSON
              </button>
              <button
                onClick={handleCopyGeoJson}
                className="text-[10px] text-slate-400 hover:text-[var(--cmd-green)] flex items-center gap-1"
                title="کپی محتوای GeoJSON"
              >
                {geoCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {geoCopied ? 'کپی شد' : 'کپی'}
              </button>
              <button
                onClick={() => {
                  onDrawPins([]);
                  setGeo(null);
                }}
                className="text-[10px] text-slate-400 hover:text-rose-300"
              >
                پاک کردن نشانه‌ها
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
            <span className="bg-slate-800/70 px-1.5 py-0.5 rounded">
              {geo.pins.length.toLocaleString('fa-IR')} نشانه روی نقشه از {response?.results.length.toLocaleString('fa-IR')} نتیجه
            </span>
            <button
              onClick={() => setOnlyMapped((v) => !v)}
              className={`px-2 py-0.5 rounded-lg border transition-all ${
                onlyMapped ? 'border-teal-500/60 bg-[var(--cmd-green-soft)] text-[var(--cmd-green)] font-bold' : 'border-slate-800 text-slate-400'
              }`}
            >
              {onlyMapped ? 'نمایش همهٔ نتایج' : 'فقط نتایج مکانی‌یابی‌شده'}
            </button>
            <button
              onClick={() => {
                const next = !roadDistance;
                setRoadDistance(next);
                if (response) void runSearch(response.query, undefined, next);
              }}
              className={`px-2 py-0.5 rounded-lg border transition-all flex items-center gap-1 ${
                roadDistance ? 'border-amber-500/60 bg-amber-500/10 text-amber-200 font-bold' : 'border-slate-800 text-slate-400'
              }`}
              title="محاسبهٔ فاصلهٔ نزدیک‌ترین گذرگاه روی شبکهٔ واقعی جاده‌ها (OSRM) بهجای فاصلهٔ هوایی"
            >
              <Route className="w-2.5 h-2.5" />
              فاصلهٔ {roadDistance ? GEO_DISTANCE_LABELS.road : GEO_DISTANCE_LABELS.air}
            </button>
            {(Object.keys(GEO_TAG_COLORS) as (keyof typeof GEO_TAG_COLORS)[]).map((kind) => (
              <span key={kind} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: GEO_TAG_COLORS[kind] }} />
                {GEO_TAG_LABELS[kind]}
              </span>
            ))}
          </div>
          {gazetteer.length > 0 && (
            <p className="text-[9px] text-slate-500 leading-relaxed">
              تطبیق متن هر نتیجه با {gazetteer.length.toLocaleString('fa-IR')} نام مکان از اطلس (گذرگاه، شهر، کریدور و کشور) — بدون
              نیاز به سرویس بیرونی.
              {roadDistance && geo.roadDistanceApplied ? (
                <>
                  {' '}
                  فاصلهٔ گذرگاه‌ها روی شبکهٔ واقعی جاده‌ها (OSRM) محاسبه شده است
                  {roadPathCount > 0
                    ? ` و مسیر جاده‌ای ${roadPathCount.toLocaleString('fa-IR')} نشانه با خط ممتد رسم شده است`
                    : ''}
                  .
                </>
              ) : (
                ' فاصله و خطوط اتصال به‌صورت تخمینی (هوایی و مستقیم) رسم می‌شوند.'
              )}
            </p>
          )}
        </div>
      )}

      {/* وضعیت رسم مسیرهای واقعی جاده‌ای */}
      {pathsLoading && (
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--cmd-green)] bg-slate-900/70 border border-teal-500/30 rounded-lg px-2 py-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>نشانه‌ها رسم شدند؛ در حال رسم مسیر واقعی جاده‌ای…</span>
        </div>
      )}

      {/* نتایج */}
      {response && (
        <div className="bg-slate-900/70 border border-slate-700/70 rounded-xl p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${PROVIDER_TONE[response.provider] || PROVIDER_TONE.wikipedia}`}>
              {response.providerLabel}
            </span>
            <span className="text-[10px] text-slate-400">
              {response.results.length.toLocaleString('fa-IR')} نتیجه برای «{response.query}»
            </span>
          </div>

          {response.results
            .map((result, idx) => ({ result, idx }))
            .filter(({ idx }) => !onlyMapped || (geo?.tagsByIndex?.[idx]?.length ?? 0) > 0)
            .map(({ result, idx }) => (
            <div key={`${result.url}-${idx}`} className="bg-slate-950 border border-slate-800 rounded-lg p-2 flex flex-col gap-1">
              <div className="flex items-start justify-between gap-2">
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-bold text-[var(--cmd-green)] hover:text-[var(--cmd-green)] leading-relaxed flex items-start gap-1"
                >
                  <ExternalLink className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>{result.title}</span>
                </a>
                <span className="text-[9px] bg-slate-800/80 text-slate-300 px-1.5 py-0.5 rounded shrink-0" dir="ltr">
                  {result.source}
                </span>
              </div>
              {result.snippet && <p className="text-[10px] text-slate-400 leading-relaxed">{result.snippet}</p>}

              {(geo?.tagsByIndex?.[idx]?.length ?? 0) > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-[9px]">
                  <span className="text-slate-500">مکان‌های شناسایی‌شده:</span>
                  {geo!.tagsByIndex[idx].map((tag) => (
                    <button
                      key={`${result.url}-${tag.id}`}
                      onClick={() => focusOn(tag)}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg border border-slate-700 bg-slate-900 hover:border-amber-500/60 text-slate-300"
                      title="نمایش روی نقشه"
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: GEO_TAG_COLORS[tag.kind] }} />
                      {tag.label}
                      <Crosshair className="w-2.5 h-2.5 opacity-70" />
                    </button>
                  ))}
                </div>
              )}

              {(() => {
                const first = geo?.tagsByIndex?.[idx]?.[0];
                const pin = first ? pinByLabel.get(normalizeFa(first.label)) : undefined;
                if (!pin || !pin.nearestGateName || (pin.nearestGateKm ?? 0) < 5) return null;
                return (
                  <div className="text-[9px] text-amber-300/90 flex items-center gap-1">
                    <MapPin className="w-2.5 h-2.5" />
                    نزدیک‌ترین گذرگاه مرزی: {pin.nearestGateName} — {pin.nearestGateKm?.toLocaleString('fa-IR')} کیلومتر
                    <span className={pin.nearestGateRoad ? 'text-[var(--cmd-green)]' : 'text-slate-400'}>
                      ({pin.nearestGateRoad ? GEO_DISTANCE_LABELS.road : GEO_DISTANCE_LABELS.air}
                      {pin.nearestGateMinutes ? ` · ${pin.nearestGateMinutes.toLocaleString('fa-IR')} دقیقه` : ''})
                    </span>
                    <button
                      onClick={() =>
                        onFocusPoint({
                          lat: pin.nearestGateLat as number,
                          lng: pin.nearestGateLng as number,
                          zoom: 7,
                          seq: Date.now(),
                        })
                      }
                      className="text-[var(--cmd-green)] hover:text-[var(--cmd-green)]"
                    >
                      نمایش گیرهٔ مرزی
                    </button>
                  </div>
                );
              })()}

              <div className="flex items-center gap-2 text-[10px]">
                <button
                  onClick={() => copyLink(result.url)}
                  className="text-slate-400 hover:text-[var(--cmd-green)] flex items-center gap-1"
                >
                  {copied === result.url ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied === result.url ? 'کپی شد' : 'کپی نشانی'}
                </button>
                <button
                  onClick={() =>
                    onOpenAiGrounding(
                      `بر پایهٔ این منبع، تحلیل عملیاتی و ترانزیتی بده: «${result.title}» — ${result.url}`
                    )
                  }
                  className="text-amber-300 hover:text-amber-200 flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  تحلیل عملیاتی هوشمند
                </button>
              </div>
            </div>
          ))}

          {onlyMapped && (geo?.pins.length ?? 0) === 0 && (
            <p className="text-[10px] text-slate-500 leading-relaxed">
              هیچ‌یک از نتایج این جستجو به یک مکان مشخص در اطلس (گذرگاه، شهر، کریدور یا کشور) اشاره نکرد؛ فیلتر را بردارید یا عبارت
              دقیق‌تری جستجو کنید.
            </p>
          )}

          <button
            onClick={() =>
              onOpenAiGrounding(
                `این نتایج جستجوی وب را برای تحلیل ترانزیتی جمع‌بندی کن: ${response.results
                  .slice(0, 4)
                  .map((r) => `${r.title} (${r.url})`)
                  .join(' | ')}`
              )
            }
            className="flex items-center justify-center gap-1.5 bg-[var(--cmd-green-soft)] border border-[var(--cmd-green-ring)] text-[var(--cmd-green)] py-2 rounded-lg text-[11px] font-semibold"
          >
            <Sparkles className="w-3.5 h-3.5" />
            ارسال همهٔ نتایج به استعلام هوشمند گوگل
          </button>

          {response.notes.length > 0 && (
            <details className="text-[10px] text-slate-500">
              <summary className="cursor-pointer flex items-center gap-1">
                <Newspaper className="w-3 h-3" />
                گزارش موتورهای جایگزین
              </summary>
              <ul className="mt-1 space-y-1 pr-3">
                {response.notes.map((note, idx) => (
                  <li key={idx} className="list-disc leading-relaxed">
                    {note}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {!response && !loading && (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-3 text-[10px] text-slate-400 leading-relaxed">
          یکی از پرسش‌های آماده را بزنید یا عبارت خود را جستجو کنید؛ نتیجه‌ها با منبع و دامنه نمایش داده می‌شوند و می‌توانید همان‌ها را
          برای تحلیل عملیاتی به «استعلام هوشمند گوگل» بفرستید.
        </div>
      )}
    </div>
  );
};
