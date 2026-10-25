import React, { useState, useRef, useEffect, useMemo } from 'react';
import { DateFilter, DeliveryRecord } from '../types';
import { getDefault7DayRange, formatDateToYYYYMMDD } from '../services/storage';
import {
  Calendar,
  RotateCcw,
  XCircle,
  Layers,
  Search,
  ChevronDown,
  Check,
  Package,
  Building2,
  Tag,
} from 'lucide-react';

interface DateFilterRowProps {
  filter: DateFilter;
  onFilterChange: (newFilter: DateFilter) => void;
  className?: string;
  defaultMode?: 'today' | '7days';
  developmentFilter?: string;
  onDevelopmentFilterChange?: (dev: string) => void;
  availableDevelopments?: string[];
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  records?: DeliveryRecord[];
}

export const DateFilterRow: React.FC<DateFilterRowProps> = ({
  filter,
  onFilterChange,
  className = '',
  defaultMode = '7days',
  developmentFilter,
  onDevelopmentFilterChange,
  availableDevelopments = [],
  searchQuery = '',
  onSearchQueryChange,
  records = [],
}) => {
  const [searchInput, setSearchInput] = useState(searchQuery || developmentFilter || '');
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [activeCategoryTab, setActiveCategoryTab] = useState<'all' | 'dev' | 'batch' | 'customer'>('all');
  const searchDropdownRef = useRef<HTMLDivElement>(null);

  // Sync searchInput when searchQuery or developmentFilter changes externally
  useEffect(() => {
    setSearchInput(searchQuery || developmentFilter || '');
  }, [searchQuery, developmentFilter]);

  // Close search dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchDropdownRef.current && !searchDropdownRef.current.contains(e.target as Node)) {
        setIsSearchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFilterChange({
      ...filter,
      startDate: e.target.value,
      isFiltered: true,
    });
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFilterChange({
      ...filter,
      endDate: e.target.value,
      isFiltered: true,
    });
  };

  // Quick preset: Today
  const handleToday = () => {
    const today = formatDateToYYYYMMDD(new Date());
    onFilterChange({
      startDate: today,
      endDate: today,
      isFiltered: true,
    });
  };

  // Clear: clears active restrictions (shows all dates)
  const handleClear = () => {
    onFilterChange({
      startDate: '',
      endDate: '',
      isFiltered: false,
    });
    if (onDevelopmentFilterChange) {
      onDevelopmentFilterChange('');
    }
  };

  // Reset: restores default date range (Today if defaultMode is 'today', otherwise 7 days)
  const handleReset = () => {
    if (defaultMode === 'today') {
      const today = formatDateToYYYYMMDD(new Date());
      onFilterChange({
        startDate: today,
        endDate: today,
        isFiltered: true,
      });
    } else {
      const defaultRange = getDefault7DayRange();
      onFilterChange({
        startDate: defaultRange.startDate,
        endDate: defaultRange.endDate,
        isFiltered: true,
      });
    }
    if (onDevelopmentFilterChange) {
      onDevelopmentFilterChange('');
    }
  };

  // Quick preset: Last 7 days
  const handleLast7Days = () => {
    const defaultRange = getDefault7DayRange();
    onFilterChange({
      startDate: defaultRange.startDate,
      endDate: defaultRange.endDate,
      isFiltered: true,
    });
  };

  // Quick preset: Last 14 days
  const handleLast14Days = () => {
    const today = new Date();
    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(today.getDate() - 13);
    onFilterChange({
      startDate: formatDateToYYYYMMDD(fourteenDaysAgo),
      endDate: formatDateToYYYYMMDD(today),
      isFiltered: true,
    });
  };

  // Quick preset: This month
  const handleThisMonth = () => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    onFilterChange({
      startDate: formatDateToYYYYMMDD(firstDay),
      endDate: formatDateToYYYYMMDD(today),
      isFiltered: true,
    });
  };

  // Computed lists of distinct Developments, Batches, and Customers
  const { devList, batchList, customerList } = useMemo(() => {
    const devMap = new Map<string, number>();
    const batchMap = new Map<string, DeliveryRecord>();
    const customerMap = new Map<string, number>();

    // Add developments from availableDevelopments prop
    availableDevelopments.forEach(d => {
      const dev = d.trim().toUpperCase();
      if (dev && !devMap.has(dev)) {
        devMap.set(dev, 0);
      }
    });

    records.forEach(r => {
      if (r.development && r.development.trim()) {
        const d = r.development.trim().toUpperCase();
        devMap.set(d, (devMap.get(d) || 0) + 1);
      }
      if (r.batch && r.batch.trim()) {
        const b = r.batch.trim().toUpperCase();
        if (!batchMap.has(b)) {
          batchMap.set(b, r);
        }
      }
      if (r.customerName && r.customerName.trim()) {
        const c = r.customerName.trim();
        customerMap.set(c, (customerMap.get(c) || 0) + 1);
      }
    });

    return {
      devList: Array.from(devMap.entries()).map(([name, count]) => ({ name, count })),
      batchList: Array.from(batchMap.values()),
      customerList: Array.from(customerMap.entries()).map(([name, count]) => ({ name, count })),
    };
  }, [records, availableDevelopments]);

  const query = searchInput.trim().toLowerCase();

  const matchingDevs = useMemo(() => {
    if (!query) return devList.slice(0, 8);
    return devList.filter(d => d.name.toLowerCase().includes(query)).slice(0, 12);
  }, [devList, query]);

  const matchingBatches = useMemo(() => {
    if (!query) return batchList.slice(0, 8);
    return batchList
      .filter(
        b =>
          b.batch.toLowerCase().includes(query) ||
          (b.development && b.development.toLowerCase().includes(query)) ||
          (b.customerName && b.customerName.toLowerCase().includes(query))
      )
      .slice(0, 12);
  }, [batchList, query]);

  const matchingCustomers = useMemo(() => {
    if (!query) return customerList.slice(0, 8);
    return customerList.filter(c => c.name.toLowerCase().includes(query)).slice(0, 12);
  }, [customerList, query]);

  const totalMatches = matchingDevs.length + matchingBatches.length + matchingCustomers.length;

  return (
    <div
      className={`bg-white rounded-lg border border-slate-200 px-3 py-2 shadow-2xs ${className}`}
    >
      {/* Kept all items strictly in a single horizontal row with smooth horizontal scroll on small screens */}
      <div className="flex items-center justify-between gap-2.5 overflow-x-auto no-scrollbar whitespace-nowrap min-w-0">
        {/* Left Section: Date Label & Pickers & Presets */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 shrink-0">
            <Calendar className="w-3.5 h-3.5 text-[#04342c]" />
            <span className="hidden xl:inline">Date:</span>
          </div>

          {/* Date Pickers */}
          <div className="flex items-center gap-1 shrink-0">
            <input
              type="date"
              value={filter.startDate}
              onChange={handleStartDateChange}
              className="text-xs px-2 py-1 rounded border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-[#04342c] text-slate-700 bg-slate-50/50 font-mono w-[122px]"
              title="Start Date"
            />
            <span className="text-[11px] text-slate-400 font-medium">to</span>
            <input
              type="date"
              value={filter.endDate}
              onChange={handleEndDateChange}
              className="text-xs px-2 py-1 rounded border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-[#04342c] text-slate-700 bg-slate-50/50 font-mono w-[122px]"
              title="End Date"
            />
          </div>

          {/* Presets */}
          <div className="flex items-center gap-1 border-l border-slate-200 pl-2 shrink-0">
            <button
              type="button"
              onClick={handleToday}
              className="text-[11px] px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-[#04342c] border border-emerald-200 transition-colors font-bold cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={handleLast7Days}
              className="text-[11px] px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors font-medium cursor-pointer"
            >
              7D
            </button>
            <button
              type="button"
              onClick={handleLast14Days}
              className="text-[11px] px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors font-medium cursor-pointer"
            >
              14D
            </button>
            <button
              type="button"
              onClick={handleThisMonth}
              className="text-[11px] px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors font-medium cursor-pointer"
            >
              Month
            </button>
          </div>
        </div>

        {/* Center: Interactive Linked Search Bar (Search Dev, Batch, Customer) */}
        <div
          ref={searchDropdownRef}
          className="relative flex items-center gap-1.5 border-l border-slate-200 pl-2 shrink-0"
        >
          <span className="flex items-center gap-1 text-[11px] font-bold text-slate-700 shrink-0">
            <Search className="w-3.5 h-3.5 text-[#04342c] shrink-0" />
            <span className="hidden sm:inline">Search:</span>
          </span>

          <div className="relative flex items-center">
            <input
              type="text"
              value={searchInput}
              onChange={e => {
                const val = e.target.value;
                setSearchInput(val);
                setIsSearchDropdownOpen(true);
                onSearchQueryChange?.(val);
                if (!val) {
                  onDevelopmentFilterChange?.('');
                }
              }}
              onFocus={() => setIsSearchDropdownOpen(true)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === 'Escape') {
                  setIsSearchDropdownOpen(false);
                }
              }}
              placeholder="Dev, Batch, Customer..."
              className="text-xs px-2.5 py-1 pr-6 rounded border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-[#04342c] bg-slate-50/50 text-slate-800 font-medium w-36 sm:w-48 md:w-56"
              title="Search Development, Batch, or Customer"
            />
            {searchInput ? (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  onSearchQueryChange?.('');
                  onDevelopmentFilterChange?.('');
                  setIsSearchDropdownOpen(false);
                }}
                className="absolute right-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                title="Clear Search"
              >
                <XCircle className="w-3.5 h-3.5" />
              </button>
            ) : (
              <ChevronDown
                className="w-3 h-3 absolute right-1.5 text-slate-400 cursor-pointer pointer-events-none"
              />
            )}
          </div>

          {/* Interactive Multi-Entity Dropdown Popup */}
          {isSearchDropdownOpen && (
            <div className="absolute top-full right-0 sm:left-0 sm:right-auto mt-1 w-80 sm:w-96 max-h-80 bg-white border border-slate-200 rounded-lg shadow-2xl z-50 text-xs flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100">
              {/* Category Filter Tabs */}
              <div className="p-1.5 bg-slate-50 border-b border-slate-200 flex items-center gap-1 shrink-0 overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => setActiveCategoryTab('all')}
                  className={`px-2 py-0.5 rounded text-[10.5px] font-bold cursor-pointer transition-colors ${
                    activeCategoryTab === 'all'
                      ? 'bg-[#04342c] text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All ({totalMatches})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCategoryTab('dev')}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-bold cursor-pointer transition-colors ${
                    activeCategoryTab === 'dev'
                      ? 'bg-[#04342c] text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Layers className="w-3 h-3" />
                  <span>Dev ({matchingDevs.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCategoryTab('batch')}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-bold cursor-pointer transition-colors ${
                    activeCategoryTab === 'batch'
                      ? 'bg-[#04342c] text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Package className="w-3 h-3" />
                  <span>Batch ({matchingBatches.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCategoryTab('customer')}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-bold cursor-pointer transition-colors ${
                    activeCategoryTab === 'customer'
                      ? 'bg-[#04342c] text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Building2 className="w-3 h-3" />
                  <span>Customer ({matchingCustomers.length})</span>
                </button>
              </div>

              {/* Scrollable Results List */}
              <div className="overflow-y-auto divide-y divide-slate-100 flex-1 max-h-60">
                {/* 1. Developments */}
                {(activeCategoryTab === 'all' || activeCategoryTab === 'dev') && matchingDevs.length > 0 && (
                  <div>
                    <div className="px-2.5 py-1 bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      <Layers className="w-3 h-3 text-[#04342c]" />
                      <span>Developments ({matchingDevs.length})</span>
                    </div>
                    {matchingDevs.map(d => {
                      const isSelected = developmentFilter === d.name;
                      return (
                        <div
                          key={`dev-${d.name}`}
                          onClick={() => {
                            setSearchInput(d.name);
                            onDevelopmentFilterChange?.(d.name);
                            onSearchQueryChange?.(d.name);
                            setIsSearchDropdownOpen(false);
                          }}
                          className={`px-3 py-1.5 cursor-pointer transition-colors flex items-center justify-between group ${
                            isSelected ? 'bg-emerald-50 text-[#04342c] font-bold' : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="px-1.5 py-0.5 rounded bg-emerald-100/70 text-[#04342c] font-mono text-[9px] font-bold">
                              DEV
                            </span>
                            <span className="font-mono text-xs truncate">{d.name}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {d.count > 0 && (
                              <span className="text-[10px] text-slate-400 group-hover:text-emerald-700">
                                {d.count} lots
                              </span>
                            )}
                            {isSelected && <Check className="w-3.5 h-3.5 text-[#04342c]" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 2. Batches */}
                {(activeCategoryTab === 'all' || activeCategoryTab === 'batch') && matchingBatches.length > 0 && (
                  <div>
                    <div className="px-2.5 py-1 bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      <Package className="w-3 h-3 text-amber-700" />
                      <span>Batches ({matchingBatches.length})</span>
                    </div>
                    {matchingBatches.map(b => (
                      <div
                        key={`batch-${b.id || b.batch}`}
                        onClick={() => {
                          setSearchInput(b.batch);
                          onSearchQueryChange?.(b.batch);
                          setIsSearchDropdownOpen(false);
                        }}
                        className="px-3 py-1.5 cursor-pointer hover:bg-amber-50/60 transition-colors flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-mono text-[9px] font-bold">
                            LOT
                          </span>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-800 font-mono text-xs truncate">
                              {b.batch}
                            </div>
                            <div className="text-[10px] text-slate-500 truncate flex items-center gap-1">
                              <span>{b.development}</span>
                              {b.customerName && (
                                <>
                                  <span>•</span>
                                  <span className="text-slate-400 truncate max-w-[100px]">{b.customerName}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                              b.status === 'Delivered'
                                ? 'bg-emerald-100 text-emerald-800'
                                : b.priority === 'Hold'
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {b.status}
                          </span>
                          {b.kgQty ? (
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                              {Math.round(b.kgQty)} kg
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 3. Customers */}
                {(activeCategoryTab === 'all' || activeCategoryTab === 'customer') && matchingCustomers.length > 0 && (
                  <div>
                    <div className="px-2.5 py-1 bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      <Building2 className="w-3 h-3 text-blue-700" />
                      <span>Customers ({matchingCustomers.length})</span>
                    </div>
                    {matchingCustomers.map(c => (
                      <div
                        key={`cust-${c.name}`}
                        onClick={() => {
                          setSearchInput(c.name);
                          onSearchQueryChange?.(c.name);
                          setIsSearchDropdownOpen(false);
                        }}
                        className="px-3 py-1.5 cursor-pointer hover:bg-blue-50/60 transition-colors flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-900 font-mono text-[9px] font-bold">
                            CUST
                          </span>
                          <span className="font-semibold text-slate-800 text-xs truncate">{c.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 group-hover:text-blue-700">
                          {c.count} {c.count === 1 ? 'batch' : 'batches'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {totalMatches === 0 && (
                  <div className="px-4 py-6 text-center text-slate-400 text-xs">
                    No development, batch, or customer matches "{searchInput}"
                  </div>
                )}
              </div>

              {/* Bottom Quick Action Footer */}
              <div className="p-1.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] shrink-0">
                <span className="text-slate-500 truncate">
                  {searchInput ? `Filter: "${searchInput}"` : 'Type to search or pick'}
                </span>
                {(searchInput || developmentFilter) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput('');
                      onSearchQueryChange?.('');
                      onDevelopmentFilterChange?.('');
                      setIsSearchDropdownOpen(false);
                    }}
                    className="text-[#04342c] hover:underline font-bold cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Section: Clear & Reset Buttons */}
        <div className="flex items-center gap-1.5 border-l border-slate-200 pl-2 shrink-0">
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors font-medium cursor-pointer"
            title="Clear active date & dev restrictions"
          >
            <XCircle className="w-3 h-3 text-slate-400" />
            <span>Clear</span>
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-[#04342c] text-white hover:bg-[#032620] transition-colors font-semibold shadow-xs cursor-pointer"
            title={defaultMode === 'today' ? 'Reset to Today' : 'Reset to default last 7 calendar days'}
          >
            <RotateCcw className="w-3 h-3" />
            <span>{defaultMode === 'today' ? 'Reset' : 'Reset (7D)'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
