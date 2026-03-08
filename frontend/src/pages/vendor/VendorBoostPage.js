import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Zap, Star, Clock, Package,
  Eye, MousePointer, CheckCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_URL } from '../../services/api';

export default function VendorBoostPage() {
  const navigate = useNavigate();
  const [myProducts, setMyProducts] = useState([]);
  const [myBoosts, setMyBoosts] = useState([]);
  const [boostPackages, setBoostPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBoostModal, setShowBoostModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedBoostType, setSelectedBoostType] = useState(null);
  const [selectedDuration, setSelectedDuration] = useState(null);
  const [boosting, setBoosting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Fetch my products (approved only)
      const productsRes = await fetch(`${API_URL}/api/marketplace/products/my-products?status=approved`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (productsRes.ok) {
        const productsData = await productsRes.json();
        setMyProducts(productsData);
      }

      // Fetch my active boosts
      const boostsRes = await fetch(`${API_URL}/api/marketplace/my-boosts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (boostsRes.ok) {
        const boostsData = await boostsRes.json();
        setMyBoosts(boostsData);
      }

      // Fetch boost packages
      const pkgRes = await fetch(`${API_URL}/api/marketplace/boost-packages`);
      if (pkgRes.ok) {
        const pkgData = await pkgRes.json();
        setBoostPackages(pkgData);
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

  const handleBoost = async () => {
    if (!selectedProduct || !selectedBoostType || !selectedDuration) {
      alert('Sila pilih produk, jenis boost, dan tempoh');
      return;
    }

    setBoosting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/marketplace/products/${selectedProduct.id}/boost`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          product_id: selectedProduct.id,
          boost_type: selectedBoostType,
          duration_days: selectedDuration.days
        })
      });

      if (res.ok) {
        const data = await res.json();
        alert(data.message);
        setShowBoostModal(false);
        setSelectedProduct(null);
        setSelectedBoostType(null);
        setSelectedDuration(null);
        fetchData();
      } else {
        const err = await res.json();
        alert(err.detail || 'Ralat semasa boost produk');
      }
    } catch (err) {
      console.error('Error:', err);
      alert('Ralat rangkaian');
    } finally {
      setBoosting(false);
    }
  };

  const getBoostTypeIcon = (type) => {
    return type === 'featured' ? Star : Zap;
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
              <h1 className="text-2xl font-bold text-slate-800">Boost Produk</h1>
              <p className="text-slate-500">Tingkatkan paparan dan jualan produk anda</p>
            </div>
          </div>
          <button
            onClick={() => setShowBoostModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors"
          >
            <Zap className="w-4 h-4" />
            <span className="hidden md:inline">Boost Produk</span>
          </button>
        </div>

        {/* Boost Packages */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {boostPackages.map((pkg, index) => {
            const Icon = pkg.type === 'featured' ? Star : Zap;
            const bgColor = pkg.type === 'featured' ? 'from-amber-500 to-orange-500' : 'from-teal-500 to-violet-500';
            
            return (
              <motion.div
                key={pkg.type}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`bg-gradient-to-r ${bgColor} rounded-2xl p-6 text-white`}
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-white/20 rounded-xl">
                    <Icon className="w-8 h-8" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold">{pkg.name}</h3>
                    <p className="text-white/80 text-sm mt-1">{pkg.description}</p>
                    <div className="flex flex-wrap gap-2 mt-4">
                      {pkg.prices?.map((price, i) => (
                        <span key={i} className="px-3 py-1 bg-white/20 rounded-full text-sm">
                          {price.label}: RM {price.price}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Active Boosts */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Boost Aktif</h2>
          
          {myBoosts.length === 0 ? (
            <div className="text-center py-8">
              <Zap className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">Tiada boost aktif</p>
              <button
                onClick={() => setShowBoostModal(true)}
                className="mt-4 px-6 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors"
              >
                Boost Produk Pertama
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {myBoosts.map((boost, index) => {
                const Icon = getBoostTypeIcon(boost.boost_type);
                return (
                  <motion.div
                    key={boost.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl"
                  >
                    <div className={`p-2 rounded-xl ${
                      boost.boost_type === 'featured' ? 'bg-amber-100 text-amber-600' : 'bg-pastel-mint text-teal-600'
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-slate-800 truncate">{boost.product_name}</h4>
                      <div className="flex items-center gap-4 text-sm text-slate-500 mt-1">
                        <span className="capitalize">{boost.boost_type}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {boost.days_remaining} hari lagi
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-3 text-sm text-slate-500">
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {boost.impressions}
                        </span>
                        <span className="flex items-center gap-1">
                          <MousePointer className="w-3 h-3" />
                          {boost.clicks}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Tamat: {new Date(boost.end_date).toLocaleDateString('ms-MY')}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Eligible Products */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Produk Boleh Di-Boost</h2>
          
          {myProducts.length === 0 ? (
            <div className="text-center py-8">
              <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">Tiada produk yang diluluskan</p>
              <button
                onClick={() => navigate('/vendor/products/new')}
                className="mt-4 px-6 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors"
              >
                Tambah Produk
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myProducts.map((product, index) => {
                const hasActiveBoost = myBoosts.some(b => b.product_id === product.id);
                return (
                  <motion.div
                    key={product.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`border rounded-xl p-4 ${hasActiveBoost ? 'border-teal-300 bg-pastel-mint/50' : 'border-slate-200'}`}
                  >
                    <div className="flex gap-3">
                      <div className="w-16 h-16 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                        <img
                          src={product.images?.[0] || 'https://via.placeholder.com/64'}
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-slate-800 truncate">{product.name}</h4>
                        <p className="text-sm text-slate-500">RM {product.price}</p>
                        {hasActiveBoost && (
                          <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-pastel-mint text-teal-700 text-xs rounded-full">
                            <Zap className="w-3 h-3" />
                            Aktif
                          </span>
                        )}
                      </div>
                    </div>
                    {!hasActiveBoost && (
                      <button
                        onClick={() => {
                          setSelectedProduct(product);
                          setShowBoostModal(true);
                        }}
                        className="w-full mt-3 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors"
                      >
                        Boost Produk
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Boost Modal */}
      <AnimatePresence>
        {showBoostModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen z-50"
            onClick={() => setShowBoostModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 space-y-5">
                <h2 className="text-xl font-bold text-slate-800">Boost Produk</h2>

                {/* Step 1: Select Product */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">1. Pilih Produk</label>
                  <select
                    value={selectedProduct?.id || ''}
                    onChange={(e) => {
                      const product = myProducts.find(p => p.id === e.target.value);
                      setSelectedProduct(product);
                    }}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">-- Pilih Produk --</option>
                    {myProducts.map(product => (
                      <option key={product.id} value={product.id}>
                        {product.name} - RM {product.price}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Step 2: Select Boost Type */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">2. Pilih Jenis Boost</label>
                  <div className="grid grid-cols-2 gap-3">
                    {boostPackages.map(pkg => {
                      const Icon = pkg.type === 'featured' ? Star : Zap;
                      const isSelected = selectedBoostType === pkg.type;
                      return (
                        <button
                          key={pkg.type}
                          onClick={() => {
                            setSelectedBoostType(pkg.type);
                            setSelectedDuration(null);
                          }}
                          className={`p-4 border rounded-xl text-left transition-all ${
                            isSelected 
                              ? 'border-teal-500 bg-pastel-mint/50 ring-2 ring-teal-500' 
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <Icon className={`w-6 h-6 ${isSelected ? 'text-teal-600' : 'text-slate-400'}`} />
                          <p className="font-medium text-slate-800 mt-2">{pkg.name}</p>
                          <p className="text-xs text-slate-500 mt-1">{pkg.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Step 3: Select Duration */}
                {selectedBoostType && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">3. Pilih Tempoh</label>
                    <div className="space-y-2">
                      {boostPackages.find(p => p.type === selectedBoostType)?.prices?.map((price, i) => {
                        const isSelected = selectedDuration?.days === price.days;
                        return (
                          <button
                            key={i}
                            onClick={() => setSelectedDuration(price)}
                            className={`w-full p-3 border rounded-xl flex items-center justify-between transition-all ${
                              isSelected 
                                ? 'border-teal-500 bg-pastel-mint/50' 
                                : 'border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {isSelected && <CheckCircle className="w-5 h-5 text-teal-600" />}
                              <span className="font-medium text-slate-800">{price.label}</span>
                            </div>
                            <span className="font-bold text-teal-600">RM {price.price}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Summary */}
                {selectedProduct && selectedBoostType && selectedDuration && (
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <p className="text-sm text-slate-500 mb-2">Ringkasan:</p>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-slate-800">{selectedProduct.name}</p>
                        <p className="text-sm text-slate-500">
                          {selectedBoostType === 'featured' ? 'Produk Pilihan' : 'Boost'} · {selectedDuration.label}
                        </p>
                      </div>
                      <p className="text-xl font-bold text-teal-600">RM {selectedDuration.price}</p>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => {
                      setShowBoostModal(false);
                      setSelectedProduct(null);
                      setSelectedBoostType(null);
                      setSelectedDuration(null);
                    }}
                    className="flex-1 py-3 border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors"
                    disabled={boosting}
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleBoost}
                    className="flex-1 py-3 bg-teal-600 text-white font-medium rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-50"
                    disabled={boosting || !selectedProduct || !selectedBoostType || !selectedDuration}
                  >
                    {boosting ? 'Memproses...' : `Bayar RM ${selectedDuration?.price || 0}`}
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
