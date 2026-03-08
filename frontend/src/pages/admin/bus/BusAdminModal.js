import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from './BusAdminShared';

/**
 * Modal slide-in panel untuk form Admin Bas (Syarikat, Bas, Route, Trip).
 * Guna anak (children) sebagai kandungan form; footer ada Batal + Simpan/Kemaskini.
 * size: 'default' (max-w-lg) | 'lg' (max-w-2xl) untuk form yang lebih lebar.
 */
export default function BusAdminModal({
  open,
  onClose,
  title,
  onSubmit,
  submitLabel = 'Simpan',
  loading = false,
  size = 'default',
  children,
}) {
  const maxWidthClass = size === 'lg' ? 'max-w-2xl' : 'max-w-lg';
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={`fixed right-0 top-0 h-full w-full ${maxWidthClass} bg-white shadow-2xl z-50 flex flex-col`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b bg-gradient-to-r from-cyan-500 to-blue-600 text-white">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold">{title}</h3>
                <button
                  type="button"
                  onClick={onClose}
                  className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-white/20 rounded-lg transition-colors"
                  aria-label="Tutup"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            <form onSubmit={onSubmit} className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {children}
              </div>
              <div className="p-4 border-t bg-slate-50 flex gap-3">
                <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
                  Batal
                </Button>
                <Button type="submit" variant="primary" className="flex-1" loading={loading}>
                  {submitLabel}
                </Button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
