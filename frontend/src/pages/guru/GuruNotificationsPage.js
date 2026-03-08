import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { 
  Bell, Send, Users, Mail, MessageSquare, Plus, ChevronRight,
  RefreshCw, CheckCircle, Clock, AlertCircle, Megaphone, X,
  Search, Filter, Trash2, Edit, Eye, FileText, BarChart2
} from 'lucide-react';
import api from '../../services/api';
import PushNotificationManager from '../../components/notifications/PushNotificationManager';

// ============ COMPONENTS ============

const Spinner = ({ size = 'md' }) => (
  <div className={`animate-spin rounded-full border-2 border-primary-200 border-t-primary-600 ${
    size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'
  }`}></div>
);

const Card = ({ children, className = '', ...props }) => (
  <div className={`bg-white rounded-xl border border-slate-100 p-6 shadow-sm ${className}`} {...props}>
    {children}
  </div>
);

const StatCard = ({ icon: Icon, label, value, subtext, color = 'primary' }) => {
  const colors = { 
    primary: 'bg-primary-100 text-primary-700', 
    success: 'bg-emerald-100 text-emerald-700', 
    warning: 'bg-amber-100 text-amber-700', 
    danger: 'bg-red-100 text-red-700',
    info: 'bg-blue-100 text-blue-700'
  };
  return (
    <Card className="hover:shadow-md transition-shadow">
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

const Badge = ({ variant = 'default', children }) => {
  const styles = {
    default: 'bg-slate-100 text-slate-700',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-red-100 text-red-700',
    info: 'bg-blue-100 text-blue-700',
    primary: 'bg-primary-100 text-primary-700'
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${styles[variant]}`}>
      {children}
    </span>
  );
};

// ============ MAIN PAGE ============

const GuruNotificationsPage = () => {
  // Dashboard state
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Parents list state
  const [parents, setParents] = useState([]);
  const [loadingParents, setLoadingParents] = useState(false);
  const [parentSearch, setParentSearch] = useState('');
  const [parentPagination, setParentPagination] = useState({ page: 1, total: 0, total_pages: 1 });
  
  // Announcements state
  const [announcements, setAnnouncements] = useState([]);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(false);
  
  // Modal states
  const [showQuickSend, setShowQuickSend] = useState(false);
  const [showNewAnnouncement, setShowNewAnnouncement] = useState(false);
  const [selectedParents, setSelectedParents] = useState([]);
  
  // Quick send form
  const [quickForm, setQuickForm] = useState({
    title: '',
    message: '',
    target: 'all',
    send_push: true,
    send_email: false
  });
  const [sending, setSending] = useState(false);
  
  // Announcement form
  const [annForm, setAnnForm] = useState({
    title: '',
    content: '',
    priority: 'normal',
    send_push: true,
    send_email: true
  });
  const [creatingAnn, setCreatingAnn] = useState(false);
  
  // Active tab
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // View announcement modal
  const [viewAnnouncement, setViewAnnouncement] = useState(null);
  const [loadingFullContent, setLoadingFullContent] = useState(false);

  // ============ FETCH FUNCTIONS ============

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await api.get('/api/notifications/guru/dashboard');
      setDashboard(res.data);
    } catch (err) {
      toast.error('Gagal memuatkan data dashboard');
    }
  }, []);

  const fetchParents = useCallback(async (page = 1, search = '') => {
    setLoadingParents(true);
    try {
      const params = new URLSearchParams({ page, limit: 20 });
      if (search) params.append('search', search);
      
      const res = await api.get(`/api/notifications/guru/parents?${params}`);
      setParents(res.data.parents || []);
      setParentPagination(res.data.pagination || { page: 1, total: 0, total_pages: 1 });
    } catch (err) {
      toast.error('Gagal memuatkan senarai ibu bapa');
    } finally {
      setLoadingParents(false);
    }
  }, []);

  const fetchAnnouncements = useCallback(async () => {
    setLoadingAnnouncements(true);
    try {
      const res = await api.get('/api/notifications/announcements?limit=10');
      setAnnouncements(res.data.announcements || []);
    } catch (err) {
      toast.error('Gagal memuatkan pengumuman');
    } finally {
      setLoadingAnnouncements(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchDashboard(), fetchAnnouncements()]);
      setLoading(false);
    };
    loadData();
  }, [fetchDashboard, fetchAnnouncements]);

  // Load parents when tab changes
  useEffect(() => {
    if (activeTab === 'parents') {
      fetchParents(1);
    }
  }, [activeTab, fetchParents]);

  // ============ HANDLERS ============

  const handleQuickSend = async (e) => {
    e.preventDefault();
    if (!quickForm.title.trim() || !quickForm.message.trim()) {
      toast.error('Sila lengkapkan tajuk dan mesej');
      return;
    }

    setSending(true);
    try {
      const payload = {
        title: quickForm.title,
        message: quickForm.message,
        target: selectedParents.length > 0 ? 'specific' : 'all',
        target_parents: selectedParents.length > 0 ? selectedParents : null,
        send_push: quickForm.send_push,
        send_email: quickForm.send_email
      };

      const res = await api.post('/api/notifications/guru/send-quick', payload);
      toast.success(res.data.message || 'Notifikasi berjaya dihantar!');
      
      // Reset form
      setQuickForm({ title: '', message: '', target: 'all', send_push: true, send_email: false });
      setSelectedParents([]);
      setShowQuickSend(false);
      
      // Refresh dashboard
      fetchDashboard();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menghantar notifikasi');
    } finally {
      setSending(false);
    }
  };

  const handleCreateAnnouncement = async (e) => {
    e.preventDefault();
    if (!annForm.title.trim() || !annForm.content.trim()) {
      toast.error('Sila lengkapkan tajuk dan kandungan');
      return;
    }

    setCreatingAnn(true);
    try {
      const res = await api.post('/api/notifications/announcements', annForm);
      toast.success('Pengumuman berjaya dicipta dan diterbitkan!');
      
      // Reset form
      setAnnForm({ title: '', content: '', priority: 'normal', send_push: true, send_email: true });
      setShowNewAnnouncement(false);
      
      // Refresh
      fetchAnnouncements();
      fetchDashboard();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal mencipta pengumuman');
    } finally {
      setCreatingAnn(false);
    }
  };

  const handleDeleteAnnouncement = async (id) => {
    if (!window.confirm('Adakah anda pasti untuk memadam pengumuman ini?')) return;
    
    try {
      await api.delete(`/api/notifications/announcements/${id}`);
      toast.success('Pengumuman dipadam');
      setAnnouncements(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      toast.error('Gagal memadam pengumuman');
    }
  };

  const toggleParentSelection = (parentId) => {
    setSelectedParents(prev => 
      prev.includes(parentId) 
        ? prev.filter(id => id !== parentId)
        : [...prev, parentId]
    );
  };

  const selectAllParents = () => {
    if (selectedParents.length === parents.length) {
      setSelectedParents([]);
    } else {
      setSelectedParents(parents.map(p => p.id));
    }
  };

  // Handle view full announcement
  const handleViewAnnouncement = async (ann) => {
    setViewAnnouncement(ann);
    
    // Check if content might be truncated (ends with ...)
    if (ann.content && ann.content.endsWith('...')) {
      setLoadingFullContent(true);
      try {
        const res = await api.get(`/api/announcements/${ann.id}`);
        if (res.data && res.data.content) {
          setViewAnnouncement(prev => ({ ...prev, content: res.data.content }));
        }
      } catch (err) {
        console.error('Failed to fetch full content:', err);
      } finally {
        setLoadingFullContent(false);
      }
    }
  };

  // ============ RENDER ============

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  const classInfo = dashboard?.class_info || {};
  const pushStats = dashboard?.push_stats || {};
  const annStats = dashboard?.announcement_stats || {};

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="guru-notifications-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 font-heading flex items-center gap-2">
            <Bell className="text-primary-600" size={28} />
            Pusat Notifikasi
          </h1>
          <p className="text-slate-600 mt-1">
            Kelas: <span className="font-semibold text-primary-700">{classInfo.full_class || '-'}</span>
            <span className="text-slate-400 ml-2">• {classInfo.student_count || 0} pelajar, {classInfo.parent_count || 0} ibu bapa</span>
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowQuickSend(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors"
            data-testid="quick-send-btn"
          >
            <Send size={18} />
            Hantar Push Notification & Email
          </button>
          <button
            onClick={() => { fetchDashboard(); fetchAnnouncements(); }}
            className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            title="Muat Semula"
          >
            <RefreshCw size={20} className="text-slate-600" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          icon={Users} 
          label="Ibu Bapa Terdaftar" 
          value={pushStats.total_parents || 0}
          color="primary" 
        />
        <StatCard 
          icon={Bell} 
          label="Langganan Push" 
          value={pushStats.subscribed_count || 0}
          subtext={`${(pushStats.subscription_rate || 0).toFixed(0)}% kadar langganan`}
          color="success" 
        />
        <StatCard 
          icon={Megaphone} 
          label="Pengumuman Diterbit" 
          value={annStats.published || 0}
          color="info" 
        />
        <StatCard 
          icon={Mail} 
          label="Email Hari Ini" 
          value={dashboard?.email_stats?.sent_today || 0}
          color="warning" 
        />
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-6">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: BarChart2 },
            { id: 'announcements', label: 'Pengumuman', icon: Megaphone },
            { id: 'parents', label: 'Senarai Ibu Bapa', icon: Users }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-1 py-3 border-b-2 font-medium transition-colors ${
                activeTab === tab.id 
                  ? 'border-primary-600 text-primary-600' 
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'dashboard' && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Recent Announcements */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <Megaphone size={18} className="text-primary-600" />
                Pengumuman Terkini
              </h3>
              <button
                onClick={() => setShowNewAnnouncement(true)}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
              >
                <Plus size={16} />
                Baru
              </button>
            </div>
            
            {dashboard?.recent_announcements?.length > 0 ? (
              <div className="space-y-3">
                {dashboard.recent_announcements.map(ann => (
                  <div 
                    key={ann.id} 
                    className="p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleViewAnnouncement(ann)}
                    data-testid={`announcement-item-${ann.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800">{ann.title}</p>
                        <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">{ann.content}</p>
                        <p className="text-xs text-primary-600 mt-1 flex items-center gap-1">
                          <Eye size={12} />
                          Klik untuk baca penuh
                        </p>
                      </div>
                      <Badge variant={ann.priority === 'urgent' ? 'danger' : ann.priority === 'high' ? 'warning' : 'default'}>
                        {ann.priority === 'urgent' ? 'Segera' : ann.priority === 'high' ? 'Tinggi' : 'Biasa'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                      <span>{new Date(ann.created_at).toLocaleDateString('ms-MY')}</span>
                      <span>•</span>
                      <span>{ann.sent_count} dihantar</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                <Megaphone size={40} className="mx-auto mb-2 opacity-50" />
                <p>Tiada pengumuman lagi</p>
              </div>
            )}
          </Card>

          {/* Quick Actions */}
          <Card>
            <h3 className="font-semibold text-slate-800 flex items-center gap-2 mb-4">
              <Send size={18} className="text-primary-600" />
              Tindakan Pantas
            </h3>
            
            <div className="space-y-3">
              <button
                onClick={() => setShowQuickSend(true)}
                className="w-full flex items-center justify-between p-4 bg-primary-50 hover:bg-primary-100 rounded-xl transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary-100 group-hover:bg-primary-200 rounded-lg">
                    <MessageSquare className="text-primary-600" size={20} />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-primary-900">Hantar Mesej Ringkas</p>
                    <p className="text-sm text-primary-600">Hantar notifikasi segera ke ibu bapa</p>
                  </div>
                </div>
                <ChevronRight className="text-primary-400" size={20} />
              </button>

              <button
                onClick={() => setShowNewAnnouncement(true)}
                className="w-full flex items-center justify-between p-4 bg-amber-50 hover:bg-amber-100 rounded-xl transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 group-hover:bg-amber-200 rounded-lg">
                    <Megaphone className="text-amber-600" size={20} />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-amber-900">Buat Pengumuman</p>
                    <p className="text-sm text-amber-600">Cipta pengumuman rasmi untuk kelas</p>
                  </div>
                </div>
                <ChevronRight className="text-amber-400" size={20} />
              </button>

              <button
                onClick={() => setActiveTab('parents')}
                className="w-full flex items-center justify-between p-4 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 group-hover:bg-emerald-200 rounded-lg">
                    <Users className="text-emerald-600" size={20} />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-emerald-900">Lihat Senarai Ibu Bapa</p>
                    <p className="text-sm text-emerald-600">Status langganan & pilih penerima</p>
                  </div>
                </div>
                <ChevronRight className="text-emerald-400" size={20} />
              </button>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'announcements' && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800">Senarai Pengumuman</h3>
            <button
              onClick={() => setShowNewAnnouncement(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium text-sm transition-colors"
            >
              <Plus size={16} />
              Pengumuman Baru
            </button>
          </div>

          {loadingAnnouncements ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : announcements.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Megaphone size={48} className="mx-auto mb-3 opacity-50" />
              <p>Tiada pengumuman</p>
              <button
                onClick={() => setShowNewAnnouncement(true)}
                className="mt-4 text-primary-600 hover:text-primary-700 font-medium"
              >
                Cipta pengumuman pertama
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Tajuk</th>
                    <th className="text-center px-4 py-3 text-sm font-semibold text-slate-700">Keutamaan</th>
                    <th className="text-center px-4 py-3 text-sm font-semibold text-slate-700">Status</th>
                    <th className="text-center px-4 py-3 text-sm font-semibold text-slate-700">Dihantar</th>
                    <th className="text-center px-4 py-3 text-sm font-semibold text-slate-700">Tarikh</th>
                    <th className="text-center px-4 py-3 text-sm font-semibold text-slate-700">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {announcements.map(ann => (
                    <tr 
                      key={ann.id} 
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => handleViewAnnouncement(ann)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{ann.title}</p>
                        <p className="text-sm text-slate-500 line-clamp-1">{ann.content}</p>
                        <p className="text-xs text-primary-600 mt-0.5 flex items-center gap-1">
                          <Eye size={12} />
                          Klik untuk baca penuh
                        </p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={ann.priority === 'urgent' ? 'danger' : ann.priority === 'high' ? 'warning' : 'default'}>
                          {ann.priority === 'urgent' ? 'Segera' : ann.priority === 'high' ? 'Tinggi' : 'Biasa'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={ann.status === 'published' ? 'success' : 'warning'}>
                          {ann.status === 'published' ? 'Diterbit' : 'Draf'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-slate-600">{ann.sent_count}</td>
                      <td className="px-4 py-3 text-center text-sm text-slate-500">
                        {new Date(ann.created_at).toLocaleDateString('ms-MY')}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteAnnouncement(ann.id); }}
                          className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                          title="Padam"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {activeTab === 'parents' && (
        <Card>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <h3 className="font-semibold text-slate-800">Senarai Ibu Bapa Kelas</h3>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  value={parentSearch}
                  onChange={(e) => setParentSearch(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && fetchParents(1, parentSearch)}
                  placeholder="Cari ibu bapa..."
                  className="pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              {selectedParents.length > 0 && (
                <button
                  onClick={() => setShowQuickSend(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium"
                >
                  <Send size={16} />
                  Hantar ({selectedParents.length})
                </button>
              )}
            </div>
          </div>

          {loadingParents ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : parents.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Users size={48} className="mx-auto mb-3 opacity-50" />
              <p>Tiada ibu bapa dijumpai</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="text-left px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedParents.length === parents.length && parents.length > 0}
                          onChange={selectAllParents}
                          className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                        />
                      </th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Nama</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Email</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">No. Tel</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Anak</th>
                      <th className="text-center px-4 py-3 text-sm font-semibold text-slate-700">Push</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parents.map(parent => (
                      <tr key={parent.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedParents.includes(parent.id)}
                            onChange={() => toggleParentSelection(parent.id)}
                            className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">{parent.full_name}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{parent.email || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{parent.phone || '-'}</td>
                        <td className="px-4 py-3">
                          {parent.children?.map(child => (
                            <span key={child.id} className="inline-block px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded mr-1 mb-1">
                              {child.name}
                            </span>
                          ))}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {parent.push_subscribed ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600">
                              <CheckCircle size={16} />
                              <span className="text-xs">{parent.device_count}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {parentPagination.total_pages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                  <p className="text-sm text-slate-500">
                    Halaman {parentPagination.page} / {parentPagination.total_pages}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => fetchParents(parentPagination.page - 1, parentSearch)}
                      disabled={parentPagination.page <= 1}
                      className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm disabled:opacity-50"
                    >
                      Sebelum
                    </button>
                    <button
                      onClick={() => fetchParents(parentPagination.page + 1, parentSearch)}
                      disabled={parentPagination.page >= parentPagination.total_pages}
                      className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm disabled:opacity-50"
                    >
                      Seterus
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {/* Quick Send Modal */}
      {showQuickSend && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen" onClick={() => !sending && setShowQuickSend(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Send className="text-primary-600" size={22} />
                Hantar Mesej Ringkas
              </h3>
              <button onClick={() => !sending && setShowQuickSend(false)} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-slate-100 rounded-lg" disabled={sending}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleQuickSend} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tajuk</label>
                <input
                  type="text"
                  value={quickForm.title}
                  onChange={(e) => setQuickForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Contoh: Peringatan Mesyuarat PIBG"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mesej</label>
                <textarea
                  value={quickForm.message}
                  onChange={(e) => setQuickForm(prev => ({ ...prev, message: e.target.value }))}
                  placeholder="Tulis mesej anda di sini..."
                  rows={4}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  required
                />
              </div>

              <div className="p-4 bg-slate-50 rounded-xl">
                <p className="text-sm font-medium text-slate-700 mb-3">Penerima</p>
                <p className="text-sm text-slate-600">
                  {selectedParents.length > 0 
                    ? `${selectedParents.length} ibu bapa dipilih` 
                    : `Semua ${classInfo.parent_count || 0} ibu bapa dalam kelas`}
                </p>
              </div>

              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={quickForm.send_push}
                    onChange={(e) => setQuickForm(prev => ({ ...prev, send_push: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-slate-700">Push Notification</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={quickForm.send_email}
                    onChange={(e) => setQuickForm(prev => ({ ...prev, send_email: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-slate-700">Email</span>
                </label>
              </div>
            
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowQuickSend(false)}
                  disabled={sending}
                  className="flex-1 px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
                >
                  {sending ? <Spinner size="sm" /> : <Send size={18} />}
                  {sending ? 'Menghantar...' : 'Hantar Sekarang'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Announcement Modal */}
      {showNewAnnouncement && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen" onClick={() => !creatingAnn && setShowNewAnnouncement(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Megaphone className="text-amber-600" size={22} />
                Pengumuman Baru
              </h3>
              <button onClick={() => !creatingAnn && setShowNewAnnouncement(false)} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-slate-100 rounded-lg" disabled={creatingAnn}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleCreateAnnouncement} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tajuk Pengumuman</label>
                <input
                  type="text"
                  value={annForm.title}
                  onChange={(e) => setAnnForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Contoh: Notis Penting - Cuti Penggal"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Kandungan</label>
                <textarea
                  value={annForm.content}
                  onChange={(e) => setAnnForm(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="Tulis kandungan pengumuman..."
                  rows={5}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Keutamaan</label>
                <div className="flex gap-3">
                  {[
                    { value: 'normal', label: 'Biasa', color: 'slate' },
                    { value: 'high', label: 'Tinggi', color: 'amber' },
                    { value: 'urgent', label: 'Segera', color: 'red' }
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAnnForm(prev => ({ ...prev, priority: opt.value }))}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border-2 transition-all ${
                        annForm.priority === opt.value
                          ? opt.color === 'slate' ? 'border-slate-500 bg-slate-100 text-slate-700'
                            : opt.color === 'amber' ? 'border-amber-500 bg-amber-100 text-amber-700'
                            : 'border-red-500 bg-red-100 text-red-700'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={annForm.send_push}
                    onChange={(e) => setAnnForm(prev => ({ ...prev, send_push: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-slate-700">Push Notification</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={annForm.send_email}
                    onChange={(e) => setAnnForm(prev => ({ ...prev, send_email: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-slate-700">Email</span>
                </label>
              </div>
            
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewAnnouncement(false)}
                  disabled={creatingAnn}
                  className="flex-1 px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={creatingAnn}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
                >
                  {creatingAnn ? <Spinner size="sm" /> : <Megaphone size={18} />}
                  {creatingAnn ? 'Mencipta...' : 'Terbit & Hantar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Announcement Modal */}
      {viewAnnouncement && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen" 
          onClick={() => setViewAnnouncement(null)}
          data-testid="view-announcement-modal"
        >
          <div 
            className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[80vh] overflow-hidden flex flex-col" 
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Megaphone className="text-primary-600" size={22} />
                Pengumuman Penuh
              </h3>
              <button 
                onClick={() => setViewAnnouncement(null)} 
                className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-slate-100 rounded-lg"
                data-testid="close-view-modal"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="mb-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-xl font-bold text-slate-900">{viewAnnouncement.title}</h4>
                  <Badge variant={viewAnnouncement.priority === 'urgent' ? 'danger' : viewAnnouncement.priority === 'high' ? 'warning' : 'default'}>
                    {viewAnnouncement.priority === 'urgent' ? 'Segera' : viewAnnouncement.priority === 'high' ? 'Tinggi' : 'Biasa'}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-2 text-sm text-slate-500">
                  <span>{new Date(viewAnnouncement.created_at).toLocaleDateString('ms-MY', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}</span>
                  {viewAnnouncement.sent_count !== undefined && (
                    <>
                      <span>•</span>
                      <span>{viewAnnouncement.sent_count} dihantar</span>
                    </>
                  )}
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4">
                {loadingFullContent ? (
                  <div className="flex items-center justify-center py-8">
                    <Spinner size="md" />
                    <span className="ml-3 text-slate-500">Memuatkan kandungan penuh...</span>
                  </div>
                ) : (
                  <div 
                    className="prose prose-slate max-w-none text-slate-700 whitespace-pre-wrap"
                    data-testid="announcement-full-content"
                  >
                    {viewAnnouncement.content}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50">
              <button
                onClick={() => setViewAnnouncement(null)}
                className="w-full px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export { GuruNotificationsPage };
export default GuruNotificationsPage;
