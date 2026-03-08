import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Zap, Clock, Plus, Image as ImageIcon,
  CheckCircle, XCircle, CreditCard, Eye, MousePointer, Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_URL } from '../../services/api';

const statusConfig = {
  pending: { label: 'Menunggu Kelulusan', color: 'bg-amber-100 text-amber-700', icon: Clock },
  approved: { label: 'Diluluskan - Menunggu Bayaran', color: 'bg-blue-100 text-blue-700', icon: CreditCard },
  rejected: { label: 'Ditolak', color: 'bg-red-100 text-red-700', icon: XCircle },
  active: { label: 'Aktif', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  expired: { label: 'Tamat Tempoh', color: 'bg-gray-100 text-gray-600', icon: Clock }
};

const packageColors = {
  bronze: { bg: 'bg-amber-500', light: 'bg-amber-50', border: 'border-amber-200' },
  silver: { bg: 'bg-gray-400', light: 'bg-gray-50', border: 'border-gray-200' },
  gold: { bg: 'bg-yellow-500', light: 'bg-yellow-50', border: 'border-yellow-200' }
};

export default function VendorAdsPage() {
  const navigate = useNavigate();
  const [myAds, setMyAds] = useState([]);
  const [adPackages, setAdPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    image_url: '',
    link_url: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [payingAdId, setPayingAdId] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Fetch my ads
      const adsRes = await fetch(`${API_URL}/api/marketplace/ads/my-ads`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (adsRes.ok) {
        const adsData = await adsRes.json();
        setMyAds(adsData);
      }

      // Fetch ad packages
      const pkgRes = await fetch(`${API_URL}/api/marketplace/ad-packages`);
      if (pkgRes.ok) {
        const pkgData = await pkgRes.json();
        setAdPackages(pkgData);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateAd = async () => {
    if (!selectedPackage || !formData.title || !formData.image_url) {
      alert('Sila lengkapkan semua maklumat yang diperlukan');
      return;
    }

    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/marketplace/ads`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          package_type: selectedPackage.type,
          title: formData.title,
          description: formData.description,
          image_url: formData.image_url,
          link_url: formData.link_url
        })
      });

      if (res.ok) {
        setShowCreateModal(false);
        setSelectedPackage(null);
        setFormData({ title: '', description: '', image_url: '', link_url: '' });
        fetchData();
        alert('Iklan berjaya dicipta! Menunggu kelulusan admin.');
      } else {
        const err = await res.json();
        alert(err.detail || 'Ralat semasa mencipta iklan');
      }
    } catch (err) {
      console.error('Error:', err);
      alert('Ralat rangkaian');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePayment = async (adId) => {
    if (!window.confirm('Adakah anda pasti ingin membuat pembayaran untuk iklan ini?')) return;

    setPayingAdId(adId);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/marketplace/ads/${adId}/pay`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        alert(data.message);
        fetchData();
      } else {
        const err = await res.json();
        alert(err.detail || 'Ralat semasa pembayaran');
      }
    } catch (err) {
      console.error('Error:', err);
      alert('Ralat rangkaian');
    } finally {
      setPayingAdId(null);
    }
  };

  const stats = {
    total: myAds.length,
    active: myAds.filter(a => a.status === 'active').length,
    pending: myAds.filter(a => a.status === 'pending' || a.status === 'approved').length,
    impressions: myAds.reduce((sum, a) => sum + (a.impressions || 0), 0),
    clicks: myAds.reduce((sum, a) => sum + (a.clicks || 0), 0)
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-teal-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8 min-w-0 overflow-x-hidden">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/vendor')}
              className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-white/80 rounded-xl transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Iklan Banner Saya</h1>
              <p className="text-slate-500">Urus iklan banner untuk promosi perniagaan anda</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden md:inline">Cipta Iklan</span>
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-pastel-mint rounded-xl">
                <ImageIcon className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-slate-500">Jumlah Iklan</p>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-xl">
                <Zap className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.active}</p>
                <p className="text-xs text-slate-500">Aktif</p>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-xl">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.pending}</p>
                <p className="text-xs text-slate-500">Menunggu</p>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-xl">
                <Eye className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.impressions.toLocaleString()}</p>
                <p className="text-xs text-slate-500">Impressions</p>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-pastel-lavender rounded-xl">
                <MousePointer className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.clicks.toLocaleString()}</p>
                <p className="text-xs text-slate-500">Klik</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Ad Packages */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Pakej Iklan Tersedia</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {adPackages.map((pkg, index) => {
              const colors = packageColors[pkg.type] || packageColors.bronze;
              return (
                <motion.div
                  key={pkg.type}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`relative border ${colors.border} rounded-2xl p-5 ${colors.light}`}
                >
                  <div className={`absolute -top-3 left-4 px-3 py-1 ${colors.bg} text-white text-xs font-medium rounded-full`}>
                    {pkg.name}
                  </div>
                  <div className="pt-2">
                    <p className="text-3xl font-bold text-slate-800">RM {pkg.price}</p>
                    <p className="text-sm text-slate-500">{pkg.duration_months} bulan</p>
                    <ul className="mt-4 space-y-2">
                      {pkg.features?.map((f, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-slate-600">
                          <CheckCircle className="w-4 h-4 text-emerald-500" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => {
                        setSelectedPackage(pkg);
                        setShowCreateModal(true);
                      }}
                      className={`w-full mt-4 py-2 ${colors.bg} text-white font-medium rounded-xl hover:opacity-90 transition-opacity`}
                    >
                      Pilih Pakej
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* My Ads */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-800">Iklan Saya</h2>
          
          {myAds.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center">
              <ImageIcon className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">Anda belum mempunyai iklan</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-4 px-6 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors"
              >
                Cipta Iklan Pertama
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myAds.map((ad, index) => {
                const colors = packageColors[ad.package_type] || packageColors.bronze;
                return (
                  <motion.div
                    key={ad.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="bg-white rounded-2xl shadow-sm overflow-hidden"
                  >
                    <div className={`h-2 ${colors.bg}`}></div>
                    <div className="p-4 flex gap-4">
                      <div className="w-32 h-20 bg-slate-100 rounded-xl overflow-hidden flex-shrink-0">
                        <img src={ad.image_url} alt={ad.title} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-slate-800 truncate">{ad.title}</h3>
                          <span className={`flex-shrink-0 px-2 py-1 rounded-full text-xs font-medium ${statusConfig[ad.status]?.color}`}>
                            {statusConfig[ad.status]?.label}
                          </span>
                        </div>
                        <p className="text-sm text-slate-500 mt-1">
                          {ad.package_name} · RM {ad.price}
                        </p>
                        
                        {ad.status === 'active' && (
                          <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                            <span className="flex items-center gap-1">
                              <Eye className="w-3 h-3" /> {ad.impressions}
                            </span>
                            <span className="flex items-center gap-1">
                              <MousePointer className="w-3 h-3" /> {ad.clicks}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> Sehingga {new Date(ad.end_date).toLocaleDateString('ms-MY')}
                            </span>
                          </div>
                        )}

                        {ad.status === 'approved' && (
                          <button
                            onClick={() => handlePayment(ad.id)}
                            disabled={payingAdId === ad.id}
                            className="mt-2 px-4 py-1.5 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50"
                          >
                            {payingAdId === ad.id ? 'Memproses...' : 'Bayar Sekarang'}
                          </button>
                        )}

                        {ad.status === 'rejected' && ad.rejection_reason && (
                          <p className="mt-2 text-xs text-red-500">Sebab: {ad.rejection_reason}</p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Create Ad Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen z-50"
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 space-y-5">
                <h2 className="text-xl font-bold text-slate-800">Cipta Iklan Baru</h2>

                {/* Package Selection */}
                {!selectedPackage ? (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-500">Pilih pakej iklan:</p>
                    {adPackages.map(pkg => {
                      const colors = packageColors[pkg.type] || packageColors.bronze;
                      return (
                        <button
                          key={pkg.type}
                          onClick={() => setSelectedPackage(pkg)}
                          className={`w-full p-4 border ${colors.border} rounded-xl text-left hover:bg-slate-50 transition-colors`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className={`inline-block px-2 py-0.5 ${colors.bg} text-white text-xs font-medium rounded-full mb-1`}>
                                {pkg.name}
                              </span>
                              <p className="text-slate-600 text-sm">{pkg.duration_months} bulan paparan</p>
                            </div>
                            <p className="text-xl font-bold text-slate-800">RM {pkg.price}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <>
                    {/* Selected Package */}
                    <div className={`p-3 ${packageColors[selectedPackage.type]?.light} border ${packageColors[selectedPackage.type]?.border} rounded-xl`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className={`inline-block px-2 py-0.5 ${packageColors[selectedPackage.type]?.bg} text-white text-xs font-medium rounded-full`}>
                            {selectedPackage.name}
                          </span>
                          <p className="text-sm text-slate-500 mt-1">{selectedPackage.duration_months} bulan · RM {selectedPackage.price}</p>
                        </div>
                        <button
                          onClick={() => setSelectedPackage(null)}
                          className="text-sm text-teal-600 hover:underline"
                        >
                          Tukar
                        </button>
                      </div>
                    </div>

                    {/* Form */}
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Tajuk Iklan *</label>
                        <input
                          type="text"
                          value={formData.title}
                          onChange={e => setFormData({...formData, title: e.target.value})}
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                          placeholder="Contoh: Jualan Akhir Tahun!"
                          maxLength={100}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Penerangan</label>
                        <textarea
                          value={formData.description}
                          onChange={e => setFormData({...formData, description: e.target.value})}
                          rows={2}
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                          placeholder="Penerangan ringkas..."
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">URL Gambar Banner *</label>
                        <input
                          type="url"
                          value={formData.image_url}
                          onChange={e => setFormData({...formData, image_url: e.target.value})}
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                          placeholder="https://example.com/banner.jpg"
                        />
                        {formData.image_url && (
                          <div className="mt-2 aspect-video bg-slate-100 rounded-xl overflow-hidden">
                            <img 
                              src={formData.image_url} 
                              alt="Preview" 
                              className="w-full h-full object-cover"
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">URL Pautan (pilihan)</label>
                        <input
                          type="url"
                          value={formData.link_url}
                          onChange={e => setFormData({...formData, link_url: e.target.value})}
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                          placeholder="https://example.com/my-shop"
                        />
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={() => {
                          setShowCreateModal(false);
                          setSelectedPackage(null);
                        }}
                        className="flex-1 py-3 border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors"
                        disabled={submitting}
                      >
                        Batal
                      </button>
                      <button
                        onClick={handleCreateAd}
                        className="flex-1 py-3 bg-teal-600 text-white font-medium rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-50"
                        disabled={submitting || !formData.title || !formData.image_url}
                      >
                        {submitting ? 'Menghantar...' : 'Hantar untuk Kelulusan'}
                      </button>
                    </div>

                    <p className="text-xs text-slate-400 text-center">
                      Iklan akan disemak oleh admin sebelum diaktifkan. Pembayaran diperlukan selepas kelulusan.
                    </p>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
