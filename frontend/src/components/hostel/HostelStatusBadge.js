import React from 'react';
import { STATUS_MAP } from '../../constants/hostel';

const SIZE_CLASS = {
  sm: 'px-1.5 py-0.5 rounded text-xs',
  md: 'px-3 py-1.5 rounded-lg text-sm',
};

/**
 * Badge for hostel request status (pending / approved / rejected).
 * @param {string} status - 'pending' | 'approved' | 'rejected'
 * @param {boolean} showDot - optional, render a small dot
 * @param {string} size - 'sm' | 'md'
 */
export function HostelStatusBadge({ status, showDot = false, size = 'sm' }) {
  const v = (status || '').toLowerCase();
  const config = STATUS_MAP[v] || { label: status || '–', color: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' };
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${SIZE_CLASS[size] || SIZE_CLASS.sm} ${config.color}`}>
      {showDot && <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${config.dot}`} />}
      {config.label}
    </span>
  );
}
