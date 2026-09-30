import React, { useEffect, useRef, useState } from 'react';
import { Bell, Truck, AlertTriangle, TrendingUp, ExternalLink } from 'lucide-react';
import { Crossing } from '../types';

interface OpsNotification {
  id: string;
  kind: 'critical-queue' | 'flow-anomaly' | 'queue-surge';
  title: string;
  detail: string;
  gateId?: number;
  severity: 'critical' | 'warning';
  at: string;
}

interface OpsNotificationsProps {
  crossings: Crossing[];
  onFocusGate: (crossing: Crossing) => void;
}

const fa = (n: number) => Math.round(n).toLocaleString('fa-IR');

/** زمان نسبی ساده فارسی */
const relTime = (at: string) => {
  const t = new Date(at).getTime();
  if (!Number.isFinite(t)) return at || '—';
  const diffMin = Math.round((Date.now() - t) / 60000);
  if (diffMin < 1) return 'همین حالا';
  if (diffMin < 60) return `${fa(diffMin)} دقیقه پیش`;
  const h = Math.round(diffMin / 60);
  if (h < 24) return `${fa(h)} ساعت پیش`;
  return `${fa(Math.round(h / 24))} روز پیش`;
};

/**
 * مرکز اعلان عملیاتی (الگوی زنگ با badge سبز KEMETRA):
 * هر ۹۰ ثانیه /api/notifications را می‌خواند؛ صف بحرانی و ناهنجاری critical
 * را با لینک پرواز به گیت نشان می‌دهد.
 */
export const OpsNotifications: React.FC<OpsNotificationsProps> = ({ crossings, onFocusGate }) => {
  const [items, setItems] = useState<OpsNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch('/api/notifications')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (alive && d?.notifications) setItems(d.notifications);
        })
        .catch(() => {});
    load();
    const t = window.setInterval(load, 90_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  // بستن با کلیک بیرون
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const unseenCount = Math.max(0, items.length - seen);

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={() => {
          setOpen((p) => !p);
          setSeen(items.length);
        }}
        className="relative p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 transition-colors"
        title="هشدارهای عملیاتی (صف بحرانی و ناهنجاری جریان)"
      >
        <Bell className="w-4 h-4" />
        {unseenCount > 0 && (
          <span className="absolute -top-1 -left-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-[var(--cmd-green)] text-white text-[8px] font-bold flex items-center justify-center">
            {fa(unseenCount)}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-11 left-0 w-80 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between">
            <span className="text-[11px] font-bold text-[var(--cmd-green)]">هشدارهای عملیاتی</span>
            <span className="text-[9px] text-slate-500">{fa(items.length)} اعلان</span>
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-800">
            {items.length === 0 && (
              <div className="px-3 py-6 text-center text-[10px] text-slate-500">
                هشدار فعالی وجود ندارد — همهٔ مرزها در محدودهٔ نرمال است.
              </div>
            )}
            {items.map((n) => {
              const gate = n.gateId != null ? crossings.find((c) => c.id === n.gateId) : undefined;
              return (
                <button
                  key={n.id}
                  onClick={() => {
                    if (gate) {
                      onFocusGate(gate);
                      setOpen(false);
                    }
                  }}
                  className="w-full text-right px-3 py-2.5 hover:bg-slate-800/70 transition-colors flex gap-2"
                >
                  {n.kind === 'critical-queue' ? (
                    <Truck className="w-4 h-4 text-[var(--tone-rose)] shrink-0 mt-0.5" />
                  ) : n.kind === 'queue-surge' ? (
                    <TrendingUp className="w-4 h-4 text-[var(--tone-rose)] shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-[var(--tone-amber)] shrink-0 mt-0.5" />
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-[11px] font-bold text-slate-200">{n.title}</span>
                    <span className="block text-[10px] text-slate-400 leading-relaxed mt-0.5">{n.detail}</span>
                    <span className="block text-[9px] text-slate-500 mt-1">
                      {relTime(n.at)}
                      {gate ? ' · برای پرواز کلیک کنید' : ''}
                    </span>
                  </span>
                  {gate && <ExternalLink className="w-3 h-3 text-slate-500 shrink-0 mt-1" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
