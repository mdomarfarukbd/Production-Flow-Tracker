import { DeliveryRecord } from '../types';

/**
 * Normalizes batch number for exact comparison (uppercase, trimmed, symbols kept).
 */
export function normalizeBatchKey(batch: string): string {
  if (!batch) return '';
  return batch.trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * Normalizes any date string (YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, YYYY/MM/DD) to YYYY-MM-DD.
 */
export function normalizeSqlDate(dStr?: string | null): string {
  if (!dStr) return '';
  const trimmed = dStr.trim();
  if (!trimmed || trimmed.startsWith('0000') || trimmed.toLowerCase() === 'null') return '';

  // Match DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Match YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = ymdMatch[2].padStart(2, '0');
    const day = ymdMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return trimmed.split(' ')[0].split('T')[0];
}

/**
 * Normalizes SQL DATETIME (YYYY-MM-DD HH:mm:ss) without any timezone shift.
 */
export function normalizeSqlDateTime(dStr?: string | null): string {
  if (!dStr) return '';
  const trimmed = dStr.trim().replace(/^['"]|['"]$/g, '');
  if (!trimmed || trimmed.startsWith('0000') || trimmed.toLowerCase() === 'null') return '';

  const match = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (match) {
    const y = match[1];
    const m = match[2].padStart(2, '0');
    const d = match[3].padStart(2, '0');
    const hh = (match[4] || '00').padStart(2, '0');
    const mm = (match[5] || '00').padStart(2, '0');
    const ss = (match[6] || '00').padStart(2, '0');
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
  }
  return trimmed;
}

/**
 * Quote and comment aware statement splitter.
 * Guarantees that semicolons inside string literals or comments never split statements.
 */
export function splitSqlStatements(sqlText: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';
  let inLineComment = false;
  let inBlockComment = false;

  const len = sqlText.length;
  for (let i = 0; i < len; i++) {
    const c = sqlText[i];
    const next = i + 1 < len ? sqlText[i + 1] : '';

    // Handle line comments: -- or #
    if (!inQuote && !inBlockComment) {
      if ((c === '-' && next === '-') || c === '#') {
        inLineComment = true;
      }
    }
    if (inLineComment) {
      if (c === '\n' || c === '\r') {
        inLineComment = false;
      }
      continue; // Skip comment chars
    }

    // Handle block comments: /* ... */
    if (!inQuote && !inLineComment) {
      if (c === '/' && next === '*') {
        inBlockComment = true;
        i++; // skip next
        continue;
      }
    }
    if (inBlockComment) {
      if (c === '*' && next === '/') {
        inBlockComment = false;
        i++; // skip next
      }
      continue; // Skip block comment chars
    }

    // Handle quotes
    if (inQuote) {
      current += c;
      if (c === '\\') {
        // Escaped character in MySQL (e.g. \')
        if (i + 1 < len) {
          current += sqlText[i + 1];
          i++;
        }
      } else if (c === quoteChar) {
        // SQL doubled-quote check: '' inside '...'
        if (i + 1 < len && sqlText[i + 1] === quoteChar) {
          current += sqlText[i + 1];
          i++; // Skip second quote
        } else {
          inQuote = false;
        }
      }
      continue;
    }

    if (c === "'" || c === '"' || c === '`') {
      inQuote = true;
      quoteChar = c;
      current += c;
      continue;
    }

    // Semicolon outside quote and comments terminates statement
    if (c === ';') {
      const stmt = current.trim();
      if (stmt.length > 0) {
        statements.push(stmt);
      }
      current = '';
      continue;
    }

    current += c;
  }

  const lastStmt = current.trim();
  if (lastStmt.length > 0) {
    statements.push(lastStmt);
  }

  return statements;
}

/**
 * Splits a VALUES block: (val1, val2), (val3, val4) into individual tuple strings.
 * Never breaks on commas or parentheses inside quotes (e.g. 'D-927(2)' or 'remarks, test').
 */
export function extractTuplesFromValuesBlock(valuesBlock: string): string[] {
  const tuples: string[] = [];
  let inTuple = false;
  let inQuote = false;
  let quoteChar = '';
  let currentTuple = '';

  const len = valuesBlock.length;
  for (let i = 0; i < len; i++) {
    const c = valuesBlock[i];

    if (inQuote) {
      if (c === '\\' && i + 1 < len) {
        currentTuple += c + valuesBlock[i + 1];
        i++;
        continue;
      }
      if (c === quoteChar) {
        if (i + 1 < len && valuesBlock[i + 1] === quoteChar) {
          currentTuple += c + valuesBlock[i + 1];
          i++;
          continue;
        }
        inQuote = false;
      }
      currentTuple += c;
      continue;
    }

    if (c === "'" || c === '"' || c === '`') {
      inQuote = true;
      quoteChar = c;
      if (inTuple) currentTuple += c;
      continue;
    }

    if (c === '(' && !inTuple) {
      inTuple = true;
      currentTuple = '';
      continue;
    }

    if (c === ')' && inTuple) {
      inTuple = false;
      tuples.push(currentTuple);
      currentTuple = '';
      continue;
    }

    if (inTuple) {
      currentTuple += c;
    }
  }

  return tuples;
}

/**
 * Tokenizes row values inside a tuple respecting quotes, escaped characters, and commas.
 */
export function tokenizeTupleValues(tupleContent: string): string[] {
  const values: string[] = [];
  let inQuote = false;
  let quoteChar = '';
  let currentVal = '';

  const len = tupleContent.length;
  for (let i = 0; i < len; i++) {
    const c = tupleContent[i];

    if (inQuote) {
      if (c === '\\' && i + 1 < len) {
        currentVal += tupleContent[i + 1];
        i++;
        continue;
      }
      if (c === quoteChar) {
        if (i + 1 < len && tupleContent[i + 1] === quoteChar) {
          currentVal += quoteChar;
          i++;
          continue;
        }
        inQuote = false;
        continue;
      }
      currentVal += c;
      continue;
    }

    if (c === "'" || c === '"') {
      inQuote = true;
      quoteChar = c;
      continue;
    }

    if (c === ',') {
      values.push(currentVal.trim());
      currentVal = '';
      continue;
    }

    currentVal += c;
  }

  values.push(currentVal.trim());

  return values.map(v => {
    const trimmed = v.trim();
    if (trimmed.toUpperCase() === 'NULL') return '';
    return trimmed.replace(/^['"]|['"]$/g, '').trim();
  });
}

/**
 * Comprehensive parser for SQL dumps (.sql) containing INSERT INTO, REPLACE INTO, and UPDATE statements.
 */
export function parseSqlDump(
  sqlText: string,
  existingRecords: DeliveryRecord[]
): {
  parsedRecords: DeliveryRecord[];
  mergedRecords: DeliveryRecord[];
  addedCount: number;
  updatedCount: number;
} {
  const cleanSql = sqlText.replace(/^\uFEFF/, '').trim();
  const statements = splitSqlStatements(cleanSql);

  const parsedMap = new Map<string, DeliveryRecord>();
  let currentSL = existingRecords.length > 0 ? Math.max(...existingRecords.map(r => r.sl || 0)) + 1 : 1535;

  for (const stmt of statements) {
    const trimmedStmt = stmt.trim();
    if (!trimmedStmt) continue;

    // 1. Process INSERT INTO or REPLACE INTO statements
    const insertMatch = trimmedStmt.match(/^(?:INSERT(?:\s+IGNORE)?|REPLACE)\s+INTO\s+[`"']?(?:[\w.-]+[`"']?\.)?[`"']?(\w+)[`"']?\s*(?:\(([\s\S]+?)\))?\s+VALUES\s*([\s\S]+)$/i);
    if (insertMatch) {
      const tableName = (insertMatch[1] || '').toLowerCase();
      const rawCols = insertMatch[2];
      const rawValues = insertMatch[3];

      let colNames: string[] = [];
      if (rawCols) {
        colNames = rawCols.split(',').map(c => c.trim().replace(/[`"']/g, '').toLowerCase());
      }

      const tuples = extractTuplesFromValuesBlock(rawValues);
      const isDeliveryTable = tableName.includes('deliv') || tableName.includes('dispatch') || tableName.includes('outward');

      for (const tuple of tuples) {
        const vals = tokenizeTupleValues(tuple);
        if (vals.length === 0) continue;

        let batch = '';
        let development = '';
        let customerName = '';
        let orderType: 'Bulk' | 'Sample' = 'Bulk';
        let rollQty = 0;
        let kgQty = 0;
        let shortQty = 0;
        let priority: 'Regular' | 'High' | 'Hold' = 'Regular';
        let color = '';
        let remarks = '-';
        let receivedDatePart = '';
        let receivedTimePart = '';
        let deliveryDatePart = '';
        let deliveryTimePart = '';
        let createdDatePart = '';
        let createdTimePart = '';
        let explicitCreatedAt: string | null = null;
        let explicitDeliveredAt: string | null = null;
        let explicitReceivedAt: string | null = null;
        let rawStatusVal = '';
        let hasDelChallan = false;
        let hasDelQty = false;
        let receivedBy = 'Admin';
        let deliveredBy: string | null = null;
        let customSL: number | null = null;

        if (colNames.length > 0) {
          colNames.forEach((col, idx) => {
            const val = vals[idx] !== undefined ? vals[idx] : '';
            const c = col.replace(/[`"'\s_-]/g, '').toLowerCase();

            if (c.includes('batch') || c === 'lot' || c === 'lotno' || c === 'batchno') {
              batch = val;
            } else if (c.includes('dev') || c.includes('fabric') || c === 'item' || c === 'quality' || c === 'itemcode' || c === 'devcode') {
              development = val;
            } else if (
              c.includes('customer') ||
              c.includes('buyer') ||
              c.includes('client') ||
              c.includes('party') ||
              c.includes('brand') ||
              c.includes('consignee') ||
              c.includes('merchant')
            ) {
              if (val && val.toLowerCase() !== 'null' && val.toLowerCase() !== '0') {
                customerName = val;
              }
            } else if (c.includes('short') || c.includes('deficit') || c.includes('balqty') || c.includes('balanceqty')) {
              const p = parseFloat(val);
              if (!isNaN(p) && p > 0) {
                shortQty = p;
              }
            } else if (c === 'ordertype' || (c.includes('type') && !c.includes('content') && !c.includes('file'))) {
              orderType = val.toLowerCase().includes('sample') ? 'Sample' : 'Bulk';
            } else if (c.includes('roll') && !c.includes('del')) {
              rollQty = parseInt(val, 10) || rollQty;
            } else if ((c.includes('kg') || c.includes('weight')) && !c.includes('del') && !c.includes('short')) {
              kgQty = parseFloat(val) || kgQty;
            } else if (c.includes('priority')) {
              const low = val.toLowerCase();
              priority = low.includes('high') ? 'High' : low.includes('hold') ? 'Hold' : 'Regular';
            } else if (c.includes('color') || c.includes('shade') || c.includes('colour')) {
              color = val;
            } else if (c.includes('remark') || c.includes('note') || c.includes('comment')) {
              remarks = val;
            } else if (
              c === 'createdby' ||
              c === 'createby' ||
              c === 'entryby' ||
              c === 'receivedby' ||
              c === 'operator' ||
              c === 'username' ||
              c === 'user' ||
              (c.includes('user') && !c.includes('del'))
            ) {
              if (val && val.toLowerCase() !== 'null') {
                receivedBy = val;
              }
            } else if (c === 'completedby' || c === 'deliveredby' || c === 'delby' || c === 'dispatchby') {
              if (val && val.toLowerCase() !== 'null') {
                deliveredBy = val;
              }
            } else if (c.includes('status') || c === 'isdelivered' || c === 'is_delivered' || c === 'dstatus') {
              rawStatusVal = val;
            } else if (c.includes('challan') || c.includes('chalan') || c.includes('gatepass') || c.includes('dcno')) {
              if (val && val !== '0' && val.toLowerCase() !== 'null') {
                hasDelChallan = true;
              }
            } else if (c.includes('del') && (c.includes('qty') || c.includes('weight') || c.includes('roll') || c.includes('kg'))) {
              const p = parseFloat(val);
              if (!isNaN(p) && p > 0) {
                hasDelQty = true;
              }
            } else if (
              c === 'createdat' ||
              c === 'created_at' ||
              c === 'creationtime' ||
              c === 'creationdate' ||
              c === 'created'
            ) {
              if (val && !val.startsWith('0000') && val.toLowerCase() !== 'null') {
                explicitCreatedAt = normalizeSqlDateTime(val);
              }
            } else if (
              c === 'completedat' ||
              c === 'completed_at' ||
              c === 'completiontime' ||
              c === 'deliveredat' ||
              c === 'delivered_at' ||
              c === 'deldate' ||
              c === 'deliverydate' ||
              c === 'dispatchdate'
            ) {
              if (val && !val.startsWith('0000') && val.toLowerCase() !== 'null') {
                explicitDeliveredAt = normalizeSqlDateTime(val);
                deliveryDatePart = val;
              }
            } else if (c.includes('del') || c.includes('out') || c.includes('dispatch') || c.includes('ship')) {
              if (val && !val.startsWith('0000') && val.toLowerCase() !== 'null') {
                if (c.includes('time') && !c.includes('date')) {
                  deliveryTimePart = val;
                } else {
                  deliveryDatePart = val;
                }
              }
            } else if (
              c === 'receivedat' ||
              c === 'received_at' ||
              c === 'receiptdate' ||
              c === 'entrydate' ||
              c === 'indate'
            ) {
              if (val && !val.startsWith('0000') && val.toLowerCase() !== 'null') {
                explicitReceivedAt = normalizeSqlDateTime(val);
                receivedDatePart = val;
              }
            } else if (c.includes('rec') || c.includes('entry') || c.includes('in_date') || c === 'date') {
              if (val && !val.startsWith('0000') && val.toLowerCase() !== 'null') {
                if (c.includes('time') && !c.includes('date')) {
                  receivedTimePart = val;
                } else {
                  receivedDatePart = val;
                }
              }
            } else if (c === 'sl' || c === 'serialno' || c === 'serial_no') {
              const p = parseInt(val, 10);
              if (!isNaN(p) && p > 0) customSL = p;
            } else if (c === 'id' && customSL === null) {
              const p = parseInt(val, 10);
              if (!isNaN(p) && p > 0) customSL = p;
            }
          });
        } else {
          // Positional fallback
          let dateCount = 0;
          vals.forEach((v, vIdx) => {
            if (!v) return;
            const lower = v.toLowerCase();
            if (/^(?:F\d+|SF\d+|BG\d+|LOT\d+|[A-Z]{1,3}\d{4,})/i.test(v) && !batch) {
              batch = v;
            } else if (lower === 'bulk' || lower === 'sample') {
              orderType = lower === 'sample' ? 'Sample' : 'Bulk';
            } else if (lower === 'high' || lower === 'regular' || lower === 'hold') {
              priority = lower === 'high' ? 'High' : lower === 'hold' ? 'Hold' : 'Regular';
            } else if (lower === 'delivered' || lower === 'pending' || lower === 'done' || lower === 'dispatched' || lower === '1' || lower === 'd') {
              rawStatusVal = lower;
            } else if (/^\d{4}[-/]\d{2}[-/]\d{2}/.test(v) || /^\d{2}[-/]\d{2}[-/]\d{4}/.test(v)) {
              if (dateCount === 0) {
                receivedDatePart = v;
                dateCount++;
              } else {
                deliveryDatePart = v;
                dateCount++;
              }
            } else if (/^\d+\.\d+$/.test(v) && kgQty === 0) {
              kgQty = parseFloat(v) || kgQty;
            } else if (/^\d+$/.test(v) && parseInt(v, 10) > 0 && parseInt(v, 10) < 500 && rollQty === 0 && vIdx > 1) {
              rollQty = parseInt(v, 10);
            } else if (/^[A-Z0-9\-\(\)]+$/i.test(v) && v.length >= 4 && !development && v !== batch) {
              development = v;
            }
          });
        }

        // Check remarks for short quantity mentions (e.g. "short 14.5 kg")
        if (remarks && !shortQty) {
          const shortMatch = remarks.match(/(?:short|shortage|bal|balance|due)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:kg)?/i);
          if (shortMatch) {
            shortQty = parseFloat(shortMatch[1]) || 0;
          }
        }

        // Normalization (Exact literal wall-clock strings, NO timezone shifting)
        let receivedAt = explicitReceivedAt || '';
        if (!receivedAt && receivedDatePart) {
          const normDate = normalizeSqlDate(receivedDatePart);
          const timePart = receivedTimePart || (receivedDatePart.includes(' ') ? receivedDatePart.split(' ')[1] : '') || '09:00:00';
          receivedAt = normalizeSqlDateTime(`${normDate || receivedDatePart} ${timePart}`);
        }
        if (!receivedAt) {
          receivedAt = '2026-08-01 09:00:00';
        }

        let deliveredAt: string | null = explicitDeliveredAt || null;
        if (!deliveredAt && deliveryDatePart && !deliveryDatePart.startsWith('0000') && deliveryDatePart.toLowerCase() !== 'null') {
          const normDate = normalizeSqlDate(deliveryDatePart);
          const timePart = deliveryTimePart || (deliveryDatePart.includes(' ') ? deliveryDatePart.split(' ')[1] : '') || '17:00:00';
          deliveredAt = normalizeSqlDateTime(`${normDate || deliveryDatePart} ${timePart}`);
        }

        // createdAt: Map directly to created_at from SQL, never reset genuine creation timestamp
        let createdAt = explicitCreatedAt || '';
        if (!createdAt) {
          createdAt = receivedAt;
        }

        let status: 'Pending' | 'Delivered' = 'Pending';
        const cleanStatus = rawStatusVal.toLowerCase().trim();
        const isDeliveredText =
          cleanStatus.includes('deliv') ||
          cleanStatus.includes('done') ||
          cleanStatus.includes('complete') ||
          cleanStatus.includes('dispatch') ||
          cleanStatus.includes('finish') ||
          cleanStatus === '1' ||
          cleanStatus === 'd' ||
          cleanStatus === 'y';

        const isExplicitPending =
          cleanStatus.includes('pend') ||
          cleanStatus === '0' ||
          cleanStatus === 'p' ||
          cleanStatus === 'n' ||
          cleanStatus === 'hold';

        const hasValidDeliveryDate = Boolean(deliveredAt && !deliveredAt.startsWith('0000') && deliveredAt.length >= 8);

        if (isExplicitPending && !hasValidDeliveryDate) {
          status = 'Pending';
          deliveredAt = null;
        } else if (isDeliveredText || hasValidDeliveryDate || hasDelChallan || hasDelQty || isDeliveryTable) {
          status = 'Delivered';
          // CRITICAL: Do NOT copy receivedAt or createdAt into deliveredAt when completed_at is not given.
          // Preserve null or genuine completed timestamp.
        } else {
          status = 'Pending';
          deliveredAt = null;
        }

        if (batch) {
          const trimmedBatch = batch.trim();
          const upperBatch = trimmedBatch.toUpperCase();
          if (upperBatch.startsWith('SF')) {
            orderType = 'Sample';
          } else if (upperBatch.startsWith('F')) {
            orderType = 'Bulk';
          }

          const normKey = normalizeBatchKey(trimmedBatch);
          if (normKey) {
            parsedMap.set(normKey, {
              id: `sql-import-${Date.now()}-${parsedMap.size}`,
              sl: customSL || currentSL++,
              orderType,
              development: (development || 'FABRIC-DEV').toUpperCase().trim(),
              batch: trimmedBatch, // Preserves exact casing: e.g. Sf2600577, Sf2600816 from mother-system SQL
              rollQty: rollQty || 1,
              kgQty: Number((kgQty || 50.0).toFixed(2)),
              shortQty: shortQty > 0 ? Number(shortQty.toFixed(2)) : undefined,
              priority,
              customerName: customerName || undefined,
              color: color || undefined,
              remarks: remarks || '-',
              receivedAt,
              receivedBy: receivedBy || 'Admin',
              status,
              deliveredAt,
              deliveredBy: status === 'Delivered' ? (deliveredBy || receivedBy || 'Admin') : null,
              createdAt,
            });
          }
        }
      }
      continue;
    }

    // 2. Process UPDATE statements (e.g. UPDATE greige SET status='Delivered', completed_at='...' WHERE batch='...')
    const updateMatch = trimmedStmt.match(/^UPDATE\s+[`"']?(?:[\w.-]+[`"']?\.)?[`"']?(\w+)[`"']?\s+SET\s+([\s\S]+?)\s+WHERE\s+([\s\S]+)$/i);
    if (updateMatch) {
      const setClause = updateMatch[2];
      const whereClause = updateMatch[3];

      const batchMatch = whereClause.match(/(?:batch|lot|batch_no)[`"'\s]*=[`"'\s]*['"]?([A-Za-z0-9_-]+)['"]?/i);
      if (!batchMatch) continue;

      const normKey = normalizeBatchKey(batchMatch[1]);
      if (!normKey) continue;

      const lowerSet = setClause.toLowerCase();
      const isDelivered =
        lowerSet.includes('delivered') ||
        lowerSet.includes("status = '1'") ||
        lowerSet.includes('status=1') ||
        lowerSet.includes("status = 'd'") ||
        lowerSet.includes('dispatch') ||
        lowerSet.includes('completed');

      const dateMatch = setClause.match(/(?:completed_at|completedat|del_date|delivery_date|delivered_at|date)[`"'\s]*=[`"'\s]*['"]?(\d{4}[-/]\d{2}[-/]\d{2}[\s\d:]*)['"]?/i);
      const delDateVal = dateMatch ? normalizeSqlDateTime(dateMatch[1]) : null;

      const createdMatch = setClause.match(/(?:created_at|createdat)[`"'\s]*=[`"'\s]*['"]?(\d{4}[-/]\d{2}[-/]\d{2}[\s\d:]*)['"]?/i);
      const createdDateVal = createdMatch ? normalizeSqlDateTime(createdMatch[1]) : null;

      if (parsedMap.has(normKey)) {
        const existing = parsedMap.get(normKey)!;
        if (isDelivered || delDateVal) {
          existing.status = 'Delivered';
          if (delDateVal) existing.deliveredAt = delDateVal;
        }
        if (createdDateVal) {
          existing.createdAt = createdDateVal;
        }
      }
    }
  }

  const parsedRecords = Array.from(parsedMap.values());

  // Merge with existing records
  let addedCount = 0;
  let updatedCount = 0;
  const resultMap = new Map<string, DeliveryRecord>();

  existingRecords.forEach(r => {
    const key = normalizeBatchKey(r.batch);
    if (key) resultMap.set(key, { ...r });
  });

  parsedRecords.forEach(incoming => {
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

  const mergedRecords = Array.from(resultMap.values());

  return {
    parsedRecords,
    mergedRecords,
    addedCount,
    updatedCount,
  };
}
