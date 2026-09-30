import React, { useState } from 'react';
import {
  Search,
  MapPin,
  Compass,
  ExternalLink,
  Loader2,
  Sparkles,
  AlertCircle,
  Copy,
  Check,
  Globe2,
  ShieldCheck,
  Truck,
  ArrowRight,
} from 'lucide-react';
import {
  fetchSearchGrounding,
  fetchMapsGrounding,
  fetchCorridorAdvisor,
} from '../services/api';
import {
  SearchGroundingResponse,
  MapsGroundingResponse,
  Crossing,
  Corridor,
  CountryRoadNetwork,
  MapFocusTarget,
  MapSearchPin,
} from '../types';
import { QUICK_SEARCH_PROMPTS, MAPS_PROMPT_PRESETS } from '../data/atlasData';
import { GEO_DISTANCE_LABELS, attachRoadPaths, buildGazetteer, geoTagResults } from '../services/geoTagging';
import { searchWeb, WebSearchResponse } from '../services/webSearch';

interface AiSearchGroundingHubProps {
  selectedCrossing: Crossing | null;
  onSelectCoordinates?: (lat: number, lng: number) => void;
  onFocusLocationOnMap?: (lat: number, lng: number, zoom?: number) => void;
  /** دادهٔ اطلس برای مکان‌یابی نتایج روی نقشه */
  crossings?: Crossing[];
  roadNetwork?: Record<string, CountryRoadNetwork>;
  corridors?: Corridor[];
  onDrawPins?: (pins: MapSearchPin[]) => void;
  onFocusPoint?: (target: MapFocusTarget) => void;
}

export const AiSearchGroundingHub: React.FC<AiSearchGroundingHubProps> = ({
  selectedCrossing,
  onFocusLocationOnMap,
  crossings = [],
  roadNetwork = {},
  corridors = [],
  onDrawPins,
  onFocusPoint,
}) => {
  const [activeMode, setActiveMode] = useState<'search' | 'maps' | 'advisor'>('search');

  // مکان‌یابی نتایج استعلام هوشمند روی نقشه (بدون کلید اضافی)
  const gazetteer = React.useMemo(
    () => buildGazetteer({ crossings, roadNetwork, corridors }),
    [crossings, roadNetwork, corridors]
  );
  const [groundedPins, setGroundedPins] = useState<MapSearchPin[]>([]);
  // زنجیرهٔ جستجوی واقعی وب به‌عنوان جایگزین وقتی کلید دستیار هوشمند در دسترس نیست
  const [fallback, setFallback] = useState<WebSearchResponse | null>(null);
  const [isFallbackLoading, setIsFallbackLoading] = useState(false);

  const tagGroundedPlaces = async (text: string, sources: { uri: string; title: string }[]) => {
    if (gazetteer.length === 0) return;
    const results = [
      { title: 'جمع‌بندی زندهٔ استعلام', snippet: text, url: '', source: 'ai-grounding' },
      ...sources.map((source) => ({ title: source.title, snippet: '', url: source.uri, source: source.uri })),
    ];
    const tagged = await geoTagResults(results, gazetteer, crossings, { roadDistance: true });
    const limited = tagged.pins.slice(0, 14);
    setGroundedPins(limited);
    if (onDrawPins) onDrawPins(limited);
    // مسیرهای واقعی جاده‌ای در پس‌زمینه پس‌چسب می‌شوند
    void attachRoadPaths(limited).then((patched) => {
      setGroundedPins(patched);
      if (onDrawPins) onDrawPins(patched);
    });
  };

  /** اجرای جستجوی واقعی وب و مکان‌یابی نتایج روی نقشه (بدون نیاز به کلید هوش مصنوعی) */
  const runWebFallback = async (query: string) => {
    if (!query.trim() || gazetteer.length === 0) return;
    setIsFallbackLoading(true);
    try {
      const data = await searchWeb({ query, mode: 'web', num: 8 });
      setFallback(data);
      const tagged = await geoTagResults(data.results, gazetteer, crossings, { roadDistance: true });
      const limited = tagged.pins.slice(0, 14);
      setGroundedPins(limited);
      if (onDrawPins) onDrawPins(limited);
      void attachRoadPaths(limited).then((patched) => {
        setGroundedPins(patched);
        if (onDrawPins) onDrawPins(patched);
      });
    } catch {
      // زنجیرهٔ جستجو هم پاسخ نداد؛ پیام خطای اصلی باقی می‌ماند
    } finally {
      setIsFallbackLoading(false);
    }
  };

  // Search grounding states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCrossingName, setSearchCrossingName] = useState(selectedCrossing ? selectedCrossing.name : '');
  const [searchCategory, setSearchCategory] = useState('وضعیت صف و تردد');
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<SearchGroundingResponse | null>(null);

  // Maps grounding states
  const [mapsQuery, setMapsQuery] = useState('');
  const [mapsLat, setMapsLat] = useState<string>(selectedCrossing ? String(selectedCrossing.lat) : '39.38');
  const [mapsLng, setMapsLng] = useState<string>(selectedCrossing ? String(selectedCrossing.lng) : '44.38');
  const [isMapsLoading, setIsMapsLoading] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [mapsResult, setMapsResult] = useState<MapsGroundingResponse | null>(null);

  // Advisor states
  const [advisorOrigin, setAdvisorOrigin] = useState('تهران');
  const [advisorDestination, setAdvisorDestination] = useState('استانبول');
  const [advisorCargo, setAdvisorCargo] = useState('پتروشیمی و پلیمر');
  const [advisorWeight, setAdvisorWeight] = useState(24);
  const [advisorMode, setAdvisorMode] = useState('جاده‌ای تیر (TIR)');
  const [isAdvisorLoading, setIsAdvisorLoading] = useState(false);
  const [advisorError, setAdvisorError] = useState<string | null>(null);
  const [advisorResult, setAdvisorResult] = useState<SearchGroundingResponse | null>(null);

  const [copied, setCopied] = useState(false);

  // Sync if selectedCrossing changes
  React.useEffect(() => {
    if (selectedCrossing) {
      setSearchCrossingName(selectedCrossing.name);
      setMapsLat(String(selectedCrossing.lat));
      setMapsLng(String(selectedCrossing.lng));
      if (!mapsQuery) {
        setMapsQuery(`تیرپارک‌ها، پارکینگ کامیون و پایانه گمرکی در حوالی مرز ${selectedCrossing.name}`);
      }
    }
  }, [selectedCrossing]);

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Run Search Grounding
  const handleSearchSubmit = async (e?: React.FormEvent, customQuery?: string) => {
    if (e) e.preventDefault();
    const q = customQuery || searchQuery;
    if (!q.trim()) return;

    setIsSearchLoading(true);
    setSearchError(null);

    try {
      const data = await fetchSearchGrounding({
        query: q,
        crossingName: searchCrossingName || undefined,
        category: searchCategory,
      });
      setSearchResult(data);
      setFallback(null);
      await tagGroundedPlaces(data.text || '', data.sources || []);
    } catch (err: any) {
      setSearchError(err.message || 'خطا در برقراری ارتباط با سرویس جستجوی گوگل');
      setIsSearchLoading(false);
      await runWebFallback(q);
      return;
    } finally {
      setIsSearchLoading(false);
    }
  };

  // Run Maps Grounding
  const handleMapsSubmit = async (e?: React.FormEvent, customQuery?: string, lat?: number, lng?: number) => {
    if (e) e.preventDefault();
    const q = customQuery || mapsQuery;
    if (!q.trim()) return;

    setIsMapsLoading(true);
    setMapsError(null);

    const latitude = lat ?? (mapsLat ? parseFloat(mapsLat) : undefined);
    const longitude = lng ?? (mapsLng ? parseFloat(mapsLng) : undefined);

    try {
      const data = await fetchMapsGrounding({
        query: q,
        latitude,
        longitude,
      });
      setMapsResult(data);

      if (latitude && longitude && onFocusLocationOnMap) {
        onFocusLocationOnMap(latitude, longitude, 11);
      }
    } catch (err: any) {
      setMapsError(err.message || 'خطا در دریافت اطلاعات مکانی گوگل مپس');
    } finally {
      setIsMapsLoading(false);
    }
  };

  // Run Advisor
  const handleAdvisorSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsAdvisorLoading(true);
    setAdvisorError(null);

    try {
      const data = await fetchCorridorAdvisor({
        origin: advisorOrigin,
        destination: advisorDestination,
        cargoType: advisorCargo,
        weightTons: advisorWeight,
        selectedMode: advisorMode,
      });
      setAdvisorResult(data);
      setFallback(null);
      await tagGroundedPlaces(data.text || '', data.sources || []);
    } catch (err: any) {
      setAdvisorError(err.message || 'خطا در ارزیابی استراتژیک کریدور');
      setIsAdvisorLoading(false);
      await runWebFallback(`${advisorOrigin} ${advisorDestination} ${advisorCargo} ترانزیت مرزی`);
      return;
    } finally {
      setIsAdvisorLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-3 font-['Vazirmatn']">
      {/* Hero Header — کارت سبز امضایی (سربرگ Trafic Insights) */}
      <div className="bg-[var(--cmd-green-soft)] border border-[var(--cmd-green-ring)] rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-2 text-[var(--cmd-green)] font-bold text-sm mb-1">
          <Sparkles className="w-4 h-4" />
          <span>هاب جستجو و دسترسی واقعی به داده‌های ترانزیتی و مرزی</span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          دسترسی برخط به آخرین وضعیت صفوف و پایانه‌ها، ترخیص گمرکی و اخبار مرزی با <strong>دستیار هوشمند ترانزیتی</strong> و استعلام مکان‌های لجستیکی با <strong>موتور مکانی سامانه</strong>.
        </p>
      </div>

      {/* Mode Switcher — سه زبانه با فعال سبز کروم (Overview) */}
      <div className="grid grid-cols-3 gap-1 bg-slate-900/70 p-1 border border-slate-700/60 rounded-xl">
        <button
          onClick={() => setActiveMode('search')}
          className={`flex items-center justify-center gap-1.5 py-2 px-1 text-xs font-semibold rounded-lg transition-all ${
            activeMode === 'search'
              ? 'btn-cmd-green shadow-md font-bold'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          <span>جستجوی وب گوگل</span>
        </button>

        <button
          onClick={() => setActiveMode('maps')}
          className={`flex items-center justify-center gap-1.5 py-2 px-1 text-xs font-semibold rounded-lg transition-all ${
            activeMode === 'maps'
              ? 'btn-cmd-green shadow-md font-bold'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <MapPin className="w-3.5 h-3.5" />
          <span>اماکن گوگل مپس</span>
        </button>

        <button
          onClick={() => setActiveMode('advisor')}
          className={`flex items-center justify-center gap-1.5 py-2 px-1 text-xs font-semibold rounded-lg transition-all ${
            activeMode === 'advisor'
              ? 'btn-cmd-green shadow-md font-bold'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          <span>مشاور کریدور</span>
        </button>
      </div>

      {/* Mode 1: Search Grounding */}
      {activeMode === 'search' && (
        <div className="flex flex-col gap-3">
          {/* Quick Presets */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400">استعلام‌های سریع بلادرنگ:</span>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_SEARCH_PROMPTS.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setSearchQuery(item.query);
                    setSearchCrossingName(item.crossingName);
                    setSearchCategory(item.category);
                    handleSearchSubmit(undefined, item.query);
                  }}
                  className="text-[11px] bg-slate-800/80 hover:bg-[var(--cmd-green-soft)] hover:border-[var(--cmd-green-ring)] text-slate-300 hover:text-[var(--cmd-green)] border border-slate-700 px-2.5 py-1 rounded-full transition-all text-right"
                >
                  ⚡ {item.title}
                </button>
              ))}
            </div>
          </div>

          {/* Search Form */}
          <form onSubmit={handleSearchSubmit} className="flex flex-col gap-2.5 bg-slate-900/50 p-3 rounded-xl border border-slate-800">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">پرسش یا استعلام وضعیت مرزی:</label>
              <textarea
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="مثلاً: آخرین وضعیت ترافیک و صف کامیون‌ها در بازرگان، یا شرایط عبور بار فسادپذیر از آستارا..."
                rows={2}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[var(--cmd-green)]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-400 mb-0.5">نام مرز (اختیاری):</label>
                <input
                  type="text"
                  value={searchCrossingName}
                  onChange={(e) => setSearchCrossingName(e.target.value)}
                  placeholder="مثال: بازرگان، مهران..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-0.5">موضوع استعلام:</label>
                <select
                  value={searchCategory}
                  onChange={(e) => setSearchCategory(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-100"
                >
                  <option value="وضعیت صف و تردد">وضعیت صف و تردد کامیون</option>
                  <option value="مقررات گمرکی و تیر">مقررات گمرک و کارنه تیر (TIR)</option>
                  <option value="صادرات و ترخیص">ترخیص و محدودیت‌های فصلی</option>
                  <option value="تعرفه‌ها و توافقات">تعرفه و توافق‌نامه‌های دوجانبه</option>
                  <option value="حمل‌ونقل ریلی">ترانزیت و تبادل ریلی</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSearchLoading || !searchQuery.trim()}
              className="mt-1 flex items-center justify-center gap-2 btn-cmd-green font-bold py-2 rounded-lg text-xs transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSearchLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>در حال جستجوی بلادرنگ در وب…</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>استعلام برخط با دستیار هوشمند</span>
                </>
              )}
            </button>
          </form>

          {/* Search Error */}
          {searchError && (
            <div className="flex items-center gap-2 p-3 bg-red-950/40 border border-red-500/40 rounded-xl text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{searchError}</span>
            </div>
          )}

          <WebFallbackCard
            response={fallback}
            isLoading={isFallbackLoading}
            pins={groundedPins}
            onFocusPoint={onFocusPoint}
            onClearPins={() => {
              setGroundedPins([]);
              if (onDrawPins) onDrawPins([]);
            }}
          />

          {/* Search Result */}
          {searchResult && (
            <div className="flex flex-col gap-3 bg-slate-900/80 border border-slate-700/80 rounded-xl p-3.5 shadow-md">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-1.5 text-[var(--cmd-green)] font-bold text-xs">
                  <Globe2 className="w-4 h-4" />
                  <span>نتایج زنده وب گوگل (Grounded Intelligence)</span>
                </div>
                <button
                  onClick={() => handleCopyText(searchResult.text)}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 bg-slate-800 px-2 py-0.5 rounded"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'کپی شد' : 'کپی'}</span>
                </button>
              </div>

              {/* Text content */}
              <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-line space-y-2">
                {searchResult.text}
              </div>

              {/* Verified Sources */}
              {searchResult.sources && searchResult.sources.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-800 flex flex-col gap-1.5">
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>منابع تأیید شده گوگل:</span>
                  </div>
                  <div className="flex flex-col gap-1 max-h-36 overflow-y-auto pr-1">
                    {searchResult.sources.map((src, i) => (
                      <a
                        key={i}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between text-[11px] text-[var(--tone-sky)] hover:text-[var(--tone-sky)]/80 bg-slate-950/60 p-1.5 rounded-lg border border-slate-800/80 transition-colors"
                      >
                        <span className="truncate max-w-[260px] text-right">{src.title}</span>
                        <ExternalLink className="w-3 h-3 shrink-0 mr-1 opacity-70" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <GroundedPlacesCard
                pins={groundedPins}
                onFocusPoint={onFocusPoint}
                onClear={() => {
                  setGroundedPins([]);
                  if (onDrawPins) onDrawPins([]);
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Mode 2: Maps Grounding */}
      {activeMode === 'maps' && (
        <div className="flex flex-col gap-3">
          {/* Quick Presets */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400">اماکن کلیدی ترانزیتی:</span>
            <div className="flex flex-wrap gap-1.5">
              {MAPS_PROMPT_PRESETS.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setMapsQuery(item.query);
                    setMapsLat(String(item.lat));
                    setMapsLng(String(item.lng));
                    handleMapsSubmit(undefined, item.query, item.lat, item.lng);
                  }}
                  className="text-[11px] bg-slate-800/80 hover:bg-[var(--cmd-green-soft)] hover:border-[var(--cmd-green-ring)] text-slate-300 hover:text-[var(--cmd-green)] border border-slate-700 px-2.5 py-1 rounded-full transition-all text-right"
                >
                  📍 {item.title}
                </button>
              ))}
            </div>
          </div>

          {/* Maps Form */}
          <form onSubmit={handleMapsSubmit} className="flex flex-col gap-2.5 bg-slate-900/50 p-3 rounded-xl border border-slate-800">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">مکان مورد استعلام در گوگل مپس:</label>
              <textarea
                value={mapsQuery}
                onChange={(e) => setMapsQuery(e.target.value)}
                placeholder="مثلاً: تیرپارک، پارکینگ کامیون، باسکول و انبار کانتینری در مرز بازرگان ماکو..."
                rows={2}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[var(--cmd-green)]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-400 mb-0.5">عرض جغرافیایی (Lat):</label>
                <input
                  type="text"
                  value={mapsLat}
                  onChange={(e) => setMapsLat(e.target.value)}
                  placeholder="مثال: 39.38"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-0.5">طول جغرافیایی (Lng):</label>
                <input
                  type="text"
                  value={mapsLng}
                  onChange={(e) => setMapsLng(e.target.value)}
                  placeholder="مثال: 44.38"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-100"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isMapsLoading || !mapsQuery.trim()}
              className="mt-1 flex items-center justify-center gap-2 btn-cmd-green font-bold py-2 rounded-lg text-xs transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isMapsLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>در حال جستجوی اماکن و تأسیسات…</span>
                </>
              ) : (
                <>
                  <MapPin className="w-4 h-4" />
                  <span>استعلام اماکن با دستیار هوشمند</span>
                </>
              )}
            </button>
          </form>

          {/* Maps Error */}
          {mapsError && (
            <div className="flex items-center gap-2 p-3 bg-red-950/40 border border-red-500/40 rounded-xl text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{mapsError}</span>
            </div>
          )}

          {/* Maps Result */}
          {mapsResult && (
            <div className="flex flex-col gap-3 bg-slate-900/80 border border-slate-700/80 rounded-xl p-3.5 shadow-md">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-1.5 text-[var(--tone-sky)] font-bold text-xs">
                  <MapPin className="w-4 h-4" />
                  <span>اماکن شناسایی‌شده در گوگل مپس ({mapsResult.places.length})</span>
                </div>
                <button
                  onClick={() => handleCopyText(mapsResult.text)}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 bg-slate-800 px-2 py-0.5 rounded"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>کپی</span>
                </button>
              </div>

              {/* Text content */}
              <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-line">
                {mapsResult.text}
              </div>

              {/* Places List */}
              {mapsResult.places && mapsResult.places.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-800 flex flex-col gap-2">
                  <span className="text-[11px] font-semibold text-slate-400">لینک‌های مستقیم به نقشه گوگل:</span>
                  <div className="flex flex-col gap-1.5">
                    {mapsResult.places.map((place, i) => (
                      <div key={i} className="flex flex-col gap-1 bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                        <a
                          href={place.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between text-xs font-semibold text-[var(--tone-sky)] hover:text-[var(--tone-sky)]/80"
                        >
                          <span className="truncate">{place.title}</span>
                          <ExternalLink className="w-3.5 h-3.5 shrink-0 mr-1 text-[var(--tone-sky)]" />
                        </a>
                        {place.reviewSnippets && place.reviewSnippets.length > 0 && (
                          <div className="text-[10px] text-slate-400 border-r-2 border-[var(--tone-sky)]/40 pr-1.5 mt-0.5">
                            {place.reviewSnippets[0]}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Mode 3: Corridor AI Advisor */}
      {activeMode === 'advisor' && (
        <div className="flex flex-col gap-3">
          <form onSubmit={handleAdvisorSubmit} className="flex flex-col gap-2.5 bg-slate-900/50 p-3 rounded-xl border border-slate-800">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-400 mb-0.5">شهر مبدأ:</label>
                <input
                  type="text"
                  value={advisorOrigin}
                  onChange={(e) => setAdvisorOrigin(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-0.5">شهر مقصد:</label>
                <input
                  type="text"
                  value={advisorDestination}
                  onChange={(e) => setAdvisorDestination(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-[11px] text-slate-400 mb-0.5">نوع محموله:</label>
                <input
                  type="text"
                  value={advisorCargo}
                  onChange={(e) => setAdvisorCargo(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-0.5">وزن (تن):</label>
                <input
                  type="number"
                  value={advisorWeight}
                  onChange={(e) => setAdvisorWeight(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-0.5">شیوه حمل پیشنهادی:</label>
              <select
                value={advisorMode}
                onChange={(e) => setAdvisorMode(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-100"
              >
                <option value="جاده‌ای تیر (TIR)">جاده‌ای یکسره با کارنه تیر (TIR)</option>
                <option value="ریلی ترکیبی">حمل ریلی ترانزیتی (باری/کانتینری)</option>
                <option value="ترکیبی جاده-دریا (رورو یا فیدر)">ترکیبی جاده-دریا (خلیج فارس یا دریای کاسپین)</option>
                <option value="هوایی سریع">هوایی کارگو (Air Cargo)</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={isAdvisorLoading}
              className="mt-1 flex items-center justify-center gap-2 btn-cmd-green font-bold py-2 rounded-lg text-xs transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAdvisorLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>در حال استعلام برخط و تحلیل زنجیره…</span>
                </>
              ) : (
                <>
                  <Compass className="w-4 h-4" />
                  <span>تحلیل استراتژیک زنجیره حمل</span>
                </>
              )}
            </button>
          </form>

          {advisorError && (
            <div className="flex items-center gap-2 p-3 bg-red-950/40 border border-red-500/40 rounded-xl text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{advisorError}</span>
            </div>
          )}

          <WebFallbackCard
            response={fallback}
            isLoading={isFallbackLoading}
            pins={groundedPins}
            onFocusPoint={onFocusPoint}
            onClearPins={() => {
              setGroundedPins([]);
              if (onDrawPins) onDrawPins([]);
            }}
          />

          {advisorResult && (
            <div className="flex flex-col gap-3 bg-slate-900/80 border border-[var(--cmd-green-ring)] rounded-xl p-3.5 shadow-md">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-1.5 text-[var(--cmd-green)] font-bold text-xs">
                  <Compass className="w-4 h-4" />
                  <span>توصیه‌نامه ترانزیتی و اسنادی (بر خط)</span>
                </div>
                <button
                  onClick={() => handleCopyText(advisorResult.text)}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 bg-slate-800 px-2 py-0.5 rounded"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>کپی</span>
                </button>
              </div>

              <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-line space-y-2">
                {advisorResult.text}
              </div>

              {advisorResult.sources && advisorResult.sources.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-800 flex flex-col gap-1.5">
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                    <ShieldCheck className="w-3.5 h-3.5 text-[var(--cmd-green)]" />
                    <span>منابع تأیید شده وب:</span>
                  </div>
                  <div className="flex flex-col gap-1 max-h-32 overflow-y-auto pr-1">
                    {advisorResult.sources.map((src, i) => (
                      <a
                        key={i}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between text-[11px] text-[var(--tone-violet)] hover:text-[var(--tone-violet)]/80 bg-slate-950/60 p-1.5 rounded-lg border border-slate-800/80"
                      >
                        <span className="truncate max-w-[260px] text-right">{src.title}</span>
                        <ExternalLink className="w-3 h-3 shrink-0 mr-1 opacity-70" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <GroundedPlacesCard
                pins={groundedPins}
                onFocusPoint={onFocusPoint}
                onClear={() => {
                  setGroundedPins([]);
                  if (onDrawPins) onDrawPins([]);
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/** نتایج زنجیرهٔ جستجوی واقعی وب با مکان‌یابی روی نقشه — جایگزین استعلام هوشمند در نبود کلید */
const WebFallbackCard: React.FC<{
  response: WebSearchResponse | null;
  isLoading: boolean;
  pins: MapSearchPin[];
  onFocusPoint?: (target: MapFocusTarget) => void;
  onClearPins: () => void;
}> = ({ response, isLoading, pins, onFocusPoint, onClearPins }) => {
  if (isLoading && !response) {
    return (
      <div className="flex items-center gap-2 p-3 bg-slate-900/70 border border-slate-700/70 rounded-xl text-slate-300 text-xs">
        <Loader2 className="w-4 h-4 animate-spin text-[var(--cmd-green)]" />
        <span>استعلام هوشمند گوگل در دسترس نیست؛ اجرای زنجیرهٔ جستجوی واقعی وب و رسم مسیر جاده‌ای…</span>
      </div>
    );
  }
  if (!response) return null;

  return (
    <div className="flex flex-col gap-2 bg-slate-900/80 border border-[var(--cmd-green-ring)] rounded-xl p-3.5 shadow-md">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <span className="flex items-center gap-1.5 text-[var(--cmd-green)] font-bold text-xs">
          <Globe2 className="w-4 h-4" />
          <span>نتایج زندهٔ وب — {response.providerLabel}</span>
        </span>
        <span className="text-[10px] text-slate-400">{response.results.length.toLocaleString('fa-IR')} نتیجه</span>
      </div>

      <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
        {response.results.map((item, i) => (
          <a
            key={i}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col gap-0.5 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 hover:border-[var(--cmd-green-ring)] transition-colors"
          >
            <span className="flex items-center justify-between gap-1 text-[11px] font-semibold text-[var(--cmd-green)]">
              <span className="truncate">{item.title}</span>
              <ExternalLink className="w-3 h-3 shrink-0 opacity-70" />
            </span>
            {item.snippet && (
              <span className="text-[10px] text-slate-400 leading-relaxed line-clamp-3">{item.snippet}</span>
            )}
            <span className="text-[9px] text-slate-500" dir="ltr">
              {item.source}
            </span>
          </a>
        ))}
      </div>

      <GroundedPlacesCard pins={pins} onFocusPoint={onFocusPoint} onClear={onClearPins} />
    </div>
  );
};

/** مکان‌های شناسایی‌شدهٔ استعلام روی نقشه — کلیک روی هر مورد نقشه را روی آن می‌برد */
const GroundedPlacesCard: React.FC<{
  pins: MapSearchPin[];
  onFocusPoint?: (target: MapFocusTarget) => void;
  onClear: () => void;
}> = ({ pins, onFocusPoint, onClear }) => {
  if (pins.length === 0) return null;

  return (
    <div className="mt-2 pt-2 border-t border-slate-800 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-300">
          <MapPin className="w-3.5 h-3.5" />
          {pins.length.toLocaleString('fa-IR')} مکان روی نقشه مشخص شد
        </span>
        <button onClick={onClear} className="text-[10px] text-slate-500 hover:text-rose-300">
          پاک کردن نشانه‌ها
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {pins.map((pin) => (
          <button
            key={pin.id}
            onClick={() => onFocusPoint?.({ lat: pin.lat, lng: pin.lng, zoom: pin.kind === 'country' ? 5 : 8, seq: Date.now() })}
            className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-lg border border-slate-700 bg-slate-950/70 text-slate-300 hover:border-amber-500/60"
            title={
              pin.nearestGateName
                ? `نزدیک‌ترین گذرگاه (${pin.nearestGateRoad ? GEO_DISTANCE_LABELS.road : GEO_DISTANCE_LABELS.air}): ${pin.nearestGateName} — ${pin.nearestGateKm} کیلومتر`
                : pin.title
            }
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: pin.color }} />
            {pin.label}
            {pin.nearestGateName && (pin.nearestGateKm ?? 0) >= 5 && (
              <span className="text-slate-500">
                · {pin.nearestGateName} ({pin.nearestGateKm?.toLocaleString('fa-IR')} km
                {pin.nearestGateRoad ? ' جاده‌ای' : ' هوایی'})
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};
