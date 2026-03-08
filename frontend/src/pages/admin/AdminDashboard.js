import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { 
  Users, Wallet, TrendingUp, Clock, GraduationCap, 
  AlertTriangle, CheckCircle2, BookOpen, CreditCard,
  ArrowUpRight, ArrowDownRight, BarChart3, Receipt, FileText, PieChart, Calculator, ChevronRight
} from 'lucide-react';
import { useAuth } from '../../App';
import api from '../../services/api';
import { ROLES } from '../../constants';
import { Spinner, Card, Button } from '../../components/common';

// Animated stat card with gradient
const GlassStatCard = ({ icon: Icon, label, value, subtext, trend, color = "blue", delay = 0 }) => {
  const gradients = {
    blue: "from-blue-500 to-cyan-500",
    purple: "from-violet-500 to-fuchsia-400",
    emerald: "from-emerald-500 to-teal-500",
    amber: "from-amber-500 to-orange-500",
    rose: "from-rose-500 to-pink-500",
    indigo: "from-teal-500 to-violet-500"
  };

  const bgGradients = {
    blue: "from-blue-50 to-cyan-50",
    purple: "from-pastel-lavender to-pastel-rose",
    emerald: "from-emerald-50 to-teal-50",
    amber: "from-amber-50 to-orange-50",
    rose: "from-rose-50 to-pink-50",
    indigo: "from-pastel-mint to-pastel-lavender"
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay * 0.1, duration: 0.5 }}
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${bgGradients[color]} p-5 border border-white/50 shadow-lg hover:shadow-xl transition-all duration-300`}
    >
      <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-gradient-to-br opacity-20 blur-2xl" style={{background: `linear-gradient(to bottom right, var(--tw-gradient-stops))`}} />
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-600">{label}</p>
          <p className="text-2xl md:text-3xl font-bold text-slate-900">{value}</p>
          {subtext && (
            <p className="text-xs text-slate-500 flex items-center gap-1">
              {trend === 'up' && <ArrowUpRight size={14} className="text-emerald-500" />}
              {trend === 'down' && <ArrowDownRight size={14} className="text-rose-500" />}
              {subtext}
            </p>
          )}
        </div>
        <div className={`p-3 rounded-xl bg-gradient-to-br ${gradients[color]} shadow-lg`}>
          <Icon className="text-white" size={24} />
        </div>
      </div>
    </motion.div>
  );
};

// Form stat card with progress
const FormStatCard = ({ form, students, totalFees, collected, outstanding, rate, assignedCount, delay }) => {
  const colors = {
    1: { bg: "bg-blue-500", light: "bg-blue-100", text: "text-blue-700" },
    2: { bg: "bg-violet-500", light: "bg-pastel-lavender", text: "text-violet-700" },
    3: { bg: "bg-amber-500", light: "bg-amber-100", text: "text-amber-700" },
    4: { bg: "bg-emerald-500", light: "bg-emerald-100", text: "text-emerald-700" },
    5: { bg: "bg-rose-500", light: "bg-rose-100", text: "text-rose-700" }
  };

  const color = colors[form] || colors[1];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: delay * 0.1 }}
      className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-lg transition-all duration-300"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-10 h-10 rounded-lg ${color.bg} flex items-center justify-center`}>
            <span className="text-white font-bold">{form}</span>
          </div>
          <div>
            <h4 className="font-semibold text-slate-900">Tingkatan {form}</h4>
            <p className="text-xs text-slate-500">{students} pelajar</p>
          </div>
        </div>
        <div className={`px-2 py-1 rounded-full text-xs font-medium ${rate >= 70 ? 'bg-emerald-100 text-emerald-700' : rate >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
          {rate.toFixed(0)}%
        </div>
      </div>
      
      {/* Progress bar */}
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-3">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(rate, 100)}%` }}
          transition={{ delay: delay * 0.1 + 0.3, duration: 0.8 }}
          className={`h-full ${color.bg} rounded-full`}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-slate-500">Dijangka</p>
          <p className="text-sm font-semibold text-slate-900">RM {totalFees.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Dikutip</p>
          <p className="text-sm font-semibold text-emerald-600">RM {collected.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Tunggakan</p>
          <p className="text-sm font-semibold text-rose-600">RM {outstanding.toLocaleString()}</p>
        </div>
      </div>
    </motion.div>
  );
};

// Recent payment card
const RecentPaymentCard = ({ payment, index }) => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: index * 0.1 }}
    className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0"
  >
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
        <Receipt className="text-emerald-600" size={18} />
      </div>
      <div>
        <p className="font-medium text-slate-900 text-sm">{payment.student_name}</p>
        <p className="text-xs text-slate-500">{payment.receipt_number}</p>
      </div>
    </div>
    <div className="text-right">
      <p className="font-semibold text-emerald-600 text-sm">+RM {payment.amount.toFixed(2)}</p>
      <p className="text-xs text-slate-500">{payment.payment_method}</p>
    </div>
  </motion.div>
);

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const authContext = useAuth();
  const user = authContext?.user;

  useEffect(() => {
    let cancelled = false;
    const timeoutMs = 20000;
    const fetchStats = async () => {
      try {
        const res = await Promise.race([
          api.get('/api/dashboard/admin'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
        ]);
        if (!cancelled) setStats(res.data);
      } catch (err) {
        if (!cancelled) {
          toast.error(err?.message === 'timeout' ? 'Masa menunggu tamat' : 'Gagal memuatkan data');
          setStats(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchStats();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-slate-500">Memuatkan dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="admin-dashboard">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-500 via-violet-500 to-fuchsia-500 p-6 text-white shadow-pastel"
      >
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2240%22%20height%3D%2240%22%20viewBox%3D%220%200%2040%2040%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22%23fff%22%20fill-opacity%3D%220.05%22%3E%3Cpath%20d%3D%22M20%200L40%2020L20%2040L0%2020z%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E')] opacity-50"></div>
        <div className="relative z-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold font-heading">
                Dashboard {ROLES[user?.role]?.name || 'Admin'}
              </h1>
              <p className="text-white/80 mt-1">Ringkasan sistem pengurusan yuran MRSMKU {stats?.year}</p>
            </div>
            <div className="flex gap-2">
              <Link to="/admin/yuran/set-yuran">
                <Button size="sm" className="bg-white/20 hover:bg-white/30 text-white border-white/30">
                  <BookOpen size={16} className="mr-1" /> Set Yuran
                </Button>
              </Link>
              <Link to="/admin/yuran/pelajar">
                <Button size="sm" className="bg-white/20 hover:bg-white/30 text-white border-white/30">
                  <Users size={16} className="mr-1" /> Senarai Pelajar
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Navigasi pintasan untuk Bendahari & Sub Bendahari */}
      {user && ['bendahari', 'sub_bendahari'].includes(user.role) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white rounded-xl border border-slate-200 p-4"
        >
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <ChevronRight size={18} className="text-teal-600" />
            Pintasan
          </h3>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/admin/reports"
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-700 hover:bg-teal-100 transition-colors"
            >
              <BarChart3 size={18} />
              <span className="font-medium">Laporan</span>
              <span className="text-xs text-teal-600">(Yuran, Kutipan, Bulanan, Tahunan Pelajar)</span>
            </Link>
            {user.role === 'bendahari' && (
              <Link
                to="/admin/financial-dashboard"
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-violet-50 border border-violet-200 text-violet-700 hover:bg-violet-100 transition-colors"
              >
                <PieChart size={18} />
                <span className="font-medium">Dashboard Kewangan</span>
              </Link>
            )}
            <Link
              to="/admin/accounting-full"
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 transition-colors"
            >
              <Calculator size={18} />
              <span className="font-medium">Sistem Perakaunan</span>
            </Link>
            <Link
              to="/admin/agm-reports"
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors"
            >
              <FileText size={18} />
              <span className="font-medium">Laporan Khas AGM</span>
            </Link>
            <Link
              to="/admin/yuran/set-yuran"
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 transition-colors"
            >
              <CreditCard size={18} />
              <span className="font-medium">Pakej Yuran</span>
            </Link>
            <Link
              to="/admin/yuran/pelajar"
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 transition-colors"
            >
              <Wallet size={18} />
              <span className="font-medium">Semua Yuran</span>
            </Link>
          </div>
        </motion.div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <GlassStatCard 
          icon={Users} 
          label="Jumlah Pelajar" 
          value={stats?.total_students || 0} 
          subtext={`${stats?.pending_students || 0} menunggu kelulusan`}
          color="blue"
          delay={0}
        />
        <GlassStatCard 
          icon={Wallet} 
          label="Jumlah Yuran" 
          value={`RM ${(stats?.total_fees || 0).toLocaleString()}`} 
          subtext={`${stats?.set_yuran_count || 0} set yuran aktif`}
          color="purple"
          delay={1}
        />
        <GlassStatCard 
          icon={TrendingUp} 
          label="Dikutip" 
          value={`RM ${(stats?.total_collected || 0).toLocaleString()}`} 
          subtext={`${(stats?.collection_rate || 0).toFixed(1)}% kadar kutipan`}
          trend={stats?.collection_rate >= 50 ? 'up' : 'down'}
          color="emerald"
          delay={2}
        />
        <GlassStatCard 
          icon={AlertTriangle} 
          label="Tunggakan" 
          value={`RM ${(stats?.total_outstanding || 0).toLocaleString()}`} 
          subtext={`${stats?.students_with_outstanding || 0} pelajar tertunggak`}
          color="rose"
          delay={3}
        />
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-xl border border-slate-200 p-4 text-center"
        >
          <div className="w-12 h-12 rounded-full bg-emerald-100 mx-auto flex items-center justify-center mb-2">
            <CheckCircle2 className="text-emerald-600" size={24} />
          </div>
          <p className="text-2xl font-bold text-emerald-600">{stats?.students_fully_paid || 0}</p>
          <p className="text-xs text-slate-500">Selesai Bayar</p>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white rounded-xl border border-slate-200 p-4 text-center"
        >
          <div className="w-12 h-12 rounded-full bg-amber-100 mx-auto flex items-center justify-center mb-2">
            <Clock className="text-amber-600" size={24} />
          </div>
          <p className="text-2xl font-bold text-amber-600">{stats?.students_with_outstanding || 0}</p>
          <p className="text-xs text-slate-500">Ada Tunggakan</p>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-white rounded-xl border border-slate-200 p-4 text-center"
        >
          <div className="w-12 h-12 rounded-full bg-pastel-lavender mx-auto flex items-center justify-center mb-2">
            <GraduationCap className="text-violet-600" size={24} />
          </div>
          <p className="text-2xl font-bold text-violet-600">{stats?.approved_students || 0}</p>
          <p className="text-xs text-slate-500">Pelajar Aktif</p>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="bg-white rounded-xl border border-slate-200 p-4 text-center"
        >
          <div className="w-12 h-12 rounded-full bg-blue-100 mx-auto flex items-center justify-center mb-2">
            <Users className="text-blue-600" size={24} />
          </div>
          <p className="text-2xl font-bold text-blue-600">{stats?.role_counts?.parent || 0}</p>
          <p className="text-xs text-slate-500">Ibu Bapa</p>
        </motion.div>
      </div>

      {/* Pending alert */}
      {stats?.pending_students > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.8 }}
        >
          <Card className="border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-amber-100">
                  <Clock className="text-amber-600" size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-amber-900">Menunggu Pengesahan</h3>
                  <p className="text-sm text-amber-700">{stats.pending_students} pelajar menunggu pengesahan pendaftaran</p>
                </div>
              </div>
              <Link to="/admin/students">
                <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white" data-testid="view-pending-btn">
                  Lihat Semua
                </Button>
              </Link>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Stats by Form and Recent Payments */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Form Stats */}
        <div className="lg:col-span-2">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <BarChart3 size={20} className="text-teal-600" />
                Statistik Mengikut Tingkatan
              </h3>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {stats?.form_stats?.map((form, index) => (
                <FormStatCard 
                  key={form.form}
                  form={form.form}
                  students={form.students}
                  totalFees={form.total_fees}
                  collected={form.collected}
                  outstanding={form.outstanding || (form.total_fees - form.collected)}
                  rate={form.collection_rate}
                  assignedCount={form.assigned_count}
                  delay={index}
                />
              ))}
            </div>
          </motion.div>
        </div>

        {/* Recent Payments */}
        <div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.0 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <CreditCard size={20} className="text-emerald-600" />
                Bayaran Terkini
              </h3>
            </div>
            <Card className="p-4">
              {stats?.recent_payments?.length > 0 ? (
                <div>
                  {stats.recent_payments.map((payment, index) => (
                    <RecentPaymentCard key={index} payment={payment} index={index} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <Receipt className="mx-auto mb-2 opacity-50" size={32} />
                  <p className="text-sm">Tiada bayaran terkini</p>
                </div>
              )}
            </Card>
          </motion.div>
        </div>
      </div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.1 }}
      >
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Tindakan Pantas</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link to="/admin/yuran/set-yuran" className="block">
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center hover:shadow-lg hover:border-teal-300 transition-all duration-300 group">
              <div className="w-12 h-12 rounded-full bg-pastel-mint mx-auto flex items-center justify-center mb-2 group-hover:bg-pastel-mint/80 transition-colors">
                <BookOpen className="text-teal-600" size={24} />
              </div>
              <p className="font-medium text-slate-900 text-sm">Urus Set Yuran</p>
            </div>
          </Link>
          
          <Link to="/admin/yuran/pelajar" className="block">
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center hover:shadow-lg hover:border-violet-300 transition-all duration-300 group">
              <div className="w-12 h-12 rounded-full bg-pastel-lavender mx-auto flex items-center justify-center mb-2 group-hover:bg-pastel-lavender/80 transition-colors">
                <Users className="text-violet-600" size={24} />
              </div>
              <p className="font-medium text-slate-900 text-sm">Senarai Yuran Pelajar</p>
            </div>
          </Link>
          
          <Link to="/admin/students" className="block">
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center hover:shadow-lg hover:border-emerald-300 transition-all duration-300 group">
              <div className="w-12 h-12 rounded-full bg-emerald-100 mx-auto flex items-center justify-center mb-2 group-hover:bg-emerald-200 transition-colors">
                <GraduationCap className="text-emerald-600" size={24} />
              </div>
              <p className="font-medium text-slate-900 text-sm">Pengurusan Pelajar</p>
            </div>
          </Link>
          
          <Link to="/admin/accounting-full" className="block">
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center hover:shadow-lg hover:border-amber-300 transition-all duration-300 group">
              <div className="w-12 h-12 rounded-full bg-amber-100 mx-auto flex items-center justify-center mb-2 group-hover:bg-amber-200 transition-colors">
                <Wallet className="text-amber-600" size={24} />
              </div>
              <p className="font-medium text-slate-900 text-sm">Sistem Perakaunan</p>
            </div>
          </Link>
        </div>
      </motion.div>
    </div>
  );
};

export default AdminDashboard;
