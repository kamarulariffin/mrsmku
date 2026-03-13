import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  ShoppingCart, X, Trash2, Plus, Minus, 
  ShoppingBag, CreditCard, Package, Bus, Heart, GraduationCap, LayoutGrid, ChevronDown, ChevronUp
} from 'lucide-react';
import { useCart } from '../../context/CartContext';

const ITEM_TYPE_CONFIG = {
  yuran: { icon: GraduationCap, color: 'bg-pastel-mint text-teal-600', label: 'Yuran' },
  yuran_partial: { icon: GraduationCap, color: 'bg-pastel-lavender text-violet-600', label: 'Bayaran Sebahagian Yuran' },
  yuran_two_payment: { icon: GraduationCap, color: 'bg-amber-100 text-amber-700', label: 'Bayaran 2 Kali Yuran' },
  yuran_installment: { icon: GraduationCap, color: 'bg-amber-100 text-amber-700', label: 'Bayaran Ansuran Yuran' },
  koperasi: { icon: Package, color: 'bg-amber-100 text-amber-600', label: 'Koperasi' },
  bus: { icon: Bus, color: 'bg-cyan-100 text-cyan-600', label: 'Tiket Bas' },
  infaq: { icon: Heart, color: 'bg-pink-100 text-pink-600', label: 'Sumbangan' },
  tabung: { icon: Heart, color: 'bg-rose-100 text-rose-600', label: 'Tabung' },
  marketplace: { icon: ShoppingBag, color: 'bg-indigo-100 text-indigo-600', label: 'Marketplace' }
};

// Tab by category: tab id -> item_types included
const CATEGORY_TABS = [
  { id: 'all', label: 'Semua', icon: LayoutGrid, types: null },
  { id: 'yuran', label: 'Yuran', icon: GraduationCap, types: ['yuran', 'yuran_partial', 'yuran_installment', 'yuran_two_payment'] },
  { id: 'koperasi', label: 'Koperasi', icon: Package, types: ['koperasi'] },
  { id: 'bus', label: 'Tiket Bas', icon: Bus, types: ['bus'] },
  { id: 'sumbangan', label: 'Sumbangan', icon: Heart, types: ['infaq', 'tabung'] },
  { id: 'marketplace', label: 'Marketplace', icon: ShoppingBag, types: ['marketplace'] }
];

// Header quick indicator: total + count by category
const HEADER_CATEGORY_SEGMENTS = [
  {
    id: 'yuran',
    short: 'YR',
    label: 'Yuran',
    types: ['yuran', 'yuran_partial', 'yuran_installment', 'yuran_two_payment'],
    tone: 'bg-amber-100 text-amber-700 border-amber-200'
  },
  {
    id: 'koperasi',
    short: 'KP',
    label: 'Koperasi',
    types: ['koperasi'],
    tone: 'bg-violet-100 text-violet-700 border-violet-200'
  },
  {
    id: 'bus',
    short: 'BS',
    label: 'Tiket Bas',
    types: ['bus'],
    tone: 'bg-cyan-100 text-cyan-700 border-cyan-200'
  },
  {
    id: 'sumbangan',
    short: 'SB',
    label: 'Sumbangan',
    types: ['infaq', 'tabung'],
    tone: 'bg-rose-100 text-rose-700 border-rose-200'
  },
  {
    id: 'marketplace',
    short: 'MP',
    label: 'Marketplace',
    types: ['marketplace'],
    tone: 'bg-indigo-100 text-indigo-700 border-indigo-200'
  }
];

const YURAN_DETAIL_TYPES = ['yuran', 'yuran_partial', 'yuran_installment', 'yuran_two_payment'];

const isYuranDetailType = (type) => YURAN_DETAIL_TYPES.includes(type);

const formatCurrencyRM = (value) => {
  const amount = Number(value || 0);
  return `RM ${amount.toLocaleString('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const normalizeYuranInvoiceStatus = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (['pending', 'partial', 'paid', 'overdue'].includes(normalized)) {
    return normalized;
  }
  return '';
};

const getYuranInvoiceStatusMeta = (status) => {
  const normalized = normalizeYuranInvoiceStatus(status);
  switch (normalized) {
    case 'paid':
      return {
        label: 'Selesai',
        badgeTone: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        textTone: 'text-emerald-700'
      };
    case 'partial':
      return {
        label: 'Separa',
        badgeTone: 'bg-violet-50 text-violet-700 border-violet-200',
        textTone: 'text-violet-700'
      };
    case 'overdue':
      return {
        label: 'Lewat',
        badgeTone: 'bg-rose-50 text-rose-700 border-rose-200',
        textTone: 'text-rose-700'
      };
    case 'pending':
      return {
        label: 'Belum Bayar',
        badgeTone: 'bg-amber-50 text-amber-700 border-amber-200',
        textTone: 'text-amber-700'
      };
    default:
      return null;
  }
};

const getYuranDueMeta = (metadata = {}) => {
  const dueRaw = metadata?.due_date;
  if (!dueRaw) return null;

  const parsedDate = new Date(dueRaw);
  const dateLabel = Number.isNaN(parsedDate.getTime())
    ? String(dueRaw)
    : parsedDate.toLocaleDateString('ms-MY');

  const daysCandidate = Number(metadata?.days_to_due);
  const hasDays = Number.isFinite(daysCandidate);
  const isOverdue = metadata?.is_overdue === true || (hasDays && daysCandidate < 0);
  const isDueSoon = hasDays && daysCandidate >= 0 && daysCandidate <= 7;

  let helperText = '';
  if (isOverdue) {
    helperText = 'Lewat';
  } else if (hasDays) {
    helperText = daysCandidate === 0 ? 'Hari ini' : `${daysCandidate} hari lagi`;
  }

  const badgeTone = isOverdue
    ? 'bg-rose-50 text-rose-700 border-rose-200'
    : isDueSoon
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-sky-50 text-sky-700 border-sky-200';

  const textTone = isOverdue
    ? 'text-rose-700'
    : isDueSoon
      ? 'text-amber-700'
      : 'text-slate-800';

  return { dateLabel, helperText, badgeTone, textTone, isOverdue };
};

const getYuranInvoiceNumberLabel = (item) => {
  const metadata = item?.metadata || {};
  const explicit = String(metadata?.invoice_number || metadata?.invoice_number_label || '').trim();
  if (explicit) return explicit;
  const rawId = String(item?.item_id || item?.itemId || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (rawId) return `INV-${rawId.slice(-8)}`;
  return '';
};

const getYuranOutstandingAmount = (item) => {
  const metadata = item?.metadata || {};
  const originalAmount = Number(metadata.original_amount);
  const paidAmount = Number(metadata.paid_amount || 0);
  if (Number.isFinite(originalAmount) && originalAmount > 0) {
    return Math.max(originalAmount - (Number.isFinite(paidAmount) ? paidAmount : 0), 0);
  }
  return Number(item?.amount || 0) * Number(item?.quantity || 1);
};

const getYuranMiniSummaryBadges = (item) => {
  const metadata = item?.metadata || {};
  const badges = [];
  const invoiceNumberLabel = getYuranInvoiceNumberLabel(item);
  const invoiceStatusMeta = getYuranInvoiceStatusMeta(metadata.invoice_status);
  const dueMeta = getYuranDueMeta(metadata);

  if (metadata.student_name) {
    badges.push({
      label: 'Pelajar',
      value: metadata.student_name,
      tone: 'bg-slate-50 text-slate-700 border-slate-200'
    });
  }

  if (metadata.tingkatan) {
    badges.push({
      label: 'Tingkatan',
      value: `${metadata.tingkatan}`,
      tone: 'bg-amber-50 text-amber-700 border-amber-200'
    });
  }

  if (invoiceNumberLabel) {
    badges.push({
      label: 'Invois',
      value: invoiceNumberLabel,
      tone: 'bg-sky-50 text-sky-700 border-sky-200'
    });
  }

  if (invoiceStatusMeta) {
    badges.push({
      label: 'Status',
      value: invoiceStatusMeta.label,
      tone: invoiceStatusMeta.badgeTone
    });
  }

  if (dueMeta) {
    badges.push({
      label: dueMeta.isOverdue ? 'Lewat' : 'Akhir',
      value: dueMeta.dateLabel,
      tone: dueMeta.badgeTone
    });
  }

  if ((item?.item_type === 'yuran_two_payment' || item?.item_type === 'yuran_installment') && metadata.payment_number && metadata.max_payments) {
    badges.push({
      label: 'Ansuran',
      value: `${metadata.payment_number}/${metadata.max_payments}`,
      tone: 'bg-violet-50 text-violet-700 border-violet-200'
    });
  }

  if (item?.item_type === 'yuran_partial') {
    const selectedCount = Array.isArray(metadata.selected_items) ? metadata.selected_items.length : 0;
    if (selectedCount > 0) {
      badges.push({
        label: 'Item Dipilih',
        value: `${selectedCount}`,
        tone: 'bg-indigo-50 text-indigo-700 border-indigo-200'
      });
    }
  }

  badges.push({
    label: 'Baki',
    value: formatCurrencyRM(getYuranOutstandingAmount(item)),
    tone: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  });

  return badges;
};

// Cart Icon Button for Header - Opens central cart drawer (one troli for all payments)
export const CartIconButton = ({ className = '', showCategoryCounts = false }) => {
  const { cart, toggleCart } = useCart();
  const itemCount = Number(cart?.item_count || 0);

  const categorySummary = useMemo(() => {
    const counts = HEADER_CATEGORY_SEGMENTS.reduce((acc, category) => {
      acc[category.id] = 0;
      return acc;
    }, {});

    (cart?.items || []).forEach((item) => {
      const category = HEADER_CATEGORY_SEGMENTS.find((segment) => segment.types.includes(item.item_type));
      if (category) counts[category.id] += 1;
    });

    return HEADER_CATEGORY_SEGMENTS.map((category) => ({
      ...category,
      count: counts[category.id] || 0
    }));
  }, [cart?.items]);

  const handleClick = (e) => {
    e.preventDefault();
    toggleCart();
  };
  
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        className="relative p-2 hover:bg-pastel-mint/50 rounded-xl transition-colors"
        data-testid="cart-icon-btn"
        aria-label="Troli Saya"
      >
        <ShoppingCart className="w-5 h-5 text-teal-600" />
        {itemCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center shadow-lg"
          >
            {itemCount > 9 ? '9+' : itemCount}
          </motion.span>
        )}
      </button>

      {showCategoryCounts && (
        <button
          type="button"
          onClick={handleClick}
          className="hidden md:flex items-center gap-1 p-1.5 rounded-xl border border-slate-200 bg-white/90 hover:bg-slate-50 transition-colors"
          data-testid="cart-category-indicator"
          aria-label="Ringkasan troli ikut kategori"
          title="Ringkasan troli ikut kategori"
        >
          {categorySummary.map((category) => (
            <span
              key={category.id}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold leading-none ${
                category.count > 0
                  ? category.tone
                  : 'bg-slate-100 text-slate-500 border-slate-200'
              }`}
              title={`${category.label}: ${category.count} item`}
            >
              <span>{category.short}</span>
              <span>{category.count}</span>
            </span>
          ))}
        </button>
      )}
    </div>
  );
};

// Cart Drawer Component
export const CartDrawer = () => {
  const navigate = useNavigate();
  const { cart, isOpen, closeCart, removeFromCart, updateQuantity, loading } = useCart();
  const [activeTab, setActiveTab] = useState('all');
  const [expandedDetails, setExpandedDetails] = useState({});

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
                              {isYuranDetailType(item.item_type) && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {getYuranMiniSummaryBadges(item).map((badge, idx) => (
                                    <span
                                      key={`${item.cart_item_id || item.item_id}-mini-${idx}`}
                                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] leading-none ${badge.tone}`}
                                      title={`${badge.label}: ${badge.value}`}
                                    >
                                      <span className="font-semibold">{badge.label}</span>
                                      <span className="max-w-[120px] truncate">{badge.value}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => removeFromCart(item.cart_item_id)}
                              disabled={loading}
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          {(() => {
                            if (!isYuranDetailType(item.item_type)) return null;
                            const detailKey = item.cart_item_id || `${item.item_type}-${item.item_id}`;
                            const metadata = item.metadata || {};
                            const selectedItems = Array.isArray(metadata.selected_items) ? metadata.selected_items : [];
                            const originalAmount = Number(metadata.original_amount ?? 0);
                            const paidAmount = Number(metadata.paid_amount ?? 0);
                            const outstandingAmount = getYuranOutstandingAmount(item);
                            const paymentNumber = Number(metadata.payment_number || 0);
                            const maxPayments = Number(metadata.max_payments || 0);
                            const isOpenDetail = Boolean(expandedDetails[detailKey]);
                            const invoiceNumberLabel = getYuranInvoiceNumberLabel(item);
                            const invoiceStatusMeta = getYuranInvoiceStatusMeta(metadata.invoice_status);
                            const dueMeta = getYuranDueMeta(metadata);

                            return (
                              <div className="mt-2 rounded-lg border border-amber-200 bg-white/80">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExpandedDetails((prev) => ({ ...prev, [detailKey]: !prev[detailKey] }));
                                  }}
                                  className="w-full px-2.5 py-2 text-[11px] font-semibold text-amber-700 flex items-center justify-between hover:bg-amber-50 rounded-lg transition-colors"
                                  data-testid={`cart-yuran-detail-toggle-${detailKey}`}
                                >
                                  <span>Maklumat Bayaran Terperinci</span>
                                  {isOpenDetail ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>

                                {isOpenDetail && (
                                  <div className="px-2.5 pb-2.5 pt-1 space-y-1.5 text-[11px] border-t border-amber-100">
                                    <div className="grid grid-cols-2 gap-1.5 text-slate-600">
                                      <span>Nama Pelajar</span>
                                      <span className="text-right font-medium text-slate-800 truncate">{metadata.student_name || '-'}</span>
                                      <span>Tingkatan</span>
                                      <span className="text-right font-medium text-slate-800">
                                        {metadata.tingkatan ? `Tingkatan ${metadata.tingkatan}` : '-'}
                                      </span>
                                      <span>No. Invois</span>
                                      <span className="text-right font-medium text-slate-800">{invoiceNumberLabel || '-'}</span>
                                      {invoiceStatusMeta && (
                                        <>
                                          <span>Status Bil</span>
                                          <span className={`text-right font-medium ${invoiceStatusMeta.textTone}`}>
                                            {invoiceStatusMeta.label}
                                          </span>
                                        </>
                                      )}
                                      {dueMeta && (
                                        <>
                                          <span>Tarikh Akhir</span>
                                          <span className={`text-right font-medium ${dueMeta.textTone}`}>
                                            {dueMeta.dateLabel}{dueMeta.helperText ? ` (${dueMeta.helperText})` : ''}
                                          </span>
                                        </>
                                      )}
                                      {(item.item_type === 'yuran_two_payment' || item.item_type === 'yuran_installment') && (
                                        <>
                                          <span>Ansuran Semasa</span>
                                          <span className="text-right font-medium text-slate-800">
                                            {paymentNumber > 0 && maxPayments > 0 ? `Bayaran ${paymentNumber}/${maxPayments}` : '-'}
                                          </span>
                                        </>
                                      )}
                                      {originalAmount > 0 && (
                                        <>
                                          <span>Jumlah Asal</span>
                                          <span className="text-right font-medium text-slate-800">{formatCurrencyRM(originalAmount)}</span>
                                          <span>Sudah Dibayar</span>
                                          <span className="text-right font-medium text-slate-800">{formatCurrencyRM(paidAmount)}</span>
                                        </>
                                      )}
                                      <span>Baki Semasa</span>
                                      <span className="text-right font-semibold text-emerald-700">{formatCurrencyRM(outstandingAmount)}</span>
                                    </div>

                                    {selectedItems.length > 0 && (
                                      <div className="pt-1">
                                        <p className="font-semibold text-slate-700 mb-1">Butiran Item Dipilih</p>
                                        <div className="space-y-1">
                                          {selectedItems.map((subItem, idx) => (
                                            <div key={`${detailKey}-sub-${idx}`} className="flex items-center gap-2 text-slate-600">
                                              <span className="w-1 h-1 rounded-full bg-amber-500" />
                                              <span className="truncate">{subItem.name || subItem.code || `Item ${idx + 1}`}</span>
                                              <span className="ml-auto">{formatCurrencyRM(subItem.amount || 0)}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                          
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
