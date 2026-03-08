import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Image, CheckCircle, XCircle, Clock, Eye, MousePointer,
  Filter, Search, Package, Calendar, AlertCircle, TrendingUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_URL } from '../../../services/api';

const statusConfig = {
  pending: { label: 'Menunggu', color: 'bg-amber-100 text-amber-700', icon: Clock },
  approved: { label: 'Diluluskan', color: 'bg-blue-100 text-blue-700', icon: CheckCircle },
  rejected: { label: 'Ditolak', color: 'bg-red-100 text-red-700', icon: XCircle },
  active: { label: 'Aktif', color: 'bg-emerald-100 text-emerald-700', icon: Eye },
  expired: { label: 'Tamat', color: 'bg-gray-100 text-gray-600', icon: AlertCircle }
};

const packageColors = {
  bronze: 'bg-amber-500',
  silver: 'bg-gray-400',
  gold: 'bg-yellow-500'
};

export default function AdsManagementPage() {
  const navigate = useNavigate();
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAd, setSelectedAd] = useState(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchAds = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      let url = `${API_URL}/api/marketplace/ads`;
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (params.toString()) url += `?${params.toString()}`;

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAds(data);
      }
    } catch (err) {
      console.error('Error fetching ads:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchAds();
  }, [fetchAds]);

  const handleApproval = async (status) => {
    if (!selectedAd) return;
    if (status === 'rejected' && !rejectionReason.trim()) {
      alert('Sila nyatakan sebab penolakan');
      return;
    }

    setActionLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/marketplace/ads/${selectedAd.id}/approve`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status,
          rejection_reason: status === 'rejected' ? rejectionReason : null
        })
      });

      if (res.ok) {
        setShowApprovalModal(false);
        setSelectedAd(null);
        setRejectionReason('');
        fetchAds();
      } else {
        const err = await res.json();
        alert(err.detail || 'Ralat semasa proses kelulusan');
      }
    } catch (err) {
      console.error('Error:', err);
      alert('Ralat rangkaian');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredAds = ads.filter(ad => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!ad.title.toLowerCase().includes(query) && 
          !ad.vendor_name.toLowerCase().includes(query)) {
        return false;
      }
    }
    return true;
  });

  const stats = {
    total: ads.length,
    pending: ads.filter(a => a.status === 'pending').length,
    active: ads.filter(a => a.status === 'active').length,
    totalImpressions: ads.reduce((sum, a) => sum + (a.impressions || 0), 0),
    totalClicks: ads.reduce((sum, a) => sum + (a.clicks || 0), 0)
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
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/admin/marketplace')}
              className="p-2 hover:bg-white/80 rounded-xl transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Pengurusan Iklan Banner</h1>
              <p className="text-slate-500">Urus dan luluskan iklan vendor</p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl p-4 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-pastel-mint rounded-xl">
                <Image className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{stats.total}</p>
                <p className="text-xs text-slate-500">Jumlah Iklan</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl p-4 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-xl">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{stats.pending}</p>
                <p className="text-xs text-slate-500">Menunggu</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-2xl p-4 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-xl">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{stats.active}</p>
                <p className="text-xs text-slate-500">Aktif</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-2xl p-4 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-xl">
                <Eye className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{stats.totalImpressions.toLocaleString()}</p>
                <p className="text-xs text-slate-500">Impressions</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-2xl p-4 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-pastel-lavender rounded-xl">
                <MousePointer className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{stats.totalClicks.toLocaleString()}</p>
                <p className="text-xs text-slate-500">Klik</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Cari iklan atau vendor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">Semua Status</option>
                <option value="pending">Menunggu</option>
                <option value="approved">Diluluskan</option>
                <option value="active">Aktif</option>
                <option value="rejected">Ditolak</option>
                <option value="expired">Tamat</option>
              </select>
            </div>
          </div>
        </div>

        {/* Ads Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {filteredAds.map((ad, index) => {
              const StatusIcon = statusConfig[ad.status]?.icon || Clock;
              return (
                <motion.div
                  key={ad.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-white rounded-2xl shadow-sm overflow-hidden hover:shadow-md transition-shadow"
                >
                  {/* Package Badge */}
                  <div className={`h-2 ${packageColors[ad.package_type] || 'bg-slate-300'}`}></div>
                  
                  {/* Ad Image */}
                  <div className="aspect-video bg-slate-100 relative">
                    <img
                      src={ad.image_url || 'https://via.placeholder.com/400x200'}
                      alt={ad.title}
                      className="w-full h-full object-cover"
                      onError={(e) => { e.target.src = 'https://via.placeholder.com/400x200'; }}
                    />
                    <div className="absolute top-2 right-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusConfig[ad.status]?.color || 'bg-gray-100 text-gray-600'}`}>
                        {statusConfig[ad.status]?.label || ad.status}
                      </span>
                    </div>
                    <div className="absolute top-2 left-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium text-white ${packageColors[ad.package_type] || 'bg-slate-500'}`}>
                        {ad.package_name || ad.package_type}
                      </span>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-4 space-y-3">
                    <div>
                      <h3 className="font-semibold text-slate-800 line-clamp-1">{ad.title}</h3>
                      <p className="text-sm text-slate-500">{ad.vendor_name}</p>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 text-sm text-slate-500">
                      <div className="flex items-center gap-1">
                        <Eye className="w-4 h-4" />
                        <span>{ad.impressions?.toLocaleString() || 0}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <MousePointer className="w-4 h-4" />
                        <span>{ad.clicks?.toLocaleString() || 0}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Package className="w-4 h-4" />
                        <span>RM {ad.price}</span>
                      </div>
                    </div>

                    {/* Dates */}
                    {ad.start_date && (
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <Calendar className="w-3 h-3" />
                        <span>
                          {new Date(ad.start_date).toLocaleDateString('ms-MY')} - {new Date(ad.end_date).toLocaleDateString('ms-MY')}
                        </span>
                      </div>
                    )}

                    {/* Actions */}
                    {ad.status === 'pending' && (
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => {
                            setSelectedAd(ad);
                            setShowApprovalModal(true);
                          }}
                          className="flex-1 py-2 bg-emerald-500 text-white text-sm font-medium rounded-xl hover:bg-emerald-600 transition-colors"
                        >
                          Semak
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {filteredAds.length === 0 && (
          <div className="bg-white rounded-2xl p-12 text-center">
            <Image className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">Tiada iklan dijumpai</p>
          </div>
        )}
      </div>

      {/* Approval Modal */}
      <AnimatePresence>
        {showApprovalModal && selectedAd && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen z-50"
            onClick={() => setShowApprovalModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 space-y-4">
                <h2 className="text-xl font-bold text-slate-800">Semak Iklan</h2>
                
                {/* Ad Preview */}
                <div className="aspect-video bg-slate-100 rounded-xl overflow-hidden">
                  <img
                    src={selectedAd.image_url}
                    alt={selectedAd.title}
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="space-y-2">
                  <p className="font-semibold text-slate-800">{selectedAd.title}</p>
                  <p className="text-sm text-slate-500">{selectedAd.description}</p>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500">Vendor:</span>
                    <span className="font-medium">{selectedAd.vendor_name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500">Pakej:</span>
                    <span className={`px-2 py-0.5 rounded-full text-white text-xs ${packageColors[selectedAd.package_type]}`}>
                      {selectedAd.package_name}
                    </span>
                    <span className="font-medium">RM {selectedAd.price}</span>
                  </div>
                  {selectedAd.link_url && (
                    <div className="text-sm">
                      <span className="text-slate-500">Pautan: </span>
                      <a href={selectedAd.link_url} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">
                        {selectedAd.link_url}
                      </a>
                    </div>
                  )}
                </div>

                {/* Rejection Reason */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Sebab Penolakan (jika ditolak)
                  </label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                    placeholder="Nyatakan sebab penolakan..."
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setShowApprovalModal(false)}
                    className="flex-1 py-3 border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors"
                    disabled={actionLoading}
                  >
                    Batal
                  </button>
                  <button
                    onClick={() => handleApproval('rejected')}
                    className="flex-1 py-3 bg-red-500 text-white font-medium rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50"
                    disabled={actionLoading}
                  >
                    {actionLoading ? 'Memproses...' : 'Tolak'}
                  </button>
                  <button
                    onClick={() => handleApproval('approved')}
                    className="flex-1 py-3 bg-emerald-500 text-white font-medium rounded-xl hover:bg-emerald-600 transition-colors disabled:opacity-50"
                    disabled={actionLoading}
                  >
                    {actionLoading ? 'Memproses...' : 'Luluskan'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
