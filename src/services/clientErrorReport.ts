/**
 * گزارش خطاهای زمان اجرای مرورگر به سرور
 * --------------------------------------
 * خطاهای رخ‌داده در مرورگر (رندر، رویداد و پرامیس رد‌شده) به /api/client-error
 * فرستاده می‌شوند تا در لاگ پیش‌نمایش قابل بررسی باشند و «صفحهٔ سفید» بی‌دلیل نماند.
 */

export interface ClientErrorPayload {
  message: string;
  stack?: string | null;
  source?: string;
}

const recent = new Set<string>();

/** نویز شناخته‌شدهٔ محیط توسعه که خطای واقعی برنامه نیست */
const IGNORED = [/WebSocket closed without opened/i, /@vite\/client/i, /\[vite\] connect/i];

function isIgnorable(message: string, stack?: string | null): boolean {
  const haystack = `${message} ${stack || ''}`;
  return IGNORED.some((pattern) => pattern.test(haystack));
}

export function reportClientError(payload: ClientErrorPayload): void {
  if (isIgnorable(payload.message, payload.stack)) return;

  const key = `${payload.source || 'unknown'}|${payload.message}`;
  if (recent.has(key)) return; // جلوگیری از ارسال تکراری در حلقه‌های رندر
  recent.add(key);

  try {
    void fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        url: typeof window !== 'undefined' ? window.location.href : '',
        ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // گزارش خطا هرگز نباید خودش خطای تازه بسازد
  }
}
