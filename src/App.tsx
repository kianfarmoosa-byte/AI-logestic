import React, { useState, useMemo, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import {
  Search,
  MapPin,
  Route,
  Layers,
  Sparkles,
  BarChart3,
  SlidersHorizontal,
  ChevronRight,
  ChevronLeft,
  Compass,
  Radar,
  Truck,
} from 'lucide-react';
import { DATA, RN } from './data/atlasData';
import {
  Crossing,
  Corridor,
  IsochroneOverlay,
  MapFocusTarget,
  MapSearchPin,
  RouteOverlay,
  SavedRoute,
} from './types';
import { loadOrganizationalRoutes } from './services/routeEngine';
import type { BorderParkSnapshot } from './services/borderPark';
import { Topbar } from './components/Topbar';
import { FilterView } from './components/FilterView';
import { BorderFlowDashboard } from './components/BorderFlowDashboard';

/* تقسیم کد: نقشهٔ سنگین (MapLibre) و پنل‌های تب فقط در اولین نیاز بارگذاری می‌شوند */
const MapAtlas = lazy(() => import('./components/MapAtlas').then((m) => ({ default: m.MapAtlas })));
const GlobalSearchModal = lazy(() => import('./components/GlobalSearchModal').then((m) => ({ default: m.GlobalSearchModal })));
const CrossingDrawer = lazy(() => import('./components/CrossingDrawer').then((m) => ({ default: m.CrossingDrawer })));
const AiSearchGroundingHub = lazy(() => import('./components/AiSearchGroundingHub').then((m) => ({ default: m.AiSearchGroundingHub })));
const WebSearchPanel = lazy(() => import('./components/WebSearchPanel').then((m) => ({ default: m.WebSearchPanel })));
const LiveDataHub = lazy(() => import('./components/LiveDataHub').then((m) => ({ default: m.LiveDataHub })));
const TransitPathfinder = lazy(() => import('./components/TransitPathfinder').then((m) => ({ default: m.TransitPathfinder })));
const RouteStudio = lazy(() => import('./components/RouteStudio').then((m) => ({ default: m.RouteStudio })));
const MultimodalPlanner = lazy(() => import('./components/MultimodalPlanner').then((m) => ({ default: m.MultimodalPlanner })));
const RoadNetworkView = lazy(() => import('./components/RoadNetworkView').then((m) => ({ default: m.RoadNetworkView })));
const AnalyticsView = lazy(() => import('./components/AnalyticsView').then((m) => ({ default: m.AnalyticsView })));

/** نمایشگر بارگذاری بخش‌های code-split شده — هم‌سبک پوستهٔ سبز KEMETRA */
function SectionLoader({ label, full }: { label: string; full?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 text-slate-400 ${full ? 'h-full w-full' : 'py-20'}`}>
      <span className="relative flex h-7 w-7">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--cmd-green)] opacity-30" />
        <span className="relative inline-flex h-7 w-7 animate-spin rounded-full border-2 border-[var(--cmd-green)] border-t-transparent" />
      </span>
      <span className="text-[11px] font-medium">{label}</span>
    </div>
  );
}

/** تب‌های پنل کناری — منبع واحد برای هدر باز و ریل عمودی جمع‌شده */
const PANEL_TABS: { id: AppTabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'ai', label: 'استعلام هوشمند ترانزیتی', icon: Sparkles },
  { id: 'websearch', label: 'جستجوی زندهٔ وب', icon: Search },
  { id: 'borderflow', label: 'جریان مرزها', icon: Truck },
  { id: 'livedata', label: 'داده‌های زنده', icon: Radar },
  { id: 'filter', label: 'فیلتر گذرگاه‌ها', icon: SlidersHorizontal },
  { id: 'pathfinder', label: 'ترانزیت‌یاب (A*)', icon: Route },
  { id: 'route', label: 'مسیریاب حمل و نقل', icon: Truck },
  { id: 'multimodal', label: 'زنجیره حمل چندوجهی', icon: Layers },
  { id: 'network', label: 'شبکه ۲۴ کشور', icon: MapPin },
  { id: 'analytics', label: 'تحلیل و آمار', icon: BarChart3 },
];

type AppTabId = 'ai' | 'websearch' | 'borderflow' | 'livedata' | 'filter' | 'pathfinder' | 'route' | 'multimodal' | 'network' | 'analytics';

/** در RTL، scrollLeft منفی است؛ «start» یعنی ابتدای فهرست (سمت راست) */
const tabScrollAmount = (el: HTMLElement) => Math.max(120, el.clientWidth * 0.6);

export default function App() {
  const [darkTheme, setDarkTheme] = useState(true);
  const [activeTab, setActiveTab] = useState<AppTabId>('borderflow');
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  /** عرض اشغال‌شدهٔ پنل کناری برای هم‌گام‌کردن دوربین نقشه */
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelOffset, setPanelOffset] = useState(0);

  // اسکرول افقی تب‌های پنل: تشخیص سرریز + پیمایش برنامه‌ای (سازگار با RTL)
  const tabsRef = useRef<HTMLElement>(null);
  const [tabOverflow, setTabOverflow] = useState({ start: false, end: false });

  const updateTabOverflow = useCallback(() => {
    const el = tabsRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 4) {
      setTabOverflow({ start: false, end: false });
      return;
    }
    const sl = el.scrollLeft; // در RTL: 0 در ابتدا، منفی تا -max در انتها
    setTabOverflow({ start: sl < -2, end: sl > -max + 2 });
  }, []);

  useEffect(() => {
    const el = tabsRef.current;
    if (!el || isPanelCollapsed) return;
    updateTabOverflow();
    const ro = new ResizeObserver(updateTabOverflow);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isPanelCollapsed, updateTabOverflow]);

  const scrollTabs = (dir: 'start' | 'end') => {
    const el = tabsRef.current;
    if (!el) return;
    const delta = tabScrollAmount(el);
    el.scrollBy({ left: dir === 'start' ? -delta : delta, behavior: 'smooth' });
  };

  // Crossings filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set(['road', 'combined']));
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [selectedDepths, setSelectedDepths] = useState<Set<string>>(new Set(['1', '2', '3']));
  const [selectedConfs, setSelectedConfs] = useState<Set<string>>(new Set(['بالا', 'متوسط', 'پایین']));

  // Corridors toggle
  const [activeCorridors, setActiveCorridors] = useState<boolean[]>(
    DATA.corridors.map(() => true)
  );

  // Selected Crossing for Drawer
  const [selectedCrossing, setSelectedCrossing] = useState<Crossing | null>(null);

  // Map Selected Route Path
  const [selectedRoutePath, setSelectedRoutePath] = useState<[number, number][] | undefined>(undefined);
  const [highlightedGateId, setHighlightedGateId] = useState<number | null>(null);

  // مسیریابی و حمل‌ونقل: لایه‌های نقشه، ترسیم دستی و مسیرهای سازمانی
  const [routeOverlays, setRouteOverlays] = useState<RouteOverlay[]>([]);
  const [isochroneOverlays, setIsochroneOverlays] = useState<IsochroneOverlay[]>([]);
  const [pickTarget, setPickTarget] = useState<'origin' | 'destination' | null>(null);
  const [pickedLocation, setPickedLocation] = useState<{
    lat: number;
    lng: number;
    name?: string;
    target: 'origin' | 'destination';
    seq: number;
  } | null>(null);
  const [draftPath, setDraftPath] = useState<[number, number][]>([]);
  const [drawMode, setDrawMode] = useState(false);
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>(() => loadOrganizationalRoutes());

  // مکان‌یابی نتایج جستجوی وب روی نقشه
  const [searchPins, setSearchPins] = useState<MapSearchPin[]>([]);
  const [mapFocus, setMapFocus] = useState<MapFocusTarget | null>(null);

  // وضعیت زندهٔ صف گمرکات (سامانهٔ نوبتدهی Border Park) برای لایهٔ زندهٔ نقشه
  const [liveGates, setLiveGates] = useState<BorderParkSnapshot[]>([]);
  useEffect(() => {
    let alive = true;
    fetch('/api/border-park/status')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { gates?: BorderParkSnapshot[] }) => {
        if (alive && Array.isArray(data?.gates)) setLiveGates(data.gates);
      })
      .catch(() => {
        // بدون دادهٔ زنده، نقشه به رنگ‌بندی نوع گذرگاه برمی‌گردد
      });
    return () => {
      alive = false;
    };
  }, []);

  // Global Search Modal
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  // Query to seed AI Search Hub
  const [initialAiQuery, setInitialAiQuery] = useState<string | null>(null);

  // Listen to keyboard shortcut Ctrl+K or Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchModalOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // اندازه‌گیری پنل کناری: دوربین و نمای نقشه باید فضای اشغال‌شده را بدانند
  useEffect(() => {
    const node = panelRef.current;
    if (!node) return;

    const update = () => {
      const rect = node.getBoundingClientRect();
      const right = parseFloat(window.getComputedStyle(node).right) || 0;
      setPanelOffset(Math.round(rect.width + right + 12));
    };

    update();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(node);
    window.addEventListener('resize', update);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [isPanelCollapsed]);

  // Countries list for filter dropdown
  const countriesList = useMemo(() => {
    const set = new Set(DATA.crossings.map((c) => c.country));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fa'));
  }, []);

  // Filtered crossings logic
  const filteredCrossings = useMemo(() => {
    return DATA.crossings.filter((c) => {
      if (!selectedTypes.has(c.layer)) return false;
      if (selectedCountry && c.country !== selectedCountry) return false;

      const d = c.depth && ['1', '2', '3'].includes(c.depth) ? c.depth : 'x';
      if (selectedDepths.size > 0 && c.depth && !selectedDepths.has(d)) return false;

      const cf = c.confidence && ['بالا', 'متوسط', 'پایین'].includes(c.confidence) ? c.confidence : 'x';
      if (selectedConfs.size > 0 && c.confidence && !selectedConfs.has(cf)) return false;

      if (searchQuery.trim()) {
        const text = `${c.name} ${c.name_en || ''} ${c.country} ${c.opp_name || ''} ${c.corridor || ''}`.toLowerCase();
        if (!text.includes(searchQuery.trim().toLowerCase())) return false;
      }

      return true;
    });
  }, [selectedTypes, selectedCountry, selectedDepths, selectedConfs, searchQuery]);

  // Handlers for filter controls
  const handleToggleType = (type: string) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const handleToggleDepth = (depth: string) => {
    setSelectedDepths((prev) => {
      const next = new Set(prev);
      if (next.has(depth)) next.delete(depth);
      else next.add(depth);
      return next;
    });
  };

  const handleToggleConf = (conf: string) => {
    setSelectedConfs((prev) => {
      const next = new Set(prev);
      if (next.has(conf)) next.delete(conf);
      else next.add(conf);
      return next;
    });
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedTypes(new Set(['road', 'combined']));
    setSelectedCountry('');
    setSelectedDepths(new Set(['1', '2', '3']));
    setSelectedConfs(new Set(['بالا', 'متوسط', 'پایین']));
  };

  const handleToggleCorridor = (index: number) => {
    setActiveCorridors((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  const handleOpenAiSearchWithQuery = (query: string, crossingName?: string) => {
    setActiveTab('ai');
    setIsPanelCollapsed(false);
    setInitialAiQuery(query);
  };

  const handleRouteFrom = (crossing: Crossing) => {
    setActiveTab('pathfinder');
    setIsPanelCollapsed(false);
  };

  const handleRouteTo = (crossing: Crossing) => {
    setActiveTab('pathfinder');
    setIsPanelCollapsed(false);
  };

  const iranGatesCount = useMemo(() => {
    return DATA.crossings.filter((c) => c.country === 'ایران').length;
  }, []);

  return (
    <div className={`relative w-screen h-screen overflow-hidden font-['Vazirmatn'] ${darkTheme ? 'theme-dark bg-[#06080d] text-[#e8ecf3]' : 'bg-[#f7f8f7] text-[#17251b]'}`}>
      {/* Topbar */}
      <Topbar
        totalFiltered={filteredCrossings.length}
        totalAll={DATA.crossings.length}
        iranGatesCount={iranGatesCount}
        darkTheme={darkTheme}
        onToggleTheme={() => setDarkTheme((prev) => !prev)}
        onOpenGlobalSearch={() => setIsSearchModalOpen(true)}
        onOpenAiHub={() => {
          setActiveTab('ai');
          setIsPanelCollapsed(false);
        }}
        activeTab={activeTab}
        crossings={DATA.crossings}
        onFocusGate={(c) => {
          setSelectedCrossing(c);
          setHighlightedGateId(c.id);
          setMapFocus({ lat: c.lat, lng: c.lng, zoom: 11, seq: Date.now() });
        }}
      />

      {/* MapLibre GL Background Map — code-split شده؛ چرخندهٔ هم‌سبک پوسته تا اولین رندر نقشه */}
      <div className="absolute inset-0 pt-[58px]">
        <Suspense fallback={<SectionLoader label="در حال بارگذاری نقشه…" full />}>
          <MapAtlas
          crossings={DATA.crossings}
          corridors={DATA.corridors}
          roadNetwork={RN}
          filteredCrossings={filteredCrossings}
          activeCorridors={activeCorridors}
          darkTheme={darkTheme}
          onSelectCrossing={(crossing) => setSelectedCrossing(crossing)}
          selectedRoutePath={selectedRoutePath}
          highlightedGateId={highlightedGateId}
          routeOverlays={routeOverlays}
          isochroneOverlays={isochroneOverlays}
          drawMode={drawMode}
          draftPath={draftPath}
          onMapClick={(lat, lng) => setDraftPath((prev) => [...prev, [lng, lat]])}
          pickMode={pickTarget}
          onPickLocation={(lat, lng, name) => {
            setPickedLocation({ lat, lng, name, target: pickTarget || 'origin', seq: Date.now() });
            setPickTarget(null);
          }}
          searchPins={searchPins}
          focusTarget={mapFocus}
          panelOffset={panelOffset}
          liveGates={liveGates}
          onOpenSearchResult={(pin) => window.open(pin.url, '_blank', 'noopener,noreferrer')}
          />
        </Suspense>
      </div>

      {/* Floating Bottom/Left Map Legend — قرص شیشه‌ای روشن */}
      <div className="absolute bottom-4 left-4 z-10 hidden sm:flex items-center gap-3 bg-slate-950/92 backdrop-blur-md px-3.5 py-2 rounded-full border border-slate-800 text-[11px] text-slate-300 shadow-lg pointer-events-auto">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
          <span>جاده‌ای</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
          <span>ترکیبی (جاده+ریل)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
          <span>ریلی</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full ring-2 ring-[var(--cmd-green)] bg-[var(--cmd-green)]" />
          <span className="text-[var(--cmd-green)] font-semibold">دروازه ایران</span>
        </div>
      </div>

      {/* Interactive Crossing Detail Drawer */}
      <Suspense fallback={null}>
        <CrossingDrawer
        crossing={selectedCrossing}
        onClose={() => setSelectedCrossing(null)}
        onQueryAiSearch={(query, crossingName) => {
          handleOpenAiSearchWithQuery(query, crossingName);
        }}
        onQueryAiMaps={(query, lat, lng) => {
          handleOpenAiSearchWithQuery(query);
        }}
        onRouteFrom={handleRouteFrom}
        onRouteTo={handleRouteTo}
        />
      </Suspense>

      {/* Main Tabbed Side Control Panel */}
      <div
        ref={panelRef}
        className={`group/panel absolute top-[70px] right-3 bottom-3 z-20 flex flex-col bg-slate-950/92 backdrop-blur-2xl border shadow-[0_12px_40px_-16px_rgba(23,37,27,0.35)] transition-all duration-300 overflow-hidden ${
          isPanelCollapsed
            ? 'w-[52px] border-slate-800 rounded-2xl'
            : 'w-[94vw] sm:w-[420px] md:w-[470px] border-slate-800 rounded-2xl'
        }`}
      >
        {/* هالهٔ سبز امضایی در بالای پنل */}
        {!isPanelCollapsed && (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(ellipse_at_top_right,rgba(116,162,30,0.12),transparent_60%),radial-gradient(ellipse_at_top_left,rgba(116,162,30,0.06),transparent_55%)]" />
        )}

        {/* هدر برند پنل (فقط حالت باز) */}
        {!isPanelCollapsed && (
          <div className="relative flex items-center gap-2.5 px-3.5 pt-3 pb-2.5 border-b border-slate-800 bg-slate-950/60">
            <div className="w-8 h-8 rounded-lg bg-[var(--cmd-green-soft)] border border-[var(--cmd-green-ring)] flex items-center justify-center">
              <Compass className="w-[18px] h-[18px] text-[var(--cmd-green)]" />
            </div>
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-[13px] font-black text-slate-100">کنسول اطلس ترانزیت</span>
              <span className="text-[10px] text-slate-400">گذرگاه‌های مرزی · کریدورها · مسیریابی</span>
            </div>
            <div className="mr-auto flex items-center gap-1.5 shrink-0 pr-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--cmd-green)] opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--cmd-green)]" />
              </span>
              <span className="text-[10px] font-semibold text-[var(--cmd-green)]">برخط</span>
            </div>
          </div>
        )}

        {/* سربرگ ناوبری با تب‌های پیلسی — قابل اسکرول افقی */}
        <div className="relative flex items-center gap-2 border-b border-slate-800/70 p-2 bg-slate-950/50">
          {!isPanelCollapsed && (
            <div className="relative flex-1 min-w-0">
              {/* نشانگرهای محوشدگی دو لبهٔ نوار — فقط وقتی محتوای بیشتری در آن سمت هست */}
              <div
                aria-hidden
                className={`tab-fade tab-fade-start ${tabOverflow.start ? 'opacity-100' : 'opacity-0'}`}
              />
              <div
                aria-hidden
                className={`tab-fade tab-fade-end ${tabOverflow.end ? 'opacity-100' : 'opacity-0'}`}
              />
              {/* دکمه‌های پیمایش چپ/راست — فقط وقتی سرریز وجود دارد */}
              <button
                type="button"
                onClick={() => scrollTabs('start')}
                aria-label="پیمایش تب‌ها به راست"
                className={`tab-scroll-btn tab-scroll-btn-start ${tabOverflow.start ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => scrollTabs('end')}
                aria-label="پیمایش تب‌ها به چپ"
                className={`tab-scroll-btn tab-scroll-btn-end ${tabOverflow.end ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <nav
                ref={tabsRef}
                onScroll={updateTabOverflow}
                aria-label="ابزارهای اطلس"
                className="tab-scroll flex items-center gap-1 py-1 flex-1"
              >
              {PANEL_TABS.map((tab) => {
                const active = activeTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    title={tab.label}
                    aria-current={active ? 'page' : undefined}
                    className={`group/tab relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs shrink-0 transition-all duration-200 ${
                      active
                        ? 'tab-active-green font-bold shadow-[0_0_18px_-8px_var(--cmd-green-ring)]'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800 border border-transparent'
                    }`}
                  >
                    <Icon
                      className={`w-3.5 h-3.5 transition-colors ${
                        active ? 'text-[var(--cmd-green)]' : 'text-slate-500 group-hover/tab:text-slate-300'
                      }`}
                    />
                    <span className="whitespace-nowrap">{tab.label}</span>
                    {active && (
                      <span className="absolute -bottom-[7px] right-2 left-2 h-[2px] rounded-full bg-[var(--cmd-green)]" />
                    )}
                  </button>
                );
              })}
            </nav>
            </div>
          )}

          {/* Collapse / Expand Button */}
          <button
            onClick={() => setIsPanelCollapsed((prev) => !prev)}
            className="p-1.5 text-slate-400 hover:text-[var(--cmd-green)] hover:bg-slate-800 rounded-lg transition-colors shrink-0 border border-transparent hover:border-slate-700"
            title={isPanelCollapsed ? 'باز کردن پنل' : 'جمع کردن پنل'}
          >
            {isPanelCollapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {/* Collapsed Vertical Rail */}
        {isPanelCollapsed ? (
          <div className="relative flex flex-col items-center gap-1.5 py-3 text-slate-400 overflow-y-auto scrollbar-none">
            {PANEL_TABS.map((tab) => {
              const active = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setIsPanelCollapsed(false);
                  }}
                  title={tab.label}
                  aria-current={active ? 'page' : undefined}
                  className={`relative p-2 rounded-xl transition-all duration-200 ${
                    active
                      ? 'tab-active-green border shadow-[0_0_16px_-6px_var(--cmd-green-ring)]'
                      : 'text-slate-500 hover:bg-slate-800 hover:text-[var(--cmd-green)] border border-transparent'
                  }`}
                >
                  <Icon className="w-[18px] h-[18px]" />
                  {active && <span className="absolute right-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-l-full bg-[var(--cmd-green)]" />}
                </button>
              );
            })}
          </div>
        ) : (
          /* Panel Body Content — همهٔ ابزارها code-split شده‌اند و با Suspense لَزی می‌آیند */
          <div className="flex-1 overflow-y-auto">
            <Suspense fallback={<SectionLoader label="در حال بارگذاری ابزار…" />}>
            {activeTab === 'ai' && (
              <AiSearchGroundingHub
                selectedCrossing={selectedCrossing}
                onFocusLocationOnMap={(lat, lng, zoom) => {
                  setMapFocus({ lat, lng, zoom: zoom ?? 12, seq: Date.now() });
                }}
                crossings={DATA.crossings}
                roadNetwork={RN}
                corridors={DATA.corridors}
                onDrawPins={setSearchPins}
                onFocusPoint={setMapFocus}
              />
            )}

            {activeTab === 'websearch' && (
              <WebSearchPanel
                selectedCrossing={selectedCrossing}
                crossings={DATA.crossings}
                roadNetwork={RN}
                corridors={DATA.corridors}
                onOpenAiGrounding={handleOpenAiSearchWithQuery}
                onDrawPins={setSearchPins}
                onFocusPoint={setMapFocus}
              />
            )}

            {activeTab === 'borderflow' && (
              <BorderFlowDashboard
                crossings={DATA.crossings}
                onFocusGate={(c) => {
                  setSelectedCrossing(c);
                  setMapFocus({ lat: c.lat, lng: c.lng, zoom: 11, seq: Date.now() });
                }}
              />
            )}

            {activeTab === 'livedata' && (
              <LiveDataHub
                selectedCrossing={selectedCrossing}
                onSelectCrossing={(c) => setSelectedCrossing(c)}
              />
            )}

            {activeTab === 'filter' && (
              <FilterView
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                selectedTypes={selectedTypes}
                onToggleType={handleToggleType}
                selectedCountry={selectedCountry}
                onSelectCountry={setSelectedCountry}
                countriesList={countriesList}
                selectedDepths={selectedDepths}
                onToggleDepth={handleToggleDepth}
                selectedConfs={selectedConfs}
                onToggleConf={handleToggleConf}
                onResetFilters={handleResetFilters}
                filteredCrossings={filteredCrossings}
                totalCrossings={DATA.crossings.length}
                onSelectCrossing={(c) => setSelectedCrossing(c)}
              />
            )}

            {activeTab === 'pathfinder' && (
              <TransitPathfinder
                crossings={DATA.crossings}
                roadNetwork={RN}
                onDrawPath={(path) => setSelectedRoutePath(path)}
                onFocusGate={(id) => {
                  setHighlightedGateId(id);
                  const c = DATA.crossings.find((x) => x.id === id);
                  if (c) setSelectedCrossing(c);
                }}
                onOpenAiGrounding={handleOpenAiSearchWithQuery}
              />
            )}

            {activeTab === 'route' && (
              <RouteStudio
                crossings={DATA.crossings}
                roadNetwork={RN}
                onDrawOverlays={setRouteOverlays}
                onDrawIsochrones={setIsochroneOverlays}
                onFocusGate={(id) => {
                  setHighlightedGateId(id);
                  const c = DATA.crossings.find((x) => x.id === id);
                  if (c) setSelectedCrossing(c);
                }}
                onRequestPick={setPickTarget}
                pickTarget={pickTarget}
                pickedLocation={pickedLocation}
                onOpenAiGrounding={handleOpenAiSearchWithQuery}
                draftPath={draftPath}
                drawMode={drawMode}
                onToggleDraw={(active) => {
                  setDrawMode(active);
                  if (!active && draftPath.length > 1) {
                    setSelectedRoutePath(draftPath);
                  }
                }}
                onUndoDraw={() => setDraftPath((prev) => prev.slice(0, -1))}
                onClearDraw={() => {
                  setDraftPath([]);
                  setSelectedRoutePath(undefined);
                }}
                savedRoutes={savedRoutes}
                onSavedRoutesChange={setSavedRoutes}
              />
            )}

            {activeTab === 'multimodal' && (
              <MultimodalPlanner
                onOpenAiGrounding={handleOpenAiSearchWithQuery}
              />
            )}

            {activeTab === 'network' && (
              <RoadNetworkView
                roadNetwork={RN}
                onFlyToCity={(lat, lng, name) => {
                  setSelectedRoutePath([[lng, lat]]);
                }}
                onHighlightRoute={(points) => {
                  setSelectedRoutePath(points);
                }}
              />
            )}

            {activeTab === 'analytics' && (
              <AnalyticsView
                crossings={filteredCrossings}
                corridors={DATA.corridors}
                activeCorridors={activeCorridors}
                onToggleCorridor={handleToggleCorridor}
                onFocusGate={(crossing) => setSelectedCrossing(crossing)}
              />
            )}
            </Suspense>
          </div>
        )}
      </div>

      {/* Global Universal Search Modal */}
      <Suspense fallback={null}>
      <GlobalSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        crossings={DATA.crossings}
        roadNetwork={RN}
        corridors={DATA.corridors}
        onSelectCrossing={(c) => setSelectedCrossing(c)}
        onSelectRouteCity={(name, lat, lng) => {
          setSelectedRoutePath([[lng, lat]]);
        }}
        onOpenAiSearch={(q) => handleOpenAiSearchWithQuery(q)}
      />
      </Suspense>
    </div>
  );
}
