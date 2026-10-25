export type OrderType = 'Bulk' | 'Sample';

export type DeliveryStatus = 'Pending' | 'Delivered';

export type DeliveryPriority = 'Regular' | 'High' | 'Hold';

export interface DeliveryRecord {
  id: string;
  sl: number; // Serial Number
  orderType: OrderType;
  development: string; // Dev Code (e.g. PVPEEL002D, SVCBI0411C)
  batch: string; // Unique, uppercase
  customerName?: string; // Buyer / Customer / Party Name
  salesOrder?: string; // Sales Order / SO #
  rollQty: number; // Rolls count
  kgQty: number; // Decimal KG weight
  priority: DeliveryPriority; // Regular, High, or Hold
  color?: string; // Shade/color
  remarks?: string; // Remark
  receivedAt: string; // Timestamp (e.g. 2026-10-14 11:42:00)
  receivedBy: string; // e.g. Admin, Kiron, Monjil
  status: DeliveryStatus; // 'Pending' | 'Delivered'
  deliveredAt?: string | null; // e.g. 2026-10-14 09:04:52
  deliveredBy?: string | null; // e.g. Kiron, Monjil
  shortQty?: number; // Short/balance quantity
  requisitionImage?: string; // Base64 data URL for captured slip/image (Admin-only access)
  requisitionImageMimeType?: string; // e.g. image/jpeg, image/png
  createdAt: string;
  isCancelled?: boolean; // When true, does not count in pending and cannot be delivered until activated by Admin
  cancelledAt?: string; // Cancellation timestamp
  cancelledBy?: string; // Admin username who cancelled the batch
  cancelReason?: string; // Optional reason for cancellation
}

export type UserRole = 'admin' | 'editor';

export interface UserAccount {
  id: string;
  username: string;
  role: UserRole;
  fullName: string;
  password?: string; // Optional stored password (defaults to admin123/editor123/tpl123)
  lastActive?: string;
}

export type HeaderTheme = 'noras-green' | 'white';
export type LogoPlacement = 'left' | 'center' | 'both';
export type LogoChoice = 'logo1' | 'logo2' | 'default';

export type DashboardSectionId =
  | 'summary_cards'
  | 'trend_chart'
  | 'customer_short_pie'
  | 'calendar'
  | 'data_table';

export type WorkTimeOption =
  | '8am-5pm (Regular)'
  | '8am-8pm (Regular + OT to 8pm)'
  | '5pm-8pm (OT only)'
  | 'Custom';

export interface ManpowerActivity {
  id: string;
  date: string; // YYYY-MM-DD
  permanentManpowerQty: number; // Permanent manpower qty
  minRequiredExternalQty: number; // Minimum required external manpower qty
  actualExternalQty: number; // Actual external manpower qty
  workTime: WorkTimeOption; // 8am to 5pm regular, after that to 8 pm OT
  customWorkTime?: string; // Custom time if selected
  customUsesAndNote?: string; // Custom uses and note
  loggedBy?: string; // Admin username
  createdAt: string;

  // Optional legacy fields for backward compatibility
  workerType?: string;
  workerName?: string;
  workerCount?: number;
  shift?: string;
  activityType?: string;
  handledKg?: number;
  remarks?: string;
}

export interface AppSettings {
  headerTheme: HeaderTheme;
  logoPlacement: LogoPlacement;
  customLogo1?: string; // Base64 data URL for Logo 1 (e.g. Dark/Green)
  customLogo2?: string; // Base64 data URL for Logo 2 (e.g. White)
  publicLogoChoice: LogoChoice;
  loginLogoChoice: LogoChoice;
  reportLogoChoice: LogoChoice;
  dashboardSectionOrder?: DashboardSectionId[]; // Configurable order of public dashboard sections
}

export interface DateFilter {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  isFiltered: boolean;
}

export interface DeliverySummaryStats {
  deliveredBatches: number;
  deliveredRolls: number;
  deliveredKg: number;
  pendingBatches: number;
  pendingRolls: number;
  pendingKg: number;
  receivedBatches: number;
  receivedRolls: number;
  receivedKg: number;
  totalBatches: number;
  totalRolls: number;
  totalKg: number;
}

export type AdminExportType =
  | 'all'
  | 'previous-day'
  | 'selected-date'
  | 'pending'
  | 'aging'
  | 'development-wise'
  | 'batch-wise'
  | 'receiving-delivery-summary';
