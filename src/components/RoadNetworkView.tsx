import React, { useState } from 'react';
import { Route, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import { CountryRoadNetwork } from '../types';

interface RoadNetworkViewProps {
  roadNetwork: Record<string, CountryRoadNetwork>;
  onFlyToCity: (lat: number, lng: number, name: string) => void;
  onHighlightRoute: (routePoints: [number, number][]) => void;
}

export const RoadNetworkView: React.FC<RoadNetworkViewProps> = ({
  roadNetwork,
  onFlyToCity,
  onHighlightRoute,
}) => {
  const [expandedCountries, setExpandedCountries] = useState<Record<string, boolean>>({
    'ایران': true,
    'ترکیه': true,
  });

  const toggleCountry = (country: string) => {
    setExpandedCountries((prev) => ({
      ...prev,
      [country]: !prev[country],
    }));
  };

  const countries = Object.keys(roadNetwork);
  let totalRoutes = 0;
  let totalCities = 0;
  const seenCities = new Set<string>();

  Object.entries(roadNetwork).forEach(([cn, co]) => {
    totalRoutes += co.routes.length;
    co.routes.forEach((r) => {
      r.c.forEach(([name]) => seenCities.add(`${cn}|${name}`));
    });
  });
  totalCities = seenCities.size;

  return (
    <div className="flex flex-col gap-3.5 p-3 font-['Vazirmatn'] text-xs">
      <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-300">
        <span className="font-bold text-amber-400">{totalRoutes}</span> محور اصلی جاده‌ای ·{' '}
        <span className="font-bold text-amber-400">{totalCities}</span> شهر بین‌راهی ترانزیتی ·{' '}
        <span className="font-bold text-amber-400">{countries.length}</span> کشور متصل
      </div>

      <div className="space-y-2">
        {countries.map((country) => {
          const co = roadNetwork[country];
          const isExpanded = !!expandedCountries[country];

          return (
            <div
              key={country}
              className="bg-slate-900/70 border border-slate-800 rounded-xl overflow-hidden"
            >
              <div
                onClick={() => toggleCountry(country)}
                className="flex items-center justify-between p-2.5 bg-slate-950/50 hover:bg-slate-800/80 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: co.color }}
                  />
                  <span className="font-bold text-xs text-slate-100">{country}</span>
                  <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                    {co.routes.length} محور
                  </span>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </div>

              {isExpanded && (
                <div className="p-2 space-y-2 border-t border-slate-800/80">
                  {co.routes.map((route, ri) => (
                    <div
                      key={ri}
                      className="bg-slate-950/40 p-2 rounded-lg border border-slate-800/80 hover:border-slate-700 transition-colors"
                    >
                      <div
                        onClick={() => {
                          const pts: [number, number][] = route.c.map(([_, lat, lng]) => [lng, lat]);
                          onHighlightRoute(pts);
                        }}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[11px] text-amber-400">{route.ref}</span>
                          <span className="text-[10px] text-slate-400 hover:text-slate-200">نمایش روی نقشه</span>
                        </div>
                        <div className="text-[11px] text-slate-200 font-medium mt-0.5">{route.n}</div>
                      </div>

                      {/* Cities along this route */}
                      <div className="flex flex-wrap gap-1 mt-2 text-[10px]">
                        {route.c.map(([cityName, lat, lng], ci) => (
                          <React.Fragment key={ci}>
                            <button
                              onClick={() => onFlyToCity(lat, lng, cityName)}
                              className="text-slate-400 hover:text-amber-300 hover:underline transition-colors"
                            >
                              {cityName}
                            </button>
                            {ci < route.c.length - 1 && <span className="text-slate-600">←</span>}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
