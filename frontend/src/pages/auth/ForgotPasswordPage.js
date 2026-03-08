import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Mail, ArrowLeft, Send, CheckCircle } from 'lucide-react';
import api from '../../services/api';
import { Input, Button } from '../../components/common';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email?.trim()) {
      toast.error('Sila masukkan e-mel');
      return;
    }
    setLoading(true);
    try {
      await api.post('/api/auth/forgot-password', { email: email.trim().toLowerCase() });
      setSent(true);
      toast.success('Semak peti masuk anda');
    } catch (err) {
      const msg = err.response?.data?.detail || 'Ralat. Sila cuba lagi.';
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center mesh-gradient px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-6">
          <Link to="/login" className="inline-block">
            <motion.div whileHover={{ scale: 1.05 }} className="w-16 h-16 bg-gradient-to-br from-teal-400 via-violet-400 to-fuchsia-300 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-pastel-lg border border-white/40 transition-shadow">
              <Mail className="text-white" size={32} />
            </motion.div>
          </Link>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-teal-600 via-violet-600 to-fuchsia-500 bg-clip-text text-transparent font-heading">
            Lupa Kata Laluan
          </h1>
          <p className="text-slate-600 mt-1 text-sm">
            Masukkan e-mel akaun anda. Pautan set semula akan dihantar ke e-mel.
          </p>
        </div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-pastel-lg border border-white/60 p-6 sm:p-8">
          {sent ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="text-center py-4"
            >
              <div className="w-14 h-14 bg-pastel-sage/60 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="text-emerald-600" size={28} />
              </div>
              <h2 className="font-semibold text-slate-800 mb-2">E-mel telah dihantar</h2>
              <p className="text-sm text-slate-600 mb-6">
                Jika e-mel anda berdaftar, pautan set semula kata laluan telah dihantar. Sila semak peti masuk dan folder spam. Pautan sah selama 1 jam.
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-teal-600 hover:text-violet-700 font-medium text-sm transition-colors"
              >
                <ArrowLeft size={16} /> Kembali ke Log masuk
              </Link>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <Input
                label="E-mel"
                type="email"
                icon={Mail}
                placeholder="email@contoh.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
              <Button
                type="submit"
                className="w-full"
                loading={loading}
                disabled={loading}
              >
                {loading ? 'Menghantar...' : (
                  <>
                    <Send size={18} className="mr-2" />
                    Hantar Pautan Set Semula
                  </>
                )}
              </Button>
            </form>
          )}

          {!sent && (
            <div className="mt-6 text-center">
              <Link
                to="/login"
                className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-teal-600 font-medium transition-colors"
              >
                <ArrowLeft size={14} /> Kembali ke Log masuk
              </Link>
            </div>
          )}
        </motion.div>

        <p className="text-center text-xs text-slate-500 mt-4">
          Untuk akaun pelajar (log masuk dengan No. Matrik), sila hubungi admin sekolah.
        </p>
      </motion.div>
    </div>
  );
};

export default ForgotPasswordPage;
