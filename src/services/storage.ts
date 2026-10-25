import { DeliveryRecord, AppSettings, UserAccount, DeliverySummaryStats, ManpowerActivity } from '../types';
import { parseSqlDump, normalizeBatchKey } from './sqlParser';
import { DEMO_RECORDS } from '../constants/demoRecords';

const STORAGE_KEY_RECORDS = 'tpl_greige_delivery_records_v4';
const STORAGE_KEY_SETTINGS = 'tpl_greige_app_settings_v3';
const STORAGE_KEY_USERS = 'tpl_greige_users_v3';
const STORAGE_KEY_MANPOWER = 'tpl_greige_manpower_activities_v1';

// Helper to format Date to YYYY-MM-DD in local timezone
export function formatDateToYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to format Date to YYYY-MM-DDTHH:mm for datetime-local input
export function formatDateToLocalISO(date: Date): string {
  const yyyyMmDd = formatDateToYYYYMMDD(date);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${yyyyMmDd}T${hours}:${minutes}`;
}

// Helper to format Date to YYYY-MM-DD HH:mm:ss without timezone shifts
export function formatCurrentDateTime(date = new Date()): string {
  const yyyyMmDd = formatDateToYYYYMMDD(date);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${yyyyMmDd} ${hours}:${minutes}:${seconds}`;
}

// Compute default 7-day range including today (today - 6 days through today)
export function getDefault7DayRange(): { startDate: string; endDate: string } {
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 6);

  return {
    startDate: formatDateToYYYYMMDD(sevenDaysAgo),
    endDate: formatDateToYYYYMMDD(today),
  };
}

export function formatDisplayDateTime(isoOrStr: string): string {
  if (!isoOrStr) return '-';
  if (isoOrStr.includes(' ') && !isoOrStr.includes('T')) return isoOrStr;
  const d = new Date(isoOrStr);
  if (isNaN(d.getTime())) return isoOrStr;
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatDisplayDateOnly(dateStr: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Robust date extractor: Normalizes timestamps (ISO, space-separated, slashes) to YYYY-MM-DD
 */
export function extractRecordDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  if (!trimmed) return '';

  // Match YYYY-MM-DD at the start
  if (trimmed.includes('-')) {
    const candidate = trimmed.split(' ')[0].split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
      return candidate;
    }
  }

  // Handle DD/MM/YYYY or YYYY/MM/DD
  if (trimmed.includes('/')) {
    const parts = trimmed.split(' ')[0].split('/');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      } else {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return formatDateToYYYYMMDD(parsed);
  }

  return '';
}

// Seed authentic business records matching user's Image 1 & Image 2 across 7 days
function generateInitialRecords(): DeliveryRecord[] {
  return DEMO_RECORDS;
}

const DEFAULT_USERS: UserAccount[] = [
  { id: 'u1', username: 'admin', role: 'admin', fullName: 'System Admin', lastActive: 'Just now' },
  { id: 'u2', username: 'kiron', role: 'editor', fullName: 'Kiron (Delivery Desk)', lastActive: 'Today' },
  { id: 'u3', username: 'monjil', role: 'editor', fullName: 'Monjil (Floor Supervisor)', lastActive: 'Today' },
  { id: 'u4', username: 'editor', role: 'editor', fullName: 'General Editor', lastActive: 'Yesterday' },
];

export function getStoredRecords(): DeliveryRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RECORDS);
    if (raw === null || raw === undefined) {
      // First-ever initialization: seed demo records
      const initial = generateInitialRecords();
      try {
        localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(initial));
      } catch (_) {}
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Return parsed array even if empty ([])! Never resurrect deleted ghost records!
      return parsed;
    }
    return [];
  } catch (e) {
    console.error('Error loading records:', e);
    return [];
  }
}

export interface DevReportSummaryItem {
  development: string;
  deliveredBatches: number;
  deliveredKg: number;
  pendingBatches: number;
  pendingKg: number;
  totalBatches: number;
  totalKg: number;
}

/**
 * Computes Development-grouped delivery and pending summary for Daily Report
 */
export function computeDevelopmentReportSummary(
  records: DeliveryRecord[],
  reportDate?: string
): {
  items: DevReportSummaryItem[];
  totals: {
    deliveredBatches: number;
    deliveredKg: number;
    pendingBatches: number;
    pendingKg: number;
    totalBatches: number;
    totalKg: number;
  };
} {
  const map: Record<string, DevReportSummaryItem> = {};

  records.forEach(r => {
    // Cancelled batches do not count in pending or delivered on daily report
    if (r.isCancelled) return;

    // If data added as sample type then in report all sample would be merge in 1 line as "Sample"
    const dev = r.orderType === 'Sample' ? 'Sample' : (r.development || 'UNSPECIFIED').toUpperCase().trim();
    const recDate = extractRecordDate(r.receivedAt || r.createdAt);
    const delDate = extractRecordDate(r.deliveredAt || '');

    if (!map[dev]) {
      map[dev] = {
        development: dev,
        deliveredBatches: 0,
        deliveredKg: 0,
        pendingBatches: 0,
        pendingKg: 0,
        totalBatches: 0,
        totalKg: 0,
      };
    }

    // Historical status evaluation as of reportDate
    if (!reportDate) {
      if (r.status === 'Delivered') {
        map[dev].deliveredBatches += 1;
        map[dev].deliveredKg += r.kgQty || 0;
      } else {
        map[dev].pendingBatches += 1;
        map[dev].pendingKg += r.kgQty || 0;
      }
      return;
    }

    // 1. If batch was received after reportDate, it was not received yet on that date -> neither delivered nor pending
    if (recDate > reportDate) {
      return;
    }

    // 2. Was it delivered on this exact report date?
    if (r.status === 'Delivered' && delDate === reportDate) {
      map[dev].deliveredBatches += 1;
      map[dev].deliveredKg += r.kgQty || 0;
    }
    // 3. Was it pending on this report date?
    // A batch received on or before reportDate was pending on reportDate if:
    // - it is currently pending (has not been delivered yet), OR
    // - it was delivered later in the future (after reportDate)
    else if (r.status === 'Pending' || (r.status === 'Delivered' && delDate && delDate > reportDate)) {
      map[dev].pendingBatches += 1;
      map[dev].pendingKg += r.kgQty || 0;
    }
  });

  // Calculate totals for each development
  Object.values(map).forEach(item => {
    item.totalBatches = item.deliveredBatches + item.pendingBatches;
    item.totalKg = item.deliveredKg + item.pendingKg;
  });

  // Keep developments that have any delivery or pending activity
  const items = Object.values(map)
    .filter(item => item.totalBatches > 0)
    .sort((a, b) => b.totalKg - a.totalKg);

  const totals = items.reduce(
    (acc, item) => ({
      deliveredBatches: acc.deliveredBatches + item.deliveredBatches,
      deliveredKg: acc.deliveredKg + item.deliveredKg,
      pendingBatches: acc.pendingBatches + item.pendingBatches,
      pendingKg: acc.pendingKg + item.pendingKg,
      totalBatches: acc.totalBatches + item.totalBatches,
      totalKg: acc.totalKg + item.totalKg,
    }),
    {
      deliveredBatches: 0,
      deliveredKg: 0,
      pendingBatches: 0,
      pendingKg: 0,
      totalBatches: 0,
      totalKg: 0,
    }
  );

  return { items, totals };
}

/**
 * Fetch latest authoritative records from server database
 */
export async function fetchDatabaseRecordsFromServer(): Promise<DeliveryRecord[] | null> {
  try {
    const res = await fetch('/api/records');
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.success && Array.isArray(data.records)) {
      try {
        localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(data.records));
      } catch (_) {}
      return data.records;
    }
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Load pristine demo dataset from server
 */
export async function loadDemoRecordsFromServer(): Promise<DeliveryRecord[] | null> {
  try {
    const res = await fetch('/api/records/load-demo', { method: 'POST' });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.success && Array.isArray(data.records)) {
      try {
        localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(data.records));
      } catch (_) {}
      return data.records;
    }
    return null;
  } catch (err) {
    console.error('Failed to load demo records from server:', err);
    return null;
  }
}

/**
 * Fetch latest settings from server database
 */
export async function fetchDatabaseSettingsFromServer(): Promise<AppSettings | null> {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.success && data.settings) {
      try {
        localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(data.settings));
      } catch (_) {}
      return data.settings;
    }
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Fetch latest users from server database
 */
export async function fetchDatabaseUsersFromServer(): Promise<UserAccount[] | null> {
  try {
    const res = await fetch('/api/users');
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.success && Array.isArray(data.users) && data.users.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(data.users));
      } catch (_) {}
      return data.users;
    }
    return null;
  } catch (err) {
    return null;
  }
}

export function saveStoredRecords(records: DeliveryRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(records));
  } catch (e) {
    console.warn('localStorage quota reached, saving compact records locally:', e);
    try {
      // If local storage quota exceeded by image data URLs, save compact records locally
      // while the full authoritative records are preserved on the server
      const compactRecords = records.map(r => {
        if (r.requisitionImage && r.requisitionImage.length > 50000) {
          const { requisitionImage, ...rest } = r;
          return rest as DeliveryRecord;
        }
        return r;
      });
      localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(compactRecords));
    } catch (e2) {
      console.error('Error saving compact records to localStorage:', e2);
    }
  }

  // Authoritative sync with server database
  try {
    fetch('/api/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records }),
    }).catch(err => {
      console.warn('Could not sync records to server:', err);
    });
  } catch (_) {}
}

/**
 * Atomic bulk deletion on server database
 */
export async function bulkDeleteRecordsOnServer(ids: string[]): Promise<DeliveryRecord[] | null> {
  try {
    const res = await fetch('/api/records/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.success && Array.isArray(data.records)) {
      try {
        localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(data.records));
      } catch (_) {}
      return data.records;
    }
    return null;
  } catch (err) {
    console.error('Failed to execute bulk delete on server:', err);
    return null;
  }
}

/**
 * Atomic reset of database on server
 */
export async function resetRecordsOnServer(): Promise<boolean> {
  try {
    const res = await fetch('/api/records/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data && data.success) {
      try {
        localStorage.setItem(STORAGE_KEY_RECORDS, '[]');
      } catch (_) {}
      return true;
    }
    return false;
  } catch (err) {
    console.error('Failed to reset database on server:', err);
    return false;
  }
}

export function getStoredSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (!raw) {
      const defaultSettings: AppSettings = {
        headerTheme: 'noras-green',
        logoPlacement: 'left',
        publicLogoChoice: 'default',
        loginLogoChoice: 'default',
        reportLogoChoice: 'default',
      };
      saveStoredSettings(defaultSettings);
      return defaultSettings;
    }
    const parsed = JSON.parse(raw);
    return {
      headerTheme: parsed.headerTheme || 'noras-green',
      logoPlacement: parsed.logoPlacement || 'left',
      customLogo1: parsed.customLogo1,
      customLogo2: parsed.customLogo2,
      publicLogoChoice: parsed.publicLogoChoice || 'default',
      loginLogoChoice: parsed.loginLogoChoice || 'default',
      reportLogoChoice: parsed.reportLogoChoice || 'default',
    };
  } catch (e) {
    return {
      headerTheme: 'noras-green',
      logoPlacement: 'left',
      publicLogoChoice: 'default',
      loginLogoChoice: 'default',
      reportLogoChoice: 'default',
    };
  }
}

export function saveStoredSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  } catch (e) {
    console.error('Error saving settings:', e);
  }
  try {
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings }),
    }).catch(() => {});
  } catch (_) {}
}

export function getStoredUsers(): UserAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USERS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(DEFAULT_USERS));
      return DEFAULT_USERS;
    }
    return JSON.parse(raw);
  } catch (e) {
    return DEFAULT_USERS;
  }
}

export function saveStoredUsers(users: UserAccount[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
  } catch (e) {
    console.error('Error saving users:', e);
  }
  try {
    fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ users }),
    }).catch(() => {});
  } catch (_) {}
}

/**
 * Generate initial authentic day-wise manpower activities for TPL Greige Operations
 * Follows exact format: Date, Permanent Manpower Qty, Min Required External Qty,
 * Actual External Qty, Work Time (8am-5pm regular, after that to 8pm OT), Custom Uses and Note
 */
export function generateInitialManpowerActivities(): ManpowerActivity[] {
  const activities: ManpowerActivity[] = [];
  const today = new Date();

  // Generate day-wise activities for last 14 days up to today
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = formatDateToYYYYMMDD(d);

    const isOtDay = i % 3 === 0;
    const permQty = 4 + (i % 2); // 4 or 5 permanent staff
    const minExternal = 3 + (i % 2); // 3 or 4 required external loaders
    const actualExternal = minExternal + (i % 3 === 0 ? 1 : i % 5 === 0 ? -1 : 0); // e.g. exact match, +1, or -1

    activities.push({
      id: `mp-day-${dateStr}`,
      date: dateStr,
      permanentManpowerQty: permQty,
      minRequiredExternalQty: minExternal,
      actualExternalQty: Math.max(1, actualExternal),
      workTime: isOtDay ? '8am-8pm (Regular + OT to 8pm)' : '8am-5pm (Regular)',
      customUsesAndNote:
        i % 3 === 0
          ? 'Rush bulk batch delivery loading and evening covered van dispatch to buyer factory'
          : i % 2 === 0
          ? 'Regular greige fabric inspection, QC tagging, and delivery vehicle dispatch'
          : 'Container unloading in morning shift, followed by urgent fabric staging in bay 2',
      loggedBy: 'Admin',
      createdAt: `${dateStr}T17:00:00`,
    });
  }

  return activities;
}

/**
 * Fetch latest manpower activity records from server database
 */
export async function fetchDatabaseManpowerFromServer(): Promise<ManpowerActivity[] | null> {
  try {
    const res = await fetch('/api/manpower');
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.success && Array.isArray(data.activities) && data.activities.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY_MANPOWER, JSON.stringify(data.activities));
      } catch (_) {}
      return data.activities;
    }
    return null;
  } catch (err) {
    return null;
  }
}

export function getStoredManpowerActivities(): ManpowerActivity[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MANPOWER);
    if (!raw) {
      const initial = generateInitialManpowerActivities();
      saveStoredManpowerActivities(initial);
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Verify format has day-wise fields
      const isDayWise = parsed.some(p => typeof p.permanentManpowerQty === 'number');
      if (isDayWise) {
        return parsed;
      }
      const initial = generateInitialManpowerActivities();
      saveStoredManpowerActivities(initial);
      return initial;
    }
    const initial = generateInitialManpowerActivities();
    saveStoredManpowerActivities(initial);
    return initial;
  } catch (e) {
    return generateInitialManpowerActivities();
  }
}

export function saveStoredManpowerActivities(activities: ManpowerActivity[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_MANPOWER, JSON.stringify(activities));
  } catch (e) {
    console.error('Error saving manpower activities locally:', e);
  }

  try {
    fetch('/api/manpower', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activities }),
    }).catch(err => {
      console.warn('Could not sync manpower to server:', err);
    });
  } catch (_) {}
}

export function normalizeBatch(batch: string): string {
  return (batch || '').trim().toUpperCase();
}

export function normalizeDevelopment(dev: string): string {
  return (dev || '').trim().toUpperCase();
}

export function checkDuplicateBatch(batch: string, records: DeliveryRecord[], excludeId?: string): boolean {
  const normalized = normalizeBatch(batch);
  if (!normalized) return false;

  return records.some(r => {
    if (excludeId && r.id === excludeId) return false;
    return normalizeBatch(r.batch) === normalized;
  });
}

export function getDistinctDevelopments(records: DeliveryRecord[]): string[] {
  const set = new Set<string>();
  records.forEach(r => {
    const norm = normalizeDevelopment(r.development);
    if (norm) set.add(norm);
  });
  return Array.from(set).sort();
}

/**
 * Calculates delivery, pending, and received summary for a set of records.
 */
export function computeDeliverySummary(records: DeliveryRecord[]): DeliverySummaryStats {
  const activeRecords = records.filter(r => !r.isCancelled);
  const delivered = activeRecords.filter(r => r.status === 'Delivered');
  const pending = activeRecords.filter(r => r.status === 'Pending');

  const deliveredBatches = delivered.length;
  const deliveredRolls = delivered.reduce((s, r) => s + (r.rollQty || 0), 0);
  const deliveredKg = delivered.reduce((s, r) => s + (r.kgQty || 0), 0);

  const pendingBatches = pending.length;
  const pendingRolls = pending.reduce((s, r) => s + (r.rollQty || 0), 0);
  const pendingKg = pending.reduce((s, r) => s + (r.kgQty || 0), 0);

  const totalBatches = activeRecords.length;
  const totalRolls = deliveredRolls + pendingRolls;
  const totalKg = deliveredKg + pendingKg;

  return {
    deliveredBatches,
    deliveredRolls,
    deliveredKg: Number(deliveredKg.toFixed(2)),
    pendingBatches,
    pendingRolls,
    pendingKg: Number(pendingKg.toFixed(2)),
    receivedBatches: totalBatches,
    receivedRolls: totalRolls,
    receivedKg: Number(totalKg.toFixed(2)),
    totalBatches,
    totalRolls,
    totalKg: Number(totalKg.toFixed(2)),
  };
}

export function computeDailyOperationalMetrics(records: DeliveryRecord[], targetDateStr?: string) {
  const todayStr = targetDateStr || formatDateToYYYYMMDD(new Date());

  const todayRecords = records.filter(r => {
    if (r.isCancelled) return false;
    const recDate = (r.receivedAt || r.createdAt || '').split(' ')[0].split('T')[0];
    return recDate === todayStr;
  });

  const prevRecords = records.filter(r => {
    if (r.isCancelled) return false;
    const recDate = (r.receivedAt || r.createdAt || '').split(' ')[0].split('T')[0];
    return recDate < todayStr;
  });

  const prevPending = prevRecords.filter(r => r.status === 'Pending');
  const previousDayPendingRolls = prevPending.reduce((s, r) => s + (r.rollQty || 0), 0);
  const previousDayPendingKg = Number(prevPending.reduce((s, r) => s + (r.kgQty || 0), 0).toFixed(2));

  const todayDelivered = todayRecords.filter(r => r.status === 'Delivered');
  const todayDeliveredRolls = todayDelivered.reduce((s, r) => s + (r.rollQty || 0), 0);
  const todayDeliveredKg = Number(todayDelivered.reduce((s, r) => s + (r.kgQty || 0), 0).toFixed(2));

  const todayReceivedRolls = todayRecords.reduce((s, r) => s + (r.rollQty || 0), 0);
  const todayReceivedKg = Number(todayRecords.reduce((s, r) => s + (r.kgQty || 0), 0).toFixed(2));

  const currentPending = records.filter(r => r.status === 'Pending');
  const currentPendingRolls = currentPending.reduce((s, r) => s + (r.rollQty || 0), 0);
  const currentPendingKg = Number(currentPending.reduce((s, r) => s + (r.kgQty || 0), 0).toFixed(2));

  return {
    previousDayPendingRolls,
    previousDayPendingKg,
    todayReceivedRolls,
    todayReceivedKg,
    todayDeliveredRolls,
    todayDeliveredKg,
    currentPendingRolls,
    currentPendingKg,
  };
}

/**
 * Authoritative SQL Dump parser and database sync.
 * First attempts to sync directly with the server database via /api/import-sql.
 * If server is unreachable or offline, parses locally and saves to localStorage.
 */
export async function syncSqlDumpToServer(
  sqlText: string,
  currentRecords: DeliveryRecord[]
): Promise<{
  success: boolean;
  records: DeliveryRecord[];
  addedCount: number;
  updatedCount: number;
  error?: string;
}> {
  try {
    const res = await fetch('/api/import-sql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sqlText }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.success && Array.isArray(data.records)) {
        try {
          localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(data.records));
        } catch (_) {}
        return {
          success: true,
          records: data.records,
          addedCount: data.addedCount || 0,
          updatedCount: data.updatedCount || 0,
        };
      }
    } else {
      const errData = await res.json().catch(() => ({}));
      if (errData && errData.error) {
        console.warn('Server reported import error:', errData.error);
      }
    }
  } catch (err) {
    console.warn('Network error syncing SQL to server, running client fallback:', err);
  }

  // Fallback to client-side parsing if network/server is unavailable
  const { mergedRecords, addedCount, updatedCount } = parseSqlDump(sqlText, currentRecords);
  if (mergedRecords.length > 0) {
    saveStoredRecords(mergedRecords);
    return {
      success: true,
      records: mergedRecords,
      addedCount,
      updatedCount,
    };
  }

  return {
    success: false,
    records: currentRecords,
    addedCount: 0,
    updatedCount: 0,
    error: 'No valid batch records found in SQL script.',
  };
}

/**
 * SQL Dump parser: parses INSERT INTO / REPLACE INTO / UPDATE statements from .sql files
 */
export function parseSqlDumpToRecords(sqlText: string, currentRecords: DeliveryRecord[]): DeliveryRecord[] {
  const result = parseSqlDump(sqlText, currentRecords);
  return result.parsedRecords;
}

/**
 * Merges imported records with existing records.
 */
export function mergeOrUpdateRecords(
  incomingRecords: DeliveryRecord[],
  currentRecords: DeliveryRecord[]
): {
  merged: DeliveryRecord[];
  addedCount: number;
  updatedCount: number;
} {
  let addedCount = 0;
  let updatedCount = 0;
  const resultMap = new Map<string, DeliveryRecord>();

  currentRecords.forEach(r => {
    const key = normalizeBatchKey(r.batch);
    if (key) resultMap.set(key, { ...r });
  });

  incomingRecords.forEach(incoming => {
    const key = normalizeBatchKey(incoming.batch);
    if (!key) return;

    if (resultMap.has(key)) {
      const existing = resultMap.get(key)!;
      const isDelivered = incoming.status === 'Delivered' || Boolean(incoming.deliveredAt && !incoming.deliveredAt.startsWith('0000'));
      const finalStatus: 'Delivered' | 'Pending' = isDelivered ? 'Delivered' : incoming.status;

      resultMap.set(key, {
        ...existing,
        ...incoming,
        id: existing.id,
        // Authoritative incoming sl takes precedence over auto-increment fallback
        sl: (incoming.sl && incoming.sl > 0) ? incoming.sl : existing.sl,
        // Preserve incoming batch casing from source database
        batch: incoming.batch || existing.batch,
        status: finalStatus,
        // Preserve authentic createdAt - never reset on edit, sync, or import!
        createdAt: existing.createdAt || incoming.createdAt || incoming.receivedAt,
        // Delivered timestamp: use incoming completed_at/deliveredAt if present, or preserve existing
        deliveredAt: finalStatus === 'Delivered'
          ? (incoming.deliveredAt || existing.deliveredAt || null)
          : null,
        receivedAt: incoming.receivedAt || existing.receivedAt,
        isCancelled: incoming.isCancelled !== undefined ? incoming.isCancelled : (existing.isCancelled || false),
        cancelledAt: incoming.cancelledAt || existing.cancelledAt,
        cancelledBy: incoming.cancelledBy || existing.cancelledBy,
        receivedBy: incoming.receivedBy || existing.receivedBy || 'Admin',
        deliveredBy: finalStatus === 'Delivered'
          ? (incoming.deliveredBy || existing.deliveredBy || incoming.receivedBy || 'Admin')
          : null,
        customerName: incoming.customerName || existing.customerName,
        shortQty: incoming.shortQty || existing.shortQty,
        requisitionImage: incoming.requisitionImage || existing.requisitionImage,
        requisitionImageMimeType: incoming.requisitionImageMimeType || existing.requisitionImageMimeType,
      });
      updatedCount++;
    } else {
      resultMap.set(key, incoming);
      addedCount++;
    }
  });

  const merged = Array.from(resultMap.values());
  return { merged, addedCount, updatedCount };
}
