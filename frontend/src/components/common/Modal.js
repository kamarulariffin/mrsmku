import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export const Modal = ({ isOpen, onClose, title, children, size = 'md' }) => (
  <AnimatePresence>
    {isOpen && (
      <>
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }} 
          className="fixed inset-0 bg-black/50 z-50" 
          onClick={onClose} 
        />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen pointer-events-none" style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }} aria-hidden="true">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} 
            animate={{ opacity: 1, scale: 1 }} 
            exit={{ opacity: 0, scale: 0.95 }} 
            className={`w-full flex-shrink-0 bg-white rounded-xl shadow-xl p-6 max-h-[90vh] overflow-y-auto overflow-x-hidden pointer-events-auto ${size === 'lg' ? 'max-w-2xl' : size === 'xl' ? 'max-w-4xl' : 'max-w-lg'}`}
          >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900 font-heading">{title}</h3>
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg"><X size={20} /></button>
          </div>
          {children}
          </motion.div>
        </div>
      </>
    )}
  </AnimatePresence>
);

export const SlidePanel = ({ isOpen, onClose, title, icon: Icon, gradientFrom = 'from-primary-600', gradientTo = 'to-primary-700', children, footer }) => (
  <AnimatePresence>
    {isOpen && (
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
          className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col"
        >
          {/* Header */}
          <div className={`bg-gradient-to-r ${gradientFrom} ${gradientTo} text-white p-6`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {Icon && <Icon size={24} />}
                <h2 className="text-xl font-bold">{title}</h2>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                <X size={24} />
              </button>
            </div>
          </div>
          
          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {children}
          </div>
          
          {/* Footer */}
          {footer && (
            <div className="border-t p-4 bg-slate-50">
              {footer}
            </div>
          )}
        </motion.div>
      </>
    )}
  </AnimatePresence>
);
