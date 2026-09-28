export interface Crossing {
  id: number;
  name: string;
  name_en: string | null;
  country: string;
  type: string;
  status: string;
  lat: number;
  lng: number;
  layer: 'road' | 'combined' | 'rail';
  trucks: string | null;
  wagons: string | null;
  warehouse: string | null;
  cold: string | null;
  hours_summer: string | null;
  clearance: string | null;
  services: string | null;
  highway: string | null;
  volume: string | null;
  cargo: string | null;
  xg_id: string | null;
  depth: string | null;
  corridor: string | null;
  confidence: string | null;
  src_type: string | null;
  note: string | null;
  opp_name: string | null;
  rail_note: string | null;
  trucks_est: number | null;
  clear_est: number | null;
  x?: [string, string][];
}

export interface Corridor {
  name: string;
  color: string;
  points: [number, number][]; // [lat, lng]
}

export interface RoadRoute {
  ref: string;
  n: string;
  c: [string, number, number][]; // [city_name, lat, lng]
}

export interface CountryRoadNetwork {
  color: string;
  routes: RoadRoute[];
}

export interface WebSource {
  uri: string;
  title: string;
}

export interface MapPlace {
  uri: string;
  title: string;
  reviewSnippets?: string[];
}

export interface SearchGroundingResponse {
  success: boolean;
  text: string;
  sources: WebSource[];
  searchQueries?: string[];
}

export interface MapsGroundingResponse {
  success: boolean;
  text: string;
  places: MapPlace[];
}

export interface GroundingQueryState {
  loading: boolean;
  error: string | null;
  result: SearchGroundingResponse | null;
  mapsResult: MapsGroundingResponse | null;
}
