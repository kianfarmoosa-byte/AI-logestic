import { SearchGroundingResponse, MapsGroundingResponse } from '../types';

export async function fetchSearchGrounding(params: {
  query: string;
  crossingName?: string;
  country?: string;
  category?: string;
}): Promise<SearchGroundingResponse> {
  const response = await fetch('/api/search-grounding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.details || `خطای سرور (${response.status})`);
  }

  return response.json();
}

export async function fetchMapsGrounding(params: {
  query: string;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
}): Promise<MapsGroundingResponse> {
  const response = await fetch('/api/maps-grounding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.details || `خطای سرور (${response.status})`);
  }

  return response.json();
}

export async function fetchCorridorAdvisor(params: {
  origin: string;
  destination: string;
  cargoType?: string;
  weightTons?: number;
  selectedMode?: string;
  customNotes?: string;
}): Promise<SearchGroundingResponse> {
  const response = await fetch('/api/corridor-ai-advisor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.details || `خطای سرور (${response.status})`);
  }

  return response.json();
}
