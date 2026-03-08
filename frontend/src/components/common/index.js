import React from 'react';

export { HelpManualLink } from './HelpManualLink';
export const Spinner = ({ size = 'md' }) => (
  <div className={`spinner ${size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'}`}></div>
);

export const Button = ({ children, variant = 'primary', size = 'md', loading, disabled, className = '', ...props }) => {
  const variants = {
    primary: 'bg-primary-600 hover:bg-primary-700 text-white shadow-pastel-sm hover:shadow-pastel transition-all duration-300',
    secondary: 'bg-pastel-lavender/80 hover:bg-pastel-lavender text-violet-800 hover:text-violet-900 shadow-pastel-sm',
    outline: 'border-2 border-primary-300 text-primary-700 hover:bg-primary-50/80 hover:border-primary-400',
    ghost: 'text-slate-600 hover:text-primary-700 hover:bg-pastel-mint/40',
    danger: 'bg-rose-400/90 hover:bg-rose-500 text-white shadow-pastel-sm'
  };
  const sizes = { sm: 'px-3 py-2 text-sm rounded-lg min-h-[44px]', md: 'px-5 py-2.5 text-sm rounded-xl min-h-[44px]', lg: 'px-6 py-3 text-base rounded-xl min-h-[44px]' };
  return (
    <button 
      className={`font-medium transition-all btn-click flex items-center justify-center gap-2 min-w-[44px] ${variants[variant]} ${sizes[size]} ${className} ${disabled || loading ? 'opacity-60 cursor-not-allowed' : ''}`} 
      disabled={disabled || loading} 
      {...props}
    >
      {loading ? <Spinner size="sm" /> : null}{children}
    </button>
  );
};

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

export const Card = ({ children, className = '', hover = false, ...props }) => (
  <div 
    className={`bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-100/80 p-6 relative overflow-hidden shadow-card-soft ${hover ? 'card-hover cursor-pointer' : ''} ${className}`} 
    {...props}
  >
    {children}
  </div>
);

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
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${styles[status] || 'bg-slate-100 text-slate-800'}`}>
      {children}
    </span>
  );
};

export const StatCard = ({ icon: Icon, label, value, subtext, color = 'primary' }) => {
  const colors = { 
    primary: 'bg-pastel-mint/60 text-teal-700', 
    secondary: 'bg-pastel-cream/70 text-amber-800', 
    success: 'bg-pastel-sage/60 text-emerald-800', 
    warning: 'bg-pastel-peach/60 text-orange-800', 
    danger: 'bg-pastel-rose/60 text-rose-800' 
  };
  return (
    <Card className="animate-fadeIn hover:shadow-pastel transition-all duration-300">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-600 font-medium">{label}</p>
          <p className="text-2xl font-bold text-slate-800 mt-1 font-heading">{value}</p>
          {subtext && <p className="text-xs text-slate-500 mt-1">{subtext}</p>}
        </div>
        <div className={`p-3 rounded-xl ${colors[color]} transition-transform duration-300 hover:scale-105`}><Icon size={24} /></div>
      </div>
    </Card>
  );
};

export const ProgressBar = ({ percent, color = 'primary' }) => (
  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
    <div 
      className={`h-full rounded-full transition-all duration-500 ${color === 'success' ? 'bg-emerald-500' : color === 'warning' ? 'bg-amber-500' : 'bg-primary-600'}`}
      style={{ width: `${Math.min(100, percent)}%` }}
    />
  </div>
);
