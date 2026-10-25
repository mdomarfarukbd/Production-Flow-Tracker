import React, { useState, useMemo } from 'react';
import { DeliveryRecord, ManpowerActivity, WorkTimeOption } from '../types';
import { formatDateToYYYYMMDD, extractRecordDate } from '../services/storage';
import { formatWeightDisplay } from './PublicDashboard';
import {
  Users,
  Calendar,
  Clock,
  TrendingUp,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  Download,
  Search,
  BarChart3,
  Layers,
  Check,
  X,
  Building2,
  Truck,
  FileSpreadsheet,
  AlertCircle,
  Sparkles,
} from 'lucide-react';

interface ManpowerManagementProps {
  records: DeliveryRecord[];
  manpowerActivities: ManpowerActivity[];
  onUpdateManpowerActivities: (activities: ManpowerActivity[]) => void;
  currentUser?: string;
}

type ViewMode = 'analytics' | 'logs';
type TimeframeMode = 'week' | 'month' | 'all';

export const ManpowerManagement: React.FC<ManpowerManagementProps> = ({
  records,
  manpowerActivities,
  onUpdateManpowerActivities,
  currentUser = 'Admin',
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('analytics');
  const [timeframe, setTimeframe] = useState<TimeframeMode>('week');
  const [searchQuery, setSearchQuery] = useState('');

  // Form State for Entry / Editing
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [logToDelete, setLogToDelete] = useState<{ id: string; date: string } | null>(null);

  const todayStr = useMemo(() => formatDateToYYYYMMDD(new Date()), []);

  // Strict requested entry fields:
  // 1. Date
  // 2. Permanent manpower qty
  // 3. Minimum required external manpower qty
  // 4. Actual external manpower qty
  // ** NO Worker/Crew/Contractor Name field **
  // 5. Work time (8am to 5pm regular, after that to 8 pm OT)
  // 6. Custom uses and note
  const [formDate, setFormDate] = useState(todayStr);
  const [formPermanentQty, setFormPermanentQty] = useState<number>(4);
  const [formMinRequiredExternalQty, setFormMinRequiredExternalQty] = useState<number>(3);
  const [formActualExternalQty, setFormActualExternalQty] = useState<number>(3);
  const [formWorkTime, setFormWorkTime] = useState<WorkTimeOption>('8am-5pm (Regular)');
  const [formCustomWorkTime, setFormCustomWorkTime] = useState<string>('');
  const [formCustomUsesAndNote, setFormCustomUsesAndNote] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  // Timeframe Date Bounds
  const { startDate, endDate, dateList } = useMemo(() => {
    const today = new Date();
    const dates: string[] = [];

    if (timeframe === 'week') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        dates.push(formatDateToYYYYMMDD(d));
      }
      return { startDate: dates[0], endDate: dates[dates.length - 1], dateList: dates };
    }

    if (timeframe === 'month') {
      const year = today.getFullYear();
      const month = today.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const startStr = formatDateToYYYYMMDD(firstDay);
      const endStr = formatDateToYYYYMMDD(lastDay);

      const cur = new Date(firstDay);
      while (cur <= lastDay) {
        dates.push(formatDateToYYYYMMDD(cur));
        cur.setDate(cur.getDate() + 1);
      }
      return { startDate: startStr, endDate: endStr, dateList: dates };
    }

    // All records
    return { startDate: '', endDate: '', dateList: [] };
  }, [timeframe]);

  // Aggregate delivery records strictly DAY-WISE
  const dailyDeliveryStats = useMemo(() => {
    const map: Record<string, { deliveredKg: number; deliveredBatches: number; deliveredRolls: number }> = {};

    records.forEach(r => {
      if (r.status === 'Delivered') {
        const delDate = extractRecordDate(r.deliveredAt || r.receivedAt || r.createdAt);
        if (delDate) {
          if (!map[delDate]) {
            map[delDate] = { deliveredKg: 0, deliveredBatches: 0, deliveredRolls: 0 };
          }
          map[delDate].deliveredKg += r.kgQty || 0;
          map[delDate].deliveredBatches += 1;
          map[delDate].deliveredRolls += r.rollQty || 0;
        }
      }
    });

    return map;
  }, [records]);

  // Map day-wise manpower logs indexed by date
  const manpowerByDate = useMemo(() => {
    const map: Record<string, ManpowerActivity> = {};
    manpowerActivities.forEach(a => {
      // If multiple exist for same date, latest one is mapped
      if (!map[a.date] || (a.createdAt && (!map[a.date].createdAt || a.createdAt > map[a.date].createdAt))) {
        map[a.date] = a;
      }
    });
    return map;
  }, [manpowerActivities]);

  // Day-wise combined table linking that day's manpower with that day's delivered quantity
  const dayWiseData = useMemo(() => {
    let targetDates: string[] = [];

    if (timeframe === 'week' || timeframe === 'month') {
      targetDates = [...dateList];
    } else {
      const allDates = new Set<string>();
      manpowerActivities.forEach(a => allDates.add(a.date));
      Object.keys(dailyDeliveryStats).forEach(d => allDates.add(d));
      targetDates = Array.from(allDates).sort().reverse().slice(0, 45);
    }

    return targetDates.map(date => {
      const delivery = dailyDeliveryStats[date] || { deliveredKg: 0, deliveredBatches: 0, deliveredRolls: 0 };
      const manpower = manpowerByDate[date];

      const permQty = manpower?.permanentManpowerQty ?? (manpower?.workerType === 'permanent' ? manpower.workerCount || 4 : 0);
      const minExtQty = manpower?.minRequiredExternalQty ?? 3;
      const actualExtQty = manpower?.actualExternalQty ?? (manpower?.workerType === 'external_loader' ? manpower.workerCount || 3 : 0);
      const totalManpower = permQty + actualExtQty;

      const extVariance = actualExtQty - minExtQty; // 0 = matched, > 0 extra, < 0 shortage
      const productivityKgPerWorker =
        totalManpower > 0 && delivery.deliveredKg > 0 ? Math.round(delivery.deliveredKg / totalManpower) : 0;

      return {
        date,
        hasLog: Boolean(manpower),
        logId: manpower?.id,
        manpower,
        deliveredKg: delivery.deliveredKg,
        deliveredBatches: delivery.deliveredBatches,
        deliveredRolls: delivery.deliveredRolls,
        permanentQty: permQty,
        minRequiredExternalQty: minExtQty,
        actualExternalQty: actualExtQty,
        totalManpower,
        extVariance,
        workTime: manpower?.workTime || '8am-5pm (Regular)',
        customUsesAndNote: manpower?.customUsesAndNote || manpower?.remarks || '',
        productivityKgPerWorker,
      };
    });
  }, [dateList, timeframe, dailyDeliveryStats, manpowerByDate, manpowerActivities]);

  // Overall totals for the active timeframe
  const overallTotals = useMemo(() => {
    let totalDeliveredKg = 0;
    let totalDeliveredBatches = 0;
    let totalPermDeployed = 0;
    let totalMinExtRequired = 0;
    let totalActualExtDeployed = 0;
    let daysWithLogs = 0;
    let otDaysCount = 0;

    dayWiseData.forEach(row => {
      totalDeliveredKg += row.deliveredKg;
      totalDeliveredBatches += row.deliveredBatches;
      if (row.hasLog) {
        daysWithLogs += 1;
        totalPermDeployed += row.permanentQty;
        totalMinExtRequired += row.minRequiredExternalQty;
        totalActualExtDeployed += row.actualExternalQty;
        if (row.workTime.includes('OT')) {
          otDaysCount += 1;
        }
      }
    });

    const totalManpowerDeployed = totalPermDeployed + totalActualExtDeployed;
    const avgProductivity =
      totalManpowerDeployed > 0 && totalDeliveredKg > 0 ? Math.round(totalDeliveredKg / totalManpowerDeployed) : 0;
    const extNetVariance = totalActualExtDeployed - totalMinExtRequired;

    return {
      totalDeliveredKg,
      totalDeliveredBatches,
      daysWithLogs,
      totalPermDeployed,
      totalMinExtRequired,
      totalActualExtDeployed,
      totalManpowerDeployed,
      avgProductivity,
      extNetVariance,
      otDaysCount,
    };
  }, [dayWiseData]);

  // Filtered List of existing activity logs for Table View & Admin Management
  const filteredLogs = useMemo(() => {
    return manpowerActivities
      .filter(a => {
        if (timeframe === 'week' || timeframe === 'month') {
          if (startDate && a.date < startDate) return false;
          if (endDate && a.date > endDate) return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchDate = a.date.includes(q);
          const matchNote = (a.customUsesAndNote || a.remarks || '').toLowerCase().includes(q);
          const matchTime = (a.workTime || '').toLowerCase().includes(q);
          if (!matchDate && !matchNote && !matchTime) return false;
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [manpowerActivities, timeframe, startDate, endDate, searchQuery]);

  // Open Form to Add New Day Log (defaults to today or selected date)
  const handleOpenAddForm = (targetDate?: string) => {
    const chosenDate = targetDate || todayStr;
    const existing = manpowerByDate[chosenDate];

    if (existing) {
      // If a log already exists for this date, load it for editing
      handleOpenEditForm(existing);
      return;
    }

    setEditingId(null);
    setFormDate(chosenDate);
    setFormPermanentQty(4);
    setFormMinRequiredExternalQty(3);
    setFormActualExternalQty(3);
    setFormWorkTime('8am-5pm (Regular)');
    setFormCustomWorkTime('');
    setFormCustomUsesAndNote('');
    setFormError(null);
    setIsFormOpen(true);
  };

  // Open Form to Edit an Existing Day Log
  const handleOpenEditForm = (log: ManpowerActivity) => {
    setEditingId(log.id);
    setFormDate(log.date);
    setFormPermanentQty(log.permanentManpowerQty ?? (log.workerType === 'permanent' ? log.workerCount || 4 : 4));
    setFormMinRequiredExternalQty(log.minRequiredExternalQty ?? 3);
    setFormActualExternalQty(log.actualExternalQty ?? (log.workerType === 'external_loader' ? log.workerCount || 3 : 3));
    setFormWorkTime(log.workTime || '8am-5pm (Regular)');
    setFormCustomWorkTime(log.customWorkTime || '');
    setFormCustomUsesAndNote(log.customUsesAndNote || log.remarks || '');
    setFormError(null);
    setIsFormOpen(true);
  };

  // Save Day Log (Create or Update)
  const handleSaveDayLog = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formDate) {
      setFormError('Please select a date.');
      return;
    }
    if (formPermanentQty < 0 || formMinRequiredExternalQty < 0 || formActualExternalQty < 0) {
      setFormError('Manpower counts cannot be negative.');
      return;
    }

    const newLog: ManpowerActivity = {
      id: editingId || `mp-day-${formDate}-${Date.now().toString(36).substring(2, 6)}`,
      date: formDate,
      permanentManpowerQty: Number(formPermanentQty) || 0,
      minRequiredExternalQty: Number(formMinRequiredExternalQty) || 0,
      actualExternalQty: Number(formActualExternalQty) || 0,
      workTime: formWorkTime,
      customWorkTime: formWorkTime === 'Custom' ? formCustomWorkTime : undefined,
      customUsesAndNote: formCustomUsesAndNote.trim() || undefined,
      loggedBy: currentUser,
      createdAt: editingId
        ? manpowerActivities.find(a => a.id === editingId)?.createdAt || new Date().toISOString()
        : new Date().toISOString(),
    };

    // Replace if same date or same id exists
    const withoutExisting = manpowerActivities.filter(a => a.id !== newLog.id && a.date !== formDate);
    const updated = [newLog, ...withoutExisting].sort((a, b) => b.date.localeCompare(a.date));

    onUpdateManpowerActivities(updated);
    setIsFormOpen(false);
    setEditingId(null);
  };

  // Admin delete existing log - uses reliable in-app confirmation modal (works safely inside iframe sandbox)
  const handleDeleteLog = (id: string, date: string) => {
    setLogToDelete({ id, date });
  };

  const handleConfirmDeleteLog = () => {
    if (!logToDelete) return;
    const updated = manpowerActivities.filter(a => a.id !== logToDelete.id);
    onUpdateManpowerActivities(updated);
    setLogToDelete(null);
  };

  // Max day delivered KG for scaling chart bars
  const maxDeliveredKg = useMemo(() => {
    let max = 1500;
    dayWiseData.forEach(r => {
      if (r.deliveredKg > max) max = r.deliveredKg;
    });
    return max * 1.15;
  }, [dayWiseData]);

  // Export day-wise manpower & delivery summary to CSV
  const handleExportCsv = () => {
    const headers = [
      'Date',
      'Permanent Manpower Qty',
      'Min Required External Qty',
      'Actual External Qty',
      'External Variance (Actual - Min)',
      'Total Manpower',
      'Delivered KG',
      'Delivered Batches',
      'Productivity (KG / Worker)',
      'Work Time',
      'Custom Uses and Note',
      'Logged By',
    ];

    const rows = dayWiseData
      .filter(r => r.hasLog || r.deliveredKg > 0)
      .map(r => [
        r.date,
        r.permanentQty,
        r.minRequiredExternalQty,
        r.actualExternalQty,
        r.extVariance >= 0 ? `+${r.extVariance}` : r.extVariance,
        r.totalManpower,
        r.deliveredKg,
        r.deliveredBatches,
        r.productivityKgPerWorker,
        `"${r.workTime}"`,
        `"${(r.customUsesAndNote || '').replace(/"/g, '""')}"`,
        r.manpower?.loggedBy || 'Admin',
      ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `TPL_DayWise_Manpower_Delivery_${timeframe}_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Today's delivery summary for live entry assist
  const formDateDelivery = dailyDeliveryStats[formDate] || { deliveredKg: 0, deliveredBatches: 0, deliveredRolls: 0 };

  return (
    <div className="space-y-6">
      {/* Top Banner: Day-Wise Manpower & Delivery Link */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#04342c] text-white p-4.5 rounded-xl shadow-md border border-emerald-950">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-emerald-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm tracking-wide text-white">Day-Wise Manpower & Delivery Control</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-400/20 text-emerald-200 border border-emerald-400/30">
                Day-by-Day Matching
              </span>
            </div>
            <p className="text-xs text-emerald-100/80">
              On this date: these manpower deployed → that quantity of greige fabric delivered
            </p>
          </div>
        </div>

        {/* View Switcher & Add Log Button */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg bg-emerald-950/60 p-0.5 border border-emerald-800 text-xs">
            <button
              onClick={() => setViewMode('analytics')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'analytics' ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-200 hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Day-Wise Compare</span>
            </button>
            <button
              onClick={() => setViewMode('logs')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'logs' ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-200 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Manage Logs ({manpowerActivities.length})</span>
            </button>
          </div>

          <button
            onClick={() => handleOpenAddForm()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-[#04342c] font-black text-xs shadow-xs transition-colors cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            <span>+ Daily Entry</span>
          </button>
        </div>
      </div>

      {/* Timeframe Bar & Fast Date Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-bold text-slate-500 uppercase tracking-wider text-[11px]">View Period:</span>
          <button
            onClick={() => setTimeframe('week')}
            className={`px-3 py-1.5 rounded-md font-bold transition-colors cursor-pointer ${
              timeframe === 'week' ? 'bg-[#04342c] text-white shadow-2xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Last 7 Days (Weekly)
          </button>
          <button
            onClick={() => setTimeframe('month')}
            className={`px-3 py-1.5 rounded-md font-bold transition-colors cursor-pointer ${
              timeframe === 'month' ? 'bg-[#04342c] text-white shadow-2xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Full Month
          </button>
          <button
            onClick={() => setTimeframe('all')}
            className={`px-3 py-1.5 rounded-md font-bold transition-colors cursor-pointer ${
              timeframe === 'all' ? 'bg-[#04342c] text-white shadow-2xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Historical Days
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-2xs cursor-pointer transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export Day-Wise CSV</span>
          </button>
        </div>
      </div>

      {/* 4 Summary Indicator Blocks: Delivered Qty vs Permanent vs External vs Efficiency */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        {/* Metric 1: Total Delivered Fabric */}
        <div className="p-3.5 rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white shadow-2xs">
          <div className="flex items-center justify-between text-emerald-900 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Delivered Fabric</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-lg font-black text-[#04342c]">
            {formatWeightDisplay(overallTotals.totalDeliveredKg)}
          </div>
          <div className="text-[11px] text-emerald-700 font-medium mt-0.5">
            {overallTotals.totalDeliveredBatches} batches dispatched
          </div>
        </div>

        {/* Metric 2: Permanent Manpower Total Deployed */}
        <div className="p-3.5 rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50/80 to-white shadow-2xs">
          <div className="flex items-center justify-between text-teal-900 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-teal-600" />
              <span>Permanent Staff</span>
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-100 text-teal-800">
              Fixed Team
            </span>
          </div>
          <div className="text-lg font-black text-teal-950">
            {overallTotals.totalPermDeployed} staff days
          </div>
          <div className="text-[11px] text-teal-700 font-medium mt-0.5">
            Avg {overallTotals.daysWithLogs > 0 ? (overallTotals.totalPermDeployed / overallTotals.daysWithLogs).toFixed(1) : 0} / day
          </div>
        </div>

        {/* Metric 3: External Loaders (Actual vs Required) */}
        <div className="p-3.5 rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50/80 to-white shadow-2xs">
          <div className="flex items-center justify-between text-amber-900 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1">
              <Truck className="w-3.5 h-3.5 text-amber-600" />
              <span>External Loaders</span>
            </span>
            <span
              className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                overallTotals.extNetVariance >= 0 ? 'bg-amber-100 text-amber-900' : 'bg-red-100 text-red-800'
              }`}
            >
              Req: {overallTotals.totalMinExtRequired}
            </span>
          </div>
          <div className="text-lg font-black text-amber-950">
            {overallTotals.totalActualExtDeployed} loaders
          </div>
          <div className="text-[11px] text-amber-700 font-medium mt-0.5">
            {overallTotals.extNetVariance >= 0
              ? `+${overallTotals.extNetVariance} above min required`
              : `${overallTotals.extNetVariance} loader shortage`}
          </div>
        </div>

        {/* Metric 4: Efficiency (Delivered KG / Manpower) */}
        <div className="p-3.5 rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50/80 to-white shadow-2xs">
          <div className="flex items-center justify-between text-blue-900 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Productivity Index</span>
            <TrendingUp className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-lg font-black text-blue-950">
            {overallTotals.avgProductivity.toLocaleString()} KG
          </div>
          <div className="text-[11px] text-blue-700 font-medium mt-0.5">
            per total deployed worker ({overallTotals.otDaysCount} OT days)
          </div>
        </div>
      </div>

      {/* VIEW 1: DAY-WISE VISUALIZATION & COMPARISON */}
      {viewMode === 'analytics' && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-emerald-600" />
                <span>
                  {timeframe === 'week' ? 'Weekly' : timeframe === 'month' ? 'Monthly' : 'Historical'}{' '}
                  Day-Wise Manpower Deployment & Delivered Fabric
                </span>
              </h4>
              <p className="text-[11px] text-slate-500">
                Direct matching: on each date, permanent & external manpower deployed vs delivered greige fabric KG
              </p>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-600 shrink-0">
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-xs bg-[#04342c]"></span>
                <span>Delivered KG</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-xs bg-teal-600"></span>
                <span>Permanent Staff</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-xs bg-amber-500"></span>
                <span>Actual External Loaders</span>
              </div>
            </div>
          </div>

          {/* Day-by-Day Comparative Row List */}
          <div className="space-y-3 pt-2">
            {dayWiseData.map(row => {
              const barWidthPct = maxDeliveredKg > 0 ? (row.deliveredKg / maxDeliveredKg) * 100 : 0;
              const isToday = row.date === todayStr;

              return (
                <div
                  key={row.date}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isToday
                      ? 'border-emerald-300 bg-emerald-50/40 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                  }`}
                >
                  {/* Row Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-bold mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-900 font-extrabold text-sm">{row.date}</span>
                      {isToday && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] uppercase font-black">
                          Today
                        </span>
                      )}
                      <span className="text-slate-400">|</span>
                      <span className="text-slate-600 font-medium">
                        {row.deliveredBatches > 0
                          ? `${row.deliveredBatches} batches (${Math.round(row.deliveredKg).toLocaleString()} KG)`
                          : 'No delivery dispatches'}
                      </span>
                    </div>

                    {/* Manpower badges & actions */}
                    <div className="flex items-center gap-2">
                      {row.hasLog ? (
                        <>
                          {/* Work Time Badge */}
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              row.workTime.includes('OT')
                                ? 'bg-purple-100 text-purple-900 border border-purple-200'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            <Clock className="w-3 h-3 inline mr-1" />
                            {row.workTime}
                          </span>

                          {/* Permanent Manpower Badge */}
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
                            Permanent: {row.permanentQty}
                          </span>

                          {/* External Manpower Badge */}
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              row.extVariance < 0
                                ? 'bg-red-50 text-red-800 border-red-200'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}
                            title={`Min Required: ${row.minRequiredExternalQty}, Actual: ${row.actualExternalQty}`}
                          >
                            Ext: {row.actualExternalQty} (Req: {row.minRequiredExternalQty})
                            {row.extVariance > 0 && ` [+${row.extVariance}]`}
                            {row.extVariance < 0 && ` [Short ${row.extVariance}]`}
                          </span>

                          {/* Productivity */}
                          {row.deliveredKg > 0 && row.productivityKgPerWorker > 0 && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-900">
                              {row.productivityKgPerWorker} KG/person
                            </span>
                          )}

                          {/* Edit / Delete actions for this day */}
                          <button
                            onClick={() => handleOpenEditForm(row.manpower!)}
                            className="p-1 text-slate-500 hover:text-slate-800 hover:bg-white rounded cursor-pointer transition-colors"
                            title="Edit this day's manpower log"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteLog(row.logId!, row.date)}
                            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded cursor-pointer transition-colors"
                            title="Delete this day's manpower log"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleOpenAddForm(row.date)}
                          className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] cursor-pointer transition-colors flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>+ Log Manpower</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Visual Bar: Delivered Quantity (KG) */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="w-20 text-slate-500 font-bold text-right shrink-0">Delivered</span>
                      <div className="flex-1 h-4 bg-slate-200/80 rounded-full overflow-hidden flex shadow-inner">
                        <div
                          className="h-full bg-[#04342c] transition-all duration-300 rounded-full flex items-center px-2 text-[9px] text-white font-bold"
                          style={{ width: `${Math.max(barWidthPct, row.deliveredKg > 0 ? 4 : 0)}%` }}
                        >
                          {row.deliveredKg > 400 && `${Math.round(row.deliveredKg).toLocaleString()} KG`}
                        </div>
                      </div>
                      <span className="w-20 text-[#04342c] font-black text-right shrink-0">
                        {Math.round(row.deliveredKg).toLocaleString()} KG
                      </span>
                    </div>

                    {/* Manpower Breakdown Bar (Permanent + External) */}
                    {row.hasLog && (
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="w-20 text-slate-500 font-bold text-right shrink-0">Manpower</span>
                        <div className="flex-1 h-3.5 bg-slate-200/80 rounded-full overflow-hidden flex">
                          {/* Permanent Staff portion */}
                          {row.permanentQty > 0 && (
                            <div
                              className="h-full bg-teal-600 flex items-center justify-center text-[9px] text-white font-bold px-1"
                              style={{ width: `${row.totalManpower > 0 ? (row.permanentQty / row.totalManpower) * 100 : 50}%` }}
                            >
                              Perm {row.permanentQty}
                            </div>
                          )}
                          {/* External Loaders portion */}
                          {row.actualExternalQty > 0 && (
                            <div
                              className="h-full bg-amber-500 flex items-center justify-center text-[9px] text-white font-bold px-1"
                              style={{ width: `${row.totalManpower > 0 ? (row.actualExternalQty / row.totalManpower) * 100 : 50}%` }}
                            >
                              Ext {row.actualExternalQty}
                            </div>
                          )}
                        </div>
                        <span className="w-20 text-slate-700 font-bold text-right shrink-0">
                          {row.totalManpower} Workers
                        </span>
                      </div>
                    )}

                    {/* Custom Uses & Note if present */}
                    {row.customUsesAndNote && (
                      <div className="text-[11px] text-slate-600 bg-white/80 rounded px-2.5 py-1 border border-slate-200 mt-1">
                        <span className="font-bold text-slate-700">Note: </span>
                        {row.customUsesAndNote}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 2: MANAGE LOGS TABLE (ADMIN ACCESS, EDIT, DELETE) */}
      {viewMode === 'logs' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by date, work time, notes..."
                className="w-full pl-9 pr-8 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              onClick={() => handleOpenAddForm()}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#04342c] hover:bg-[#032620] text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>+ Add Day Log</span>
            </button>
          </div>

          {/* Admin Table with Edit and Delete Access */}
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[11px] uppercase tracking-wider">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3 text-center">Permanent Qty</th>
                  <th className="py-2.5 px-3 text-center">Min Req External</th>
                  <th className="py-2.5 px-3 text-center">Actual External</th>
                  <th className="py-2.5 px-3 text-center">Variance</th>
                  <th className="py-2.5 px-3 text-right">Day Delivered KG</th>
                  <th className="py-2.5 px-3">Work Time</th>
                  <th className="py-2.5 px-3">Custom Uses & Note</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      No day-wise manpower logs match your filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map(log => {
                    const perm = log.permanentManpowerQty ?? (log.workerType === 'permanent' ? log.workerCount || 4 : 4);
                    const minExt = log.minRequiredExternalQty ?? 3;
                    const actExt = log.actualExternalQty ?? (log.workerType === 'external_loader' ? log.workerCount || 3 : 3);
                    const variance = actExt - minExt;
                    const del = dailyDeliveryStats[log.date] || { deliveredKg: 0, deliveredBatches: 0, deliveredRolls: 0 };

                    return (
                      <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">{log.date}</td>
                        <td className="py-2.5 px-3 text-center font-bold text-teal-800">
                          <span className="px-2 py-0.5 rounded bg-teal-50 border border-teal-200">
                            {perm} Staff
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-600">{minExt}</td>
                        <td className="py-2.5 px-3 text-center font-bold text-amber-900">
                          <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200">
                            {actExt} Loaders
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          {variance === 0 ? (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                              Matched
                            </span>
                          ) : variance > 0 ? (
                            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                              +{variance} Extra
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded">
                              {variance} Short
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-black text-[#04342c] whitespace-nowrap">
                          {del.deliveredKg > 0 ? `${Math.round(del.deliveredKg).toLocaleString()} KG` : '-'}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              log.workTime?.includes('OT')
                                ? 'bg-purple-100 text-purple-900 border border-purple-200'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {log.workTime || '8am-5pm (Regular)'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 text-[11px] max-w-xs truncate" title={log.customUsesAndNote || log.remarks}>
                          {log.customUsesAndNote || log.remarks || '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenEditForm(log)}
                              className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded cursor-pointer"
                              title="Edit Log"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteLog(log.id, log.date)}
                              className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded cursor-pointer"
                              title="Delete Log"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: STRICT REQUESTED ENTRY FORMAT */}
      {isFormOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-2xs p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-[#04342c] text-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-300" />
                <h3 className="font-bold text-sm tracking-wide">
                  {editingId ? 'Edit Day-Wise Manpower Log' : 'Daily Manpower & Delivery Entry'}
                </h3>
              </div>
              <button onClick={() => setIsFormOpen(false)} className="text-white/70 hover:text-white p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDayLog} className="p-5 space-y-4 text-xs">
              {formError && (
                <div className="p-2.5 rounded bg-red-50 border border-red-200 text-red-800 font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Day Delivered Info Card (Live Assist) */}
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wide">
                    Fabric Dispatched On Selected Date:
                  </span>
                  <div className="text-sm font-black text-[#04342c]">
                    {formDateDelivery.deliveredKg > 0
                      ? `${Math.round(formDateDelivery.deliveredKg).toLocaleString()} KG (${formDateDelivery.deliveredBatches} batches)`
                      : '0 KG (No delivery records recorded for this day)'}
                  </div>
                </div>
                <div className="text-right text-[10px] text-emerald-700">
                  Total Manpower: <span className="font-black text-xs text-emerald-950">{formPermanentQty + formActualExternalQty}</span>
                </div>
              </div>

              {/* 1. Date */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={formDate}
                  onChange={e => setFormDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* 2. Permanent Manpower Qty */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Permanent Manpower Qty <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={formPermanentQty}
                    onChange={e => setFormPermanentQty(parseInt(e.target.value, 10) || 0)}
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold text-teal-900 bg-teal-50/30 focus:ring-1 focus:ring-emerald-500"
                  />
                  <span className="absolute right-3 top-2 text-[11px] text-teal-700 font-semibold">Employees</span>
                </div>
              </div>

              {/* 3 & 4. Minimum Required External Manpower Qty & Actual External Manpower Qty */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Minimum Required External Manpower Qty <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={formMinRequiredExternalQty}
                    onChange={e => setFormMinRequiredExternalQty(parseInt(e.target.value, 10) || 0)}
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Actual External Manpower Qty <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={formActualExternalQty}
                    onChange={e => setFormActualExternalQty(parseInt(e.target.value, 10) || 0)}
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold text-amber-900 bg-amber-50/30 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* External Variance Indicator */}
              <div className="text-[11px] text-slate-500 flex items-center justify-between px-1">
                <span>External Deployment Status:</span>
                <span className="font-bold">
                  {formActualExternalQty >= formMinRequiredExternalQty ? (
                    <span className="text-emerald-700">
                      ✓ Requirement satisfied ({formActualExternalQty - formMinRequiredExternalQty === 0
                        ? 'Exact match'
                        : `+${formActualExternalQty - formMinRequiredExternalQty} Extra loaders deployed`})
                    </span>
                  ) : (
                    <span className="text-red-700">
                      ⚠️ Shortage of {formMinRequiredExternalQty - formActualExternalQty} external loaders
                    </span>
                  )}
                </span>
              </div>

              {/* 5. Work Time: 8am to 5pm regular, after that to 8 pm OT */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                  Work Time <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormWorkTime('8am-5pm (Regular)')}
                    className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                      formWorkTime === '8am-5pm (Regular)'
                        ? 'border-[#04342c] bg-emerald-50 text-[#04342c] ring-1 ring-[#04342c] font-bold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs">8:00 AM – 5:00 PM</div>
                    <div className="text-[10px] text-slate-500">Regular Shift</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormWorkTime('8am-8pm (Regular + OT to 8pm)')}
                    className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                      formWorkTime === '8am-8pm (Regular + OT to 8pm)'
                        ? 'border-purple-600 bg-purple-50 text-purple-900 ring-1 ring-purple-600 font-bold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs">8:00 AM – 8:00 PM</div>
                    <div className="text-[10px] text-purple-700 font-semibold">Regular + OT to 8:00 PM</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormWorkTime('5pm-8pm (OT only)')}
                    className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                      formWorkTime === '5pm-8pm (OT only)'
                        ? 'border-amber-600 bg-amber-50 text-amber-900 ring-1 ring-amber-600 font-bold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs">5:00 PM – 8:00 PM</div>
                    <div className="text-[10px] text-amber-700">OT Shift Only</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormWorkTime('Custom')}
                    className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                      formWorkTime === 'Custom'
                        ? 'border-blue-600 bg-blue-50 text-blue-900 ring-1 ring-blue-600 font-bold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs">Custom Hours</div>
                    <div className="text-[10px] text-slate-500">Special shift timing</div>
                  </button>
                </div>

                {formWorkTime === 'Custom' && (
                  <input
                    type="text"
                    value={formCustomWorkTime}
                    onChange={e => setFormCustomWorkTime(e.target.value)}
                    placeholder="Enter custom work timing (e.g. 7am to 10pm)..."
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs mt-2"
                  />
                )}
              </div>

              {/* 6. Custom uses and note */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Custom Uses and Note</label>
                <textarea
                  rows={2}
                  value={formCustomUsesAndNote}
                  onChange={e => setFormCustomUsesAndNote(e.target.value)}
                  placeholder="e.g. Greige fabric loading for major buyer shipment, container unloading, covered van dispatch notes..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-3.5 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#04342c] hover:bg-[#032620] text-white font-bold text-xs shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{editingId ? 'Update Day Log' : 'Save Day Log'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE CONFIRMATION (RELIABLE IN-APP MODAL FOR IFRAME SANDBOX) */}
      {logToDelete && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-slate-900/60 backdrop-blur-2xs p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden p-5 animate-in zoom-in-95">
            <div className="flex items-center gap-3 text-red-600 mb-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-900">Delete Manpower Log</h4>
                <p className="text-xs text-slate-500 font-medium">Date: {logToDelete.date}</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 mb-5 leading-relaxed">
              Are you sure you want to permanently delete this daily manpower record? This action will remove the log from both your browser and the database.
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setLogToDelete(null)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteLog}
                className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Log</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
