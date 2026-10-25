import React from 'react';
import { DeliveryRecord } from '../types';
import { AlertTriangle, Trash2, X } from 'lucide-react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  record: DeliveryRecord | null;
  onClose: () => void;
  onConfirm: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  record,
  onClose,
  onConfirm,
}) => {
  if (!isOpen || !record) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-red-700 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-200" />
            <h2 className="text-sm font-bold tracking-wide">Confirm Record Deletion</h2>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white rounded p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs text-slate-700">
          <p className="text-slate-600 font-medium leading-relaxed">
            Are you sure you want to permanently delete this delivery record from the system?
            This action cannot be undone.
          </p>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1.5 font-mono text-[11px]">
            <div>
              <span className="text-slate-400 font-sans">Batch:</span>{' '}
              <span className="font-bold text-red-700">{record.batch}</span>
            </div>
            <div>
              <span className="text-slate-400 font-sans">Development:</span>{' '}
              <span className="font-bold text-slate-900">{record.development}</span>
            </div>
            <div>
              <span className="text-slate-400 font-sans">Quantity:</span>{' '}
              <span className="font-bold text-slate-900">
                {record.rollQty} Rolls · {record.kgQty} KG
              </span>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-2 font-bold text-white bg-red-600 hover:bg-red-700 rounded-md shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Confirm Delete</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
