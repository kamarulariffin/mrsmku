import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Users, Wallet, AlertCircle, CheckCircle,
  ShoppingCart, Package, AlertTriangle,
  Activity, PieChart, BarChart3, ArrowUpRight,
  ArrowDownRight, RefreshCw, FileText
} from 'lucide-react';
import { useAuth } from '../../App';
import api from '../../services/api';

// Helper Components
const StatCard = ({ icon: Icon, label, value, change, changeType = 'neutral', color = 'blue', subtext }) => {
  const colors = {
    blue: 'from-blue-500 to-teal-500',
    green: 'from-emerald-500 to-teal-600',
    amber: 'from-amber-500 to-orange-600',
    purple: 'from-violet-500 to-fuchsia-500',
    red: 'from-red-500 to-rose-600',
    cyan: 'from-cyan-500 to-blue-600'
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-lg transition-all"
    >
      <div className="flex items-start justify-between">
        <div className={`p-3 rounded-xl bg-gradient-to-br ${colors[color]} shadow-lg`}>
          <Icon className="text-white" size={24} />
        </div>
        {change !== undefined && (
          <div className={`flex items-center gap-1 text-sm font-medium ${
            changeType === 'positive' ? 'text-emerald-600' : 
            changeType === 'negative' ? 'text-red-600' : 'text-slate-500'
          }`}>
            {changeType === 'positive' ? <ArrowUpRight size={16} /> : 
             changeType === 'negative' ? <ArrowDownRight size={16} /> : null}
            {change}%
          </div>
        )}
      </div>
      <div className="mt-4">
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-sm text-slate-500 mt-1">{label}</p>
        {subtext && <p className="text-xs text-slate-400 mt-0.5">{subtext}</p>}
      </div>
    </motion.div>
  );
};

const MiniChart = ({ data = [], color = 'blue' }) => {
  const max = Math.max(...data, 1);
  const colors = {
    blue: 'bg-blue-500',
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    purple: 'bg-violet-500'
  };
  
  return (
    <div className="flex items-end gap-1 h-12">
      {data.map((value, idx) => (
        <div
          key={idx}
          className={`w-3 rounded-sm ${colors[color]} opacity-80 hover:opacity-100 transition-opacity`}
          style={{ height: `${(value / max) * 100}%`, minHeight: '4px' }}
        />
      ))}
    </div>
  );
};

const ActivityItem = ({ icon: Icon, title, description, time, type = 'info' }) => {
  const typeColors = {
    info: 'bg-blue-100 text-blue-600',
    success: 'bg-emerald-100 text-emerald-600',
    warning: 'bg-amber-100 text-amber-600',
    danger: 'bg-red-100 text-red-600'
  };
  
  return (
    <div className="flex items-start gap-3 p-3 hover:bg-slate-50 rounded-lg transition-colors">
      <div className={`p-2 rounded-lg ${typeColors[type]}`}>
        <Icon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate">{title}</p>
        <p className="text-xs text-slate-500 truncate">{description}</p>
      </div>
      <p className="text-xs text-slate-400 whitespace-nowrap">{time}</p>
    </div>
  );
};

const ProgressBar = ({ label, value, max, color = 'blue' }) => {
  const percent = max > 0 ? (value / max) * 100 : 0;
  const colors = {
    blue: 'bg-blue-500',
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500'
  };
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-medium text-slate-900">{percent.toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all duration-500 ${colors[color]}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};

// Main Component
const SmartDashboardPage = () => {
  useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState(null);
  const [, setFeeStats] = useState(null);
  const [salesStats, setSalesStats] = useState(null);
  const [complaintStats, setComplaintStats] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);

  const fetchAllData = async (showToast = false) => {
    if (showToast) setRefreshing(true);
    else setLoading(true);

    const results = await Promise.allSettled([
      api.get('/api/dashboard/admin'),
      api.get('/api/koperasi/admin/stats'),
      api.get('/api/complaints/dashboard/stats'),
    ]);
    const adminData = results[0].status === 'fulfilled' ? results[0].value?.data : null;
    const salesData = results[1].status === 'fulfilled' ? results[1].value?.data : {};
    const complaintData = results[2].status === 'fulfilled' ? results[2].value?.data : { stats: {} };

    setStats(adminData);
    setSalesStats(salesData);
    setComplaintStats(complaintData?.stats ?? {});

    const activities = [];
    if (adminData?.pending_students > 0) {
      activities.push({
        icon: Users,
        title: `${adminData.pending_students} pelajar menunggu pengesahan`,
        description: 'Sila semak dan sahkan pendaftaran',
        time: 'Terkini',
        type: 'warning',
      });
    }
    if (complaintData?.stats?.aduan_kritikal > 0) {
      activities.push({
        icon: AlertTriangle,
        title: `${complaintData.stats.aduan_kritikal} aduan kritikal`,
        description: 'Memerlukan perhatian segera',
        time: 'Terkini',
        type: 'danger',
      });
    }
    if (adminData?.collection_rate != null) {
      activities.push({
        icon: Wallet,
        title: `Kadar kutipan: ${adminData.collection_rate.toFixed(1)}%`,
        description: `RM ${(adminData.total_collected || 0).toLocaleString()} terkumpul`,
        time: 'Keseluruhan',
        type: adminData.collection_rate >= 70 ? 'success' : 'warning',
      });
    }
    setRecentActivity(activities);

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (showToast) {
      if (failed > 0) toast.error('Gagal mengemaskini sebahagian data');
      else toast.success('Data dikemaskini');
    } else if (failed > 0) toast.error('Gagal memuatkan sebahagian data');

    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchAllData();
    
    // Auto refresh every 5 minutes
    const interval = setInterval(() => fetchAllData(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="smart-dashboard-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Dashboard Pintar</h1>
          <p className="text-slate-600">Analitik & prestasi sistem MRSMKU</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchAllData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all"
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
            Muat Semula
          </button>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Jumlah Pelajar"
          value={stats?.total_students || 0}
          subtext={`${stats?.pending_students || 0} menunggu`}
          color="blue"
        />
        <StatCard
          icon={Wallet}
          label="Jumlah Yuran"
          value={`RM ${(stats?.total_fees || 0).toLocaleString()}`}
          color="amber"
        />
        <StatCard
          icon={CheckCircle}
          label="Terkumpul"
          value={`RM ${(stats?.total_collected || 0).toLocaleString()}`}
          change={stats?.collection_rate?.toFixed(1)}
          changeType={stats?.collection_rate >= 70 ? 'positive' : 'negative'}
          color="green"
        />
        <StatCard
          icon={AlertCircle}
          label="Tertunggak"
          value={`RM ${((stats?.total_fees || 0) - (stats?.total_collected || 0)).toLocaleString()}`}
          color="red"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={AlertTriangle}
          label="Aduan Kritikal"
          value={complaintStats?.aduan_kritikal || 0}
          color="red"
        />
        <StatCard
          icon={FileText}
          label="Aduan Belum Selesai"
          value={complaintStats?.aduan_belum_selesai || 0}
          color="amber"
        />
        <StatCard
          icon={ShoppingCart}
          label="Pesanan Koperasi"
          value={salesStats?.total_orders || 0}
          color="cyan"
        />
        <StatCard
          icon={Package}
          label="Jumlah Jualan"
          value={`RM ${(salesStats?.total_sales || 0).toLocaleString()}`}
          color="purple"
        />
      </div>

      {/* Collection Progress by Form */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <BarChart3 className="text-blue-600" size={20} />
              Kutipan Yuran Mengikut Tingkatan
            </h3>
          </div>
          <div className="space-y-4">
            {stats?.form_stats?.map((form) => (
              <ProgressBar
                key={form.form}
                label={`Tingkatan ${form.form}`}
                value={form.collected}
                max={form.total_fees}
                color={form.collection_rate >= 70 ? 'green' : form.collection_rate >= 50 ? 'amber' : 'red'}
              />
            ))}
            {(!stats?.form_stats || stats.form_stats.length === 0) && (
              <p className="text-sm text-slate-500 text-center py-4">Tiada data tingkatan</p>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Activity className="text-violet-600" size={20} />
              Aktiviti & Notifikasi
            </h3>
          </div>
          <div className="space-y-1">
            {recentActivity.length > 0 ? (
              recentActivity.map((activity, idx) => (
                <ActivityItem key={idx} {...activity} />
              ))
            ) : (
              <p className="text-sm text-slate-500 text-center py-4">Tiada aktiviti terkini</p>
            )}
          </div>
        </div>
      </div>

      {/* Complaints by Category */}
      {complaintStats?.aduan_ikut_kategori && Object.keys(complaintStats.aduan_ikut_kategori).length > 0 && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <PieChart className="text-amber-600" size={20} />
              Aduan Mengikut Kategori
            </h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {Object.entries(complaintStats.aduan_ikut_kategori).map(([category, count]) => (
              <div key={category} className="bg-slate-50 rounded-xl p-4 text-center hover:bg-slate-100 transition-colors">
                <p className="text-2xl font-bold text-slate-900">{count}</p>
                <p className="text-xs text-slate-600 mt-1 truncate">{category}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Users by Role */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <Users className="text-teal-600" size={20} />
            Pengguna Mengikut Peranan
          </h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {stats?.role_counts && Object.entries(stats.role_counts).map(([role, count]) => {
            const roleNames = {
              superadmin: 'Super Admin',
              admin: 'Admin',
              bendahari: 'Bendahari',
              sub_bendahari: 'Sub Bendahari',
              guru_kelas: 'Guru Kelas',
              guru_homeroom: 'Guru HomeRoom',
              warden: 'Warden',
              guard: 'Pengawal',
              bus_admin: 'Admin Bas',
              koop_admin: 'Admin Koperasi',
              pum_admin: 'Admin PUM',
              merchandise_admin: 'Admin Merchandise',
              parent: 'Ibu Bapa',
              pelajar: 'Pelajar'
            };
            return (
              <motion.div 
                key={role}
                whileHover={{ scale: 1.02 }}
                className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 text-center border border-slate-200 hover:shadow-md transition-all"
              >
                <p className="text-2xl font-bold text-slate-900">{count}</p>
                <p className="text-xs text-slate-600 mt-1">{roleNames[role] || role}</p>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-gradient-to-br from-teal-500 to-violet-600 rounded-2xl p-6 text-white shadow-pastel">
        <h3 className="font-semibold mb-4">Tindakan Pantas</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <a 
            href="/admin/students"
            className="flex items-center gap-3 p-4 bg-white/10 rounded-xl hover:bg-white/20 transition-all"
          >
            <Users size={24} />
            <span className="text-sm font-medium">Urus Pelajar</span>
          </a>
          <a 
            href="/admin/fees"
            className="flex items-center gap-3 p-4 bg-white/10 rounded-xl hover:bg-white/20 transition-all"
          >
            <Wallet size={24} />
            <span className="text-sm font-medium">Urus Yuran</span>
          </a>
          <a 
            href="/admin/complaints"
            className="flex items-center gap-3 p-4 bg-white/10 rounded-xl hover:bg-white/20 transition-all"
          >
            <AlertTriangle size={24} />
            <span className="text-sm font-medium">Urus Aduan</span>
          </a>
          <a 
            href="/admin/reports"
            className="flex items-center gap-3 p-4 bg-white/10 rounded-xl hover:bg-white/20 transition-all"
          >
            <BarChart3 size={24} />
            <span className="text-sm font-medium">Lihat Laporan</span>
          </a>
        </div>
      </div>
    </div>
  );
};

export default SmartDashboardPage;
