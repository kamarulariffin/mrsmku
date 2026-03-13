import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, X, Check, CheckCheck, Trash2, ExternalLink, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../services/api';

const BANK_RECONCILIATION_ALERT_TYPE = 'bank_reconciliation_alert';
const BANK_RECONCILIATION_CATEGORY = 'bank_reconciliation';
const BANK_RECONCILIATION_ROLE_LABEL = {
  admin: 'Admin',
  bendahari: 'Bendahari',
  sub_bendahari: 'Sub Bendahari'
};
const BANK_RECONCILIATION_ROLE_TONE = {
  admin: {
    roleBadgeClass: 'bg-indigo-100 text-indigo-700',
    rowUnreadClass: 'bg-indigo-50/70 border-l-4 border-l-indigo-300',
    rowReadClass: 'hover:bg-indigo-50/40',
    iconClass: 'bg-indigo-100',
    guidanceClass: 'bg-indigo-50 text-indigo-700 border-indigo-200'
  },
  bendahari: {
    roleBadgeClass: 'bg-emerald-100 text-emerald-700',
    rowUnreadClass: 'bg-emerald-50/70 border-l-4 border-l-emerald-300',
    rowReadClass: 'hover:bg-emerald-50/40',
    iconClass: 'bg-emerald-100',
    guidanceClass: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  },
  sub_bendahari: {
    roleBadgeClass: 'bg-amber-100 text-amber-700',
    rowUnreadClass: 'bg-amber-50/70 border-l-4 border-l-amber-300',
    rowReadClass: 'hover:bg-amber-50/40',
    iconClass: 'bg-amber-100',
    guidanceClass: 'bg-amber-50 text-amber-700 border-amber-200'
  },
  default: {
    roleBadgeClass: 'bg-violet-100 text-violet-700',
    rowUnreadClass: 'bg-violet-50/60 border-l-4 border-l-violet-300',
    rowReadClass: 'hover:bg-violet-50/30',
    iconClass: 'bg-violet-100',
    guidanceClass: 'bg-violet-50 text-violet-700 border-violet-200'
  },
  critical: {
    rowUnreadClass: 'bg-red-50/70 border-l-4 border-l-red-400',
    rowReadClass: 'hover:bg-red-50/45',
    iconClass: 'bg-red-100',
    guidanceClass: 'bg-red-50 text-red-700 border-red-200'
  },
  overdue: {
    rowUnreadClass: 'bg-rose-50/80 border-l-4 border-l-rose-400',
    rowReadClass: 'hover:bg-rose-50/50',
    iconClass: 'bg-rose-100',
    guidanceClass: 'bg-rose-50 text-rose-700 border-rose-200'
  }
};
const BANK_RECONCILIATION_TONE_LEGEND = [
  { key: 'admin', label: 'Admin', className: 'bg-indigo-100 text-indigo-700' },
  { key: 'bendahari', label: 'Bendahari', className: 'bg-emerald-100 text-emerald-700' },
  { key: 'sub_bendahari', label: 'Sub Bendahari', className: 'bg-amber-100 text-amber-700' },
  { key: 'critical', label: 'Kritikal', className: 'bg-red-100 text-red-700' },
  { key: 'overdue', label: 'Overdue', className: 'bg-rose-100 text-rose-700' }
];

const NotificationCenter = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const dropdownRef = useRef(null);

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await api.get('/api/notifications/unread-count');
      setUnreadCount(res.data.unread_count || 0);
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    }
  }, []);

  // Fetch notifications
  const fetchNotifications = useCallback(async (pageNum = 1, append = false) => {
    setLoading(true);
    try {
      const res = await api.get(`/api/notifications?page=${pageNum}&limit=10`);
      const newNotifs = res.data.notifications || [];
      
      if (append) {
        setNotifications(prev => [...prev, ...newNotifs]);
      } else {
        setNotifications(newNotifs);
      }
      
      setHasMore(res.data.pagination?.has_next || false);
      setUnreadCount(res.data.unread_count || 0);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchUnreadCount();
    // Poll for new notifications every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Open dropdown
  const handleOpen = () => {
    if (!isOpen) {
      fetchNotifications(1);
      setPage(1);
    }
    setIsOpen(!isOpen);
  };

  // Load more
  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchNotifications(nextPage, true);
  };

  // Mark single as read
  const markAsRead = async (id) => {
    try {
      await api.put('/api/notifications/mark-read', { notification_ids: [id] });
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      toast.error('Gagal menanda sebagai dibaca');
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    try {
      await api.put('/api/notifications/mark-all-read');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
      toast.success('Semua notifikasi ditanda sebagai dibaca');
    } catch (err) {
      toast.error('Gagal menanda sebagai dibaca');
    }
  };

  // Delete notification
  const deleteNotification = async (id) => {
    try {
      await api.delete(`/api/notifications/${id}`);
      const notif = notifications.find(n => n.id === id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      if (notif && !notif.is_read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      toast.error('Gagal memadam notifikasi');
    }
  };

  // Format time ago
  const timeAgo = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    
    if (diff < 60) return 'Baru sahaja';
    if (diff < 3600) return `${Math.floor(diff / 60)} minit lepas`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} jam lepas`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} hari lepas`;
    return date.toLocaleDateString('ms-MY');
  };

  const toOptionalNumber = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const toNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  const formatCurrency = (value) =>
    new Intl.NumberFormat('ms-MY', {
      style: 'currency',
      currency: 'MYR',
      minimumFractionDigits: 2
    }).format(toNumber(value, 0));

  const formatDateLabel = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const isBankReconciliationAlert = (notif) =>
    String(notif?.type || '') === BANK_RECONCILIATION_ALERT_TYPE ||
    String(notif?.category || '') === BANK_RECONCILIATION_CATEGORY;

  const resolveBankReconciliationTone = (notif) => {
    if (!isBankReconciliationAlert(notif)) return null;
    const roleKey = String(notif?.metadata?.recipient_role || '').toLowerCase();
    const roleTone = BANK_RECONCILIATION_ROLE_TONE[roleKey] || BANK_RECONCILIATION_ROLE_TONE.default;
    const daysToDue = toOptionalNumber(notif?.metadata?.days_to_due);
    const riskLevel = String(notif?.metadata?.risk_level || '').toLowerCase();
    let riskTone = null;
    if (daysToDue !== null && daysToDue < 0) {
      riskTone = BANK_RECONCILIATION_ROLE_TONE.overdue;
    } else if (riskLevel === 'critical') {
      riskTone = BANK_RECONCILIATION_ROLE_TONE.critical;
    }
    return {
      roleBadgeClass: roleTone.roleBadgeClass,
      rowUnreadClass: riskTone?.rowUnreadClass || roleTone.rowUnreadClass,
      rowReadClass: riskTone?.rowReadClass || roleTone.rowReadClass,
      iconClass: riskTone?.iconClass || roleTone.iconClass,
      guidanceClass: riskTone?.guidanceClass || roleTone.guidanceClass
    };
  };

  const getBankReconciliationBadge = (notif) => {
    if (!isBankReconciliationAlert(notif)) return null;
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-100 text-sky-700">
        Rekonsiliasi Bank
      </span>
    );
  };

  const getBankReconciliationRoleBadge = (notif) => {
    if (!isBankReconciliationAlert(notif)) return null;
    const tone = resolveBankReconciliationTone(notif);
    const roleKey = String(notif?.metadata?.recipient_role || '').toLowerCase();
    const roleLabel = notif?.metadata?.recipient_role_label || BANK_RECONCILIATION_ROLE_LABEL[roleKey];
    if (!roleLabel) return null;
    return (
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${tone?.roleBadgeClass || BANK_RECONCILIATION_ROLE_TONE.default.roleBadgeClass}`}>
        Untuk {roleLabel}
      </span>
    );
  };

  const formatNotificationCopy = (notif) => {
    const fallbackTitle = notif?.title || 'Notifikasi';
    const fallbackMessage = notif?.message || '';
    if (!isBankReconciliationAlert(notif)) {
      return {
        title: fallbackTitle,
        message: fallbackMessage,
        detail: '',
        guidance: '',
        actionLabel: notif?.action_label || 'Lihat'
      };
    }

    const meta = notif?.metadata || {};
    const metrics = meta.metrics || {};
    const bankName = meta.bank_account_name || 'Akaun bank';
    const periodStart = formatDateLabel(meta.period_start);
    const periodEnd = formatDateLabel(meta.period_end);
    const periodText =
      periodStart && periodEnd
        ? `${periodStart} - ${periodEnd}`
        : (periodStart || periodEnd || 'Tempoh tidak dinyatakan');
    const riskLevel = String(meta.risk_level || '').toLowerCase();
    const daysToDue = toOptionalNumber(meta.days_to_due);
    const recipientRole = String(meta.recipient_role || '').toLowerCase();
    const recipientRoleLabel =
      meta.recipient_role_label ||
      BANK_RECONCILIATION_ROLE_LABEL[recipientRole] ||
      '';
    const roleGuidance = String(meta.role_guidance || '').trim();
    const unresolvedItems = toNumber(metrics.unresolved_items, 0);
    const difference = toNumber(metrics.difference, 0);
    const parserWarnings = toNumber(metrics.parser_warning_count, 0);

    let headline = 'Amaran Rekonsiliasi Bank';
    if (daysToDue !== null && daysToDue < 0) {
      headline = `Amaran Overdue Rekonsiliasi (${Math.abs(daysToDue)} hari)`;
    } else if (riskLevel === 'critical') {
      headline = 'Amaran Kritikal Rekonsiliasi Bank';
    }

    const statusLabelMap = {
      uploaded: 'Dimuat Naik',
      in_review: 'Dalam Semakan',
      ready_for_approval: 'Sedia Kelulusan',
      approved: 'Diluluskan',
      rejected: 'Ditolak'
    };
    const statusText = statusLabelMap[String(meta.status || '').toLowerCase()] || 'Perlu tindakan';
    const guidanceText =
      roleGuidance ||
      `Tindakan segera diperlukan oleh ${recipientRoleLabel || 'operator kewangan'}.`;
    const detailParts = [
      `Status: ${statusText}`,
      `Unresolved: ${unresolvedItems}`,
      `Difference: ${formatCurrency(difference)}`
    ];
    if (recipientRoleLabel) {
      detailParts.push(`Peranan: ${recipientRoleLabel}`);
    }
    if (parserWarnings > 0) {
      detailParts.push(`Parser warning: ${parserWarnings}`);
    }

    return {
      title: headline,
      message: `${bankName} (${periodText}) memerlukan tindakan segera.`,
      detail: detailParts.join(' | '),
      guidance: guidanceText,
      actionLabel: notif?.action_label || 'Buka Rekonsiliasi Bank'
    };
  };

  // Priority badge
  const getPriorityBadge = (priority, notif = null) => {
    if (isBankReconciliationAlert(notif)) {
      const riskLevel = String(notif?.metadata?.risk_level || '').toLowerCase();
      const daysToDue = toOptionalNumber(notif?.metadata?.days_to_due);
      if (daysToDue !== null && daysToDue < 0) {
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-700">
            Overdue
          </span>
        );
      }
      if (riskLevel === 'critical') {
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700">
            Kritikal
          </span>
        );
      }
    }

    const styles = {
      urgent: 'bg-red-100 text-red-700',
      high: 'bg-orange-100 text-orange-700',
      normal: 'bg-slate-100 text-slate-600',
      low: 'bg-slate-50 text-slate-500'
    };
    const labels = { urgent: 'Segera', high: 'Tinggi', normal: 'Biasa', low: 'Rendah' };
    if (priority === 'normal' || priority === 'low') return null;
    return (
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${styles[priority]}`}>
        {labels[priority]}
      </span>
    );
  };

  // Category icon
  const getCategoryIcon = (category) => {
    const icons = {
      announcement: '📢',
      payment: '💰',
      class_message: '📨',
      fee_reminder: '⏰',
      bank_reconciliation: '🏦',
      general: '📌'
    };
    return icons[category] || icons.general;
  };

  const hasBankReconciliationAlerts = notifications.some((notif) =>
    isBankReconciliationAlert(notif)
  );

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors"
        data-testid="notification-bell"
      >
        <Bell size={22} className="text-slate-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-primary-50 to-white">
            <div className="flex items-center gap-2">
              <Bell size={18} className="text-primary-600" />
              <h3 className="font-semibold text-slate-800">Notifikasi</h3>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                  {unreadCount} baru
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-primary-600 transition-colors"
                  title="Tanda semua dibaca"
                >
                  <CheckCheck size={18} />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {hasBankReconciliationAlerts && (
            <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/80">
              <p className="text-[11px] text-slate-500 mb-1">Petunjuk warna rekonsiliasi bank</p>
              <div className="flex flex-wrap gap-1.5">
                {BANK_RECONCILIATION_TONE_LEGEND.map((item) => (
                  <span
                    key={item.key}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${item.className}`}
                  >
                    {item.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Notifications List */}
          <div className="max-h-[400px] overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-12 text-center">
                <Bell size={40} className="mx-auto text-slate-200 mb-3" />
                <p className="text-slate-400">Tiada notifikasi</p>
              </div>
            ) : (
              <>
                {notifications.map((notif) => {
                  const display = formatNotificationCopy(notif);
                  const bankTone = resolveBankReconciliationTone(notif);
                  const rowToneClass = bankTone
                    ? (!notif.is_read ? bankTone.rowUnreadClass : bankTone.rowReadClass)
                    : (!notif.is_read ? 'bg-primary-50/50' : 'hover:bg-slate-50');
                  return (
                    <div
                      key={notif.id}
                      className={`px-4 py-3 border-b border-slate-50 transition-colors ${rowToneClass}`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0 ${bankTone?.iconClass || 'bg-slate-100'}`}>
                          {getCategoryIcon(notif.category)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className={`text-sm font-medium ${!notif.is_read ? 'text-slate-900' : 'text-slate-700'}`}>
                                  {display.title}
                                </p>
                                {getPriorityBadge(notif.priority, notif)}
                                {getBankReconciliationBadge(notif)}
                                {getBankReconciliationRoleBadge(notif)}
                              </div>
                              <p className="text-sm text-slate-500 line-clamp-2 mt-0.5">
                                {display.message}
                              </p>
                              {display.detail && (
                                <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                                  {display.detail}
                                </p>
                              )}
                              {display.guidance && (
                                <p className={`text-[11px] mt-1.5 px-2 py-1 rounded-md border ${bankTone?.guidanceClass || BANK_RECONCILIATION_ROLE_TONE.default.guidanceClass}`}>
                                  Panduan peranan: {display.guidance}
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className="text-xs text-slate-400">
                                  {timeAgo(notif.created_at)}
                                </span>
                                {notif.sender_name && (
                                  <>
                                    <span className="text-slate-300">•</span>
                                    <span className="text-xs text-slate-400">
                                      {notif.sender_name}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {!notif.is_read && (
                                <button
                                  onClick={() => markAsRead(notif.id)}
                                  className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-emerald-600"
                                  title="Tanda dibaca"
                                >
                                  <Check size={14} />
                                </button>
                              )}
                              <button
                                onClick={() => deleteNotification(notif.id)}
                                className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-red-600"
                                title="Padam"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          {/* Action button */}
                          {notif.action_url && (
                            <a
                              href={notif.action_url}
                              className="inline-flex items-center gap-1 mt-2 text-xs text-primary-600 hover:text-primary-700 font-medium"
                            >
                              {display.actionLabel}
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </div>

                        {/* Unread indicator */}
                        {!notif.is_read && (
                          <div className="w-2 h-2 bg-primary-500 rounded-full flex-shrink-0 mt-2"></div>
                        )}
                      </div>
                    </div>
                  );
                })}
                
                {/* Load more */}
                {hasMore && (
                  <button
                    onClick={loadMore}
                    disabled={loading}
                    className="w-full py-3 text-sm text-primary-600 hover:bg-primary-50 font-medium flex items-center justify-center gap-1 disabled:opacity-50"
                  >
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
                    ) : (
                      <>
                        Muat lagi
                        <ChevronRight size={16} />
                      </>
                    )}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50">
            <a
              href="/guru/notifications"
              className="block text-center text-sm text-primary-600 hover:text-primary-700 font-medium py-1"
            >
              Lihat semua notifikasi
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
