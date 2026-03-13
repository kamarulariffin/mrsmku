import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { 
  ShoppingCart, Trash2, CreditCard, AlertCircle, Check, 
  Bus, Package, Heart, Wallet, ChevronRight, X
} from 'lucide-react';
import { useAuth } from '../../App';
import api from '../../services/api';
import { Spinner, Card, Button, Badge } from '../../components/common';

// Unified Cart Context
const PaymentCenterPage = () => {
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [cartItems, setCartItems] = useState([]);
  const [pendingFees, setPendingFees] = useState([]);
  const [selectedFees, setSelectedFees] = useState([]);
  const authContext = useAuth();
  const user = authContext?.user;
  const navigate = useNavigate();

  useEffect(() => {
    fetchAllItems();
  }, []);

  const fetchAllItems = async () => {
    try {
      const [cartRes, feesRes] = await Promise.all([
        api.get('/api/koperasi/cart').catch(() => ({ data: { items: [] } })),
        api.get('/api/parent/children-fees').catch(() => ({ data: [] }))
      ]);
      
      setCartItems(cartRes.data.items || []);
      
      // Filter only pending fees
      const allFees = [];
      (feesRes.data || []).forEach(child => {
        (child.fees || []).forEach(fee => {
          if (fee.status !== 'paid') {
            allFees.push({
              ...fee,
              child_name: child.full_name,
              child_matric: child.matric_number
            });
          }
        });
      });
      setPendingFees(allFees);
    } catch (err) {
      console.error('Failed to fetch cart data');
    } finally {
      setLoading(false);
    }
  };

  const toggleFeeSelection = (feeId) => {
    setSelectedFees(prev => 
      prev.includes(feeId) 
        ? prev.filter(id => id !== feeId) 
        : [...prev, feeId]
    );
  };

  const selectAllFees = () => {
    if (selectedFees.length === pendingFees.length) {
      setSelectedFees([]);
    } else {
      setSelectedFees(pendingFees.map(f => f.id));
    }
  };

  const removeFromCart = async (itemId) => {
    try {
      await api.delete(`/api/koperasi/cart/${itemId}`);
      setCartItems(prev => prev.filter(item => item.id !== itemId));
      toast.success('Item dibuang dari troli');
    } catch (err) {
      toast.error('Gagal membuang item');
    }
  };

  // Calculate totals
  const koopTotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const feesTotal = pendingFees
    .filter(f => selectedFees.includes(f.id))
    .reduce((sum, fee) => sum + (fee.amount - (fee.paid || 0)), 0);
  const grandTotal = koopTotal + feesTotal;

  const handleCheckout = async () => {
    if (grandTotal === 0) {
      toast.error('Tiada item untuk dibayar');
      return;
    }

    setProcessing(true);
    try {
      // Process koperasi items if any
      if (cartItems.length > 0) {
        await api.post('/api/koperasi/checkout', {
          payment_method: 'fpx_mock'
        });
      }

      // Process selected fees if any
      for (const feeId of selectedFees) {
        const fee = pendingFees.find(f => f.id === feeId);
        if (fee) {
          await api.post('/api/payments', {
            fee_id: feeId,
            amount: fee.amount - (fee.paid || 0),
            payment_method: 'fpx_mock'
          });
        }
      }

      toast.success('Pembayaran berjaya!');
      
      // Refresh data
      await fetchAllItems();
      setSelectedFees([]);
      
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Pembayaran gagal');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;

  const hasItems = cartItems.length > 0 || selectedFees.length > 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6" data-testid="payment-center">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 font-heading flex items-center gap-3">
            <ShoppingCart className="text-teal-600" size={28} />
            Pusat Pembayaran
          </h1>
          <p className="text-slate-600 mt-1">Bayar semua yuran dan pembelian di satu tempat</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Cart Items Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Koperasi Items */}
          <Card>
            <div className="flex items-center gap-3 mb-4 pb-4 border-b">
              <div className="w-10 h-10 bg-lime-100 rounded-lg flex items-center justify-center">
                <Package className="text-lime-600" size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Troli Koperasi</h3>
                <p className="text-sm text-slate-500">{cartItems.length} item</p>
              </div>
            </div>

            {cartItems.length === 0 ? (
              <div className="text-center py-6 text-slate-500">
                <Package className="mx-auto text-slate-300 mb-2" size={40} />
                <p>Tiada item dalam troli</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-3"
                  onClick={() => navigate('/koperasi')}
                >
                  Beli di Koperasi
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {cartItems.map(item => (
                  <div key={item.id} className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
                    <div className="w-16 h-16 bg-white rounded-lg border overflow-hidden">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                          <Package size={24} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-slate-900 truncate">{item.name}</h4>
                      <p className="text-sm text-slate-500">
                        RM {item.price.toFixed(2)} x {item.quantity}
                        {item.size && <span className="ml-2 text-xs bg-slate-200 px-2 py-0.5 rounded">Saiz: {item.size}</span>}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">RM {(item.price * item.quantity).toFixed(2)}</p>
                      <button 
                        onClick={() => removeFromCart(item.id)}
                        className="text-red-500 hover:text-red-700 text-sm flex items-center gap-1 mt-1"
                      >
                        <Trash2 size={14} /> Buang
                      </button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between pt-3 border-t font-semibold">
                  <span>Jumlah Koperasi:</span>
                  <span className="text-lime-600">RM {koopTotal.toFixed(2)}</span>
                </div>
              </div>
            )}
          </Card>

          {/* Pending Fees */}
          <Card>
            <div className="flex items-center justify-between mb-4 pb-4 border-b">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                  <Wallet className="text-amber-600" size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">Yuran Tertunggak</h3>
                  <p className="text-sm text-slate-500">{pendingFees.length} yuran</p>
                </div>
              </div>
              {pendingFees.length > 0 && (
                <Button variant="ghost" size="sm" onClick={selectAllFees}>
                  {selectedFees.length === pendingFees.length ? 'Nyahpilih Semua' : 'Pilih Semua'}
                </Button>
              )}
            </div>

            {pendingFees.length === 0 ? (
              <div className="text-center py-6 text-slate-500">
                <Check className="mx-auto text-emerald-400 mb-2" size={40} />
                <p>Tiada yuran tertunggak!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingFees.map(fee => {
                  const remaining = fee.amount - (fee.paid || 0);
                  const isSelected = selectedFees.includes(fee.id);
                  return (
                    <div 
                      key={fee.id} 
                      onClick={() => toggleFeeSelection(fee.id)}
                      className={`flex items-center gap-4 p-3 rounded-lg cursor-pointer transition-all border-2 ${isSelected ? 'bg-amber-50 border-amber-300' : 'bg-slate-50 border-transparent hover:border-slate-200'}`}
                    >
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${isSelected ? 'bg-amber-500 border-amber-500 text-white' : 'border-slate-300'}`}>
                        {isSelected && <Check size={14} />}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-slate-900">{fee.description || fee.category}</h4>
                        <p className="text-sm text-slate-500">{fee.child_name} ({fee.child_matric})</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-amber-600">RM {remaining.toFixed(2)}</p>
                        {fee.paid > 0 && <p className="text-xs text-slate-400">Sudah bayar: RM {fee.paid.toFixed(2)}</p>}
                      </div>
                    </div>
                  );
                })}
                {selectedFees.length > 0 && (
                  <div className="flex justify-between pt-3 border-t font-semibold">
                    <span>Jumlah Yuran Dipilih:</span>
                    <span className="text-amber-600">RM {feesTotal.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* Checkout Summary Column */}
        <div className="lg:col-span-1">
          <div className="sticky top-4">
            <Card className="bg-gradient-to-br from-pastel-mint to-pastel-lavender border-pastel-lilac">
              <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <CreditCard className="text-teal-600" size={20} />
                Ringkasan Pembayaran
              </h3>

              <div className="space-y-3 text-sm">
                {koopTotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Koperasi ({cartItems.length} item)</span>
                    <span className="font-medium">RM {koopTotal.toFixed(2)}</span>
                  </div>
                )}
                {feesTotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Yuran ({selectedFees.length} dipilih)</span>
                    <span className="font-medium">RM {feesTotal.toFixed(2)}</span>
                  </div>
                )}
                {grandTotal === 0 && (
                  <p className="text-slate-500 text-center py-4">Tiada item dipilih</p>
                )}
              </div>

              <div className="border-t border-pastel-lilac mt-4 pt-4">
                <div className="flex justify-between text-lg font-bold">
                  <span>Jumlah Keseluruhan</span>
                  <span className="text-teal-600">RM {grandTotal.toFixed(2)}</span>
                </div>
              </div>

              <Button 
                className="w-full mt-4" 
                onClick={handleCheckout}
                disabled={!hasItems || processing}
                loading={processing}
                data-testid="checkout-btn"
              >
                <CreditCard size={18} />
                {processing ? 'Memproses...' : 'Bayar Sekarang'}
              </Button>

              {/* Payment Methods Info */}
              <div className="mt-4 p-3 bg-white/50 rounded-lg">
                <p className="text-xs text-slate-500 text-center">
                  Kaedah pembayaran: FPX Online Banking
                </p>
                <p className="text-xs text-amber-600 text-center mt-1 font-medium">
                  (SIMULASI - Pembayaran sebenar tidak diproses)
                </p>
              </div>
            </Card>

            {/* Quick Links */}
            <Card className="mt-4">
              <h4 className="font-medium text-slate-700 mb-3">Pautan Pantas</h4>
              <div className="space-y-2">
                <button 
                  onClick={() => navigate('/koperasi')}
                  className="w-full flex items-center gap-3 p-2 text-left hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <Package className="text-lime-500" size={18} />
                  <span className="text-sm">Beli di Koperasi</span>
                  <ChevronRight className="ml-auto text-slate-400" size={16} />
                </button>
                <button 
                  onClick={() => navigate('/bus-tickets')}
                  className="w-full flex items-center gap-3 p-2 text-left hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <Bus className="text-cyan-500" size={18} />
                  <span className="text-sm">Tempah Tiket Bas</span>
                  <ChevronRight className="ml-auto text-slate-400" size={16} />
                </button>
                <button 
                  onClick={() => navigate('/tabung')}
                  className="w-full flex items-center gap-3 p-2 text-left hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <Heart className="text-pink-500" size={18} />
                  <span className="text-sm">Tabung &amp; Sumbangan</span>
                  <ChevronRight className="ml-auto text-slate-400" size={16} />
                </button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentCenterPage;
