import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ShoppingCart, ShoppingBag, Package, Receipt, Plus, Edit, Trash2, 
  X, Clock, Wallet, Settings, Save, TrendingUp, FileText, DollarSign, Percent, CheckCircle, AlertCircle, Tag
} from 'lucide-react';
import api from '../../../services/api';
import { ProductImageUpload } from '../../../components/ProductImageUpload';

// ===================== SHARED COMPONENTS =====================

const Spinner = ({ size = 'md' }) => <div className={`spinner ${size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'}`}></div>;

const Button = ({ children, variant = 'primary', size = 'md', loading, disabled, className = '', ...props }) => {
  const variants = {
    primary: 'bg-primary-700 hover:bg-primary-900 text-white shadow-sm hover:shadow-md',
    secondary: 'bg-secondary-600 hover:bg-amber-700 text-white',
    outline: 'border-2 border-primary-700 text-primary-700 hover:bg-primary-50',
    ghost: 'text-slate-600 hover:text-primary-700 hover:bg-slate-100',
    danger: 'bg-red-600 hover:bg-red-700 text-white'
  };
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-5 py-2.5 text-sm', lg: 'px-6 py-3 text-base' };
  return (
    <button className={`font-medium rounded-lg transition-all btn-click flex items-center justify-center gap-2 ${variants[variant]} ${sizes[size]} ${className} ${disabled || loading ? 'opacity-60 cursor-not-allowed' : ''}`} disabled={disabled || loading} {...props}>
      {loading ? <Spinner size="sm" /> : null}{children}
    </button>
  );
};

const Input = ({ label, error, icon: Icon, ...props }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
    <div className="relative">
      {Icon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon size={18} /></div>}
      <input className={`flex h-11 w-full rounded-lg border bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${Icon ? 'pl-10' : ''} ${error ? 'border-red-500' : 'border-slate-200'}`} {...props} />
    </div>
    {error && <p className="text-sm text-red-500">{error}</p>}
  </div>
);

const Select = ({ label, error, children, ...props }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
    <select className={`flex h-11 w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-700 focus:ring-offset-2 ${error ? 'border-red-500' : 'border-slate-200'}`} {...props}>{children}</select>
    {error && <p className="text-sm text-red-500">{error}</p>}
  </div>
);

const Card = ({ children, className = '', hover = false, ...props }) => (
  <div className={`bg-white rounded-xl border border-slate-100 p-6 relative overflow-hidden ${hover ? 'card-hover cursor-pointer' : ''} ${className}`} {...props}>{children}</div>
);

const Badge = ({ status, children }) => {
  const styles = { approved: 'bg-emerald-100 text-emerald-800', pending: 'bg-amber-100 text-amber-800', rejected: 'bg-red-100 text-red-800', paid: 'bg-emerald-100 text-emerald-800', partial: 'bg-blue-100 text-blue-800', overdue: 'bg-red-100 text-red-800', active: 'bg-emerald-100 text-emerald-800', inactive: 'bg-red-100 text-red-800' };
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${styles[status] || 'bg-slate-100 text-slate-800'}`}>{children}</span>;
};

const StatCard = ({ icon: Icon, label, value, subtext, color = 'primary' }) => {
  const colors = { primary: 'bg-primary-100 text-primary-700', secondary: 'bg-amber-100 text-amber-700', success: 'bg-emerald-100 text-emerald-700', warning: 'bg-orange-100 text-orange-700', danger: 'bg-red-100 text-red-700' };
  return (
    <Card className="animate-fadeIn">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 font-medium">{label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 font-heading">{value}</p>
          {subtext && <p className="text-xs text-slate-400 mt-1">{subtext}</p>}
        </div>
        <div className={`p-3 rounded-lg ${colors[color]}`}><Icon size={24} /></div>
      </div>
    </Card>
  );
};

// ===================== ADMIN KOPERASI PAGE =====================

export const AdminKoperasiPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('kits');
  const [kits, setKits] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showKitPanel, setShowKitPanel] = useState(false);
  const [showProductPanel, setShowProductPanel] = useState(false);
  const [editingKit, setEditingKit] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [kitForm, setKitForm] = useState({ name: '', description: '', image_url: '' });
  const [productForm, setProductForm] = useState({ 
    kit_id: '', 
    name: '', 
    description: '', 
    price: '', 
    image_url: '', 
    images: [],
    category: 'others',  // NEW: Product category
    has_sizes: false, 
    size_type: 'none',
    sizes_stock: [],
    total_stock: 0 
  });
  
  // Predefined sizes
  const CLOTHING_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
  const SHOE_SIZES = ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45'];
  
  // Product Categories - Fetched from database
  const [productCategories, setProductCategories] = useState({});
  const [commissionCategories, setCommissionCategories] = useState([]);
  const [, setCategoriesLoading] = useState(false);
  
  // PUM Commission Settings
  const [commissionSettings, setCommissionSettings] = useState(null);
  const [newCommissionRate, setNewCommissionRate] = useState(10);
  const [savingSettings, setSavingSettings] = useState(false);
  
  // Commission Report
  const [commissionReport, setCommissionReport] = useState(null);
  const [pendingCommission, setPendingCommission] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // Laporan Detail (koperasi + PUM)
  const [laporanDetail, setLaporanDetail] = useState(null);
  const [laporanLoading, setLaporanLoading] = useState(false);
  const [laporanYear, setLaporanYear] = useState(new Date().getFullYear());

  useEffect(() => { 
    fetchCategories();
    fetchAll(); 
  }, []);

  useEffect(() => {
    if (activeTab === 'laporan') fetchLaporanDetail();
  }, [activeTab, laporanYear]);
  
  // Fetch categories from database
  const fetchCategories = async () => {
    setCategoriesLoading(true);
    try {
      const res = await api.get('/api/categories/koperasi/flat');
      const cats = {};
      const commCats = [];
      res.data.forEach(cat => {
        cats[cat.code] = cat.name;
        if (cat.commission_eligible) {
          commCats.push(cat.code);
        }
      });
      setProductCategories(cats);
      setCommissionCategories(commCats);
    } catch (err) {
      // Fallback to legacy categories
      setProductCategories({
        'merchandise': 'Barangan Rasmi (Merchandise)',
        'uniform': 'Pakaian Seragam',
        'books': 'Buku & Alat Tulis',
        'sports': 'Peralatan Sukan',
        'accessories': 'Aksesori',
        'food': 'Makanan & Minuman',
        'others': 'Lain-lain'
      });
      setCommissionCategories(['merchandise']);
    } finally {
      setCategoriesLoading(false);
    }
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [kitsRes, productsRes, ordersRes, statsRes, commSettingsRes, pendingRes] = await Promise.all([
        api.get('/api/koperasi/kits?include_inactive=true'),
        api.get('/api/koperasi/products?include_inactive=true'),
        api.get('/api/koperasi/orders'),
        api.get('/api/koperasi/admin/stats'),
        api.get('/api/koperasi/commission/settings').catch(() => ({ data: { pum_commission_rate: 10, commission_enabled: true } })),
        api.get('/api/koperasi/commission/pending').catch(() => ({ data: { pending_commission: 0, pending_orders: 0 } }))
      ]);
      setKits(kitsRes.data);
      setProducts(productsRes.data);
      setOrders(ordersRes.data);
      setStats(statsRes.data);
      setCommissionSettings(commSettingsRes.data);
      setNewCommissionRate(commSettingsRes.data?.pum_commission_rate || 10);
      setPendingCommission(pendingRes.data);
    } catch (err) {
      toast.error('Gagal memuatkan data');
    } finally {
      setLoading(false);
    }
  };
  
  // Fetch commission report
  const fetchCommissionReport = async () => {
    setLoadingReport(true);
    try {
      const res = await api.get('/api/koperasi/commission/report');
      setCommissionReport(res.data);
    } catch (err) {
      toast.error('Gagal memuatkan laporan komisyen');
    } finally {
      setLoadingReport(false);
    }
  };

  // Fetch laporan detail (koperasi + PUM)
  const fetchLaporanDetail = async () => {
    setLaporanLoading(true);
    try {
      const res = await api.get('/api/koperasi/laporan-detail', { params: { year: laporanYear } });
      setLaporanDetail(res.data);
    } catch (err) {
      toast.error('Gagal memuatkan laporan detail');
      setLaporanDetail(null);
    } finally {
      setLaporanLoading(false);
    }
  };

  const saveCommissionSettings = async () => {
    setSavingSettings(true);
    try {
      await api.put(`/api/koperasi/commission/settings?pum_commission_rate=${parseFloat(newCommissionRate)}&commission_enabled=true`);
      toast.success(`Komisyen PUM dikemaskini ke ${newCommissionRate}%`);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal mengemaskini komisyen');
    } finally {
      setSavingSettings(false);
    }
  };

  const saveKit = async () => {
    try {
      if (editingKit) {
        await api.put(`/api/koperasi/kits/${editingKit.id}`, kitForm);
        toast.success('Kit dikemaskini');
      } else {
        await api.post('/api/koperasi/kits', kitForm);
        toast.success('Kit dicipta');
      }
      setShowKitPanel(false);
      setEditingKit(null);
      setKitForm({ name: '', description: '', image_url: '' });
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan kit');
    }
  };

  const deleteKit = async (kitId) => {
    if (!window.confirm('Padam kit ini?')) return;
    try {
      await api.delete(`/api/koperasi/kits/${kitId}`);
      toast.success('Kit dipadam');
      fetchAll();
    } catch (err) {
      toast.error('Gagal memadam kit');
    }
  };

  const saveProduct = async () => {
    try {
      const data = { 
        ...productForm, 
        price: parseFloat(productForm.price), 
        total_stock: parseInt(productForm.total_stock) || 0,
        category: productForm.category || 'others',
        has_sizes: productForm.size_type !== 'none',
        sizes_stock: productForm.size_type !== 'none' ? productForm.sizes_stock.filter(s => s.stock > 0 || s.size) : null
      };
      if (editingProduct) {
        await api.put(`/api/koperasi/products/${editingProduct.id}`, data);
        toast.success('Produk dikemaskini');
      } else {
        await api.post('/api/koperasi/products', data);
        toast.success('Produk dicipta');
      }
      setShowProductPanel(false);
      setEditingProduct(null);
      setProductForm({ kit_id: '', name: '', description: '', price: '', image_url: '', category: 'others', has_sizes: false, size_type: 'none', sizes_stock: [], total_stock: 0 });
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan produk');
    }
  };
  
  // Initialize sizes when size_type changes
  const handleSizeTypeChange = (newType) => {
    setProductForm(prev => {
      const sizes = newType === 'clothing' ? CLOTHING_SIZES : newType === 'shoes' ? SHOE_SIZES : [];
      return {
        ...prev,
        size_type: newType,
        has_sizes: newType !== 'none',
        sizes_stock: sizes.map(size => ({ size, stock: 0 }))
      };
    });
  };
  
  // Update stock for specific size
  const updateSizeStock = (index, stock) => {
    setProductForm(prev => {
      const newSizesStock = [...prev.sizes_stock];
      newSizesStock[index] = { ...newSizesStock[index], stock: parseInt(stock) || 0 };
      return { ...prev, sizes_stock: newSizesStock };
    });
  };

  const deleteProduct = async (productId) => {
    if (!window.confirm('Padam produk ini?')) return;
    try {
      await api.delete(`/api/koperasi/products/${productId}`);
      toast.success('Produk dipadam');
      fetchAll();
    } catch (err) {
      toast.error('Gagal memadam produk');
    }
  };

  const updateOrderStatus = async (orderId, status) => {
    try {
      await api.put(`/api/koperasi/orders/${orderId}/status?status=${status}`);
      toast.success('Status dikemaskini');
      fetchAll();
    } catch (err) {
      toast.error('Gagal mengemaskini status');
    }
  };

  const getStatusBadge = (status) => {
    const styles = { pending: 'bg-amber-100 text-amber-700', paid: 'bg-blue-100 text-blue-700', processing: 'bg-pastel-lavender text-violet-700', ready: 'bg-emerald-100 text-emerald-700', collected: 'bg-slate-100 text-slate-700', cancelled: 'bg-red-100 text-red-700' };
    return <span className={`px-2 py-1 rounded-full text-xs font-semibold ${styles[status] || 'bg-slate-100'}`}>{status}</span>;
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-lime-50 via-green-50 to-emerald-50 min-w-0 overflow-x-hidden" data-testid="admin-koperasi-page">
      <header className="bg-white/80 backdrop-blur-xl border-b border-lime-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-lime-500 to-green-600 rounded-xl flex items-center justify-center shadow-lg">
              <ShoppingCart className="text-white" size={22} />
            </div>
            <div>
              <h1 className="font-bold text-slate-900">Pengurusan Koperasi</h1>
              <p className="text-xs text-slate-500">Admin Dashboard</p>
            </div>
          </div>
          <button onClick={() => navigate('/dashboard')} className="px-4 py-2 text-slate-600 hover:text-slate-900">
            ← Kembali
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard icon={Package} label="Jumlah Kit" value={stats?.total_kits || 0} color="primary" />
          <StatCard icon={ShoppingBag} label="Jumlah Produk" value={stats?.total_products || 0} color="secondary" />
          <StatCard icon={Clock} label="Pesanan Tertunda" value={stats?.pending_orders || 0} color="warning" />
          <StatCard icon={Wallet} label="Jumlah Jualan" value={`RM ${(stats?.total_revenue || 0).toLocaleString()}`} color="success" />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-white rounded-xl p-1 shadow">
          {[
            { id: 'kits', label: 'Kit', icon: Package },
            { id: 'products', label: 'Produk', icon: ShoppingBag },
            { id: 'orders', label: 'Pesanan', icon: Receipt },
            { id: 'laporan', label: 'Laporan Detail', icon: FileText },
            { id: 'settings', label: 'Tetapan', icon: Settings }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition ${activeTab === tab.id ? 'bg-lime-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <tab.icon size={18} /> {tab.label}
            </button>
          ))}
        </div>

        {/* Kits Tab */}
        {activeTab === 'kits' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-slate-900">Senarai Kit</h2>
              <Button onClick={() => { setEditingKit(null); setKitForm({ name: '', description: '', image_url: '' }); setShowKitPanel(true); }}>
                <Plus size={18} /> Tambah Kit
              </Button>
            </div>
            <div className="bg-white rounded-xl shadow overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Nama Kit</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Produk</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Jumlah</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Status</th>
                    <th className="text-right px-6 py-3 text-sm font-semibold text-slate-600">Tindakan</th>
                  </tr>
                </thead>
                <tbody>
                  {kits.map(kit => (
                    <tr key={kit.id} className="border-b hover:bg-slate-50">
                      <td className="px-6 py-4 font-medium text-slate-900">{kit.name}</td>
                      <td className="px-6 py-4 text-slate-600">{kit.product_count}</td>
                      <td className="px-6 py-4 text-lime-600 font-semibold">RM {kit.total_price?.toFixed(2)}</td>
                      <td className="px-6 py-4"><Badge status={kit.is_active ? 'active' : 'inactive'}>{kit.is_active ? 'Aktif' : 'Tidak Aktif'}</Badge></td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => { setEditingKit(kit); setKitForm({ name: kit.name, description: kit.description || '', image_url: kit.image_url || '' }); setShowKitPanel(true); }} className="text-blue-600 hover:text-blue-800 mr-3"><Edit size={16} /></button>
                        <button onClick={() => deleteKit(kit.id)} className="text-red-600 hover:text-red-800"><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Products Tab */}
        {activeTab === 'products' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-slate-900">Senarai Produk</h2>
              <Button onClick={() => { setEditingProduct(null); setProductForm({ kit_id: kits[0]?.id || '', name: '', description: '', price: '', image_url: '', category: 'others', has_sizes: false, size_type: 'none', sizes_stock: [], total_stock: 0 }); setShowProductPanel(true); }}>
                <Plus size={18} /> Tambah Produk
              </Button>
            </div>
            <div className="bg-white rounded-xl shadow overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Nama Produk</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Kit</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Kategori</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Harga</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Jenis Saiz</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Stok</th>
                    <th className="text-right px-6 py-3 text-sm font-semibold text-slate-600">Tindakan</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(product => (
                    <tr key={product.id} className="border-b hover:bg-slate-50">
                      <td className="px-6 py-4 font-medium text-slate-900">{product.name}</td>
                      <td className="px-6 py-4 text-slate-600">{product.kit_name}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          commissionCategories.includes(product.category)
                            ? 'bg-pastel-lavender text-violet-700' 
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {productCategories[product.category] || product.category || 'Lain-lain'}
                        </span>
                        {commissionCategories.includes(product.category) && (
                          <DollarSign size={12} className="inline ml-1 text-amber-500" title="Komisyen PUM" />
                        )}
                      </td>
                      <td className="px-6 py-4 text-lime-600 font-semibold">RM {product.price?.toFixed(2)}</td>
                      <td className="px-6 py-4">
                        {product.size_type === 'clothing' && <span className="px-2 py-1 bg-pastel-lavender text-violet-700 rounded-full text-xs font-semibold">Pakaian</span>}
                        {product.size_type === 'shoes' && <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-semibold">Kasut</span>}
                        {(!product.size_type || product.size_type === 'none') && <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-semibold">Tiada</span>}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {product.has_sizes 
                          ? (product.sizes_stock?.reduce((sum, s) => sum + (s.stock || 0), 0) || 0) + ' unit'
                          : product.total_stock
                        }
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => { 
                            setEditingProduct(product); 
                            setProductForm({ 
                              kit_id: product.kit_id, 
                              name: product.name, 
                              description: product.description || '', 
                              price: product.price, 
                              image_url: product.image_url || '', 
                              images: product.images || [],
                              category: product.category || 'others',
                              has_sizes: product.has_sizes || false, 
                              size_type: product.size_type || 'none',
                              sizes_stock: product.sizes_stock || [],
                              total_stock: product.total_stock || 0 
                            }); 
                            setShowProductPanel(true); 
                          }} 
                          className="text-blue-600 hover:text-blue-800 mr-3"
                        >
                          <Edit size={16} />
                        </button>
                        <button onClick={() => deleteProduct(product.id)} className="text-red-600 hover:text-red-800"><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Orders Tab */}
        {activeTab === 'orders' && (
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-4">Senarai Pesanan</h2>
            <div className="bg-white rounded-xl shadow overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">No. Pesanan</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Pelajar</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Jumlah</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Tarikh</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Status</th>
                    <th className="text-right px-6 py-3 text-sm font-semibold text-slate-600">Tindakan</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(order => (
                    <tr key={order.id} className="border-b hover:bg-slate-50">
                      <td className="px-6 py-4 font-medium text-slate-900">{order.order_number}</td>
                      <td className="px-6 py-4 text-slate-600">{order.student_name}</td>
                      <td className="px-6 py-4 text-lime-600 font-semibold">RM {order.total_amount?.toFixed(2)}</td>
                      <td className="px-6 py-4 text-slate-600">{new Date(order.created_at).toLocaleDateString('ms-MY')}</td>
                      <td className="px-6 py-4">{getStatusBadge(order.status)}</td>
                      <td className="px-6 py-4 text-right">
                        <select onChange={(e) => updateOrderStatus(order.id, e.target.value)} value={order.status} className="text-sm border rounded px-2 py-1">
                          <option value="pending">Pending</option>
                          <option value="paid">Dibayar</option>
                          <option value="processing">Diproses</option>
                          <option value="ready">Sedia</option>
                          <option value="collected">Selesai</option>
                          <option value="cancelled">Batal</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Laporan Detail Tab (Koperasi + PUM) */}
        {activeTab === 'laporan' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-slate-900">Laporan Koperasi (termasuk PUM)</h2>
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-600">Tahun:</label>
                <select
                  value={laporanYear}
                  onChange={(e) => setLaporanYear(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  {[0, 1, 2, 3, 4].map((i) => {
                    const y = new Date().getFullYear() - i;
                    return <option key={y} value={y}>{y}</option>;
                  })}
                </select>
                <Button onClick={fetchLaporanDetail} loading={laporanLoading}>Muat Semula</Button>
              </div>
            </div>
            {laporanLoading && (
              <div className="flex justify-center py-12"><div className="spinner lg" /></div>
            )}
            {!laporanLoading && laporanDetail && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard icon={TrendingUp} label="Jumlah Jualan (Gabungan)" value={`RM ${(laporanDetail.ringkasan?.gabungan?.jumlah_jualan || 0).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`} color="success" />
                  <StatCard icon={Receipt} label="Jumlah Pesanan" value={laporanDetail.ringkasan?.gabungan?.jumlah_pesanan || 0} color="primary" />
                  <StatCard icon={ShoppingCart} label="Koperasi Jualan" value={`RM ${(laporanDetail.ringkasan?.koperasi?.jumlah_jualan || 0).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`} subtext={`${laporanDetail.ringkasan?.koperasi?.jumlah_pesanan || 0} pesanan`} color="primary" />
                  <StatCard icon={Tag} label="PUM Jualan" value={`RM ${(laporanDetail.ringkasan?.pum?.jumlah_jualan || 0).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`} subtext={`${laporanDetail.ringkasan?.pum?.jumlah_pesanan || 0} pesanan`} color="secondary" />
                </div>
                {laporanDetail.by_month?.length > 0 && (
                  <Card>
                    <h3 className="font-bold text-slate-900 mb-4">Jualan Mengikut Bulan</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-slate-50 border-b"><th className="text-left p-3">Bulan</th><th className="text-right p-3">Koperasi (RM)</th><th className="text-right p-3">Pesanan</th><th className="text-right p-3">PUM (RM)</th><th className="text-right p-3">Pesanan</th><th className="text-right p-3">Jumlah (RM)</th></tr></thead>
                        <tbody>
                          {laporanDetail.by_month.map((row) => (
                            <tr key={row.bulan} className="border-b hover:bg-slate-50">
                              <td className="p-3 font-medium">{row.bulan}</td>
                              <td className="p-3 text-right">{row.koperasi_jualan?.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</td>
                              <td className="p-3 text-right">{row.koperasi_pesanan}</td>
                              <td className="p-3 text-right">{row.pum_jualan?.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</td>
                              <td className="p-3 text-right">{row.pum_pesanan}</td>
                              <td className="p-3 text-right font-semibold">{row.jumlah_jualan?.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}
                {laporanDetail.by_kit?.length > 0 && (
                  <Card>
                    <h3 className="font-bold text-slate-900 mb-4">Jualan Mengikut Kit</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-slate-50 border-b"><th className="text-left p-3">Kit</th><th className="text-right p-3">Jumlah Jualan (RM)</th><th className="text-right p-3">Bil. Pesanan</th><th className="text-right p-3">Kuantiti</th></tr></thead>
                        <tbody>
                          {laporanDetail.by_kit.map((row) => (
                            <tr key={row.kit_name} className="border-b hover:bg-slate-50">
                              <td className="p-3 font-medium">{row.kit_name}</td>
                              <td className="p-3 text-right">{row.jumlah_jualan?.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</td>
                              <td className="p-3 text-right">{row.bilangan_pesanan}</td>
                              <td className="p-3 text-right">{row.quantity}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}
                {laporanDetail.pesanan_terkini?.length > 0 && (
                  <Card>
                    <h3 className="font-bold text-slate-900 mb-4">Pesanan Terkini (Koperasi & PUM)</h3>
                    <div className="overflow-x-auto max-h-80 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-slate-50"><tr className="border-b"><th className="text-left p-3">Sumber</th><th className="text-left p-3">No. Pesanan</th><th className="text-left p-3">Pelajar</th><th className="text-right p-3">Jumlah</th><th className="text-left p-3">Status</th><th className="text-left p-3">Tarikh</th></tr></thead>
                        <tbody>
                          {laporanDetail.pesanan_terkini.map((p, i) => (
                            <tr key={i} className="border-b hover:bg-slate-50">
                              <td className="p-3">{p.sumber}</td>
                              <td className="p-3">{p.order_number}</td>
                              <td className="p-3">{p.student_name}</td>
                              <td className="p-3 text-right">RM {p.total_amount?.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</td>
                              <td className="p-3">{p.status}</td>
                              <td className="p-3 text-slate-500">{p.created_at ? new Date(p.created_at).toLocaleString('ms-MY') : '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}
                {laporanDetail.inventori_pum && (laporanDetail.inventori_pum.nilai_stok > 0 || laporanDetail.inventori_pum.bilangan_item > 0) && (
                  <Card>
                    <h3 className="font-bold text-slate-900 mb-4">Inventori PUM</h3>
                    <p className="text-slate-600">Nilai stok: RM {laporanDetail.inventori_pum.nilai_stok?.toLocaleString('ms-MY', { minimumFractionDigits: 2 })} · Bilangan item: {laporanDetail.inventori_pum.bilangan_item}</p>
                  </Card>
                )}
              </>
            )}
            {!laporanLoading && !laporanDetail && (
              <p className="text-slate-500">Tiada data laporan. Pilih tahun dan klik Muat Semula.</p>
            )}
          </div>
        )}

        {/* Settings Tab - PUM Commission Integration */}
        {activeTab === 'settings' && (
          <div className="space-y-6" data-testid="koperasi-settings-tab">
            {/* PUM Commission Overview Card */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="bg-gradient-to-br from-emerald-500 to-green-600 text-white">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <Percent className="text-white" size={24} />
                  </div>
                  <div>
                    <p className="text-emerald-100 text-sm">Kadar Komisyen PUM</p>
                    <p className="text-3xl font-bold">{commissionSettings?.pum_commission_rate || 10}%</p>
                  </div>
                </div>
              </Card>
              
              <Card className="bg-gradient-to-br from-amber-500 to-orange-600 text-white">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <DollarSign className="text-white" size={24} />
                  </div>
                  <div>
                    <p className="text-amber-100 text-sm">Komisyen Tertunda</p>
                    <p className="text-3xl font-bold">RM {(pendingCommission?.pending_commission || 0).toFixed(2)}</p>
                  </div>
                </div>
                <p className="text-amber-100 text-xs mt-2">{pendingCommission?.pending_orders || 0} pesanan belum dibayar</p>
              </Card>
              
              <Card className="bg-gradient-to-br from-teal-500 to-violet-500 text-white">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <FileText className="text-white" size={24} />
                  </div>
                  <div>
                    <p className="text-white/80 text-sm">Jumlah Jualan</p>
                    <p className="text-3xl font-bold">RM {(pendingCommission?.total_sales || 0).toFixed(2)}</p>
                  </div>
                </div>
              </Card>
            </div>
            
            {/* Important Notice - Commission Only for Merchandise */}
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="text-white" size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-amber-800">Penting: Komisyen PUM</h4>
                  <p className="text-sm text-amber-700 mt-1">
                    Komisyen PUM <strong>hanya dikenakan</strong> untuk produk dalam kategori <strong>"Barangan Rasmi (Merchandise)"</strong> sahaja. 
                    Produk dalam kategori lain seperti Pakaian Seragam, Buku, dll tidak akan dikenakan komisyen PUM.
                  </p>
                </div>
              </div>
            </div>

            {/* Commission Settings Card */}
            <Card>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl flex items-center justify-center">
                  <TrendingUp className="text-white" size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Tetapan Komisyen PUM - Barangan Rasmi</h2>
                  <p className="text-sm text-slate-500">Komisyen hanya untuk kategori Barangan Rasmi (Merchandise)</p>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="bg-slate-50 rounded-xl p-6">
                  <h3 className="font-semibold text-slate-700 mb-4">Tetapan Semasa</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b border-slate-200">
                      <span className="text-slate-600">Kadar Komisyen PUM:</span>
                      <span className="text-2xl font-bold text-emerald-600">{commissionSettings?.pum_commission_rate || 10}%</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-200">
                      <span className="text-slate-600">Kategori Dikenakan:</span>
                      <span className="px-3 py-1 bg-pastel-lavender text-violet-700 rounded-full text-sm font-semibold">
                        Barangan Rasmi (Merchandise)
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-200">
                      <span className="text-slate-600">Status:</span>
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${commissionSettings?.commission_enabled !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {commissionSettings?.commission_enabled !== false ? 'Aktif' : 'Tidak Aktif'}
                      </span>
                    </div>
                    {commissionSettings?.updated_at && (
                      <div className="text-xs text-slate-400 pt-2">
                        Dikemaskini: {new Date(commissionSettings.updated_at).toLocaleString('ms-MY')}
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-emerald-50 rounded-xl p-6 border border-emerald-200">
                  <h3 className="font-semibold text-emerald-800 mb-4">Kemaskini Komisyen</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Kadar Komisyen Baru (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={newCommissionRate}
                        onChange={(e) => setNewCommissionRate(e.target.value)}
                        className="w-full h-12 rounded-lg border border-slate-200 px-4 text-xl font-bold text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        data-testid="pum-commission-rate-input"
                      />
                      <p className="text-xs text-slate-500 mt-2">
                        Contoh: Jika kadar 10%, setiap RM100 jualan Koperasi, PUM mendapat RM10 sebagai komisyen
                      </p>
                    </div>
                    <Button 
                      onClick={saveCommissionSettings} 
                      loading={savingSettings}
                      className="w-full bg-emerald-600 hover:bg-emerald-700"
                      data-testid="save-commission-btn"
                    >
                      <Save size={18} /> Simpan Perubahan
                    </Button>
                  </div>
                </div>
              </div>

              {/* How Commission Works */}
              <div className="mt-6 bg-gradient-to-r from-pastel-mint to-pastel-lavender border border-pastel-lilac rounded-xl p-5">
                <h4 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
                  <CheckCircle size={18} />
                  Cara Komisyen Berfungsi
                </h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-sm text-blue-700 flex items-start gap-2">
                      <span className="w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs flex-shrink-0">1</span>
                      <strong>Hanya</strong> produk kategori "Barangan Rasmi (Merchandise)" dikenakan komisyen PUM
                    </p>
                    <p className="text-sm text-blue-700 flex items-start gap-2">
                      <span className="w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs flex-shrink-0">2</span>
                      Komisyen dikira dari harga jualan Barangan Rasmi sahaja
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-blue-700 flex items-start gap-2">
                      <span className="w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs flex-shrink-0">3</span>
                      Produk lain (Pakaian Seragam, Buku, dll) tidak dikenakan komisyen
                    </p>
                    <p className="text-sm text-blue-700 flex items-start gap-2">
                      <span className="w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs flex-shrink-0">4</span>
                      Koperasi akan berhubung dengan PUM untuk bayaran komisyen
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Commission Report Button */}
              <div className="mt-6 flex justify-end">
                <Button
                  variant="outline"
                  onClick={fetchCommissionReport}
                  loading={loadingReport}
                >
                  <FileText size={18} />
                  Lihat Laporan Komisyen
                </Button>
              </div>
            </Card>
            
            {/* Commission Report Modal */}
            {commissionReport && (
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <FileText size={20} />
                    Laporan Komisyen Barangan Rasmi
                  </h3>
                  <button onClick={() => setCommissionReport(null)} className="text-slate-400 hover:text-slate-600">
                    <X size={20} />
                  </button>
                </div>
                
                <div className="grid gap-4 md:grid-cols-4 mb-6">
                  <div className="bg-slate-50 rounded-lg p-4 text-center">
                    <p className="text-sm text-slate-500">Jumlah Pesanan</p>
                    <p className="text-2xl font-bold text-slate-800">{commissionReport.summary?.total_orders || 0}</p>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-4 text-center">
                    <p className="text-sm text-emerald-600">Jumlah Jualan</p>
                    <p className="text-2xl font-bold text-emerald-700">RM {(commissionReport.summary?.total_sales || 0).toFixed(2)}</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-4 text-center">
                    <p className="text-sm text-amber-600">Komisyen PUM ({commissionReport.summary?.current_commission_rate}%)</p>
                    <p className="text-2xl font-bold text-amber-700">RM {(commissionReport.summary?.total_commission || 0).toFixed(2)}</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-4 text-center">
                    <p className="text-sm text-blue-600">Bersih untuk Koperasi</p>
                    <p className="text-2xl font-bold text-blue-700">RM {(commissionReport.summary?.net_for_koperasi || 0).toFixed(2)}</p>
                  </div>
                </div>
                
                {commissionReport.orders && commissionReport.orders.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-slate-600">No. Pesanan</th>
                          <th className="px-4 py-2 text-left text-slate-600">Pelajar</th>
                          <th className="px-4 py-2 text-right text-slate-600">Jumlah</th>
                          <th className="px-4 py-2 text-right text-slate-600">Komisyen</th>
                          <th className="px-4 py-2 text-right text-slate-600">Bersih</th>
                        </tr>
                      </thead>
                      <tbody>
                        {commissionReport.orders.slice(0, 10).map(order => (
                          <tr key={order.id} className="border-b">
                            <td className="px-4 py-2 font-medium">{order.order_number}</td>
                            <td className="px-4 py-2 text-slate-600">{order.student_name}</td>
                            <td className="px-4 py-2 text-right">RM {order.total_amount?.toFixed(2)}</td>
                            <td className="px-4 py-2 text-right text-amber-600">RM {order.commission_amount?.toFixed(2)}</td>
                            <td className="px-4 py-2 text-right text-emerald-600">RM {order.net_amount?.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}
          </div>
        )}
      </main>

      {/* Kit Slide-in Panel */}
      <AnimatePresence>
        {showKitPanel && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50" onClick={() => setShowKitPanel(false)} />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col"
            >
              <div className="p-6 border-b bg-gradient-to-r from-lime-500 to-green-600 text-white">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold flex items-center gap-2"><Package size={24} />{editingKit ? 'Edit Kit' : 'Tambah Kit'}</h3>
                  <button onClick={() => setShowKitPanel(false)} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-white/20 rounded-lg transition" aria-label="Tutup"><X size={24} /></button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <Input label="Nama Kit" value={kitForm.name} onChange={(e) => setKitForm({ ...kitForm, name: e.target.value })} required />
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">Penerangan</label>
                  <textarea value={kitForm.description} onChange={(e) => setKitForm({ ...kitForm, description: e.target.value })} className="w-full border rounded-lg p-3 text-sm" rows={3} />
                </div>
                <Input label="URL Gambar" value={kitForm.image_url} onChange={(e) => setKitForm({ ...kitForm, image_url: e.target.value })} placeholder="https://..." />
              </div>
              <div className="border-t p-6 bg-white flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowKitPanel(false)}>Batal</Button>
                <Button className="flex-1" onClick={saveKit}>{editingKit ? 'Kemaskini' : 'Simpan'}</Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Product Slide-in Panel */}
      <AnimatePresence>
        {showProductPanel && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50" onClick={() => setShowProductPanel(false)} />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl z-50 flex flex-col"
            >
              <div className="p-6 border-b bg-gradient-to-r from-lime-500 to-green-600 text-white">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold flex items-center gap-2"><ShoppingBag size={24} />{editingProduct ? 'Edit Produk' : 'Tambah Produk'}</h3>
                  <button onClick={() => setShowProductPanel(false)} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-white/20 rounded-lg transition" aria-label="Tutup"><X size={24} /></button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <Select label="Kit" value={productForm.kit_id} onChange={(e) => setProductForm({ ...productForm, kit_id: e.target.value })} required>
                  <option value="">Pilih Kit</option>
                  {kits.map(kit => <option key={kit.id} value={kit.id}>{kit.name}</option>)}
                </Select>
                <Input label="Nama Produk" value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} required />
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">Penerangan</label>
                  <textarea value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} className="w-full border rounded-lg p-3 text-sm" rows={2} />
                </div>
                <Input label="Harga (RM)" type="number" step="0.01" value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} required />
                
                {/* Product Category Selection - NEW */}
                <div className="space-y-3 p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Tag size={18} className="text-amber-600" />
                    <label className="block text-sm font-semibold text-amber-800">Kategori Produk</label>
                  </div>
                  <select
                    value={productForm.category || 'others'}
                    onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                    className="w-full h-11 rounded-lg border border-amber-300 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    data-testid="product-category-select"
                  >
                    {Object.keys(productCategories).length > 0 
                      ? Object.entries(productCategories).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))
                      : <option value="others">Lain-lain</option>
                    }
                  </select>
                  {commissionCategories.includes(productForm.category) && (
                    <div className="flex items-center gap-2 mt-2 p-2 bg-pastel-lavender rounded-lg">
                      <DollarSign size={16} className="text-violet-600" />
                      <span className="text-xs text-violet-700 font-medium">
                        Kategori ini dikenakan komisyen PUM ({commissionSettings?.pum_commission_rate || 10}%)
                      </span>
                    </div>
                  )}
                </div>
                
                {/* Product Images Upload */}
                {editingProduct && editingProduct.id && (
                  <div className="space-y-3 p-4 bg-gradient-to-br from-pastel-lavender to-pastel-rose rounded-xl border border-pastel-lilac">
                    <ProductImageUpload
                      productId={editingProduct.id}
                      productType="koperasi"
                      existingImages={editingProduct.images || []}
                      onImagesChange={(newImages) => {
                        setProductForm(prev => ({ ...prev, images: newImages }));
                        setEditingProduct(prev => ({ ...prev, images: newImages }));
                      }}
                      maxImages={10}
                    />
                  </div>
                )}
                
                {/* URL Gambar (fallback for new products) */}
                {!editingProduct && (
                  <Input label="URL Gambar (Opsional)" value={productForm.image_url} onChange={(e) => setProductForm({ ...productForm, image_url: e.target.value })} placeholder="https://..." />
                )}
                <p className="text-xs text-slate-500">
                  {editingProduct ? 'Upload gambar selepas simpan produk.' : 'Anda boleh upload gambar selepas produk disimpan.'}
                </p>
                
                {/* Size Type Selection */}
                <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="block text-sm font-semibold text-slate-700">Jenis Saiz Produk</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleSizeTypeChange('none')}
                      className={`p-3 rounded-lg text-sm font-medium transition-all ${
                        productForm.size_type === 'none' 
                          ? 'bg-lime-600 text-white shadow-lg' 
                          : 'bg-white border border-slate-200 text-slate-600 hover:border-lime-400'
                      }`}
                    >
                      Tiada Saiz
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSizeTypeChange('clothing')}
                      className={`p-3 rounded-lg text-sm font-medium transition-all ${
                        productForm.size_type === 'clothing' 
                          ? 'bg-violet-600 text-white shadow-pastel' 
                          : 'bg-white border border-slate-200 text-slate-600 hover:border-violet-400'
                      }`}
                    >
                      Pakaian
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSizeTypeChange('shoes')}
                      className={`p-3 rounded-lg text-sm font-medium transition-all ${
                        productForm.size_type === 'shoes' 
                          ? 'bg-orange-600 text-white shadow-lg' 
                          : 'bg-white border border-slate-200 text-slate-600 hover:border-orange-400'
                      }`}
                    >
                      Kasut
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">
                    {productForm.size_type === 'clothing' && 'Saiz pakaian: XS, S, M, L, XL, XXL, 3XL'}
                    {productForm.size_type === 'shoes' && 'Saiz kasut: 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45'}
                    {productForm.size_type === 'none' && 'Produk ini tidak memerlukan pilihan saiz'}
                  </p>
                </div>
                
                {/* Size Stock Input */}
                {productForm.size_type !== 'none' && productForm.sizes_stock?.length > 0 && (
                  <div className="space-y-3 p-4 bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-semibold text-slate-700">
                        Stok Mengikut Saiz ({productForm.size_type === 'clothing' ? 'Pakaian' : 'Kasut'})
                      </label>
                      <span className="text-xs text-slate-500">
                        Jumlah: {productForm.sizes_stock.reduce((sum, s) => sum + (s.stock || 0), 0)} unit
                      </span>
                    </div>
                    <div className={`grid gap-2 ${productForm.size_type === 'shoes' ? 'grid-cols-4' : 'grid-cols-4'}`}>
                      {productForm.sizes_stock.map((sizeInfo, idx) => (
                        <div key={sizeInfo.size} className="bg-white rounded-lg p-2 border border-slate-200 shadow-sm">
                          <div className={`text-center text-xs font-bold mb-1 ${
                            productForm.size_type === 'clothing' ? 'text-violet-600' : 'text-orange-600'
                          }`}>
                            {sizeInfo.size}
                          </div>
                          <input
                            type="number"
                            min="0"
                            value={sizeInfo.stock || ''}
                            onChange={(e) => updateSizeStock(idx, e.target.value)}
                            className="w-full text-center text-sm border border-slate-200 rounded py-1 focus:outline-none focus:ring-2 focus:ring-lime-500"
                            placeholder="0"
                          />
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      Masukkan kuantiti stok untuk setiap saiz. Saiz dengan stok 0 akan ditunjukkan sebagai "Habis Stok"
                    </p>
                  </div>
                )}
                
                {/* Total Stock for non-sized products */}
                {productForm.size_type === 'none' && (
                  <Input 
                    label="Jumlah Stok" 
                    type="number" 
                    value={productForm.total_stock} 
                    onChange={(e) => setProductForm({ ...productForm, total_stock: e.target.value })} 
                    placeholder="Masukkan jumlah stok"
                  />
                )}
              </div>
              <div className="border-t p-6 bg-white flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowProductPanel(false)}>Batal</Button>
                <Button className="flex-1" onClick={saveProduct}>{editingProduct ? 'Kemaskini' : 'Simpan'}</Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminKoperasiPage;
