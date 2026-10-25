import React, { useState, useMemo, useEffect } from 'react';
import { DeliveryRecord, UserRole, DateFilter, AdminExportType, DeliveryPriority } from '../types';
import { DateFilterRow } from './DateFilterRow';
import { exportToExcel } from '../services/exportService';
import { formatDateToYYYYMMDD, extractRecordDate } from '../services/storage';
import {
  Plus,
  FileText,
  Download,
  Search,
  XCircle,
  Pencil,
  Trash2,
  CheckCircle,
  RotateCcw,
  User,
  ChevronDown,
  Clock,
  Filter,
  Camera,
  Image as ImageIcon,
  Lock,
  X,
  AlertTriangle,
  Building2,
  PauseCircle,
  Users,
  Ban,
} from 'lucide-react';

interface AuthenticatedWorkspaceProps {
  currentRole: UserRole;
  currentUser?: string;
  records: DeliveryRecord[];
  dateFilter: DateFilter;
  onFilterChange: (filter: DateFilter) => void;
  onOpenNewEntry: () => void;
  onEditRecord: (record: DeliveryRecord) => void;
  onOpenDailyReport: () => void;
  onRequestDelete: (record: DeliveryRecord) => void;
  onBulkDeleteRecords?: (recordIds: string[]) => void;
  onBulkDeliverRecords?: (recordIds: string[]) => void;
  onToggleStatus: (record: DeliveryRecord) => void;
  onSaveRecord?: (record: DeliveryRecord) => void;
  onBulkAddRecords?: (records: DeliveryRecord[]) => void;
  onOpenManpower?: () => void;
  onToggleCancelBatch?: (recordId: string, cancel: boolean, reason?: string) => void;
  onOpenAdminCancelled?: () => void;
}

export const AuthenticatedWorkspace: React.FC<AuthenticatedWorkspaceProps> = ({
  currentRole,
  currentUser = 'Admin',
  records,
  dateFilter,
  onFilterChange,
  onOpenNewEntry,
  onEditRecord,
  onOpenDailyReport,
  onRequestDelete,
  onBulkDeleteRecords,
  onBulkDeliverRecords,
  onToggleStatus,
  onSaveRecord,
  onBulkAddRecords,
  onOpenManpower,
  onToggleCancelBatch,
  onOpenAdminCancelled,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'All' | 'Regular' | 'High' | 'Hold'>('All');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [viewScope, setViewScope] = useState<'active_daily' | 'all'>('active_daily');
  const [statusToast, setStatusToast] = useState<{ batch: string; status: string } | null>(null);

  const isAdmin = currentRole === 'admin';
  const todayStr = useMemo(() => formatDateToYYYYMMDD(new Date()), []);

  // Editing page data defaults to Today (not last 7 days)
  useEffect(() => {
    const today = formatDateToYYYYMMDD(new Date());
    if (dateFilter.startDate !== today || dateFilter.endDate !== today || !dateFilter.isFiltered) {
      onFilterChange({
        startDate: today,
        endDate: today,
        isFiltered: true,
      });
    }
  }, []);

  // Multi-select bulk actions state (Admin only)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isConfirmingBulkDelete, setIsConfirmingBulkDelete] = useState(false);

  // Requisition Image Preview Modal state (Admin only access for best quality view & download)
  const [previewImageRecord, setPreviewImageRecord] = useState<DeliveryRecord | null>(null);

  // Quick workload counts for today & staging queue
  const workloadMetrics = useMemo(() => {
    let todayReceived = 0;
    let todayDelivered = 0;
    let previousPending = 0;
    let totalPending = 0;

    records.forEach(r => {
      const recDate = (r.receivedAt || r.createdAt || '').split(' ')[0].split('T')[0];
      const delDate = (r.deliveredAt || '').split(' ')[0].split('T')[0];

      if (recDate === todayStr) todayReceived++;
      if (r.status === 'Delivered' && delDate === todayStr) todayDelivered++;
      // Cancelled batches do not count in pending
      if (r.status === 'Pending' && !r.isCancelled) {
        totalPending++;
        if (recDate < todayStr) previousPending++;
      }
    });

    return { todayReceived, todayDelivered, previousPending, totalPending };
  }, [records, todayStr]);

  // Filter records based on:
  // 1. Search term (Development, Batch, Customer, Sales Order, or Color)
  // 2. Date filter (When cleared, shows ALL records)
  // 3. Priority filter
  const filteredRecords = useMemo(() => {
    const cleanSearch = searchTerm.trim().toLowerCase();

    return records.filter(r => {
      // Priority filter: All | Regular | High | Hold
      if (priorityFilter !== 'All') {
        const itemPriority = r.priority || 'Regular';
        if (itemPriority !== priorityFilter) return false;
      }

      // Search matching Development, Batch, Customer, Sales Order, or Color
      if (cleanSearch) {
        const matchesDev = (r.development || '').toLowerCase().includes(cleanSearch);
        const matchesBatch = (r.batch || '').toLowerCase().includes(cleanSearch);
        const matchesColor = (r.color || '').toLowerCase().includes(cleanSearch);
        const matchesCustomer = (r.customerName || '').toLowerCase().includes(cleanSearch);
        const matchesSO = (r.salesOrder || '').toLowerCase().includes(cleanSearch);
        if (!matchesDev && !matchesBatch && !matchesColor && !matchesCustomer && !matchesSO) return false;
      }

      const recDate = extractRecordDate(r.receivedAt || r.createdAt);
      const delDate = extractRecordDate(r.deliveredAt || '');

      // CRITICAL FIX: When date filter is NOT active (e.g. user clicked Clear), SHOW ALL RECORDS!
      if (!dateFilter.isFiltered) {
        if (viewScope === 'active_daily') {
          const isTodayItem = recDate === todayStr;
          const isPreviousPending = r.status === 'Pending' && !r.isCancelled;
          const isDeliveredToday = r.status === 'Delivered' && delDate === todayStr;
          if (!isTodayItem && !isPreviousPending && !isDeliveredToday) {
            return false;
          }
        }
        return true;
      }

      // When date filter is active:
      if (r.status === 'Delivered') {
        if (dateFilter.startDate && delDate < dateFilter.startDate) return false;
        if (dateFilter.endDate && delDate > dateFilter.endDate) return false;
      } else {
        if (dateFilter.endDate && recDate > dateFilter.endDate) return false;
      }

      return true;
    });
  }, [records, searchTerm, viewScope, dateFilter, todayStr]);

  // Handle DateFilterRow changes: when user clears dateFilter, automatically set viewScope to 'all' so all data displays
  const handleFilterChangeWrapper = (newFilter: DateFilter) => {
    if (!newFilter.isFiltered) {
      setViewScope('all');
    }
    onFilterChange(newFilter);
  };

  // Clear search and date filter: MUST show ALL data
  const handleClearAll = () => {
    setSearchTerm('');
    setPriorityFilter('All');
    setViewScope('all');
    onFilterChange({
      startDate: '',
      endDate: '',
      isFiltered: false,
    });
  };

  // Status toggle wrapper with feedback toast
  const handleStatusToggle = (rec: DeliveryRecord) => {
    onToggleStatus(rec);
    const nextStatus = rec.status === 'Delivered' ? 'Pending' : 'Delivered';
    setStatusToast({ batch: rec.batch, status: nextStatus });
    setTimeout(() => setStatusToast(null), 3500);
  };

  // Admin Excel Export handler
  const handleAdminExport = (type: AdminExportType) => {
    if (!isAdmin) {
      alert('Unauthorized: Excel export is restricted to Admin users.');
      return;
    }
    exportToExcel(filteredRecords, type, dateFilter);
    setShowExportMenu(false);
  };

  // Sort newest SL first (all records shown on single page without pagination)
  const sortedRecords = useMemo(() => {
    return [...filteredRecords].sort((a, b) => (b.sl || 0) - (a.sl || 0));
  }, [filteredRecords]);

  // Multi-selection handlers for all records on single page
  const toggleSelectId = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAllVisible = () => {
    const allSelected = sortedRecords.length > 0 && sortedRecords.every(r => selectedIds.has(r.id));
    const next = new Set(selectedIds);
    if (allSelected) {
      sortedRecords.forEach(r => next.delete(r.id));
    } else {
      sortedRecords.forEach(r => next.add(r.id));
    }
    setSelectedIds(next);
  };

  const handleBulkDeleteConfirm = () => {
    if (selectedIds.size === 0) return;
    if (onBulkDeleteRecords) {
      onBulkDeleteRecords(Array.from(selectedIds));
    }
    setSelectedIds(new Set());
    setIsConfirmingBulkDelete(false);
  };

  const handleBulkDeliverConfirm = () => {
    if (selectedIds.size === 0) return;
    if (onBulkDeliverRecords) {
      onBulkDeliverRecords(Array.from(selectedIds));
    }
    setSelectedIds(new Set());
  };

  // Download high-resolution requisition slip image with exact filename: [Batch]_[Development]_[Delivery Date].[file type]
  const handleDownloadSlipImage = (rec: DeliveryRecord) => {
    if (!rec.requisitionImage) return;
    const fileExt = (rec.requisitionImageMimeType?.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const safeDate = extractRecordDate(rec.deliveredAt || rec.receivedAt || rec.createdAt) || 'date';
    const cleanBatch = (rec.batch || 'BATCH').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const cleanDev = (rec.development || 'DEV').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const filename = `${cleanBatch}_${cleanDev}_${safeDate}.${fileExt}`;

    const link = document.createElement('a');
    link.href = rec.requisitionImage;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Immediate Priority Change Handler (Regular, High, Hold)
  const handlePriorityChange = (rec: DeliveryRecord, newPriority: DeliveryPriority) => {
    const updated: DeliveryRecord = { ...rec, priority: newPriority };
    if (onSaveRecord) {
      onSaveRecord(updated);
    }
    setStatusToast({
      batch: rec.batch,
      status: `Priority set to ${newPriority}`,
    });
  };

  return (
    <div className="space-y-4">
      {/* 1. Header Row: Company Name, Daily Report, Add Data (+ Form Popup) & Export */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 sm:p-5 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            [Company Name]
          </div>
          <h1 className="text-base sm:text-lg font-black text-[#04342c] uppercase tracking-wide">
            Delivery Management Workspace
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Daily Report Download Button (End of day) */}
          <button
            onClick={onOpenDailyReport}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold transition-all shadow-2xs"
          >
            <FileText className="w-4 h-4 text-[#04342c]" />
            <span>Daily Report</span>
          </button>

          {/* Add Data Button (Opens Entry Popup Modal) */}
          <button
            onClick={onOpenNewEntry}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-[#04342c] text-white hover:bg-[#032620] text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4 text-emerald-300" />
            <span>Add Data</span>
          </button>


          {/* Admin Manpower Management Button */}
          {isAdmin && onOpenManpower && (
            <button
              onClick={onOpenManpower}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-md bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
              title="Manage daily manpower work activities and compare against delivered fabric"
            >
              <Users className="w-4 h-4 text-teal-200" />
              <span>Manpower</span>
            </button>
          )}

          {/* Admin-only Excel Export Dropdown */}
          {isAdmin && (
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-md bg-emerald-800 text-white hover:bg-emerald-900 text-xs font-bold transition-all shadow-xs"
              >
                <Download className="w-4 h-4" />
                <span>Export</span>
                <ChevronDown className="w-3.5 h-3.5 text-emerald-300" />
              </button>

              {showExportMenu && (
                <div
                  className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-50 text-xs animate-in fade-in duration-100"
                  onClick={() => setShowExportMenu(false)}
                >
                  <div className="px-3 py-1.5 bg-slate-50 font-bold text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-100">
                    Admin Excel Reports
                  </div>
                  <button
                    onClick={() => handleAdminExport('all')}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 font-medium text-slate-800 flex items-center justify-between"
                  >
                    <span>All Delivery Records</span>
                    <span className="text-[10px] text-slate-400">Complete</span>
                  </button>
                  <button
                    onClick={() => handleAdminExport('previous-day')}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 font-medium text-slate-800 flex items-center justify-between"
                  >
                    <span>Previous-Day Delivery</span>
                    <span className="text-[10px] text-slate-400">Yesterday</span>
                  </button>
                  <button
                    onClick={() => handleAdminExport('selected-date')}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 font-medium text-slate-800 flex items-center justify-between"
                  >
                    <span>Selected Date Range</span>
                    <span className="text-[10px] text-slate-400">Filtered</span>
                  </button>
                  <button
                    onClick={() => handleAdminExport('pending')}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 font-medium text-slate-800 flex items-center justify-between"
                  >
                    <span>Pending Batches</span>
                    <span className="text-[10px] text-slate-400">Staging</span>
                  </button>
                  <button
                    onClick={() => handleAdminExport('development-wise')}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 font-medium text-slate-800 flex items-center justify-between"
                  >
                    <span>Development-Wise Summary</span>
                    <span className="text-[10px] text-slate-400">Fabric</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 2. Unified Search Box (Development, Batch, Customer, Color) & Priority Filter */}
      <div className="bg-white rounded-lg border border-slate-200 p-3 sm:p-4 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => {
              setSearchTerm(e.target.value);
            }}
            placeholder="Search Development (e.g. PVPEEL002D), Batch, Customer, or Color..."
            className="w-full pl-10 pr-9 py-2 text-xs rounded-md border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-[#04342c] bg-slate-50/50 text-slate-800"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
            >
              <XCircle className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Priority Filter */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 shrink-0 bg-slate-50 border border-slate-200 rounded-md px-2 py-1">
            <span className="text-[11px] font-bold text-slate-600">Priority:</span>
            <select
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value as any)}
              className="text-xs bg-transparent font-semibold text-slate-800 focus:outline-hidden cursor-pointer"
            >
              <option value="All">All Priorities</option>
              <option value="Regular">Regular</option>
              <option value="High">High</option>
              <option value="Hold">Hold</option>
            </select>
          </div>

          {(searchTerm || dateFilter.isFiltered || priorityFilter !== 'All') && (
            <button
              onClick={() => {
                handleClearAll();
                setPriorityFilter('All');
              }}
              className="text-xs px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold whitespace-nowrap transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* 3. Date Filter Row (Default: Today on editing page with interactive search) */}
      <DateFilterRow
        filter={dateFilter}
        onFilterChange={handleFilterChangeWrapper}
        defaultMode="today"
        records={records}
        searchQuery={searchTerm}
        onSearchQueryChange={setSearchTerm}
      />

      {/* 4. THE MAIN DATABASE VIEW (Shows Today & Previous Days Pending by default, shows ALL when filter cleared) */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
        {/* Status Toast Alert */}
        {statusToast && (
          <div className="bg-emerald-600 text-white px-4 py-2.5 text-xs font-bold flex items-center justify-between animate-in slide-in-from-top-2 duration-150 shadow-sm">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-200" />
              <span>
                Status updated: Batch <span className="font-mono underline">{statusToast.batch}</span> is now marked as{' '}
                <span className="uppercase tracking-wide font-black">{statusToast.status}</span>.
              </span>
            </div>
            <button
              onClick={() => setStatusToast(null)}
              className="text-white/80 hover:text-white font-bold text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Compact Table Header Bar */}
        <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
              Database Records ({filteredRecords.length})
            </span>
            {!dateFilter.isFiltered && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-200">
                All Historical Batches Shown
              </span>
            )}
            {dateFilter.isFiltered && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-[#04342c] border border-emerald-200">
                Filtered: {dateFilter.startDate || 'Any'} to {dateFilter.endDate || 'Any'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!dateFilter.isFiltered ? (
              <button
                type="button"
                onClick={() => {
                  const today = formatDateToYYYYMMDD(new Date());
                  setViewScope('active_daily');
                  onFilterChange({
                    startDate: today,
                    endDate: today,
                    isFiltered: true,
                  });
                }}
                className="text-[11px] font-bold text-[#04342c] hover:underline cursor-pointer"
              >
                Switch to Today's Workload
              </button>
            ) : (
              <button
                type="button"
                onClick={handleClearAll}
                className="text-[11px] font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Clear to Show All Data ({records.length})
              </button>
            )}
          </div>
        </div>

        {/* Admin Multi-Select Bulk Actions Toolbar */}
        {isAdmin && selectedIds.size > 0 && (
          <div className="bg-[#032620] text-white px-4 py-2.5 rounded-none flex flex-wrap items-center justify-between gap-3 text-xs border-y border-emerald-800 animate-in fade-in">
            <div className="flex items-center gap-2">
              <span className="font-bold bg-emerald-700 px-2.5 py-0.5 rounded text-[11px] text-white">
                {selectedIds.size} Selected
              </span>
              <span className="text-emerald-200 text-xs">
                Admin Bulk Management
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsConfirmingBulkDelete(true)}
                className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white font-bold flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Selected ({selectedIds.size})</span>
              </button>

              {onBulkDeliverRecords && (
                <button
                  type="button"
                  onClick={handleBulkDeliverConfirm}
                  className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Deliver Selected</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="px-2.5 py-1.5 rounded border border-white/20 hover:bg-white/10 text-white/90 text-xs font-semibold transition-colors"
              >
                Clear Selection
              </button>
            </div>
          </div>
        )}

        {/* Database Table Matching Image 1 */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-[#04342c] text-white uppercase text-[10.5px] font-semibold tracking-wider">
              <tr>
                {isAdmin && (
                  <th className="py-2.5 px-3 w-8 text-center">
                    <input
                      type="checkbox"
                      checked={
                        sortedRecords.length > 0 &&
                        sortedRecords.every(r => selectedIds.has(r.id))
                      }
                      onChange={toggleSelectAllVisible}
                      className="rounded border-emerald-400 text-emerald-600 focus:ring-0 cursor-pointer"
                      title="Select all records"
                    />
                  </th>
                )}
                <th className="py-2.5 px-3">SL</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Dev Code</th>
                <th className="py-2.5 px-3">Customer</th>
                <th className="py-2.5 px-3">Batch</th>
                <th className="py-2.5 px-3 text-center">Rolls</th>
                <th className="py-2.5 px-3 text-right">KG</th>
                <th className="py-2.5 px-3 text-center">Priority</th>
                <th className="py-2.5 px-3">Remarks</th>
                <th className="py-2.5 px-3">Received At</th>
                <th className="py-2.5 px-3 text-center">Status / Completed</th>
                <th className="py-2.5 px-3 text-center">Change Status</th>
                <th className="py-2.5 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedRecords.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 14 : 13} className="py-12 text-center text-slate-400 font-medium">
                    No matching records found.
                  </td>
                </tr>
              ) : (
                sortedRecords.map(rec => {
                  const isDelivered = rec.status === 'Delivered';
                  const isSelected = selectedIds.has(rec.id);
                  return (
                    <tr
                      key={rec.id}
                      className={`transition-colors ${
                        isSelected ? 'bg-emerald-50/70' : 'hover:bg-slate-50/90'
                      }`}
                    >
                      {/* Checkbox (Admin Only) */}
                      {isAdmin && (
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectId(rec.id)}
                            className="rounded border-slate-300 text-[#04342c] focus:ring-0 cursor-pointer"
                          />
                        </td>
                      )}

                      {/* SL */}
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-500">
                        {rec.sl}
                      </td>

                      {/* Type Badge */}
                      <td className="py-2.5 px-3">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            rec.orderType === 'Bulk'
                              ? 'bg-slate-100 text-slate-800 border border-slate-200'
                              : 'bg-purple-100 text-purple-800 border border-purple-200'
                          }`}
                        >
                          {rec.orderType}
                        </span>
                      </td>

                      {/* Dev Code */}
                      <td className="py-2.5 px-3 font-bold text-slate-900 tracking-wide font-sans">
                        {rec.development}
                      </td>

                      {/* Customer Name & Sales Order */}
                      <td className="py-2.5 px-3 font-medium text-slate-800 whitespace-nowrap text-xs">
                        {rec.customerName ? (
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3 h-3 text-[#04342c] shrink-0" />
                            <span className="font-semibold text-slate-800 max-w-[130px] truncate" title={rec.customerName}>
                              {rec.customerName}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono">-</span>
                        )}
                        {rec.salesOrder && (
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5" title="Sales Order">
                            SO: {rec.salesOrder}
                          </div>
                        )}
                      </td>

                      {/* Batch & Requisition Slip Badge */}
                      <td className="py-2.5 px-3 font-mono font-bold text-[#04342c]">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>{rec.batch}</span>
                          {rec.requisitionImage && (
                            <button
                              type="button"
                              onClick={() => isAdmin ? setPreviewImageRecord(rec) : null}
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-bold border transition-colors ${
                                isAdmin
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 cursor-pointer shadow-2xs'
                                  : 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed opacity-75'
                              }`}
                              title={
                                isAdmin
                                  ? 'Admin Access: View & Download High-Quality Requisition Slip'
                                  : 'Requisition Slip Attached (Admin Access Only)'
                              }
                            >
                              {isAdmin ? (
                                <Camera className="w-3 h-3 text-emerald-700" />
                              ) : (
                                <Lock className="w-3 h-3 text-slate-400" />
                              )}
                              <span>Slip</span>
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Rolls */}
                      <td className="py-2.5 px-3 text-center font-semibold text-slate-800">
                        {rec.rollQty}
                      </td>

                      {/* KG */}
                      <td className="py-2.5 px-3 text-right font-black text-slate-900 font-mono">
                        {rec.kgQty.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* Priority Selector with Hold Option */}
                      <td className="py-2.5 px-3 text-center">
                        <select
                          value={rec.priority || 'Regular'}
                          onChange={e => handlePriorityChange(rec, e.target.value as DeliveryPriority)}
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded border cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-[#04342c] transition-all ${
                            rec.priority === 'High'
                              ? 'bg-red-50 text-red-700 border-red-300'
                              : rec.priority === 'Hold'
                              ? 'bg-amber-100 text-amber-900 border-amber-300 font-black'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}
                          title="Change item priority (Regular, High, Hold)"
                        >
                          <option value="Regular">Regular</option>
                          <option value="High">High</option>
                          <option value="Hold">Hold</option>
                        </select>
                      </td>

                      {/* Remarks */}
                      <td className="py-2.5 px-3 text-slate-500 text-[11px] truncate max-w-[120px]" title={rec.remarks}>
                        {rec.remarks || '-'}
                      </td>

                      {/* Received At with User Badge */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-[11px]">
                        <div className="font-mono text-slate-600">{rec.receivedAt || '-'}</div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1 font-semibold">
                          <User className="w-3 h-3 text-[#04342c]" />
                          <span>{rec.receivedBy || 'Admin'}</span>
                        </div>
                      </td>

                      {/* Status / Completed Badge */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {rec.isCancelled ? (
                          <div
                            className="inline-flex flex-col items-center px-2 py-1 rounded text-[10.5px] font-bold bg-rose-50 text-rose-800 border border-rose-300 shadow-2xs"
                            title={`Cancelled by ${rec.cancelledBy || 'Admin'}${rec.cancelledAt ? ` on ${rec.cancelledAt}` : ''}. Reason: ${rec.cancelReason || 'Admin Action'}`}
                          >
                            <span className="flex items-center gap-1 font-black text-rose-700">
                              <Ban className="w-3.5 h-3.5 text-rose-600" />
                              <span>CANCELLED</span>
                            </span>
                            <span className="text-[9px] text-rose-600 font-medium truncate max-w-[100px]">
                              {rec.cancelReason || 'Admin Locked'}
                            </span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStatusToggle(rec)}
                            className={`inline-flex flex-col items-center px-2.5 py-1 rounded text-[11px] font-bold border transition-all cursor-pointer hover:opacity-90 active:scale-95 ${
                              isDelivered
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                            }`}
                            title={`Click to switch status to ${isDelivered ? 'Pending' : 'Delivered'}`}
                          >
                            <span className="flex items-center gap-1">
                              {isDelivered ? (
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Clock className="w-3.5 h-3.5 text-amber-600" />
                              )}
                              <span>{isDelivered ? 'Delivered' : 'Pending'}</span>
                            </span>
                            {isDelivered && rec.deliveredBy && (
                              <span className="text-[9px] text-emerald-700 font-normal mt-0.5">
                                ✓ {rec.deliveredBy} {rec.deliveredAt?.split(' ')[1] || ''}
                              </span>
                            )}
                          </button>
                        )}
                      </td>

                      {/* Explicit Deliver / Reopen Status Switcher Button */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {rec.isCancelled ? (
                          isAdmin ? (
                            <button
                              type="button"
                              onClick={() => onToggleCancelBatch?.(rec.id, false)}
                              className="px-2.5 py-1.5 rounded-md bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1 mx-auto transition-all shadow-xs cursor-pointer"
                              title="Click to Activate this batch (Admin Only)"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Activate</span>
                            </button>
                          ) : (
                            <span
                              className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-400 font-bold text-[10.5px] inline-flex items-center gap-1 border border-slate-200 cursor-not-allowed"
                              title="This batch is cancelled. It cannot be delivered until an Admin activates it."
                            >
                              <Lock className="w-3 h-3 text-slate-400" />
                              <span>Locked</span>
                            </span>
                          )
                        ) : isDelivered ? (
                          <button
                            type="button"
                            onClick={() => handleStatusToggle(rec)}
                            className="px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 mx-auto transition-all shadow-xs cursor-pointer"
                            title="Reopen lot back to Pending status"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Reopen</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStatusToggle(rec)}
                            className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 mx-auto transition-all shadow-xs cursor-pointer"
                            title="Mark lot as Delivered"
                          >
                            <CheckCircle className="w-3.5 h-3.5 text-white" />
                            <span>Deliver</span>
                          </button>
                        )}
                      </td>

                      {/* Actions: Edit (All users), Cancel / Activate & Delete (Admin Only) */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => onEditRecord(rec)}
                            className="p-1 rounded text-slate-600 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                            title="Edit Record"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          {isAdmin && (
                            <button
                              onClick={() => {
                                if (rec.isCancelled) {
                                  onToggleCancelBatch?.(rec.id, false);
                                } else {
                                  onToggleCancelBatch?.(rec.id, true, 'Cancelled by Admin');
                                }
                              }}
                              className={`p-1 rounded transition-colors ${
                                rec.isCancelled
                                  ? 'text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50'
                                  : 'text-amber-600 hover:text-amber-800 hover:bg-amber-50'
                              }`}
                              title={rec.isCancelled ? 'Activate Batch' : 'Cancel Batch (Admin)'}
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {isAdmin && (
                            <button
                              onClick={() => onRequestDelete(rec)}
                              className="p-1 rounded text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
                              title="Delete Record (Admin Only)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Single Page Records Footer */}
        <div className="p-3 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-600 gap-2">
          <div className="font-medium">
            Showing all <span className="font-bold text-slate-900">{sortedRecords.length}</span> records on single page
            {dateFilter.isFiltered ? (
              <span className="text-slate-500 ml-1">
                ({dateFilter.startDate === dateFilter.endDate ? `Date: ${dateFilter.startDate}` : `${dateFilter.startDate} to ${dateFilter.endDate}`})
              </span>
            ) : (
              <span className="text-slate-500 ml-1">(All Dates)</span>
            )}
          </div>
          {selectedIds.size > 0 && (
            <div className="text-emerald-800 font-bold bg-emerald-100/80 px-2.5 py-1 rounded border border-emerald-200 text-xs">
              {selectedIds.size} records selected for bulk actions
            </div>
          )}
        </div>
      </div>

      {/* Admin Bulk Delete Confirmation Modal */}
      {isConfirmingBulkDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-red-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-red-600 text-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-100" />
                <h3 className="font-bold text-sm tracking-wide">Confirm Admin Bulk Delete</h3>
              </div>
              <button
                onClick={() => setIsConfirmingBulkDelete(false)}
                className="text-white/80 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs text-slate-700">
              <p className="font-semibold text-slate-900">
                Are you sure you want to permanently delete these <span className="text-red-600 font-bold">{selectedIds.size}</span> selected records?
              </p>
              <p className="text-slate-500 leading-relaxed">
                This action is irreversible. The selected batches will be permanently removed from the greige database.
              </p>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsConfirmingBulkDelete(false)}
                className="px-3.5 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkDeleteConfirm}
                className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors shadow-xs"
              >
                Confirm & Delete ({selectedIds.size})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Requisition Slip Image Modal (Admin Only Access) */}
      {previewImageRecord && previewImageRecord.requisitionImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-3xl overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-[#04342c] text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Camera className="w-5 h-5 text-emerald-300" />
                <div>
                  <h3 className="text-sm font-bold tracking-wide">
                    Requisition Slip Image — Batch {previewImageRecord.batch}
                  </h3>
                  <p className="text-[11px] text-emerald-200 font-mono">
                    {previewImageRecord.development} • {previewImageRecord.rollQty} Rolls • {previewImageRecord.kgQty} KG
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleDownloadSlipImage(previewImageRecord)}
                    className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-xs"
                    title="Download original high-quality image named [Batch]_[Development]_[Delivery Date].[ext]"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Best Quality</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewImageRecord(null)}
                  className="text-white/80 hover:text-white p-1 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* High Resolution Image Preview */}
            <div className="p-4 bg-slate-900 flex items-center justify-center max-h-[70vh] overflow-auto">
              <img
                src={previewImageRecord.requisitionImage}
                alt={`Slip for Batch ${previewImageRecord.batch}`}
                className="max-w-full max-h-[65vh] object-contain rounded border border-slate-700 shadow-xl"
              />
            </div>

            {/* Footer with Naming Convention Note */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-600 gap-2">
              <div className="font-mono text-[11px] text-slate-500">
                Download file name: <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-800 font-bold">{previewImageRecord.batch}_{previewImageRecord.development}_{extractRecordDate(previewImageRecord.deliveredAt || previewImageRecord.receivedAt || previewImageRecord.createdAt) || 'date'}.{(previewImageRecord.requisitionImageMimeType?.split('/')[1] || 'jpg').replace('jpeg', 'jpg')}</code>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewImageRecord(null)}
                  className="px-4 py-1.5 rounded border border-slate-300 hover:bg-slate-100 text-xs font-bold text-slate-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
