import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Crown, Star, CheckCircle, TrendingUp,
  Shield, Headphones, BadgePercent, Award
} from 'lucide-react';
import { motion } from 'framer-motion';
import { API_URL } from '../../services/api';

const packageFeatureIcons = {
  0: Shield,
  1: BadgePercent,
  2: Award,
  3: TrendingUp,
  4: Headphones
};

export default function VendorSubscriptionPage() {
  const navigate = useNavigate();
  const [premiumStatus, setPremiumStatus] = useState(null);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Fetch premium status
      const statusRes = await fetch(`${API_URL}/api/marketplace/vendors/premium-status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setPremiumStatus(statusData);
      }

      // Fetch premium packages
      const pkgRes = await fetch(`${API_URL}/api/marketplace/premium-packages`);
      if (pkgRes.ok) {
        const pkgData = await pkgRes.json();
        setPackages(pkgData);
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

  const handleSubscribe = async (packageType) => {
    if (!window.confirm('Adakah anda pasti ingin melanggan pakej ini?')) return;

    setSubscribing(true);
    setSelectedPackage(packageType);
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/marketplace/vendors/subscribe-premium?package_type=${packageType}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        alert(data.message);
        fetchData();
      } else {
        const err = await res.json();
        alert(err.detail || 'Ralat semasa langganan');
      }
    } catch (err) {
      console.error('Error:', err);
      alert('Ralat rangkaian');
    } finally {
      setSubscribing(false);
      setSelectedPackage(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-teal-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-teal-900 to-slate-900 p-4 md:p-8 min-w-0 overflow-x-hidden">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/vendor')}
            className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">Langganan Premium</h1>
            <p className="text-slate-400">Tingkatkan perniagaan anda dengan faedah eksklusif</p>
          </div>
        </div>

        {/* Current Status */}
        {premiumStatus && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-2xl p-6 ${
              premiumStatus.is_premium 
                ? 'bg-gradient-to-r from-amber-500 to-yellow-500' 
                : 'bg-white/10 backdrop-blur-sm border border-white/20'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${premiumStatus.is_premium ? 'bg-white/20' : 'bg-teal-500/20'}`}>
                  <Crown className={`w-8 h-8 ${premiumStatus.is_premium ? 'text-white' : 'text-teal-400'}`} />
                </div>
                <div>
                  <h2 className={`text-xl font-bold ${premiumStatus.is_premium ? 'text-white' : 'text-white'}`}>
                    {premiumStatus.is_premium ? 'Vendor Premium' : 'Vendor Percuma'}
                  </h2>
                  {premiumStatus.is_premium ? (
                    <p className="text-white/80">
                      Tamat pada {new Date(premiumStatus.premium_expires_at).toLocaleDateString('ms-MY')} 
                      ({premiumStatus.days_remaining} hari lagi)
                    </p>
                  ) : (
                    <p className="text-slate-400">Naik taraf untuk faedah eksklusif</p>
                  )}
                </div>
              </div>
              {premiumStatus.is_premium && (
                <div className="text-right">
                  <span className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 rounded-full text-white font-medium">
                    <Star className="w-4 h-4 fill-current" />
                    Aktif
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Benefits Section */}
        <div className="text-center space-y-3">
          <h2 className="text-3xl font-bold text-white">Kenapa Jadi Premium?</h2>
          <p className="text-slate-400 max-w-2xl mx-auto">
            Dapatkan kelebihan kompetitif dengan ciri-ciri eksklusif untuk mengembangkan perniagaan anda
          </p>
        </div>

        {/* Packages */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {packages.map((pkg, index) => {
            const isPopular = pkg.type === 'quarterly';
            const isBest = pkg.type === 'yearly';
            
            return (
              <motion.div
                key={pkg.type}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`relative rounded-2xl overflow-hidden ${
                  isPopular 
                    ? 'bg-gradient-to-b from-teal-600 to-teal-700 border-2 border-teal-400' 
                    : isBest
                      ? 'bg-gradient-to-b from-amber-500 to-amber-600 border-2 border-amber-300'
                      : 'bg-white/10 backdrop-blur-sm border border-white/20'
                }`}
              >
                {isPopular && (
                  <div className="absolute top-0 left-0 right-0 bg-teal-400 text-white text-xs font-bold py-1 text-center">
                    PALING POPULAR
                  </div>
                )}
                {isBest && (
                  <div className="absolute top-0 left-0 right-0 bg-amber-300 text-amber-900 text-xs font-bold py-1 text-center">
                    PALING JIMAT
                  </div>
                )}

                <div className={`p-6 space-y-5 ${(isPopular || isBest) ? 'pt-10' : ''}`}>
                  <div className="text-center">
                    <h3 className={`text-lg font-semibold ${isPopular || isBest ? 'text-white' : 'text-white'}`}>
                      {pkg.name}
                    </h3>
                    <div className="mt-3">
                      <span className={`text-4xl font-bold ${isPopular || isBest ? 'text-white' : 'text-white'}`}>
                        RM {pkg.price}
                      </span>
                      <span className={`text-sm ${isPopular || isBest ? 'text-white/70' : 'text-slate-400'}`}>
                        /{pkg.duration_months} bulan
                      </span>
                    </div>
                  </div>

                  <ul className="space-y-3">
                    {pkg.features?.map((feature, i) => {
                      const FeatureIcon = packageFeatureIcons[i] || CheckCircle;
                      return (
                        <li key={i} className="flex items-start gap-3">
                          <FeatureIcon className={`w-5 h-5 flex-shrink-0 ${
                            isPopular ? 'text-teal-200' : isBest ? 'text-amber-200' : 'text-teal-400'
                          }`} />
                          <span className={`text-sm ${isPopular || isBest ? 'text-white/90' : 'text-slate-300'}`}>
                            {feature}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  <button
                    onClick={() => handleSubscribe(pkg.type)}
                    disabled={subscribing}
                    className={`w-full py-3 font-semibold rounded-xl transition-all ${
                      isPopular 
                        ? 'bg-white text-teal-600 hover:bg-pastel-mint/50'
                        : isBest
                          ? 'bg-white text-amber-600 hover:bg-amber-50'
                          : 'bg-teal-600 text-white hover:bg-teal-700'
                    } disabled:opacity-50`}
                  >
                    {subscribing && selectedPackage === pkg.type ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                        Memproses...
                      </span>
                    ) : (
                      premiumStatus?.is_premium ? 'Perbaharui Langganan' : 'Langgan Sekarang'
                    )}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Subscription History */}
        {premiumStatus?.history?.length > 0 && (
          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Sejarah Langganan</h3>
            <div className="space-y-3">
              {premiumStatus.history.map((sub, index) => (
                <div key={index} className="flex items-center justify-between py-3 border-b border-white/10 last:border-0">
                  <div>
                    <p className="text-white font-medium capitalize">{sub.package_type}</p>
                    <p className="text-sm text-slate-400">
                      {new Date(sub.start_date).toLocaleDateString('ms-MY')} - {new Date(sub.end_date).toLocaleDateString('ms-MY')}
                    </p>
                  </div>
                  <p className="text-white font-semibold">RM {sub.price_paid}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FAQ Section */}
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Soalan Lazim</h3>
          <div className="space-y-4">
            <div>
              <p className="text-white font-medium">Apakah yang berlaku jika langganan saya tamat?</p>
              <p className="text-sm text-slate-400 mt-1">
                Anda akan kembali ke pelan percuma dan kehilangan faedah premium. Produk dan jualan anda kekal tidak terjejas.
              </p>
            </div>
            <div>
              <p className="text-white font-medium">Bolehkah saya memanjangkan langganan sebelum tamat?</p>
              <p className="text-sm text-slate-400 mt-1">
                Ya! Tempoh baru akan ditambah kepada baki semasa anda.
              </p>
            </div>
            <div>
              <p className="text-white font-medium">Adakah bayaran balik tersedia?</p>
              <p className="text-sm text-slate-400 mt-1">
                Langganan tidak boleh dikembalikan setelah diaktifkan. Sila pastikan pilihan anda sebelum membayar.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
