import React, { useMemo } from 'react';
import { DeliveryRecord } from '../types';
import { AlertTriangle, CheckCircle, Clock, AlertCircle, TrendingDown, Eye } from 'lucide-react';

interface ExceptionAlertsProps {
  records: DeliveryRecord[];
  onSelectRecordForInspection?: (batch: string) => void;
  dateFilterLabel?: string;
}

interface OperationalException {
  id: string;
  type: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  recordBatch?: string;
  recordDevelopment?: string;
  ageDays?: number;
  metricValue?: string;
}

export const ExceptionAlerts: React.FC<ExceptionAlertsProps> = ({
  records,
  onSelectRecordForInspection,
  dateFilterLabel,
}) => {
  const today = useMemo(() => new Date(), []);

  // Compute Completion KPIs safely with zero-denominator guards
  const completionStats = useMemo(() => {
    let totalKg = 0;
    let deliveredKg = 0;
    let pendingKg = 0;

    let totalBatches = records.length;
    let deliveredBatches = 0;
    let pendingBatches = 0;

    records.forEach(r => {
      const kg = r.kgQty || 0;
      totalKg += kg;

      if (r.status === 'Delivered') {
        deliveredKg += kg;
        deliveredBatches += 1;
      } else {
        pendingKg += kg;
        pendingBatches += 1;
      }
    });

    // Quantity Completion Rate
    const quantityCompletionRate =
      totalKg > 0 ? Number(((deliveredKg / totalKg) * 100).toFixed(1)) : 0;

    // Batch Count Completion Rate
    const batchCompletionRate =
      totalBatches > 0 ? Number(((deliveredBatches / totalBatches) * 100).toFixed(1)) : 0;

    return {
      totalKg: Number(totalKg.toFixed(2)),
      deliveredKg: Number(deliveredKg.toFixed(2)),
      pendingKg: Number(pendingKg.toFixed(2)),
      totalBatches,
      deliveredBatches,
      pendingBatches,
      quantityCompletionRate,
      batchCompletionRate,
    };
  }, [records]);

  // Traceable operational exceptions
  const exceptions = useMemo(() => {
    const list: OperationalException[] = [];

    // 1. Check for Pending Batches that are older than 7 days (Aging Pending Greige)
    records.forEach(r => {
      if (r.status === 'Pending') {
        const dateStr = (r.receivedAt || r.createdAt || '').split(' ')[0];
        const itemDate = new Date(dateStr);
        const ageDays = Math.max(0, Math.floor((today.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24)));

        if (ageDays >= 14) {
          list.push({
            id: `crit-age-${r.id}`,
            type: 'critical',
            title: `Severe Aging Greige Stock (Age: ${ageDays} days)`,
            message: `Batch ${r.batch} (${r.development}) received on ${dateStr} has remained un-dispatched for ${ageDays} days.`,
            recordBatch: r.batch,
            recordDevelopment: r.development,
            ageDays,
            metricValue: `${r.rollQty} Rolls · ${r.kgQty} KG`,
          });
        } else if (ageDays >= 7) {
          list.push({
            id: `warn-age-${r.id}`,
            type: 'warning',
            title: `Delayed Pending Greige (Age: ${ageDays} days)`,
            message: `Batch ${r.batch} (${r.development}) is approaching delivery lead-time threshold (pending > 7 days).`,
            recordBatch: r.batch,
            recordDevelopment: r.development,
            ageDays,
            metricValue: `${r.rollQty} Rolls · ${r.kgQty} KG`,
          });
        }
      }
    });

    // 2. Check for Sample Orders awaiting urgent processing
    const pendingSamples = records.filter(r => r.orderType === 'Sample' && r.status === 'Pending');
    if (pendingSamples.length > 0) {
      list.push({
        id: 'warn-sample-pending',
        type: 'warning',
        title: `${pendingSamples.length} Sample Development(s) Awaiting Dispatch`,
        message: `Sample trial lots require rapid customer evaluation turnaround. Currently pending: ${pendingSamples.map(s => s.batch).join(', ')}.`,
        metricValue: `${pendingSamples.reduce((s, i) => s + i.kgQty, 0).toFixed(1)} KG`,
      });
    }

    // 3. Overall Completion Rate Check
    if (completionStats.totalKg > 0 && completionStats.quantityCompletionRate < 50) {
      list.push({
        id: 'info-completion-rate',
        type: 'info',
        title: 'Dispatch Completion Rate Below 50%',
        message: `Current delivery throughput is ${completionStats.quantityCompletionRate}%. ${completionStats.pendingKg} KG of greige inventory remains in warehouse staging.`,
        metricValue: `${completionStats.pendingBatches} Pending Batches`,
      });
    }

    // Sort: critical first, then warning, then info
    const priority = { critical: 1, warning: 2, info: 3 };
    list.sort((a, b) => priority[a.type] - priority[b.type]);

    return list;
  }, [records, today, completionStats]);

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-2xs space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-2">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#04342c]" />
            <h2 className="text-sm font-bold text-[#04342c] uppercase tracking-wider">
              Completion KPI & Operational Exception Alerts
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Throughput fulfillment tracking and traceable inventory exception alerts {dateFilterLabel ? `(${dateFilterLabel})` : ''}
          </p>
        </div>
        <div className="text-xs font-semibold text-slate-500">
          Scope: <span className="text-[#04342c]">{records.length} Total Records</span>
        </div>
      </div>

      {/* Completion KPIs Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Quantity Completion Rate */}
        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Quantity Completion Rate
          </div>
          <div className="text-2xl font-black text-[#04342c] mt-1">
            {completionStats.quantityCompletionRate}%
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {completionStats.deliveredKg} / {completionStats.totalKg} KG Delivered
          </div>
          <div className="h-1.5 w-full bg-slate-200 rounded-full mt-2 overflow-hidden">
            <div
              className="h-full bg-[#04342c] rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, completionStats.quantityCompletionRate)}%` }}
            ></div>
          </div>
        </div>

        {/* Batch Count Completion Rate */}
        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Batch Fulfillment Rate
          </div>
          <div className="text-2xl font-black text-slate-800 mt-1">
            {completionStats.batchCompletionRate}%
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {completionStats.deliveredBatches} / {completionStats.totalBatches} Batches Closed
          </div>
          <div className="h-1.5 w-full bg-slate-200 rounded-full mt-2 overflow-hidden">
            <div
              className="h-full bg-emerald-600 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, completionStats.batchCompletionRate)}%` }}
            ></div>
          </div>
        </div>

        {/* Pending Volume in Staging */}
        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
          <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
            Greige Pending Issue
          </div>
          <div className="text-2xl font-black text-amber-800 mt-1">
            {completionStats.pendingKg} <span className="text-xs font-semibold text-slate-500">KG</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {completionStats.pendingBatches} Batches in Staging
          </div>
        </div>

        {/* Operational Health Badge */}
        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Operational Health
          </div>
          <div className="text-xl font-bold mt-1 flex items-center gap-1.5">
            {exceptions.filter(e => e.type === 'critical').length === 0 ? (
              <>
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                <span className="text-emerald-800">Healthy</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-5 h-5 text-red-600" />
                <span className="text-red-700">Attention Required</span>
              </>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {exceptions.length} Active System Alert(s)
          </div>
        </div>
      </div>

      {/* Traceable Operational Exceptions List */}
      <div className="space-y-3 pt-2">
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          Active Traceable Alerts ({exceptions.length})
        </h3>

        {exceptions.length === 0 ? (
          <div className="p-6 bg-emerald-50/50 border border-emerald-200 rounded-lg text-center text-xs text-emerald-800 font-medium">
            <CheckCircle className="w-6 h-6 text-emerald-600 mx-auto mb-1.5" />
            No operational exceptions detected. All batches are within approved aging and delivery lead times.
          </div>
        ) : (
          <div className="space-y-2.5">
            {exceptions.map(exc => {
              const borderColors = {
                critical: 'border-red-300 bg-red-50/70 text-red-900',
                warning: 'border-amber-300 bg-amber-50/70 text-amber-900',
                info: 'border-blue-300 bg-blue-50/70 text-blue-900',
              };

              const iconColors = {
                critical: <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />,
                warning: <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />,
                info: <Clock className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />,
              };

              return (
                <div
                  key={exc.id}
                  className={`p-3.5 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${borderColors[exc.type]}`}
                >
                  <div className="flex items-start gap-2.5">
                    {iconColors[exc.type]}
                    <div>
                      <div className="font-bold flex items-center gap-2">
                        <span>{exc.title}</span>
                        {exc.recordBatch && (
                          <span className="font-mono text-[11px] px-1.5 py-0.2 rounded bg-white border border-slate-300 font-bold">
                            {exc.recordBatch}
                          </span>
                        )}
                      </div>
                      <p className="text-slate-600 mt-0.5 leading-relaxed">
                        {exc.message}
                      </p>
                    </div>
                  </div>

                  {/* Metric & Inspection Action */}
                  <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                    {exc.metricValue && (
                      <span className="font-bold text-slate-800 bg-white/80 px-2 py-1 rounded border border-slate-200 text-[11px]">
                        {exc.metricValue}
                      </span>
                    )}

                    {exc.recordBatch && onSelectRecordForInspection && (
                      <button
                        onClick={() => onSelectRecordForInspection(exc.recordBatch!)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#04342c] text-white text-[11px] font-semibold hover:bg-[#032620] transition-colors"
                        title="Filter database by this batch"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Inspect</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
