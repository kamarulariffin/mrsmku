/**
 * Smart360 PWA - Sync in progress indicator (offline queue syncing)
 */
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw } from 'lucide-react';

export function SyncStatus({ syncing }) {
  return (
    <AnimatePresence>
      {syncing && (
        <motion.div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9998] bg-slate-800 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
        >
          <RefreshCw size={16} className="animate-spin" />
          Menyegerakkan data...
        </motion.div>
      )}
    </AnimatePresence>
  );
}
