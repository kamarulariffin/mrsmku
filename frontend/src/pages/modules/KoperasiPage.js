import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ShoppingCart, Package, ChevronDown, ShoppingBag, Plus, Minus, X,
  Sparkles, Star, Zap, Gift, Check, ArrowRight,
  Truck, Shield, Clock, Box, Store, AlertCircle, PackageCheck, Ruler,
  ChevronLeft, ChevronRight, ZoomIn, Image as ImageIcon
} from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../App';
import { ProductGallery } from '../../components/ProductImageUpload';
import { useCart } from '../../context/CartContext';

// Size Selection Modal Component
const SizeSelectionModal = ({ 
  isOpen, 
  onClose, 
  kit, 
  productsRequiringSizes, 
  onConfirm,
  isSubmitting
}) => {
  const [sizeSelections, setSizeSelections] = useState({});
  
  // Reset selections when modal opens with new products
  useEffect(() => {
    if (isOpen && productsRequiringSizes) {
      const initial = {};
      productsRequiringSizes.forEach(p => {
        initial[p.id] = '';
      });
      setSizeSelections(initial);
    }
  }, [isOpen, productsRequiringSizes]);
  
  const handleSizeSelect = (productId, size) => {
    setSizeSelections(prev => ({
      ...prev,
      [productId]: size
    }));
  };
  
  const allSizesSelected = productsRequiringSizes?.every(p => sizeSelections[p.id]);
  
  const handleConfirm = () => {
    const selections = Object.entries(sizeSelections).map(([productId, size]) => ({
      product_id: productId,
      size: size
    }));
    onConfirm(selections);
  };
  
  // Get size label based on type
  const getSizeLabel = (sizeType) => {
    if (sizeType === 'shoes') return 'Saiz Kasut';
    return 'Saiz Pakaian';
  };
  
  if (!isOpen) return null;
  
  return (
    <>
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }} 
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[70]" 
        onClick={onClose} 
      />
      
      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="fixed inset-x-4 top-[10%] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-lg bg-white rounded-3xl shadow-2xl z-[75] max-h-[80vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="p-6 border-b border-pastel-lilac bg-gradient-to-r from-pastel-lavender to-pastel-rose">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl flex items-center justify-center shadow-lg">
                <Ruler className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Pilih Saiz</h3>
                <p className="text-violet-500 text-sm">{kit?.name}</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-pastel-lavender rounded-xl transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {productsRequiringSizes?.map((product, idx) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="bg-slate-50 rounded-2xl p-4"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-pastel-lavender to-pastel-rose rounded-xl flex items-center justify-center">
                  <Package className="w-5 h-5 text-violet-500" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-800">{product.name}</h4>
                  <p className="text-xs text-violet-400">{getSizeLabel(product.size_type)}</p>
                </div>
              </div>
              
              {/* Size Grid */}
              <div className="grid grid-cols-4 gap-2">
                {product.sizes_stock?.map((sizeInfo) => {
                  const isSelected = sizeSelections[product.id] === sizeInfo.size;
                  const isOutOfStock = sizeInfo.stock <= 0;
                  
                  return (
                    <button
                      key={sizeInfo.size}
                      onClick={() => !isOutOfStock && handleSizeSelect(product.id, sizeInfo.size)}
                      disabled={isOutOfStock}
                      className={`relative py-3 px-2 rounded-xl text-sm font-bold transition-all ${
                        isOutOfStock 
                          ? 'bg-slate-100 text-slate-300 cursor-not-allowed' 
                          : isSelected
                            ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-pastel scale-105'
                            : 'bg-white border-2 border-pastel-lilac text-slate-700 hover:border-violet-300 hover:bg-pastel-mint/50'
                      }`}
                      data-testid={`size-btn-${product.id}-${sizeInfo.size}`}
                    >
                      <span className="block">{sizeInfo.size}</span>
                      <span className={`text-xs ${isSelected ? 'text-violet-100' : isOutOfStock ? 'text-slate-300' : 'text-violet-400'}`}>
                        {isOutOfStock ? 'Habis' : `(${sizeInfo.stock})`}
                      </span>
                      {isSelected && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-400 rounded-full flex items-center justify-center"
                        >
                          <Check className="w-3 h-3 text-white" />
                        </motion.div>
                      )}
                    </button>
                  );
                })}
              </div>
              
              {/* Selected size indicator */}
              {sizeSelections[product.id] && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-3 px-3 py-2 bg-pastel-lavender rounded-lg"
                >
                  <p className="text-sm text-violet-700">
                    Saiz dipilih: <span className="font-bold">{sizeSelections[product.id]}</span>
                  </p>
                </motion.div>
              )}
            </motion.div>
          ))}
        </div>
        
        {/* Footer */}
        <div className="p-6 border-t border-pastel-lilac bg-white">
          <motion.button
            whileHover={{ scale: allSizesSelected ? 1.02 : 1 }}
            whileTap={{ scale: allSizesSelected ? 0.98 : 1 }}
            onClick={handleConfirm}
            disabled={!allSizesSelected || isSubmitting}
            className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all ${
              allSizesSelected && !isSubmitting
                ? 'bg-gradient-to-r from-violet-500 via-fuchsia-500 to-rose-500 text-white shadow-lg shadow-pastel hover:shadow-xl'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
            data-testid="confirm-sizes-btn"
          >
            {isSubmitting ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Menambah ke Troli...
              </>
            ) : (
              <>
                <ShoppingCart className="w-5 h-5" />
                {allSizesSelected ? 'Tambah ke Troli' : 'Sila pilih semua saiz'}
              </>
            )}
          </motion.button>
          
          {/* Info text */}
          <p className="text-center text-xs text-slate-400 mt-3">
            Pastikan saiz yang dipilih sesuai untuk anak anda
          </p>
        </div>
      </motion.div>
    </>
  );
};

const KoperasiPage = () => {
  const authContext = useAuth();
  const user = authContext?.user;
  const navigate = useNavigate();
  
  // Central troli (payment-center) - satu troli untuk semua modul
  const { cart: globalCart, fetchCart: fetchGlobalCart, removeFromCart: removeFromCentralCart, updateQuantity: updateCentralCartQuantity } = useCart();
  // Koperasi view: items from central cart for this student only
  const cart = {
    items: (globalCart?.items || []).filter((i) => i.item_type === 'koperasi' && (i.metadata?.student_id || '') === selectedChild),
    total_amount: 0
  };
  cart.total_amount = cart.items.reduce((sum, i) => sum + (i.amount || 0) * (i.quantity || 1), 0);
  
  const [kits, setKits] = useState([]);
  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCart, setShowCart] = useState(false);
  const [selectedKit, setSelectedKit] = useState(null);
  const [expandedKit, setExpandedKit] = useState(null);
  const [addingKit, setAddingKit] = useState(null);
  
  // Size selection modal state
  const [showSizeModal, setShowSizeModal] = useState(false);
  const [sizeModalKit, setSizeModalKit] = useState(null);
  const [productsRequiringSizes, setProductsRequiringSizes] = useState([]);
  const [isSubmittingSizes, setIsSubmittingSizes] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedChild) fetchGlobalCart();
  }, [selectedChild, fetchGlobalCart]);

  const fetchData = async () => {
    try {
      const [kitsRes, childrenRes] = await Promise.all([
        api.get('/api/koperasi/kits'),
        api.get('/api/students')
      ]);
      setKits(kitsRes.data);
      setChildren(childrenRes.data);
      if (childrenRes.data.length > 0) {
        setSelectedChild(childrenRes.data[0].id);
      }
    } catch (err) {
      toast.error('Gagal memuatkan data');
    } finally {
      setLoading(false);
    }
  };

  // Add entire kit to central troli (payment-center)
  const addKitToCart = async (kitId, kitName, kitData) => {
    if (!selectedChild) {
      toast.error('Sila pilih anak terlebih dahulu');
      return;
    }
    setAddingKit(kitId);
    try {
      const res = await api.post(`/api/payment-center/cart/add-koperasi-kit?kit_id=${kitId}&student_id=${selectedChild}`);
      if (res.data.requires_size_selection) {
        setSizeModalKit({ id: kitId, name: kitName, ...kitData });
        setProductsRequiringSizes(res.data.products_requiring_sizes || []);
        setShowSizeModal(true);
      } else {
        toast.success(`Kit "${kitName}" ditambah ke troli!`);
        fetchGlobalCart();
        const kitRes = await api.get(`/api/koperasi/kits/${kitId}`);
        setSelectedKit(kitRes.data);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menambah kit ke troli');
    } finally {
      setAddingKit(null);
    }
  };

  const handleConfirmSizes = async (sizeSelections) => {
    if (!sizeModalKit) return;
    setIsSubmittingSizes(true);
    try {
      await api.post('/api/payment-center/cart/add-koperasi-kit-with-sizes', {
        kit_id: sizeModalKit.id,
        student_id: selectedChild,
        size_selections: sizeSelections
      });
      toast.success(`Kit "${sizeModalKit.name}" ditambah ke troli!`);
      setShowSizeModal(false);
      setSizeModalKit(null);
      setProductsRequiringSizes([]);
      fetchGlobalCart();
      const kitRes = await api.get(`/api/koperasi/kits/${sizeModalKit.id}`);
      setSelectedKit(kitRes.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menambah kit ke troli');
    } finally {
      setIsSubmittingSizes(false);
    }
  };

  const updateCartItem = async (cartItemId, quantity) => {
    try {
      await updateCentralCartQuantity(cartItemId, quantity);
      fetchGlobalCart();
    } catch (err) {
      toast.error('Gagal mengemaskini troli');
    }
  };

  const removeFromCart = async (cartItemId) => {
    try {
      await removeFromCentralCart(cartItemId);
      toast.success('Item dibuang dari troli');
      fetchGlobalCart();
    } catch (err) {
      toast.error('Gagal membuang item');
    }
  };

  const checkout = async () => {
    // Navigate to centralized payment center with cart tab active
    navigate('/payment-center?tab=troli');
  };

  // Get stock for a product
  const getProductStock = (product) => {
    if (product.has_sizes) {
      const totalStock = product.sizes_stock?.reduce((acc, s) => acc + (s.stock || 0), 0) || 0;
      return totalStock;
    }
    return product.total_stock || 0;
  };

  // Get stock status color
  const getStockStatusColor = (stock) => {
    if (stock <= 0) return 'text-red-500 bg-red-50';
    if (stock <= 10) return 'text-amber-600 bg-amber-50';
    return 'text-emerald-600 bg-emerald-50';
  };

  // Check if kit has stock available
  const isKitAvailable = (kit) => {
    if (!selectedKit || selectedKit.id !== kit.id) return true;
    return selectedKit.products?.every(p => getProductStock(p) > 0);
  };

  const selectedChildName = children.find(c => c.id === selectedChild)?.full_name || '';

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 via-pastel-lavender to-pastel-sky">
      <div className="text-center">
        <div className="relative">
          <div className="w-20 h-20 border-4 border-pastel-lilac border-t-violet-500 rounded-full animate-spin mx-auto"></div>
          <Store className="absolute inset-0 m-auto w-8 h-8 text-violet-500" />
        </div>
        <p className="mt-4 text-violet-600 font-medium">Memuatkan Kedai...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pastel-lavender to-pastel-sky min-w-0 overflow-x-hidden" data-testid="koperasi-page">
      {/* Decorative Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-pink-200/40 to-pastel-lavender/40 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-br from-cyan-200/40 to-blue-200/40 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-br from-violet-200/30 to-fuchsia-200/30 rounded-full blur-3xl"></div>
      </div>

      {/* Header */}
      <header className="relative z-40 border-b border-pastel-lilac/50">
        <div className="bg-white/70 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              {/* Logo & Title */}
              <div className="flex items-center gap-4">
                <motion.div 
                  initial={{ rotate: -10, scale: 0.9 }}
                  animate={{ rotate: 0, scale: 1 }}
                  className="relative"
                >
                  <div className="w-14 h-14 bg-gradient-to-br from-violet-400 via-fuchsia-400 to-rose-400 rounded-2xl flex items-center justify-center shadow-lg shadow-pastel">
                    <Store className="text-white w-7 h-7" />
                  </div>
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-br from-amber-300 to-orange-400 rounded-full flex items-center justify-center">
                    <Sparkles className="w-3 h-3 text-white" />
                  </div>
                </motion.div>
                <div>
                  <h1 className="text-xl font-black text-slate-800 tracking-tight">Koperasi MRSMKU</h1>
                  <p className="text-violet-500 text-sm flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    Kelengkapan Sekolah
                  </p>
                </div>
              </div>

              {/* Right Section */}
              <div className="flex items-center gap-3">
                {/* Child Selector */}
                <div className="relative">
                  <select 
                    value={selectedChild} 
                    onChange={(e) => setSelectedChild(e.target.value)}
                    className="appearance-none px-5 py-2.5 pr-10 rounded-xl bg-white border border-pastel-lilac text-slate-700 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-300 cursor-pointer"
                    data-testid="child-selector"
                  >
                    {children.map(child => (
                      <option key={child.id} value={child.id}>{child.full_name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-violet-400 pointer-events-none" />
                </div>
                
                {/* Cart Button */}
                <motion.button 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowCart(true)}
                  className="relative group px-5 py-2.5 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-rose-500 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-pastel hover:shadow-xl hover:shadow-pastel-lg transition-all overflow-hidden"
                  data-testid="cart-button"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700"></div>
                  <ShoppingCart className="w-5 h-5" />
                  <span>Troli</span>
                  {cart.items?.length > 0 && (
                    <motion.span 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-br from-amber-400 to-orange-500 text-white text-xs rounded-full flex items-center justify-center font-bold shadow-lg"
                    >
                      {cart.items.length}
                    </motion.span>
                  )}
                </motion.button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-4 py-8">
        {/* Hero Section */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-pastel-lavender to-pastel-rose border border-pastel-lilac rounded-full text-violet-600 text-sm font-medium mb-6"
          >
            <Gift className="w-4 h-4" />
            <span>Koleksi Terkini 2026</span>
            <Sparkles className="w-4 h-4 text-amber-500" />
          </motion.div>
          
          <h2 className="text-4xl md:text-5xl font-black text-slate-800 mb-4">
            Kit Kelengkapan{' '}
            <span className="bg-gradient-to-r from-violet-500 via-fuchsia-500 to-rose-500 bg-clip-text text-transparent">
              Sekolah
            </span>
          </h2>
          
          <p className="text-slate-600 text-lg max-w-2xl mx-auto">
            Pilih kit lengkap untuk{' '}
            <span className="font-bold text-violet-600 bg-pastel-lavender px-3 py-1 rounded-lg">
              {selectedChildName}
            </span>
          </p>

          {/* Quick Stats */}
          <div className="flex justify-center gap-4 mt-8 flex-wrap">
            {[
              { icon: Package, label: 'Kit Tersedia', value: kits.length, color: 'violet' },
              { icon: Truck, label: 'Penghantaran', value: 'Percuma', color: 'pink' },
              { icon: Shield, label: 'Jaminan', value: '100%', color: 'cyan' },
            ].map((stat, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + idx * 0.1 }}
                className="flex items-center gap-2 px-4 py-2.5 bg-white/80 backdrop-blur border border-pastel-lilac rounded-xl shadow-sm"
              >
                <stat.icon className="w-4 h-4 text-violet-500" />
                <span className="text-slate-800 font-bold">{stat.value}</span>
                <span className="text-slate-500 text-sm">{stat.label}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Kits Grid */}
        {kits.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-pastel-lavender to-pastel-rose rounded-3xl flex items-center justify-center">
              <Package className="w-12 h-12 text-violet-400" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Tiada Kit Tersedia</h3>
            <p className="text-slate-500">Kit baru akan ditambah tidak lama lagi</p>
          </motion.div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {kits.map((kit, idx) => {
              const isExpanded = expandedKit === kit.id;
              const kitAvailable = !selectedKit || selectedKit.id !== kit.id || isKitAvailable(kit);
              
              return (
                <motion.div
                  key={kit.id}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  layout
                  className={`group relative bg-white/80 backdrop-blur-xl rounded-3xl border overflow-hidden transition-all duration-500 shadow-lg ${
                    isExpanded 
                      ? 'border-violet-300 shadow-xl shadow-pastel md:col-span-2' 
                      : 'border-pastel-lilac hover:border-pastel-lilac hover:shadow-xl hover:shadow-pastel'
                  }`}
                  data-testid={`kit-card-${kit.id}`}
                >
                  {/* Kit Header */}
                  <div className="relative">
                    <div className="flex flex-col md:flex-row">
                      {/* Kit Image */}
                      <div className="md:w-56 flex-shrink-0 relative overflow-hidden">
                        {kit.image_url ? (
                          <img src={kit.image_url} alt={kit.name} className="w-full h-48 md:h-full object-cover" />
                        ) : (
                          <div className="w-full h-48 md:h-full min-h-[200px] bg-gradient-to-br from-pastel-lavender via-pastel-rose to-pastel-rose flex items-center justify-center">
                            <Box className="w-16 h-16 text-violet-300" />
                          </div>
                        )}
                        {/* Badge */}
                        <div className="absolute top-3 left-3">
                          <span className="px-3 py-1 bg-gradient-to-r from-amber-400 to-orange-400 text-white text-xs font-bold rounded-full flex items-center gap-1 shadow-lg">
                            <Star className="w-3 h-3" />
                            Popular
                          </span>
                        </div>
                      </div>
                      
                      {/* Kit Info */}
                      <div className="flex-1 p-6">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="text-xl font-bold text-slate-800 mb-2 group-hover:text-violet-600 transition-colors">
                              {kit.name}
                            </h3>
                            <p className="text-slate-500 text-sm line-clamp-2">{kit.description}</p>
                            
                            {/* Features */}
                            <div className="flex flex-wrap gap-2 mt-4">
                              <span className="px-2.5 py-1 bg-pastel-mint/50 text-violet-600 text-xs rounded-lg flex items-center gap-1 font-medium">
                                <Package className="w-3 h-3" />
                                {kit.product_count} item
                              </span>
                              <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 text-xs rounded-lg flex items-center gap-1 font-medium">
                                <Check className="w-3 h-3" />
                                Lengkap
                              </span>
                              <span className="px-2.5 py-1 bg-pink-50 text-pink-600 text-xs rounded-lg flex items-center gap-1 font-medium">
                                <Truck className="w-3 h-3" />
                                Free Delivery
                              </span>
                            </div>
                            
                            {/* Click hint - only show when not expanded */}
                            {!isExpanded && (
                              <p className="mt-3 text-xs text-violet-400 italic flex items-center gap-1">
                                <ChevronDown className="w-3 h-3" />
                                Klik untuk lihat senarai barangan
                              </p>
                            )}
                          </div>
                          
                          {/* Expand Button */}
                          <button
                            onClick={async () => {
                              if (isExpanded) {
                                setExpandedKit(null);
                                setSelectedKit(null);
                              } else {
                                setExpandedKit(kit.id);
                                try {
                                  const res = await api.get(`/api/koperasi/kits/${kit.id}`);
                                  setSelectedKit(res.data);
                                } catch (err) {
                                  toast.error('Gagal memuatkan kit');
                                }
                              }
                            }}
                            className="p-2 bg-pastel-mint/50 rounded-xl ml-4 hover:bg-pastel-lavender transition-colors"
                          >
                            <motion.div animate={{ rotate: isExpanded ? 180 : 0 }}>
                              <ChevronDown className="w-5 h-5 text-violet-500" />
                            </motion.div>
                          </button>
                        </div>
                        
                        {/* Price & Add to Cart Button */}
                        <div className="flex items-center justify-between mt-6 pt-4 border-t border-pastel-lilac">
                          <div>
                            <p className="text-violet-400 text-sm">Harga Kit</p>
                            <p className="text-3xl font-black text-slate-800">
                              RM <span className="bg-gradient-to-r from-violet-500 to-fuchsia-500 bg-clip-text text-transparent">{kit.total_price?.toFixed(2)}</span>
                            </p>
                          </div>
                          
                          {/* ADD TO CART BUTTON - On Kit Level */}
                          <motion.button 
                            whileHover={{ scale: kitAvailable ? 1.05 : 1 }}
                            whileTap={{ scale: kitAvailable ? 0.95 : 1 }}
                            onClick={() => addKitToCart(kit.id, kit.name, kit)}
                            disabled={addingKit === kit.id || !kitAvailable}
                            className={`px-6 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg ${
                              !kitAvailable
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                                : 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white hover:shadow-xl hover:shadow-pastel'
                            }`}
                            data-testid={`add-kit-to-cart-${kit.id}`}
                          >
                            {addingKit === kit.id ? (
                              <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                Menambah...
                              </>
                            ) : !kitAvailable ? (
                              <>
                                <AlertCircle className="w-4 h-4" />
                                Stok Habis
                              </>
                            ) : (
                              <>
                                <ShoppingCart className="w-4 h-4" />
                                Tambah ke Troli
                              </>
                            )}
                          </motion.button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Products - View Only */}
                  <AnimatePresence>
                    {isExpanded && selectedKit && selectedKit.id === kit.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.4, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-pastel-lilac bg-gradient-to-b from-pastel-mint/30 to-white p-6">
                          <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <ShoppingBag className="w-5 h-5 text-violet-500" />
                            Kandungan Kit
                            <span className="ml-auto text-sm text-violet-500 font-normal">
                              {selectedKit.products?.length} item
                            </span>
                          </h4>
                          
                          {selectedKit.products?.length > 0 ? (
                            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                              {selectedKit.products.map(product => {
                                const stock = getProductStock(product);
                                const stockColor = getStockStatusColor(stock);
                                const isOutOfStock = stock <= 0;
                                
                                return (
                                  <motion.div 
                                    key={product.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className={`p-3 bg-white rounded-xl border transition-all ${
                                      isOutOfStock 
                                        ? 'border-red-200 opacity-60' 
                                        : 'border-pastel-lilac'
                                    }`}
                                  >
                                    <div className="flex items-center gap-3">
                                      {/* Product Image - Support multiple images */}
                                      {(product.images && product.images.length > 0) ? (
                                        <div className="relative w-12 h-12 flex-shrink-0">
                                          <img 
                                            src={`${process.env.REACT_APP_BACKEND_URL}${product.images[0].url}`} 
                                            alt={product.name} 
                                            className="w-12 h-12 object-cover rounded-lg"
                                          />
                                          {product.images.length > 1 && (
                                            <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-pastel-mint/500 text-white text-xs rounded-full flex items-center justify-center">
                                              +{product.images.length - 1}
                                            </span>
                                          )}
                                        </div>
                                      ) : product.image_url ? (
                                        <img src={product.image_url} alt={product.name} className="w-12 h-12 object-cover rounded-lg" />
                                      ) : (
                                        <div className="w-12 h-12 bg-gradient-to-br from-pastel-lavender to-pastel-rose rounded-lg flex items-center justify-center flex-shrink-0">
                                          <Package className="w-5 h-5 text-violet-400" />
                                        </div>
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <h5 className="font-semibold text-slate-800 text-sm truncate">{product.name}</h5>
                                        <div className="flex items-center gap-2 mt-1">
                                          <span className="text-violet-600 font-bold text-sm">RM {product.price?.toFixed(2)}</span>
                                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${stockColor}`}>
                                            {isOutOfStock ? (
                                              <>
                                                <AlertCircle className="w-2.5 h-2.5" />
                                                Habis
                                              </>
                                            ) : (
                                              <>
                                                <PackageCheck className="w-2.5 h-2.5" />
                                                {stock}
                                              </>
                                            )}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                    
                                    {/* Size Display for products with sizes */}
                                    {product.has_sizes && product.sizes_stock && product.sizes_stock.length > 0 && (
                                      <div className="mt-3 pt-3 border-t border-pastel-lilac/50">
                                        <p className="text-xs text-slate-500 mb-2">Saiz Tersedia:</p>
                                        <div className="flex flex-wrap gap-1.5">
                                          {product.sizes_stock.map((sizeInfo, idx) => (
                                            <span 
                                              key={idx}
                                              className={`px-2 py-1 rounded-md text-xs font-medium ${
                                                sizeInfo.stock > 0 
                                                  ? 'bg-pastel-mint/50 text-violet-700 border border-pastel-lilac' 
                                                  : 'bg-slate-100 text-slate-400 line-through'
                                              }`}
                                            >
                                              {sizeInfo.size}
                                              {sizeInfo.stock > 0 && (
                                                <span className="ml-1 text-violet-400">({sizeInfo.stock})</span>
                                              )}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </motion.div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-slate-500 text-center py-8">Tiada produk dalam kit ini</p>
                          )}
                          
                          {/* Kit Total Summary */}
                          <div className="mt-6 pt-4 border-t border-pastel-lilac flex flex-col sm:flex-row justify-between items-center gap-4">
                            <div>
                              <p className="text-slate-500 text-sm">Jumlah Kit ({selectedKit.products?.length} item)</p>
                              <p className="text-2xl font-black text-slate-800">
                                RM <span className="bg-gradient-to-r from-violet-500 to-fuchsia-500 bg-clip-text text-transparent">{selectedKit.total_price?.toFixed(2)}</span>
                              </p>
                            </div>
                            
                            {/* Another Add to Cart Button */}
                            <motion.button 
                              whileHover={{ scale: kitAvailable ? 1.05 : 1 }}
                              whileTap={{ scale: kitAvailable ? 0.95 : 1 }}
                              onClick={() => addKitToCart(kit.id, kit.name, selectedKit)}
                              disabled={addingKit === kit.id || !kitAvailable}
                              className={`px-8 py-3 rounded-xl font-bold transition-all flex items-center gap-2 ${
                                !kitAvailable
                                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                  : 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-lg hover:shadow-xl hover:shadow-pastel'
                              }`}
                            >
                              {addingKit === kit.id ? (
                                <>
                                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                  Menambah...
                                </>
                              ) : (
                                <>
                                  <ShoppingCart className="w-5 h-5" />
                                  Tambah Kit ke Troli
                                </>
                              )}
                            </motion.button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>

      {/* Cart Sidebar */}
      <AnimatePresence>
        {showCart && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[55]" 
              onClick={() => setShowCart(false)} 
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-gradient-to-b from-white via-pastel-lavender/30 to-pastel-rose/30 shadow-2xl z-[60] flex flex-col"
              style={{ top: 0, marginTop: 0 }}
            >
              {/* Cart Header */}
              <div className="p-6 border-b border-pastel-lilac flex items-center justify-between bg-white/80 backdrop-blur">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-violet-400 to-fuchsia-400 rounded-xl flex items-center justify-center shadow-lg shadow-pastel">
                    <ShoppingCart className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">Troli Saya</h3>
                    <p className="text-violet-500 text-xs">{cart.items?.length || 0} item</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowCart(false)} 
                  className="p-2 hover:bg-pastel-mint/50 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              
              {/* Cart Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {cart.items?.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-pastel-lavender to-pastel-rose rounded-3xl flex items-center justify-center">
                      <ShoppingCart className="w-10 h-10 text-violet-300" />
                    </div>
                    <h4 className="text-lg font-bold text-slate-800 mb-2">Troli Kosong</h4>
                    <p className="text-slate-500 text-sm">Tambah kit untuk mula membeli</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="px-3 py-2 bg-pastel-mint/50 rounded-xl">
                      <p className="text-violet-600 text-sm">Untuk: <span className="font-semibold text-violet-700">{selectedChildName}</span></p>
                    </div>
                    {cart.items?.map((item, idx) => (
                      <motion.div 
                        key={item.cart_item_id || idx}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-pastel-lilac shadow-sm"
                      >
                        {(item.metadata?.image_url || item.image_url) ? (
                          <img src={item.metadata?.image_url || item.image_url} alt={item.name} className="w-14 h-14 object-cover rounded-xl" />
                        ) : (
                          <div className="w-14 h-14 bg-gradient-to-br from-pastel-lavender to-pastel-rose rounded-xl flex items-center justify-center">
                            <Package className="w-6 h-6 text-violet-400" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-slate-800 text-sm truncate">{item.name}</h4>
                          <p className="text-xs text-violet-400">{item.metadata?.kit_name || item.kit_name}</p>
                          {(item.metadata?.size || item.size) && (
                            <span className="inline-block mt-1 text-xs bg-pastel-lavender text-violet-600 px-2 py-0.5 rounded font-medium">
                              Saiz: {item.metadata?.size || item.size}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => updateCartItem(item.cart_item_id, Math.max(1, (item.quantity || 1) - 1))}
                            className="w-7 h-7 bg-pastel-mint/50 rounded-lg flex items-center justify-center hover:bg-pastel-lavender transition"
                          >
                            <Minus className="w-3 h-3 text-violet-500" />
                          </button>
                          <span className="w-8 text-center font-bold text-slate-700">{item.quantity || 1}</span>
                          <button 
                            onClick={() => updateCartItem(item.cart_item_id, (item.quantity || 1) + 1)}
                            className="w-7 h-7 bg-pastel-mint/50 rounded-lg flex items-center justify-center hover:bg-pastel-lavender transition"
                          >
                            <Plus className="w-3 h-3 text-violet-500" />
                          </button>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-slate-800 text-sm">RM {((item.amount || 0) * (item.quantity || 1)).toFixed(2)}</p>
                          <button 
                            onClick={() => removeFromCart(item.cart_item_id)}
                            className="text-rose-400 hover:text-rose-500 text-xs font-medium mt-1"
                          >
                            Buang
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Cart Footer */}
              {cart.items?.length > 0 && (
                <div className="p-6 border-t border-pastel-lilac bg-white/80 backdrop-blur">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-slate-600">Jumlah Keseluruhan</span>
                    <span className="text-3xl font-black text-slate-800">
                      RM <span className="bg-gradient-to-r from-violet-500 to-fuchsia-500 bg-clip-text text-transparent">{cart.total_amount?.toFixed(2)}</span>
                    </span>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={checkout}
                    className="w-full py-4 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-rose-500 text-white font-bold rounded-2xl shadow-lg shadow-pastel hover:shadow-xl hover:shadow-pastel-lg transition-all flex items-center justify-center gap-2"
                    data-testid="checkout-button"
                  >
                    <Zap className="w-5 h-5" />
                    Bayar Sekarang
                    <ArrowRight className="w-5 h-5" />
                  </motion.button>
                  
                  {/* Trust Badges */}
                  <div className="flex justify-center gap-4 mt-4">
                    {[
                      { icon: Shield, label: 'Selamat' },
                      { icon: Clock, label: 'Cepat' },
                      { icon: Check, label: 'Dijamin' },
                    ].map((badge, idx) => (
                      <div key={idx} className="flex items-center gap-1 text-violet-500 text-xs">
                        <badge.icon className="w-3 h-3" />
                        <span>{badge.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
      
      {/* Size Selection Modal */}
      <AnimatePresence>
        {showSizeModal && (
          <SizeSelectionModal
            isOpen={showSizeModal}
            onClose={() => {
              setShowSizeModal(false);
              setSizeModalKit(null);
              setProductsRequiringSizes([]);
            }}
            kit={sizeModalKit}
            productsRequiringSizes={productsRequiringSizes}
            onConfirm={handleConfirmSizes}
            isSubmitting={isSubmittingSizes}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default KoperasiPage;
