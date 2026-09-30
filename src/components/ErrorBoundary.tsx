import React from 'react';
import { reportClientError } from '../services/clientErrorReport';

interface ErrorBoundaryState {
  message: string | null;
  detail: string | null;
}

/**
 * مرز خطا: اگر بخشی از برنامه هنگام رندر خطا بدهد، به‌جای صفحهٔ سفید
 * پیام فارسی و متن فنی خطا نمایش داده می‌شود و خطا برای پیگیری به سرور گزارش می‌شود.
 */
export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { message: null, detail: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      message: error instanceof Error ? error.message : String(error),
      detail: error instanceof Error ? error.stack || null : null,
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    reportClientError({
      message: error instanceof Error ? error.message : String(error),
      stack: `${error instanceof Error ? error.stack || '' : ''}\n${info.componentStack || ''}`,
      source: 'react-boundary',
    });
  }

  render() {
    if (!this.state.message) return this.props.children;

    return (
      <div className="min-h-screen bg-[#f7f8f7] text-[#17251b] font-['Vazirmatn',sans-serif] p-6 flex items-center justify-center">
        <div className="max-w-2xl w-full bg-white border border-[var(--tone-rose)]/40 rounded-2xl p-5 flex flex-col gap-3 shadow-xl">
          <h1 className="text-sm font-bold text-[var(--tone-rose)]">خطای اجرایی در اطلس</h1>
          <p className="text-xs text-slate-300 leading-relaxed">
            بخشی از رابط کاربری هنگام نمایش خطا داد و به‌جای صفحهٔ سفید، متن خطا اینجا نشان داده می‌شود. این خطا برای
            بررسی به سرور گزارش شد.
          </p>
          <pre dir="ltr" className="text-[10px] text-[var(--tone-amber)] bg-[#f7f8f7] border border-slate-800 rounded-lg p-3 overflow-auto max-h-56 whitespace-pre-wrap">
            {this.state.message}
            {this.state.detail ? `\n\n${this.state.detail}` : ''}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="self-start btn-cmd-green font-bold text-xs px-3 py-1.5 rounded-lg"
          >
            بارگذاری دوباره
          </button>
        </div>
      </div>
    );
  }
}
