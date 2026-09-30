import React, { useState } from 'react';
import {
  Layers,
  Truck,
  Ship,
  Plane,
  Train,
  CheckCircle2,
  AlertTriangle,
  FileText,
  DollarSign,
  Clock,
  Sparkles,
  Download,
} from 'lucide-react';
import { Crossing } from '../types';

interface MultimodalPlannerProps {
  onOpenAiGrounding: (query: string) => void;
  onFocusGate?: (id: number) => void;
}

export const MultimodalPlanner: React.FC<MultimodalPlannerProps> = ({
  onOpenAiGrounding,
}) => {
  const [origin, setOrigin] = useState('تهران (ایران)');
  const [destination, setDestination] = useState('استانبول (ترکیه)');
  const [cargoType, setCargoType] = useState<'general' | 'reefer' | 'hazmat' | 'bulk'>('general');
  const [weightTons, setWeightTons] = useState(20);
  const [volumeM3, setVolumeM3] = useState(40);
  const [cargoValueUsd, setCargoValueUsd] = useState(100000);

  // Active modes
  const [allowRoad, setAllowRoad] = useState(true);
  const [allowRail, setAllowRail] = useState(true);
  const [allowSea, setAllowSea] = useState(true);
  const [allowAir, setAllowAir] = useState(false);

  // Result state
  const [planResult, setPlanResult] = useState<any | null>(null);

  const handlePlan = () => {
    // Multimodal estimation engine
    const isIntercontinental = destination.includes('آلمان') || destination.includes('هلند') || destination.includes('چین');
    const isSeaRoute = destination.includes('هند') || destination.includes('امارات') || destination.includes('کویت');

    // Base distances
    let baseKm = 2400;
    if (destination.includes('چین')) baseKm = 8500;
    if (destination.includes('آلمان')) baseKm = 4200;
    if (destination.includes('روسیه')) baseKm = 3000;
    if (destination.includes('عراق')) baseKm = 900;

    const plans = [];

    // Option 1: All-Road TIR
    if (allowRoad) {
      const roadCost = weightTons * baseKm * 0.12 * (cargoType === 'reefer' ? 1.35 : 1);
      const roadHours = baseKm / 55 + 24; // with border delays
      plans.push({
        id: 'road-tir',
        title: 'جاده‌ای یکسره با کارنه تیر (TIR Carnet)',
        mode: 'road',
        icon: Truck,
        costUsd: Math.round(roadCost),
        durationDays: Math.ceil(roadHours / 14),
        riskScore: 'کم تا متوسط',
        documents: ['پروانه کارنه تیر (TIR)', 'بارنامه بین‌المللی CMR', 'بیمه‌نامه CMR', 'گواهی مبدأ'],
        summary: 'انعطاف‌پذیرترین شیوه حمل درب‌به‌درب، ترخیص سریع در گمرک مقصد بدون تخلیه میانی بار.',
      });
    }

    // Option 2: Multimodal Rail
    if (allowRail) {
      const railCost = weightTons * baseKm * 0.055 * (cargoType === 'reefer' ? 1.4 : 1);
      const railHours = baseKm / 35 + 48; // with bogie changes
      plans.push({
        id: 'rail-eco',
        title: 'ریلی ترکیبی کانتینری (اینترمودال)',
        mode: 'rail',
        icon: Train,
        costUsd: Math.round(railCost),
        durationDays: Math.ceil(railHours / 16),
        riskScore: 'بسیار کم',
        documents: ['بارنامه CIM / SMGS مشترک', 'مانیفست قطار باری', 'گواهی قرنطینه و مبدأ'],
        summary: 'اقتصادی‌ترین شیوه برای محموله‌های با تناژ بالا و فله، ایمنی بسیار بالا در فصول زمستان.',
      });
    }

    // Option 3: Sea-Road / Maritime
    if (allowSea) {
      const seaCost = weightTons * (baseKm * 0.035 + 600);
      const seaHours = baseKm / 24 + 96; // port handling
      plans.push({
        id: 'sea-road',
        title: 'ترکیبی جاده - دریا (کانتینری/رو-رو)',
        mode: 'sea',
        icon: Ship,
        costUsd: Math.round(seaCost),
        durationDays: Math.ceil(seaHours / 20),
        riskScore: 'کم',
        documents: ['بارنامه دریایی (Bill of Lading)', 'اظهارنامه گمرکی ترانزیت', 'بیمه دریایی کلوز A'],
        summary: 'صرفه‌جویی چشمگیر در هزینه برای مسافت‌های طولانی، به ویژه از طریق خلیج فارس، دریای سرخ یا کاسپین.',
      });
    }

    // Option 4: Air Cargo
    if (allowAir) {
      const airCost = weightTons * 1000 * 2.8;
      plans.push({
        id: 'air-express',
        title: 'هوایی سریع (Air Cargo Express)',
        mode: 'air',
        icon: Plane,
        costUsd: Math.round(airCost),
        durationDays: 2,
        riskScore: 'حداقل',
        documents: ['بارنامه هوایی (AWB)', 'فاکتور تجاری و پکینگ لیست', 'تأییدیه ایکائو (در صورت DG)'],
        summary: 'سریع‌ترین شیوه برای کالاهای باارزش، دارویی، الکترونیک حساس و محموله‌های اضطراری.',
      });
    }

    setPlanResult({
      plans,
      insuranceEstimate: Math.round(cargoValueUsd * 0.0035),
    });
  };

  const handleExportJson = () => {
    if (!planResult) return;
    const blob = new Blob([JSON.stringify(planResult, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transit-multimodal-plan.json`;
    a.click();
  };

  return (
    <div className="flex flex-col gap-3.5 p-3 font-['Vazirmatn']">
      <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <div className="text-xs font-bold text-[var(--cmd-green)] mb-1 flex items-center gap-1.5">
          <Layers className="w-4 h-4" />
          <span>برنامه‌ریز زنجیره حمل چندوجهی (Multimodal)</span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          مقایسه هوشمند سناریوهای حمل جاده‌ای، ریلی، دریایی و هوایی، برآورد هزینه، بیمه، اسناد و زمان تحویل بار.
        </p>
      </div>

      {/* Cargo and Route Form */}
      <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800 flex flex-col gap-2.5">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] text-slate-400 mb-0.5">مبدأ:</label>
            <input
              type="text"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-100"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-0.5">مقصد:</label>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-100"
            />
          </div>
        </div>

        {/* Cargo Type Pills */}
        <div>
          <label className="block text-[11px] text-slate-400 mb-1">نوع کالا:</label>
          <div className="grid grid-cols-4 gap-1 text-[11px]">
            <button
              onClick={() => setCargoType('general')}
              className={`p-1.5 rounded-lg border text-center transition-all ${
                cargoType === 'general'
                  ? 'tab-active-green font-bold'
                  : 'bg-slate-950 border-slate-800 text-slate-400'
              }`}
            >
              عمومی
            </button>
            <button
              onClick={() => setCargoType('reefer')}
              className={`p-1.5 rounded-lg border text-center transition-all ${
                cargoType === 'reefer'
                  ? 'bg-blue-500/20 border-blue-500 text-blue-300 font-bold'
                  : 'bg-slate-950 border-slate-800 text-slate-400'
              }`}
            >
              یخچالی
            </button>
            <button
              onClick={() => setCargoType('hazmat')}
              className={`p-1.5 rounded-lg border text-center transition-all ${
                cargoType === 'hazmat'
                  ? 'bg-red-500/20 border-red-500 text-red-300 font-bold'
                  : 'bg-slate-950 border-slate-800 text-slate-400'
              }`}
            >
              خطرناک (DG)
            </button>
            <button
              onClick={() => setCargoType('bulk')}
              className={`p-1.5 rounded-lg border text-center transition-all ${
                cargoType === 'bulk'
                  ? 'bg-amber-500/20 border-amber-500 text-[var(--tone-amber)] font-bold'
                  : 'bg-slate-950 border-slate-800 text-slate-400'
              }`}
            >
              فله
            </button>
          </div>
        </div>

        {/* Weight & Volume */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-[10px] text-slate-400 mb-0.5">وزن (تن):</label>
            <input
              type="number"
              value={weightTons}
              onChange={(e) => setWeightTons(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-100"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 mb-0.5">حجم (متر مکعب):</label>
            <input
              type="number"
              value={volumeM3}
              onChange={(e) => setVolumeM3(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-100"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 mb-0.5">ارزش محموله ($):</label>
            <input
              type="number"
              value={cargoValueUsd}
              onChange={(e) => setCargoValueUsd(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-100"
            />
          </div>
        </div>

        {/* Transport Modes Toggles */}
        <div>
          <label className="block text-[11px] text-slate-400 mb-1">شیوه‌های مجاز حمل:</label>
          <div className="flex gap-2 text-xs">
            <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={allowRoad}
                onChange={(e) => setAllowRoad(e.target.checked)}
                className="accent-teal-500 rounded"
              />
              <span>جاده</span>
            </label>
            <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={allowRail}
                onChange={(e) => setAllowRail(e.target.checked)}
                className="accent-teal-500 rounded"
              />
              <span>ریل</span>
            </label>
            <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={allowSea}
                onChange={(e) => setAllowSea(e.target.checked)}
                className="accent-teal-500 rounded"
              />
              <span>دریا</span>
            </label>
            <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={allowAir}
                onChange={(e) => setAllowAir(e.target.checked)}
                className="accent-teal-500 rounded"
              />
              <span>هوا</span>
            </label>
          </div>
        </div>

        <button
          onClick={handlePlan}
          className="mt-1 flex items-center justify-center gap-1.5 btn-cmd-green font-bold py-2 rounded-lg text-xs transition-all shadow-md"
        >
          <Layers className="w-4 h-4" />
          <span>تحلیل و مقایسه سناریوهای حمل</span>
        </button>
      </div>

      {/* Results */}
      {planResult && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--cmd-green)]">سناریوهای استخراج‌شده ({planResult.plans.length})</span>
            <button
              onClick={handleExportJson}
              className="flex items-center gap-1 text-[11px] text-slate-300 bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-lg border border-slate-700 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>خروجی JSON</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {planResult.plans.map((p: any) => {
              const IconComp = p.icon;
              return (
                <div
                  key={p.id}
                  className="bg-slate-900/80 border border-slate-800 hover:border-[var(--cmd-green-ring)] rounded-xl p-3 flex flex-col gap-2 transition-all shadow"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-slate-800 rounded-lg text-[var(--cmd-green)]">
                        <IconComp className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-xs text-slate-100">{p.title}</span>
                    </div>
                    <span className="text-xs font-extrabold text-amber-400">
                      ≈ ${Number(p.costUsd).toLocaleString('fa-IR')}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed">{p.summary}</p>

                  <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-slate-800 text-[11px]">
                    <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800/80">
                      <span className="text-slate-500 block text-[9.5px]">مدت زمان:</span>
                      <b className="text-slate-200">≈ {p.durationDays} روز</b>
                    </div>
                    <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800/80">
                      <span className="text-slate-500 block text-[9.5px]">سطح ریسک:</span>
                      <b className="text-slate-200">{p.riskScore}</b>
                    </div>
                    <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800/80">
                      <span className="text-slate-500 block text-[9.5px]">بیمه باربری:</span>
                      <b className="text-slate-200">≈ ${planResult.insuranceEstimate}</b>
                    </div>
                  </div>

                  {/* Documents Checklist */}
                  <div className="text-[10px] text-slate-400 flex flex-wrap gap-1 items-center mt-0.5">
                    <FileText className="w-3 h-3 text-slate-500" />
                    <span>اسناد ضروری:</span>
                    {p.documents.map((doc: string, di: number) => (
                      <span key={di} className="bg-slate-950 px-1.5 py-0.5 rounded text-slate-300 border border-slate-800">
                        {doc}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => {
              onOpenAiGrounding(`بررسی شرکت‌های مجری حمل، فورواردرها و نرخ به‌روز حمل ${origin} به ${destination} برای محموله ${cargoType}`);
            }}
            className="flex items-center justify-center gap-1.5 bg-[var(--cmd-green-soft)] hover:brightness-95 border border-[var(--cmd-green-ring)] text-[var(--cmd-green)] py-2 rounded-xl text-xs font-semibold transition-all mt-1"
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>استعلام فورواردرها و نرخ‌های آنلاین با دستیار هوشمند</span>
          </button>
        </div>
      )}
    </div>
  );
};
