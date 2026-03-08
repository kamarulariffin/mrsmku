import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Users, Shield, Wallet, TrendingUp, RefreshCw, AlertTriangle, CheckCircle, Clock, Settings, Play } from 'lucide-react';
import api from '../../services/api';

// Constants
const ROLES = {
  superadmin: { name: 'Super Admin', icon: Shield, color: 'bg-red-100 text-red-700' },
  admin: { name: 'Admin MRSMKU', icon: Users, color: 'bg-pastel-lavender text-violet-700' },
  bendahari: { name: 'Bendahari', icon: Wallet, color: 'bg-green-100 text-green-700' },
  sub_bendahari: { name: 'Sub Bendahari', icon: Wallet, color: 'bg-emerald-100 text-emerald-700' },
  guru_kelas: { name: 'Guru Kelas', color: 'bg-blue-100 text-blue-700' },
  guru_homeroom: { name: 'Guru HomeRoom', color: 'bg-pastel-mint text-teal-700' },
  warden: { name: 'Warden', color: 'bg-orange-100 text-orange-700' },
  guard: { name: 'Pengawal', icon: Shield, color: 'bg-slate-100 text-slate-700' },
  bus_admin: { name: 'Admin Bas', color: 'bg-cyan-100 text-cyan-700' },
  koop_admin: { name: 'Admin Koperasi', color: 'bg-lime-100 text-lime-700' },
  parent: { name: 'Ibu Bapa', icon: Users, color: 'bg-teal-100 text-teal-700' },
  pelajar: { name: 'Pelajar', color: 'bg-amber-100 text-amber-700' }
};

// Components
const Spinner = ({ size = 'md' }) => (
  <div className={`spinner ${size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'}`}></div>
);

const Card = ({ children, className = '', hover = false, ...props }) => (
  <div className={`bg-white rounded-xl border border-slate-100 p-6 relative overflow-hidden ${hover ? 'card-hover cursor-pointer' : ''} ${className}`} {...props}>{children}</div>
);

const StatCard = ({ icon: Icon, label, value, subtext, color = 'primary' }) => {
  const colors = { primary: 'bg-primary-100 text-primary-700', secondary: 'bg-amber-100 text-amber-700', success: 'bg-emerald-100 text-emerald-700', warning: 'bg-orange-100 text-orange-700', danger: 'bg-red-100 text-red-700' };
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

const SuperAdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [showSyncPanel, setShowSyncPanel] = useState(false);
  const [autoSyncSettings, setAutoSyncSettings] = useState(null);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [autoSyncInterval, setAutoSyncInterval] = useState(24);
  const [savingAutoSync, setSavingAutoSync] = useState(false);
  const [triggeringAutoSync, setTriggeringAutoSync] = useState(false);

  const fetchSyncStatus = async () => {
    try {
      const res = await api.get('/api/admin/sync/status');
      setSyncStatus(res.data);
    } catch {
      setSyncStatus(null);
    }
  };

  const fetchAutoSyncSettings = async () => {
    try {
      const res = await api.get('/api/admin/sync/auto-settings');
      setAutoSyncSettings(res.data);
      setAutoSyncEnabled(res.data?.enabled ?? false);
      setAutoSyncInterval(res.data?.interval_hours ?? 24);
    } catch {
      setAutoSyncSettings(null);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await api.get('/api/dashboard/admin');
      setStats(res.data);
    } catch (err) {
      toast.error('Gagal memuatkan data');
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const results = await Promise.allSettled([
        api.get('/api/dashboard/admin'),
        api.get('/api/admin/sync/status'),
        api.get('/api/admin/sync/auto-settings'),
      ]);
      const [statsRes, syncRes, autoRes] = results;
      if (statsRes.status === 'fulfilled' && statsRes.value?.data) setStats(statsRes.value.data);
      else setStats(null);
      if (syncRes.status === 'fulfilled' && syncRes.value?.data) setSyncStatus(syncRes.value.data);
      else setSyncStatus(null);
      if (autoRes.status === 'fulfilled' && autoRes.value?.data) {
        const d = autoRes.value.data;
        setAutoSyncSettings(d);
        setAutoSyncEnabled(d?.enabled ?? false);
        setAutoSyncInterval(d?.interval_hours ?? 24);
      } else setAutoSyncSettings(null);
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) toast.error('Gagal memuatkan sebahagian data');
      setLoading(false);
    };
    load();
  }, []);

  const handleFullSync = async () => {
    setSyncing(true);
    try {
      const res = await api.post('/api/admin/sync/full');
      toast.success(res.data.message || 'Sinkronisasi berjaya!');
      // Refresh all data
      await fetchStats();
      await fetchSyncStatus();
      await fetchAutoSyncSettings();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal melakukan sinkronisasi');
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveAutoSync = async () => {
    setSavingAutoSync(true);
    try {
      const res = await api.put(`/api/admin/sync/auto-settings?enabled=${autoSyncEnabled}&interval_hours=${autoSyncInterval}`);
      toast.success(res.data.message || 'Tetapan auto-sync dikemaskini!');
      await fetchAutoSyncSettings();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan tetapan');
    } finally {
      setSavingAutoSync(false);
    }
  };

  const handleTriggerAutoSync = async () => {
    setTriggeringAutoSync(true);
    try {
      const res = await api.post('/api/admin/sync/trigger-now');
      if (res.data.success) {
        toast.success(res.data.message || 'Auto-sync berjaya dijalankan!');
        await fetchSyncStatus();
        await fetchAutoSyncSettings();
      } else {
        toast.error(res.data.message);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menjalankan auto-sync');
    } finally {
      setTriggeringAutoSync(false);
    }
  };

  const formatDateTime = (isoString) => {
    if (!isoString) return 'Belum pernah';
    const date = new Date(isoString);
    return date.toLocaleString('ms-MY', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-8 min-w-0 overflow-x-hidden" data-testid="superadmin-dashboard">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold bg-gradient-to-r from-teal-600 via-violet-600 to-fuchsia-500 bg-clip-text text-transparent font-heading">Dashboard Super Admin</h1>
          <p className="text-slate-600 mt-2 text-lg">Kawalan penuh sistem MRSMKU</p>
        </div>
        <button
          onClick={() => setShowSyncPanel(!showSyncPanel)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-violet-500 text-white rounded-lg hover:opacity-90 transition-all shadow-pastel-sm"
          data-testid="toggle-sync-panel-btn"
        >
          <RefreshCw size={18} />
          <span>Sync Data</span>
        </button>
      </div>

      {/* Sync Panel */}
      {showSyncPanel && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-pastel border border-pastel-lavender p-6"
          data-testid="sync-panel"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-pastel-mint rounded-lg">
              <RefreshCw className="text-teal-600" size={24} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Sinkronisasi Data</h3>
              <p className="text-sm text-slate-500">Selaraskan data antara koleksi Students & Users</p>
            </div>
          </div>

          {syncStatus && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">Jumlah Users</p>
                <p className="text-xl font-bold text-slate-800">{syncStatus.summary?.total_users || 0}</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">Users Pelajar</p>
                <p className="text-xl font-bold text-amber-600">{syncStatus.summary?.pelajar_users || 0}</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">Jumlah Pelajar</p>
                <p className="text-xl font-bold text-blue-600">{syncStatus.summary?.total_students || 0}</p>
              </div>
              <div className={`rounded-lg p-3 ${syncStatus.sync_needed ? 'bg-red-50' : 'bg-emerald-50'}`}>
                <p className="text-xs text-slate-500">Status</p>
                <div className="flex items-center gap-1">
                  {syncStatus.sync_needed ? (
                    <>
                      <AlertTriangle size={16} className="text-red-500" />
                      <p className="text-sm font-bold text-red-600">Perlu Sync</p>
                    </>
                  ) : (
                    <>
                      <CheckCircle size={16} className="text-emerald-500" />
                      <p className="text-sm font-bold text-emerald-600">Sinkron</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {syncStatus?.issues && (
            <div className="bg-slate-50 rounded-lg p-4 mb-4">
              <p className="text-sm font-semibold text-slate-700 mb-2">Isu Dikesan:</p>
              <ul className="text-sm text-slate-600 space-y-1">
                <li>• Pelajar tanpa akaun user: <span className="font-semibold">{syncStatus.issues.students_without_user_account || 0}</span></li>
                <li>• Pelajar tanpa agama: <span className="font-semibold">{syncStatus.issues.students_without_religion || 0}</span></li>
                <li>• Users pelajar tanpa agama: <span className="font-semibold">{syncStatus.issues.pelajar_users_without_religion || 0}</span></li>
              </ul>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleFullSync}
              disabled={syncing}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold transition-all ${
                syncing 
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:opacity-90 shadow-md'
              }`}
              data-testid="sync-data-btn"
            >
              <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Sedang Sinkronisasi...' : 'Sinkronkan Data'}
            </button>
            <button
              onClick={fetchSyncStatus}
              className="px-4 py-2.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-all"
              data-testid="refresh-status-btn"
            >
              Muat Semula Status
            </button>
          </div>

          {/* Auto-Sync Settings Section */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-pastel-lavender rounded-lg">
                <Clock className="text-violet-600" size={20} />
              </div>
              <div>
                <h4 className="font-semibold text-slate-800">Auto-Sync Berkala</h4>
                <p className="text-xs text-slate-500">Sinkronisasi automatik mengikut jadual</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              {/* Toggle Enable/Disable */}
              <div className="bg-slate-50 rounded-lg p-4">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm font-medium text-slate-700">Status Auto-Sync</span>
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={autoSyncEnabled}
                      onChange={(e) => setAutoSyncEnabled(e.target.checked)}
                      className="sr-only"
                      data-testid="auto-sync-toggle"
                    />
                    <div className={`w-11 h-6 rounded-full transition-colors ${autoSyncEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                      <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${autoSyncEnabled ? 'translate-x-5' : ''}`}></div>
                    </div>
                  </div>
                </label>
                <p className={`text-xs mt-2 ${autoSyncEnabled ? 'text-emerald-600' : 'text-slate-500'}`}>
                  {autoSyncEnabled ? 'Aktif' : 'Tidak Aktif'}
                </p>
              </div>

              {/* Interval Selection */}
              <div className="bg-slate-50 rounded-lg p-4">
                <label className="text-sm font-medium text-slate-700 block mb-2">Selang Masa</label>
                <select
                  value={autoSyncInterval}
                  onChange={(e) => setAutoSyncInterval(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  data-testid="auto-sync-interval"
                >
                  <option value={6}>Setiap 6 jam</option>
                  <option value={12}>Setiap 12 jam</option>
                  <option value={24}>Setiap 24 jam (Harian)</option>
                  <option value={48}>Setiap 2 hari</option>
                  <option value={168}>Setiap minggu</option>
                </select>
              </div>

              {/* Last Run Info */}
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-sm font-medium text-slate-700 mb-1">Kali Terakhir Dijalankan</p>
                <p className="text-sm text-slate-600">{formatDateTime(autoSyncSettings?.last_run)}</p>
                {autoSyncSettings?.last_results && (
                  <p className="text-xs text-slate-500 mt-1">
                    Perubahan: {(autoSyncSettings.last_results.orphan_users_deleted || 0) + 
                              (autoSyncSettings.last_results.users_created || 0) + 
                              (autoSyncSettings.last_results.religion_updated || 0)} rekod
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSaveAutoSync}
                disabled={savingAutoSync}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                  savingAutoSync 
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                    : 'bg-teal-600 text-white hover:bg-teal-700'
                }`}
                data-testid="save-auto-sync-btn"
              >
                <Settings size={16} className={savingAutoSync ? 'animate-spin' : ''} />
                {savingAutoSync ? 'Menyimpan...' : 'Simpan Tetapan'}
              </button>
              <button
                onClick={handleTriggerAutoSync}
                disabled={triggeringAutoSync || !autoSyncEnabled}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                  triggeringAutoSync || !autoSyncEnabled
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                    : 'bg-amber-500 text-white hover:bg-amber-600'
                }`}
                data-testid="trigger-auto-sync-btn"
                title={!autoSyncEnabled ? 'Auto-sync perlu diaktifkan dahulu' : 'Jalankan auto-sync sekarang'}
              >
                <Play size={16} className={triggeringAutoSync ? 'animate-pulse' : ''} />
                {triggeringAutoSync ? 'Menjalankan...' : 'Jalankan Sekarang'}
              </button>
            </div>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard icon={Users} label="Jumlah Pelajar" value={stats?.total_students || 0} subtext={`${stats?.pending_students || 0} menunggu`} color="primary" />
        <StatCard icon={Shield} label="Jumlah Pengguna" value={Object.values(stats?.role_counts || {}).reduce((a, b) => a + b, 0)} color="secondary" />
        <StatCard icon={Wallet} label="Jumlah Yuran" value={`RM ${(stats?.total_fees || 0).toFixed(2)}`} color="warning" />
        <StatCard icon={TrendingUp} label="Terkumpul" value={`${(stats?.collection_rate || 0).toFixed(1)}%`} subtext={`RM ${(stats?.total_collected || 0).toFixed(2)}`} color="success" />
      </div>

      <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl border border-white/50 p-6">
        <h3 className="font-bold text-slate-900 mb-6 text-lg">Pengguna Mengikut Role</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {stats?.role_counts && Object.entries(stats.role_counts).map(([role, count]) => {
            const roleInfo = ROLES[role] || { name: role, color: 'bg-slate-100 text-slate-700' };
            return (
              <motion.div 
                key={role} 
                whileHover={{ scale: 1.05 }}
                className={`p-5 rounded-2xl ${roleInfo.color} shadow-lg transition-all cursor-pointer`}
              >
                <p className="text-3xl font-extrabold">{count}</p>
                <p className="text-sm font-medium mt-1">{roleInfo.name}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export { SuperAdminDashboard };
export default SuperAdminDashboard;
