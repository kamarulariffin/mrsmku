import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Check, CheckCheck, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../services/api';
import getUserFriendlyError from '../../utils/errorMessages';

const NOTIFICATION_ICONS = {
  warning: AlertTriangle,
  error: AlertCircle,
  info: Info,
  success: Check
};

const NOTIFICATION_COLORS = {
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800'
};

const NOTIFICATION_ICON_COLORS = {
  warning: 'text-amber-500',
  error: 'text-red-500',
  info: 'text-blue-500',
  success: 'text-emerald-500'
};

function formatTimeAgo(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Baru sahaja';
  if (diffMins < 60) return `${diffMins} minit lalu`;
  if (diffHours < 24) return `${diffHours} jam lalu`;
  if (diffDays < 7) return `${diffDays} hari lalu`;
  return date.toLocaleDateString('ms-MY', { day: 'numeric', month: 'short' });
}

export const NotificationBell = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/api/yuran/notifications/parent');
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unread_count || 0);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    // Poll for new notifications every 60 seconds
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAsRead = async (notificationId) => {
    try {
      await api.post(`/api/yuran/notifications/${notificationId}/read`);
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      toast.error(getUserFriendlyError(err, 'Gagal menanda notifikasi sebagai dibaca.'));
    }
  };

  const markAllAsRead = async () => {
    setLoading(true);
    try {
      await api.post('/api/yuran/notifications/mark-all-read');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      toast.error(getUserFriendlyError(err, 'Gagal menanda semua notifikasi.'));
    } finally {
      setLoading(false);
    }
  };

  const resolveNotificationAction = (notification) => {
    if (!notification) return null;
    if (notification.action_url) {
      return {
        url: notification.action_url,
        label: notification.action_label || 'Buka',
      };
    }

    const title = String(notification.title || '').toLowerCase();
    const message = String(notification.message || '').toLowerCase();
    if (title.includes('yuran') || message.includes('yuran') || message.includes('tunggakan')) {
      return { url: '/payment-center?bulk=all-yuran', label: 'Bayar Sekarang' };
    }
    if (title.includes('sumbangan') || title.includes('tabung') || message.includes('sumbangan')) {
      return { url: '/tabung', label: 'Lihat Kempen' };
    }
    return null;
  };

  const openNotificationAction = (notification, event) => {
    if (event) event.stopPropagation();
    const action = resolveNotificationAction(notification);
    if (!action) return;
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    setIsOpen(false);
    navigate(action.url);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl hover:bg-slate-100 transition-colors"
        data-testid="notification-bell"
      >
        <Bell className="w-6 h-6 text-slate-600" />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </motion.span>
        )}
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50"
          >
            {/* Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-teal-500 to-violet-500 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                <h3 className="font-semibold">Notifikasi</h3>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs">
                    {unreadCount} baru
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  disabled={loading}
                  className="text-xs hover:underline flex items-center gap-1"
                >
                  <CheckCheck className="w-4 h-4" />
                  Tanda semua dibaca
                </button>
              )}
            </div>

            {/* Notification List */}
            <div className="max-h-[400px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-12 text-center">
                  <Bell className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500">Tiada notifikasi</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {notifications.map((notification) => {
                    const Icon = NOTIFICATION_ICONS[notification.type] || Info;
                    const colorClass = NOTIFICATION_COLORS[notification.type] || NOTIFICATION_COLORS.info;
                    const iconColorClass = NOTIFICATION_ICON_COLORS[notification.type] || NOTIFICATION_ICON_COLORS.info;
                    const action = resolveNotificationAction(notification);
                    
                    return (
                      <div
                        key={notification.id}
                        className={`p-4 hover:bg-slate-50 transition-colors cursor-pointer ${
                          !notification.is_read ? 'bg-pastel-mint/50' : ''
                        }`}
                        onClick={() => !notification.is_read && markAsRead(notification.id)}
                        data-testid={`notification-${notification.id}`}
                      >
                        <div className="flex gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                            <Icon className={`w-5 h-5 ${iconColorClass}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className={`font-semibold text-sm ${!notification.is_read ? 'text-slate-900' : 'text-slate-600'}`}>
                                {notification.title}
                              </h4>
                              {!notification.is_read && (
                                <span className="w-2 h-2 bg-teal-500 rounded-full flex-shrink-0 mt-1.5" />
                              )}
                            </div>
                            <p className="text-sm text-slate-600 mt-1 line-clamp-2">
                              {notification.message}
                            </p>
                            <p className="text-xs text-slate-400 mt-2">
                              {formatTimeAgo(notification.created_at)}
                            </p>
                            {action && (
                              <button
                                type="button"
                                onClick={(event) => openNotificationAction(notification, event)}
                                className="mt-2 min-h-[44px] inline-flex items-center px-3 py-2 text-xs font-medium rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors"
                              >
                                {action.label}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 text-center">
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-sm text-teal-600 hover:text-teal-700 font-medium"
                >
                  Tutup
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationBell;
