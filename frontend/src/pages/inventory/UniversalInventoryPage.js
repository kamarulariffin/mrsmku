import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Package, Plus, Search, Edit, Trash2, RefreshCw, Link2, Unlink,
  Building2, TrendingUp, AlertCircle, Box, X, Save, ChevronDown,
  ArrowRightLeft, History, Settings2
} from 'lucide-react';
import api from '../../services/api';

// Legacy fallback categories - will be replaced by API fetch
const FALLBACK_CATEGORIES = [
  { value: 'baju', label: 'Baju' },
  { value: 'aksesori', label: 'Aksesori' },
  { value: 'cenderamata', label: 'Cenderamata' },
  { value: 'alat_tulis', label: 'Alat Tulis' },
  { value: 'sukan', label: 'Sukan' },
  { value: 'makanan', label: 'Makanan' },
  { value: 'pakaian', label: 'Pakaian' },
  { value: 'kraftangan', label: 'Kraftangan' },
  { value: 'lain_lain', label: 'Lain-lain' }
];

const VENDOR_TYPES = [
  { value: 'internal', label: 'Koperasi (Dalaman)' },
  { value: 'pum', label: 'PUM (Usahawan Muda)' },
  { value: 'muafakat', label: 'Muafakat MRSM Kuantan' },
  { value: 'external', label: 'Vendor Luar' }
];

const SYNC_MODES = [
  { value: 'auto', label: 'Auto-Sync' },
  { value: 'manual', label: 'Manual Sahaja' },
  { value: 'one_way', label: 'Sehala' },
  { value: 'disabled', label: 'Nyahaktif' }
];

const MODULES = [
  { value: 'koperasi', label: 'Koperasi' },
  { value: 'pum', label: 'PUM' },
  { value: 'merchandise', label: 'Merchandise' }
];

const UniversalInventoryPage = ({ token }) => {
  const [activeTab, setActiveTab] = useState('items');
  const [items, setItems] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [movements, setMovements] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  
  // Categories from API
  const [categories, setCategories] = useState(FALLBACK_CATEGORIES);

  useEffect(() => {
    fetchCategories();
    fetchData();
  }, []);
  
  useEffect(() => {
    fetchData();
  }, [activeTab, categoryFilter, vendorFilter]);
  
  // Fetch categories from centralized API
  const fetchCategories = async () => {
    try {
      const res = await api.get('/api/categories/inventory');
      if (res.data && res.data.length > 0) {
        setCategories(res.data);
      }
    } catch {
      // Silently use fallback categories
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [statsRes, itemsRes, vendorsRes, movementsRes] = await Promise.all([
        api.get('/api/inventory/stats'),
        api.get(`/api/inventory/items?include_inactive=true${categoryFilter ? `&category=${categoryFilter}` : ''}${vendorFilter ? `&vendor_id=${vendorFilter}` : ''}`),
        api.get('/api/inventory/vendors?include_inactive=true'),
        api.get('/api/inventory/movements?limit=50')
      ]);
      setStats(statsRes.data);
      setItems(itemsRes.data);
      setVendors(vendorsRes.data);
      setMovements(movementsRes.data);
    } catch (err) {
      toast.error('Gagal memuatkan data');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveItem = async (itemData) => {
    try {
      if (selectedItem?.id) {
        await api.put(`/api/inventory/items/${selectedItem.id}`, itemData);
        toast.success('Item dikemaskini');
      } else {
        await api.post('/api/inventory/items', itemData);
        toast.success('Item dicipta');
      }
      setShowItemModal(false);
      setSelectedItem(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan item');
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!window.confirm('Adakah anda pasti untuk memadam item ini?')) return;
    try {
      await api.delete(`/api/inventory/items/${itemId}`);
      toast.success('Item dipadam');
      fetchData();
    } catch (err) {
      toast.error('Gagal memadam item');
    }
  };

  const handleSaveVendor = async (vendorData) => {
    try {
      if (selectedVendor?.id) {
        await api.put(`/api/inventory/vendors/${selectedVendor.id}`, vendorData);
        toast.success('Vendor dikemaskini');
      } else {
        await api.post('/api/inventory/vendors', vendorData);
        toast.success('Vendor dicipta');
      }
      setShowVendorModal(false);
      setSelectedVendor(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan vendor');
    }
  };

  const handleDeleteVendor = async (vendorId) => {
    if (!window.confirm('Adakah anda pasti untuk memadam vendor ini?')) return;
    try {
      await api.delete(`/api/inventory/vendors/${vendorId}`);
      toast.success('Vendor dipadam');
      fetchData();
    } catch (err) {
      toast.error('Gagal memadam vendor');
    }
  };

  const handleManualSync = async (itemId) => {
    try {
      const res = await api.post('/api/inventory/sync/manual', { inventory_item_id: itemId, target_modules: [] });
      toast.success(res.data.message);
      fetchData();
    } catch (err) {
      toast.error('Gagal sync inventori');
    }
  };

  const handleCreateLink = async (linkData) => {
    try {
      await api.post('/api/inventory/links', linkData);
      toast.success('Pautan dicipta');
      setShowLinkModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal mencipta pautan');
    }
  };

  const handleDeleteLink = async (linkId) => {
    if (!window.confirm('Padam pautan ini?')) return;
    try {
      await api.delete(`/api/inventory/links/${linkId}`);
      toast.success('Pautan dipadam');
      fetchData();
    } catch (err) {
      toast.error('Gagal memadam pautan');
    }
  };

  const handleSeedMuafakat = async () => {
    try {
      const res = await api.post('/api/inventory/seed/muafakat-vendor');
      toast.success(res.data.message);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal mencipta vendor');
    }
  };

  const filteredItems = items.filter(i =>
    i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    i.sku?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredVendors = vendors.filter(v =>
    v.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="universal-inventory-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-primary-900 font-heading">
            Pengurusan Inventori Universal
          </h1>
          <p className="text-slate-600 mt-1">Stok berpusat dengan auto-sync antara modul</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setSelectedItem(null); setShowItemModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-violet-500 text-white rounded-lg shadow-pastel-sm hover:shadow-pastel transition-all"
            data-testid="add-item-btn"
          >
            <Plus size={20} />
            Tambah Item
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500">Jumlah Item</p>
                <p className="text-2xl font-bold text-slate-900">{stats.active_items}</p>
                <p className="text-xs text-slate-400">{stats.total_items} termasuk tidak aktif</p>
              </div>
              <div className="p-3 bg-pastel-mint rounded-lg">
                <Package className="text-teal-600" size={24} />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500">Nilai Inventori</p>
                <p className="text-2xl font-bold text-slate-900">RM {stats.total_value.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <TrendingUp className="text-green-600" size={24} />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500">Stok Rendah</p>
                <p className="text-2xl font-bold text-amber-600">{stats.low_stock_items}</p>
              </div>
              <div className="p-3 bg-amber-100 rounded-lg">
                <AlertCircle className="text-amber-600" size={24} />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500">Habis Stok</p>
                <p className="text-2xl font-bold text-red-600">{stats.out_of_stock_items}</p>
              </div>
              <div className="p-3 bg-red-100 rounded-lg">
                <Box className="text-red-600" size={24} />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500">Jumlah Vendor</p>
                <p className="text-2xl font-bold text-slate-900">{vendors.length}</p>
              </div>
              <div className="p-3 bg-pastel-lavender rounded-lg">
                <Building2 className="text-violet-600" size={24} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <div className="flex border-b border-slate-200">
          {[
            { id: 'items', label: 'Item Inventori', icon: Package },
            { id: 'vendors', label: 'Vendor', icon: Building2 },
            { id: 'movements', label: 'Sejarah Pergerakan', icon: History }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-4 font-medium transition-all ${
                activeTab === tab.id
                  ? 'text-teal-600 border-b-2 border-teal-600 bg-pastel-mint/50'
                  : 'text-slate-600 hover:text-teal-600 hover:bg-slate-50'
              }`}
              data-testid={`tab-${tab.id}`}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* Search and Filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input
                type="text"
                placeholder="Cari..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                data-testid="search-input"
              />
            </div>
            {activeTab === 'items' && (
              <>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">Semua Kategori</option>
                  {categories.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
                <select
                  value={vendorFilter}
                  onChange={(e) => setVendorFilter(e.target.value)}
                  className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">Semua Vendor</option>
                  {vendors.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </>
            )}
            <button
              onClick={fetchData}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              <RefreshCw size={18} />
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            <>
              {/* Items Tab */}
              {activeTab === 'items' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-3 px-4 font-medium text-slate-600">Item</th>
                        <th className="text-left py-3 px-4 font-medium text-slate-600">Kategori</th>
                        <th className="text-left py-3 px-4 font-medium text-slate-600">Vendor</th>
                        <th className="text-right py-3 px-4 font-medium text-slate-600">
                          <span className="text-xs">Harga Kos</span>
                        </th>
                        <th className="text-right py-3 px-4 font-medium text-slate-600">
                          <span className="text-xs">Harga Jual</span>
                        </th>
                        <th className="text-right py-3 px-4 font-medium text-slate-600">Stok</th>
                        <th className="text-center py-3 px-4 font-medium text-slate-600">Pautan</th>
                        <th className="text-center py-3 px-4 font-medium text-slate-600">Sync</th>
                        <th className="text-center py-3 px-4 font-medium text-slate-600">Tindakan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.map(item => (
                        <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              {item.image_url ? (
                                <img src={item.image_url} alt={item.name} className="w-10 h-10 rounded-lg object-cover" />
                              ) : (
                                <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                                  <Package className="text-slate-400" size={18} />
                                </div>
                              )}
                              <div>
                                <p className="font-medium text-slate-900">{item.name}</p>
                                <p className="text-xs text-slate-500">{item.sku || '-'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-1 bg-pastel-mint text-teal-700 rounded-full text-xs">
                              {item.category_display}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-600 text-sm">
                            {item.vendor_name || '-'}
                          </td>
                          <td className="py-3 px-4 text-right text-slate-500 text-xs">
                            RM {item.base_price?.toFixed(2) || '0.00'}
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-emerald-600">
                            RM {item.selling_price?.toFixed(2) || item.base_price?.toFixed(2) || '0.00'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className={`font-bold ${
                              item.is_out_of_stock ? 'text-red-600' :
                              item.is_low_stock ? 'text-amber-600' : 'text-slate-900'
                            }`}>
                              {item.stock}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {item.linked_products.length > 0 ? (
                                <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                                  {item.linked_products.length} pautan
                                </span>
                              ) : (
                                <span className="text-slate-400 text-xs">Tiada</span>
                              )}
                              <button
                                onClick={() => { setSelectedItem(item); setShowLinkModal(true); }}
                                className="p-1 text-teal-600 hover:bg-pastel-mint/50 rounded"
                                title="Urus Pautan"
                              >
                                <Link2 size={14} />
                              </button>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              item.sync_mode === 'auto' ? 'bg-green-100 text-green-700' :
                              item.sync_mode === 'manual' ? 'bg-blue-100 text-blue-700' :
                              item.sync_mode === 'one_way' ? 'bg-amber-100 text-amber-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {SYNC_MODES.find(s => s.value === item.sync_mode)?.label || item.sync_mode}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleManualSync(item.id)}
                                className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                                title="Sync Manual"
                              >
                                <ArrowRightLeft size={16} />
                              </button>
                              <button
                                onClick={() => { setSelectedItem(item); setShowItemModal(true); }}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                              >
                                <Edit size={16} />
                              </button>
                              <button
                                onClick={() => handleDeleteItem(item.id)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredItems.length === 0 && (
                    <div className="text-center py-12 text-slate-500">
                      Tiada item dijumpai
                    </div>
                  )}
                </div>
              )}

              {/* Vendors Tab */}
              {activeTab === 'vendors' && (
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <p className="text-slate-600">Senarai vendor dan pembekal</p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleSeedMuafakat}
                        className="flex items-center gap-2 px-4 py-2 border border-pastel-lilac text-violet-600 rounded-lg hover:bg-pastel-lavender/50"
                      >
                        <Building2 size={18} />
                        Cipta Vendor Muafakat
                      </button>
                      <button
                        onClick={() => { setSelectedVendor(null); setShowVendorModal(true); }}
                        className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700"
                      >
                        <Plus size={18} />
                        Tambah Vendor
                      </button>
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredVendors.map(vendor => (
                      <div key={vendor.id} className="bg-white border border-slate-200 rounded-xl p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="font-semibold text-slate-900">{vendor.name}</h3>
                            <span className={`px-2 py-0.5 rounded-full text-xs ${
                              vendor.vendor_type === 'muafakat' ? 'bg-pastel-lavender text-violet-700' :
                              vendor.vendor_type === 'pum' ? 'bg-green-100 text-green-700' :
                              vendor.vendor_type === 'internal' ? 'bg-blue-100 text-blue-700' :
                              'bg-slate-100 text-slate-700'
                            }`}>
                              {VENDOR_TYPES.find(v => v.value === vendor.vendor_type)?.label || vendor.vendor_type}
                            </span>
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => { setSelectedVendor(vendor); setShowVendorModal(true); }}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteVendor(vendor.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        {vendor.description && (
                          <p className="text-sm text-slate-500 mb-3">{vendor.description}</p>
                        )}
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500">{vendor.product_count} produk</span>
                          <span className="font-medium text-teal-600">{vendor.commission_rate}% komisyen</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Movements Tab */}
              {activeTab === 'movements' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-3 px-4 font-medium text-slate-600">Masa</th>
                        <th className="text-left py-3 px-4 font-medium text-slate-600">Item</th>
                        <th className="text-center py-3 px-4 font-medium text-slate-600">Jenis</th>
                        <th className="text-right py-3 px-4 font-medium text-slate-600">Kuantiti</th>
                        <th className="text-right py-3 px-4 font-medium text-slate-600">Stok Baru</th>
                        <th className="text-left py-3 px-4 font-medium text-slate-600">Modul</th>
                        <th className="text-left py-3 px-4 font-medium text-slate-600">Sebab</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map(m => (
                        <tr key={m.id} className="border-b border-slate-100">
                          <td className="py-3 px-4 text-slate-500 text-xs">
                            {new Date(m.created_at).toLocaleString('ms-MY')}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-900">{m.item_name}</td>
                          <td className="py-3 px-4 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              m.movement_type === 'in' ? 'bg-green-100 text-green-700' :
                              m.movement_type === 'out' ? 'bg-red-100 text-red-700' :
                              m.movement_type === 'sync' ? 'bg-blue-100 text-blue-700' :
                              'bg-amber-100 text-amber-700'
                            }`}>
                              {m.movement_type === 'in' ? 'Masuk' :
                               m.movement_type === 'out' ? 'Keluar' :
                               m.movement_type === 'sync' ? 'Sync' : 'Laras'}
                            </span>
                          </td>
                          <td className={`py-3 px-4 text-right font-medium ${
                            m.movement_type === 'in' ? 'text-green-600' :
                            m.movement_type === 'out' ? 'text-red-600' : 'text-slate-600'
                          }`}>
                            {m.movement_type === 'in' ? '+' : m.movement_type === 'out' ? '-' : ''}{m.quantity}
                          </td>
                          <td className="py-3 px-4 text-right text-slate-900">{m.new_stock}</td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs">
                              {m.source_module}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-500 text-xs">{m.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Item Modal */}
      <ItemModal
        isOpen={showItemModal}
        onClose={() => { setShowItemModal(false); setSelectedItem(null); }}
        item={selectedItem}
        vendors={vendors}
        categories={categories}
        onSave={handleSaveItem}
      />

      {/* Vendor Modal */}
      <VendorModal
        isOpen={showVendorModal}
        onClose={() => { setShowVendorModal(false); setSelectedVendor(null); }}
        vendor={selectedVendor}
        onSave={handleSaveVendor}
      />

      {/* Link Modal */}
      <LinkModal
        isOpen={showLinkModal}
        onClose={() => { setShowLinkModal(false); setSelectedItem(null); }}
        item={selectedItem}
        onCreateLink={handleCreateLink}
        onDeleteLink={handleDeleteLink}
        token={token}
      />
    </div>
  );
};

// Item Modal Component - Slide Panel Overlay
const ItemModal = ({ isOpen, onClose, item, vendors, onSave, categories }) => {
  const [formData, setFormData] = useState({
    name: '', sku: '', description: '', category: 'baju', base_price: '',
    selling_price: '', stock: '', low_stock_threshold: 10, vendor_type: 'internal', vendor_id: '',
    image_url: '', is_active: true, sync_mode: 'auto'
  });

  useEffect(() => {
    if (item) {
      setFormData({
        name: item.name || '',
        sku: item.sku || '',
        description: item.description || '',
        category: item.category || 'baju',
        base_price: item.base_price || '',
        selling_price: item.selling_price || item.base_price || '',
        stock: item.stock || '',
        low_stock_threshold: item.low_stock_threshold || 10,
        vendor_type: item.vendor_type || 'internal',
        vendor_id: item.vendor_id || '',
        image_url: item.image_url || '',
        is_active: item.is_active !== false,
        sync_mode: item.sync_mode || 'auto'
      });
    } else {
      setFormData({
        name: '', sku: '', description: '', category: 'baju', base_price: '',
        selling_price: '', stock: '', low_stock_threshold: 10, vendor_type: 'internal', vendor_id: '',
        image_url: '', is_active: true, sync_mode: 'auto'
      });
    }
  }, [item, isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...formData,
      base_price: parseFloat(formData.base_price),
      selling_price: parseFloat(formData.selling_price) || parseFloat(formData.base_price),
      stock: parseInt(formData.stock),
      low_stock_threshold: parseInt(formData.low_stock_threshold)
    });
  };

  // Auto-calculate selling price with margin
  const handleBasePriceChange = (value) => {
    const basePrice = parseFloat(value) || 0;
    const margin = 1.2; // 20% margin default
    setFormData({ 
      ...formData, 
      base_price: value,
      selling_price: formData.selling_price || (basePrice * margin).toFixed(2)
    });
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {/* Backdrop with blur */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
        onClick={onClose}
      />
      
      {/* Slide Panel from Right */}
      <motion.div
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl z-50 flex flex-col overflow-x-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-pastel-mint to-pastel-lavender shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-pastel-mint rounded-lg flex-shrink-0">
              <Package className="text-teal-600" size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-slate-900 truncate">
                {item ? 'Edit Item Inventori' : 'Tambah Item Inventori'}
              </h3>
              <p className="text-xs text-slate-500">Isi maklumat item di bawah</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-white/80 rounded-lg transition-colors flex-shrink-0"
            aria-label="Tutup"
          >
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Form Content - Scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Nama Item *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                placeholder="cth: Baju T-Shirt MRSMKU"
                required
              />
            </div>

            {/* SKU & Category */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">SKU</label>
                <input
                  type="text"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="cth: TSH-001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Kategori *</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
                >
                  {categories.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Penerangan</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                rows={2}
                placeholder="Penerangan ringkas tentang item..."
              />
            </div>

            {/* Price Section - Harga Kos & Harga Jual */}
            <div className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border border-emerald-100">
              <h4 className="text-sm font-semibold text-emerald-800 mb-3 flex items-center gap-2">
                <TrendingUp size={16} />
                Maklumat Harga
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Harga Kos (RM) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.base_price}
                    onChange={(e) => handleBasePriceChange(e.target.value)}
                    className="w-full px-4 py-2.5 border border-emerald-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                    placeholder="0.00"
                    required
                  />
                  <p className="text-xs text-slate-500 mt-1">Harga belian/kos</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Harga Jual (RM) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.selling_price}
                    onChange={(e) => setFormData({ ...formData, selling_price: e.target.value })}
                    className="w-full px-4 py-2.5 border border-emerald-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                    placeholder="0.00"
                    required
                  />
                  <p className="text-xs text-slate-500 mt-1">Harga jualan retail</p>
                </div>
              </div>
              {formData.base_price && formData.selling_price && (
                <div className="mt-3 pt-3 border-t border-emerald-200">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Margin Keuntungan:</span>
                    <span className={`font-bold ${
                      ((formData.selling_price - formData.base_price) / formData.base_price * 100) >= 20 
                        ? 'text-emerald-600' 
                        : 'text-amber-600'
                    }`}>
                      {(((formData.selling_price - formData.base_price) / formData.base_price) * 100).toFixed(1)}%
                      <span className="text-xs font-normal text-slate-500 ml-1">
                        (RM {(formData.selling_price - formData.base_price).toFixed(2)})
                      </span>
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Stock */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Stok Semasa *</label>
                <input
                  type="number"
                  min="0"
                  value={formData.stock}
                  onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="0"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Threshold Stok Rendah</label>
                <input
                  type="number"
                  min="0"
                  value={formData.low_stock_threshold}
                  onChange={(e) => setFormData({ ...formData, low_stock_threshold: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="10"
                />
              </div>
            </div>

            {/* Vendor Section */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Building2 size={16} />
                Maklumat Vendor
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Jenis Vendor</label>
                  <select
                    value={formData.vendor_type}
                    onChange={(e) => setFormData({ ...formData, vendor_type: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                  >
                    {VENDOR_TYPES.map(v => (
                      <option key={v.value} value={v.value}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Vendor</label>
                  <select
                    value={formData.vendor_id}
                    onChange={(e) => setFormData({ ...formData, vendor_id: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                  >
                    <option value="">Tiada Vendor</option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Sync Mode */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Mod Sync</label>
              <select
                value={formData.sync_mode}
                onChange={(e) => setFormData({ ...formData, sync_mode: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              >
                {SYNC_MODES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            {/* Image URL */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">URL Gambar</label>
              <input
                type="url"
                value={formData.image_url}
                onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="https://..."
              />
            </div>

            {/* Active Toggle */}
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              <div>
                <p className="text-sm font-medium text-slate-700">Item Aktif</p>
                <p className="text-xs text-slate-500">Item boleh dilihat dan dijual</p>
              </div>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                className={`relative w-12 h-6 rounded-full transition-colors ${formData.is_active ? 'bg-teal-500' : 'bg-slate-300'}`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow ${formData.is_active ? 'left-7' : 'left-1'}`} />
              </button>
            </div>
          </form>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex gap-3">
          <button 
            type="button" 
            onClick={onClose} 
            className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-white transition-colors font-medium"
          >
            Batal
          </button>
          <button 
            onClick={handleSubmit}
            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-teal-500 to-violet-500 text-white rounded-xl shadow-pastel hover:shadow-pastel-lg transition-all font-medium flex items-center justify-center gap-2"
          >
            <Save size={16} />
            {item ? 'Kemaskini' : 'Simpan'}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

// Vendor Modal Component - Slide Panel Overlay
const VendorModal = ({ isOpen, onClose, vendor, onSave }) => {
  const [formData, setFormData] = useState({
    name: '', vendor_type: 'internal', description: '', contact_person: '',
    contact_phone: '', contact_email: '', commission_rate: 0, is_active: true
  });

  useEffect(() => {
    if (vendor) {
      setFormData({
        name: vendor.name || '',
        vendor_type: vendor.vendor_type || 'internal',
        description: vendor.description || '',
        contact_person: vendor.contact_person || '',
        contact_phone: vendor.contact_phone || '',
        contact_email: vendor.contact_email || '',
        commission_rate: vendor.commission_rate || 0,
        is_active: vendor.is_active !== false
      });
    } else {
      setFormData({
        name: '', vendor_type: 'internal', description: '', contact_person: '',
        contact_phone: '', contact_email: '', commission_rate: 0, is_active: true
      });
    }
  }, [vendor, isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ ...formData, commission_rate: parseFloat(formData.commission_rate) });
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {/* Backdrop with blur */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
        onClick={onClose}
      />
      
      {/* Slide Panel from Right */}
      <motion.div
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col overflow-x-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-pastel-lavender to-pastel-rose shrink-0">
          <div className="flex items-center gap-3 min-w-0">
<div className="p-2 bg-pastel-lavender rounded-lg flex-shrink-0">
            <Building2 className="text-violet-600" size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-slate-900 truncate">
                {vendor ? 'Edit Vendor' : 'Tambah Vendor'}
              </h3>
              <p className="text-xs text-slate-500">Maklumat pembekal</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-white/80 rounded-lg transition-colors flex-shrink-0"
            aria-label="Tutup"
          >
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Form Content */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Nama Vendor *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="cth: Merchandise Muafakat"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Jenis Vendor *</label>
              <select
                value={formData.vendor_type}
                onChange={(e) => setFormData({ ...formData, vendor_type: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              >
                {VENDOR_TYPES.map(v => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Penerangan</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                rows={2}
                placeholder="Penerangan ringkas tentang vendor..."
              />
            </div>

            {/* Contact Section */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <h4 className="text-sm font-semibold text-slate-700 mb-3">Maklumat Hubungan</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Nama Pegawai</label>
                  <input
                    type="text"
                    value={formData.contact_person}
                    onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    placeholder="cth: Encik Ahmad"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Telefon</label>
                    <input
                      type="tel"
                      value={formData.contact_phone}
                      onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                      placeholder="012-3456789"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Emel</label>
                    <input
                      type="email"
                      value={formData.contact_email}
                      onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                      placeholder="vendor@email.com"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Commission Rate */}
            <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-amber-100">
              <label className="block text-sm font-medium text-amber-800 mb-1.5">Kadar Komisyen (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={formData.commission_rate}
                onChange={(e) => setFormData({ ...formData, commission_rate: e.target.value })}
                className="w-full px-4 py-2.5 border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                placeholder="0"
              />
              <p className="text-xs text-amber-700 mt-1">Komisyen yang dibayar kepada vendor</p>
            </div>

            {/* Active Toggle */}
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              <div>
                <p className="text-sm font-medium text-slate-700">Vendor Aktif</p>
                <p className="text-xs text-slate-500">Vendor boleh menerima pesanan</p>
              </div>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                className={`relative w-12 h-6 rounded-full transition-colors ${formData.is_active ? 'bg-violet-500' : 'bg-slate-300'}`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow ${formData.is_active ? 'left-7' : 'left-1'}`} />
              </button>
            </div>
          </form>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex gap-3">
          <button 
            type="button" 
            onClick={onClose} 
            className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-white transition-colors font-medium"
          >
            Batal
          </button>
          <button 
            onClick={handleSubmit}
            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white rounded-xl shadow-pastel hover:shadow-pastel-lg transition-all font-medium flex items-center justify-center gap-2"
          >
            <Save size={16} />
            {vendor ? 'Kemaskini' : 'Simpan'}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

// Link Modal Component
const LinkModal = ({ isOpen, onClose, item, onCreateLink, onDeleteLink, token }) => {
  const [module, setModule] = useState('merchandise');
  const [productId, setProductId] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && module) {
      fetchProducts();
    }
  }, [isOpen, module]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      let endpoint = '';
      if (module === 'merchandise') endpoint = '/api/merchandise/products';
      else if (module === 'pum') endpoint = '/api/pum/products';
      else if (module === 'koperasi') endpoint = '/api/koperasi/products';
      
      const res = await api.get(endpoint);
      setProducts(res.data);
    } catch (err) {
      toast.error('Gagal memuatkan produk');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    if (!productId) {
      toast.error('Sila pilih produk');
      return;
    }
    onCreateLink({
      inventory_item_id: item.id,
      module: module,
      product_id: productId,
      sync_enabled: true,
      price_multiplier: 1.0
    });
    setProductId('');
  };

  if (!isOpen || !item) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen pointer-events-none" aria-hidden="true">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-lg bg-white rounded-xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col overflow-x-hidden min-w-0 pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
        <div className="bg-gradient-to-r from-teal-500 to-violet-500 p-4 text-white shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold">Pautan Inventori</h3>
              <p className="text-sm text-white/80 truncate">{item.name}</p>
            </div>
            <button onClick={onClose} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-white/20 rounded-lg flex-shrink-0" aria-label="Tutup">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6 flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {/* Existing Links */}
          <div>
            <h4 className="font-semibold text-slate-900 mb-3">Pautan Sedia Ada</h4>
            {item.linked_products?.length > 0 ? (
              <div className="space-y-2">
                {item.linked_products.map(link => (
                  <div key={link.link_id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div>
                      <span className="px-2 py-1 bg-pastel-mint text-teal-700 rounded text-xs mr-2">
                        {link.module}
                      </span>
                      <span className="text-slate-700">{link.product_name}</span>
                    </div>
                    <button
                      onClick={() => onDeleteLink(link.link_id)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                    >
                      <Unlink size={16} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-sm">Tiada pautan</p>
            )}
          </div>

          {/* Create New Link */}
          <div>
            <h4 className="font-semibold text-slate-900 mb-3">Tambah Pautan Baru</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Modul</label>
                <select
                  value={module}
                  onChange={(e) => setModule(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                >
                  {MODULES.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Produk</label>
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  disabled={loading}
                >
                  <option value="">Pilih Produk</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleCreate}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
              >
                <Link2 size={18} />
                Cipta Pautan
              </button>
            </div>
          </div>
        </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default UniversalInventoryPage;
