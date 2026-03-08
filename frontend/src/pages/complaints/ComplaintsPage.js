import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  AlertTriangle, FileText, Send, Camera, X, Clock,
  CheckCircle, AlertCircle, Search, Filter, ChevronDown,
  ChevronUp, Phone, MessageSquare, User, Building,
  Calendar, Eye, Plus, BookOpen, Info, ExternalLink
} from 'lucide-react';
import { useAuth } from '../../App';
import api from '../../services/api';

// Constants
const COMPLAINT_TYPES = {
  disiplin: { name: 'Disiplin', color: 'bg-red-100 text-red-700', icon: AlertTriangle },
  keselamatan: { name: 'Keselamatan', color: 'bg-orange-100 text-orange-700', icon: AlertTriangle },
  kebajikan: { name: 'Kebajikan', color: 'bg-blue-100 text-blue-700', icon: User },
  fasiliti_rosak: { name: 'Fasiliti Rosak', color: 'bg-yellow-100 text-yellow-700', icon: Building },
  penapis_air: { name: 'Penapis Air', color: 'bg-cyan-100 text-cyan-700', icon: FileText },
  paranormal: { name: 'Paranormal', color: 'bg-violet-100 text-violet-700', icon: AlertTriangle },
  makanan: { name: 'Makanan', color: 'bg-green-100 text-green-700', icon: FileText },
  gangguan_pelajar: { name: 'Gangguan Pelajar', color: 'bg-pastel-lavender text-violet-700', icon: User },
  lain_lain: { name: 'Lain-lain', color: 'bg-gray-100 text-gray-700', icon: FileText }
};

const COMPLAINT_PRIORITIES = {
  rendah: { name: 'Rendah', color: 'bg-green-100 text-green-700' },
  sederhana: { name: 'Sederhana', color: 'bg-yellow-100 text-yellow-700' },
  kritikal: { name: 'Kritikal', color: 'bg-red-100 text-red-700' }
};

const COMPLAINT_STATUSES = {
  baru_dihantar: { name: 'Baru Dihantar', color: 'bg-blue-100 text-blue-700' },
  diterima_warden: { name: 'Diterima Warden', color: 'bg-pastel-mint text-teal-700' },
  dalam_siasatan: { name: 'Dalam Siasatan', color: 'bg-pastel-lavender text-violet-700' },
  dalam_tindakan: { name: 'Dalam Tindakan', color: 'bg-orange-100 text-orange-700' },
  menunggu_maklum_balas: { name: 'Menunggu Maklum Balas', color: 'bg-yellow-100 text-yellow-700' },
  di_luar_bidang: { name: 'Di Luar Bidang Tugas', color: 'bg-gray-100 text-gray-600 border border-gray-300' },
  selesai: { name: 'Selesai', color: 'bg-green-100 text-green-700' },
  ditutup: { name: 'Ditutup', color: 'bg-gray-100 text-gray-700' }
};

// Complaint Form Component
const ComplaintForm = ({ onClose, onSuccess, children, blocks }) => {
  const auth = useAuth();
  const user = auth?.user;
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nama_pengadu: user?.full_name || '',
    hubungan: 'ibu_bapa',
    nombor_maktab: '',
    nama_pelajar: '',
    tingkatan: 1,
    asrama: '',
    jenis_aduan: '',
    penerangan: '',
    gambar_sokongan: [],
    tahap_keutamaan: 'sederhana'
  });

  // Auto-fill from children
  useEffect(() => {
    if (children && children.length > 0) {
      const child = children[0];
      setFormData(prev => ({
        ...prev,
        nombor_maktab: child.matric_number || '',
        nama_pelajar: child.full_name || '',
        tingkatan: child.form || 1,
        asrama: child.block_name || ''
      }));
    }
  }, [children]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.jenis_aduan) {
      toast.error('Sila pilih jenis aduan');
      return;
    }
    if (formData.penerangan.length < 10) {
      toast.error('Penerangan mestilah sekurang-kurangnya 10 aksara');
      return;
    }

    setLoading(true);
    try {
      await api.post('/api/complaints', formData);
      toast.success('Aduan berjaya dihantar!');
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menghantar aduan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      className="fixed right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl z-50 overflow-y-auto"
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-pastel-rose to-pastel-peach p-6 text-white sticky top-0 z-10 shadow-pastel-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold">Borang Aduan Baru</h2>
              <p className="text-white/80 text-sm">Sila lengkapkan maklumat di bawah</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg">
            <X size={24} />
          </button>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {/* Pengadu Info */}
        <div className="space-y-4">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <User size={18} className="text-red-600" />
            Maklumat Pengadu
          </h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nama Pengadu</label>
              <input
                type="text"
                value={formData.nama_pengadu}
                onChange={(e) => setFormData({ ...formData, nama_pengadu: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Hubungan</label>
              <select
                value={formData.hubungan}
                onChange={(e) => setFormData({ ...formData, hubungan: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="ibu_bapa">Ibu Bapa</option>
                <option value="pelajar">Pelajar</option>
                <option value="muafakat">Muafakat (PIBG)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Pelajar Info */}
        <div className="space-y-4">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <Building size={18} className="text-red-600" />
            Maklumat Pelajar
          </h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">No. Maktab</label>
              <input
                type="text"
                value={formData.nombor_maktab}
                onChange={(e) => setFormData({ ...formData, nombor_maktab: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="M2024XXX"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nama Pelajar</label>
              <input
                type="text"
                value={formData.nama_pelajar}
                onChange={(e) => setFormData({ ...formData, nama_pelajar: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tingkatan</label>
              <select
                value={formData.tingkatan}
                onChange={(e) => setFormData({ ...formData, tingkatan: parseInt(e.target.value) })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                {[1, 2, 3, 4, 5, 6].map(t => (
                  <option key={t} value={t}>Tingkatan {t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Asrama</label>
              <select
                value={formData.asrama}
                onChange={(e) => setFormData({ ...formData, asrama: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                required
              >
                <option value="">Pilih Asrama</option>
                {blocks?.map(b => (
                  <option key={b.code} value={b.code}>{b.name} ({b.gender_display})</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Aduan Info */}
        <div className="space-y-4">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <FileText size={18} className="text-red-600" />
            Butiran Aduan
          </h3>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Jenis Aduan *</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(COMPLAINT_TYPES).map(([key, value]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFormData({ ...formData, jenis_aduan: key })}
                  className={`p-3 rounded-lg border-2 transition-all text-left ${
                    formData.jenis_aduan === key
                      ? 'border-red-500 bg-red-50'
                      : 'border-slate-200 hover:border-red-300'
                  }`}
                >
                  <span className={`text-xs px-2 py-1 rounded-full ${value.color}`}>
                    {value.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Penerangan Aduan *</label>
            <textarea
              value={formData.penerangan}
              onChange={(e) => setFormData({ ...formData, penerangan: e.target.value })}
              className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              rows={4}
              placeholder="Terangkan aduan anda dengan jelas..."
              required
              minLength={10}
            />
            <p className="text-xs text-slate-500 mt-1">{formData.penerangan.length}/2000 aksara</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Tahap Keutamaan</label>
            <div className="flex gap-2">
              {Object.entries(COMPLAINT_PRIORITIES).map(([key, value]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFormData({ ...formData, tahap_keutamaan: key })}
                  className={`flex-1 py-2 px-4 rounded-lg border-2 transition-all ${
                    formData.tahap_keutamaan === key
                      ? 'border-red-500 bg-red-50'
                      : 'border-slate-200 hover:border-red-300'
                  }`}
                >
                  <span className={`text-sm font-medium px-2 py-1 rounded-full ${value.color}`}>
                    {value.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="pt-4 border-t">
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-pastel-rose to-pastel-peach text-white font-semibold rounded-xl shadow-pastel-sm hover:shadow-pastel transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Send size={20} />
                Hantar Aduan
              </>
            )}
          </button>
        </div>
      </form>
    </motion.div>
  );
};

// Complaint Detail Modal for Parents
const ComplaintDetailModal = ({ complaint, onClose, onFeedback }) => {
  const [feedback, setFeedback] = useState('');
  const [rating, setRating] = useState(0);
  const [loading, setLoading] = useState(false);

  const typeInfo = COMPLAINT_TYPES[complaint.jenis_aduan] || COMPLAINT_TYPES.lain_lain;
  const priorityInfo = COMPLAINT_PRIORITIES[complaint.tahap_keutamaan] || COMPLAINT_PRIORITIES.sederhana;
  const statusInfo = COMPLAINT_STATUSES[complaint.status] || COMPLAINT_STATUSES.baru_dihantar;
  const isResolved = ['selesai', 'ditutup'].includes(complaint.status);
  const isDiLuarBidang = complaint.status === 'di_luar_bidang';
  const canGiveFeedback = complaint.status === 'menunggu_maklum_balas' || isResolved;

  const handleSubmitFeedback = async () => {
    if (!feedback.trim() || rating === 0) {
      toast.error('Sila berikan rating dan komen');
      return;
    }
    setLoading(true);
    try {
      await api.post(`/api/complaints/${complaint.id}/feedback`, {
        rating,
        komen: feedback
      });
      toast.success('Maklum balas berjaya dihantar!');
      onFeedback?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menghantar maklum balas');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      className="fixed right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl z-50 overflow-y-auto"
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-6 text-white sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/60 text-sm">{complaint.nombor_aduan}</p>
            <h2 className="text-xl font-bold">{complaint.nama_pelajar}</h2>
            <div className="flex items-center gap-2 mt-2">
              <span className={`text-xs px-2 py-1 rounded-full ${priorityInfo.color}`}>
                {priorityInfo.name}
              </span>
              <span className={`text-xs px-2 py-1 rounded-full ${typeInfo.color}`}>
                {typeInfo.name}
              </span>
              <span className={`text-xs px-2 py-1 rounded-full ${statusInfo.color}`}>
                {statusInfo.name}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg">
            <X size={24} />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Info Section */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-50 p-4 rounded-xl">
            <p className="text-xs text-slate-500">Pengadu</p>
            <p className="font-semibold text-slate-900">{complaint.nama_pengadu}</p>
          </div>
          <div className="bg-slate-50 p-4 rounded-xl">
            <p className="text-xs text-slate-500">Lokasi</p>
            <p className="font-semibold text-slate-900">Asrama {complaint.asrama}</p>
            <p className="text-sm text-slate-600">Tingkatan {complaint.tingkatan}</p>
          </div>
        </div>

        {/* Description */}
        <div className="bg-slate-50 p-4 rounded-xl">
          <p className="text-xs text-slate-500 mb-2">Penerangan Aduan</p>
          <p className="text-slate-900">{complaint.penerangan}</p>
          <p className="text-xs text-slate-500 mt-3">
            <Clock size={12} className="inline mr-1" />
            Dilaporkan: {new Date(complaint.created_at).toLocaleString('ms-MY')}
          </p>
        </div>

        {/* Warden Info */}
        {complaint.warden_name && (
          <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <User className="text-blue-600" size={20} />
              </div>
              <div>
                <p className="text-xs text-blue-600">Warden Bertugas</p>
                <p className="font-semibold text-blue-900">{complaint.warden_name}</p>
              </div>
            </div>
          </div>
        )}

        {/* Guideline Reference (for Di Luar Bidang) */}
        {isDiLuarBidang && complaint.guideline_reference && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-amber-800">
              <BookOpen size={20} />
              <h3 className="font-semibold">Panduan Berkaitan</h3>
            </div>
            <div className="bg-white rounded-lg p-4 border border-amber-200">
              <h4 className="font-medium text-slate-900 mb-2">{complaint.guideline_reference.title}</h4>
              <ul className="space-y-1.5">
                {complaint.guideline_reference.items?.map((item, idx) => (
                  <li key={idx} className="text-sm text-slate-600 flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5">•</span>
                    {item}
                  </li>
                ))}
              </ul>
              {complaint.guideline_reference.contact && (
                <p className="text-sm text-amber-700 mt-3 pt-3 border-t border-amber-100 flex items-center gap-2">
                  <Phone size={14} />
                  {complaint.guideline_reference.contact}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Status Timeline */}
        <div className="space-y-3">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <Clock size={18} className="text-blue-600" />
            Status Aduan
          </h3>
          <div className="relative pl-8">
            <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-slate-200" />
            {complaint.audit_log?.length > 0 ? (
              complaint.audit_log.map((log, idx) => (
                <div key={idx} className="relative pb-4">
                  <div className={`absolute left-0 w-2.5 h-2.5 rounded-full ${
                    idx === 0 ? 'bg-blue-500' : 'bg-slate-300'
                  }`} style={{ transform: 'translateX(-50%)' }} />
                  <div className="ml-4">
                    <p className="text-sm text-slate-900">{log.details}</p>
                    <p className="text-xs text-slate-500">
                      {log.user_name} · {new Date(log.timestamp).toLocaleString('ms-MY')}
                    </p>
                    {log.catatan && (
                      <p className="text-sm text-slate-600 mt-1 p-2 bg-slate-50 rounded">
                        "{log.catatan}"
                      </p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500 ml-4">Tiada log audit</p>
            )}
          </div>
        </div>

        {/* Actions/Responses from Warden */}
        {complaint.tindakan_list?.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <MessageSquare size={18} className="text-green-600" />
              Tindakan & Respon Warden
            </h3>
            <div className="space-y-3">
              {complaint.tindakan_list.map((t, idx) => (
                <div key={idx} className="bg-green-50 p-4 rounded-xl border border-green-200">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-green-900">{t.user_name}</p>
                    <p className="text-xs text-green-600">
                      {new Date(t.timestamp).toLocaleString('ms-MY')}
                    </p>
                  </div>
                  <p className="text-slate-700">{t.tindakan}</p>
                  {t.respon_kepada_ibubapa && (
                    <div className="mt-3 p-3 bg-white rounded-lg border border-green-200">
                      <p className="text-xs text-green-600 mb-1">Mesej kepada anda:</p>
                      <p className="text-sm text-slate-900">{t.respon_kepada_ibubapa}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Feedback Section */}
        {canGiveFeedback && !complaint.feedback_given && (
          <div className="space-y-4 pt-4 border-t">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <CheckCircle size={18} className="text-blue-600" />
              Berikan Maklum Balas
            </h3>
            
            {/* Rating */}
            <div>
              <p className="text-sm text-slate-600 mb-2">Penilaian pengendalian aduan:</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className={`w-10 h-10 rounded-full transition-all ${
                      rating >= star
                        ? 'bg-yellow-400 text-white'
                        : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                    }`}
                  >
                    {star}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {rating === 1 && 'Sangat Tidak Memuaskan'}
                {rating === 2 && 'Tidak Memuaskan'}
                {rating === 3 && 'Sederhana'}
                {rating === 4 && 'Memuaskan'}
                {rating === 5 && 'Sangat Memuaskan'}
              </p>
            </div>

            {/* Feedback Text */}
            <div>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Komen tambahan (pilihan)..."
                className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                rows={3}
              />
            </div>

            <button
              onClick={handleSubmitFeedback}
              disabled={loading || rating === 0}
              className="w-full py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Send size={18} />
                  Hantar Maklum Balas
                </>
              )}
            </button>
          </div>
        )}

        {/* Feedback Already Given */}
        {complaint.feedback_given && (
          <div className="bg-green-50 p-4 rounded-xl border border-green-200">
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle size={20} />
              <p className="font-medium">Maklum balas telah dihantar</p>
            </div>
            {complaint.feedback && (
              <div className="mt-2">
                <div className="flex gap-1 mb-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span
                      key={star}
                      className={`text-sm ${
                        complaint.feedback.rating >= star ? 'text-yellow-500' : 'text-slate-300'
                      }`}
                    >
                      ★
                    </span>
                  ))}
                </div>
                {complaint.feedback.komen && (
                  <p className="text-sm text-slate-600">"{complaint.feedback.komen}"</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};

// Complaint Card Component
const ComplaintCard = ({ complaint, onClick }) => {
  const typeInfo = COMPLAINT_TYPES[complaint.jenis_aduan] || COMPLAINT_TYPES.lain_lain;
  const priorityInfo = COMPLAINT_PRIORITIES[complaint.tahap_keutamaan] || COMPLAINT_PRIORITIES.sederhana;
  const statusInfo = COMPLAINT_STATUSES[complaint.status] || COMPLAINT_STATUSES.baru_dihantar;
  const isDiLuarBidang = complaint.status === 'di_luar_bidang';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-xl border p-4 hover:shadow-lg transition-all cursor-pointer ${
        isDiLuarBidang ? 'border-amber-300 bg-amber-50' : 'border-slate-200'
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs text-slate-500">{complaint.nombor_aduan}</p>
          <h3 className="font-semibold text-slate-900">{complaint.nama_pelajar}</h3>
          <p className="text-sm text-slate-600">Asrama {complaint.asrama} · Tingkatan {complaint.tingkatan}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full ${priorityInfo.color}`}>
          {priorityInfo.name}
        </span>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className={`text-xs px-2 py-1 rounded-full ${typeInfo.color}`}>
          {typeInfo.name}
        </span>
        <span className={`text-xs px-2 py-1 rounded-full ${statusInfo.color}`}>
          {statusInfo.name}
        </span>
      </div>

      <p className="text-sm text-slate-600 line-clamp-2 mb-3">{complaint.penerangan}</p>

      {/* Guideline Reference Banner */}
      {isDiLuarBidang && complaint.guideline_reference && (
        <div className="bg-amber-100 border border-amber-200 rounded-lg p-3 mb-3">
          <div className="flex items-center gap-2 text-amber-800">
            <BookOpen size={16} />
            <span className="text-xs font-medium">Sila rujuk peraturan sedia ada</span>
          </div>
          <p className="text-xs text-amber-700 mt-1 line-clamp-1">
            {complaint.guideline_reference.title}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <Clock size={12} />
          {new Date(complaint.created_at).toLocaleDateString('ms-MY')}
        </span>
        {complaint.warden_name && (
          <span className="flex items-center gap-1">
            <User size={12} />
            {complaint.warden_name}
          </span>
        )}
      </div>
    </motion.div>
  );
};

// Main Complaints Page
export const ComplaintsPage = () => {
  const auth = useAuth();
  const user = auth?.user;
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [children, setChildren] = useState([]);
  const [filters, setFilters] = useState({
    status: '',
    jenis_aduan: '',
    tahap_keutamaan: ''
  });
  const [stats, setStats] = useState(null);
  const [initialized, setInitialized] = useState(false);

  // Initial load
  useEffect(() => {
    if (!initialized) {
      setInitialized(true);
      fetchData();
    }
  }, [initialized]);

  // Refetch when filters change
  useEffect(() => {
    if (initialized) {
      fetchData();
    }
  }, [filters]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [complaintsRes, blocksRes, statsRes] = await Promise.all([
        api.get('/api/complaints/my-complaints', { params: filters }),
        api.get('/api/hostel-blocks/public'),
        api.get('/api/complaints/dashboard/stats')
      ]);
      setComplaints(complaintsRes.data.complaints);
      setBlocks(blocksRes.data.blocks);
      setStats(statsRes.data.stats);

      // Fetch children if parent
      if (user?.role === 'parent') {
        try {
          const childrenRes = await api.get('/api/children');
          setChildren(childrenRes.data.children || []);
        } catch (e) {
          console.error('Failed to fetch children');
        }
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchComplaintDetail = async (id) => {
    try {
      const res = await api.get(`/api/complaints/${id}`);
      setSelectedComplaint(res.data.complaint);
    } catch (err) {
      toast.error('Gagal mendapatkan butiran aduan');
    }
  };

  const handleComplaintClick = (complaint) => {
    fetchComplaintDetail(complaint.id);
  };

  const role = user?.role;
  const canCreate = ['parent', 'pelajar'].includes(role) || role === 'superadmin';

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="complaints-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Aduan Digital</h1>
          <p className="text-slate-600">Hantar dan pantau aduan anda</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-pastel-rose to-pastel-peach text-white rounded-xl shadow-pastel-sm hover:shadow-pastel transition-all"
            data-testid="new-complaint-btn"
          >
            <Plus size={20} />
            Aduan Baru
          </button>
        )}
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <p className="text-sm text-slate-500">Hari Ini</p>
            <p className="text-2xl font-bold text-slate-900">{stats.jumlah_hari_ini}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-red-200 bg-red-50">
            <p className="text-sm text-red-600">Kritikal</p>
            <p className="text-2xl font-bold text-red-700">{stats.aduan_kritikal}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-yellow-200 bg-yellow-50">
            <p className="text-sm text-yellow-600">Belum Selesai</p>
            <p className="text-2xl font-bold text-yellow-700">{stats.aduan_belum_selesai}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <p className="text-sm text-slate-500">Jumlah Aduan</p>
            <p className="text-2xl font-bold text-slate-900">{complaints.length}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 border border-slate-200">
        <div className="flex flex-wrap gap-4">
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="px-4 py-2 border border-slate-200 rounded-lg"
          >
            <option value="">Semua Status</option>
            {Object.entries(COMPLAINT_STATUSES).map(([key, value]) => (
              <option key={key} value={key}>{value.name}</option>
            ))}
          </select>
          <select
            value={filters.jenis_aduan}
            onChange={(e) => setFilters({ ...filters, jenis_aduan: e.target.value })}
            className="px-4 py-2 border border-slate-200 rounded-lg"
          >
            <option value="">Semua Jenis</option>
            {Object.entries(COMPLAINT_TYPES).map(([key, value]) => (
              <option key={key} value={key}>{value.name}</option>
            ))}
          </select>
          <select
            value={filters.tahap_keutamaan}
            onChange={(e) => setFilters({ ...filters, tahap_keutamaan: e.target.value })}
            className="px-4 py-2 border border-slate-200 rounded-lg"
          >
            <option value="">Semua Keutamaan</option>
            {Object.entries(COMPLAINT_PRIORITIES).map(([key, value]) => (
              <option key={key} value={key}>{value.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Complaints List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-red-200 border-t-red-600 rounded-full animate-spin" />
        </div>
      ) : complaints.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <AlertCircle className="mx-auto text-slate-300 mb-4" size={48} />
          <p className="text-slate-500">Tiada aduan dijumpai</p>
          {canCreate && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg"
            >
              Hantar Aduan Pertama
            </button>
          )}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {complaints.map((complaint) => (
            <ComplaintCard
              key={complaint.id}
              complaint={complaint}
              onClick={() => handleComplaintClick(complaint)}
            />
          ))}
        </div>
      )}

      {/* Complaint Form Slide Panel */}
      <AnimatePresence>
        {showForm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => setShowForm(false)}
            />
            <ComplaintForm
              onClose={() => setShowForm(false)}
              onSuccess={fetchData}
              children={children}
              blocks={blocks}
            />
          </>
        )}
      </AnimatePresence>

      {/* Complaint Detail Modal */}
      <AnimatePresence>
        {selectedComplaint && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => setSelectedComplaint(null)}
            />
            <ComplaintDetailModal
              complaint={selectedComplaint}
              onClose={() => setSelectedComplaint(null)}
              onFeedback={() => {
                fetchData();
                setSelectedComplaint(null);
              }}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ComplaintsPage;
