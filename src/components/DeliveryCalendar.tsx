import React, { useState, useMemo } from 'react';
import { DeliveryRecord } from '../types';
import { extractRecordDate } from '../services/storage';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, XCircle, CheckCircle2, Package, Scale, Layers } from 'lucide-react';

interface DeliveryCalendarProps {
  records: DeliveryRecord[];
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
}

export const DeliveryCalendar: React.FC<DeliveryCalendarProps> = ({
  records,
  selectedDate,
  onSelectDate,
}) => {
  // Current displayed month & year
  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(() => {
    return new Date();
  });

  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();

  // Aggregate daily delivery metrics (KG and Batches only - rolls intentionally excluded)
  const dailyMetrics = useMemo(() => {
    const map: Record<string, { kg: number; batches: number; developments: Record<string, number> }> = {};

    records
      .filter(r => r.status === 'Delivered')
      .forEach(r => {
        const d = extractRecordDate(r.deliveredAt || r.receivedAt || r.createdAt);
        if (d) {
          if (!map[d]) {
            map[d] = { kg: 0, batches: 0, developments: {} };
          }
          map[d].kg += r.kgQty || 0;
          map[d].batches += 1;
          const dev = (r.development || 'UNKNOWN').trim().toUpperCase();
          map[d].developments[dev] = (map[d].developments[dev] || 0) + (r.kgQty || 0);
        }
      });

    return map;
  }, [records]);

  // Max delivery volume for intensity scaling
  const maxDayKg = useMemo(() => {
    const values = Object.values(dailyMetrics).map(v => v.kg);
    return values.length > 0 ? Math.max(...values, 100) : 500;
  }, [dailyMetrics]);

  // Navigation
  const handlePrevMonth = () => {
    setCurrentMonthDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonthDate(new Date(year, month + 1, 1));
  };

  const handleCurrentMonth = () => {
    setCurrentMonthDate(new Date());
  };

  // Month grid calculation
  const monthName = currentMonthDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 is Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Helper for formatting integer weight with thousand separator comma (no 'k' notation)
  const formatIntegerWeight = (kg: number): string => {
    if (!kg || kg <= 0) return '0 KG';
    return `${Math.round(kg).toLocaleString('en-US')} KG`;
  };

  // Aggregated metrics for current selected/displayed month
  const thisMonthStats = useMemo(() => {
    let totalKg = 0;
    let totalBatches = 0;
    let activeDays = 0;
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${prefix}-${String(d).padStart(2, '0')}`;
      const metric = dailyMetrics[dateStr];
      if (metric && metric.kg > 0) {
        totalKg += metric.kg;
        totalBatches += metric.batches;
        activeDays++;
      }
    }

    const avgKg = activeDays > 0 ? Math.round(totalKg / activeDays) : 0;
    return {
      totalKg,
      totalBatches,
      activeDays,
      avgKg,
    };
  }, [dailyMetrics, year, month, daysInMonth]);

  // Build calendar matrix
  const daysArray: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    daysArray.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    daysArray.push(d);
  }

  // Get intensity color based on delivery volume
  const getIntensityClass = (kg: number) => {
    if (kg <= 0) return 'bg-slate-50 text-slate-400 hover:bg-slate-100';
    const ratio = kg / maxDayKg;
    if (ratio < 0.25) return 'bg-[#04342c]/15 text-[#04342c] font-semibold hover:bg-[#04342c]/25';
    if (ratio < 0.55) return 'bg-[#04342c]/40 text-white font-semibold hover:bg-[#04342c]/50';
    if (ratio < 0.8) return 'bg-[#04342c]/75 text-white font-bold hover:bg-[#04342c]/85';
    return 'bg-[#04342c] text-white font-bold hover:bg-[#032620] ring-1 ring-[#04342c]';
  };

  const todayStr = new Date().toISOString().split('T')[0];

  // Selected date statistics
  const selectedDayMetric = selectedDate ? dailyMetrics[selectedDate] : null;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-2xs space-y-3.5">
      {/* Calendar Header with prominent Date Filter indication */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-[#04342c]" />
            <h2 className="text-xs sm:text-sm font-bold text-[#04342c] uppercase tracking-wider">
              Delivery Activity Calendar
            </h2>
          </div>

          {/* Date Filter Indication in the Heading Section */}
          {selectedDate ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-600 text-white text-xs font-bold shadow-xs animate-in fade-in duration-150">
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              <span>Filtered Date: {selectedDate}</span>
              <button
                type="button"
                onClick={() => onSelectDate(null)}
                className="ml-1 text-white hover:text-emerald-200 font-extrabold cursor-pointer"
                title="Clear date filter"
              >
                ✕ Clear
              </button>
            </div>
          ) : (
            <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              Click any day to filter & inspect statistics
            </span>
          )}
        </div>

        {/* Month Navigation & Average Stats */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {/* This Month Average Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-[#04342c] border border-emerald-200/80 rounded-md text-xs font-semibold shadow-2xs">
            <span className="text-slate-500 font-medium text-[11px]">Month Avg:</span>
            <span className="font-bold text-[#04342c]">
              {formatIntegerWeight(thisMonthStats.avgKg)}
              <span className="text-[10px] font-medium text-slate-500 ml-0.5">/ day</span>
            </span>
          </div>

          {selectedDate && (
            <button
              onClick={() => onSelectDate(null)}
              className="flex items-center gap-1 text-xs bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 px-2 py-1 rounded font-bold transition-colors cursor-pointer"
            >
              <span>Reset Filter</span>
              <XCircle className="w-3.5 h-3.5 text-slate-500" />
            </button>
          )}

          <div className="flex items-center border border-slate-200 rounded-md bg-slate-50 overflow-hidden text-xs">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleCurrentMonth}
              className="px-2.5 py-1 font-bold text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              {monthName}
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1.5 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Days of Week Header */}
      <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider">
        <div>Sun</div>
        <div>Mon</div>
        <div>Tue</div>
        <div>Wed</div>
        <div>Thu</div>
        <div>Fri</div>
        <div>Sat</div>
      </div>

      {/* Calendar Days Matrix */}
      <div className="grid grid-cols-7 gap-1.5">
        {daysArray.map((dayNum, idx) => {
          if (dayNum === null) {
            return <div key={`empty-${idx}`} className="h-16 sm:h-20 rounded-md bg-transparent" />;
          }

          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
          const metric = dailyMetrics[dateStr] || { kg: 0, batches: 0, developments: {} };
          const isSelected = selectedDate === dateStr;
          const isToday = dateStr === todayStr;

          return (
            <div
              key={dateStr}
              onClick={() => onSelectDate(isSelected ? null : dateStr)}
              className={`h-16 sm:h-20 p-1 sm:p-1.5 rounded-md border flex flex-col justify-between transition-all cursor-pointer relative group ${
                isSelected
                  ? 'border-2 border-[#04342c] ring-3 ring-emerald-400 shadow-md scale-[1.02] z-10'
                  : isToday
                  ? 'border-emerald-500'
                  : 'border-slate-200'
              } ${getIntensityClass(metric.kg)}`}
            >
              {/* Day Number and Today indicator */}
              <div className="flex items-center justify-between text-[10px] sm:text-xs leading-none">
                <span className={`font-bold ${isToday ? 'underline decoration-2 font-black' : ''}`}>
                  {dayNum}
                </span>
                {isSelected && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-white" />
                )}
              </div>

              {/* CENTER: Full KG as Integer in center */}
              <div className="flex-1 flex flex-col items-center justify-center my-0.5">
                {metric.kg > 0 ? (
                  <div className="text-[11px] sm:text-xs font-black font-mono tracking-tight text-center leading-tight">
                    {Math.round(metric.kg).toLocaleString('en-US')} KG
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-300 font-mono text-center">-</div>
                )}

                {/* BELOW: Batch Qty below the KG (roll qty is NOT mentioned) */}
                {metric.batches > 0 && (
                  <div className="text-[8.5px] sm:text-[9.5px] font-semibold text-center opacity-85 mt-0.5 leading-none">
                    {metric.batches} {metric.batches === 1 ? 'batch' : 'batches'}
                  </div>
                )}
              </div>

              {/* Hover Tooltip (Rolls intentionally omitted) */}
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:flex flex-col items-center z-40 pointer-events-none">
                <div className="bg-slate-900 text-white text-[11px] rounded px-2.5 py-1.5 shadow-xl whitespace-nowrap">
                  <div className="font-bold text-emerald-300">{dateStr}</div>
                  {metric.kg > 0 ? (
                    <div>
                      {Math.round(metric.kg).toLocaleString('en-US')} KG · {metric.batches} Batches
                    </div>
                  ) : (
                    <div className="text-slate-300 italic">No delivery recorded on this date</div>
                  )}
                </div>
                <div className="w-2 h-2 bg-slate-900 transform rotate-45 -mt-1" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Day Delivery Statistics Panel */}
      {selectedDate && (
        <div className="p-3.5 rounded-lg border-2 border-emerald-300 bg-emerald-50/70 text-slate-800 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 mb-2 border-b border-emerald-200 gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              <span className="font-bold text-xs uppercase tracking-wider text-emerald-950">
                Daily Delivery Statistics · {selectedDate}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onSelectDate(null)}
              className="text-xs font-bold text-emerald-800 hover:text-emerald-950 underline self-start sm:self-auto cursor-pointer"
            >
              Clear Date Filter
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-white p-2.5 rounded border border-emerald-200 shadow-2xs">
              <div className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
                Delivered Weight
              </div>
              <div className="text-base sm:text-lg font-black text-[#04342c] font-mono mt-0.5">
                {selectedDayMetric && selectedDayMetric.kg > 0
                  ? `${Math.round(selectedDayMetric.kg).toLocaleString('en-US')} KG`
                  : '0 KG'}
              </div>
            </div>

            <div className="bg-white p-2.5 rounded border border-emerald-200 shadow-2xs">
              <div className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
                Completed Batches
              </div>
              <div className="text-base sm:text-lg font-black text-[#04342c] font-mono mt-0.5">
                {selectedDayMetric ? selectedDayMetric.batches : 0} Batches
              </div>
            </div>

            <div className="bg-white p-2.5 rounded border border-emerald-200 shadow-2xs col-span-2 sm:col-span-1">
              <div className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
                Developments Delivered
              </div>
              <div className="text-base sm:text-lg font-black text-[#04342c] font-mono mt-0.5">
                {selectedDayMetric ? Object.keys(selectedDayMetric.developments).length : 0} Devs
              </div>
            </div>
          </div>

          {selectedDayMetric && Object.keys(selectedDayMetric.developments).length > 0 && (
            <div className="mt-2.5 pt-2 border-t border-emerald-200/70 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[11px] font-bold text-emerald-900 mr-1">Lots Summary:</span>
              {Object.entries(selectedDayMetric.developments).map(([dev, kg]) => (
                <span
                  key={dev}
                  className="px-2 py-0.5 rounded bg-white text-emerald-950 border border-emerald-300 font-mono font-bold text-[10.5px] shadow-2xs"
                >
                  {dev}: <span className="text-[#04342c]">{Math.round(kg).toLocaleString('en-US')} KG</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Heatmap Legend */}
      <div className="flex items-center justify-end pt-3 border-t border-slate-100 text-xs text-slate-500">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-slate-400">Activity Intensity:</span>
          <div className="flex items-center gap-1">
            <span className="w-3.5 h-3.5 rounded bg-slate-50 border border-slate-200" title="0 KG" />
            <span className="w-3.5 h-3.5 rounded bg-[#04342c]/15" title="Low Volume" />
            <span className="w-3.5 h-3.5 rounded bg-[#04342c]/40" title="Medium Volume" />
            <span className="w-3.5 h-3.5 rounded bg-[#04342c]/75" title="High Volume" />
            <span className="w-3.5 h-3.5 rounded bg-[#04342c]" title="Peak Volume" />
          </div>
          <span className="text-slate-400 font-medium">Peak</span>
        </div>
      </div>
    </div>
  );
};
