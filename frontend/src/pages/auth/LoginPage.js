import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  GraduationCap,
  Mail,
  CreditCard,
  Eye,
  EyeOff,
  AlertCircle,
  LogIn,
  Sparkles,
  ChevronDown,
  ChevronUp,
  User,
  Lock,
  Home,
} from 'lucide-react';
import { useAuth } from '../../App';
import api, { API_URL } from '../../services/api';
import { usePortalConfig } from '../../context/PortalConfigContext';
import MyDigitalIDModal from '../../components/common/MyDigitalIDModal';

const REAL_ACCOUNTS = {
  staff: [
    { role: 'Super Admin', email: 'superadmin@muafakat.link', password: 'super123', color: 'from-red-500 to-pink-500' },
    { role: 'Admin', email: 'admin@muafakat.link', password: 'admin123', color: 'from-blue-500 to-indigo-500' },
    { role: 'Admin Bas', email: 'busadmin@muafakat.link', password: 'busadmin123', color: 'from-cyan-500 to-teal-500' },
    { role: 'Bendahari', email: 'bendahari@muafakat.link', password: 'bendahari123', color: 'from-green-500 to-emerald-500' },
    { role: 'Sub Bendahari', email: 'sub_bendahari@muafakat.link', password: 'subbendahari123', color: 'from-teal-500 to-cyan-500' },
    { role: 'Juruaudit', email: 'juruaudit@muafakat.link', password: 'juruaudit123', color: 'from-purple-500 to-violet-500' },
    { role: 'Guru Kelas', email: 'guru@muafakat.link', password: 'guru123', color: 'from-amber-500 to-orange-500' },
    { role: 'Warden', email: 'warden@muafakat.link', password: 'warden123', color: 'from-indigo-500 to-blue-500' },
    { role: 'Pengawal', email: 'guard@muafakat.link', password: 'guard123', color: 'from-slate-500 to-gray-500' },
  ],
  /** Role base: Driver Bas – pemandu bas (assign bas di modul bas) */
  driver_bas: [
    { role: 'Driver Bas (Ahmad Fadzli)', email: 'driver1@muafakat.link', password: 'driver123', color: 'from-amber-500 to-orange-500' },
    { role: 'Driver Bas (Mohd Hafiz)', email: 'driver2@muafakat.link', password: 'driver123', color: 'from-amber-500 to-orange-500' },
    { role: 'Driver Bas (Zulkifli)', email: 'driver3@muafakat.link', password: 'driver123', color: 'from-amber-500 to-orange-500' },
    { role: 'Driver Bas (Wong Chee Meng)', email: 'driver4@muafakat.link', password: 'driver123', color: 'from-amber-500 to-orange-500' },
    { role: 'Driver Bas (Demo)', email: 'driver@muafakat.link', password: 'driver123', color: 'from-amber-600 to-orange-600' },
  ],
  parent: [
    { role: 'Ibu Bapa (Encik Kamal)', email: 'parent@muafakat.link', password: 'parent123', color: 'from-emerald-500 to-green-500' },
    { role: 'Ibu Bapa (Puan Siti Rahmah)', email: 'parent2@muafakat.link', password: 'parent123', color: 'from-teal-500 to-cyan-500' },
  ],
  pelajar: [
    { role: 'Pelajar (Ahmad)', identifier: 'M2024001', password: 'pelajar123', color: 'from-violet-500 to-purple-500' },
  ],
};

const LOGIN_TIMEOUT_MS = 20000;

const LoginPage = () => {
  const { portal_title } = usePortalConfig();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showMyDigitalID, setShowMyDigitalID] = useState(false);
  const [myDigitalIDEnabled, setMyDigitalIDEnabled] = useState(false);
  const [showDemoAccounts, setShowDemoAccounts] = useState(true);
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    api.get('/api/settings/mydigitalid')
      .then((res) => setMyDigitalIDEnabled(res.data.enabled))
      .catch(() => setMyDigitalIDEnabled(false));
  }, []);

  const isEmail = (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((val || '').trim());

  const handleDemoAccountClick = (account) => {
    const id = account.identifier ?? account.email;
    setIdentifier(id);
    setPassword(account.password);
    toast.success(`Akaun ${account.role} dipilih`);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const id = identifier.trim();
    if (!id || !password) {
      setError('Sila isi pengenalan dan kata laluan');
      return;
    }
    setLoading(true);
    try {
      const loginRequest = isEmail(id)
        ? api.post('/api/auth/login', { email: id.toLowerCase(), password })
        : api.post('/api/auth/login/student', { identifier: id, password });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), LOGIN_TIMEOUT_MS)
      );
      const res = await Promise.race([loginRequest, timeoutPromise]);
      const data = res?.data;
      if (!data?.access_token || !data?.user) {
        setError('Respons pelayan tidak sah. Sila pastikan backend berjalan dan cuba lagi.');
        return;
      }
      login(data);
      toast.success('Selamat datang!');
      const role = data.user?.role;
      if (role === 'pelajar') navigate('/pelajar');
      else if (role === 'parent') navigate('/dashboard');
      else if (role === 'superadmin') navigate('/superadmin');
      else if (role === 'bus_admin') navigate('/bus-admin');
      else if (role === 'bus_driver') navigate('/driver-bas');
      else if (['admin', 'bendahari', 'sub_bendahari'].includes(role)) navigate('/admin');
      else if (['guru_kelas', 'guru_homeroom'].includes(role)) navigate('/guru');
      else if (role === 'warden') navigate('/warden');
      else if (role === 'guard') navigate('/guard');
      else navigate('/dashboard');
    } catch (err) {
      const isTimeout = err?.message === 'timeout';
      const isNetworkError =
        !err.response && (err.message === 'Network Error' || err.code === 'ERR_NETWORK');
      setError(
        isTimeout
          ? 'Masa menunggu tamat. Sila pastikan pelayan berjalan dan cuba lagi.'
          : isNetworkError
            ? `Tidak dapat menghubungi pelayan (${API_URL}). Sila pastikan backend berjalan.`
            : err.response?.data?.detail || 'Ralat log masuk'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleMyDigitalIDSuccess = (data) => {
    login(data);
    toast.success('Log masuk MyDigital ID berjaya!');
    navigate('/dashboard');
  };

  const demoAccountGroups = [
    { label: 'Staff', accounts: REAL_ACCOUNTS.staff.map((a) => ({ ...a, type: 'staff' })) },
    { label: 'Driver Bas', accounts: (REAL_ACCOUNTS.driver_bas || []).map((a) => ({ ...a, type: 'driver_bas' })) },
    { label: 'Ibu Bapa', accounts: REAL_ACCOUNTS.parent.map((a) => ({ ...a, type: 'parent' })) },
    { label: 'Pelajar', accounts: REAL_ACCOUNTS.pelajar.map((a) => ({ ...a, type: 'pelajar' })) },
  ];
  const allDemoAccounts = demoAccountGroups.flatMap((g) => g.accounts);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden px-4 py-8">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-teal-50/40 to-violet-100/60" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(20,184,166,0.25),transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_80%_50%,rgba(139,92,246,0.15),transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_50%_at_20%_80%,rgba(236,72,153,0.1),transparent)]" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[420px] relative z-10"
      >
        {/* Logo & title */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 text-slate-600 hover:text-teal-600 text-sm font-medium mb-6 transition-colors">
            <Home size={18} />
            Laman Utama
          </Link>
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 20 }}
            className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-teal-400 via-violet-500 to-fuchsia-500 flex items-center justify-center shadow-xl shadow-teal-500/25 border border-white/30"
          >
            <GraduationCap className="text-white" size={40} />
          </motion.div>
          <h1 className="text-2xl font-extrabold bg-gradient-to-r from-teal-700 via-violet-600 to-fuchsia-600 bg-clip-text text-transparent font-heading">
            Log Masuk
          </h1>
          <p className="text-slate-500 mt-1.5 text-sm">{portal_title} — Staff, Ibu Bapa & Pelajar</p>
        </div>

        {/* Single login box */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="rounded-3xl bg-white/95 backdrop-blur-xl shadow-2xl shadow-slate-200/50 border border-white/80 overflow-hidden"
        >
          <div className="p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm"
                >
                  <AlertCircle size={20} className="flex-shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Email, No. MyKad atau No. Matrik
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    inputMode="text"
                    autoComplete="username"
                    placeholder="cth: admin@muafakat.link atau M2024001 atau 100101011234"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                    className="w-full h-12 pl-12 pr-4 py-3.5 rounded-xl border-2 border-slate-200 bg-slate-50/50 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20 transition-all text-sm"
                    data-testid="login-identifier"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Kata Laluan</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full h-12 pl-12 pr-12 py-3.5 rounded-xl border-2 border-slate-200 bg-slate-50/50 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20 transition-all text-sm"
                    data-testid="login-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-violet-600 transition-colors p-1"
                    aria-label={showPassword ? 'Sembunyikan kata laluan' : 'Tunjuk kata laluan'}
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                {isEmail(identifier) && (
                  <div className="mt-2 text-right">
                    <Link
                      to="/forgot-password"
                      className="text-xs font-medium text-teal-600 hover:text-teal-700 hover:underline"
                      data-testid="login-forgot-password"
                    >
                      Lupa kata laluan?
                    </Link>
                  </div>
                )}
              </div>

              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-teal-500 via-violet-500 to-fuchsia-500 text-white font-bold text-base shadow-lg shadow-violet-500/30 hover:shadow-xl hover:shadow-violet-500/40 transition-shadow disabled:opacity-60 disabled:pointer-events-none flex items-center justify-center gap-2"
                data-testid="login-submit"
              >
                {loading ? (
                  <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <LogIn size={22} />
                )}
                {loading ? 'Memuatkan...' : 'Log Masuk'}
              </motion.button>
            </form>

            {myDigitalIDEnabled && (
              <>
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="px-3 bg-white text-slate-400 text-xs font-medium">atau</span>
                  </div>
                </div>
                <motion.button
                  type="button"
                  onClick={() => setShowMyDigitalID(true)}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl border-2 border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/50 transition-colors text-slate-700 font-semibold text-sm"
                  data-testid="mydigitalid-btn"
                >
                  <span className="text-red-600 font-bold">my</span>
                  <span className="text-blue-600 font-bold">digital</span>
                  <span className="text-amber-500 font-bold">ID</span>
                  <span className="text-slate-600">Log Masuk</span>
                </motion.button>
              </>
            )}

            <p className="mt-6 text-center text-sm text-slate-500">
              Belum ada akaun?{' '}
              <Link to="/register" className="font-semibold text-teal-600 hover:text-teal-700 hover:underline">
                Daftar sekarang
              </Link>
            </p>
          </div>
        </motion.div>

        {/* Demo accounts below box */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mt-6 rounded-2xl bg-gradient-to-br from-amber-50/90 to-orange-50/90 border border-amber-200/80 shadow-lg backdrop-blur-sm overflow-hidden"
        >
          <button
            type="button"
            onClick={() => setShowDemoAccounts(!showDemoAccounts)}
            className="w-full flex items-center justify-between gap-2 px-5 py-4 text-left"
            data-testid="toggle-demo-accounts"
          >
            <span className="flex items-center gap-2 font-bold text-amber-900">
              <Sparkles size={18} className="text-amber-600" />
              Akaun demo (klik untuk isi)
            </span>
            {showDemoAccounts ? <ChevronUp size={20} className="text-amber-700" /> : <ChevronDown size={20} className="text-amber-700" />}
          </button>
          {showDemoAccounts && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-5 pb-5 pt-0"
            >
              <div className="space-y-4 max-h-[20rem] overflow-y-auto pr-1">
                {demoAccountGroups.map((group) =>
                  group.accounts.length > 0 ? (
                    <div key={group.label}>
                      <p className="text-[11px] font-semibold text-amber-800 uppercase tracking-wide mb-1.5">{group.label}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {group.accounts.map((account, idx) => (
                          <motion.button
                            key={`${account.type}-${idx}`}
                            type="button"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleDemoAccountClick(account)}
                            className={`p-3 rounded-xl bg-gradient-to-r ${account.color} text-white text-left shadow-md hover:shadow-lg transition-all`}
                            data-testid={`demo-account-${account.role.toLowerCase().replace(/\s+/g, '-')}`}
                          >
                            <div className="font-bold text-xs leading-tight">{account.role}</div>
                            <div className="opacity-90 truncate text-[11px] mt-0.5">
                              {account.identifier ?? account.email}
                            </div>
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  ) : null
                )}
              </div>
              <p className="text-xs text-amber-700 mt-3 text-center">
                Pelajar: <span className="font-bold">pelajar123</span> · Driver Bas: <span className="font-bold">driver123</span> · Lain-lain: ikut peranan
              </p>
            </motion.div>
          )}
        </motion.div>
      </motion.div>

      <MyDigitalIDModal
        isOpen={showMyDigitalID}
        onClose={() => setShowMyDigitalID(false)}
        onSuccess={handleMyDigitalIDSuccess}
      />
    </div>
  );
};

export default LoginPage;
