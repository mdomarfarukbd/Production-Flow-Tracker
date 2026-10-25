import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  DeliveryRecord,
  AppSettings,
  HeaderTheme,
  LogoPlacement,
  LogoChoice,
  UserAccount,
  DashboardSectionId,
  ManpowerActivity,
} from '../types';
import { exportToExcel } from '../services/exportService';
import {
  parseSqlDumpToRecords,
  mergeOrUpdateRecords,
  extractRecordDate,
  syncSqlDumpToServer,
  resetRecordsOnServer,
} from '../services/storage';
import {
  X,
  Shield,
  Download,
  Upload,
  Users,
  Palette,
  Check,
  AlertCircle,
  CheckCircle2,
  Trash2,
  FileCode,
  Image,
  UserPlus,
  AlertTriangle,
  Filter,
  LayoutGrid,
  ArrowUp,
  ArrowDown,
  Edit2,
  KeyRound,
  RotateCcw,
  HardHat,
  Ban,
  Database,
} from 'lucide-react';
import { ManpowerManagement } from './ManpowerManagement';

interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  records: DeliveryRecord[];
  onImportRecords: (records: DeliveryRecord[]) => void;
  users: UserAccount[];
  onUpdateUsers: (users: UserAccount[]) => void;
  manpowerActivities: ManpowerActivity[];
  onUpdateManpowerActivities: (activities: ManpowerActivity[]) => void;
  currentUser?: string;
  initialSection?: AdminSection;
  onToggleCancelBatch?: (recordId: string, cancel: boolean, reason?: string) => void;
  onBulkDeleteRecords?: (recordIds: string[]) => void;
  onLoadDemoRecords?: () => Promise<void> | void;
}

export type AdminSection = 'branding' | 'layout' | 'backup' | 'bulkDelete' | 'cancelledBatches' | 'users' | 'manpower';

const DEFAULT_SECTION_ORDER: DashboardSectionId[] = [
  'summary_cards',
  'trend_chart',
  'customer_short_pie',
  'calendar',
  'data_table',
];

const SECTION_DESCRIPTIONS: Record<DashboardSectionId, { title: string; subtitle: string; icon: string }> = {
  summary_cards: {
    title: 'KPI Summary Blocks',
    subtitle: '6 metric blocks: Delivered KG, Delivered Batch, Pending KG, Pending Batch, Hold Batch, Hold KG',
    icon: '📊',
  },
  trend_chart: {
    title: 'Daily Delivery Trend & Top 6 Development Delivery',
    subtitle: 'Interactive stacked delivery bar chart and Top 6 development pie chart breakdown',
    icon: '📈',
  },
  customer_short_pie: {
    title: 'Top 6 Customer & Short Qty Ranking Pie Charts',
    subtitle: '50/50 column row: Top 6 Customer Deliveries & Devs with Short Lots',
    icon: '🥧',
  },
  calendar: {
    title: 'Delivery Activity Calendar',
    subtitle: 'Interactive monthly delivery calendar with center integer KG, batch count, and date filtering',
    icon: '📅',
  },
  data_table: {
    title: 'Public Fabric Delivery Database Table',
    subtitle: 'Searchable public records table with batch, development, KG, and timestamp details',
    icon: '📋',
  },
};

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  records,
  onImportRecords,
  users,
  onUpdateUsers,
  manpowerActivities,
  onUpdateManpowerActivities,
  currentUser = 'Admin',
  initialSection = 'branding',
  onToggleCancelBatch,
  onBulkDeleteRecords,
  onLoadDemoRecords,
}) => {
  const [activeSection, setActiveSection] = useState<AdminSection>(initialSection);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Sync initialSection whenever modal opens
  useEffect(() => {
    if (initialSection) {
      setActiveSection(initialSection);
    }
  }, [initialSection, isOpen]);

  // New user form state
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'editor'>('editor');
  const [newPassword, setNewPassword] = useState('');

  // Edit user state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'editor'>('editor');
  const [editPassword, setEditPassword] = useState('');

  const fileImportJsonRef = useRef<HTMLInputElement>(null);
  const fileImportSqlRef = useRef<HTMLInputElement>(null);
  const logo1InputRef = useRef<HTMLInputElement>(null);
  const logo2InputRef = useRef<HTMLInputElement>(null);

  // Raw SQL input state
  const [rawSqlText, setRawSqlText] = useState('');
  const [showSqlPaste, setShowSqlPaste] = useState(false);
  const [isImportingSql, setIsImportingSql] = useState(false);

  // Bulk Delete state
  const [bulkDeleteStartDate, setBulkDeleteStartDate] = useState('');
  const [bulkDeleteEndDate, setBulkDeleteEndDate] = useState('');
  const [bulkDeleteStatus, setBulkDeleteStatus] = useState<'all' | 'Delivered' | 'Pending'>('all');
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [showConfirmFilteredDelete, setShowConfirmFilteredDelete] = useState(false);
  const [showConfirmResetAll, setShowConfirmResetAll] = useState(false);

  // Cancelled Batches state
  const [cancelBatchSearch, setCancelBatchSearch] = useState('');
  const [selectedBatchToCancel, setSelectedBatchToCancel] = useState<DeliveryRecord | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');

  // Cancelled Batches List
  const cancelledRecords = useMemo(() => {
    return records.filter(r => r.isCancelled);
  }, [records]);

  // Search results for batches that can be cancelled (active non-cancelled records)
  const matchingSearchBatches = useMemo(() => {
    const q = cancelBatchSearch.trim().toLowerCase();
    if (!q) return [];
    return records
      .filter(r => !r.isCancelled && ((r.batch || '').toLowerCase().includes(q) || (r.development || '').toLowerCase().includes(q)))
      .slice(0, 10);
  }, [records, cancelBatchSearch]);

  // Bulk Delete Filtered Records calculation (must be called unconditionally before early returns)
  const matchingDeleteRecords = useMemo(() => {
    return records.filter(r => {
      const recDate = extractRecordDate(r.receivedAt || r.createdAt);
      const delDate = extractRecordDate(r.deliveredAt || '');
      const targetDate = r.status === 'Delivered' ? (delDate || recDate) : recDate;

      if (bulkDeleteStartDate && targetDate < bulkDeleteStartDate) return false;
      if (bulkDeleteEndDate && targetDate > bulkDeleteEndDate) return false;
      if (bulkDeleteStatus !== 'all' && r.status !== bulkDeleteStatus) return false;
      return true;
    });
  }, [records, bulkDeleteStartDate, bulkDeleteEndDate, bulkDeleteStatus]);

  // Dashboard Section Order helpers (called unconditionally alongside other hooks)
  const currentSectionOrder: DashboardSectionId[] = useMemo(() => {
    if (
      settings.dashboardSectionOrder &&
      Array.isArray(settings.dashboardSectionOrder) &&
      settings.dashboardSectionOrder.length === DEFAULT_SECTION_ORDER.length
    ) {
      return settings.dashboardSectionOrder;
    }
    return DEFAULT_SECTION_ORDER;
  }, [settings.dashboardSectionOrder]);

  // Handle Logo 1 Upload (Dark / Green Nora's version)
  const handleLogo1Upload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      onUpdateSettings({ ...settings, customLogo1: base64, reportLogoChoice: 'logo1', publicLogoChoice: 'logo1' });
      setFeedback({ message: 'Logo 1 (Dark / Green) uploaded and applied to daily report & public page.', type: 'success' });
      setTimeout(() => setFeedback(null), 3000);
    };
    reader.readAsDataURL(file);
  };

  // Handle Logo 2 Upload (White / Light version)
  const handleLogo2Upload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      onUpdateSettings({ ...settings, customLogo2: base64, reportLogoChoice: 'logo2' });
      setFeedback({ message: 'Logo 2 (White / Light) uploaded and applied to daily report.', type: 'success' });
      setTimeout(() => setFeedback(null), 3000);
    };
    reader.readAsDataURL(file);
  };

  // Handle SQL Dump File Import (Directly syncs with server database + local storage)
  const handleImportSqlFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImportingSql(true);
    setFeedback({
      message: `Reading and syncing "${file.name}" with server database... Please wait.`,
      type: 'success',
    });

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const text = (reader.result as string).replace(/^\uFEFF/, '');
        const res = await syncSqlDumpToServer(text, records);

        if (res.success && res.records.length > 0) {
          onImportRecords(res.records);
          setFeedback({
            message: `Database Synced Successfully: ${res.addedCount} new batches added, ${res.updatedCount} existing batches updated/replaced. Total in server database: ${res.records.length} records.`,
            type: 'success',
          });
        } else {
          setFeedback({
            message: res.error || 'No valid batch records found in the SQL file. Ensure INSERT INTO statements contain batch numbers.',
            type: 'error',
          });
        }
      } catch (err: any) {
        console.error('SQL import error:', err);
        setFeedback({ message: `SQL parse error: ${err.message || 'Invalid SQL format'}`, type: 'error' });
      } finally {
        setIsImportingSql(false);
      }
    };
    reader.onerror = () => {
      setIsImportingSql(false);
      setFeedback({ message: 'Failed to read SQL file from disk.', type: 'error' });
    };
    reader.readAsText(file);
    if (fileImportSqlRef.current) fileImportSqlRef.current.value = '';
  };

  // Handle Raw SQL Text Import (Directly syncs with server database + local storage)
  const handleImportRawSql = async () => {
    if (!rawSqlText.trim()) return;
    setIsImportingSql(true);
    setFeedback({
      message: 'Parsing and syncing SQL script with server database... Please wait.',
      type: 'success',
    });

    try {
      const cleanText = rawSqlText.replace(/^\uFEFF/, '').trim();
      const res = await syncSqlDumpToServer(cleanText, records);

      if (res.success && res.records.length > 0) {
        onImportRecords(res.records);
        setFeedback({
          message: `SQL Script Synced: ${res.addedCount} new batches added, ${res.updatedCount} existing batches updated. Total in database: ${res.records.length} records.`,
          type: 'success',
        });
        setRawSqlText('');
        setShowSqlPaste(false);
      } else {
        setFeedback({
          message: res.error || 'No valid batch records found in the SQL script.',
          type: 'error',
        });
      }
    } catch (err: any) {
      console.error('Raw SQL parse error:', err);
      setFeedback({ message: `SQL parse error: ${err.message || 'Invalid SQL format'}`, type: 'error' });
    } finally {
      setIsImportingSql(false);
    }
  };

  // Export JSON Backup
  const handleExportJson = () => {
    const dataStr = JSON.stringify(records, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TPL_Greige_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setFeedback({ message: 'JSON database backup downloaded.', type: 'success' });
    setTimeout(() => setFeedback(null), 3000);
  };

  // Import JSON Backup (Replaces/updates existing batch if matching, or inserts new)
  const handleImportJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].batch) {
          const { merged, addedCount, updatedCount } = mergeOrUpdateRecords(parsed, records);
          onImportRecords(merged);
          setFeedback({
            message: `JSON Import complete: ${addedCount} new records added, ${updatedCount} existing records updated/replaced. Total: ${merged.length} records.`,
            type: 'success',
          });
        } else {
          setFeedback({ message: 'Invalid JSON backup structure.', type: 'error' });
        }
      } catch (err) {
        setFeedback({ message: 'Failed to parse JSON file.', type: 'error' });
      }
    };
    reader.readAsText(file);
    if (fileImportJsonRef.current) fileImportJsonRef.current.value = '';
  };

  // Execute Bulk Delete of Filtered Records (atomic server sync, permanent)
  const handleExecuteBulkDelete = async () => {
    if (matchingDeleteRecords.length === 0) return;

    const count = matchingDeleteRecords.length;
    setIsDeletingBulk(true);
    const deleteIds = matchingDeleteRecords.map(r => r.id);

    if (onBulkDeleteRecords) {
      onBulkDeleteRecords(deleteIds);
    } else {
      const deleteSet = new Set(deleteIds);
      const remaining = records.filter(r => !deleteSet.has(r.id));
      onImportRecords(remaining);
    }

    setIsDeletingBulk(false);
    setShowConfirmFilteredDelete(false);
    setFeedback({
      message: `Bulk Delete Complete: Successfully deleted ${count} records. ${Math.max(0, records.length - count)} records remain in database.`,
      type: 'success',
    });
  };

  // Reset entire database (atomic server reset, permanent)
  const handleResetAllRecords = async () => {
    if (resetConfirmText.trim().toUpperCase() !== 'DELETE') {
      setFeedback({ message: 'Please type "DELETE" exactly to confirm database reset.', type: 'error' });
      return;
    }

    const count = records.length;
    await resetRecordsOnServer();
    onImportRecords([]);
    setResetConfirmText('');
    setShowConfirmResetAll(false);
    setFeedback({
      message: `Database Cleared: Permanently deleted all ${count} records.`,
      type: 'success',
    });
  };

  // Cancel Batch action (Admin only)
  const handleCancelBatchAction = (rec: DeliveryRecord) => {
    if (!onToggleCancelBatch) return;
    const reason = cancellationReason.trim() || 'Cancelled by Admin';
    onToggleCancelBatch(rec.id, true, reason);
    setCancelBatchSearch('');
    setSelectedBatchToCancel(null);
    setCancellationReason('');
    setFeedback({
      message: `Batch ${rec.batch} cancelled successfully. It will not count in Pending and cannot be delivered until activated by an Admin.`,
      type: 'success',
    });
  };

  // Activate Batch action (Admin only)
  const handleActivateBatchAction = (rec: DeliveryRecord) => {
    if (!onToggleCancelBatch) return;
    onToggleCancelBatch(rec.id, false);
    setFeedback({
      message: `Batch ${rec.batch} activated successfully. It is now active and ready for delivery/operations.`,
      type: 'success',
    });
  };

  // User Edit Handlers
  const handleStartEditUser = (user: UserAccount) => {
    setEditingUserId(user.id);
    setEditFullName(user.fullName);
    setEditUsername(user.username);
    setEditRole(user.role);
    setEditPassword('');
  };

  const handleCancelEditUser = () => {
    setEditingUserId(null);
    setEditFullName('');
    setEditUsername('');
    setEditPassword('');
  };

  const handleSaveEditUser = (userId: string) => {
    if (!editUsername.trim() || !editFullName.trim()) {
      setFeedback({ message: 'Username and Full Name are required.', type: 'error' });
      return;
    }

    const cleanUser = editUsername.trim().toLowerCase();
    if (users.some(u => u.id !== userId && u.username.toLowerCase() === cleanUser)) {
      setFeedback({ message: 'Username already taken by another account.', type: 'error' });
      return;
    }

    const updated = users.map(u => {
      if (u.id === userId) {
        return {
          ...u,
          fullName: editFullName.trim(),
          username: cleanUser,
          role: editRole,
          password: editPassword.trim() ? editPassword.trim() : u.password,
        };
      }
      return u;
    });

    onUpdateUsers(updated);
    setEditingUserId(null);
    setFeedback({ message: `User @${cleanUser} updated successfully.`, type: 'success' });
    setTimeout(() => setFeedback(null), 3000);
  };

  // Add User
  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) return;

    const cleanUser = newUsername.trim().toLowerCase();
    if (users.some(u => u.username.toLowerCase() === cleanUser)) {
      setFeedback({ message: 'Username already exists.', type: 'error' });
      return;
    }

    const newUser: UserAccount = {
      id: `u-${Date.now()}`,
      username: cleanUser,
      fullName: newFullName.trim() || cleanUser,
      role: newUserRole,
      password: newPassword.trim() || (newUserRole === 'admin' ? 'admin123' : 'editor123'),
      lastActive: 'New',
    };

    onUpdateUsers([...users, newUser]);
    setNewUsername('');
    setNewFullName('');
    setNewPassword('');
    setFeedback({ message: `User @${cleanUser} created successfully.`, type: 'success' });
    setTimeout(() => setFeedback(null), 3000);
  };

  // Delete User
  const handleDeleteUser = (id: string, username: string) => {
    if (username === 'admin') {
      setFeedback({ message: 'Cannot delete primary admin account.', type: 'error' });
      return;
    }
    onUpdateUsers(users.filter(u => u.id !== id));
    setFeedback({ message: `User @${username} removed.`, type: 'success' });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleMoveSection = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentSectionOrder.length) return;

    const newOrder = [...currentSectionOrder];
    const [moved] = newOrder.splice(index, 1);
    newOrder.splice(targetIndex, 0, moved);

    onUpdateSettings({ ...settings, dashboardSectionOrder: newOrder });
    setFeedback({ message: 'Dashboard section order updated.', type: 'success' });
    setTimeout(() => setFeedback(null), 2500);
  };

  const handleResetLayout = () => {
    onUpdateSettings({ ...settings, dashboardSectionOrder: DEFAULT_SECTION_ORDER });
    setFeedback({ message: 'Dashboard layout restored to default.', type: 'success' });
    setTimeout(() => setFeedback(null), 2500);
  };

  // Critical React Hook Safety: Unconditional early return placed strictly after all hooks
  if (!isOpen) return null;

  const isWideSection = activeSection === 'manpower';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div
        className={`bg-white rounded-xl shadow-2xl border border-slate-200 w-full overflow-hidden my-6 transition-all duration-200 animate-in fade-in zoom-in-95 duration-150 ${
          isWideSection ? 'max-w-5xl' : 'max-w-2xl'
        }`}
      >
        {/* Header */}
        <div className="bg-[#04342c] text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-emerald-300" />
            <div>
              <h2 className="text-base font-bold tracking-wide">[Company Name] Administration Control Panel</h2>
              <p className="text-xs text-emerald-200">
                Logo Management, Dashboard Layout, SQL/JSON Import, Users, and Manpower Operations
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white rounded-md p-1 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-semibold overflow-x-auto">
          {/* 1. Manpower Tab (Highlighted) */}
          <button
            onClick={() => setActiveSection('manpower')}
            className={`py-3 px-3 text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeSection === 'manpower'
                ? 'border-[#04342c] text-[#04342c] bg-white font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-emerald-600" />
            <span>Manpower</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-bold">
              {manpowerActivities.length}
            </span>
          </button>

          {/* 2. Logo Branding Tab */}
          <button
            onClick={() => setActiveSection('branding')}
            className={`py-3 px-3 text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeSection === 'branding'
                ? 'border-[#04342c] text-[#04342c] bg-white font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Logo</span>
          </button>

          {/* 3. Dashboard Layout Tab */}
          <button
            onClick={() => setActiveSection('layout')}
            className={`py-3 px-3 text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeSection === 'layout'
                ? 'border-[#04342c] text-[#04342c] bg-white font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Dashboard Layout</span>
          </button>

          {/* 4. SQL / JSON Tab */}
          <button
            onClick={() => setActiveSection('backup')}
            className={`py-3 px-3 text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeSection === 'backup'
                ? 'border-[#04342c] text-[#04342c] bg-white font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>SQL / JSON</span>
          </button>

          {/* 5. Bulk Delete Tab */}
          <button
            onClick={() => setActiveSection('bulkDelete')}
            className={`py-3 px-3 text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeSection === 'bulkDelete'
                ? 'border-red-600 text-red-700 bg-white font-bold'
                : 'border-transparent text-slate-600 hover:text-red-700'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5 text-red-600" />
            <span>Bulk Delete</span>
          </button>

          {/* 6. Cancelled Batches Tab */}
          <button
            onClick={() => setActiveSection('cancelledBatches')}
            className={`py-3 px-3 text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeSection === 'cancelledBatches'
                ? 'border-amber-600 text-amber-800 bg-white font-bold'
                : 'border-transparent text-slate-600 hover:text-amber-800'
            }`}
          >
            <Ban className="w-3.5 h-3.5 text-amber-600" />
            <span>Cancelled Batches ({cancelledRecords.length})</span>
          </button>

          {/* 6. Users & Password Tab */}
          <button
            onClick={() => setActiveSection('users')}
            className={`py-3 px-3 text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeSection === 'users'
                ? 'border-[#04342c] text-[#04342c] bg-white font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Users & Password</span>
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`px-6 py-2.5 text-xs font-semibold flex items-center gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200'
                : 'bg-red-50 text-red-800 border-b border-red-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 space-y-6 text-xs text-slate-700 max-h-[75vh] overflow-y-auto">
          {/* 0. MANPOWER MANAGEMENT & DELIVERED QTY COMPARISON */}
          {activeSection === 'manpower' && (
            <ManpowerManagement
              records={records}
              manpowerActivities={manpowerActivities}
              onUpdateManpowerActivities={onUpdateManpowerActivities}
              currentUser={currentUser}
            />
          )}

          {/* 1. BRANDING & TWO LOGO UPLOADS WITH USAGE ASSIGNMENTS */}
          {activeSection === 'branding' && (
            <div className="space-y-6">
              {/* Section 1A: Two Logo Upload Options */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-1">
                  1. Upload Two Logo Types
                </h3>
                <p className="text-slate-500 mb-3 text-[11px]">
                  Upload two distinct brand logos (e.g. Logo 1: Dark / Green, Logo 2: White / Light):
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Logo 1: Dark/Green */}
                  <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/70 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">Logo 1 (Dark / Green Nora's)</span>
                      {settings.customLogo1 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                          Active
                        </span>
                      )}
                    </div>

                    <div className="h-16 rounded border border-dashed border-slate-300 bg-white flex items-center justify-center p-2 overflow-hidden">
                      {settings.customLogo1 ? (
                        <img src={settings.customLogo1} alt="Logo 1 Preview" className="max-h-full max-w-full object-contain" />
                      ) : (
                        <span className="text-[11px] text-slate-400">No custom Logo 1 uploaded</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => logo1InputRef.current?.click()}
                        className="flex-1 py-1.5 px-2.5 rounded bg-[#04342c] text-white font-bold hover:bg-[#032620] text-center"
                      >
                        Upload Logo 1
                      </button>
                      {settings.customLogo1 && (
                        <button
                          type="button"
                          onClick={() => onUpdateSettings({ ...settings, customLogo1: undefined })}
                          className="py-1.5 px-2 rounded border border-red-200 text-red-600 hover:bg-red-50"
                          title="Reset to default"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                    <input
                      type="file"
                      ref={logo1InputRef}
                      onChange={handleLogo1Upload}
                      accept="image/*"
                      className="hidden"
                    />
                  </div>

                  {/* Logo 2: White/Light */}
                  <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/70 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">Logo 2 (White / Light)</span>
                      {settings.customLogo2 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                          Active
                        </span>
                      )}
                    </div>

                    <div className="h-16 rounded border border-dashed border-slate-400 bg-[#04342c] flex items-center justify-center p-2 overflow-hidden">
                      {settings.customLogo2 ? (
                        <img src={settings.customLogo2} alt="Logo 2 Preview" className="max-h-full max-w-full object-contain" />
                      ) : (
                        <span className="text-[11px] text-slate-300">No custom Logo 2 uploaded</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => logo2InputRef.current?.click()}
                        className="flex-1 py-1.5 px-2.5 rounded bg-[#04342c] text-white font-bold hover:bg-[#032620] text-center"
                      >
                        Upload Logo 2
                      </button>
                      {settings.customLogo2 && (
                        <button
                          type="button"
                          onClick={() => onUpdateSettings({ ...settings, customLogo2: undefined })}
                          className="py-1.5 px-2 rounded border border-red-200 text-red-600 hover:bg-red-50"
                          title="Reset to default"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                    <input
                      type="file"
                      ref={logo2InputRef}
                      onChange={handleLogo2Upload}
                      accept="image/*"
                      className="hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Section 1B: Which Logo will be used where */}
              <div className="pt-4 border-t border-slate-200">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-1">
                  2. Logo Uses — Which Logo is Used Where
                </h3>
                <p className="text-slate-500 mb-3 text-[11px]">
                  Assign which logo applies to the Public Page header, Login Modal, and Official Daily Report:
                </p>

                <div className="space-y-3 bg-white p-3.5 border border-slate-200 rounded-lg">
                  {/* Public Page Logo Selector */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                    <span className="font-bold text-slate-800">Public Page Header:</span>
                    <div className="flex items-center gap-2">
                      {(['default', 'logo1', 'logo2'] as LogoChoice[]).map(choice => (
                        <button
                          key={choice}
                          type="button"
                          onClick={() => onUpdateSettings({ ...settings, publicLogoChoice: choice })}
                          className={`px-2.5 py-1 rounded text-[11px] font-bold border capitalize transition-all ${
                            settings.publicLogoChoice === choice
                              ? 'bg-[#04342c] text-white border-[#04342c]'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {choice === 'default' ? 'Default [Company Logo]' : choice === 'logo1' ? 'Logo 1 (Dark)' : 'Logo 2 (White)'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Login Page Logo Selector */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                    <span className="font-bold text-slate-800">Login Page / Modal:</span>
                    <div className="flex items-center gap-2">
                      {(['default', 'logo1', 'logo2'] as LogoChoice[]).map(choice => (
                        <button
                          key={choice}
                          type="button"
                          onClick={() => onUpdateSettings({ ...settings, loginLogoChoice: choice })}
                          className={`px-2.5 py-1 rounded text-[11px] font-bold border capitalize transition-all ${
                            settings.loginLogoChoice === choice
                              ? 'bg-[#04342c] text-white border-[#04342c]'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {choice === 'default' ? 'Default [Company Logo]' : choice === 'logo1' ? 'Logo 1 (Dark)' : 'Logo 2 (White)'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Report Header Logo Selector */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="font-bold text-slate-800">Official Daily Report:</span>
                    <div className="flex items-center gap-2">
                      {(['default', 'logo1', 'logo2'] as LogoChoice[]).map(choice => (
                        <button
                          key={choice}
                          type="button"
                          onClick={() => onUpdateSettings({ ...settings, reportLogoChoice: choice })}
                          className={`px-2.5 py-1 rounded text-[11px] font-bold border capitalize transition-all ${
                            settings.reportLogoChoice === choice
                              ? 'bg-[#04342c] text-white border-[#04342c]'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {choice === 'default' ? 'Default [Company Logo]' : choice === 'logo1' ? 'Logo 1 (Dark)' : 'Logo 2 (White)'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 1C: Header Theme & Placement */}
              <div className="pt-4 border-t border-slate-200">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2">
                  3. Header Background Theme & Logo Alignment
                </h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <button
                    onClick={() => onUpdateSettings({ ...settings, headerTheme: 'noras-green' })}
                    className={`p-2.5 rounded-lg border text-left font-bold transition-all flex items-center justify-between ${
                      settings.headerTheme === 'noras-green'
                        ? 'border-[#04342c] bg-emerald-50 text-[#04342c] ring-1 ring-[#04342c]'
                        : 'border-slate-200 text-slate-700'
                    }`}
                  >
                    <span>Nora's Green (#04342c)</span>
                    {settings.headerTheme === 'noras-green' && <Check className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={() => onUpdateSettings({ ...settings, headerTheme: 'white' })}
                    className={`p-2.5 rounded-lg border text-left font-bold transition-all flex items-center justify-between ${
                      settings.headerTheme === 'white'
                        ? 'border-[#04342c] bg-slate-50 text-[#04342c] ring-1 ring-[#04342c]'
                        : 'border-slate-200 text-slate-700'
                    }`}
                  >
                    <span>White Header</span>
                    {settings.headerTheme === 'white' && <Check className="w-4 h-4" />}
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {(['left', 'center', 'both'] as LogoPlacement[]).map(pos => (
                    <button
                      key={pos}
                      onClick={() => onUpdateSettings({ ...settings, logoPlacement: pos })}
                      className={`py-1.5 px-2 rounded border text-center font-bold capitalize transition-all ${
                        settings.logoPlacement === pos
                          ? 'bg-[#04342c] text-white border-[#04342c]'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      {pos === 'both' ? 'Header & Report' : `Header ${pos}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 2. SQL & JSON DATA IMPORT / BACKUP */}
          {activeSection === 'backup' && (
            <div className="space-y-6">
              {/* SQL Upload Feature */}
              <div className="p-4 rounded-lg border border-emerald-200 bg-emerald-50/60 space-y-3">
                <div className="flex items-center gap-2 text-emerald-900 font-bold">
                  <FileCode className="w-4 h-4 text-emerald-700" />
                  <span>Import Data from SQL File (.sql)</span>
                </div>
                <p className="text-[11px] text-emerald-800 leading-relaxed">
                  Upload an SQL dump file (such as <code className="font-mono bg-white px-1 py-0.5 rounded border border-emerald-300">127_0_0_1.sql</code> or <code className="font-mono bg-white px-1 py-0.5 rounded border border-emerald-300">greigedelivery.sql</code>). The system automatically parses INSERT INTO statements and imports new batches without duplicates.
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isImportingSql}
                    onClick={() => fileImportSqlRef.current?.click()}
                    className="flex-1 py-2.5 px-4 rounded-md bg-[#04342c] text-white hover:bg-[#032620] disabled:opacity-60 font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-xs cursor-pointer"
                  >
                    {isImportingSql ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Syncing SQL with Database...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        <span>Upload .sql Dump File</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={isImportingSql}
                    onClick={() => setShowSqlPaste(!showSqlPaste)}
                    className="py-2.5 px-3 rounded-md border border-slate-300 bg-white hover:bg-slate-50 font-bold text-xs text-slate-700 transition-colors cursor-pointer"
                  >
                    {showSqlPaste ? 'Hide Paste Box' : 'Paste SQL Text'}
                  </button>
                </div>
                <input
                  type="file"
                  ref={fileImportSqlRef}
                  onChange={handleImportSqlFile}
                  accept=".sql,text/plain"
                  className="hidden"
                />

                {showSqlPaste && (
                  <div className="space-y-2 pt-2 border-t border-emerald-200">
                    <label className="block text-[11px] font-bold text-slate-700">
                      Paste INSERT INTO SQL Statements:
                    </label>
                    <textarea
                      value={rawSqlText}
                      disabled={isImportingSql}
                      onChange={e => setRawSqlText(e.target.value)}
                      placeholder="INSERT INTO `greigedelivery` (`order_type`, `dev`, `batch`, `roll_qty`, `kg_qty`, `status`) VALUES ('Bulk', 'PVPEEL002D', 'F2603899', 10, 245.50, 'Pending');"
                      className="w-full h-24 p-2.5 rounded border border-slate-300 font-mono text-[11px] bg-white text-slate-800"
                    />
                    <button
                      type="button"
                      onClick={handleImportRawSql}
                      disabled={!rawSqlText.trim() || isImportingSql}
                      className="py-1.5 px-3.5 rounded bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold text-xs transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      {isImportingSql && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                      <span>{isImportingSql ? 'Syncing...' : 'Parse & Sync Pasted SQL'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* JSON Backup & Restore */}
              <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/70 space-y-3">
                <div className="flex items-center gap-2 text-slate-900 font-bold">
                  <Download className="w-4 h-4 text-slate-700" />
                  <span>JSON Database Backup & Restore</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handleExportJson}
                    className="py-2.5 px-3 rounded-md border border-slate-300 bg-white hover:bg-slate-100 font-bold text-slate-800 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="w-4 h-4 text-[#04342c]" />
                    <span>Download JSON</span>
                  </button>

                  <button
                    onClick={() => fileImportJsonRef.current?.click()}
                    className="py-2.5 px-3 rounded-md border border-slate-300 bg-white hover:bg-slate-100 font-bold text-slate-800 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Upload className="w-4 h-4 text-[#04342c]" />
                    <span>Import JSON</span>
                  </button>
                  <input
                    type="file"
                    ref={fileImportJsonRef}
                    onChange={handleImportJsonFile}
                    accept=".json,application/json"
                    className="hidden"
                  />
                </div>
              </div>

              {/* Full Excel Export */}
              <div className="pt-2">
                <button
                  onClick={() => exportToExcel(records, 'all')}
                  className="w-full py-2.5 px-4 rounded-md border border-slate-300 bg-white hover:bg-slate-50 font-bold text-slate-800 flex items-center justify-center gap-2 transition-colors"
                >
                  <Download className="w-4 h-4 text-emerald-700" />
                  <span>Export Complete Spreadsheet (.xlsx)</span>
                </button>
              </div>
            </div>
          )}

          {/* 3. BULK DELETE / DATA CLEANUP (ADMIN ONLY) */}
          {activeSection === 'bulkDelete' && (
            <div className="space-y-6">
              {/* Option A: Filtered Bulk Deletion */}
              <div className="p-4 rounded-lg border border-red-200 bg-red-50/40 space-y-4">
                <div className="flex items-center gap-2 text-red-900 font-bold">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <span>Delete Records by Date Range & Status</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Specify a date window and optional delivery status to bulk delete matching records from the database.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-3 rounded-md border border-red-100">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Start Date (From)
                    </label>
                    <input
                      type="date"
                      value={bulkDeleteStartDate}
                      onChange={e => setBulkDeleteStartDate(e.target.value)}
                      className="w-full text-xs p-1.5 border border-slate-300 rounded font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      End Date (To)
                    </label>
                    <input
                      type="date"
                      value={bulkDeleteEndDate}
                      onChange={e => setBulkDeleteEndDate(e.target.value)}
                      className="w-full text-xs p-1.5 border border-slate-300 rounded font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Status
                    </label>
                    <select
                      value={bulkDeleteStatus}
                      onChange={e => setBulkDeleteStatus(e.target.value as any)}
                      className="w-full text-xs p-1.5 border border-slate-300 rounded bg-white text-slate-800"
                    >
                      <option value="all">All Records</option>
                      <option value="Delivered">Delivered Only</option>
                      <option value="Pending">Pending Only</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  <div className="text-xs font-semibold text-slate-700">
                    Target Records Selected: <span className="font-bold text-red-700">{matchingDeleteRecords.length}</span> / {records.length} total
                  </div>

                  {!showConfirmFilteredDelete ? (
                    <button
                      type="button"
                      onClick={() => setShowConfirmFilteredDelete(true)}
                      disabled={matchingDeleteRecords.length === 0 || isDeletingBulk}
                      className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Matching ({matchingDeleteRecords.length})</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 bg-red-100 p-2 rounded-md border border-red-300 animate-in fade-in">
                      <span className="text-[11px] font-bold text-red-900">
                        Permanently delete {matchingDeleteRecords.length} records?
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowConfirmFilteredDelete(false)}
                        className="px-2.5 py-1 rounded bg-white hover:bg-slate-100 text-slate-700 font-bold text-[11px] border border-slate-300 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleExecuteBulkDelete}
                        disabled={isDeletingBulk}
                        className="px-3 py-1 rounded bg-red-700 hover:bg-red-800 text-white font-bold text-[11px] shadow-xs cursor-pointer"
                      >
                        {isDeletingBulk ? 'Deleting...' : 'Yes, Delete'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Option B: Reset Entire Database */}
              <div className="p-4 rounded-lg border border-slate-300 bg-slate-50 space-y-3">
                <div className="flex items-center gap-2 text-slate-900 font-bold">
                  <Trash2 className="w-4 h-4 text-slate-700" />
                  <span>Erase & Reset Complete Database</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Permanently clear all {records.length} records in the system. Make sure you have downloaded a JSON or Excel backup first.
                </p>

                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <input
                    type="text"
                    value={resetConfirmText}
                    onChange={e => {
                      setResetConfirmText(e.target.value);
                      setShowConfirmResetAll(false);
                    }}
                    placeholder='Type "DELETE" to confirm'
                    className="px-3 py-1.5 rounded border border-slate-300 text-xs font-mono uppercase sm:w-56 bg-white"
                  />

                  {resetConfirmText.trim().toUpperCase() === 'DELETE' && !showConfirmResetAll && (
                    <button
                      type="button"
                      onClick={() => setShowConfirmResetAll(true)}
                      className="px-4 py-1.5 rounded bg-slate-800 hover:bg-black text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Erase All Database Records</span>
                    </button>
                  )}

                  {showConfirmResetAll && (
                    <div className="flex items-center gap-2 bg-red-100 p-2 rounded-md border border-red-300 animate-in fade-in">
                      <span className="text-[11px] font-bold text-red-900">
                        CRITICAL: Erase all {records.length} records?
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowConfirmResetAll(false)}
                        className="px-2.5 py-1 rounded bg-white hover:bg-slate-100 text-slate-700 font-bold text-[11px] border border-slate-300 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleResetAllRecords}
                        className="px-3 py-1 rounded bg-red-700 hover:bg-red-800 text-white font-bold text-[11px] shadow-xs cursor-pointer"
                      >
                        Yes, Erase Everything
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Option C: Load Clean Realistic Demo Data */}
              <div className="p-4 rounded-lg border border-emerald-200 bg-emerald-50/50 space-y-3">
                <div className="flex items-center gap-2 text-emerald-950 font-bold">
                  <Database className="w-4 h-4 text-emerald-700" />
                  <span>Load Clean Demo Dataset (Zero Customer Data)</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Reset the database to clean, realistic synthetic demo fabric batches without any proprietary customer information. Perfect for demonstrations, training, and testing daily reports.
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    if (onLoadDemoRecords) {
                      await onLoadDemoRecords();
                      setFeedback({
                        message: 'Loaded realistic demo records into database. No customer data is stored.',
                        type: 'success',
                      });
                    }
                  }}
                  className="px-4 py-2 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Load Clean Demo Dataset (15 records)</span>
                </button>
              </div>
            </div>
          )}

          {/* 6. CANCELLED BATCHES (ADMIN CONTROL ONLY) */}
          {activeSection === 'cancelledBatches' && (
            <div className="space-y-6">
              {/* Header Box */}
              <div className="p-4 rounded-lg border border-amber-200 bg-amber-50/70 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-amber-100 text-amber-900 shrink-0">
                  <Ban className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-950">
                    Cancelled Batches Management
                  </h3>
                  <p className="text-[11px] text-amber-900 mt-1 leading-relaxed">
                    Batches cancelled here will <span className="font-bold underline">not count in pending</span> metrics (KPI summary blocks, pending counts, operational metrics, and daily reports). Cancelled batches <span className="font-bold underline">cannot be delivered</span> until an Admin reactivates them.
                  </p>
                </div>
              </div>

              {/* Cancel a Batch Tool */}
              <div className="p-4 rounded-lg border border-slate-200 bg-white space-y-4 shadow-2xs">
                <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                  <Ban className="w-4 h-4 text-rose-600" />
                  <span>Cancel Any Active Batch</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Search Batch Number or Development
                    </label>
                    <input
                      type="text"
                      value={cancelBatchSearch}
                      onChange={e => {
                        setCancelBatchSearch(e.target.value);
                        setSelectedBatchToCancel(null);
                      }}
                      placeholder="Search batch (e.g. F2603899, A2600071)..."
                      className="w-full text-xs p-2 border border-slate-300 rounded font-mono uppercase bg-slate-50/50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#04342c]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Reason for Cancellation (Optional)
                    </label>
                    <input
                      type="text"
                      value={cancellationReason}
                      onChange={e => setCancellationReason(e.target.value)}
                      placeholder="e.g. Yarn defect, customer cancelled, order on hold..."
                      className="w-full text-xs p-2 border border-slate-300 rounded bg-slate-50/50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#04342c]"
                    />
                  </div>
                </div>

                {/* Search Matching Active Batches Results */}
                {cancelBatchSearch.trim() && (
                  <div className="border border-slate-200 rounded-md overflow-hidden max-h-48 overflow-y-auto">
                    {matchingSearchBatches.length === 0 ? (
                      <div className="p-3 text-center text-slate-400 italic text-[11px]">
                        No matching active batches found.
                      </div>
                    ) : (
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 text-slate-700 font-bold text-[10px] uppercase">
                          <tr>
                            <th className="p-2">Batch</th>
                            <th className="p-2">Dev</th>
                            <th className="p-2">Status</th>
                            <th className="p-2 text-right">KG</th>
                            <th className="p-2 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {matchingSearchBatches.map(b => (
                            <tr
                              key={b.id}
                              className="hover:bg-slate-50"
                            >
                              <td className="p-2 font-mono font-bold text-slate-900">{b.batch}</td>
                              <td className="p-2 text-slate-700">{b.development}</td>
                              <td className="p-2">
                                <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold ${
                                  b.status === 'Delivered' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {b.status}
                                </span>
                              </td>
                              <td className="p-2 text-right font-mono text-slate-800">{b.kgQty}</td>
                              <td className="p-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleCancelBatchAction(b)}
                                  className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10.5px] flex items-center gap-1 mx-auto shadow-2xs cursor-pointer"
                                >
                                  <Ban className="w-3 h-3" />
                                  <span>Cancel Batch</span>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>

              {/* Currently Cancelled Batches List */}
              <div className="p-4 rounded-lg border border-slate-200 bg-white space-y-3 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                      Currently Cancelled Batches ({cancelledRecords.length})
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold border border-rose-200">
                      Excluded from Pending & Delivery Locked
                    </span>
                  </div>
                </div>

                {cancelledRecords.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 italic bg-slate-50 rounded border border-dashed border-slate-200">
                    No batches are currently cancelled. All active batches are available for processing.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-md overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#04342c] text-white font-bold text-[10.5px] uppercase">
                        <tr>
                          <th className="py-2.5 px-3">Batch</th>
                          <th className="py-2.5 px-3">Dev</th>
                          <th className="py-2.5 px-3">Customer</th>
                          <th className="py-2.5 px-3 text-center">Rolls</th>
                          <th className="py-2.5 px-3 text-right">KG</th>
                          <th className="py-2.5 px-3">Cancelled Time</th>
                          <th className="py-2.5 px-3">Cancelled By</th>
                          <th className="py-2.5 px-3">Reason</th>
                          <th className="py-2.5 px-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {cancelledRecords.map(rec => (
                          <tr key={rec.id} className="hover:bg-rose-50/30 transition-colors">
                            <td className="py-2.5 px-3 font-mono font-black text-rose-900">{rec.batch}</td>
                            <td className="py-2.5 px-3 font-semibold text-slate-800">{rec.development}</td>
                            <td className="py-2.5 px-3 text-slate-600">{rec.customerName || '-'}</td>
                            <td className="py-2.5 px-3 text-center font-bold">{rec.rollQty}</td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">{rec.kgQty}</td>
                            <td className="py-2.5 px-3 font-mono text-[10.5px] text-slate-600">{rec.cancelledAt || '-'}</td>
                            <td className="py-2.5 px-3 font-semibold text-slate-700">{rec.cancelledBy || 'Admin'}</td>
                            <td className="py-2.5 px-3 text-rose-700 italic text-[11px] max-w-[150px] truncate" title={rec.cancelReason}>
                              {rec.cancelReason || 'Cancelled by Admin'}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleActivateBatchAction(rec)}
                                className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center gap-1 mx-auto transition-colors shadow-2xs cursor-pointer"
                                title="Reactivate this batch so it can be delivered"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Activate Batch</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. DASHBOARD LAYOUT & REORDER */}
          {activeSection === 'layout' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Public Dashboard Section Arrangement
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Adjust the vertical display order of charts and items in the public dashboard.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResetLayout}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:text-slate-900 border border-slate-300 rounded hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Default Order</span>
                </button>
              </div>

              <div className="space-y-2">
                {currentSectionOrder.map((sectionId, idx) => {
                  const info = SECTION_DESCRIPTIONS[sectionId];
                  return (
                    <div
                      key={sectionId}
                      className="p-3 bg-white border border-slate-200 rounded-lg shadow-2xs flex items-center justify-between gap-3 hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-6 h-6 rounded-full bg-emerald-100 text-[#04342c] font-black text-xs flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5 truncate">
                            <span>{info?.icon || '📌'}</span>
                            <span>{info?.title || sectionId}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                            {info?.subtitle}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleMoveSection(idx, 'up')}
                          disabled={idx === 0}
                          className="p-1.5 rounded border border-slate-200 hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
                          title="Move Up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveSection(idx, 'down')}
                          disabled={idx === currentSectionOrder.length - 1}
                          className="p-1.5 rounded border border-slate-200 hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
                          title="Move Down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. USERS MANAGEMENT & PASSWORD */}
          {activeSection === 'users' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2">
                  Authorized Users & Credentials
                </h3>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden bg-white">
                  {users.map(u => {
                    const isEditing = editingUserId === u.id;
                    return (
                      <div key={u.id} className="p-3">
                        {isEditing ? (
                          <div className="p-3 bg-emerald-50/50 rounded-lg border border-emerald-200 space-y-3 animate-in fade-in duration-100">
                            <div className="text-xs font-bold text-[#04342c] flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <Edit2 className="w-3.5 h-3.5 text-emerald-700" />
                                <span>Edit User Profile: @{u.username}</span>
                              </span>
                              <span className="text-[10px] text-slate-500 font-normal">
                                ID: {u.id}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                                  Full Name
                                </label>
                                <input
                                  type="text"
                                  value={editFullName}
                                  onChange={e => setEditFullName(e.target.value)}
                                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white focus:outline-hidden focus:border-[#04342c]"
                                  required
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                                  Username
                                </label>
                                <input
                                  type="text"
                                  value={editUsername}
                                  onChange={e => setEditUsername(e.target.value.toLowerCase())}
                                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white focus:outline-hidden focus:border-[#04342c]"
                                  required
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                                  Role
                                </label>
                                <select
                                  value={editRole}
                                  onChange={e => setEditRole(e.target.value as 'admin' | 'editor')}
                                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white"
                                >
                                  <option value="editor">Editor (Operator)</option>
                                  <option value="admin">Admin (Full Access)</option>
                                </select>
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                                  New Password (leave blank to keep current)
                                </label>
                                <input
                                  type="text"
                                  value={editPassword}
                                  onChange={e => setEditPassword(e.target.value)}
                                  placeholder="Leave blank to keep current..."
                                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white font-mono"
                                />
                              </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-1 border-t border-emerald-100">
                              <button
                                type="button"
                                onClick={handleCancelEditUser}
                                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 cursor-pointer font-medium"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveEditUser(u.id)}
                                className="px-4 py-1.5 text-xs font-bold rounded bg-[#04342c] text-white hover:bg-[#032620] transition-colors cursor-pointer shadow-xs"
                              >
                                Save Changes
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="font-bold text-slate-900 text-xs">{u.fullName}</div>
                              <div className="text-[11px] text-slate-500 font-mono flex items-center gap-2 mt-0.5">
                                <span>@{u.username}</span>
                                <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded font-sans">
                                  {u.password ? 'Custom Password Set' : 'Default Pass (' + (u.role === 'admin' ? 'admin123' : 'editor123') + ')'}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded capitalize ${
                                  u.role === 'admin'
                                    ? 'bg-[#04342c] text-white'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {u.role}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleStartEditUser(u)}
                                className="text-slate-600 hover:text-[#04342c] p-1.5 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                                title="Edit Name, Username, Role, or Password"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              {u.username !== 'admin' && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(u.id, u.username)}
                                  className="text-red-500 hover:text-red-700 p-1.5 rounded hover:bg-red-50 transition-colors cursor-pointer"
                                  title="Remove user"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Add New User Form */}
              <form onSubmit={handleAddUser} className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5 text-[#04342c]" />
                  <span>Add New User</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                  <input
                    type="text"
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value.toLowerCase())}
                    placeholder="Username (e.g. kiron)"
                    className="px-2.5 py-1.5 rounded border border-slate-300 text-xs bg-white"
                    required
                  />
                  <input
                    type="text"
                    value={newFullName}
                    onChange={e => setNewFullName(e.target.value)}
                    placeholder="Full Name (e.g. Kiron Roy)"
                    className="px-2.5 py-1.5 rounded border border-slate-300 text-xs bg-white"
                    required
                  />
                  <select
                    value={newUserRole}
                    onChange={e => setNewUserRole(e.target.value as 'admin' | 'editor')}
                    className="px-2.5 py-1.5 rounded border border-slate-300 text-xs bg-white"
                  >
                    <option value="editor">Editor (Operator)</option>
                    <option value="admin">Admin (Full Access)</option>
                  </select>
                  <input
                    type="text"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Password (default: tpl123)"
                    className="px-2.5 py-1.5 rounded border border-slate-300 text-xs bg-white font-mono"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded bg-[#04342c] text-white font-bold text-xs hover:bg-[#032620] transition-colors cursor-pointer"
                >
                  Create User
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md bg-[#04342c] text-white text-xs font-bold hover:bg-[#032620] transition-colors"
          >
            Close Admin Panel
          </button>
        </div>
      </div>
    </div>
  );
};
