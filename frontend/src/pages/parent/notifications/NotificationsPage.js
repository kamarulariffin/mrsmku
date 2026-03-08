import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Bell, Check, AlertCircle, Clock, Trash2, X, Eye, Loader2 } from 'lucide-react';
import { api } from '../../../services/api';
import { Card, Button, Spinner } from '../../../components/common';
import PushNotificationManager from '../../../components/notifications/PushNotificationManager';
import getUserFriendlyError from '../../../utils/errorMessages';

export const NotificationsPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [fullMessage, setFullMessage] = useState(null);
  const [loadingFullMessage, setLoadingFullMessage] = useState(false);
  const [pushFocusActive, setPushFocusActive] = useState(false);

  const fetchNotifications = async () => {
    try { 
      const res = await api.get('/api/notifications'); 
      // Handle both array and object response
      const notifData = res.data.notifications || res.data || [];
      setNotifications(Array.isArray(notifData) ? notifData : []);
    }
    catch (err) { toast.error(getUserFriendlyError(err, 'Gagal memuatkan notifikasi.')); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchNotifications(); }, []);

  const focusTarget = searchParams.get('focus');
  const source = searchParams.get('source');
  useEffect(() => {
    if (focusTarget !== 'push') {
      setPushFocusActive(false);
      return;
    }
    const targetEl = document.getElementById('push-notification-manager-card');
    if (!targetEl) return;
    const raf = window.requestAnimationFrame(() => {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setPushFocusActive(true);
    });
    const clearHighlightTimer = window.setTimeout(() => {
      setPushFocusActive(false);
    }, 2600);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(clearHighlightTimer);
    };
  }, [focusTarget]);

  const handlePushSubscribeSuccess = () => {
    if (source !== 'payment-center') return;
    toast.success('Push berjaya diaktifkan. Kembali ke Pusat Bayaran...');
    navigate('/payment-center?push=activated', { replace: true });
  };

  const markAsRead = async (id) => { 
    try { 
      await api.put('/api/notifications/mark-read', { notification_ids: [id] }); 
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) { toast.error(getUserFriendlyError(err, 'Gagal menanda notifikasi sebagai dibaca.')); } 
  };
  
  const markAllAsRead = async () => { 
    try { 
      await api.put('/api/notifications/mark-all-read'); 
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      toast.success('Semua notifikasi ditanda dibaca'); 
    } catch (err) { toast.error(getUserFriendlyError(err, 'Gagal menanda semua notifikasi sebagai dibaca.')); } 
  };
  
  const deleteNotification = async (id, e) => {
    e.stopPropagation();
    setDeleting(id);
    try { 
      await api.delete(`/api/notifications/${id}`); 
      setNotifications(prev => prev.filter(n => n.id !== id));
      toast.success('Notifikasi dipadam'); 
    } catch (err) { 
      toast.error(getUserFriendlyError(err, 'Gagal memadam notifikasi.')); 
    } finally {
      setDeleting(null);
    }
  };
  
  const deleteAllNotifications = async () => {
    if (!window.confirm('Padam semua notifikasi?')) return;
    setLoading(true);
    try { 
      // Delete one by one since there's no bulk delete endpoint
      for (const notif of notifications) {
        await api.delete(`/api/notifications/${notif.id}`);
      }
      setNotifications([]);
      toast.success('Semua notifikasi dipadam'); 
    } catch (err) { 
      toast.error(getUserFriendlyError(err, 'Gagal memadam semua notifikasi.')); 
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
    if (notification.metadata?.announcement_id) {
      return { url: '/notifications', label: 'Baca Pengumuman' };
    }
    return null;
  };

  const handleNotificationAction = (notification, event) => {
    if (event) event.stopPropagation();
    const action = resolveNotificationAction(notification);
    if (!action) return;
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    setSelectedNotification(null);
    navigate(action.url);
  };

  const getTypeIcon = (type) => ({ info: Bell, success: Check, error: AlertCircle, action: Clock, warning: AlertCircle }[type] || Bell);
  const getTypeColor = (type) => ({ info: 'text-blue-600 bg-blue-100', success: 'text-emerald-600 bg-emerald-100', error: 'text-red-600 bg-red-100', action: 'text-amber-600 bg-amber-100', warning: 'text-orange-600 bg-orange-100' }[type] || 'text-slate-600 bg-slate-100');

  const openNotification = async (notification) => {
    setSelectedNotification(notification);
    setFullMessage(null);
    
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    
    // Check if message is truncated (ends with "...") and has announcement_id
    const isTruncated = notification.message && notification.message.endsWith('...');
    const announcementId = notification.metadata?.announcement_id;
    
    if (isTruncated && announcementId) {
      // Load full message from announcement
      setLoadingFullMessage(true);
      try {
        const res = await api.get(`/api/notifications/announcements/${announcementId}`);
        if (res.data?.announcement?.content) {
          setFullMessage(res.data.announcement.content);
        }
      } catch (err) {
        console.error('Failed to load full announcement:', err);
        // Fallback to original message if fetch fails
      } finally {
        setLoadingFullMessage(false);
      }
    }
  };

  const closeModal = () => {
    setSelectedNotification(null);
    setFullMessage(null);
  };

  // Truncate message for preview (max 100 chars)
  const truncateMessage = (message, maxLength = 100) => {
    if (!message) return '';
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength) + '...';
  };

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="notifications-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold text-primary-900 font-heading">Notifikasi</h1><p className="text-slate-600 mt-1">Pemberitahuan sistem</p></div>
        <div className="flex items-center gap-2">
          {notifications.some((n) => !n.is_read) && <Button variant="ghost" onClick={markAllAsRead} data-testid="mark-all-read"><Check size={16} className="mr-1" />Tanda Semua Dibaca</Button>}
          {notifications.length > 0 && <Button variant="danger" size="sm" onClick={deleteAllNotifications} data-testid="delete-all-notifications"><Trash2 size={16} className="mr-1" />Padam Semua</Button>}
        </div>
      </div>
      
      {/* Push Notification Manager */}
      <div
        id="push-notification-manager-card"
        className={`rounded-2xl transition-all duration-300 ${
          pushFocusActive ? 'ring-2 ring-violet-400 ring-offset-2 ring-offset-white' : ''
        }`}
      >
        <PushNotificationManager onSubscribeSuccess={handlePushSubscribeSuccess} />
      </div>
      
      {loading ? <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div> : notifications.length === 0 ? (
        <Card className="text-center py-12"><Bell className="mx-auto text-slate-300" size={48} /><h3 className="mt-4 text-lg font-medium text-slate-700">Tiada notifikasi</h3></Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => {
            const Icon = getTypeIcon(notification.type);
            const action = resolveNotificationAction(notification);
            return (
              <Card 
                key={notification.id} 
                className={`animate-fadeIn cursor-pointer hover:shadow-md transition-all ${!notification.is_read ? 'border-l-4 border-l-primary-500' : ''}`} 
                onClick={() => openNotification(notification)}
                data-testid={`notification-card-${notification.id}`}
              >
                <div className="flex items-start gap-4">
                  <div className={`p-2 rounded-lg ${getTypeColor(notification.type)}`}><Icon size={20} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{notification.title}</h3>
                      <Eye size={14} className="text-slate-400 flex-shrink-0" title="Klik untuk baca penuh" />
                    </div>
                    <p className="text-sm text-slate-600 mt-1 line-clamp-2">{truncateMessage(notification.message, 120)}</p>
                    <p className="text-xs text-slate-400 mt-2">{new Date(notification.created_at).toLocaleString('ms-MY')}</p>
                    {action && (
                      <button
                        onClick={(e) => handleNotificationAction(notification, e)}
                        className="mt-2 min-h-[44px] inline-flex items-center px-3 py-2 text-xs font-medium rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors"
                        data-testid={`notification-action-${notification.id}`}
                      >
                        {action.label}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!notification.is_read && <div className="w-2 h-2 bg-primary-500 rounded-full"></div>}
                    <button 
                      onClick={(e) => deleteNotification(notification.id, e)}
                      disabled={deleting === notification.id}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      data-testid={`delete-notification-${notification.id}`}
                      title="Padam notifikasi"
                    >
                      {deleting === notification.id ? <Spinner size="sm" /> : <Trash2 size={18} />}
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal untuk melihat notifikasi penuh */}
      {selectedNotification && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto min-h-[100dvh] min-h-screen"
          onClick={closeModal}
          data-testid="notification-modal-overlay"
        >
          <div 
            className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
            data-testid="notification-modal"
          >
            {/* Modal Header */}
            <div className={`p-4 ${getTypeColor(selectedNotification.type)} flex items-center justify-between`}>
              <div className="flex items-center gap-3">
                {React.createElement(getTypeIcon(selectedNotification.type), { size: 24 })}
                <h2 className="font-bold text-lg">{selectedNotification.title}</h2>
              </div>
              <button 
                onClick={closeModal}
                className="p-1 hover:bg-black/10 rounded-full transition-colors"
                data-testid="close-notification-modal"
              >
                <X size={24} />
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="p-5 overflow-y-auto max-h-[60vh]">
              {loadingFullMessage ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="animate-spin text-primary-500" size={24} />
                  <span className="ml-2 text-slate-500">Memuatkan mesej penuh...</span>
                </div>
              ) : (
                <p className="text-slate-700 whitespace-pre-wrap leading-relaxed" data-testid="notification-full-message">
                  {fullMessage || selectedNotification.message}
                </p>
              )}
              {selectedNotification.sender_name && (
                <p className="text-sm text-slate-500 mt-4 pt-4 border-t">
                  Daripada: <span className="font-medium">{selectedNotification.sender_name}</span>
                </p>
              )}
            </div>
            
            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {new Date(selectedNotification.created_at).toLocaleString('ms-MY', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
              <div className="flex items-center gap-2">
                {resolveNotificationAction(selectedNotification) && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={(e) => handleNotificationAction(selectedNotification, e)}
                    data-testid="btn-notification-action"
                  >
                    {resolveNotificationAction(selectedNotification).label}
                  </Button>
                )}
                <Button variant="primary" size="sm" onClick={closeModal} data-testid="btn-close-modal">
                  Tutup
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;
