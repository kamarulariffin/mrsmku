import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { 
  Users, Wallet, Check, AlertCircle, Plus, ChevronRight, 
  Bus, ShoppingCart, CreditCard, Bell, Shield, Phone, Mail,
  MessageSquarePlus, Building, AlertTriangle, Calendar
} from 'lucide-react';
import { useAuth } from '../../App';
import api from '../../services/api';
import { Spinner, StatCard, Card } from '../../components/common';
import getUserFriendlyError from '../../utils/errorMessages';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

const ParentDashboard = () => {
  const [stats, setStats] = useState(null);
  const [dutyWardens, setDutyWardens] = useState(null);
  const [olatChildren, setOlatChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const authContext = useAuth();
  const user = authContext?.user;

  useEffect(() => {
    const fetchData = async () => {
      try { 
        const [statsRes, wardensRes, olatRes] = await Promise.all([
          api.get('/api/dashboard/parent'),
          api.get('/api/warden/on-duty'),
          user?.role === 'parent' ? api.get('/api/hostel/olat-status-children').catch(() => ({ data: { children: [] } })) : Promise.resolve({ data: { children: [] } }),
        ]);
        setStats(statsRes.data);
        setDutyWardens(wardensRes.data);
        setOlatChildren(Array.isArray(olatRes.data?.children) ? olatRes.data.children : []);
      }
      catch (err) {
        toast.error(getUserFriendlyError(err, 'Gagal memuatkan dashboard ibu bapa.'));
      }
      finally { 
        setLoading(false); 
      }
    };
    fetchData();
  }, [user?.role]);

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="parent-dashboard">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-800 font-heading">Selamat Datang, {user?.full_name}</h1>
        <p className="text-slate-600 mt-1">Ringkasan akaun anda</p>
      </motion.div>
      {stats && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className={`border ${stats.outstanding > 0 ? 'border-red-200 bg-red-50/60' : 'border-emerald-200 bg-emerald-50/60'}`}>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <p className="text-sm text-slate-600">Status yuran semasa</p>
                <h2 className={`text-xl font-bold ${stats.outstanding > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                  {stats.outstanding > 0 ? `Baki RM ${Number(stats.outstanding || 0).toFixed(2)}` : 'Tiada tunggakan yuran'}
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  {stats.outstanding > 0
                    ? `${stats.pending_fees_count || 0} rekod yuran tertunggak. Tekan "Bayar Sekarang" untuk teruskan.`
                    : 'Semua bayaran semasa sudah selesai. Anda masih boleh semak rekod yuran anak.'}
                </p>
              </div>
              <div className="flex gap-2">
                <Link
                  to={stats.outstanding > 0 ? '/payment-center?bulk=all-yuran' : '/fees'}
                  className={`min-h-[44px] min-w-[44px] inline-flex items-center justify-center px-4 rounded-lg font-medium text-sm transition-colors ${
                    stats.outstanding > 0
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  {stats.outstanding > 0 ? 'Bayar Sekarang' : 'Lihat Yuran'}
                </Link>
              </div>
            </div>
          </Card>
        </motion.div>
      )}
      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div variants={item}><StatCard icon={Users} label="Anak Didaftarkan" value={stats?.total_children || 0} subtext={`${stats?.approved_children || 0} disahkan`} color="primary" /></motion.div>
        <motion.div variants={item}><StatCard icon={Wallet} label="Jumlah Yuran" value={`RM ${(stats?.total_fees || 0).toFixed(2)}`} color="secondary" /></motion.div>
        <motion.div variants={item}><StatCard icon={Check} label="Sudah Dibayar" value={`RM ${(stats?.total_paid || 0).toFixed(2)}`} color="success" /></motion.div>
        <motion.div variants={item}><StatCard icon={AlertCircle} label="Baki Tertunggak" value={`RM ${(stats?.outstanding || 0).toFixed(2)}`} color={stats?.outstanding > 0 ? 'danger' : 'success'} /></motion.div>
      </motion.div>
      <motion.div variants={container} initial="hidden" animate="show" className="grid md:grid-cols-3 gap-4">
        <motion.div variants={item}>
          <Card hover>
            <Link to="/children" className="block min-h-[44px] flex items-center" data-testid="add-child-link">
              <div className="flex items-center gap-4 w-full py-1">
                <div className="p-3 bg-pastel-mint/60 rounded-xl transition-transform duration-300 hover:scale-105"><Plus className="text-teal-700" size={24} /></div>
                <div><h3 className="font-semibold text-slate-800 font-heading">Tambah Anak</h3><p className="text-sm text-slate-600">Daftarkan anak anda di MRSMKU</p></div>
                <ChevronRight className="ml-auto text-slate-400" />
              </div>
            </Link>
          </Card>
        </motion.div>
        <motion.div variants={item}>
          <Card hover>
            <Link to="/bus-tickets" className="block min-h-[44px] flex items-center" data-testid="bus-ticket-link">
              <div className="flex items-center gap-4 w-full py-1">
                <div className="p-3 bg-pastel-sky/60 rounded-xl transition-transform duration-300 hover:scale-105"><Bus className="text-sky-700" size={24} /></div>
                <div><h3 className="font-semibold text-slate-800 font-heading">Tiket Bas</h3><p className="text-sm text-slate-600">Tempah tiket pulang bermalam</p></div>
                <ChevronRight className="ml-auto text-slate-400" />
              </div>
            </Link>
          </Card>
        </motion.div>
        <motion.div variants={item}>
          <Card hover>
            <Link to="/jadual-guru-asrama" className="block min-h-[44px] flex items-center" data-testid="jadual-guru-asrama-link">
              <div className="flex items-center gap-4 w-full py-1">
                <div className="p-3 bg-pastel-lavender/60 rounded-xl transition-transform duration-300 hover:scale-105"><Calendar className="text-violet-700" size={24} /></div>
                <div><h3 className="font-semibold text-slate-800 font-heading">Jadual Guru Asrama</h3><p className="text-sm text-slate-600">Lihat kalendar warden bertugas</p></div>
                <ChevronRight className="ml-auto text-slate-400" />
              </div>
            </Link>
          </Card>
        </motion.div>
        <motion.div variants={item}>
          <Card hover>
            <Link to="/koperasi" className="block min-h-[44px] flex items-center" data-testid="koperasi-link">
              <div className="flex items-center gap-4 w-full py-1">
                <div className="p-3 bg-pastel-sage/60 rounded-xl transition-transform duration-300 hover:scale-105"><ShoppingCart className="text-emerald-700" size={24} /></div>
                <div><h3 className="font-semibold text-slate-800 font-heading">Koperasi</h3><p className="text-sm text-slate-600">Beli kelengkapan maktab</p></div>
                <ChevronRight className="ml-auto text-slate-400" />
              </div>
            </Link>
          </Card>
        </motion.div>
        <motion.div variants={item}>
          <Card hover>
            <Link to="/fees" className="block min-h-[44px] flex items-center" data-testid="pay-fees-link">
              <div className="flex items-center gap-4 w-full py-1">
                <div className="p-3 bg-pastel-cream/70 rounded-xl transition-transform duration-300 hover:scale-105"><CreditCard className="text-amber-700" size={24} /></div>
                <div><h3 className="font-semibold text-slate-800 font-heading">Bayar Yuran</h3><p className="text-sm text-slate-600">{stats?.pending_fees_count || 0} yuran tertunggak</p></div>
                <ChevronRight className="ml-auto text-slate-400" />
              </div>
            </Link>
          </Card>
        </motion.div>
      </motion.div>
      {stats?.unread_notifications > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="border-pastel-cream/80 bg-gradient-to-r from-pastel-cream/40 to-amber-50/50">
            <div className="flex items-center gap-3">
              <Bell className="text-amber-600" size={20} />
              <span className="text-amber-800">Anda mempunyai <strong>{stats.unread_notifications}</strong> notifikasi belum dibaca</span>
              <Link to="/notifications" className="ml-auto min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-amber-700 font-medium hover:underline">Lihat</Link>
            </div>
          </Card>
        </motion.div>
      )}

      {olatChildren.filter((c) => c.blocked).length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="space-y-3">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 font-heading">
            <AlertTriangle className="text-amber-600" size={22} />
            Status OLAT (Tahanan Outing)
          </h2>
          {olatChildren.filter((c) => c.blocked).map((child) => (
            <Card key={child.student_id} className="border-pastel-cream/80 bg-gradient-to-r from-pastel-cream/30 to-amber-50/50">
              <div className="flex items-start gap-3">
                <AlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
                <div className="flex-1">
                  <h3 className="font-semibold text-amber-800">
                    {child.student_name} {child.matric_number && `(No. Maktab: ${child.matric_number})`}
                  </h3>
                  <p className="text-sm text-amber-700 mt-1">{child.reason}</p>
                  {child.detention_end_date && (
                    <p className="text-sm font-medium text-amber-800 mt-2">
                      Butang permohonan outing akan tersedia untuk pelajar selepas: <strong>{new Date(child.detention_end_date).toLocaleDateString('ms-MY', { day: '2-digit', month: '2-digit', year: 'numeric' })}</strong>.
                    </p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </motion.div>
      )}

      {dutyWardens && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <div className="flex items-center gap-2 mb-4">
            <Shield className="text-violet-600" size={22} />
            <h2 className="text-lg font-bold text-slate-800 font-heading">Warden Bertugas Hari Ini</h2>
            <span className="ml-2 px-2.5 py-0.5 bg-pastel-lavender/60 text-violet-700 text-xs font-medium rounded-full">
              {dutyWardens.day}, {dutyWardens.date}
            </span>
          </div>
          {dutyWardens.wardens && dutyWardens.wardens.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dutyWardens.wardens.map((warden, idx) => (
                <Card key={idx} className="border-pastel-lavender/30 bg-gradient-to-br from-pastel-lavender/20 to-pastel-sky/10" data-testid={`duty-warden-card-${idx}`}>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-teal-400 to-violet-400 rounded-xl flex items-center justify-center shadow-pastel-sm">
                      <Shield className="text-white" size={24} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-slate-900 truncate">{warden.warden_name}</h3>
                      <p className="text-xs text-teal-600 font-medium">{warden.jawatan_display}</p>
                      {warden.blok_assigned && warden.blok_assigned.length > 0 && (
                        <div className="flex items-center gap-1 mt-1 text-sm text-slate-600">
                          <Building size={14} />
                          <span>Blok: {warden.blok_assigned.join(', ')}</span>
                        </div>
                      )}
                      {warden.warden_phone && (
                        <a href={`tel:${warden.warden_phone}`} className="flex items-center gap-1 mt-1 min-h-[44px] text-sm text-violet-600 hover:text-violet-800 transition-colors">
                          <Phone size={14} />
                          <span>{warden.warden_phone}</span>
                        </a>
                      )}
                      {warden.warden_email && (
                        <a href={`mailto:${warden.warden_email}`} className="flex items-center gap-1 mt-1 min-h-[44px] text-sm text-violet-600 hover:text-violet-800 truncate transition-colors">
                          <Mail size={14} />
                          <span className="truncate">{warden.warden_email}</span>
                        </a>
                      )}
                      <p className="text-xs text-slate-500 mt-2">Waktu: {warden.waktu_mula} - {warden.waktu_tamat}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-slate-100 bg-slate-50/80 text-center py-6">
              <p className="text-slate-500">Tiada warden bertugas pada hari ini</p>
            </Card>
          )}
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <Card hover className="border-pastel-peach/40 bg-gradient-to-r from-pastel-peach/20 to-pastel-rose/10">
          <Link to="/complaints" className="block min-h-[44px] flex items-center" data-testid="create-complaint-link">
            <div className="flex items-center gap-4 w-full py-1">
              <div className="p-3 bg-gradient-to-br from-orange-400 to-rose-400 rounded-xl shadow-pastel-sm transition-transform duration-300 hover:scale-105">
                <MessageSquarePlus className="text-white" size={24} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 font-heading">Hantar Aduan Digital</h3>
                <p className="text-sm text-slate-600">Laporkan isu berkaitan anak anda kepada warden bertugas</p>
              </div>
              <ChevronRight className="ml-auto text-slate-400" />
            </div>
          </Link>
        </Card>
      </motion.div>
    </div>
  );
};

export default ParentDashboard;
