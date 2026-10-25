/**
 * Talisman Performance Limited (TPL) — Greige Fabric Delivery Management System
 * Corporate Color: #04342c
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DeliveryRecord, UserRole, AppSettings, UserAccount, DateFilter, ManpowerActivity } from './types';
import {
  getStoredRecords,
  saveStoredRecords,
  getStoredSettings,
  saveStoredSettings,
  getStoredUsers,
  saveStoredUsers,
  getStoredManpowerActivities,
  saveStoredManpowerActivities,
  fetchDatabaseRecordsFromServer,
  fetchDatabaseSettingsFromServer,
  fetchDatabaseUsersFromServer,
  fetchDatabaseManpowerFromServer,
  bulkDeleteRecordsOnServer,
  resetRecordsOnServer,
  loadDemoRecordsFromServer,
  getDefault7DayRange,
  formatDateToLocalISO,
  formatDateToYYYYMMDD,
  formatCurrentDateTime,
} from './services/storage';
import { Header } from './components/Header';
import { PublicDashboard } from './components/PublicDashboard';
import { AuthenticatedWorkspace } from './components/AuthenticatedWorkspace';
import { NewEntryModal } from './components/NewEntryModal';
import { DailyReportModal } from './components/DailyReportModal';
import { LoginModal } from './components/LoginModal';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { AdminPanelModal, AdminSection } from './components/AdminPanelModal';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  // Authentication Role: null (Public Dashboard), 'admin', or 'editor'
  const [currentRole, setCurrentRole] = useState<UserRole | null>(null);
  const [currentUser, setCurrentUser] = useState<string>('Admin');

  // App Settings (Header presentation & Logo placement)
  const [settings, setSettings] = useState<AppSettings>(() => {
    return getStoredSettings();
  });

  // Users List (Admin user management)
  const [users, setUsers] = useState<UserAccount[]>(() => {
    return getStoredUsers();
  });

  // Business records
  const [records, setRecords] = useState<DeliveryRecord[]>(() => {
    return getStoredRecords();
  });

  // Manpower Activities (Permanent Employees & External Loaders)
  const [manpowerActivities, setManpowerActivities] = useState<ManpowerActivity[]>(() => {
    return getStoredManpowerActivities();
  });

  // Admin Panel active section switcher
  const [adminPanelSection, setAdminPanelSection] = useState<AdminSection>('branding');

  // Guard against overwriting local bulk deletions with stale focus sync
  const lastLocalDeleteTimeRef = useRef<number>(0);

  // Synchronize with server database & listen for storage events across tabs
  const syncWithDatabase = useCallback(async () => {
    // If a deletion was performed in the last 5 seconds, do not overwrite with server
    if (Date.now() - lastLocalDeleteTimeRef.current < 5000) {
      return;
    }

    try {
      const serverRecords = await fetchDatabaseRecordsFromServer();
      if (Array.isArray(serverRecords)) {
        setRecords(serverRecords);
      }

      const serverSettings = await fetchDatabaseSettingsFromServer();
      if (serverSettings) {
        setSettings(serverSettings);
      }

      const serverUsers = await fetchDatabaseUsersFromServer();
      if (serverUsers) {
        setUsers(serverUsers);
      }

      const serverManpower = await fetchDatabaseManpowerFromServer();
      if (serverManpower && serverManpower.length > 0) {
        setManpowerActivities(serverManpower);
      }
    } catch (e) {
      console.warn('Sync attempt failed:', e);
    }
  }, []);

  useEffect(() => {
    // Initial sync with server database on startup
    syncWithDatabase();

    // Listen for localStorage changes across browser tabs
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'tpl_greige_delivery_records_v4' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setRecords(parsed);
        } catch (_) {}
      }
      if (e.key === 'tpl_greige_app_settings_v3' && e.newValue) {
        try {
          setSettings(JSON.parse(e.newValue));
        } catch (_) {}
      }
      if (e.key === 'tpl_greige_users_v3' && e.newValue) {
        try {
          setUsers(JSON.parse(e.newValue));
        } catch (_) {}
      }
      if (e.key === 'tpl_greige_manpower_activities_v1' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setManpowerActivities(parsed);
        } catch (_) {}
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // Sync when tab regains focus
    const handleFocus = () => {
      syncWithDatabase();
    };
    window.addEventListener('focus', handleFocus);

    // Periodic sync every 15s to keep all connected users updated
    const interval = setInterval(syncWithDatabase, 15000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, [syncWithDatabase]);

  // Public & Authenticated Date Filter (Default: Last 7 calendar days including today)
  const [dateFilter, setDateFilter] = useState<DateFilter>(() => {
    const range = getDefault7DayRange();
    return {
      startDate: range.startDate,
      endDate: range.endDate,
      isFiltered: true,
    };
  });

  // Modals state
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isNewEntryOpen, setIsNewEntryOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<DeliveryRecord | null>(null);
  const [isDailyReportOpen, setIsDailyReportOpen] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<DeliveryRecord | null>(null);

  // Settings update handler
  const handleUpdateSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    saveStoredSettings(newSettings);
  };

  // Users update handler
  const handleUpdateUsers = (newUsers: UserAccount[]) => {
    setUsers(newUsers);
    saveStoredUsers(newUsers);
  };

  // Add / Edit record handler - Preserves original createdAt and cancellation state
  const handleSaveRecord = (recordToSave: DeliveryRecord) => {
    let updated: DeliveryRecord[];
    const existing = records.find(r => r.id === recordToSave.id);

    const safeRecord: DeliveryRecord = {
      ...recordToSave,
      createdAt: existing?.createdAt || recordToSave.createdAt || formatCurrentDateTime(),
      isCancelled: existing?.isCancelled ?? recordToSave.isCancelled ?? false,
      cancelledAt: existing?.cancelledAt ?? recordToSave.cancelledAt,
      cancelledBy: existing?.cancelledBy ?? recordToSave.cancelledBy,
      cancelReason: existing?.cancelReason ?? recordToSave.cancelReason,
    };

    if (existing) {
      updated = records.map(r => (r.id === recordToSave.id ? safeRecord : r));
    } else {
      updated = [safeRecord, ...records];
    }

    setRecords(updated);
    saveStoredRecords(updated);
    setEditRecord(null);
  };

  // 1-Click Status toggle (Delivered <-> Pending) - Blocks delivery if batch is cancelled by Admin
  const handleToggleStatus = (rec: DeliveryRecord) => {
    if (rec.isCancelled && rec.status !== 'Delivered') {
      alert(`Batch "${rec.batch}" is currently CANCELLED by an Admin. It cannot be delivered until an Admin reactivates it in the Admin Menu.`);
      return;
    }
    const nowTime = formatCurrentDateTime();
    const isNowDelivered = rec.status !== 'Delivered';

    const updated = records.map(r => {
      if (r.id === rec.id) {
        return {
          ...r,
          status: isNowDelivered ? ('Delivered' as const) : ('Pending' as const),
          deliveredAt: isNowDelivered ? nowTime : null,
          deliveredBy: isNowDelivered ? currentUser : null,
        };
      }
      return r;
    });

    setRecords(updated);
    saveStoredRecords(updated);
  };

  // Admin cancel / reactivate batch handler
  const handleToggleCancelBatch = (recordId: string, cancel: boolean, reason?: string) => {
    if (currentRole !== 'admin') {
      alert('Unauthorized: Only Admin users can cancel or reactivate batches.');
      return;
    }
    const nowTime = formatCurrentDateTime();
    const updated = records.map(r => {
      if (r.id === recordId) {
        return {
          ...r,
          isCancelled: cancel,
          cancelledAt: cancel ? nowTime : undefined,
          cancelledBy: cancel ? currentUser : undefined,
          cancelReason: cancel ? (reason || 'Cancelled by Admin') : undefined,
        };
      }
      return r;
    });
    setRecords(updated);
    saveStoredRecords(updated);
  };

  // Delete record (Admin only)
  const handleConfirmDelete = async () => {
    if (!recordToDelete || currentRole !== 'admin') return;
    const idToDelete = recordToDelete.id;
    lastLocalDeleteTimeRef.current = Date.now();

    const updated = records.filter(r => r.id !== idToDelete);
    setRecords(updated);
    saveStoredRecords(updated);
    setRecordToDelete(null);

    await bulkDeleteRecordsOnServer([idToDelete]);
  };

  // Bulk delete records (Admin only)
  const handleBulkDeleteRecords = async (recordIds: string[]) => {
    if (currentRole !== 'admin') return;
    lastLocalDeleteTimeRef.current = Date.now();

    const toDelete = new Set(recordIds);
    const updated = records.filter(r => !toDelete.has(r.id));
    setRecords(updated);
    saveStoredRecords(updated);

    // Call atomic server endpoint
    const serverRemaining = await bulkDeleteRecordsOnServer(recordIds);
    if (serverRemaining) {
      setRecords(serverRemaining);
    }
  };

  // Load clean realistic demo records (Admin tool, clears customer data)
  const handleLoadDemoRecords = async () => {
    lastLocalDeleteTimeRef.current = Date.now();
    const demo = await loadDemoRecordsFromServer();
    if (demo) {
      setRecords(demo);
    }
  };

  // Bulk deliver records (Skips cancelled batches)
  const handleBulkDeliverRecords = (recordIds: string[]) => {
    const toDeliver = new Set(recordIds);
    const nowTime = formatCurrentDateTime();
    let blockedCount = 0;
    const updated = records.map(r => {
      if (toDeliver.has(r.id)) {
        if (r.isCancelled) {
          blockedCount++;
          return r; // Cannot deliver cancelled batch
        }
        return {
          ...r,
          status: 'Delivered' as const,
          deliveredAt: nowTime,
          deliveredBy: currentUser,
        };
      }
      return r;
    });
    if (blockedCount > 0) {
      alert(`${blockedCount} cancelled ${blockedCount === 1 ? 'batch was' : 'batches were'} skipped because cancelled batches cannot be delivered until reactivated.`);
    }
    setRecords(updated);
    saveStoredRecords(updated);
  };

  // Import full JSON records
  const handleImportRecords = (newRecords: DeliveryRecord[]) => {
    setRecords(newRecords);
    saveStoredRecords(newRecords);
  };

  // Bulk add records (Admin bulk tool)
  const handleBulkAddRecords = (newRecords: DeliveryRecord[]) => {
    const updated = [...newRecords, ...records];
    setRecords(updated);
    saveStoredRecords(updated);
  };

  // Logout returns user to Public Dashboard (7-day view)
  const handleLogout = () => {
    setCurrentRole(null);
    setEditRecord(null);
    const range = getDefault7DayRange();
    setDateFilter({
      startDate: range.startDate,
      endDate: range.endDate,
      isFiltered: true,
    });
  };

  // Manpower activities update handler
  const handleUpdateManpowerActivities = (newActivities: ManpowerActivity[]) => {
    setManpowerActivities(newActivities);
    saveStoredManpowerActivities(newActivities);
  };

  const handleOpenAdminPanel = (section: AdminSection = 'branding') => {
    setAdminPanelSection(section);
    setIsAdminPanelOpen(true);
  };

  // Resolve logo source based on which logo was assigned for each context
  const getLogoForChoice = (choice: 'default' | 'logo1' | 'logo2') => {
    if (choice === 'logo1') return settings.customLogo1;
    if (choice === 'logo2') return settings.customLogo2;
    return undefined;
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans antialiased text-slate-800">
      {/* Header - TPL logo, Login/Logout, and Admin Menu */}
      <Header
        currentRole={currentRole}
        headerTheme={settings.headerTheme}
        logoPlacement={settings.logoPlacement}
        customLogoSrc={getLogoForChoice(settings.publicLogoChoice)}
        onOpenLogin={() => setIsLoginOpen(true)}
        onLogout={handleLogout}
        onOpenAdminPanel={currentRole === 'admin' ? () => handleOpenAdminPanel('branding') : undefined}
        onOpenManpower={currentRole === 'admin' ? () => handleOpenAdminPanel('manpower') : undefined}
      />

      {/* Main Content Area - Exactly Two Screen Experiences */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentRole ? (
          /* Authenticated Workspace (Admin and Editor with Main Database Table from Image 1) */
          <AuthenticatedWorkspace
            currentRole={currentRole}
            currentUser={currentUser}
            records={records}
            dateFilter={dateFilter}
            onFilterChange={setDateFilter}
            onOpenNewEntry={() => {
              setEditRecord(null);
              setIsNewEntryOpen(true);
            }}
            onEditRecord={rec => {
              setEditRecord(rec);
              setIsNewEntryOpen(true);
            }}
            onOpenDailyReport={() => setIsDailyReportOpen(true)}
            onRequestDelete={rec => setRecordToDelete(rec)}
            onBulkDeleteRecords={handleBulkDeleteRecords}
            onBulkDeliverRecords={handleBulkDeliverRecords}
            onBulkAddRecords={handleBulkAddRecords}
            onToggleStatus={handleToggleStatus}
            onSaveRecord={handleSaveRecord}
            onOpenManpower={() => handleOpenAdminPanel('manpower')}
            onToggleCancelBatch={handleToggleCancelBatch}
            onOpenAdminCancelled={() => handleOpenAdminPanel('cancelledBatches')}
          />
        ) : (
          /* Public Dashboard (Default view without login, round figures, Delivery summary table) */
          <PublicDashboard
            records={records}
            dateFilter={dateFilter}
            onFilterChange={setDateFilter}
            sectionOrder={settings.dashboardSectionOrder}
          />
        )}
      </main>

      {/* Note: Footer has been completely removed as requested */}

      {/* Login Modal */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        users={users}
        onLoginSuccess={(role, name) => {
          setCurrentRole(role);
          setCurrentUser(name || (role === 'admin' ? 'Admin' : 'Editor'));
          const today = formatDateToYYYYMMDD(new Date());
          setDateFilter({
            startDate: today,
            endDate: today,
            isFiltered: true,
          });
        }}
        customLogoSrc={getLogoForChoice(settings.loginLogoChoice)}
      />

      {/* New / Edit Entry Modal with AI OCR Scanner */}
      <NewEntryModal
        isOpen={isNewEntryOpen}
        onClose={() => {
          setIsNewEntryOpen(false);
          setEditRecord(null);
        }}
        onSave={handleSaveRecord}
        existingRecords={records}
        editRecord={editRecord}
        currentUser={currentUser}
        currentRole={currentRole}
      />

      {/* Official Daily Report Modal */}
      <DailyReportModal
        isOpen={isDailyReportOpen}
        onClose={() => setIsDailyReportOpen(false)}
        records={records}
        customLogoSrc={getLogoForChoice(settings.reportLogoChoice) || settings.customLogo1 || settings.customLogo2}
        initialReportDate={dateFilter.endDate || dateFilter.startDate}
      />

      {/* Admin Deletion Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={!!recordToDelete}
        record={recordToDelete}
        onClose={() => setRecordToDelete(null)}
        onConfirm={handleConfirmDelete}
      />

      {/* Admin Special Access Panel Modal */}
      <ErrorBoundary fallbackTitle="Admin Panel Encountered an Issue" onReset={() => setIsAdminPanelOpen(false)}>
        <AdminPanelModal
          isOpen={isAdminPanelOpen}
          onClose={() => setIsAdminPanelOpen(false)}
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          records={records}
          onImportRecords={handleImportRecords}
          users={users}
          onUpdateUsers={handleUpdateUsers}
          manpowerActivities={manpowerActivities}
          onUpdateManpowerActivities={handleUpdateManpowerActivities}
          currentUser={currentUser}
          initialSection={adminPanelSection}
          onToggleCancelBatch={handleToggleCancelBatch}
          onBulkDeleteRecords={handleBulkDeleteRecords}
          onLoadDemoRecords={handleLoadDemoRecords}
        />
      </ErrorBoundary>
    </div>
  );
}
