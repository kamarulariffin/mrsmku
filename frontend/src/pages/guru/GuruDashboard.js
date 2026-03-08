import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { 
  Users, Wallet, TrendingUp, AlertCircle, BookOpen, Settings, 
  Edit, X, Check, RefreshCw, BarChart3, ChevronRight 
} from 'lucide-react';
import api from '../../services/api';

// Components
const Spinner = ({ size = 'md' }) => (
  <div className={`animate-spin rounded-full border-2 border-primary-200 border-t-primary-600 ${size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'}`}></div>
);

const Card = ({ children, className = '', ...props }) => (
  <div className={`bg-white rounded-xl border border-slate-100 p-6 relative overflow-hidden shadow-sm ${className}`} {...props}>{children}</div>
);

const StatCard = ({ icon: Icon, label, value, subtext, color = 'primary' }) => {
  const colors = { 
    primary: 'bg-primary-100 text-primary-700', 
    secondary: 'bg-amber-100 text-amber-700', 
    success: 'bg-emerald-100 text-emerald-700', 
    warning: 'bg-orange-100 text-orange-700', 
    danger: 'bg-red-100 text-red-700' 
  };
  return (
    <Card className="animate-fadeIn hover:shadow-md transition-shadow">
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

const GuruDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [systemConfig, setSystemConfig] = useState({ tingkatan: [1,2,3,4,5], kelas: ['A','B','C','D','E','F'] });
  const [selectedTingkatan, setSelectedTingkatan] = useState(null);
  const [selectedKelas, setSelectedKelas] = useState('');
  const [updating, setUpdating] = useState(false);
  
  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try { 
      const res = await api.get('/api/dashboard/guru'); 
      setStats(res.data);
      setSelectedTingkatan(res.data.tingkatan);
      setSelectedKelas(res.data.class_name || '');
    } catch { 
      toast.error('Gagal memuatkan data dashboard'); 
    } finally { 
      setLoading(false); 
    }
  }, []);

  const fetchSystemConfig = useCallback(async () => {
    try {
      const res = await api.get('/api/settings/system-config');
      if (res.data) {
        setSystemConfig({
          tingkatan: res.data.tingkatan || [1,2,3,4,5],
          kelas: res.data.kelas || ['A','B','C','D','E','F']
        });
      }
    } catch (err) {
      console.error('Failed to fetch system config');
    }
  }, []);
  
  useEffect(() => { 
    fetchDashboard();
    fetchSystemConfig();
  }, [fetchDashboard, fetchSystemConfig]);

  const handleUpdateAssignment = async () => {
    if (!selectedTingkatan || !selectedKelas) {
      toast.error('Sila pilih Tingkatan dan Kelas');
      return;
    }
    
    setUpdating(true);
    try {
      await api.put(`/api/guru/profile/class-assignment?tingkatan=${selectedTingkatan}&kelas=${selectedKelas}`);
      toast.success(`Berjaya kemas kini kepada Tingkatan ${selectedTingkatan} Kelas ${selectedKelas}`);
      setShowAssignmentModal(false);
      fetchDashboard();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Gagal kemas kini tugasan';
      toast.error(msg);
    } finally {
      setUpdating(false);
    }
  };

  const hasAssignment = stats?.tingkatan && stats?.class_name;
  
  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Spinner size="lg" />
    </div>
  );
  
  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="guru-dashboard">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 font-heading">Dashboard Guru Kelas</h1>
          {hasAssignment ? (
            <p className="text-slate-600 mt-1">
              Kelas: <span className="font-semibold text-primary-700">{stats.full_class || `Tingkatan ${stats.tingkatan} Kelas ${stats.class_name}`}</span>
            </p>
          ) : (
            <p className="text-amber-600 mt-1 flex items-center gap-1">
              <AlertCircle size={16} />
              Tiada kelas ditugaskan
            </p>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAssignmentModal(true)}
            className="flex items-center gap-2 min-h-[44px] px-4 py-2 bg-primary-100 hover:bg-primary-200 text-primary-700 rounded-lg text-sm font-medium transition-colors"
            data-testid="edit-assignment-btn"
          >
            <Edit size={18} />
            Kemas Kini Kelas
          </button>
          <button
            onClick={fetchDashboard}
            className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            title="Muat Semula"
          >
            <RefreshCw size={20} className="text-slate-600" />
          </button>
        </div>
      </div>

      {/* No Assignment Notice */}
      {!hasAssignment && (
        <Card className="bg-amber-50 border-amber-200">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-amber-100 rounded-lg">
              <Settings className="text-amber-600" size={24} />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-amber-800">Tetapan Kelas Diperlukan</h3>
              <p className="text-amber-700 text-sm mt-1">
                Anda belum ditugaskan ke mana-mana kelas. Sila klik butang "Kemas Kini Kelas" untuk memilih Tingkatan dan Kelas anda.
              </p>
              <button
                onClick={() => setShowAssignmentModal(true)}
                className="mt-3 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Pilih Kelas Sekarang
              </button>
            </div>
          </div>
        </Card>
      )}
      
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          icon={Users} 
          label="Pelajar Kelas" 
          value={stats?.total_students || 0} 
          subtext={hasAssignment ? `${stats.full_class}` : 'Tiada kelas'}
          color="primary" 
        />
        <StatCard 
          icon={Wallet} 
          label="Jumlah Yuran" 
          value={`RM ${(stats?.total_fees || 0).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`} 
          color="secondary" 
        />
        <StatCard 
          icon={TrendingUp} 
          label="Kadar Kutipan" 
          value={`${(stats?.collection_rate || 0).toFixed(1)}%`}
          subtext={`RM ${(stats?.total_collected || 0).toLocaleString('ms-MY', { minimumFractionDigits: 2 })} terkutip`}
          color="success" 
        />
        <StatCard 
          icon={AlertCircle} 
          label="Tunggakan" 
          value={`RM ${(stats?.outstanding || 0).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`} 
          color="danger" 
        />
      </div>

      {/* Quick Actions */}
      {hasAssignment && (
        <Card>
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <BookOpen size={20} />
            Tindakan Pantas
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Link 
              to="/guru/class-dashboard"
              className="flex items-center justify-between p-4 bg-slate-50 hover:bg-primary-50 rounded-xl transition-colors group"
              data-testid="link-class-dashboard"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary-100 rounded-lg">
                  <BarChart3 className="text-primary-600" size={20} />
                </div>
                <div>
                  <p className="font-medium text-slate-800">Dashboard Kelas</p>
                  <p className="text-xs text-slate-500">Lihat status yuran terperinci</p>
                </div>
              </div>
              <ChevronRight className="text-slate-400 group-hover:text-primary-600 transition-colors" size={20} />
            </Link>

            <Link 
              to="/guru/students"
              className="flex items-center justify-between p-4 bg-slate-50 hover:bg-emerald-50 rounded-xl transition-colors group"
              data-testid="link-students"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <Users className="text-emerald-600" size={20} />
                </div>
                <div>
                  <p className="font-medium text-slate-800">Senarai Pelajar</p>
                  <p className="text-xs text-slate-500">{stats?.total_students || 0} pelajar dalam kelas</p>
                </div>
              </div>
              <ChevronRight className="text-slate-400 group-hover:text-emerald-600 transition-colors" size={20} />
            </Link>

            <Link 
              to="/guru/fees"
              className="flex items-center justify-between p-4 bg-slate-50 hover:bg-amber-50 rounded-xl transition-colors group"
              data-testid="link-fees"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Wallet className="text-amber-600" size={20} />
                </div>
                <div>
                  <p className="font-medium text-slate-800">Status Yuran</p>
                  <p className="text-xs text-slate-500">Pantau pembayaran yuran</p>
                </div>
              </div>
              <ChevronRight className="text-slate-400 group-hover:text-amber-600 transition-colors" size={20} />
            </Link>
          </div>
        </Card>
      )}

      {/* Class Assignment Modal */}
      {showAssignmentModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen" onClick={() => !updating && setShowAssignmentModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg flex flex-col shadow-xl overflow-visible" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Settings className="text-primary-600" size={22} />
                Kemas Kini Tugasan Kelas
              </h3>
              <button 
                onClick={() => !updating && setShowAssignmentModal(false)} 
                className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-slate-100 rounded-lg disabled:opacity-50"
                disabled={updating}
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4 space-y-3 overflow-y-auto flex-1 min-h-0">
              {/* Tingkatan Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Tingkatan <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {systemConfig.tingkatan.map(t => (
                    <button
                      key={t}
                      onClick={() => setSelectedTingkatan(t)}
                      className={`py-2 rounded-lg text-center font-semibold transition-all border-2 ${
                        selectedTingkatan === t
                          ? 'bg-teal-600 text-white border-teal-600 shadow-pastel'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-teal-300 hover:bg-pastel-mint/50'
                      }`}
                      data-testid={`tingkatan-${t}`}
                    >
                      T{t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Kelas Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Kelas <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {systemConfig.kelas.map(k => (
                    <button
                      key={k}
                      onClick={() => setSelectedKelas(k)}
                      className={`py-2 rounded-lg text-center font-semibold transition-all border-2 ${
                        selectedKelas === k
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50'
                      }`}
                      data-testid={`kelas-${k}`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview - current and new */}
              <div className="grid grid-cols-2 gap-3">
                {hasAssignment && (
                  <div className="bg-slate-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-slate-500">Semasa</p>
                    <p className="font-semibold text-slate-700">{stats.full_class}</p>
                  </div>
                )}
                {selectedTingkatan && selectedKelas && (
                  <div className={`bg-primary-50 rounded-lg p-3 text-center ${!hasAssignment ? 'col-span-2' : ''}`}>
                    <p className="text-xs text-primary-600">Tugasan Baharu</p>
                    <p className="font-bold text-primary-800">T{selectedTingkatan} {selectedKelas}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="p-3 border-t border-slate-100 flex gap-3 flex-shrink-0 bg-slate-50 rounded-b-2xl">
              <button
                onClick={() => setShowAssignmentModal(false)}
                disabled={updating}
                className="flex-1 px-4 py-2.5 text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors disabled:opacity-50 text-center font-medium"
              >
                Batal
              </button>
              <button
                onClick={handleUpdateAssignment}
                disabled={updating || !selectedTingkatan || !selectedKelas}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-emerald-500 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="save-assignment-btn"
              >
                {updating ? (
                  <>
                    <Spinner size="sm" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <Check size={18} />
                    <span>Simpan</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export { GuruDashboard };
export default GuruDashboard;
