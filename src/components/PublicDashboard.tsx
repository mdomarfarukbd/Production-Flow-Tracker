import React, { useState, useMemo } from 'react';
import { DeliveryRecord, DateFilter, DashboardSectionId } from '../types';
import { DateFilterRow } from './DateFilterRow';
import { DeliveryCalendar } from './DeliveryCalendar';
import { computeDeliverySummary, formatDateToYYYYMMDD, extractRecordDate } from '../services/storage';
import {
  Search,
  X,
  Database,
  CheckCircle2,
  Clock,
  TrendingUp,
  Package,
  Layers,
  Scale,
  Award,
  ChevronRight,
  PieChart as PieChartIcon,
  PauseCircle,
  Building2,
  Users,
  AlertTriangle,
} from 'lucide-react';
import { SvgPieChart, PieChartSliceItem } from './SvgPieChart';

interface PublicDashboardProps {
  records: DeliveryRecord[];
  dateFilter: DateFilter;
  onFilterChange: (filter: DateFilter) => void;
  sectionOrder?: DashboardSectionId[];
}

/**
 * Format weight without using 'k' notation.
 * Uses thousand separator comma (e.g. 8,250 KG).
 * When weight crosses 10 Ton (>= 10,000 KG), uses Ton (e.g. 12.5 Ton).
 */
export function formatWeightDisplay(kg: number, withUnit: boolean = true): string {
  if (!kg || kg <= 0) return withUnit ? '0 KG' : '0';
  if (kg >= 10000) {
    const tons = (kg / 1000).toFixed(1);
    return `${tons} Ton`;
  }
  const formatted = Math.round(kg).toLocaleString('en-US');
  return withUnit ? `${formatted} KG` : formatted;
}

export const PublicDashboard: React.FC<PublicDashboardProps> = ({
  records,
  dateFilter,
  onFilterChange,
  sectionOrder,
}) => {
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);

  // Development & Customer Filter states
  const [developmentFilter, setDevelopmentFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');

  // Public database search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [tableStatusTab, setTableStatusTab] = useState<'All' | 'Delivered' | 'Pending'>('All');

  // Extract all unique developments for the dropdown filter
  const availableDevelopments = useMemo(() => {
    const devSet = new Set<string>();
    records.forEach(r => {
      if (r.development && r.development.trim()) {
        devSet.add(r.development.trim().toUpperCase());
      }
    });
    return Array.from(devSet).sort();
  }, [records]);

  // Synchronize calendar selection with date filter
  React.useEffect(() => {
    if (selectedCalendarDate && dateFilter.isFiltered) {
      if (dateFilter.startDate && selectedCalendarDate < dateFilter.startDate) {
        setSelectedCalendarDate(null);
      } else if (dateFilter.endDate && selectedCalendarDate > dateFilter.endDate) {
        setSelectedCalendarDate(null);
      }
    }
  }, [dateFilter, selectedCalendarDate]);

  // Period records: filtered strictly by date range and clicked calendar day (baseline for all pie charts)
  const periodRecords = useMemo(() => {
    return records.filter(r => {
      const recDate = extractRecordDate(r.receivedAt || r.createdAt);
      const delDate = extractRecordDate(r.deliveredAt || (r.status === 'Delivered' ? r.receivedAt : ''));

      // If user clicked a specific day in the calendar
      if (selectedCalendarDate) {
        if (r.status === 'Delivered') {
          if (delDate !== selectedCalendarDate) return false;
        } else {
          if (recDate !== selectedCalendarDate) return false;
        }
      }

      // If date range filter is active
      if (dateFilter.isFiltered) {
        if (r.status === 'Delivered') {
          if (dateFilter.startDate && delDate < dateFilter.startDate) return false;
          if (dateFilter.endDate && delDate > dateFilter.endDate) return false;
        } else {
          if (dateFilter.endDate && recDate > dateFilter.endDate) return false;
        }
      }

      return true;
    });
  }, [records, dateFilter, selectedCalendarDate]);

  // Filtered records: period records with interactive developmentFilter, customerFilter, and linked searchQuery applied
  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return periodRecords.filter(r => {
      if (developmentFilter) {
        const dev = (r.development || '').trim().toUpperCase();
        if (dev !== developmentFilter) return false;
      }
      if (customerFilter) {
        const cust = (r.customerName || 'General Buyer').trim().toLowerCase();
        if (cust !== customerFilter.toLowerCase()) return false;
      }
      if (q) {
        const batchMatch = (r.batch || '').toLowerCase().includes(q);
        const devMatch = (r.development || '').toLowerCase().includes(q);
        const custMatch = (r.customerName || '').toLowerCase().includes(q);
        const colorMatch = (r.color || '').toLowerCase().includes(q);
        if (!batchMatch && !devMatch && !custMatch && !colorMatch) return false;
      }
      return true;
    });
  }, [periodRecords, developmentFilter, customerFilter, searchQuery]);

  // Delivery summary (ROUND FIGURES ONLY FOR PUBLIC PAGE)
  const summary = useMemo(() => {
    const raw = computeDeliverySummary(filteredRecords);
    return {
      deliveredBatches: Math.round(raw.deliveredBatches),
      deliveredRolls: Math.round(raw.deliveredRolls),
      deliveredKg: Math.round(raw.deliveredKg),
      pendingBatches: Math.round(raw.pendingBatches),
      pendingRolls: Math.round(raw.pendingRolls),
      pendingKg: Math.round(raw.pendingKg),
      totalBatches: Math.round(raw.totalBatches),
      totalRolls: Math.round(raw.totalRolls),
      totalKg: Math.round(raw.totalKg),
      deliveryRate: raw.totalKg > 0 ? Math.round((raw.deliveredKg / raw.totalKg) * 100) : 0,
      pendingRate: raw.totalKg > 0 ? Math.round((raw.pendingKg / raw.totalKg) * 100) : 0,
    };
  }, [filteredRecords]);

  // Delivery & Pending Trend Data - Synchronized dynamically with dateFilter and database records
  const dailyTrendData = useMemo(() => {
    const todayStr = formatDateToYYYYMMDD(new Date());
    const endStr = dateFilter.endDate || todayStr;
    const startStr = dateFilter.startDate;
    let days: string[] = [];

    if (dateFilter.isFiltered && startStr && endStr) {
      const startDateObj = new Date(startStr + 'T12:00:00');
      const endDateObj = new Date(endStr + 'T12:00:00');
      const diffTime = endDateObj.getTime() - startDateObj.getTime();
      const diffDays = Math.round(diffTime / (1000 * 3600 * 24));

      if (diffDays >= 0 && diffDays <= 14) {
        for (let i = 0; i <= diffDays; i++) {
          const d = new Date(startDateObj);
          d.setDate(startDateObj.getDate() + i);
          days.push(formatDateToYYYYMMDD(d));
        }
      } else {
        const endDate = new Date(endStr + 'T12:00:00');
        for (let i = 6; i >= 0; i--) {
          const d = new Date(endDate);
          d.setDate(endDate.getDate() - i);
          days.push(formatDateToYYYYMMDD(d));
        }
      }
    } else {
      // Default: Last 7 calendar days ending today
      const today = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        days.push(formatDateToYYYYMMDD(d));
      }
    }

    return days.map(dayStr => {
      let delKg = 0;
      let delBatches = 0;
      let pendKg = 0;
      let pendBatches = 0;

      records.forEach(r => {
        // If developmentFilter is active
        if (developmentFilter) {
          const dev = (r.development || '').trim().toUpperCase();
          if (dev !== developmentFilter) return;
        }

        const recDate = extractRecordDate(r.receivedAt || r.createdAt);
        const delDate = extractRecordDate(r.deliveredAt || '');

        if (r.status === 'Delivered') {
          const effectiveDate = delDate || recDate;
          if (effectiveDate === dayStr) {
            delKg += r.kgQty || 0;
            delBatches += 1;
          }
        } else {
          if (recDate === dayStr) {
            pendKg += r.kgQty || 0;
            pendBatches += 1;
          }
        }
      });

      const totalKg = delKg + pendKg;
      const totalBatches = delBatches + pendBatches;

      return {
        date: dayStr,
        delKg: Math.round(delKg),
        delBatches,
        pendKg: Math.round(pendKg),
        pendBatches,
        totalKg: Math.round(totalKg),
        totalBatches,
      };
    });
  }, [records, dateFilter, developmentFilter]);

  const maxDailyVolume = useMemo(() => {
    return Math.max(...dailyTrendData.map(d => d.totalKg), 1);
  }, [dailyTrendData]);

  // Default Last Week Average KG quantity
  const lastWeekAvgStats = useMemo(() => {
    const now = new Date();
    const past7Days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      past7Days.push(formatDateToYYYYMMDD(d));
    }

    const past7Set = new Set(past7Days);
    let totalPastWeekKg = 0;
    records.forEach(r => {
      if (developmentFilter) {
        const dev = (r.development || '').trim().toUpperCase();
        if (dev !== developmentFilter) return;
      }
      const d = extractRecordDate(r.deliveredAt || r.receivedAt || r.createdAt);
      if (d && past7Set.has(d)) {
        totalPastWeekKg += r.kgQty || 0;
      }
    });

    const avgDailyKg = Math.round(totalPastWeekKg / 7);
    return {
      totalPastWeekKg,
      avgDailyKg,
    };
  }, [records, developmentFilter]);

  // Palette collections for the 3 distinct Pie Charts
  const PIE_COLORS_DEV = ['#04342c', '#059669', '#0284c7', '#d97706', '#8b5cf6', '#e11d48'];
  const PIE_COLORS_CUST = ['#0f766e', '#2563eb', '#7c3aed', '#c026d3', '#ea580c', '#0284c7'];
  const PIE_COLORS_SHORT = ['#b91c1c', '#dc2626', '#ea580c', '#d97706', '#9333ea', '#6366f1'];

  // 1. Top 6 Development Delivery Report for filtered period
  const top6Developments = useMemo(() => {
    const devMap: Record<string, { dev: string; deliveredKg: number; batches: number }> = {};
    let totalPeriodDeliveredKg = 0;

    periodRecords.forEach(r => {
      if (r.status === 'Delivered') {
        const dev = (r.development || 'UNKNOWN').trim().toUpperCase();
        if (!devMap[dev]) {
          devMap[dev] = { dev, deliveredKg: 0, batches: 0 };
        }
        devMap[dev].deliveredKg += r.kgQty || 0;
        devMap[dev].batches += 1;
        totalPeriodDeliveredKg += r.kgQty || 0;
      }
    });

    const sorted = Object.values(devMap).sort((a, b) => b.deliveredKg - a.deliveredKg);
    const top6 = sorted.slice(0, 6);

    const items: PieChartSliceItem[] = top6.map((item, idx) => ({
      id: item.dev,
      label: item.dev,
      value: Math.round(item.deliveredKg),
      pctOfTotal: totalPeriodDeliveredKg > 0 ? Math.round((item.deliveredKg / totalPeriodDeliveredKg) * 100) : 0,
      sublabel: `${item.batches} lots`,
      color: PIE_COLORS_DEV[idx % PIE_COLORS_DEV.length],
    }));

    return {
      items,
      totalPeriodDeliveredKg: Math.round(totalPeriodDeliveredKg),
      totalActiveDevs: sorted.length,
    };
  }, [periodRecords]);

  // 2. Top 6 Customer Delivery Report for filtered period
  const top6Customers = useMemo(() => {
    const custMap: Record<string, { customer: string; deliveredKg: number; batches: number }> = {};
    let totalDeliveredKg = 0;

    periodRecords.forEach(r => {
      if (r.status === 'Delivered') {
        const cust = (r.customerName || 'General Buyer').trim();
        if (!custMap[cust]) {
          custMap[cust] = { customer: cust, deliveredKg: 0, batches: 0 };
        }
        custMap[cust].deliveredKg += r.kgQty || 0;
        custMap[cust].batches += 1;
        totalDeliveredKg += r.kgQty || 0;
      }
    });

    const sorted = Object.values(custMap).sort((a, b) => b.deliveredKg - a.deliveredKg);
    const top6 = sorted.slice(0, 6);

    const items: PieChartSliceItem[] = top6.map((item, idx) => ({
      id: item.customer,
      label: item.customer,
      value: Math.round(item.deliveredKg),
      pctOfTotal: totalDeliveredKg > 0 ? Math.round((item.deliveredKg / totalDeliveredKg) * 100) : 0,
      sublabel: `${item.batches} lots`,
      color: PIE_COLORS_CUST[idx % PIE_COLORS_CUST.length],
    }));

    return {
      items,
      totalDeliveredKg: Math.round(totalDeliveredKg),
      totalCustomers: sorted.length,
    };
  }, [periodRecords]);

  // 3. Short Quantity Ranking by Development (whose development is short qty)
  const shortQtyDevelopments = useMemo(() => {
    const devShortMap: Record<string, { dev: string; shortKg: number; batches: number }> = {};
    let totalShortKg = 0;

    periodRecords.forEach(r => {
      let recordShortKg = 0;
      if (r.shortQty && r.shortQty > 0) {
        recordShortKg = r.shortQty;
      } else if (r.status === 'Pending' || r.priority === 'Hold') {
        recordShortKg = r.kgQty || 0;
      } else if (r.remarks) {
        const match = r.remarks.match(/(?:short|shortage|bal|balance|due)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:kg)?/i);
        if (match) {
          recordShortKg = parseFloat(match[1]) || 0;
        }
      }

      if (recordShortKg > 0) {
        const dev = (r.development || 'UNKNOWN').trim().toUpperCase();
        if (!devShortMap[dev]) {
          devShortMap[dev] = { dev, shortKg: 0, batches: 0 };
        }
        devShortMap[dev].shortKg += recordShortKg;
        devShortMap[dev].batches += 1;
        totalShortKg += recordShortKg;
      }
    });

    const sorted = Object.values(devShortMap).sort((a, b) => b.shortKg - a.shortKg);
    const top6 = sorted.slice(0, 6);

    const items: PieChartSliceItem[] = top6.map((item, idx) => ({
      id: item.dev,
      label: item.dev,
      value: Math.round(item.shortKg),
      pctOfTotal: totalShortKg > 0 ? Math.round((item.shortKg / totalShortKg) * 100) : 0,
      sublabel: `${item.batches} lots`,
      color: PIE_COLORS_SHORT[idx % PIE_COLORS_SHORT.length],
    }));

    return {
      items,
      totalShortKg: Math.round(totalShortKg),
      totalShortDevs: sorted.length,
    };
  }, [periodRecords]);

  // Hold summary stats for the 6-blocks row
  const holdStats = useMemo(() => {
    let holdBatches = 0;
    let holdKg = 0;
    filteredRecords.forEach(r => {
      if (r.priority === 'Hold') {
        holdBatches += 1;
        holdKg += r.kgQty || 0;
      }
    });
    return {
      holdBatches,
      holdKg: Math.round(holdKg),
    };
  }, [filteredRecords]);

  // Public database records: filtered by date, dev, search (batch, dev, color, customer), and status tab
  const publicDatabaseRecords = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return filteredRecords.filter(r => {
      // Status filter tab
      if (tableStatusTab === 'Delivered' && r.status !== 'Delivered') return false;
      if (tableStatusTab === 'Pending' && r.status !== 'Pending') return false;

      // Public search in batch, dev, color, and customer name
      if (query) {
        const batchMatch = (r.batch || '').toLowerCase().includes(query);
        const devMatch = (r.development || '').toLowerCase().includes(query);
        const colorMatch = (r.color || '').toLowerCase().includes(query);
        const customerMatch = (r.customerName || '').toLowerCase().includes(query);
        if (!batchMatch && !devMatch && !colorMatch && !customerMatch) return false;
      }

      return true;
    });
  }, [filteredRecords, searchQuery, tableStatusTab]);

  // 1. Render Summary KPI Blocks
  const renderSummaryCards = () => (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Block 1: Delivered KG */}
        <div className="bg-white rounded-lg border border-emerald-200/90 p-3 sm:p-3.5 shadow-2xs flex flex-col justify-between transition-all hover:border-emerald-300">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-900">
              Delivered KG
            </span>
            <Scale className="w-3.5 h-3.5 text-emerald-700" />
          </div>
          <div className="text-base sm:text-lg font-black text-[#04342c] font-mono leading-tight">
            {formatWeightDisplay(summary.deliveredKg, true)}
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] text-emerald-700 font-semibold">
            <span>Volume</span>
            <span>{summary.deliveryRate}% Rate</span>
          </div>
        </div>

        {/* Block 2: Delivered Batch */}
        <div className="bg-white rounded-lg border border-emerald-200/90 p-3 sm:p-3.5 shadow-2xs flex flex-col justify-between transition-all hover:border-emerald-300">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-900">
              Delivered Batch
            </span>
            <Package className="w-3.5 h-3.5 text-emerald-700" />
          </div>
          <div className="text-base sm:text-lg font-black text-[#04342c] font-mono leading-tight">
            {summary.deliveredBatches.toLocaleString()}
          </div>
          <div className="mt-1 text-[10px] text-emerald-700 font-medium">
            Lots Completed
          </div>
        </div>

        {/* Block 3: Pending KG */}
        <div className="bg-white rounded-lg border border-amber-200 p-3 sm:p-3.5 shadow-2xs flex flex-col justify-between transition-all hover:border-amber-300">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-amber-900">
              Pending KG
            </span>
            <Clock className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="text-base sm:text-lg font-black text-amber-800 font-mono leading-tight">
            {formatWeightDisplay(summary.pendingKg, true)}
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] text-amber-700 font-semibold">
            <span>Staging</span>
            <span>{summary.pendingRate}% Rate</span>
          </div>
        </div>

        {/* Block 4: Pending Batch */}
        <div className="bg-white rounded-lg border border-amber-200 p-3 sm:p-3.5 shadow-2xs flex flex-col justify-between transition-all hover:border-amber-300">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-amber-900">
              Pending Batch
            </span>
            <Package className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="text-base sm:text-lg font-black text-amber-800 font-mono leading-tight">
            {summary.pendingBatches.toLocaleString()}
          </div>
          <div className="mt-1 text-[10px] text-amber-700 font-medium">
            Batches Staged
          </div>
        </div>

        {/* Block 5: Hold Batch (Count of batches on Hold) */}
        <div className="bg-white rounded-lg border border-orange-200 p-3 sm:p-3.5 shadow-2xs flex flex-col justify-between transition-all hover:border-orange-300 bg-orange-50/20">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-orange-950">
              Hold Batch
            </span>
            <PauseCircle className="w-3.5 h-3.5 text-orange-600" />
          </div>
          <div className="text-base sm:text-lg font-black text-orange-900 font-mono leading-tight">
            {holdStats.holdBatches.toLocaleString()}
          </div>
          <div className="mt-1 text-[10px] text-orange-700 font-medium">
            Batches on Hold
          </div>
        </div>

        {/* Block 6: Hold KG (Total weight on Hold) */}
        <div className="bg-white rounded-lg border border-orange-200 p-3 sm:p-3.5 shadow-2xs flex flex-col justify-between transition-all hover:border-orange-300 bg-orange-50/20">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-orange-950">
              Hold KG
            </span>
            <Scale className="w-3.5 h-3.5 text-orange-600" />
          </div>
          <div className="text-base sm:text-lg font-black text-orange-900 font-mono leading-tight">
            {formatWeightDisplay(holdStats.holdKg, true)}
          </div>
          <div className="mt-1 text-[10px] text-orange-700 font-medium">
            Paused Volume
          </div>
        </div>
      </div>
    );

    // 2. Render Trend Chart & Top 6 Development Delivery
    const renderTrendChart = () => (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Left Side: Stacked Column Chart */}
        <div className="lg:col-span-7 bg-white rounded-lg border border-slate-200 shadow-2xs p-3.5 sm:p-4 flex flex-col justify-between">
          {/* Header without subtitles */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2.5 border-b border-slate-100 mb-3 gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-[#04342c] uppercase tracking-wider">
                Daily Delivery & Pending Trend
              </h2>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-2 text-[11px] self-start sm:self-auto">
              <span className="flex items-center gap-1 font-semibold text-slate-700">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#04342c]"></span> Delivered
              </span>
              <span className="flex items-center gap-1 font-semibold text-slate-700">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#f59e0b]"></span> Pending
              </span>
            </div>
          </div>

          {/* Unified Stacked Column Chart with non-overlapping totals strictly on top */}
          <div className="relative h-60 sm:h-64 w-full flex items-end justify-between pt-12 px-2 pb-7 border-b border-slate-100">
            {dailyTrendData.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                No activity records in this period.
              </div>
            ) : (
              dailyTrendData.map((day, idx) => {
                const totalHeightPercent =
                  day.totalKg > 0 ? Math.max(14, Math.min(68, Math.round((day.totalKg / maxDailyVolume) * 68))) : 0;
                const isHovered = hoveredBarIndex === idx;

                const dayParts = day.date.split('-');
                const monthNames = [
                  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
                ];
                const monthIdx = parseInt(dayParts[1] || '1', 10) - 1;
                const formattedDayLabel = `${dayParts[2]} ${monthNames[monthIdx] || ''}`;

                return (
                  <div
                    key={day.date}
                    className="flex-1 flex flex-col items-center h-full justify-end relative cursor-pointer mx-1 group"
                    onMouseEnter={() => setHoveredBarIndex(idx)}
                    onMouseLeave={() => setHoveredBarIndex(null)}
                  >
                    {isHovered && (
                      <div className="absolute -top-16 z-40 pointer-events-none bg-slate-900 text-white text-[10px] rounded-lg px-3 py-1.5 shadow-xl whitespace-nowrap flex flex-col items-center font-sans border border-slate-700 animate-in fade-in zoom-in-95 duration-100">
                        <span className="font-bold text-slate-200 border-b border-slate-700/80 pb-0.5 mb-1 w-full text-center">
                          {day.date} · {formatWeightDisplay(day.totalKg, true)} ({day.totalBatches} Lots)
                        </span>
                        <div className="flex items-center gap-3 text-[10px]">
                          <span className="font-bold text-emerald-300 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                            Delivered: {formatWeightDisplay(day.delKg, true)} ({day.delBatches} lots)
                          </span>
                          <span className="font-bold text-amber-300 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                            Pending: {formatWeightDisplay(day.pendKg, true)} ({day.pendBatches} lots)
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Single Stacked Column for the same day with KG Quantities */}
                    <div className="flex items-end justify-center w-full h-full pb-0.5 relative">
                      {/* Total KG Quantity display strictly ON TOP of the column without overlapping */}
                      {day.totalKg > 0 ? (
                        <div
                          className="absolute flex flex-col items-center pointer-events-none z-20 whitespace-nowrap transition-transform group-hover:scale-105"
                          style={{ bottom: `calc(${totalHeightPercent}% + 4px)` }}
                        >
                          <span className="text-[9.5px] sm:text-[10px] font-bold text-[#04342c] leading-none px-1.5 py-0.5 rounded bg-white/95 border border-slate-300/80 shadow-2xs">
                            {formatWeightDisplay(day.totalKg, true)}
                          </span>
                        </div>
                      ) : (
                        <div className="absolute bottom-2 flex flex-col items-center pointer-events-none">
                          <span className="text-[8px] font-semibold text-slate-300">0 KG</span>
                        </div>
                      )}

                      {/* Stacked Column Body */}
                      {day.totalKg > 0 ? (
                        <div
                          className="w-full max-w-[42px] sm:max-w-[50px] rounded-t-md overflow-hidden flex flex-col-reverse shadow-xs transition-all duration-300 group-hover:brightness-105 ring-1 ring-black/10"
                          style={{
                            height: `${totalHeightPercent}%`,
                            minHeight: '36px',
                          }}
                        >
                          {/* Bottom Segment: Delivered KG in #04342c */}
                          {day.delKg > 0 && (
                            <div
                              className="w-full flex flex-col items-center justify-center transition-all duration-300 py-0.5 px-0.5 select-none relative overflow-hidden"
                              style={{
                                height: `${(day.delKg / day.totalKg) * 100}%`,
                                backgroundColor: '#04342c',
                                minHeight: day.delKg > 0 ? '16px' : '0px',
                              }}
                              title={`Delivered: ${formatWeightDisplay(day.delKg, true)}`}
                            >
                              <span className="text-[8.5px] sm:text-[9.5px] font-bold text-emerald-100 leading-tight text-center drop-shadow-xs px-0.5">
                                {formatWeightDisplay(day.delKg, false)}
                              </span>
                              <span className="text-[7px] text-emerald-300/80 font-medium leading-none hidden sm:block">
                                {day.delKg >= 10000 ? 'Ton' : 'KG'}
                              </span>
                            </div>
                          )}

                          {/* Top Segment: Pending KG in #f59e0b */}
                          {day.pendKg > 0 && (
                            <div
                              className="w-full flex flex-col items-center justify-center transition-all duration-300 py-0.5 px-0.5 select-none relative overflow-hidden border-b border-black/10"
                              style={{
                                height: `${(day.pendKg / day.totalKg) * 100}%`,
                                backgroundColor: '#f59e0b',
                                minHeight: day.pendKg > 0 ? '16px' : '0px',
                              }}
                              title={`Pending: ${formatWeightDisplay(day.pendKg, true)}`}
                            >
                              <span className="text-[8.5px] sm:text-[9.5px] font-bold text-slate-900 leading-tight text-center drop-shadow-xs px-0.5">
                                {formatWeightDisplay(day.pendKg, false)}
                              </span>
                              <span className="text-[7px] text-amber-950/80 font-medium leading-none hidden sm:block">
                                {day.pendKg >= 10000 ? 'Ton' : 'KG'}
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div
                          className="w-full max-w-[42px] sm:max-w-[50px] h-1.5 bg-slate-200 rounded-full"
                          title="No Volume Recorded"
                        />
                      )}
                    </div>

                    <span className="absolute -bottom-5 text-[9.5px] font-bold text-slate-700 whitespace-nowrap">
                      {formattedDayLabel}
                    </span>
                  </div>
                );
              })
            )}
          </div>
          {/* Section footer with Peak Daily Total and Days Activity has been removed as requested */}
        </div>

        {/* Right Side: Top 6 Development Delivery (Pie Chart with Indexlabels) */}
        <div className="lg:col-span-5 flex flex-col">
          <SvgPieChart
            title="Top 6 Development Delivery"
            icon={<PieChartIcon className="w-4 h-4 text-[#04342c]" />}
            totalKg={top6Developments.totalPeriodDeliveredKg}
            totalLabel="Total"
            centerTopText="TOP 6"
            items={top6Developments.items}
            selectedId={developmentFilter}
            onSelectId={setDevelopmentFilter}
            onClearFilter={() => setDevelopmentFilter('')}
            clearButtonLabel="Clear Dev Filter"
            emptyMessage="No delivered items in filtered date range."
          />
        </div>
      </div>
    );

    // 3. Render Top 6 Customer & Short Ranking Pie Charts
    const renderCustomerShortPie = () => (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Left 50% Column: Top 6 Customer */}
        <SvgPieChart
          title="Top 6 Customer Delivery"
          icon={<Users className="w-4 h-4 text-[#04342c]" />}
          totalKg={top6Customers.totalDeliveredKg}
          totalLabel="Delivered"
          centerTopText="TOP 6"
          items={top6Customers.items}
          selectedId={customerFilter}
          onSelectId={setCustomerFilter}
          onClearFilter={() => setCustomerFilter('')}
          clearButtonLabel="Clear Customer Filter"
          emptyMessage="No customer deliveries recorded for this period."
        />

        {/* Right 50% Column: Ranking whose development is short qty */}
        <SvgPieChart
          title="Development Short Qty Ranking"
          icon={<AlertTriangle className="w-4 h-4 text-amber-700" />}
          totalKg={shortQtyDevelopments.totalShortKg}
          totalLabel="Short Qty"
          centerTopText="SHORT"
          items={shortQtyDevelopments.items}
          selectedId={developmentFilter}
          onSelectId={setDevelopmentFilter}
          onClearFilter={() => setDevelopmentFilter('')}
          clearButtonLabel="Clear Dev Filter"
          emptyMessage="No shortage or pending lot quantities recorded for this period."
        />
      </div>
    );

    // 4. Render Monthly Delivery Calendar
    const renderCalendar = () => (
      <DeliveryCalendar
        records={records}
        selectedDate={selectedCalendarDate}
        onSelectDate={setSelectedCalendarDate}
      />
    );

    // 5. Render Public Fabric Delivery Database Table
    const renderDataTable = () => (
      <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden">
        {/* Table Header with Search and Status Filter */}
        <div className="p-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-[#04342c]" />
              <h3 className="text-xs font-bold text-[#04342c] uppercase tracking-wider">
                Fabric Delivery Database
              </h3>
            </div>
            {customerFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-900 text-[11px] font-bold border border-blue-300 shadow-2xs">
                <span>Customer: {customerFilter}</span>
                <button
                  type="button"
                  onClick={() => setCustomerFilter('')}
                  className="hover:text-red-700 ml-0.5 cursor-pointer font-black"
                  title="Clear Customer Filter"
                >
                  ✕
                </button>
              </span>
            )}
            {developmentFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-[#04342c] text-[11px] font-bold border border-emerald-300 shadow-2xs">
                <span>Dev: {developmentFilter}</span>
                <button
                  type="button"
                  onClick={() => setDevelopmentFilter('')}
                  className="hover:text-red-700 ml-0.5 cursor-pointer font-black"
                  title="Clear Development Filter"
                >
                  ✕
                </button>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Status Filter Tabs */}
            <div className="flex items-center bg-white border border-slate-200 rounded-md p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setTableStatusTab('All')}
                className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                  tableStatusTab === 'All'
                    ? 'bg-[#04342c] text-white font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({filteredRecords.length})
              </button>
              <button
                type="button"
                onClick={() => setTableStatusTab('Delivered')}
                className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                  tableStatusTab === 'Delivered'
                    ? 'bg-emerald-700 text-white font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Delivered ({summary.deliveredBatches})
              </button>
              <button
                type="button"
                onClick={() => setTableStatusTab('Pending')}
                className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                  tableStatusTab === 'Pending'
                    ? 'bg-amber-600 text-white font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Pending ({summary.pendingBatches})
              </button>
            </div>

            {/* Public Search Input: Batch, Dev, Color */}
            <div className="relative min-w-[200px] sm:min-w-[260px] w-full sm:w-auto">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search batch, dev, customer, color..."
                className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-md text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-[#04342c] focus:border-[#04342c]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Public Database Table: Development, Customer, Color, Batch, Roll, KG, Status */}
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs min-w-[680px]">
            <thead className="bg-[#04342c] text-white uppercase text-[10.5px] font-semibold tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Development</th>
                <th className="py-2.5 px-3">Customer</th>
                <th className="py-2.5 px-3">Color</th>
                <th className="py-2.5 px-3">Batch</th>
                <th className="py-2.5 px-3 text-center">Roll</th>
                <th className="py-2.5 px-3 text-right">KG</th>
                <th className="py-2.5 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {publicDatabaseRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 font-medium text-xs">
                    No fabric records match your search or filter.
                  </td>
                </tr>
              ) : (
                publicDatabaseRecords.map(rec => {
                  const isDelivered = rec.status === 'Delivered';
                  const isHold = rec.priority === 'Hold';
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50 transition-colors">
                      {/* 1. Development */}
                      <td className="py-2.5 px-3 font-bold text-slate-900 font-mono tracking-tight whitespace-nowrap">
                        {rec.development}
                      </td>

                      {/* 2. Customer */}
                      <td className="py-2.5 px-3 font-medium text-slate-800">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span
                            className="truncate max-w-[160px] sm:max-w-[200px]"
                            title={rec.customerName || 'General Buyer'}
                          >
                            {rec.customerName || 'General Buyer'}
                          </span>
                        </div>
                      </td>

                      {/* 3. Color */}
                      <td className="py-2.5 px-3 text-slate-700">
                        {rec.color ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 text-[11px] font-medium">
                            <span className="w-2 h-2 rounded-full bg-slate-500/70"></span>
                            {rec.color}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* 4. Batch */}
                      <td className="py-2.5 px-3 font-mono font-bold text-[#04342c] whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>{rec.batch}</span>
                          <span
                            className={`text-[9px] font-semibold px-1.5 py-0.2 rounded border ${
                              rec.orderType === 'Bulk'
                                ? 'bg-slate-100 text-slate-700 border-slate-200'
                                : 'bg-purple-50 text-purple-700 border-purple-200'
                            }`}
                          >
                            {rec.orderType}
                          </span>
                        </div>
                      </td>

                      {/* 5. Roll */}
                      <td className="py-2.5 px-3 text-center font-medium text-slate-700 font-mono">
                        {rec.rollQty}
                      </td>

                      {/* 6. KG */}
                      <td className="py-2.5 px-3 text-right font-black text-slate-900 font-mono whitespace-nowrap">
                        {formatWeightDisplay(rec.kgQty, true)}
                      </td>

                      {/* 7. Status */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {isDelivered ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span>Delivered</span>
                          </span>
                        ) : isHold ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-orange-100 text-orange-800 border border-orange-200">
                            <PauseCircle className="w-3 h-3 text-orange-600 shrink-0" />
                            <span>Hold</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                            <span>Pending</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    );

  const DEFAULT_ORDER: DashboardSectionId[] = [
    'summary_cards',
    'trend_chart',
    'customer_short_pie',
    'calendar',
    'data_table',
  ];

  const activeOrder =
    sectionOrder && sectionOrder.length === DEFAULT_ORDER.length ? sectionOrder : DEFAULT_ORDER;

  return (
    <div className="space-y-4">
      {/* Date Filtering Row with Interactive Linked Search Bar (Dev, Batch, Customer) */}
      <DateFilterRow
        filter={dateFilter}
        onFilterChange={onFilterChange}
        developmentFilter={developmentFilter}
        onDevelopmentFilterChange={setDevelopmentFilter}
        availableDevelopments={availableDevelopments}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        records={records}
      />

      {/* Dynamic Customizable Section Layout */}
      {activeOrder.map(sectionId => {
        switch (sectionId) {
          case 'summary_cards':
            return <React.Fragment key="summary_cards">{renderSummaryCards()}</React.Fragment>;
          case 'trend_chart':
            return <React.Fragment key="trend_chart">{renderTrendChart()}</React.Fragment>;
          case 'customer_short_pie':
            return <React.Fragment key="customer_short_pie">{renderCustomerShortPie()}</React.Fragment>;
          case 'calendar':
            return <React.Fragment key="calendar">{renderCalendar()}</React.Fragment>;
          case 'data_table':
            return <React.Fragment key="data_table">{renderDataTable()}</React.Fragment>;
          default:
            return null;
        }
      })}
    </div>
  );
};
