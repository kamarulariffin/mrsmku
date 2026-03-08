import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, X, Check, CheckCheck, Trash2, ExternalLink, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../services/api';

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

  // Priority badge
  const getPriorityBadge = (priority) => {
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
      general: '📌'
    };
    return icons[category] || icons.general;
  };

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
                {notifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${
                      !notif.is_read ? 'bg-primary-50/50' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-lg flex-shrink-0">
                        {getCategoryIcon(notif.category)}
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className={`text-sm font-medium ${!notif.is_read ? 'text-slate-900' : 'text-slate-700'}`}>
                                {notif.title}
                              </p>
                              {getPriorityBadge(notif.priority)}
                            </div>
                            <p className="text-sm text-slate-500 line-clamp-2 mt-0.5">
                              {notif.message}
                            </p>
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
                            {notif.action_label || 'Lihat'}
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
                ))}
                
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
