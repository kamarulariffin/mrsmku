import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

// Spinner Component
export const Spinner = ({ size = 'md' }) => (
  <div className={`spinner ${size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'}`}></div>
);

// Button Component
export const Button = ({ children, variant = 'primary', size = 'md', loading, disabled, className = '', ...props }) => {
  const variants = {
    primary: 'bg-primary-700 hover:bg-primary-900 text-white shadow-sm hover:shadow-md',
    secondary: 'bg-secondary-600 hover:bg-amber-700 text-white',
    outline: 'border-2 border-primary-700 text-primary-700 hover:bg-primary-50',
    ghost: 'text-slate-600 hover:text-primary-700 hover:bg-slate-100',
    danger: 'bg-red-600 hover:bg-red-700 text-white'
  };
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-5 py-2.5 text-sm', lg: 'px-6 py-3 text-base' };
  return (
    <button 
      className={`font-medium rounded-lg transition-all btn-click flex items-center justify-center gap-2 ${variants[variant]} ${sizes[size]} ${className} ${disabled || loading ? 'opacity-60 cursor-not-allowed' : ''}`} 
      disabled={disabled || loading} 
      {...props}
    >
      {loading ? <Spinner size="sm" /> : null}{children}
    </button>
  );
};

// Input Component
export const Input = ({ label, error, icon: Icon, ...props }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
    <div className="relative">
      {Icon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon size={18} /></div>}
      <input 
        className={`flex h-11 w-full rounded-lg border bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${Icon ? 'pl-10' : ''} ${error ? 'border-red-500' : 'border-slate-200'}`} 
        {...props} 
      />
    </div>
    {error && <p className="text-sm text-red-500">{error}</p>}
  </div>
);

// Select Component
export const Select = ({ label, error, children, ...props }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
    <select 
      className={`flex h-11 w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-700 focus:ring-offset-2 ${error ? 'border-red-500' : 'border-slate-200'}`} 
      {...props}
    >
      {children}
    </select>
    {error && <p className="text-sm text-red-500">{error}</p>}
  </div>
);

// Card Component
export const Card = ({ children, className = '', hover = false, ...props }) => (
  <div 
    className={`bg-white rounded-xl border border-slate-100 p-6 relative overflow-hidden ${hover ? 'card-hover cursor-pointer' : ''} ${className}`} 
    {...props}
  >
    {children}
  </div>
);

// Badge Component
export const Badge = ({ status, children }) => {
  const styles = { 
    approved: 'bg-emerald-100 text-emerald-800', 
    pending: 'bg-amber-100 text-amber-800', 
    rejected: 'bg-red-100 text-red-800', 
    paid: 'bg-emerald-100 text-emerald-800', 
    partial: 'bg-blue-100 text-blue-800', 
    overdue: 'bg-red-100 text-red-800', 
    active: 'bg-emerald-100 text-emerald-800', 
    inactive: 'bg-red-100 text-red-800' 
  };
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${styles[status] || 'bg-slate-100 text-slate-800'}`}>{children}</span>;
};

// StatCard Component
export const StatCard = ({ icon: Icon, label, value, subtext, color = 'primary' }) => {
  const colors = { 
    primary: 'bg-primary-100 text-primary-700', 
    secondary: 'bg-amber-100 text-amber-700', 
    success: 'bg-emerald-100 text-emerald-700', 
    warning: 'bg-orange-100 text-orange-700', 
    danger: 'bg-red-100 text-red-700' 
  };
  return (
    <Card className="animate-fadeIn">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 font-medium">{label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 font-heading">{value}</p>
          {subtext && <p className="text-xs text-slate-400 mt-1">{subtext}</p>}
        </div>
        <div className={`p-3 rounded-lg ${colors[color]}`}><Icon size={24} /></div>
      </div>
    </Card>
  );
};

// Modal Component
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
