import * as XLSX from 'xlsx';
import { DeliveryRecord, AdminExportType, DateFilter } from '../types';
import { formatDisplayDateTime, formatDisplayDateOnly } from './storage';

/**
 * Generates and downloads an Excel file based on selected export type.
 * Ensures numeric quantities are preserved as numbers.
 */
export function exportToExcel(
  records: DeliveryRecord[],
  exportType: AdminExportType,
  dateFilter?: DateFilter
): void {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  let filename = `TPL_Greige_${exportType}_${todayStr}.xlsx`;
  let dataRows: Record<string, any>[] = [];

  const mapRecord = (r: DeliveryRecord) => ({
    'SL': r.sl || '',
    'Type': r.orderType,
    'Dev Code': r.development,
    'Batch': r.batch,
    'Rolls': Number(r.rollQty),
    'KG': Number(r.kgQty),
    'Priority': r.priority || 'Regular',
    'Color / Shade': r.color || '-',
    'Remarks': r.remarks || '-',
    'Received At': r.receivedAt || r.createdAt,
    'Received By': r.receivedBy || 'Admin',
    'Status': r.status,
    'Delivered At': r.deliveredAt || '-',
    'Delivered By': r.deliveredBy || '-',
  });

  switch (exportType) {
    case 'all': {
      filename = `TPL_Greige_All_Records_${todayStr}.xlsx`;
      dataRows = records.map(mapRecord);
      break;
    }

    case 'previous-day': {
      filename = `TPL_Greige_Previous_Day_${yesterdayStr}.xlsx`;
      const prevRecords = records.filter(r => (r.receivedAt || r.createdAt || '').split(' ')[0].split('T')[0] === yesterdayStr);
      dataRows = prevRecords.map(mapRecord);
      break;
    }

    case 'selected-date': {
      const targetStart = dateFilter?.startDate || todayStr;
      const targetEnd = dateFilter?.endDate || todayStr;
      filename = `TPL_Greige_Delivery_${targetStart}_to_${targetEnd}.xlsx`;
      const filtered = records.filter(r => {
        const d = (r.receivedAt || r.createdAt || '').split(' ')[0].split('T')[0];
        return d >= targetStart && d <= targetEnd;
      });
      dataRows = filtered.map(mapRecord);
      break;
    }

    case 'pending': {
      filename = `TPL_Greige_Pending_Quantities_${todayStr}.xlsx`;
      const pendingRecords = records.filter(r => r.status === 'Pending');
      dataRows = pendingRecords.map(r => {
        const recDate = new Date((r.receivedAt || r.createdAt || '').split(' ')[0]);
        const ageDays = Math.max(0, Math.floor((today.getTime() - recDate.getTime()) / (1000 * 60 * 60 * 24)));
        return {
          ...mapRecord(r),
          'Age (Days)': isNaN(ageDays) ? 0 : ageDays,
        };
      });
      break;
    }

    case 'aging': {
      filename = `TPL_Greige_Aging_Report_${todayStr}.xlsx`;
      const pendingItems = records.filter(r => r.status === 'Pending');
      dataRows = pendingItems.map(r => {
        const recDate = new Date((r.receivedAt || r.createdAt || '').split(' ')[0]);
        const ageDays = Math.max(0, Math.floor((today.getTime() - recDate.getTime()) / (1000 * 60 * 60 * 24)));
        let bracket = '0 - 3 Days';
        if (ageDays >= 15) bracket = '15+ Days (Critical)';
        else if (ageDays >= 8) bracket = '8 - 14 Days (Delayed)';
        else if (ageDays >= 4) bracket = '4 - 7 Days (Moderate)';

        return {
          'Receipt Date': (r.receivedAt || r.createdAt || '').split(' ')[0],
          'Batch': r.batch,
          'Dev Code': r.development,
          'Color': r.color || '-',
          'Order Type': r.orderType,
          'Roll Qty': Number(r.rollQty),
          'KG Qty': Number(r.kgQty),
          'Age (Days)': isNaN(ageDays) ? 0 : ageDays,
          'Aging Bracket': bracket,
          'Remarks': r.remarks || '',
        };
      });
      dataRows.sort((a, b) => b['Age (Days)'] - a['Age (Days)']);
      break;
    }

    case 'development-wise': {
      filename = `TPL_Greige_Development_Summary_${todayStr}.xlsx`;
      const map: Record<string, { dev: string; rolls: number; kg: number; batches: Set<string>; bulkKg: number; sampleKg: number; deliveredKg: number; pendingKg: number }> = {};

      records.forEach(r => {
        const dev = r.development;
        if (!map[dev]) {
          map[dev] = { dev, rolls: 0, kg: 0, batches: new Set(), bulkKg: 0, sampleKg: 0, deliveredKg: 0, pendingKg: 0 };
        }
        map[dev].rolls += Number(r.rollQty) || 0;
        map[dev].kg += Number(r.kgQty) || 0;
        map[dev].batches.add(r.batch);
        if (r.orderType === 'Bulk') map[dev].bulkKg += Number(r.kgQty) || 0;
        else map[dev].sampleKg += Number(r.kgQty) || 0;

        if (r.status === 'Delivered') map[dev].deliveredKg += Number(r.kgQty) || 0;
        else map[dev].pendingKg += Number(r.kgQty) || 0;
      });

      dataRows = Object.values(map).map(item => ({
        'Development Code': item.dev,
        'Total Batches': item.batches.size,
        'Total Rolls': item.rolls,
        'Total KG': Number(item.kg.toFixed(2)),
        'Delivered KG': Number(item.deliveredKg.toFixed(2)),
        'Pending KG': Number(item.pendingKg.toFixed(2)),
        'Bulk KG': Number(item.bulkKg.toFixed(2)),
        'Sample KG': Number(item.sampleKg.toFixed(2)),
      }));
      dataRows.sort((a, b) => b['Total KG'] - a['Total KG']);
      break;
    }

    case 'batch-wise': {
      filename = `TPL_Greige_Batch_Details_${todayStr}.xlsx`;
      dataRows = records.map(mapRecord);
      dataRows.sort((a, b) => a['Batch'].localeCompare(b['Batch']));
      break;
    }

    case 'receiving-delivery-summary': {
      filename = `TPL_Greige_Daily_Summary_${todayStr}.xlsx`;
      const dateMap: Record<string, { date: string; recRolls: number; recKg: number; delRolls: number; delKg: number }> = {};

      records.forEach(r => {
        const d = (r.receivedAt || r.createdAt || '').split(' ')[0].split('T')[0];
        if (!dateMap[d]) {
          dateMap[d] = { date: d, recRolls: 0, recKg: 0, delRolls: 0, delKg: 0 };
        }
        dateMap[d].recRolls += Number(r.rollQty) || 0;
        dateMap[d].recKg += Number(r.kgQty) || 0;
        if (r.status === 'Delivered') {
          dateMap[d].delRolls += Number(r.rollQty) || 0;
          dateMap[d].delKg += Number(r.kgQty) || 0;
        }
      });

      dataRows = Object.values(dateMap).map(item => ({
        'Date': formatDisplayDateOnly(item.date),
        'Received Rolls': item.recRolls,
        'Received KG': Number(item.recKg.toFixed(2)),
        'Delivered Rolls': item.delRolls,
        'Delivered KG': Number(item.delKg.toFixed(2)),
        'Net Remaining KG': Number((item.recKg - item.delKg).toFixed(2)),
      }));
      dataRows.sort((a, b) => b['Date'].localeCompare(a['Date']));
      break;
    }
  }

  const worksheet = XLSX.utils.json_to_sheet(dataRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'TPL Greige Data');

  XLSX.writeFile(workbook, filename);
}
