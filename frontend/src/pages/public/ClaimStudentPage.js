import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { QrCode, CheckCircle, XCircle, User, GraduationCap, BookOpen, AlertTriangle } from 'lucide-react';
import api from '../../services/api';

const ClaimStudentPage = () => {
  const { claimCode } = useParams();
  const navigate = useNavigate();
  const [inputCode, setInputCode] = useState(claimCode || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [studentInfo, setStudentInfo] = useState(null);
  
  // Check if user is logged in as parent
  const [user, setUser] = useState(null);
  
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    
    // If claim code is in URL, pre-fill and verify
    if (claimCode) {
      setInputCode(claimCode.toUpperCase());
    }
  }, [claimCode]);
  
  const handleClaim = async (e) => {
    e.preventDefault();
    
    if (!inputCode) {
      toast.error('Sila masukkan kod tuntutan');
      return;
    }
    
    if (!user) {
      toast.error('Sila log masuk sebagai ibu bapa untuk menuntut pelajar');
      navigate('/login');
      return;
    }
    
    if (user.role !== 'parent') {
      toast.error('Hanya ibu bapa boleh menuntut pelajar');
      return;
    }
    
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      // Use authenticated endpoint if user is logged in
      const endpoint = user ? '/api/student-import/claim-authenticated' : '/api/student-import/claim';
      const payload = {
        claim_code: inputCode.toUpperCase()
      };
      
      // Add parent_id if user is logged in
      if (user && user.id) {
        payload.parent_id = user.id;
      }
      
      const res = await api.post(endpoint, payload);
      
      setSuccess(res.data);
      setStudentInfo(res.data.student);
      toast.success('Pelajar berjaya dituntut!');
      
    } catch (err) {
      setError(err.response?.data?.detail || 'Gagal menuntut pelajar');
      toast.error(err.response?.data?.detail || 'Gagal menuntut pelajar');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-pastel-mint/30 to-pastel-lavender/30 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-violet-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-pastel">
            <QrCode className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Tuntut Pelajar</h1>
          <p className="text-slate-500 mt-2">Masukkan kod tuntutan untuk mendaftarkan anak anda</p>
        </div>
        
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          {success ? (
            // Success state
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-6"
            >
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-10 h-10 text-emerald-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">Berjaya!</h2>
              <p className="text-slate-500 mb-6">Pelajar telah berjaya dituntut dan dikaitkan dengan akaun anda.</p>
              
              {studentInfo && (
                <div className="bg-slate-50 rounded-xl p-4 mb-6 text-left">
                  <h3 className="font-medium text-slate-700 mb-3">Maklumat Pelajar</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-slate-400" />
                      <span className="text-slate-600">Nama:</span>
                      <span className="font-medium text-slate-900">{studentInfo.full_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <GraduationCap className="w-4 h-4 text-slate-400" />
                      <span className="text-slate-600">No. Matrik:</span>
                      <span className="font-medium text-slate-900">{studentInfo.matric_number}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-slate-400" />
                      <span className="text-slate-600">Tingkatan:</span>
                      <span className="font-medium text-slate-900">T{studentInfo.tingkatan} - {studentInfo.nama_kelas}</span>
                    </div>
                  </div>
                </div>
              )}
              
              <button
                onClick={() => navigate('/parent/children')}
                className="w-full py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors"
              >
                Lihat Senarai Anak
              </button>
            </motion.div>
          ) : (
            // Form state
            <form onSubmit={handleClaim} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Kod Tuntutan
                </label>
                <input
                  type="text"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                  placeholder="cth: MKA0D573"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-center text-xl font-mono tracking-wider uppercase focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  maxLength={10}
                  data-testid="claim-code-input"
                />
                <p className="text-xs text-slate-400 mt-2 text-center">
                  Kod tuntutan diberikan oleh pihak maktab
                </p>
              </div>
              
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm"
                >
                  <XCircle className="w-5 h-5 flex-shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}
              
              {!user && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                  <span>Anda perlu log masuk sebagai ibu bapa untuk menuntut pelajar</span>
                </div>
              )}
              
              <button
                type="submit"
                disabled={loading || !inputCode}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                data-testid="claim-submit-btn"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Memproses...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Tuntut Pelajar
                  </>
                )}
              </button>
              
              {!user && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                  >
                    Log masuk sebagai ibu bapa
                  </button>
                </div>
              )}
            </form>
          )}
        </div>
        
        {/* Info */}
        <div className="mt-6 text-center text-sm text-slate-500">
          <p>Menghadapi masalah?</p>
          <p>Hubungi pihak maktab untuk bantuan</p>
        </div>
      </motion.div>
    </div>
  );
};

export default ClaimStudentPage;
