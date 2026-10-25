import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = 3000;

// Body parser with 100mb limit for massive SQL dump files and document images
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

import fs from 'node:fs';
import path from 'node:path';
import { parseSqlDump } from './src/services/sqlParser';

// Data directory for persistent server database
const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const RECORDS_FILE = path.join(DATA_DIR, 'records.json');
const RECORDS_BAK_FILE = path.join(DATA_DIR, 'records.json.bak');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MANPOWER_FILE = path.join(DATA_DIR, 'manpower.json');

// Healthcheck endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Helper to safely read existing records from database
function loadExistingRecords(): any[] {
  try {
    if (fs.existsSync(RECORDS_FILE)) {
      const content = fs.readFileSync(RECORDS_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {
    console.error('Error reading records.json, trying backup:', e);
    if (fs.existsSync(RECORDS_BAK_FILE)) {
      try {
        const bakContent = fs.readFileSync(RECORDS_BAK_FILE, 'utf-8');
        const parsedBak = JSON.parse(bakContent);
        return Array.isArray(parsedBak) ? parsedBak : [];
      } catch (_) {}
    }
  }
  return [];
}

// Database API: Get all delivery records
app.get('/api/records', (_req, res) => {
  try {
    const records = loadExistingRecords();
    return res.json({ success: true, records: Array.isArray(records) ? records : [] });
  } catch (err: any) {
    console.error('Error reading records from database:', err);
    return res.status(500).json({ error: 'Failed to read records' });
  }
});

// Database API: Load clean Demo Data
app.post('/api/records/load-demo', (_req, res) => {
  try {
    const demoFilePath = path.join(DATA_DIR, 'demo_records.json');
    let demoData: any[] = [];
    if (fs.existsSync(demoFilePath)) {
      demoData = JSON.parse(fs.readFileSync(demoFilePath, 'utf-8'));
    }

    if (fs.existsSync(RECORDS_FILE)) {
      try {
        fs.copyFileSync(RECORDS_FILE, RECORDS_BAK_FILE);
      } catch (_) {}
    }

    const tempFile = `${RECORDS_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(demoData, null, 2), 'utf-8');
    fs.renameSync(tempFile, RECORDS_FILE);

    console.log(`[Demo Data] Loaded ${demoData.length} clean demo records into database.`);
    return res.json({ success: true, count: demoData.length, records: demoData });
  } catch (err: any) {
    console.error('Error loading demo records:', err);
    return res.status(500).json({ success: false, error: 'Failed to load demo records' });
  }
});

// Database API: Direct SQL Dump Import & Instant Sync Endpoint
app.post('/api/import-sql', (req, res) => {
  try {
    const { sqlText } = req.body;
    if (!sqlText || typeof sqlText !== 'string') {
      return res.status(400).json({ success: false, error: 'sqlText must be a non-empty string' });
    }

    const currentRecords = loadExistingRecords();
    const { parsedRecords, mergedRecords, addedCount, updatedCount } = parseSqlDump(sqlText, currentRecords);

    if (parsedRecords.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid batch records found in SQL script. Please verify your SQL file has INSERT INTO statements with batch numbers.',
      });
    }

    // Atomic database update with backup
    if (fs.existsSync(RECORDS_FILE)) {
      try {
        fs.copyFileSync(RECORDS_FILE, RECORDS_BAK_FILE);
      } catch (_) {}
    }
    const tempFile = `${RECORDS_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(mergedRecords, null, 2), 'utf-8');
    fs.renameSync(tempFile, RECORDS_FILE);

    console.log(`[SQL Import] Successfully merged ${parsedRecords.length} records (${addedCount} added, ${updatedCount} updated). Total in DB: ${mergedRecords.length}`);

    return res.json({
      success: true,
      addedCount,
      updatedCount,
      totalCount: mergedRecords.length,
      records: mergedRecords,
    });
  } catch (err: any) {
    console.error('Error importing SQL dump on server:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to parse and save SQL dump on server',
    });
  }
});

// Database API: Save/Sync all delivery records
app.post('/api/records', (req, res) => {
  try {
    const { records } = req.body;
    if (!Array.isArray(records)) {
      return res.status(400).json({ error: 'Records must be an array' });
    }

    // Backup current records before overwriting
    if (fs.existsSync(RECORDS_FILE)) {
      try {
        fs.copyFileSync(RECORDS_FILE, RECORDS_BAK_FILE);
      } catch (_) {}
    }

    const tempFile = `${RECORDS_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(records, null, 2), 'utf-8');
    fs.renameSync(tempFile, RECORDS_FILE);

    return res.json({ success: true, count: records.length });
  } catch (err: any) {
    console.error('Error saving records to database:', err);
    return res.status(500).json({ error: 'Failed to save records' });
  }
});

// Database API: Atomic Bulk Delete Endpoint (Permanent, immediately written to disk)
app.post('/api/records/bulk-delete', (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'ids must be a non-empty array' });
    }

    const currentRecords = loadExistingRecords();
    const toDeleteSet = new Set(ids);
    const remaining = currentRecords.filter((r: any) => !toDeleteSet.has(r.id));

    // Backup current database before deleting
    if (fs.existsSync(RECORDS_FILE)) {
      try {
        fs.copyFileSync(RECORDS_FILE, RECORDS_BAK_FILE);
      } catch (_) {}
    }

    const tempFile = `${RECORDS_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(remaining, null, 2), 'utf-8');
    fs.renameSync(tempFile, RECORDS_FILE);

    console.log(`[Bulk Delete] Successfully deleted ${ids.length} records. Remaining in DB: ${remaining.length}`);
    return res.json({
      success: true,
      deletedCount: ids.length,
      remainingCount: remaining.length,
      records: remaining,
    });
  } catch (err: any) {
    console.error('Error executing atomic bulk delete on server:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete records on server' });
  }
});

// Database API: Atomic Database Reset Endpoint
app.post('/api/records/reset', (_req, res) => {
  try {
    if (fs.existsSync(RECORDS_FILE)) {
      try {
        fs.copyFileSync(RECORDS_FILE, RECORDS_BAK_FILE);
      } catch (_) {}
    }
    fs.writeFileSync(RECORDS_FILE, '[]', 'utf-8');
    console.log('[Database Reset] Authoritative database cleared.');
    return res.json({ success: true, records: [] });
  } catch (err: any) {
    console.error('Error resetting database on server:', err);
    return res.status(500).json({ success: false, error: 'Failed to reset database on server' });
  }
});

// Database API: Get app settings
app.get('/api/settings', (_req, res) => {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const content = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      const settings = JSON.parse(content);
      return res.json({ success: true, settings });
    }
    return res.json({ success: true, settings: null });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to read settings' });
  }
});

// Database API: Save app settings
app.post('/api/settings', (req, res) => {
  try {
    const { settings } = req.body;
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to save settings' });
  }
});

// Database API: Get user accounts
app.get('/api/users', (_req, res) => {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const content = fs.readFileSync(USERS_FILE, 'utf-8');
      const users = JSON.parse(content);
      return res.json({ success: true, users });
    }
    return res.json({ success: true, users: null });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to read users' });
  }
});

// Database API: Save user accounts
app.post('/api/users', (req, res) => {
  try {
    const { users } = req.body;
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to save users' });
  }
});

// Database API: Get manpower activity records
app.get('/api/manpower', (_req, res) => {
  try {
    if (fs.existsSync(MANPOWER_FILE)) {
      const content = fs.readFileSync(MANPOWER_FILE, 'utf-8');
      const activities = JSON.parse(content);
      return res.json({ success: true, activities: Array.isArray(activities) ? activities : [] });
    }
    return res.json({ success: true, activities: null });
  } catch (err: any) {
    console.error('Error reading manpower from database:', err);
    return res.status(500).json({ error: 'Failed to read manpower records' });
  }
});

// Database API: Save manpower activity records
app.post('/api/manpower', (req, res) => {
  try {
    const { activities } = req.body;
    if (!Array.isArray(activities)) {
      return res.status(400).json({ error: 'Activities must be an array' });
    }
    fs.writeFileSync(MANPOWER_FILE, JSON.stringify(activities, null, 2), 'utf-8');
    return res.json({ success: true, count: activities.length });
  } catch (err: any) {
    console.error('Error saving manpower to database:', err);
    return res.status(500).json({ error: 'Failed to save manpower records' });
  }
});

// AI Document OCR & Data Extraction endpoint for Requisition Slips (Smartphone camera optimized)
app.post('/api/scan-document', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ success: false, error: 'No image data provided' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ success: false, error: 'GEMINI_API_KEY is not configured on the server' });
    }

    const ai = new GoogleGenAI({ apiKey });
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z0-9-+.]+;base64,/i, '').trim();

    const promptText = `You are a high-precision computer vision and OCR engine specialized in extracting data from textile greige fabric delivery requisition slips, issue slips, store challans, and inspection memos.

The image is captured by a smartphone camera in a warehouse/factory environment. It may contain:
- Hand-written numbers or text with ballpoint pen, marker, or pencil.
- Dot-matrix printed or computer-printed tables.
- Creases, folds, paper wrinkles, shadows, or angled/tilted orientation.
- Rubber company stamps, signatures, or checkmarks.

Examine the ENTIRE document thoroughly and extract the following 10 fields:

1. "batch": The unique Batch / Lot code (e.g. "F2603887", "F2603878", "SF2600593", "A2600071"). Look for text near "Batch", "Batch No", "Lot No", "Lot #", "B/No", or prominent alphanumeric codes.
2. "salesOrder": Sales Order / Order Number / SO # (e.g. "SO# 12345", "SO-2026-...", "Order: ...").
3. "development": The fabric Development / Quality / Construction Code (e.g. "SVCBI0411C", "PVPEEL002D", "D-927(2)", "SCOTV0770A", "PPOLV0550A", "IPOLV0117E").
4. "customerName": The actual CUSTOMER / PARTY / CONSIGNEE / CLIENT / FACTORY name (look near "Customer:", "Customer Name:", "Party:", "Party Name:", "M/s:", "Consignee:", "Unit:", "Factory:", "To:").
   - CRITICAL RULE: Do NOT substitute the Buyer/Brand name for customerName! In textile manufacturing, Customer/Party represents the receiving garment factory or customer unit (e.g. "Apex Fashion", "Blue Ridge Apparel", "Echotex", "DBL", "Pacific", "Ha-Meem"). If both Customer and Buyer are shown on the slip, customerName MUST strictly be the Customer/Party/Factory, NOT the Buyer.
5. "buyerName": The Buyer / Apparel Brand if separately indicated (e.g. text near "Buyer:", "Brand:", or brands like "Target", "Decathlon", "PVH", "H&M", "Nike", "Zara", "Next", "C&A", "Lululemon", "Marks & Spencer").
6. "color": Shade or color description (e.g. "Stony Grey", "Off White", "Navy Blue", "Black", "Coral", "Olive").
7. "orderType": Must be either "Sample" or "Bulk".
   - CRITICAL RULE: If the Batch ID starts with "SF" (e.g. SF2600593) or the document mentions "Sample" / "Development Lot", set "Sample". Otherwise set "Bulk".
8. "priority": "Regular", "High", or "Hold" (default "Regular", unless marked "Urgent", "Rush", "High", or "Hold").
9. "rollQty": Number of fabric rolls as an integer (e.g. 5, 10, 42). If unstated or blank, return null.
10. "kgQty": Total fabric weight in Kilograms (KG) as a number (e.g. 123.46, 949.53). Look for "Total: ... KG", "Net Wt", "Gross Wt", or the sum at bottom. If unstated, return null.
11. "remarks": Special notes, dispatch instructions, packing remarks, or customer instructions.

Return a pure JSON object conforming to this schema:
{
  "batch": string or null,
  "salesOrder": string or null,
  "development": string or null,
  "customerName": string or null,
  "buyerName": string or null,
  "color": string or null,
  "orderType": "Bulk" or "Sample",
  "priority": "Regular" or "High" or "Hold",
  "rollQty": number or null,
  "kgQty": number or null,
  "remarks": string or null
}`;

    const candidateModels = ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-flash-latest'];
    let lastError: any = null;

    for (const modelName of candidateModels) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    inlineData: {
                      data: cleanBase64,
                      mimeType,
                    },
                  },
                  {
                    text: promptText,
                  },
                ],
              },
            ],
            config: {
              responseMimeType: 'application/json',
            },
          });

          const rawText = response.text || '';
          // Robust JSON parsing with regex fallback
          let parsed: any;
          try {
            parsed = JSON.parse(rawText.trim());
          } catch (_) {
            const match = rawText.match(/\{[\s\S]*\}/);
            if (match) {
              parsed = JSON.parse(match[0]);
            } else {
              throw new Error('No JSON object found in AI response');
            }
          }

          return res.json({ success: true, data: parsed });
        } catch (err: any) {
          lastError = err;
          const errMsg = err?.message || String(err);
          const isBusy = errMsg.includes('503') || errMsg.includes('demand') || errMsg.includes('UNAVAILABLE') || errMsg.includes('429');
          if (isBusy) {
            // Brief backoff before next attempt or next model
            await new Promise(r => setTimeout(r, attempt * 800));
          } else {
            // Non-transient error, break to next model
            break;
          }
        }
      }
    }

    console.error('All Gemini OCR model attempts failed:', lastError);
    const isTransientDemand =
      lastError?.message?.includes('503') ||
      lastError?.message?.includes('high demand') ||
      lastError?.message?.includes('Spikes in demand') ||
      lastError?.message?.includes('UNAVAILABLE');

    if (isTransientDemand) {
      return res.status(503).json({
        success: false,
        isDemandSpike: true,
        error: 'The AI service is experiencing a temporary demand spike. Please try again in a few moments, or enter slip details manually.',
      });
    }

    return res.status(500).json({
      success: false,
      error: lastError?.message || 'Failed to analyze document with AI. Please try again.',
    });
  } catch (err: any) {
    console.error('Error during AI document scan handler:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to analyze document with AI',
    });
  }
});

// Vite Middleware for development
const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: 'spa',
});
app.use(vite.middlewares);

app.listen(port, '0.0.0.0', () => {
  console.log(`TPL Delivery System Server running on http://0.0.0.0:${port}`);
});
