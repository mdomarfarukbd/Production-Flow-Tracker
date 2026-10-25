import React, { useState, useEffect, useRef } from 'react';
import { DeliveryRecord, OrderType, DeliveryPriority, UserRole } from '../types';
import {
  formatDateToLocalISO,
  normalizeBatch,
  normalizeDevelopment,
  checkDuplicateBatch,
  getDistinctDevelopments,
} from '../services/storage';
import {
  X,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Loader2,
  Camera,
  Download,
  Image as ImageIcon,
  Trash2,
  RotateCw,
} from 'lucide-react';

interface NewEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (record: DeliveryRecord) => void;
  existingRecords: DeliveryRecord[];
  editRecord?: DeliveryRecord | null;
  currentUser?: string;
  currentRole?: UserRole | null;
}

export const NewEntryModal: React.FC<NewEntryModalProps> = ({
  isOpen,
  onClose,
  onSave,
  existingRecords,
  editRecord = null,
  currentUser = 'Admin',
  currentRole = 'admin',
}) => {
  const [orderType, setOrderType] = useState<OrderType>('Bulk');
  const [development, setDevelopment] = useState('');
  const [batch, setBatch] = useState('');
  const [salesOrder, setSalesOrder] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [color, setColor] = useState('');
  const [priority, setPriority] = useState<DeliveryPriority>('Regular');
  const [rollQty, setRollQty] = useState('');
  const [kgQty, setKgQty] = useState('');
  const [dateTime, setDateTime] = useState('');
  const [remarks, setRemarks] = useState('');

  // Requisition Image state (best quality, admin-only access)
  const [requisitionImage, setRequisitionImage] = useState<string | null>(null);
  const [requisitionImageMimeType, setRequisitionImageMimeType] = useState<string>('image/jpeg');
  const [lastUploadedBase64, setLastUploadedBase64] = useState<string | null>(null);

  // Autocomplete state for Development
  const [showDevSuggestions, setShowDevSuggestions] = useState(false);
  const devContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI OCR Scanning state
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [scanIsDemandSpike, setScanIsDemandSpike] = useState(false);

  // Validation state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Distinct developments from existing records
  const existingDevs = getDistinctDevelopments(existingRecords);

  // Dynamic current year 2-digit suffix (e.g. 26 for 2026, 27 for 2027)
  const getYearSuffix = () => new Date().getFullYear().toString().slice(-2);

  // Initialize or reset form when modal opens or editRecord changes
  useEffect(() => {
    if (isOpen) {
      if (editRecord) {
        setOrderType(editRecord.orderType);
        setDevelopment(editRecord.development);
        setBatch(editRecord.batch);
        setSalesOrder(editRecord.salesOrder || '');
        setCustomerName(editRecord.customerName || '');
        setColor(editRecord.color || '');
        setPriority(editRecord.priority || 'Regular');
        setRollQty(String(editRecord.rollQty || ''));
        setKgQty(String(editRecord.kgQty || ''));
        setDateTime(editRecord.receivedAt || formatDateToLocalISO(new Date()));
        setRemarks(editRecord.remarks || '');
        setRequisitionImage(editRecord.requisitionImage || null);
        setRequisitionImageMimeType(editRecord.requisitionImageMimeType || 'image/jpeg');
        setLastUploadedBase64(null);
      } else {
        const yy = getYearSuffix();
        setOrderType('Bulk');
        setDevelopment('');
        // Automatically place "F26" when "Bulk" is selected initially for new entry
        setBatch(`F${yy}`);
        setSalesOrder('');
        setCustomerName('');
        setColor('');
        setPriority('Regular');
        setRollQty('');
        setKgQty('');
        setDateTime(formatDateToLocalISO(new Date()));
        setRemarks('');
        setRequisitionImage(null);
        setRequisitionImageMimeType('image/jpeg');
        setLastUploadedBase64(null);
      }
      setErrors({});
      setIsSubmitting(false);
      setSaveSuccessMessage(null);
      setScanMessage(null);
      setScanIsDemandSpike(false);
    }
  }, [isOpen, editRecord]);

  // Click outside listener for autocomplete suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (devContainerRef.current && !devContainerRef.current.contains(event.target as Node)) {
        setShowDevSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isOpen) return null;

  // Real-time batch duplicate check (excludes self if editing)
  const normalizedBatchInput = normalizeBatch(batch);
  const isDuplicateBatch =
    normalizedBatchInput.length > 0 &&
    checkDuplicateBatch(normalizedBatchInput, existingRecords, editRecord?.id);

  // Filter development suggestions based on user input
  const filteredDevSuggestions = existingDevs.filter(d =>
    d.toLowerCase().includes(development.trim().toLowerCase())
  );

  const handleSelectDevSuggestion = (devValue: string) => {
    setDevelopment(devValue.toUpperCase());
    setShowDevSuggestions(false);
  };

  /**
   * Auto-adjust batch prefix according to Order Type:
   * "F26" for Bulk, "SF26" for Sample (dynamically adapts year: 26 for 2026, 27 for 2027)
   */
  const handleOrderTypeSelect = (newType: OrderType) => {
    setOrderType(newType);
    const yy = getYearSuffix();
    const bulkPrefix = `F${yy}`;
    const samplePrefix = `SF${yy}`;
    const targetPrefix = newType === 'Bulk' ? bulkPrefix : samplePrefix;
    const oldPrefix = newType === 'Bulk' ? samplePrefix : bulkPrefix;

    setBatch(prev => {
      const clean = prev.trim().toUpperCase();
      if (!clean || clean === oldPrefix || clean === bulkPrefix || clean === samplePrefix) {
        return targetPrefix;
      }
      // If user had entered digits after the prefix, preserve them
      if (clean.startsWith(oldPrefix)) {
        return targetPrefix + clean.slice(oldPrefix.length);
      }
      if (newType === 'Bulk' && clean.startsWith('SF')) {
        return bulkPrefix + clean.replace(/^SF\d*/, '');
      }
      if (newType === 'Sample' && clean.startsWith('F') && !clean.startsWith('SF')) {
        return samplePrefix + clean.replace(/^F\d*/, '');
      }
      return prev;
    });
  };

  // AI OCR Worker function
  const runAiScan = async (base64Data: string, mime: string) => {
    setIsScanning(true);
    setScanMessage(null);
    setScanIsDemandSpike(false);

    try {
      const res = await fetch('/api/scan-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64Data,
          mimeType: mime,
        }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        const isSpike =
          res.status === 503 ||
          result.isDemandSpike ||
          (result.error &&
            (result.error.includes('demand') ||
              result.error.includes('503') ||
              result.error.includes('UNAVAILABLE')));

        if (isSpike) {
          setScanIsDemandSpike(true);
          throw new Error(
            'The AI model is currently experiencing temporary high demand. Requisition image is preserved! Please click "Retry Scan" in a few moments, or type details manually.'
          );
        }
        throw new Error(result.error || 'Failed to extract text from requisition slip.');
      }

      const extracted = result.data;
      const extractedBatch = (extracted.batch || '').toUpperCase().trim();
      const isSamplePrefix = extractedBatch.startsWith('SF');

      if (extractedBatch) setBatch(extractedBatch);
      if (extracted.salesOrder) setSalesOrder(extracted.salesOrder.trim());
      if (extracted.development) setDevelopment(extracted.development.toUpperCase().trim());
      if (extracted.customerName) setCustomerName(extracted.customerName.trim());
      if (extracted.color) setColor(extracted.color);

      // If buyerName was separately identified, preserve it
      if (extracted.buyerName && extracted.buyerName.trim()) {
        const cleanBuyer = extracted.buyerName.trim();
        if (!extracted.remarks) {
          setRemarks(`Buyer: ${cleanBuyer}`);
        } else if (!extracted.remarks.toLowerCase().includes(cleanBuyer.toLowerCase())) {
          setRemarks(`${extracted.remarks} | Buyer: ${cleanBuyer}`);
        } else {
          setRemarks(extracted.remarks);
        }
      } else if (extracted.remarks) {
        setRemarks(extracted.remarks);
      }

      // If batch number prefix is SF, auto change order type to Sample!
      if (isSamplePrefix || extracted.orderType === 'Sample') {
        setOrderType('Sample');
      } else if (extracted.orderType === 'Bulk') {
        setOrderType('Bulk');
      }

      if (extracted.priority) {
        const p = extracted.priority;
        if (p === 'High' || p === 'Hold' || p === 'Regular') setPriority(p);
      }

      if (extracted.rollQty !== null && extracted.rollQty !== undefined) {
        setRollQty(String(extracted.rollQty));
      } else {
        setRollQty('');
      }

      if (extracted.kgQty !== null && extracted.kgQty !== undefined) {
        setKgQty(String(extracted.kgQty));
      } else {
        setKgQty('');
      }

      setScanMessage(
        isSamplePrefix
          ? 'AI scanned requisition: SF prefix detected, auto-set Order Type to Sample.'
          : 'AI successfully scanned requisition and populated fields.'
      );
    } catch (err: any) {
      console.error('Scan error:', err);
      setScanMessage(
        err.message || 'Could not parse document. You may enter values manually.'
      );
    } finally {
      setIsScanning(false);
    }
  };

  // Client-side phone image preprocessor: normalizes orientation and compresses to max 1920px JPEG
  const preprocessPhoneImage = (file: File): Promise<{ dataUrl: string; base64Data: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const rawDataUrl = reader.result as string;
        const img = new Image();
        img.onerror = () => {
          const base64 = rawDataUrl.split(',')[1] || '';
          resolve({ dataUrl: rawDataUrl, base64Data: base64, mimeType: file.type || 'image/jpeg' });
        };
        img.onload = () => {
          const maxDim = 1920;
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            const base64 = rawDataUrl.split(',')[1] || '';
            resolve({ dataUrl: rawDataUrl, base64Data: base64, mimeType: file.type || 'image/jpeg' });
            return;
          }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          const optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.88);
          const optimizedBase64 = optimizedDataUrl.split(',')[1];
          resolve({
            dataUrl: optimizedDataUrl,
            base64Data: optimizedBase64,
            mimeType: 'image/jpeg',
          });
        };
        img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
    });
  };

  // AI Document OCR / Extraction Handler (Smartphone camera optimized)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    setScanMessage('Optimizing camera photo and running AI document analysis...');

    try {
      const { dataUrl, base64Data, mimeType } = await preprocessPhoneImage(file);

      // Store high-resolution image data URL
      setRequisitionImage(dataUrl);
      setRequisitionImageMimeType(mimeType);
      setLastUploadedBase64(base64Data);

      await runAiScan(base64Data, mimeType);
    } catch (err: any) {
      console.error('File preprocessing/scan error:', err);
      setIsScanning(false);
      setScanMessage('Failed to process image file. Please try again or enter details manually.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Retry scan using previously uploaded base64 data
  const handleRetryScan = () => {
    if (lastUploadedBase64) {
      runAiScan(lastUploadedBase64, requisitionImageMimeType);
    } else if (requisitionImage) {
      const base64 = requisitionImage.split(',')[1];
      runAiScan(base64, requisitionImageMimeType);
    }
  };

  // Best quality image download with naming: [Batch]_[Development]_[Delivery Date].[file type]
  const handleDownloadRequisitionImage = () => {
    if (!requisitionImage) return;
    const fileExt = (requisitionImageMimeType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const safeDate = (dateTime || new Date().toISOString()).split(' ')[0].split('T')[0];
    const safeBatch = (batch || 'BATCH').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const safeDev = (development || 'DEV').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const downloadFileName = `${safeBatch}_${safeDev}_${safeDate}.${fileExt}`;

    const link = document.createElement('a');
    link.href = requisitionImage;
    link.download = downloadFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const newErrors: Record<string, string> = {};

    // 1. Development Validation (Mandatory Uppercase)
    const cleanDev = normalizeDevelopment(development);
    if (!cleanDev) {
      newErrors.development = 'Development code is required.';
    }

    // 2. Batch Validation & Duplicate Check (Mandatory Uppercase)
    const cleanBatch = normalizeBatch(batch);
    if (!cleanBatch) {
      newErrors.batch = 'Batch identifier is required.';
    } else if (checkDuplicateBatch(cleanBatch, existingRecords, editRecord?.id)) {
      newErrors.batch = 'Duplicate Batch Number — This Batch already exists. Please enter a unique Batch number.';
    }

    // 3. Roll Qty Validation
    const numRolls = parseInt(rollQty, 10);
    if (isNaN(numRolls) || numRolls <= 0) {
      newErrors.rollQty = 'Enter a valid positive number of rolls.';
    }

    // 4. KG Qty Validation
    const numKg = parseFloat(kgQty);
    if (isNaN(numKg) || numKg <= 0) {
      newErrors.kgQty = 'Enter a valid positive kilogram quantity.';
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setIsSubmitting(true);

    try {
      const nowISO = formatDateToLocalISO(new Date());
      const recordSL = editRecord ? editRecord.sl : (existingRecords.length > 0 ? Math.max(...existingRecords.map(r => r.sl || 0)) + 1 : 1534);

      const recordToSave: DeliveryRecord = {
        id: editRecord ? editRecord.id : `tpl-rec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        sl: recordSL,
        orderType,
        development: cleanDev,
        batch: cleanBatch,
        salesOrder: (salesOrder || '').trim() || undefined,
        customerName: (customerName || '').trim() || undefined,
        rollQty: numRolls,
        kgQty: Number(numKg.toFixed(2)),
        priority,
        color: (color || '').trim() || undefined,
        remarks: (remarks || '').trim() || '-',
        receivedAt: dateTime || nowISO,
        receivedBy: editRecord ? editRecord.receivedBy : currentUser,
        status: editRecord ? editRecord.status : 'Pending',
        deliveredAt: editRecord?.deliveredAt,
        deliveredBy: editRecord?.deliveredBy,
        requisitionImage: requisitionImage || undefined,
        requisitionImageMimeType: requisitionImage ? requisitionImageMimeType : undefined,
        createdAt: editRecord ? editRecord.createdAt : nowISO,
      };

      onSave(recordToSave);

      setSaveSuccessMessage(`Batch ${cleanBatch} ${editRecord ? 'updated' : 'saved'} successfully.`);
      setTimeout(() => {
        onClose();
      }, 600);
    } catch (err) {
      console.error('Error saving record:', err);
      setErrors({ form: 'An unexpected error occurred while saving the record.' });
      setIsSubmitting(false);
    }
  };

  const isAdmin = currentRole === 'admin';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-[#04342c] text-white px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold tracking-wide">
              {editRecord ? 'Edit Delivery Record' : 'New Greige Fabric Entry'}
            </h2>
            <p className="text-xs text-emerald-200 mt-0.5">
              [Company Name] Delivery System
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-white/70 hover:text-white rounded-md p-1 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* AI Requisition Document Scan Banner */}
        <div className="bg-emerald-50/70 border-b border-emerald-100 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-700" />
              <span className="text-xs font-bold text-[#04342c]">
                Auto-Fill from Requisition Slip
              </span>
            </div>
            <div className="flex items-center gap-2">
              {scanIsDemandSpike && !isScanning && (
                <button
                  type="button"
                  onClick={handleRetryScan}
                  className="px-2.5 py-1.5 text-xs font-bold rounded-md bg-amber-600 text-white hover:bg-amber-700 transition-all flex items-center gap-1 shadow-xs"
                  title="Retry scanning with fallback AI model"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Retry Scan</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isScanning}
                className="px-3 py-1.5 text-xs font-bold rounded-md bg-[#04342c] text-white hover:bg-[#032620] disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-xs"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Scanning...</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Scan Requisition</span>
                  </>
                )}
              </button>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/*,.pdf"
              className="hidden"
            />
          </div>
          {scanMessage && (
            <p
              className={`text-[11px] font-medium mt-1.5 leading-tight ${
                scanIsDemandSpike ? 'text-amber-800 bg-amber-50 p-2 rounded border border-amber-200' : 'text-emerald-800'
              }`}
            >
              {scanMessage}
            </p>
          )}

          {/* Captured Requisition Image Preview & Admin Download Bar */}
          {requisitionImage && (
            <div className="mt-3 p-2.5 rounded-lg border border-emerald-300 bg-white flex items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={requisitionImage}
                  alt="Captured Requisition"
                  className="w-12 h-12 object-cover rounded border border-slate-200 shrink-0 bg-slate-100"
                />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    <span className="truncate">Requisition Slip Image Saved</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono truncate">
                    {isAdmin ? (
                      `Best Quality • File: ${(batch || 'Batch')}_${(development || 'Dev')}_${(dateTime || 'Date').split(' ')[0]}.${(requisitionImageMimeType.split('/')[1] || 'jpg').replace('jpeg', 'jpg')}`
                    ) : (
                      'Stored securely • Restricted to Administrator access'
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={handleDownloadRequisitionImage}
                    className="p-1.5 rounded text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                    title={`Download image as [Batch]_[Development]_[Delivery Date].[ext]`}
                  >
                    <Download className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setRequisitionImage(null);
                    setLastUploadedBase64(null);
                  }}
                  className="p-1.5 rounded text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors"
                  title="Remove image"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-4">
          {saveSuccessMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{saveSuccessMessage}</span>
            </div>
          )}

          {errors.form && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-md text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errors.form}</span>
            </div>
          )}

          {/* 1. Order Type and Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Order Type <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleOrderTypeSelect('Bulk')}
                  className={`py-1.5 px-2 text-xs font-bold rounded-md border text-center transition-all ${
                    orderType === 'Bulk'
                      ? 'bg-[#04342c] text-white border-[#04342c] shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  Bulk
                </button>
                <button
                  type="button"
                  onClick={() => handleOrderTypeSelect('Sample')}
                  className={`py-1.5 px-2 text-xs font-bold rounded-md border text-center transition-all ${
                    orderType === 'Sample'
                      ? 'bg-purple-800 text-white border-purple-800 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  Sample
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Priority
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => setPriority('Regular')}
                  className={`py-1.5 px-2 text-xs font-bold rounded-md border text-center transition-all ${
                    priority === 'Regular'
                      ? 'bg-blue-700 text-white border-blue-700 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  Regular
                </button>
                <button
                  type="button"
                  onClick={() => setPriority('High')}
                  className={`py-1.5 px-2 text-xs font-bold rounded-md border text-center transition-all ${
                    priority === 'High'
                      ? 'bg-red-600 text-white border-red-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  High
                </button>
                <button
                  type="button"
                  onClick={() => setPriority('Hold')}
                  className={`py-1.5 px-2 text-xs font-bold rounded-md border text-center transition-all ${
                    priority === 'Hold'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  Hold
                </button>
              </div>
            </div>
          </div>

          {/* 2. Development (Dev Code) with Autocomplete */}
          <div ref={devContainerRef} className="relative">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Development (Dev Code) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={development}
              onChange={e => {
                setDevelopment(e.target.value.toUpperCase());
                setShowDevSuggestions(true);
                if (errors.development) setErrors(prev => ({ ...prev, development: '' }));
              }}
              onFocus={() => setShowDevSuggestions(true)}
              placeholder="e.g. PVPEEL002D or SVCBI0411C"
              className={`w-full px-3 py-2 text-xs uppercase font-medium rounded-md border focus:outline-hidden focus:ring-1 focus:ring-[#04342c] ${
                errors.development ? 'border-red-500 bg-red-50/30' : 'border-slate-300'
              }`}
            />
            {errors.development && (
              <p className="text-[11px] text-red-600 mt-1 font-medium">{errors.development}</p>
            )}

            {/* Suggestions list from actual records */}
            {showDevSuggestions && filteredDevSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 mt-1 max-h-36 overflow-y-auto bg-white border border-slate-200 rounded-md shadow-lg z-50 text-xs divide-y divide-slate-100">
                <div className="px-3 py-1 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Existing Developments
                </div>
                {filteredDevSuggestions.map(devSuggestion => (
                  <button
                    key={devSuggestion}
                    type="button"
                    onClick={() => handleSelectDevSuggestion(devSuggestion)}
                    className="w-full text-left px-3 py-1.5 hover:bg-emerald-50 hover:text-[#04342c] transition-colors font-medium"
                  >
                    {devSuggestion}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 3. Batch (Unique Identifier) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Batch <span className="text-red-500">*</span>
              </label>
              <span className="text-[10px] text-slate-400 font-mono">Unique ID</span>
            </div>
            <input
              type="text"
              value={batch}
              onChange={e => {
                const val = e.target.value.toUpperCase();
                setBatch(val);
                if (val.startsWith('SF')) {
                  setOrderType('Sample');
                }
                if (errors.batch) setErrors(prev => ({ ...prev, batch: '' }));
              }}
              placeholder="e.g. F2603878"
              className={`w-full px-3 py-2 text-xs font-mono font-bold uppercase rounded-md border focus:outline-hidden focus:ring-1 focus:ring-[#04342c] ${
                isDuplicateBatch || errors.batch ? 'border-red-500 bg-red-50/40 text-red-900' : 'border-slate-300'
              }`}
            />

            {/* Mandatory Duplicate Batch Warning */}
            {isDuplicateBatch && (
              <div className="mt-1.5 p-2 bg-red-50 border border-red-200 rounded text-[11px] text-red-700 font-semibold flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                <span>Duplicate Batch Number — This Batch already exists. Please enter a unique Batch number.</span>
              </div>
            )}
            {!isDuplicateBatch && errors.batch && (
              <p className="text-[11px] text-red-600 mt-1 font-medium">{errors.batch}</p>
            )}
          </div>

          {/* 4. Sales Order, Customer Name & Color / Shade */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Sales Order
              </label>
              <input
                type="text"
                value={salesOrder}
                onChange={e => setSalesOrder(e.target.value)}
                placeholder="e.g. SO-10923 or 45001234"
                className="w-full px-3 py-2 text-xs font-medium rounded-md border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-[#04342c]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Customer Name
              </label>
              <input
                type="text"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="e.g. Target, Decathlon, H&M"
                className="w-full px-3 py-2 text-xs font-medium rounded-md border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-[#04342c]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Color / Shade
              </label>
              <input
                type="text"
                value={color}
                onChange={e => setColor(e.target.value)}
                placeholder="e.g. Stony Grey, Off White, Navy"
                className="w-full px-3 py-2 text-xs font-medium rounded-md border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-[#04342c]"
              />
            </div>
          </div>

          {/* 5 & 6. Roll Qty and KG Qty */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Roll Qty <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={rollQty}
                onChange={e => {
                  setRollQty(e.target.value);
                  if (errors.rollQty) setErrors(prev => ({ ...prev, rollQty: '' }));
                }}
                placeholder="e.g. 38"
                className={`w-full px-3 py-2 text-xs font-medium rounded-md border focus:outline-hidden focus:ring-1 focus:ring-[#04342c] ${
                  errors.rollQty ? 'border-red-500 bg-red-50/30' : 'border-slate-300'
                }`}
              />
              {errors.rollQty && (
                <p className="text-[11px] text-red-600 mt-1 font-medium">{errors.rollQty}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                KG Qty <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0.1"
                step="0.01"
                value={kgQty}
                onChange={e => {
                  setKgQty(e.target.value);
                  if (errors.kgQty) setErrors(prev => ({ ...prev, kgQty: '' }));
                }}
                placeholder="e.g. 1029.95"
                className={`w-full px-3 py-2 text-xs font-medium rounded-md border focus:outline-hidden focus:ring-1 focus:ring-[#04342c] ${
                  errors.kgQty ? 'border-red-500 bg-red-50/30' : 'border-slate-300'
                }`}
              />
              {errors.kgQty && (
                <p className="text-[11px] text-red-600 mt-1 font-medium">{errors.kgQty}</p>
              )}
            </div>
          </div>

          {/* 7. Date and Time */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Date and Time
            </label>
            <input
              type="text"
              value={dateTime}
              onChange={e => setDateTime(e.target.value)}
              placeholder="YYYY-MM-DD HH:mm:ss"
              className="w-full px-3 py-2 text-xs font-medium rounded-md border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-[#04342c]"
            />
          </div>

          {/* 8. Remarks */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Remarks
            </label>
            <input
              type="text"
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="e.g. Buyer/Customer or special handling note"
              className="w-full px-3 py-2 text-xs rounded-md border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-[#04342c]"
            />
          </div>

          {/* Action Buttons: Save and Cancel */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isDuplicateBatch}
              className="px-5 py-2 text-xs font-bold rounded-md bg-[#04342c] text-white hover:bg-[#032620] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xs flex items-center gap-1.5"
            >
              {isSubmitting ? 'Saving...' : editRecord ? 'Update Record' : 'Save Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
