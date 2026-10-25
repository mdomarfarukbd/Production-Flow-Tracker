# Production Flow Tracker — Project Guide & Crucial Instructions

This document serves as the single source of truth for the **Production Flow Tracker**, documenting core architecture, data synchronization rules, daily report business logic, security permissions, and operational procedures.

---

## 1. Project Overview & Architecture

### Purpose
The Production Flow Tracker is an operations application designed for supervisors, floor operators, and administrators to track the lifecycle of batches from receiving to completion, monitor aging, manage priorities, perform AI requisition scanning, generate official daily reports, and audit day-wise manpower activities.

### Tech Stack
- **Frontend**: React 19 SPA, TypeScript, Vite, Tailwind CSS, Lucide Icons, Canvas 2D Rendering.
- **Backend**: Node.js Express server (`server.ts`) running concurrently with Vite dev middleware on port 3000.
- **Storage**: JSON-backed disk database at `data/records.json` with automated backups and atomic write operations.
- **AI Engine**: Google GenAI SDK (`@google/genai`) using `gemini-2.5-flash` for document OCR.

---

## 2. Crucial Date & Time Handling Rules (Zero UTC Drift)

### Reference & Benchmarks
- All timestamps represent **Bangladesh Local Time** (`Asia/Dhaka`, UTC+6).
- Format: `YYYY-MM-DD HH:mm:ss` (e.g., `2026-08-18 17:58:38`).
- **Never convert or shift timestamps via `.toISOString()` or local UTC timezone calculations.**

### Verified Test Case Batch: `A2600071`
- `batch`: `A2600071`
- `createdAt`: `2026-08-18 17:58:38` (Immutable creation timestamp)
- `deliveredAt`: `2026-08-27 15:55:05` (Actual completion/delivery timestamp)
- `status`: `delivered`

### Core Data Integrity Rules
1. **Field Mappings**:
   - `createdAt` maps strictly to SQL `created_at`.
   - `deliveredAt` maps strictly to SQL `completed_at`.
   - `receivedAt` represents the physical receiving/entry date (`YYYY-MM-DD`). Never substitute one timestamp for another.
2. **Preserve Creation Timestamps**:
   - Set `createdAt` once upon record creation.
   - Never overwrite `createdAt` when editing records, marking batches as delivered, exporting/importing, or synchronizing with the server.
3. **Correct Delivery Timestamps**:
   - When marking a batch as `delivered`, stamp the current local date-time into `deliveredAt`.
   - Preserve historical `deliveredAt` values during all import/export/sync cycles.
   - Never set `deliveredAt = createdAt`.

---

## 3. Daily Report & Historical Timeline Business Rules

### Historical Timeline Rule
The Daily Report is time-travel capable based on the selected `reportDate` (`YYYY-MM-DD`):
- **Future batches**: Batches received *after* `reportDate` must **NOT** appear in the report (neither as pending nor delivered).
- **Historical pending**: If a batch was received on or before `reportDate` and was *not* yet delivered on or before `reportDate`, it **MUST** appear as **Pending** on `reportDate`'s report (even if it was delivered on a later day).
- **Delivered today**: If a batch was delivered on `reportDate`, it appears as **Delivered** in `reportDate`'s report.
- **Example**:
  - Batch received Yesterday and not yet delivered: Shows as pending on Yesterday's report AND pending on Today's report.
  - Batch received Today: Does **NOT** appear on Yesterday's report; shows as pending on Today's report.

### Sample Consolidation Rule
- If records are marked as sample (`isSample: true`, or `development` matches `/^sample/i` or `type: 'Sample'`), they are **merged into one consolidated row titled `"Sample"`** in the Daily Report summary.

### Typography & Visual Requirements
- **Quantities in Bold**: All quantities (Delivered Batch Qty, Delivery KG Qty, Pending Batch Qty, Pending KG Qty, and Total Row) must be rendered in bold font (`font-bold` / `font-black font-mono`).
- **Integer KG**: KG quantities are rounded to whole integers (`Math.round()`).
- **No Total KG Column**: The table contains 5 distinct columns: Development, Delivered Batch Qty, Delivery KG Qty, Pending Batch Qty, Pending KG Qty.
- **Dynamic Page Height**:
  - The canvas and preview container dynamically calculate their height:
    `tableHeight = tableHeaderHeight + (rowsCount * tableRowHeight) + totalRowHeight;`
    `totalHeight = headerHeight + tableHeight + 60;`
  - Generous bottom padding ensures the corporate double border (`#04342c`) and corner flourishes never overlap the table or total row, even with large datasets.
- **Branding Placeholders**:
  - Default branding renders `[Company Name]` and `[Company Logo]` placeholders.
  - If an administrator uploads a custom logo image via the Admin Settings, the custom logo is rendered instead.

---

## 4. Batch Cancellation & Security Control

### Business Logic
- Only users with the `admin` role can access the cancellation feature.
- Cancelled batches (`status: 'cancelled'`):
  - Do **NOT** count towards pending batch counts or pending KG quantities.
  - **Cannot** be marked as delivered by operators or editors.
  - Display a distinct red/rose badge indicating cancellation.
- Only an `admin` can reactivate a cancelled batch back to `pending`.

---

## 5. Bulk Deletion & Atomic Persistence

### The Problem (24 Ghost Records Reverting After Delete)
Previously, deleting all records or resetting the database caused 24 old seed records to respawn ("ghost records") within 1 second.
Root causes identified and eliminated:
1. `getStoredRecords()` in `src/services/storage.ts`: When `localStorage` had `[]`, it checked `if (Array.isArray(parsed) && parsed.length > 0)`. Because `parsed.length === 0`, it treated `[]` as invalid and called `generateInitialRecords()`, which returned 24 hardcoded seed records!
2. `server.ts` `GET /api/records`: Returned `{ records: records.length > 0 ? records : null }`. When `records` was empty `[]`, it sent `null`.
3. `src/App.tsx` `syncWithDatabase()`: When `serverRecords` was `null`, it fell back to `localRecords = getStoredRecords()` (the 24 records) and saved them back to the server!
4. An aggressive server safeguard prevented saving payloads `<= 15` records, rejecting user deletions.

### The Solution
1. **Empty Array Is Authoritative**:
   - `getStoredRecords()` now recognizes `[]` as an intentional empty state and returns `[]`. It never resurrects seed data once initialized.
   - `GET /api/records` on the server returns `records: []` instead of `null`.
   - `syncWithDatabase()` in `App.tsx` directly accepts `[]` without triggering seed fallback.
2. **Dedicated Atomic Endpoints**:
   - `POST /api/records/bulk-delete` with `{ ids: string[] }`: Atomically removes records from disk.
   - `POST /api/records/reset`: Safely clears database to `[]`.
   - `POST /api/records/load-demo`: Restores clean, realistic synthetic demo data without proprietary customer information.
3. **Deletion Cooldown (`lastLocalDeleteTimeRef`)**:
   - 5000ms guard prevents window focus / tab re-focus from re-fetching before writes finalize.

---

## 6. AI Requisition Document Scanning (Mobile Phone Optimized)

### Phone Camera Preprocessing (`preprocessPhoneImage`)
- Modern smartphones produce 8–15 MB raw images (3000x4000+ pixels) that time out when sent over mobile connections or base64 payloads.
- Before transmission, client-side preprocessing:
  1. Loads the image onto an HTML5 canvas.
  2. Rescales the max dimension (width or height) to **1920px**, preserving exact aspect ratio.
  3. Re-encodes the image to a clean JPEG at **0.88 quality**.
  4. Reduces payload size from ~12MB down to ~350–450KB while retaining high-contrast edge clarity for OCR.

### Server OCR Processing (`POST /api/scan-document`)
- Uses `gemini-2.5-flash` with fallback models (`gemini-2.0-flash`, `gemini-1.5-flash`).
- Uses `config: { responseMimeType: 'application/json' }` to guarantee clean structured JSON.
- Robust against folded paper, wrinkles, handwriting, warehouse lighting, skewed camera angles, and dot-matrix typography.
- Extracts:
  - `batch`: Cleaned uppercase alphanumeric code.
  - `development`: Fabric style/development identifier.
  - `rollQty`: Number of rolls as positive integer.
  - `kgQty`: Weight in KG as positive number.
  - `receivedAt`: Date extracted from requisition header (`YYYY-MM-DD`).
  - `remarks`: Any special tags (e.g. "Sample", "Emergency", "Wash test").
  - `isSample`: True if tagged as sample.

---

## 7. Role-Based Permissions Summary

| Feature | Public / Viewer | Editor | Admin |
| :--- | :---: | :---: | :---: |
| View Live Dashboard & Batches | Yes | Yes | Yes |
| Export Excel / Daily Report PNG | Yes | Yes | Yes |
| Add Single Entry / Scan Requisition | No | Yes | Yes |
| Mark Batch as Delivered | No | Yes | Yes |
| Edit Batch Details | No | Yes | Yes |
| Cancel / Reactivate Batch | No | No | **Yes** |
| Single / Bulk Delete Records | No | No | **Yes** |
| Reset All Database Records | No | No | **Yes** |
| Custom Logo Upload & Theme Settings | No | No | **Yes** |
| SQL / JSON Backup & Restore | No | No | **Yes** |
| Manpower & Daily Activity Logs | No | No | **Yes** |

---

## 8. Development & Maintenance Commands

- **Build / Verification**:
  ```bash
  npm run build
  ```
- **Run Application**:
  ```bash
  npm run dev
  ```
- **Database File**:
  - Live state: `/data/records.json`
  - Emergency historical backup: `/data/records_backup_before_date_fix.json`
