import React, { useState, useRef, useMemo } from 'react';
import { DeliveryRecord } from '../types';
import {
  formatDateToYYYYMMDD,
  formatDisplayDateOnly,
  formatDisplayDateTime,
  computeDevelopmentReportSummary,
  DevReportSummaryItem,
} from '../services/storage';
import { TplLogo } from './TplLogo';
import {
  X,
  Share2,
  Download,
  Printer,
  CheckCircle2,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface DailyReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: DeliveryRecord[];
  customLogoSrc?: string;
  initialReportDate?: string;
}

/**
 * Direct HTML5 Canvas 2D Renderer for the Official Daily Report.
 * Guarantees 100% pixel-accurate export with:
 * - Whole design corporate double border in #04342c
 * - Company logo, company name, report title, date
 * - Development, delivered batch qty, delivery batch kg qty, pending batch qty, pending kg qty
 * - Total row
 */
export async function generateDirectReportCanvas(
  records: DeliveryRecord[],
  reportDate: string,
  customLogoSrc?: string
): Promise<HTMLCanvasElement> {
  const { items, totals } = computeDevelopmentReportSummary(records, reportDate);

  // Preload custom logo image if provided
  let customLogoImg: HTMLImageElement | null = null;
  if (customLogoSrc) {
    customLogoImg = await new Promise<HTMLImageElement | null>(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = customLogoSrc;
    });
  }

  const canvasWidth = 860;
  const headerHeight = 110;
  const tableHeaderHeight = 28;
  const tableRowHeight = 28;
  const totalRowHeight = 32;
  const rowsCount = Math.max(1, items.length);
  const tableHeight = tableHeaderHeight + rowsCount * tableRowHeight + (items.length > 0 ? totalRowHeight : 0);
  const bottomPadding = 60; // Generous bottom space so the border never overlaps the table
  const totalHeight = headerHeight + tableHeight + bottomPadding;

  const canvas = document.createElement('canvas');
  const scale = 2; // 2x Retina resolution
  canvas.width = canvasWidth * scale;
  canvas.height = totalHeight * scale;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.scale(scale, scale);

  // 1. Deep Green Abstract Modern Fluid Background
  const bgGrad = ctx.createLinearGradient(0, 0, canvasWidth, totalHeight);
  bgGrad.addColorStop(0, '#f9fdfb');
  bgGrad.addColorStop(0.5, '#ffffff');
  bgGrad.addColorStop(1, '#f1faf5');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, canvasWidth, totalHeight);

  // Modern Fluid Organic Waves (Deep Green & Emerald Curves)
  ctx.save();
  // Fluid Wave 1 - Top Right Deep Green Flow
  const fluidGrad1 = ctx.createLinearGradient(canvasWidth * 0.3, 0, canvasWidth, totalHeight * 0.45);
  fluidGrad1.addColorStop(0, 'rgba(4, 52, 44, 0.035)');
  fluidGrad1.addColorStop(0.5, 'rgba(5, 150, 105, 0.065)');
  fluidGrad1.addColorStop(1, 'rgba(16, 185, 129, 0.015)');
  ctx.fillStyle = fluidGrad1;
  ctx.beginPath();
  ctx.moveTo(canvasWidth * 0.3, 0);
  ctx.bezierCurveTo(canvasWidth * 0.5, 80, canvasWidth * 0.75, -20, canvasWidth, 110);
  ctx.lineTo(canvasWidth, 0);
  ctx.closePath();
  ctx.fill();

  // Fluid Wave 2 - Bottom Left Wave
  const fluidGrad2 = ctx.createLinearGradient(0, totalHeight * 0.55, canvasWidth * 0.65, totalHeight);
  fluidGrad2.addColorStop(0, 'rgba(4, 52, 44, 0.055)');
  fluidGrad2.addColorStop(0.6, 'rgba(5, 150, 105, 0.065)');
  fluidGrad2.addColorStop(1, 'rgba(16, 185, 129, 0.02)');
  ctx.fillStyle = fluidGrad2;
  ctx.beginPath();
  ctx.moveTo(0, totalHeight * 0.72);
  ctx.bezierCurveTo(canvasWidth * 0.25, totalHeight * 0.65, canvasWidth * 0.38, totalHeight * 0.96, canvasWidth * 0.72, totalHeight);
  ctx.lineTo(0, totalHeight);
  ctx.closePath();
  ctx.fill();

  // Fluid Contour Wave 3 - Soft Ambient Center Flow
  ctx.strokeStyle = 'rgba(4, 52, 44, 0.04)';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(canvasWidth * 0.05, totalHeight * 0.4);
  ctx.bezierCurveTo(canvasWidth * 0.35, totalHeight * 0.28, canvasWidth * 0.68, totalHeight * 0.56, canvasWidth * 0.95, totalHeight * 0.42);
  ctx.stroke();

  // Fluid Wave 4 - Subtle Floating Accent Sphere
  const fluidOrb = ctx.createRadialGradient(canvasWidth * 0.82, totalHeight * 0.68, 10, canvasWidth * 0.82, totalHeight * 0.68, 160);
  fluidOrb.addColorStop(0, 'rgba(16, 185, 129, 0.07)');
  fluidOrb.addColorStop(1, 'transparent');
  ctx.fillStyle = fluidOrb;
  ctx.beginPath();
  ctx.arc(canvasWidth * 0.82, totalHeight * 0.68, 160, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 1. Whole Design Border in #04342c (Outer 4px, Inner 1.5px with corner marks)
  ctx.strokeStyle = '#04342c';
  // Outer rectangle
  ctx.lineWidth = 4;
  ctx.strokeRect(14, 14, canvasWidth - 28, totalHeight - 28);
  // Inner rectangle
  ctx.lineWidth = 1.5;
  ctx.strokeRect(20, 20, canvasWidth - 40, totalHeight - 40);

  // 4 Corner Decorative Flourishes
  ctx.fillStyle = '#04342c';
  ctx.fillRect(20, 20, 10, 10);
  ctx.fillRect(canvasWidth - 30, 20, 10, 10);
  ctx.fillRect(20, totalHeight - 30, 10, 10);
  ctx.fillRect(canvasWidth - 30, totalHeight - 30, 10, 10);

  // 2. Company Full Logo at (38, 34)
  const rx = 38,
    ry = 34;

  if (customLogoImg) {
    // Draw custom uploaded logo preserving aspect ratio
    const maxLogoW = 220;
    const maxLogoH = 55;
    const aspect = customLogoImg.naturalWidth / (customLogoImg.naturalHeight || 1);
    let drawW = maxLogoW;
    let drawH = drawW / aspect;
    if (drawH > maxLogoH) {
      drawH = maxLogoH;
      drawW = drawH * aspect;
    }
    ctx.drawImage(customLogoImg, rx, ry + (maxLogoH - drawH) / 2, drawW, drawH);
  } else {
    // Placeholder [Company Logo] & [Company Name]
    const rw = 124, rh = 46;
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#04342c';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.setLineDash([]);

    ctx.fillStyle = '#475569';
    ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
    ctx.fillText('[Company Logo]', rx + 16, ry + 28);

    ctx.fillStyle = '#04342c';
    ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
    ctx.fillText('[Company Name]', rx + 140, ry + 32);
  }

  // Right Header: Exact Heading requested:
  // "Greige Delivery Status"
  // "Date"
  ctx.textAlign = 'right';
  ctx.fillStyle = '#04342c';
  ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
  ctx.fillText('Greige Delivery Status', canvasWidth - 38, 48);

  ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText(`Date: ${formatDisplayDateOnly(reportDate)}`, canvasWidth - 38, 70);

  ctx.textAlign = 'left';

  // Divider Line
  let currentY = 96;
  ctx.strokeStyle = '#04342c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(35, currentY);
  ctx.lineTo(canvasWidth - 35, currentY);
  ctx.stroke();

  currentY += 16;

  // 3. Main Data Table (5 columns: Dev, Del Batch, Del KG, Pend Batch, Pend KG)
  const colX = {
    dev: 42,
    delBatch: 320,
    delKg: 470,
    pendBatch: 630,
    pendKg: 790,
  };

  // Table Header Row
  ctx.fillStyle = '#04342c';
  ctx.fillRect(35, currentY, canvasWidth - 70, 26);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 9px system-ui, -apple-system, sans-serif';
  ctx.fillText('DEVELOPMENT', colX.dev, currentY + 17);

  ctx.textAlign = 'right';
  ctx.fillText('DELIVERED BATCH QTY', colX.delBatch, currentY + 17);
  ctx.fillText('DELIVERY KG QTY', colX.delKg, currentY + 17);
  ctx.fillText('PENDING BATCH QTY', colX.pendBatch, currentY + 17);
  ctx.fillText('PENDING KG QTY', colX.pendKg, currentY + 17);
  ctx.textAlign = 'left';

  currentY += 26;

  if (items.length === 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'italic 11px system-ui, -apple-system, sans-serif';
    ctx.fillText('No delivery or pending activity recorded for this date.', colX.dev, currentY + 20);
    currentY += 32;
  } else {
    items.forEach((item, idx) => {
      ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      ctx.fillRect(35, currentY, canvasWidth - 70, tableRowHeight);

      // Border line
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.strokeRect(35, currentY, canvasWidth - 70, tableRowHeight);

      ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#04342c';
      ctx.fillText(item.development, colX.dev, currentY + 18);

      ctx.textAlign = 'right';
      // Delivered Batch - BOLD
      ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = item.deliveredBatches > 0 ? '#04342c' : '#94a3b8';
      ctx.fillText(String(item.deliveredBatches), colX.delBatch, currentY + 18);

      // Delivered KG QTY as INTEGER - BOLD
      ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = item.deliveredKg > 0 ? '#04342c' : '#94a3b8';
      ctx.fillText(item.deliveredKg > 0 ? Math.round(item.deliveredKg).toLocaleString('en-US') : '-', colX.delKg, currentY + 18);

      // Pending Batch - BOLD
      ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = item.pendingBatches > 0 ? '#b45309' : '#94a3b8';
      ctx.fillText(String(item.pendingBatches), colX.pendBatch, currentY + 18);

      // Pending KG as INTEGER - BOLD
      ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = item.pendingKg > 0 ? '#b45309' : '#94a3b8';
      ctx.fillText(item.pendingKg > 0 ? Math.round(item.pendingKg).toLocaleString('en-US') : '-', colX.pendKg, currentY + 18);

      ctx.textAlign = 'left';
      currentY += tableRowHeight;
    });

    // 4. TOTAL ROW (Kept, but without total KG column)
    ctx.fillStyle = '#f0fdf4';
    ctx.fillRect(35, currentY, canvasWidth - 70, 32);
    ctx.strokeStyle = '#04342c';
    ctx.lineWidth = 2;
    ctx.strokeRect(35, currentY, canvasWidth - 70, 32);

    ctx.fillStyle = '#04342c';
    ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
    ctx.fillText('TOTAL', colX.dev, currentY + 20);

    ctx.textAlign = 'right';
    ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
    ctx.fillText(String(totals.deliveredBatches), colX.delBatch, currentY + 20);
    ctx.fillText(`${Math.round(totals.deliveredKg).toLocaleString('en-US')} KG`, colX.delKg, currentY + 20);

    ctx.fillStyle = '#b45309';
    ctx.fillText(String(totals.pendingBatches), colX.pendBatch, currentY + 20);
    ctx.fillText(`${Math.round(totals.pendingKg).toLocaleString('en-US')} KG`, colX.pendKg, currentY + 20);
    ctx.textAlign = 'left';

    currentY += 32;
  }

  return canvas;
}

export const DailyReportModal: React.FC<DailyReportModalProps> = ({
  isOpen,
  onClose,
  records,
  customLogoSrc,
  initialReportDate,
}) => {
  const [reportDate, setReportDate] = useState<string>(
    () => initialReportDate || formatDateToYYYYMMDD(new Date())
  );

  React.useEffect(() => {
    if (isOpen && initialReportDate) {
      setReportDate(initialReportDate);
    }
  }, [isOpen, initialReportDate]);

  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  // Compute Development Summary Data for the Selected Report Date
  const { items: devSummaryItems, totals: devSummaryTotals } = useMemo(() => {
    return computeDevelopmentReportSummary(records, reportDate);
  }, [records, reportDate]);

  if (!isOpen) return null;

  // Generate PNG image using direct canvas rendering with full logo
  const generateReportImageBlob = async (): Promise<Blob | null> => {
    const canvas = await generateDirectReportCanvas(records, reportDate, customLogoSrc);
    return new Promise(resolve => {
      canvas.toBlob(blob => {
        resolve(blob);
      }, 'image/png');
    });
  };

  // Download PNG file
  const handleDownloadImage = async () => {
    setIsExporting(true);
    setExportSuccess(null);

    try {
      const blob = await generateReportImageBlob();
      if (!blob) {
        window.print();
        setIsExporting(false);
        return;
      }

      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Daily_Report_${reportDate}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      setExportSuccess(`Report downloaded: Daily_Report_${reportDate}.png`);
      setTimeout(() => setExportSuccess(null), 3500);
    } catch (err) {
      console.error('Export error:', err);
      window.print();
    } finally {
      setIsExporting(false);
    }
  };

  // Native Web Share API
  const handleShare = async () => {
    setIsExporting(true);
    setExportSuccess(null);

    try {
      const blob = await generateReportImageBlob();
      if (!blob) {
        throw new Error('Could not generate report image');
      }

      const file = new File([blob], `Daily_Report_${reportDate}.png`, { type: 'image/png' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `[Company Name] Greige Delivery Status - ${formatDisplayDateOnly(reportDate)}`,
          text: `[Company Name] Greige Delivery Status for ${formatDisplayDateOnly(reportDate)}`,
          files: [file],
        });
        setExportSuccess('Report shared successfully.');
      } else {
        await handleDownloadImage();
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Share error:', err);
        await handleDownloadImage();
      }
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden my-4 flex flex-col max-h-[95vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Controls Toolbar */}
        <div className="bg-[#04342c] text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold tracking-wide">[Company Name] Daily Report</h2>
            <div className="flex items-center gap-1.5 bg-white/15 px-2.5 py-1 rounded text-xs border border-white/20">
              <Calendar className="w-3.5 h-3.5 text-emerald-300" />
              <input
                type="date"
                value={reportDate}
                onChange={e => e.target.value && setReportDate(e.target.value)}
                className="bg-transparent text-white font-medium focus:outline-hidden text-xs cursor-pointer"
                title="Select Report Date"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white text-[#04342c] hover:bg-emerald-50 text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </button>

            <button
              onClick={handleDownloadImage}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PNG</span>
            </button>

            <button
              onClick={() => window.print()}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>

            <button
              onClick={onClose}
              className="text-white/70 hover:text-white rounded-md p-1 transition-colors ml-2 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {exportSuccess && (
          <div className="px-5 py-2 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{exportSuccess}</span>
          </div>
        )}

        {/* Report Preview Body (Deep Green Abstract Modern Fluid Background, Whole Design Border in #04342c) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-950/20 via-slate-100 to-slate-200 flex justify-center items-start">
          <div
            ref={reportRef}
            className="w-full max-w-[840px] p-6 sm:p-8 text-slate-800 shadow-xl relative min-h-fit mb-6 overflow-hidden"
            style={{
              border: '6px double #04342c', // Whole design corporate double border in #04342c
              background: 'radial-gradient(circle at 12% 15%, rgba(4, 52, 44, 0.05) 0%, transparent 45%), radial-gradient(circle at 88% 85%, rgba(16, 185, 129, 0.07) 0%, transparent 50%), radial-gradient(circle at 50% 50%, rgba(5, 150, 105, 0.03) 0%, transparent 60%), #ffffff',
            }}
          >
            {/* Abstract Modern Fluid Background SVG Layer */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-50 z-0">
              <svg className="w-full h-full" viewBox="0 0 840 600" preserveAspectRatio="none" fill="none">
                <path
                  d="M0,70 C240,150 480,10 840,90 L840,0 L0,0 Z"
                  fill="url(#fluid_grad_top)"
                />
                <path
                  d="M0,460 C300,390 540,540 840,470 L840,600 L0,600 Z"
                  fill="url(#fluid_grad_bottom)"
                />
                <defs>
                  <linearGradient id="fluid_grad_top" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#04342c" stopOpacity="0.08" />
                    <stop offset="60%" stopColor="#059669" stopOpacity="0.04" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.01" />
                  </linearGradient>
                  <linearGradient id="fluid_grad_bottom" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.02" />
                    <stop offset="40%" stopColor="#04342c" stopOpacity="0.07" />
                    <stop offset="100%" stopColor="#064e3b" stopOpacity="0.05" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            {/* 4 Corner Ornaments */}
            <div className="absolute top-1 left-1 w-2.5 h-2.5 bg-[#04342c] z-10"></div>
            <div className="absolute top-1 right-1 w-2.5 h-2.5 bg-[#04342c] z-10"></div>
            <div className="absolute bottom-1 left-1 w-2.5 h-2.5 bg-[#04342c] z-10"></div>
            <div className="absolute bottom-1 right-1 w-2.5 h-2.5 bg-[#04342c] z-10"></div>

            {/* Header: Company Full Logo or Placeholder on left, Heading on right */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b-2 border-[#04342c] gap-4 relative z-10">
              <div className="flex items-center gap-3">
                {customLogoSrc ? (
                  <img
                    src={customLogoSrc}
                    alt="Company Logo"
                    className="h-14 max-w-[220px] object-contain"
                  />
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="px-3 py-2 border-2 border-dashed border-[#04342c]/40 rounded bg-slate-50 text-slate-600 text-xs font-bold font-mono tracking-wider">
                      [Company Logo]
                    </div>
                    <span className="text-xl font-black text-[#04342c] uppercase tracking-wide">
                      [Company Name]
                    </span>
                  </div>
                )}
              </div>
              <div className="text-right">
                <h1 className="text-lg sm:text-xl font-black uppercase text-[#04342c] tracking-wider">
                  Greige Delivery Status
                </h1>
                <div className="text-xs sm:text-sm font-bold text-slate-700 mt-1">
                  Date: <span className="text-[#04342c] font-mono">{formatDisplayDateOnly(reportDate)}</span>
                </div>
              </div>
            </div>

            {/* Main Centerpiece Data Table */}
            <div className="my-6 pb-2 relative z-10">
              <div className="overflow-x-auto border border-[#04342c] rounded-xs shadow-2xs bg-white/95 backdrop-blur-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#04342c] text-white uppercase text-[13px] font-black tracking-wide">
                    <tr>
                      <th className="py-2.5 px-3 font-black">Development</th>
                      <th className="py-2.5 px-3 text-center font-black">Delivered Batch Qty</th>
                      <th className="py-2.5 px-3 text-right font-black">Delivery KG Qty</th>
                      <th className="py-2.5 px-3 text-center font-black">Pending Batch Qty</th>
                      <th className="py-2.5 px-3 text-right font-black">Pending KG Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {devSummaryItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-400 italic">
                          No delivery or pending activity recorded for this date.
                        </td>
                      </tr>
                    ) : (
                      devSummaryItems.map((item, idx) => (
                        <tr
                          key={item.development}
                          className={`hover:bg-emerald-50/40 transition-colors ${
                            idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'
                          }`}
                        >
                          <td className="py-2.5 px-3 font-bold text-[#04342c]">
                            {item.development}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-black text-slate-900 text-[13px]">
                            {item.deliveredBatches > 0 ? item.deliveredBatches : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-black text-[#04342c] text-[13px]">
                            {item.deliveredKg > 0
                              ? Math.round(item.deliveredKg).toLocaleString('en-US')
                              : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-black text-amber-900 text-[13px]">
                            {item.pendingBatches > 0 ? item.pendingBatches : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-black text-amber-900 text-[13px]">
                            {item.pendingKg > 0
                              ? Math.round(item.pendingKg).toLocaleString('en-US')
                              : '-'}
                          </td>
                        </tr>
                      ))
                    )}

                    {/* TOTAL ROW (All bold quantities, generous height) */}
                    <tr className="bg-emerald-50 font-black border-t-2 border-[#04342c] text-slate-900 text-xs">
                      <td className="py-3 px-3 uppercase text-[12px] text-[#04342c] font-black">
                        TOTAL:
                      </td>
                      <td className="py-3 px-3 text-center font-mono font-black text-[#04342c] text-[13px]">
                        {devSummaryTotals.deliveredBatches}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-black text-[#04342c] text-[13px]">
                        {Math.round(devSummaryTotals.deliveredKg).toLocaleString('en-US')} KG
                      </td>
                      <td className="py-3 px-3 text-center font-mono font-black text-amber-900 text-[13px]">
                        {devSummaryTotals.pendingBatches}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-black text-amber-900 text-[13px]">
                        {Math.round(devSummaryTotals.pendingKg).toLocaleString('en-US')} KG
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
