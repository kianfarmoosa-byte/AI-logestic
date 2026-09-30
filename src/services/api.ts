import { SearchGroundingResponse, MapsGroundingResponse } from '../types';

/**
 * خواندن امن پاسخ JSON. اگر سرور JSON نفرستاد — مثلاً هاست استقرار static مسیر /api را
 * به index.html هدایت میکند — بهجای «Unexpected token '<'» پیام شفاف فارسی پرتاب میشود
 * و سایر خطاهای سرور (۴۰۰/۵۰۳/۵۰۰) نیز با بدنهٔ JSON خود گزارش میشوند.
 */
export async function readJsonOrThrow<T>(response: Response, fallback: string): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      'سرویس‌های زندهٔ سرور در این استقرار (static) در دسترس نیستند؛ نقشه و ابزارهای سمت مرورگر فعال‌اند.'
    );
  }
  const data = (await response.json().catch(() => null)) as (T & { error?: string; details?: string }) | null;
  if (!response.ok || data === null) {
    throw new Error(data?.error || data?.details || `${fallback} (${response.status})`);
  }
  return data;
}

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

  return readJsonOrThrow<SearchGroundingResponse>(response, 'خطای سرور');
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

  return readJsonOrThrow<MapsGroundingResponse>(response, 'خطای سرور');
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

  return readJsonOrThrow<SearchGroundingResponse>(response, 'خطای سرور');
}
