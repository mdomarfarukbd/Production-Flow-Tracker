import React, { useState, useMemo } from 'react';
import { DeliveryRecord } from '../types';
import { Award, ArrowUpDown, Filter, XCircle, TrendingUp, Layers, Scale } from 'lucide-react';

interface DevelopmentRankingProps {
  records: DeliveryRecord[];
  selectedDevelopment: string | null;
  onSelectDevelopment: (dev: string | null) => void;
  dateFilterLabel?: string;
}

type SortField = 'deliveredKg' | 'pendingKg' | 'batchCount' | 'completionPct';

interface DevRankItem {
  development: string;
  deliveredKg: number;
  pendingKg: number;
  totalKg: number;
  deliveredRolls: number;
  pendingRolls: number;
  batchCount: number;
  completionPct: number;
}

export const DevelopmentRanking: React.FC<DevelopmentRankingProps> = ({
  records,
  selectedDevelopment,
  onSelectDevelopment,
  dateFilterLabel,
}) => {
  const [sortField, setSortField] = useState<SortField>('deliveredKg');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [hoveredDev, setHoveredDev] = useState<string | null>(null);

  // Group records by uppercase Development
  const rankingData = useMemo(() => {
    const map: Record<string, {
      development: string;
      deliveredKg: number;
      pendingKg: number;
      deliveredRolls: number;
      pendingRolls: number;
      batches: Set<string>;
    }> = {};

    records.forEach(r => {
      const dev = (r.development || 'UNKNOWN').trim().toUpperCase();
      if (!map[dev]) {
        map[dev] = {
          development: dev,
          deliveredKg: 0,
          pendingKg: 0,
          deliveredRolls: 0,
          pendingRolls: 0,
          batches: new Set<string>(),
        };
      }

      if (r.status === 'Delivered') {
        map[dev].deliveredKg += r.kgQty || 0;
        map[dev].deliveredRolls += r.rollQty || 0;
      } else {
        map[dev].pendingKg += r.kgQty || 0;
        map[dev].pendingRolls += r.rollQty || 0;
      }

      if (r.batch) {
        map[dev].batches.add(r.batch);
      }
    });

    const items: DevRankItem[] = Object.values(map).map(m => {
      const totalKg = m.deliveredKg + m.pendingKg;
      // Completion % based on actual records: delivered vs total recorded volume
      const completionPct = totalKg > 0 ? Math.round((m.deliveredKg / totalKg) * 100) : 0;

      return {
        development: m.development,
        deliveredKg: Number(m.deliveredKg.toFixed(2)),
        pendingKg: Number(m.pendingKg.toFixed(2)),
        totalKg: Number(totalKg.toFixed(2)),
        deliveredRolls: m.deliveredRolls,
        pendingRolls: m.pendingRolls,
        batchCount: m.batches.size,
        completionPct,
      };
    });

    // Sort items
    items.sort((a, b) => {
      let diff = 0;
      if (sortField === 'deliveredKg') diff = a.deliveredKg - b.deliveredKg;
      else if (sortField === 'pendingKg') diff = a.pendingKg - b.pendingKg;
      else if (sortField === 'batchCount') diff = a.batchCount - b.batchCount;
      else if (sortField === 'completionPct') diff = a.completionPct - b.completionPct;

      if (diff === 0) {
        // Tie breaker: alphabetical development name
        return a.development.localeCompare(b.development);
      }
      return sortAsc ? diff : -diff;
    });

    return items;
  }, [records, sortField, sortAsc]);

  const maxDeliveredKg = useMemo(() => {
    const max = Math.max(...rankingData.map(d => d.deliveredKg), 100);
    return max;
  }, [rankingData]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false); // default descending
    }
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-2xs space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-[#04342c]" />
            <h2 className="text-sm font-bold text-[#04342c] uppercase tracking-wider">
              Development Performance Ranking
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Ranked by delivery volume & dispatch completion rate {dateFilterLabel ? `(${dateFilterLabel})` : ''}
          </p>
        </div>

        {/* Selected Filter Indicator / Clear Button */}
        {selectedDevelopment && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-[#04342c] px-3 py-1 rounded-md text-xs font-semibold">
            <Filter className="w-3.5 h-3.5 text-emerald-600" />
            <span>Filtering: {selectedDevelopment}</span>
            <button
              onClick={() => onSelectDevelopment(null)}
              className="ml-1 text-slate-400 hover:text-slate-700"
              title="Clear development filter"
            >
              <XCircle className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Visual Bar Comparison (Top 5) */}
      <div className="space-y-2 pt-1">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          Top Delivered Developments (KG Volume)
        </div>
        <div className="space-y-2">
          {rankingData.slice(0, 5).map((item, idx) => {
            const barWidth = Math.max(6, Math.round((item.deliveredKg / maxDeliveredKg) * 100));
            const isSelected = selectedDevelopment === item.development;

            return (
              <div
                key={item.development}
                onClick={() => onSelectDevelopment(isSelected ? null : item.development)}
                onMouseEnter={() => setHoveredDev(item.development)}
                onMouseLeave={() => setHoveredDev(null)}
                className={`p-2 rounded-md border transition-all cursor-pointer ${
                  isSelected
                    ? 'border-[#04342c] bg-emerald-50/70 shadow-xs'
                    : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <div className="flex items-center gap-2 truncate">
                    <span className="w-5 text-center font-bold text-slate-400 font-mono text-[11px]">
                      #{idx + 1}
                    </span>
                    <span className="font-bold text-slate-800 uppercase tracking-wide truncate">
                      {item.development}
                    </span>
                  </div>
                  <div className="text-right whitespace-nowrap font-medium text-slate-700">
                    <span className="font-bold text-[#04342c]">{item.deliveredKg} KG</span>
                    <span className="text-slate-400 text-[11px] ml-1.5">({item.completionPct}%)</span>
                  </div>
                </div>

                {/* Progress Track */}
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${barWidth}%`,
                      backgroundColor: isSelected ? '#04342c' : '#0e705f',
                    }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Comprehensive Ranking Table */}
      <div className="overflow-x-auto pt-2">
        <table className="w-full text-left text-xs border border-slate-200">
          <thead className="bg-[#04342c] text-white uppercase text-[10px] font-bold tracking-wider">
            <tr>
              <th className="py-2.5 px-3">Rank</th>
              <th className="py-2.5 px-3">Development</th>
              <th
                onClick={() => toggleSort('deliveredKg')}
                className="py-2.5 px-3 text-right cursor-pointer hover:bg-[#032620] transition-colors"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Delivered KG</span>
                  <ArrowUpDown className="w-3 h-3 text-emerald-300" />
                </div>
              </th>
              <th
                onClick={() => toggleSort('pendingKg')}
                className="py-2.5 px-3 text-right cursor-pointer hover:bg-[#032620] transition-colors"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Pending KG</span>
                  <ArrowUpDown className="w-3 h-3 text-emerald-300" />
                </div>
              </th>
              <th
                onClick={() => toggleSort('batchCount')}
                className="py-2.5 px-3 text-center cursor-pointer hover:bg-[#032620] transition-colors"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>Batches</span>
                  <ArrowUpDown className="w-3 h-3 text-emerald-300" />
                </div>
              </th>
              <th
                onClick={() => toggleSort('completionPct')}
                className="py-2.5 px-3 text-center cursor-pointer hover:bg-[#032620] transition-colors"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>Completion %</span>
                  <ArrowUpDown className="w-3 h-3 text-emerald-300" />
                </div>
              </th>
              <th className="py-2.5 px-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rankingData.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400">
                  No development records found in this reporting scope.
                </td>
              </tr>
            ) : (
              rankingData.map((item, idx) => {
                const isSelected = selectedDevelopment === item.development;
                return (
                  <tr
                    key={item.development}
                    className={`transition-colors ${
                      isSelected
                        ? 'bg-emerald-50/80 font-semibold'
                        : idx % 2 === 0
                        ? 'bg-white hover:bg-slate-50'
                        : 'bg-slate-50/50 hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-400">
                      #{idx + 1}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-900 uppercase">
                      {item.development}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-[#04342c]">
                      {item.deliveredKg.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-slate-600">
                      {item.pendingKg.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-medium">
                      {item.batchCount}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.completionPct >= 80
                            ? 'bg-emerald-100 text-emerald-800'
                            : item.completionPct >= 50
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {item.completionPct}%
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() => onSelectDevelopment(isSelected ? null : item.development)}
                        className={`text-[11px] px-2 py-1 rounded transition-colors font-medium ${
                          isSelected
                            ? 'bg-[#04342c] text-white'
                            : 'text-[#04342c] hover:bg-slate-100'
                        }`}
                      >
                        {isSelected ? 'Selected' : 'Filter'}
                      </button>
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
};
