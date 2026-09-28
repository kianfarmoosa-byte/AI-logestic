import React, { useState, useMemo, useEffect } from 'react';
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
} from 'lucide-react';
import { DATA, RN } from './data/atlasData';
import { Crossing, Corridor } from './types';
import { MapAtlas } from './components/MapAtlas';
import { Topbar } from './components/Topbar';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { CrossingDrawer } from './components/CrossingDrawer';
import { AiSearchGroundingHub } from './components/AiSearchGroundingHub';
import { FilterView } from './components/FilterView';
import { TransitPathfinder } from './components/TransitPathfinder';
import { MultimodalPlanner } from './components/MultimodalPlanner';
import { RoadNetworkView } from './components/RoadNetworkView';
import { AnalyticsView } from './components/AnalyticsView';
import { LiveDataHub } from './components/LiveDataHub';

export default function App() {
  const [darkTheme, setDarkTheme] = useState(true);
  const [activeTab, setActiveTab] = useState<'ai' | 'livedata' | 'filter' | 'pathfinder' | 'multimodal' | 'network' | 'analytics'>('ai');
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);

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
    <div className={`relative w-screen h-screen overflow-hidden ${darkTheme ? 'bg-[#06080d] text-[#e8ecf3]' : 'bg-[#eef1f5] text-[#1a2233]'}`}>
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
      />

      {/* MapLibre GL Background Map */}
      <div className="absolute inset-0 pt-[58px]">
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
        />
      </div>

      {/* Floating Bottom/Left Map Legend */}
      <div className="absolute bottom-4 left-4 z-10 hidden sm:flex items-center gap-3 bg-slate-950/85 backdrop-blur-md px-3.5 py-2 rounded-full border border-slate-800 text-[11px] text-slate-300 shadow-xl pointer-events-auto">
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
          <span className="w-2.5 h-2.5 rounded-full ring-2 ring-amber-400 bg-amber-400" />
          <span className="text-amber-300 font-semibold">دروازه ایران</span>
        </div>
      </div>

      {/* Interactive Crossing Detail Drawer */}
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

      {/* Main Tabbed Side Control Panel */}
      <div
        className={`absolute top-[70px] right-3 bottom-3 z-20 flex flex-col bg-slate-950/90 backdrop-blur-2xl border border-slate-800 rounded-2xl shadow-2xl transition-all duration-300 overflow-hidden ${
          isPanelCollapsed ? 'w-14' : 'w-[94vw] sm:w-[420px] md:w-[470px]'
        }`}
      >
        {/* Panel Header with Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-slate-800/90 p-2 bg-slate-950/50">
          {!isPanelCollapsed && (
            <div className="flex items-center gap-1 overflow-x-auto text-xs py-1 scrollbar-none flex-1">
              <button
                onClick={() => setActiveTab('ai')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 ${
                  activeTab === 'ai'
                    ? 'bg-gradient-to-r from-teal-500 to-amber-500 text-slate-950 shadow-md'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>استعلام هوشمند گوگل</span>
              </button>

              <button
                onClick={() => setActiveTab('livedata')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition-all shrink-0 ${
                  activeTab === 'livedata'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Radar className="w-3.5 h-3.5" />
                <span>داده‌های زنده</span>
              </button>

              <button
                onClick={() => setActiveTab('filter')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition-all shrink-0 ${
                  activeTab === 'filter'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>فیلتر گذرگاه‌ها</span>
              </button>

              <button
                onClick={() => setActiveTab('pathfinder')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition-all shrink-0 ${
                  activeTab === 'pathfinder'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Route className="w-3.5 h-3.5" />
                <span>ترانزیت‌یاب (A*)</span>
              </button>

              <button
                onClick={() => setActiveTab('multimodal')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition-all shrink-0 ${
                  activeTab === 'multimodal'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>زنجیره حمل چندوجهی</span>
              </button>

              <button
                onClick={() => setActiveTab('network')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition-all shrink-0 ${
                  activeTab === 'network'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>شبکه ۲۴ کشور</span>
              </button>

              <button
                onClick={() => setActiveTab('analytics')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition-all shrink-0 ${
                  activeTab === 'analytics'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>تحلیل و آمار</span>
              </button>
            </div>
          )}

          {/* Collapse / Expand Button */}
          <button
            onClick={() => setIsPanelCollapsed((prev) => !prev)}
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors shrink-0"
            title={isPanelCollapsed ? 'باز کردن پنل' : 'جمع کردن پنل'}
          >
            {isPanelCollapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {/* Collapsed Vertical Icons */}
        {isPanelCollapsed ? (
          <div className="flex flex-col items-center gap-3 py-4 text-slate-400">
            <button
              onClick={() => {
                setActiveTab('ai');
                setIsPanelCollapsed(false);
              }}
              className="p-2 hover:bg-slate-800 hover:text-amber-400 rounded-xl"
              title="استعلام هوشمند گوگل"
            >
              <Sparkles className="w-5 h-5 text-amber-400" />
            </button>
            <button
              onClick={() => {
                setActiveTab('livedata');
                setIsPanelCollapsed(false);
              }}
              className="p-2 hover:bg-slate-800 hover:text-amber-400 rounded-xl"
              title="داده‌های زنده"
            >
              <Radar className="w-5 h-5" />
            </button>
            <button
              onClick={() => {
                setActiveTab('filter');
                setIsPanelCollapsed(false);
              }}
              className="p-2 hover:bg-slate-800 hover:text-amber-400 rounded-xl"
              title="فیلتر گذرگاه‌ها"
            >
              <SlidersHorizontal className="w-5 h-5" />
            </button>
            <button
              onClick={() => {
                setActiveTab('pathfinder');
                setIsPanelCollapsed(false);
              }}
              className="p-2 hover:bg-slate-800 hover:text-amber-400 rounded-xl"
              title="ترانزیت‌یاب شبکه"
            >
              <Route className="w-5 h-5" />
            </button>
            <button
              onClick={() => {
                setActiveTab('multimodal');
                setIsPanelCollapsed(false);
              }}
              className="p-2 hover:bg-slate-800 hover:text-amber-400 rounded-xl"
              title="زنجیره چندوجهی"
            >
              <Layers className="w-5 h-5" />
            </button>
            <button
              onClick={() => {
                setActiveTab('network');
                setIsPanelCollapsed(false);
              }}
              className="p-2 hover:bg-slate-800 hover:text-amber-400 rounded-xl"
              title="شبکه راه‌ها"
            >
              <MapPin className="w-5 h-5" />
            </button>
            <button
              onClick={() => {
                setActiveTab('analytics');
                setIsPanelCollapsed(false);
              }}
              className="p-2 hover:bg-slate-800 hover:text-amber-400 rounded-xl"
              title="تحلیل و آمار"
            >
              <BarChart3 className="w-5 h-5" />
            </button>
          </div>
        ) : (
          /* Panel Body Content */
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'ai' && (
              <AiSearchGroundingHub
                selectedCrossing={selectedCrossing}
                onFocusLocationOnMap={(lat, lng) => {
                  // Focused via maps grounding
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
          </div>
        )}
      </div>

      {/* Global Universal Search Modal */}
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
    </div>
  );
}
