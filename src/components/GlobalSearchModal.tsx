import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  X,
  MapPin,
  Route,
  Globe2,
  Box,
  ExternalLink,
  Sparkles,
  ArrowLeft,
  ChevronLeft,
} from 'lucide-react';
import { Crossing, Corridor, CountryRoadNetwork } from '../types';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  crossings: Crossing[];
  roadNetwork: Record<string, CountryRoadNetwork>;
  corridors: Corridor[];
  onSelectCrossing: (crossing: Crossing) => void;
  onSelectRouteCity: (cityName: string, lat: number, lng: number, country: string) => void;
  onOpenAiSearch: (query: string) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  crossings,
  roadNetwork,
  corridors,
  onSelectCrossing,
  onSelectRouteCity,
  onOpenAiSearch,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'crossings' | 'cities' | 'corridors'>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearchTerm('');
    }
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  // Flatten cities from roadNetwork
  const allCities = useMemo(() => {
    const cities: Array<{ name: string; country: string; lat: number; lng: number; routes: string[] }> = [];
    const seen = new Set<string>();

    Object.entries(roadNetwork).forEach(([country, co]) => {
      co.routes.forEach((r) => {
        r.c.forEach(([cityName, lat, lng]) => {
          const key = `${country}|${cityName}`;
          if (!seen.has(key)) {
            seen.add(key);
            cities.push({
              name: cityName,
              country,
              lat,
              lng,
              routes: [r.ref],
            });
          }
        });
      });
    });
    return cities;
  }, [roadNetwork]);

  // Search Results
  const results = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return { crossings: [], cities: [], corridors: [] };

    const matchedCrossings = crossings.filter((c) => {
      const haystack = `${c.name} ${c.name_en || ''} ${c.country} ${c.opp_name || ''} ${c.corridor || ''} ${c.cargo || ''}`.toLowerCase();
      return haystack.includes(term);
    }).slice(0, 10);

    const matchedCities = allCities.filter((city) => {
      const haystack = `${city.name} ${city.country}`.toLowerCase();
      return haystack.includes(term);
    }).slice(0, 10);

    const matchedCorridors = corridors.filter((cor) => {
      return cor.name.toLowerCase().includes(term);
    }).slice(0, 5);

    return {
      crossings: matchedCrossings,
      cities: matchedCities,
      corridors: matchedCorridors,
    };
  }, [searchTerm, crossings, allCities, corridors]);

  if (!isOpen) return null;

  const totalResults =
    (filterType === 'all' || filterType === 'crossings' ? results.crossings.length : 0) +
    (filterType === 'all' || filterType === 'cities' ? results.cities.length : 0) +
    (filterType === 'all' || filterType === 'corridors' ? results.corridors.length : 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-14 px-4 bg-slate-950/80 backdrop-blur-md animate-fade-in font-['Vazirmatn']">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[82vh]">
        {/* Search Bar Input */}
        <div className="flex items-center gap-3 p-3.5 border-b border-slate-800 bg-slate-950/50">
          <Search className="w-5 h-5 text-[var(--cmd-green)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="جستجوی گذرگاه، شهر ترانزیتی، کریدور یا نوع کالا (مثال: بازرگان، سرخس، استانبول، پتروشیمی)..."
            className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded-md shrink-0"
          >
            بستن (ESC)
          </button>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 p-2 px-3 border-b border-slate-800/80 bg-slate-900/60 text-xs overflow-x-auto">
          <span className="text-slate-400 text-[11px] shrink-0">فیلتر نتایج:</span>
          <button
            onClick={() => setFilterType('all')}
            className={`px-2.5 py-0.5 rounded-full transition-all ${
              filterType === 'all' ? 'btn-cmd-green font-bold' : 'bg-slate-800 text-slate-300'
            }`}
          >
            همه
          </button>
          <button
            onClick={() => setFilterType('crossings')}
            className={`px-2.5 py-0.5 rounded-full transition-all ${
              filterType === 'crossings' ? 'btn-cmd-green font-bold' : 'bg-slate-800 text-slate-300'
            }`}
          >
            گذرگاه‌های مرزی ({results.crossings.length})
          </button>
          <button
            onClick={() => setFilterType('cities')}
            className={`px-2.5 py-0.5 rounded-full transition-all ${
              filterType === 'cities' ? 'btn-cmd-green font-bold' : 'bg-slate-800 text-slate-300'
            }`}
          >
            شهرهای ترانزیتی ({results.cities.length})
          </button>
          <button
            onClick={() => setFilterType('corridors')}
            className={`px-2.5 py-0.5 rounded-full transition-all ${
              filterType === 'corridors' ? 'btn-cmd-green font-bold' : 'bg-slate-800 text-slate-300'
            }`}
          >
            کریدورها ({results.corridors.length})
          </button>

          {/* AI Grounded Search trigger */}
          {searchTerm.trim().length > 1 && (
            <button
              onClick={() => {
                onOpenAiSearch(searchTerm);
                onClose();
              }}
              className="mr-auto flex items-center gap-1.5 bg-[var(--cmd-green-soft)] hover:brightness-95 border border-[var(--cmd-green-ring)] text-[var(--cmd-green)] px-3 py-1 rounded-full font-semibold transition-all shrink-0 text-[11px]"
            >
              <Sparkles className="w-3.5 h-3.5 text-[var(--cmd-green)]" />
              <span>استعلام بلادرنگ با دستیار هوشمند</span>
            </button>
          )}
        </div>

        {/* Results Container */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {searchTerm.trim() === '' ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400 gap-3">
              <Search className="w-10 h-10 text-slate-600" />
              <div className="text-sm font-semibold">عبارت مورد نظر خود را برای جستجو وارد کنید</div>
              <div className="text-xs text-slate-500 max-w-md leading-relaxed">
                دسترسی فوری به داده‌های ۲۰۷ گذرگاه مرزی، ۱۰۰+ محور جاده‌ای، صدها شهر ترانزیتی در ۲۴ کشور و استعلام آنلاین با دستیار هوشمند
              </div>
            </div>
          ) : totalResults === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400 gap-3">
              <div className="text-sm font-semibold text-slate-300">موردی در پایگاه داده داخلی یافت نشد</div>
              <button
                onClick={() => {
                  onOpenAiSearch(searchTerm);
                  onClose();
                }}
                className="flex items-center gap-2 btn-cmd-green font-bold px-4 py-2 rounded-xl text-xs shadow-lg"
              >
                <Sparkles className="w-4 h-4" />
                <span>جستجو برای «{searchTerm}» با دستیار هوشمند</span>
              </button>
            </div>
          ) : (
            <>
              {/* Crossings Results */}
              {(filterType === 'all' || filterType === 'crossings') && results.crossings.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-[var(--cmd-green)] flex items-center gap-1.5 mb-2">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>گذرگاه‌های مرزی</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {results.crossings.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => {
                          onSelectCrossing(c);
                          onClose();
                        }}
                        className="flex flex-col p-2.5 bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 hover:border-amber-500/50 rounded-xl cursor-pointer transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-slate-100">{c.name}</span>
                          <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700">
                            {c.country}
                          </span>
                        </div>
                        {c.name_en && <span className="text-[11px] text-slate-400 mt-0.5">{c.name_en}</span>}
                        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-400">
                          <span>نوع: {c.type}</span>
                          {c.trucks_est ? (
                            <span className="text-emerald-400">≈ {c.trucks_est} کامیون/روز</span>
                          ) : null}
                          {c.clear_est ? <span>ترخیص: {c.clear_est}س</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Transit Cities Results */}
              {(filterType === 'all' || filterType === 'cities') && results.cities.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-[var(--tone-sky)] flex items-center gap-1.5 mb-2">
                    <Route className="w-3.5 h-3.5" />
                    <span>شهرهای ترانزیتی و محورهای ارتباطی</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {results.cities.map((city, idx) => (
                      <div
                        key={idx}
                        onClick={() => {
                          onSelectRouteCity(city.name, city.lat, city.lng, city.country);
                          onClose();
                        }}
                        className="flex items-center justify-between p-2.5 bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 hover:border-teal-500/50 rounded-xl cursor-pointer transition-all"
                      >
                        <div>
                          <div className="font-bold text-xs text-slate-100">{city.name}</div>
                          <div className="text-[11px] text-slate-400">{city.country} · {city.routes.join(' ، ')}</div>
                        </div>
                        <ChevronLeft className="w-4 h-4 text-slate-500" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Corridors Results */}
              {(filterType === 'all' || filterType === 'corridors') && results.corridors.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-purple-400 flex items-center gap-1.5 mb-2">
                    <Globe2 className="w-3.5 h-3.5" />
                    <span>کریدورهای بین‌المللی</span>
                  </div>
                  <div className="space-y-1.5">
                    {results.corridors.map((cor, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 p-2.5 bg-slate-950/60 border border-slate-800 rounded-xl"
                      >
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: cor.color }}
                        />
                        <span className="text-xs text-slate-200 font-medium">{cor.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
