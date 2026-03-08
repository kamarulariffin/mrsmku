import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  ShoppingCart, X, Trash2, Plus, Minus, 
  ShoppingBag, CreditCard, Package, Bus, Heart, GraduationCap, LayoutGrid
} from 'lucide-react';
import { useCart } from '../../context/CartContext';

const ITEM_TYPE_CONFIG = {
  yuran: { icon: GraduationCap, color: 'bg-pastel-mint text-teal-600', label: 'Yuran' },
  yuran_partial: { icon: GraduationCap, color: 'bg-pastel-lavender text-violet-600', label: 'Bayaran Sebahagian Yuran' },
  koperasi: { icon: Package, color: 'bg-amber-100 text-amber-600', label: 'Koperasi' },
  bus: { icon: Bus, color: 'bg-cyan-100 text-cyan-600', label: 'Tiket Bas' },
  infaq: { icon: Heart, color: 'bg-pink-100 text-pink-600', label: 'Sumbangan' },
  tabung: { icon: Heart, color: 'bg-rose-100 text-rose-600', label: 'Tabung' },
  marketplace: { icon: ShoppingBag, color: 'bg-indigo-100 text-indigo-600', label: 'Marketplace' }
};

// Tab by category: tab id -> item_types included
const CATEGORY_TABS = [
  { id: 'all', label: 'Semua', icon: LayoutGrid, types: null },
  { id: 'yuran', label: 'Yuran', icon: GraduationCap, types: ['yuran', 'yuran_partial'] },
  { id: 'koperasi', label: 'Koperasi', icon: Package, types: ['koperasi'] },
  { id: 'bus', label: 'Tiket Bas', icon: Bus, types: ['bus'] },
  { id: 'sumbangan', label: 'Sumbangan', icon: Heart, types: ['infaq', 'tabung'] },
  { id: 'marketplace', label: 'Marketplace', icon: ShoppingBag, types: ['marketplace'] }
];

// Cart Icon Button for Header - Opens central cart drawer (one troli for all payments)
export const CartIconButton = ({ className = '' }) => {
  const { cart, toggleCart } = useCart();
  
  const handleClick = (e) => {
    e.preventDefault();
    toggleCart();
  };
  
  return (
    <button
      onClick={handleClick}
      className={`relative p-2 hover:bg-pastel-mint/50 rounded-xl transition-colors ${className}`}
      data-testid="cart-icon-btn"
      aria-label="Troli Saya"
    >
      <ShoppingCart className="w-5 h-5 text-teal-600" />
      {cart.item_count > 0 && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center shadow-lg"
        >
          {cart.item_count > 9 ? '9+' : cart.item_count}
        </motion.span>
      )}
    </button>
  );
};

// Cart Drawer Component
export const CartDrawer = () => {
  const navigate = useNavigate();
  const { cart, isOpen, closeCart, removeFromCart, updateQuantity, loading } = useCart();
  const [activeTab, setActiveTab] = useState('all');

  const handleCheckout = () => {
    closeCart();
    navigate('/payment-center?tab=troli');
  };

  const { tabsWithCount, itemsByTab } = useMemo(() => {
    const items = cart.items || [];
    const countByTab = {};
    CATEGORY_TABS.forEach((tab) => {
      if (tab.types === null) {
        countByTab[tab.id] = items.length;
      } else {
        countByTab[tab.id] = items.filter((i) => tab.types.includes(i.item_type)).length;
      }
    });
    const tabsWithCount = CATEGORY_TABS.map((t) => ({ ...t, count: countByTab[t.id] || 0 }));
    const itemsByTab = {};
    CATEGORY_TABS.forEach((tab) => {
      if (tab.types === null) {
        itemsByTab[tab.id] = items;
      } else {
        itemsByTab[tab.id] = items.filter((i) => tab.types.includes(i.item_type));
      }
    });
    return { tabsWithCount, itemsByTab };
  }, [cart.items]);

  const displayedItems = itemsByTab[activeTab] || [];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeCart}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />
          
          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col"
            data-testid="cart-drawer"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-gradient-to-r from-teal-500 to-violet-500 text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <ShoppingCart className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-lg">Troli Saya</h2>
                  <p className="text-sm text-white/80">{cart.item_count} item</p>
                </div>
              </div>
              <button
                onClick={closeCart}
                className="p-2 hover:bg-white/20 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Category Tabs - only when cart has items */}
            {cart.items.length > 0 && (
              <div className="flex-shrink-0 border-b border-slate-200 bg-slate-50/80">
                <div className="flex gap-1 p-2 overflow-x-auto scrollbar-thin">
                  {tabsWithCount.map((tab) => {
                    const TabIcon = tab.icon;
                    const isActive = activeTab === tab.id;
                    const hasItems = tab.count > 0;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${isActive ? 'bg-teal-500 text-white shadow-md' : hasItems ? 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200' : 'text-slate-400 border border-slate-100'}`}
                      >
                        <TabIcon className="w-4 h-4 flex-shrink-0" />
                        {tab.label}
                        {tab.count > 0 && (
                          <span className={`min-w-[1.25rem] h-5 flex items-center justify-center rounded-full text-xs ${isActive ? 'bg-white/20' : 'bg-slate-200 text-slate-600'}`}>
                            {tab.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                    <ShoppingBag className="w-10 h-10 text-slate-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-700">Troli Kosong</h3>
                  <p className="text-sm text-slate-500 mt-1">Tambah item dari Yuran, Koperasi, Tiket Bas, Tabung atau Marketplace</p>
                  <button
                    type="button"
                    onClick={() => { closeCart(); navigate('/payment-center'); }}
                    className="mt-4 px-4 py-2 bg-teal-500 text-white rounded-xl font-medium hover:bg-teal-600 transition-colors"
                  >
                    Pergi ke Pusat Bayaran
                  </button>
                </div>
              ) : displayedItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-slate-500 text-sm">Tiada item dalam kategori ini.</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('all')}
                    className="mt-3 text-sm font-medium text-teal-600 hover:text-teal-700"
                  >
                    Lihat semua item
                  </button>
                </div>
              ) : (
                displayedItems.map((item) => {
                  const config = ITEM_TYPE_CONFIG[item.item_type] || ITEM_TYPE_CONFIG.koperasi;
                  const ItemIcon = config.icon;
                  
                  return (
                    <motion.div
                      key={item.cart_item_id}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 100 }}
                      className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="flex gap-3">
                        {/* Icon */}
                        <div className={`w-12 h-12 ${config.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
                          <ItemIcon className="w-6 h-6" />
                        </div>
                        
                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-800 truncate">{item.name}</p>
                              <p className="text-xs text-slate-500 truncate">{item.description}</p>
                              <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${config.color}`}>
                                {config.label}
                              </span>
                            </div>
                            <button
                              onClick={() => removeFromCart(item.cart_item_id)}
                              disabled={loading}
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          
                          {/* Price and Quantity */}
                          <div className="flex items-center justify-between mt-3">
                            <p className="font-bold text-teal-600">
                              RM {(item.amount * (item.quantity || 1)).toFixed(2)}
                            </p>
                            
                            {/* Quantity controls for applicable items */}
                            {['koperasi', 'bus', 'marketplace'].includes(item.item_type) && (
                              <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1">
                                <button
                                  onClick={() => updateQuantity(item.cart_item_id, Math.max(1, (item.quantity || 1) - 1))}
                                  disabled={loading || (item.quantity || 1) <= 1}
                                  className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white disabled:opacity-50 transition-colors"
                                >
                                  <Minus className="w-4 h-4" />
                                </button>
                                <span className="w-8 text-center font-semibold text-sm">{item.quantity || 1}</span>
                                <button
                                  onClick={() => updateQuantity(item.cart_item_id, (item.quantity || 1) + 1)}
                                  disabled={loading}
                                  className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white transition-colors"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {cart.items.length > 0 && (
              <div className="border-t border-slate-200 p-4 bg-slate-50 space-y-4">
                {/* Total */}
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 font-medium">Jumlah</span>
                  <span className="text-2xl font-bold text-teal-600">
                    RM {cart.total_amount.toFixed(2)}
                  </span>
                </div>
                
                {/* Checkout Button */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleCheckout}
                  className="w-full py-4 bg-gradient-to-r from-teal-500 to-violet-500 text-white font-bold rounded-xl shadow-pastel flex items-center justify-center gap-2 hover:shadow-pastel-lg transition-shadow"
                  data-testid="checkout-btn"
                >
                  <CreditCard className="w-5 h-5" />
                  Teruskan ke Pembayaran
                </motion.button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default CartDrawer;
