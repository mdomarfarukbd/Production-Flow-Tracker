import React, { useMemo } from 'react';
import { Package } from 'lucide-react';
import { formatWeightDisplay } from './PublicDashboard';

export interface PieChartSliceItem {
  id: string;
  label: string;
  value: number; // in KG
  pctOfTotal: number;
  sublabel?: string; // e.g. "8 batches"
  color: string;
}

interface SvgPieChartProps {
  title: string;
  icon: React.ReactNode;
  totalKg: number;
  totalLabel?: string;
  centerTopText: string;
  items: PieChartSliceItem[];
  selectedId: string;
  onSelectId: (id: string) => void;
  emptyMessage?: string;
  onClearFilter?: () => void;
  clearButtonLabel?: string;
}

export const SvgPieChart: React.FC<SvgPieChartProps> = ({
  title,
  icon,
  totalKg,
  totalLabel = 'Total',
  centerTopText,
  items,
  selectedId,
  onSelectId,
  emptyMessage = 'No data recorded for this period.',
  onClearFilter,
  clearButtonLabel = 'Clear Filter',
}) => {
  // Trigonometry calculations for slices, arc paths, and leader lines
  const pieSlices = useMemo(() => {
    const total = totalKg || 1;
    let currentAngle = -Math.PI / 2; // 12 o'clock (-90 deg)

    return items.map(item => {
      const fraction = item.value / total;
      const angle = fraction * 2 * Math.PI;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      const midAngle = currentAngle + angle / 2;
      currentAngle = endAngle;

      return {
        ...item,
        fraction,
        startAngle,
        endAngle,
        midAngle,
      };
    });
  }, [items, totalKg]);

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-2xs p-3.5 sm:p-4 flex flex-col justify-between h-full">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {icon}
            <h3 className="text-xs font-bold text-[#04342c] uppercase tracking-wider truncate">
              {title}
            </h3>
          </div>
          <span className="text-[10.5px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/80 shrink-0">
            {formatWeightDisplay(totalKg, true)} {totalLabel}
          </span>
        </div>

        {items.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center text-slate-400">
            <Package className="w-8 h-8 text-slate-300 mb-1" />
            <p className="text-xs font-medium">{emptyMessage}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            {/* SVG Pie Chart with Leader Lines & Indexlabels */}
            <div className="w-full max-w-[380px] h-[190px] relative select-none">
              <svg
                viewBox="0 0 380 190"
                className="w-full h-full overflow-visible"
              >
                {pieSlices.length === 1 ? (
                  <g
                    className="cursor-pointer"
                    onClick={() => onSelectId(selectedId === pieSlices[0].id ? '' : pieSlices[0].id)}
                  >
                    <circle
                      cx="190"
                      cy="95"
                      r="56"
                      fill={pieSlices[0].color}
                      className="transition-transform hover:opacity-95"
                    />
                    <circle cx="190" cy="95" r="22" fill="#ffffff" />
                    {/* Indexlabel */}
                    <line x1="246" y1="95" x2="275" y2="95" stroke="#94a3b8" strokeWidth="1.2" />
                    <text x="280" y="98" className="text-[10px] font-bold fill-slate-800">
                      <tspan fill={pieSlices[0].color}>{pieSlices[0].label}</tspan> 100%
                    </text>
                  </g>
                ) : (
                  pieSlices.map(slice => {
                    const cx = 190;
                    const cy = 95;
                    const R = 56;
                    const r = 22; // subtle donut inner radius

                    const isSelected = selectedId === slice.id;
                    const currentR = isSelected ? R + 4 : R;

                    const x1 = cx + currentR * Math.cos(slice.startAngle);
                    const y1 = cy + currentR * Math.sin(slice.startAngle);
                    const x2 = cx + currentR * Math.cos(slice.endAngle);
                    const y2 = cy + currentR * Math.sin(slice.endAngle);

                    const xi1 = cx + r * Math.cos(slice.startAngle);
                    const yi1 = cy + r * Math.sin(slice.startAngle);
                    const xi2 = cx + r * Math.cos(slice.endAngle);
                    const yi2 = cy + r * Math.sin(slice.endAngle);

                    const largeArcFlag = slice.endAngle - slice.startAngle > Math.PI ? 1 : 0;
                    const pathData = `M ${x1} ${y1} A ${currentR} ${currentR} 0 ${largeArcFlag} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${r} ${r} 0 ${largeArcFlag} 0 ${xi1} ${yi1} Z`;

                    // Indexlabel Leader Line calculations
                    const lx1 = cx + (currentR + 2) * Math.cos(slice.midAngle);
                    const ly1 = cy + (currentR + 2) * Math.sin(slice.midAngle);
                    const lx2 = cx + (currentR + 18) * Math.cos(slice.midAngle);
                    const ly2 = cy + (currentR + 18) * Math.sin(slice.midAngle);
                    const isRight = Math.cos(slice.midAngle) >= 0;
                    const lx3 = isRight ? Math.min(lx2 + 18, 360) : Math.max(lx2 - 18, 20);
                    const ly3 = ly2;

                    return (
                      <g key={slice.id} className="group cursor-pointer">
                        {/* Slice Path */}
                        <path
                          d={pathData}
                          fill={slice.color}
                          stroke="#ffffff"
                          strokeWidth={isSelected ? '2.5' : '1.5'}
                          className="transition-all duration-200 group-hover:opacity-90"
                          onClick={() => onSelectId(isSelected ? '' : slice.id)}
                        >
                          <title>{`${slice.label}: ${formatWeightDisplay(slice.value, true)} (${slice.pctOfTotal}%)`}</title>
                        </path>

                        {/* Leader Line for Indexlabel */}
                        <polyline
                          points={`${lx1},${ly1} ${lx2},${ly2} ${lx3},${ly3}`}
                          fill="none"
                          stroke={isSelected ? '#04342c' : '#94a3b8'}
                          strokeWidth={isSelected ? '1.8' : '1.2'}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />

                        {/* Outer Indexlabel Text */}
                        <text
                          x={isRight ? lx3 + 3 : lx3 - 3}
                          y={ly3 + 3.5}
                          textAnchor={isRight ? 'start' : 'end'}
                          className={`text-[9.5px] font-bold select-none transition-colors ${
                            isSelected ? 'fill-[#04342c] font-black' : 'fill-slate-700'
                          }`}
                          onClick={() => onSelectId(isSelected ? '' : slice.id)}
                        >
                          <tspan fill={slice.color} fontWeight="bold">
                            {slice.label.length > 12 ? slice.label.slice(0, 11) + '…' : slice.label}
                          </tspan>{' '}
                          {slice.pctOfTotal}%
                        </text>
                      </g>
                    );
                  })
                )}

                {/* Donut Center Display */}
                <circle cx="190" cy="95" r="21" fill="#ffffff" />
                <text
                  x="190"
                  y="93"
                  textAnchor="middle"
                  className="text-[8.5px] font-bold fill-slate-400 uppercase tracking-wider"
                >
                  {centerTopText}
                </text>
                <text
                  x="190"
                  y="103"
                  textAnchor="middle"
                  className="text-[9px] font-black fill-[#04342c] font-mono"
                >
                  {formatWeightDisplay(totalKg, false)}
                </text>
              </svg>
            </div>

            {/* Indexlabel Data Legend Table */}
            <div className="w-full mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
              {pieSlices.map(slice => {
                const isSelected = selectedId === slice.id;
                return (
                  <div
                    key={slice.id}
                    onClick={() => onSelectId(isSelected ? '' : slice.id)}
                    className={`px-2 py-1.5 rounded border transition-all cursor-pointer flex items-center justify-between gap-1.5 ${
                      isSelected
                        ? 'border-[#04342c] bg-emerald-50/80 ring-1 ring-[#04342c]'
                        : 'border-slate-100 bg-slate-50/70 hover:bg-emerald-50/30'
                    }`}
                    title={`Click to filter by ${slice.label}`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                        style={{ backgroundColor: slice.color }}
                      />
                      <span className="font-mono font-bold text-slate-900 text-[11px] truncate">
                        {slice.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 text-[10.5px]">
                      <span className="font-mono font-bold text-[#04342c]">
                        {formatWeightDisplay(slice.value, true)}
                      </span>
                      <span className="font-black text-slate-500 font-mono">
                        {slice.pctOfTotal}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {selectedId && onClearFilter && (
        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-end text-[10.5px]">
          <button
            type="button"
            onClick={onClearFilter}
            className="text-[#04342c] font-bold hover:underline cursor-pointer"
          >
            {clearButtonLabel}
          </button>
        </div>
      )}
    </div>
  );
};
