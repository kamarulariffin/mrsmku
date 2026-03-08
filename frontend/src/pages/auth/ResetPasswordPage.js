import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';
import api from '../../services/api';
import { Input, Button } from '../../components/common';

const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [valid, setValid] = useState(null);
  const [emailMasked, setEmailMasked] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setValid(false);
      return;
    }
    api.get('/api/auth/reset-password/validate', { params: { token } })
      .then((res) => {
        setValid(res.data.valid);
        setEmailMasked(res.data.email_masked || '');
      })
      .catch(() => setValid(false));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('Kata laluan minimum 6 aksara');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Kata laluan dan pengesahan tidak sepadan');
      return;
    }
    setLoading(true);
    try {
      await api.post('/api/auth/reset-password', { token, new_password: password });
      setSuccess(true);
      toast.success('Kata laluan telah dikemas kini');
    } catch (err) {
      const msg = err.response?.data?.detail || 'Ralat. Sila minta pautan set semula yang baru.';
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setLoading(false);
    }
  };

  if (valid === null) {
    return (
      <div className="min-h-screen flex items-center justify-center mesh-gradient">
        <div className="text-slate-600">Memuatkan...</div>
      </div>
    );
  }

  if (!token || valid === false) {
    return (
      <div className="min-h-screen flex items-center justify-center mesh-gradient px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-pastel-lg border border-white/60 p-8 max-w-md w-full text-center"
        >
          <div className="w-14 h-14 bg-pastel-rose/60 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="text-red-600" size={28} />
          </div>
          <h1 className="text-xl font-bold text-slate-800 mb-2 font-heading">Pautan tidak sah atau telah luput</h1>
          <p className="text-slate-600 text-sm mb-6">
            Sila minta pautan set semula kata laluan yang baru dari halaman lupa kata laluan.
          </p>
          <Link
            to="/forgot-password"
            className="inline-block py-3 px-6 bg-gradient-to-r from-teal-500 to-violet-500 text-white font-semibold rounded-xl shadow-pastel-sm hover:shadow-pastel transition-all"
          >
            Minta pautan baru
          </Link>
          <div className="mt-6">
            <Link to="/login" className="text-sm text-teal-600 hover:text-violet-700 font-medium transition-colors">Kembali ke Log masuk</Link>
          </div>
        </motion.div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center mesh-gradient px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-pastel-lg border border-white/60 p-8 max-w-md w-full text-center"
        >
          <div className="w-14 h-14 bg-pastel-sage/60 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="text-emerald-600" size={28} />
          </div>
          <h1 className="text-xl font-bold text-slate-800 mb-2 font-heading">Kata laluan telah dikemas kini</h1>
          <p className="text-slate-600 text-sm mb-6">
            Sila log masuk dengan kata laluan baru anda.
          </p>
          <Link
            to="/login"
            className="inline-block py-3 px-6 bg-gradient-to-r from-teal-500 to-violet-500 text-white font-semibold rounded-xl shadow-pastel-sm hover:shadow-pastel transition-all"
          >
            Log masuk
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center mesh-gradient px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-teal-400 via-violet-400 to-fuchsia-300 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-pastel-lg border border-white/40">
            <Lock className="text-white" size={32} />
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-teal-600 via-violet-600 to-fuchsia-500 bg-clip-text text-transparent font-heading">
            Set Kata Laluan Baru
          </h1>
          {emailMasked && (
            <p className="text-slate-600 mt-1 text-sm">Akaun: {emailMasked}</p>
          )}
        </div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-pastel-lg border border-white/60 p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">Kata laluan baru</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 aksara"
                  required
                  minLength={6}
                  className="flex h-12 w-full rounded-xl border-2 border-slate-200 bg-white pl-4 pr-11 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-violet-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <Input
              label="Sahkan kata laluan"
              type={showPassword ? 'text' : 'password'}
              placeholder="Ulangi kata laluan"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
            />
            <Button type="submit" className="w-full" loading={loading} disabled={loading}>
              {loading ? 'Mengemas kini...' : 'Set Kata Laluan'}
            </Button>
          </form>
          <div className="mt-6 text-center">
            <Link to="/login" className="text-sm text-slate-600 hover:text-teal-600 font-medium transition-colors">
              Kembali ke Log masuk
            </Link>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default ResetPasswordPage;
