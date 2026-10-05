import React, { useState } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw, Download } from 'lucide-react';
import { Expense, Group, Member } from '../types';
import { formatMoney } from '../core/currency';

export interface ReceiptViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  expense: Expense;
  group?: Group;
  payer?: Member;
  receiptUrl?: string;
  title?: string;
}

export const ReceiptViewerModal: React.FC<ReceiptViewerModalProps> = ({
  isOpen,
  onClose,
  expense,
  group,
  payer,
  receiptUrl: directReceiptUrl,
  title: directTitle,
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  if (!isOpen) return null;

  const url = directReceiptUrl || expense.receiptUrl;
  const displayTitle = directTitle || expense.title || 'Receipt';
  const currency = group?.baseCurrency || expense.originalCurrency || 'CAD';

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => setZoomLevel(1);

  const handleDownload = () => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = expense.receiptName || `${displayTitle.replace(/\s+/g, '_')}_receipt.jpg`;
    a.click();
  };

  return (
    <div
      id="receipt-viewer-backdrop"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-between p-3 sm:p-6 animate-in fade-in duration-150"
      onClick={onClose}
    >
      {/* Top Bar */}
      <div
        className="flex items-center justify-between text-white max-w-4xl mx-auto w-full pb-3 border-b border-white/10"
        onClick={e => e.stopPropagation()}
      >
        <div className="space-y-0.5">
          <h3 className="font-bold text-base sm:text-lg flex items-center gap-2">
            <span>{displayTitle}</span>
            {expense.category && (
              <span className="text-[11px] font-normal px-2 py-0.5 rounded-md bg-white/20 text-white/90">
                {expense.category}
              </span>
            )}
          </h3>
          <p className="text-xs text-white/70">
            {payer ? `Paid by ${payer.name} • ` : ''}
            {formatMoney(expense.baseAmount || expense.originalAmount, currency)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {url && (
            <button
              onClick={handleDownload}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Download original receipt"
            >
              <Download className="w-4 h-4" />
            </button>
          )}

          <div className="hidden sm:flex items-center gap-1 bg-white/10 rounded-xl p-1">
            <button
              onClick={handleZoomOut}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors"
              title="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono font-bold px-1.5 text-white/80">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors"
              title="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleResetZoom}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors"
              title="Reset zoom"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white transition-colors cursor-pointer"
            title="Close viewer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Image Stage */}
      <div
        className="flex-1 flex items-center justify-center overflow-auto my-3"
        onClick={onClose}
      >
        {url ? (
          <div
            className="transition-transform duration-100 ease-out select-none cursor-default max-h-full"
            onClick={e => e.stopPropagation()}
            style={{ transform: `scale(${zoomLevel})` }}
          >
            <img
              src={url}
              alt={displayTitle}
              className="max-h-[75vh] max-w-[90vw] object-contain rounded-xl shadow-2xl bg-black"
            />
          </div>
        ) : (
          <p className="text-white/60 text-sm">No receipt image available.</p>
        )}
      </div>

      {/* Footer Info */}
      <div
        className="text-center text-xs text-white/60 max-w-md mx-auto w-full pt-2"
        onClick={e => e.stopPropagation()}
      >
        <span className="sm:hidden text-white/50">Pinch or double tap to zoom • </span>
        Tap outside or press Close to return.
      </div>
    </div>
  );
};
