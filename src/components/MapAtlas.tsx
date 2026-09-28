import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { setWorkerUrl } from 'maplibre-gl';
import maplibreglWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Crossing, Corridor, CountryRoadNetwork } from '../types';

// Configure MapLibre Web Worker URL for Vite environment
try {
  setWorkerUrl(maplibreglWorkerUrl);
} catch (e) {
  console.warn('Failed to set worker URL, using default:', e);
}

interface MapAtlasProps {
  crossings: Crossing[];
  corridors: Corridor[];
  roadNetwork: Record<string, CountryRoadNetwork>;
  filteredCrossings: Crossing[];
  activeCorridors: boolean[];
  darkTheme: boolean;
  onSelectCrossing: (crossing: Crossing) => void;
  pickMode?: 'origin' | 'destination' | null;
  onPickLocation?: (lat: number, lng: number, name?: string) => void;
  selectedRoutePath?: [number, number][]; // [lng, lat]
  highlightedGateId?: number | null;
}

/* ------------------------------------------------------------------ *
 * نقشه‌های پایه منبع‌باز و رایگان (بدون کلید API و بدون ثبت‌نام)
 *  - OpenFreeMap : وکتور منبع‌باز، داده OpenStreetMap، قابل خودمیزبانی
 *  - OpenStreetMap: کاشی‌های شطرنجی کلاسیک پروژه OSM
 * ------------------------------------------------------------------ */
export type BasemapId = 'dark' | 'bright' | 'osm';

const OPENFREEMAP_DARK = 'https://tiles.openfreemap.org/styles/dark';
const OPENFREEMAP_BRIGHT = 'https://tiles.openfreemap.org/styles/bright';

const OPENFREEMAP_ATTRIBUTION = 'OpenFreeMap © OpenMapTiles · داده‌ها: OpenStreetMap';
const OSM_ATTRIBUTION = '© مشارکت‌کنندگان OpenStreetMap (ODbL)';

export const BASEMAPS: { id: BasemapId; label: string; hint: string }[] = [
  { id: 'dark', label: 'تیکه', hint: 'OpenFreeMap Dark (وکتور منبع‌باز)' },
  { id: 'bright', label: 'روشن', hint: 'OpenFreeMap Bright (وکتور منبع‌باز)' },
  { id: 'osm', label: 'OSM', hint: 'کاشی شطرنجی کلاسیک OpenStreetMap' },
];

function osmRasterStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
        attribution: OSM_ATTRIBUTION,
      },
    },
    layers: [
      {
        id: 'osm-raster',
        type: 'raster',
        source: 'osm',
      },
    ],
  };
}

function styleFor(basemap: BasemapId): string | maplibregl.StyleSpecification {
  if (basemap === 'osm') return osmRasterStyle();
  return basemap === 'dark' ? OPENFREEMAP_DARK : OPENFREEMAP_BRIGHT;
}

interface OverlayData {
  crossings: any;
  corridors: any;
  roads: any;
  route: any;
}

export const MapAtlas: React.FC<MapAtlasProps> = ({
  crossings,
  corridors,
  roadNetwork,
  filteredCrossings,
  activeCorridors,
  darkTheme,
  onSelectCrossing,
  pickMode,
  onPickLocation,
  selectedRoutePath,
  highlightedGateId,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [basemap, setBasemap] = useState<BasemapId>(darkTheme ? 'dark' : 'bright');
  const skipInitialStyle = useRef(true);

  // Build GeoJSONs
  const getCrossingsGeoJSON = () => {
    return {
      type: 'FeatureCollection',
      features: filteredCrossings.map((c) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
        properties: {
          id: c.id,
          name: c.name,
          name_en: c.name_en || '',
          country: c.country,
          layer: c.layer,
          iran: c.country === 'ایران' ? 1 : 0,
          tr: c.trucks_est || 0,
          type: c.type,
          status: c.status || '',
        },
      })),
    };
  };

  const getCorridorsGeoJSON = () => {
    return {
      type: 'FeatureCollection',
      features: corridors.map((k, i) => ({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: k.points.map((p) => [p[1], p[0]]),
        },
        properties: {
          i,
          color: k.color,
          on: activeCorridors[i] ? 1 : 0,
        },
      })),
    };
  };

  const getRoadsGeoJSON = () => {
    const features: any[] = [];
    Object.entries(roadNetwork).forEach(([cn, co]) => {
      co.routes.forEach((r, ri) => {
        features.push({
          type: 'Feature',
          properties: {
            country: cn,
            name: r.n,
            ref: r.ref,
            color: co.color,
            id: `${cn}|${ri}`,
          },
          geometry: {
            type: 'LineString',
            coordinates: r.c.map((p) => [p[2], p[1]]),
          },
        });
      });
    });
    return { type: 'FeatureCollection', features };
  };

  const getSelectedRouteGeoJSON = () => {
    if (!selectedRoutePath || selectedRoutePath.length < 2) {
      return { type: 'FeatureCollection', features: [] };
    }
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: selectedRoutePath,
          },
          properties: {},
        },
      ],
    };
  };

  // Latest overlay payload, so overlays can be rebuilt with fresh data after a style swap
  const overlayBuilder = useRef<(() => OverlayData) | null>(null);
  overlayBuilder.current = () => ({
    crossings: getCrossingsGeoJSON(),
    corridors: getCorridorsGeoJSON(),
    roads: getRoadsGeoJSON(),
    route: getSelectedRouteGeoJSON(),
  });

  const addOverlays = (map: maplibregl.Map) => {
    const data = overlayBuilder.current ? overlayBuilder.current() : null;
    if (!data) return;

    const source = (id: string, payload: any) => {
      const existing = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
      if (existing) existing.setData(payload);
      else map.addSource(id, { type: 'geojson', data: payload });
    };

    source('corridors', data.corridors);
    source('roads', data.roads);
    source('selected-route', data.route);
    source('crossings', data.crossings);

    if (!map.getLayer('corridor-glow')) {
      map.addLayer({
        id: 'corridor-glow',
        type: 'line',
        source: 'corridors',
        filter: ['==', ['get', 'on'], 1],
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 8,
          'line-opacity': 0.2,
          'line-blur': 4,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });

      map.addLayer({
        id: 'corridor-base',
        type: 'line',
        source: 'corridors',
        filter: ['==', ['get', 'on'], 1],
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2.5,
          'line-opacity': 0.75,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });

      // Internal road network
      map.addLayer({
        id: 'rn-lines',
        type: 'line',
        source: 'roads',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 1.8,
          'line-opacity': 0.65,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });

      // Selected active route
      map.addLayer({
        id: 'selected-route-glow',
        type: 'line',
        source: 'selected-route',
        paint: {
          'line-color': '#2dd4bf',
          'line-width': 9,
          'line-opacity': 0.35,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });

      map.addLayer({
        id: 'selected-route-line',
        type: 'line',
        source: 'selected-route',
        paint: {
          'line-color': '#10b981',
          'line-width': 4.5,
          'line-opacity': 0.95,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });

      // Iranian border halo
      map.addLayer({
        id: 'iran-halo',
        type: 'circle',
        source: 'crossings',
        filter: ['==', ['get', 'iran'], 1],
        paint: {
          'circle-radius': ['+', ['*', ['sqrt', ['max', ['get', 'tr'], 25]], 0.42], 8],
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': '#eab308',
          'circle-stroke-width': 1.6,
          'circle-stroke-opacity': 0.9,
        },
      });

      // Points of crossings
      map.addLayer({
        id: 'pts',
        type: 'circle',
        source: 'crossings',
        paint: {
          'circle-radius': ['+', ['*', ['sqrt', ['max', ['get', 'tr'], 25]], 0.42], 3],
          'circle-color': [
            'match',
            ['get', 'layer'],
            'road',
            '#3b82f6',
            'combined',
            '#a855f7',
            '#64748b',
          ],
          'circle-opacity': 0.92,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 0.8,
        },
      });
    }
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: styleFor(darkTheme ? 'dark' : 'bright'),
      center: [54, 34],
      zoom: 4.3,
      attributionControl: {
        compact: true,
        customAttribution: `${OPENFREEMAP_ATTRIBUTION} · کلید API لازم نیست`,
      },
    });

    map.on('error', (e) => {
      // Gracefully handle any worker or style load notices without crashing the UI
      if (e?.error?.message?.includes('Worker failed to load')) {
        console.warn('MapLibre worker notification:', e.error?.message);
      } else {
        console.warn('MapLibre map event:', e?.error || e);
      }
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    // `setStyle` wipes custom sources/layers, so re-add them whenever a style finishes loading
    map.on('style.load', () => addOverlays(map));

    // Popup on hover
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });

    map.on('mousemove', 'pts', (e) => {
      if (!e.features || !e.features[0]) return;
      const p: any = e.features[0].properties;
      map.getCanvas().style.cursor = 'pointer';
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="text-right p-1 font-['Vazirmatn']">
            <div class="font-bold text-sm text-amber-400">${p.name} ${p.name_en ? `<span class="text-xs text-gray-400">(${p.name_en})</span>` : ''}</div>
            <div class="text-xs text-gray-300 mt-1">${p.country} · ${p.type}</div>
            ${p.tr > 0 ? `<div class="text-[11px] text-emerald-400 mt-0.5">ظرفیت: ≈ ${Number(p.tr).toLocaleString('fa-IR')} کامیون/روز</div>` : ''}
            ${p.status ? `<div class="text-[10px] text-gray-400">وضعیت: ${p.status}</div>` : ''}
          </div>`
        )
        .addTo(map);
    });

    map.on('mouseleave', 'pts', () => {
      map.getCanvas().style.cursor = '';
      popup.remove();
    });

    map.on('click', 'pts', (e) => {
      if (!e.features || !e.features[0]) return;
      const id = e.features[0].properties.id;
      const crossing = crossings.find((c) => c.id === id);
      if (crossing) {
        onSelectCrossing(crossing);
      }
    });

    map.on('click', (e) => {
      if (pickMode && onPickLocation) {
        // Find closest crossing within 35km
        let closest: Crossing | null = null;
        let minDist = 35;
        for (const c of crossings) {
          const dist = calculateDistance(e.lngLat.lat, e.lngLat.lng, c.lat, c.lng);
          if (dist < minDist) {
            minDist = dist;
            closest = c;
          }
        }

        if (closest) {
          const gate: Crossing = closest;
          onPickLocation(gate.lat, gate.lng, gate.name);
        } else {
          onPickLocation(e.lngLat.lat, e.lngLat.lng);
        }
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Keep the basemap in sync with the light/dark theme (unless the user pinned the OSM raster)
  useEffect(() => {
    setBasemap((prev) => (prev === 'osm' ? prev : darkTheme ? 'dark' : 'bright'));
  }, [darkTheme]);

  // Swap basemap style
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (skipInitialStyle.current) {
      skipInitialStyle.current = false;
      return;
    }
    map.setStyle(styleFor(basemap), { diff: false });
  }, [basemap]);

  // Update crossing data
  useEffect(() => {
    if (!mapRef.current) return;
    const source = mapRef.current.getSource('crossings') as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(getCrossingsGeoJSON() as any);
    }
  }, [filteredCrossings]);

  // Update corridors
  useEffect(() => {
    if (!mapRef.current) return;
    const source = mapRef.current.getSource('corridors') as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(getCorridorsGeoJSON() as any);
    }
  }, [activeCorridors]);

  // Update selected route
  useEffect(() => {
    if (!mapRef.current) return;
    const source = mapRef.current.getSource('selected-route') as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(getSelectedRouteGeoJSON() as any);
    }

    if (selectedRoutePath && selectedRoutePath.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      selectedRoutePath.forEach((pt) => bounds.extend(pt));
      mapRef.current.fitBounds(bounds, { padding: 90, duration: 900 });
    }
  }, [selectedRoutePath]);

  // Highlight specific gate
  useEffect(() => {
    if (!mapRef.current || highlightedGateId == null) return;
    const crossing = crossings.find((c) => c.id === highlightedGateId);
    if (crossing) {
      mapRef.current.flyTo({
        center: [crossing.lng, crossing.lat],
        zoom: Math.max(mapRef.current.getZoom(), 7),
        duration: 1000,
      });
    }
  }, [highlightedGateId]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="absolute inset-0" />

      {/* Basemap switcher — all options are free & open-source */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-1 bg-slate-950/85 backdrop-blur-md border border-slate-800 rounded-xl p-1 shadow-xl">
        <span className="px-2 pt-1 text-[9px] font-bold text-slate-400 text-center">
          نقشه پایه منبع‌باز
        </span>
        <div className="flex items-center gap-1">
          {BASEMAPS.map((b) => (
            <button
              key={b.id}
              onClick={() => setBasemap(b.id)}
              title={b.hint}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                basemap === b.id
                  ? 'bg-gradient-to-r from-teal-500 to-amber-500 text-slate-950 shadow'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
        <a
          href="https://openfreemap.org"
          target="_blank"
          rel="noopener noreferrer"
          className="px-2 pb-1 text-[9px] text-slate-500 hover:text-teal-400 text-center transition-colors"
        >
          OpenFreeMap · OpenStreetMap
        </a>
      </div>

      {pickMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-amber-500/90 text-slate-950 font-bold px-4 py-2 rounded-full shadow-lg text-xs animate-pulse">
          {pickMode === 'origin' ? 'مبدأ را روی نقشه انتخاب کنید' : 'مقصد را روی نقشه انتخاب کنید'}
        </div>
      )}
    </div>
  );
};

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
