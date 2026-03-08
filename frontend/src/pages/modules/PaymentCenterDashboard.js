import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { 
  Search, Bell, ChevronRight, Plus, Check,
  Home, GraduationCap, Bus, Heart, Store, ShoppingBag, History,
  Settings, CreditCard, User, Receipt
} from 'lucide-react';
import { useAuth } from '../../App';
import api from '../../services/api';

// ============ CONSTANTS ============
import { TINGKATAN_LABELS } from '../../constants';

// Child card colors
const CHILD_COLORS = [
  { bg: 'from-blue-50 to-cyan-50', border: 'border-blue-200', accent: 'text-blue-600' },
  { bg: 'from-pastel-lavender to-pastel-rose', border: 'border-pastel-lilac', accent: 'text-violet-600' },
  { bg: 'from-amber-50 to-orange-50', border: 'border-amber-200', accent: 'text-amber-600' },
  { bg: 'from-emerald-50 to-teal-50', border: 'border-emerald-200', accent: 'text-emerald-600' },
  { bg: 'from-rose-50 to-red-50', border: 'border-rose-200', accent: 'text-rose-600' }
];

// ============ SIDEBAR NAVIGATION ============
const SidebarItem = ({ icon: Icon, label, active, onClick, badge }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
      active 
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' 
        : 'text-slate-600 hover:bg-slate-100'
    }`}
    data-testid={`sidebar-${label.toLowerCase().replace(/\s+/g, '-')}`}
  >
    <Icon size={20} />
    <span className="font-medium flex-1 text-left">{label}</span>
    {badge && (
      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
        active ? 'bg-white/20 text-white' : 'bg-red-500 text-white'
      }`}>
        {badge}
      </span>
    )}
  </button>
);

// ============ CHILD CARD ============
const ChildCard = ({ child, index, onClick }) => {
  const colors = CHILD_COLORS[index % CHILD_COLORS.length];
  const remaining = (child.total_yuran || 0) - (child.paid_yuran || 0);
  const isPaid = remaining <= 0;
  const isPartial = child.paid_yuran > 0 && remaining > 0;
  
  // Get initials for avatar
  const initials = child.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'NA';
  
  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`relative min-w-[220px] p-4 rounded-2xl bg-gradient-to-br ${colors.bg} border ${colors.border} cursor-pointer shadow-sm hover:shadow-lg transition-all`}
      data-testid={`child-card-${child.id}`}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className={`w-12 h-12 rounded-full bg-white flex items-center justify-center ${colors.accent} font-bold text-lg shadow-sm`}>
          {child.avatar_url ? (
            <img src={child.avatar_url} alt={child.full_name} className="w-full h-full rounded-full object-cover" />
          ) : (
            initials
          )}
        </div>
        
        {/* Info */}
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-slate-800 truncate">{child.full_name}</h4>
          <p className="text-xs text-slate-500">
            {TINGKATAN_LABELS[child.tingkatan] || `Tingkatan ${child.tingkatan}`} {child.kelas || ''}
          </p>
        </div>
        
        <ChevronRight size={18} className="text-slate-400 flex-shrink-0" />
      </div>
      
      {/* Yuran Info */}
      <div className="mt-3 pt-3 border-t border-slate-200/50 flex items-center justify-between">
        <div>
          <span className="text-xs text-slate-500">Yuran:</span>
          <span className={`ml-1 font-bold ${isPaid ? 'text-emerald-600' : 'text-red-600'}`}>
            RM{remaining > 0 ? remaining.toFixed(0) : '0'}
          </span>
        </div>
        
        {/* Status Badge */}
        {isPaid ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold">
            <Check size={12} /> Dibayar
          </span>
        ) : isPartial ? (
          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">
            Perlu Bayar
          </span>
        ) : (
          <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-semibold">
            Belum Bayar
          </span>
        )}
      </div>
    </motion.div>
  );
};

// ============ QUICK PAYMENT BUTTON ============
const QuickPaymentButton = ({ icon: Icon, label, color, badge, onClick }) => (
  <motion.button
    whileHover={{ scale: 1.05, y: -4 }}
    whileTap={{ scale: 0.95 }}
    onClick={onClick}
    className={`relative flex flex-col items-center gap-2 p-4 rounded-2xl ${color} transition-all shadow-sm hover:shadow-lg min-w-[100px]`}
    data-testid={`quick-pay-${label.toLowerCase().replace(/\s+/g, '-')}`}
  >
    {badge && (
      <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
        {badge}
      </span>
    )}
    <div className="w-12 h-12 rounded-xl bg-white/80 flex items-center justify-center shadow-sm">
      <Icon size={24} />
    </div>
    <span className="text-xs font-semibold text-slate-700 text-center whitespace-nowrap">{label}</span>
    <div className={`w-8 h-1 rounded-full ${color.includes('blue') ? 'bg-blue-400' : color.includes('green') ? 'bg-green-400' : color.includes('orange') ? 'bg-orange-400' : 'bg-slate-400'}`} />
  </motion.button>
);

// ============ PAYMENT HISTORY ITEM ============
const PaymentHistoryItem = ({ payment }) => {
  const getIcon = () => {
    switch (payment.type) {
      case 'yuran': return <GraduationCap className="text-amber-600" size={18} />;
      case 'bus': return <Bus className="text-blue-600" size={18} />;
      case 'infaq': case 'sumbangan': return <Heart className="text-pink-600" size={18} />;
      case 'koperasi': return <ShoppingBag className="text-emerald-600" size={18} />;
      default: return <Receipt className="text-slate-600" size={18} />;
    }
  };
  
  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
        {getIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-800 truncate text-sm">{payment.description}</p>
        <p className="text-xs text-slate-500">{payment.date}</p>
      </div>
      <div className="text-right">
        <p className="font-bold text-red-600 text-sm">RM{payment.amount?.toFixed(2)}</p>
      </div>
      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold">
        Berjaya
      </span>
    </div>
  );
};

// ============ MAIN COMPONENT ============
const PaymentCenterDashboard = () => {
  const navigate = useNavigate();
  const authContext = useAuth();
  const user = authContext?.user;
  
  // State
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Data state
  const [children, setChildren] = useState([]);
  const [pendingItems, setPendingItems] = useState({
    yuran: [], bus: [], infaq: [], koperasi: []
  });
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [summaryTotals, setSummaryTotals] = useState({
    yuran: 0, bus: 0, sumbangan: 0, koperasi: 0, total: 0
  });
  const [historyFilter, setHistoryFilter] = useState('semua');
  
  // Fetch all data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [childrenRes, pendingRes, receiptsRes] = await Promise.all([
        api.get('/api/students'),
        api.get('/api/payment-center/pending-items'),
        api.get('/api/payment-center/receipts?limit=10')
      ]);
      
      // Process children with yuran info
      const childrenData = childrenRes.data || [];
      const yuranData = pendingRes.data?.yuran || [];
      
      // Map yuran to children
      const childrenWithYuran = childrenData.map(child => {
        const childYuran = yuranData.filter(y => y.student_id === child.id);
        const totalYuran = childYuran.reduce((sum, y) => sum + (y.original_amount || 0), 0);
        const paidYuran = childYuran.reduce((sum, y) => sum + (y.paid_amount || 0), 0);
        
        return {
          ...child,
          id: child.id || child._id,
          total_yuran: totalYuran,
          paid_yuran: paidYuran
        };
      });
      
      setChildren(childrenWithYuran);
      setPendingItems(pendingRes.data || {});
      
      // Calculate summary totals
      const yuranTotal = yuranData.reduce((sum, y) => sum + (y.amount || 0), 0);
      const busTotal = (pendingRes.data?.bus || []).reduce((sum, b) => sum + (b.amount || 0), 0);
      const infaqTotal = 0; // Sumbangan is optional
      const koopTotal = (pendingRes.data?.koperasi || []).reduce((sum, k) => sum + (k.amount || 0), 0);
      
      setSummaryTotals({
        yuran: yuranTotal,
        bus: busTotal,
        sumbangan: infaqTotal,
        koperasi: koopTotal,
        total: yuranTotal + busTotal + infaqTotal + koopTotal
      });
      
      // Process payment history
      const receipts = receiptsRes.data?.receipts || [];
      const historyItems = receipts.map(r => ({
        id: r.receipt_id,
        type: r.items?.[0]?.item_type || 'other',
        description: r.items?.[0]?.name || `Pembayaran ${r.receipt_number}`,
        amount: r.total_amount,
        date: new Date(r.payment_date).toLocaleDateString('ms-MY', { 
          day: 'numeric', month: 'short', year: 'numeric' 
        }),
        status: r.status
      }));
      setPaymentHistory(historyItems);
      
    } catch (err) {
      console.error('Failed to fetch data:', err);
      toast.error('Gagal memuatkan data');
    } finally {
      setLoading(false);
    }
  }, []);
  
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  // Handle navigation
  const handleSectionChange = (section) => {
    setActiveSection(section);
    if (section === 'yuran') {
      navigate('/yuran');
    } else if (section === 'tiket-bas') {
      navigate('/bus-tickets');
    } else if (section === 'tabung') {
      navigate('/tabung');
    } else if (section === 'marketplace') {
      navigate('/marketplace');
    } else if (section === 'koperasi') {
      navigate('/koperasi');
    } else if (section === 'sejarah') {
      navigate('/payments-parent');
    } else if (section === 'tetapan') {
      navigate('/settings');
    }
  };
  
  const handleChildClick = (child) => {
    navigate(`/yuran?student=${child.id}`);
  };
  
  const handleQuickPayment = (type) => {
    if (type === 'bus') navigate('/bus-tickets');
    else if (type === 'tabung') navigate('/tabung');
    else if (type === 'marketplace') navigate('/marketplace');
    else if (type === 'koperasi') navigate('/koperasi');
  };
  
  const handlePayNow = () => {
    navigate('/payment-center?tab=troli');
  };
  
  // Filter history
  const filteredHistory = paymentHistory.filter(p => {
    if (historyFilter === 'semua') return true;
    if (historyFilter === 'yuran') return p.type === 'yuran' || p.type === 'yuran_partial';
    if (historyFilter === 'tiket') return p.type === 'bus';
    if (historyFilter === 'sumbangan') return p.type === 'infaq' || p.type === 'sumbangan';
    return p.type === historyFilter;
  });
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-slate-600 font-medium">Memuatkan Pusat Bayaran...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-pastel-mint/20 to-pastel-lavender/20" data-testid="payment-center-dashboard">
      {/* ============ HEADER ============ */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
          <div className="h-16 flex items-center justify-between gap-4">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-violet-500 rounded-xl flex items-center justify-center shadow-pastel">
                <CreditCard className="text-white" size={22} />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-800">
                  PUSAT <span className="text-blue-600">BAYARAN</span>
                </h1>
              </div>
            </div>
            
            {/* Search */}
            <div className="flex-1 max-w-md hidden md:block">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="Cari bayaran..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-100 border-0 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  data-testid="search-input"
                />
              </div>
            </div>
            
            {/* Right Side */}
            <div className="flex items-center gap-4">
              {/* Notification */}
              <button className="relative p-2 hover:bg-slate-100 rounded-xl transition-colors" data-testid="notification-btn">
                <Bell size={22} className="text-slate-600" />
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  3
                </span>
              </button>
              
              {/* Profile */}
              <div className="flex items-center gap-2 pl-4 border-l border-slate-200">
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-slate-500">Selamat Datang,</p>
                  <p className="text-sm font-semibold text-slate-800">{user?.full_name || 'Pengguna'}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold">
                  {user?.full_name?.charAt(0) || 'P'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>
      
      {/* ============ MAIN LAYOUT ============ */}
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6 py-6">
        <div className="flex gap-6">
          {/* ============ LEFT SIDEBAR ============ */}
          <aside className="hidden lg:block w-56 flex-shrink-0">
            <div className="sticky top-24 space-y-2">
              <SidebarItem 
                icon={Home} 
                label="Dashboard" 
                active={activeSection === 'dashboard'}
                onClick={() => setActiveSection('dashboard')}
              />
              <SidebarItem 
                icon={GraduationCap} 
                label="Yuran Anak" 
                active={activeSection === 'yuran'}
                onClick={() => handleSectionChange('yuran')}
              />
              <SidebarItem 
                icon={Bus} 
                label="Tiket Bas" 
                active={activeSection === 'tiket-bas'}
                onClick={() => handleSectionChange('tiket-bas')}
              />
              <SidebarItem 
                icon={Heart} 
                label="Tabung & Sumbangan" 
                active={activeSection === 'tabung'}
                onClick={() => handleSectionChange('tabung')}
              />
              <SidebarItem 
                icon={Store} 
                label="Marketplace" 
                active={activeSection === 'marketplace'}
                onClick={() => handleSectionChange('marketplace')}
              />
              <SidebarItem 
                icon={ShoppingBag} 
                label="Koperasi" 
                active={activeSection === 'koperasi'}
                onClick={() => handleSectionChange('koperasi')}
              />
              <SidebarItem 
                icon={History} 
                label="Sejarah Bayaran" 
                active={activeSection === 'sejarah'}
                onClick={() => handleSectionChange('sejarah')}
              />
              
              <SidebarItem 
                icon={Settings} 
                label="Tetapan" 
                active={activeSection === 'tetapan'}
                onClick={() => handleSectionChange('tetapan')}
              />
            </div>
          </aside>
          
          {/* ============ MAIN CONTENT ============ */}
          <main className="flex-1 min-w-0 space-y-6">
            {/* Anak-Anak Saya Section */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-800">Anak-Anak Saya</h2>
                <button 
                  onClick={() => navigate('/children')}
                  className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  <Plus size={16} /> Tambah Anak
                </button>
              </div>
              
              <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                {children.length === 0 ? (
                  <div className="flex-1 text-center py-8 text-slate-500">
                    <User size={40} className="mx-auto mb-2 text-slate-300" />
                    <p>Tiada anak didaftarkan</p>
                    <button 
                      onClick={() => navigate('/children')}
                      className="mt-2 text-blue-600 hover:underline text-sm"
                    >
                      Daftarkan anak sekarang
                    </button>
                  </div>
                ) : (
                  children.map((child, index) => (
                    <ChildCard 
                      key={child.id} 
                      child={child} 
                      index={index}
                      onClick={() => handleChildClick(child)}
                    />
                  ))
                )}
              </div>
            </section>
            
            {/* Bayaran Pantas Section */}
            <section>
              <h2 className="text-lg font-bold text-slate-800 mb-4">Bayaran Pantas</h2>
              <div className="flex gap-4 overflow-x-auto pb-2">
                <QuickPaymentButton 
                  icon={Bus} 
                  label="Tiket Bas" 
                  color="bg-blue-50 text-blue-600"
                  badge={pendingItems.bus?.length || null}
                  onClick={() => handleQuickPayment('bus')}
                />
                <QuickPaymentButton 
                  icon={Heart} 
                  label="Tabung & Sumbangan" 
                  color="bg-green-50 text-green-600"
                  onClick={() => handleQuickPayment('tabung')}
                />
                <QuickPaymentButton 
                  icon={Store} 
                  label="Marketplace" 
                  color="bg-orange-50 text-orange-600"
                  badge={5}
                  onClick={() => handleQuickPayment('marketplace')}
                />
                <QuickPaymentButton 
                  icon={ShoppingBag} 
                  label="Koperasi" 
                  color="bg-pastel-lavender text-violet-600"
                  onClick={() => handleQuickPayment('koperasi')}
                />
              </div>
            </section>
            
            {/* Sejarah Bayaran Section */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-800">Sejarah Bayaran</h2>
                <button 
                  onClick={() => navigate('/payments-parent')}
                  className="text-slate-500 hover:text-slate-700"
                >
                  •••
                </button>
              </div>
              
              {/* Filter Tabs */}
              <div className="flex gap-2 mb-4 overflow-x-auto">
                {['Semua', 'Yuran', 'Tiket', 'Sumbangan', 'Lain-lain'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setHistoryFilter(tab.toLowerCase())}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                      historyFilter === tab.toLowerCase()
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              
              {/* History List */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                {filteredHistory.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <History size={40} className="mx-auto mb-2 text-slate-300" />
                    <p>Tiada sejarah pembayaran</p>
                  </div>
                ) : (
                  filteredHistory.map(payment => (
                    <PaymentHistoryItem key={payment.id} payment={payment} />
                  ))
                )}
              </div>
            </section>
          </main>
          
          {/* ============ RIGHT SIDEBAR ============ */}
          <aside className="hidden xl:block w-72 flex-shrink-0">
            <div className="sticky top-24 space-y-6">
              {/* Jumlah Perlu Dibayar */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-4">Jumlah Perlu Dibayar</h3>
                
                <div className="text-center mb-4">
                  <p className="text-3xl font-bold text-red-600">
                    RM {summaryTotals.total.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                
                {/* Breakdown */}
                <div className="space-y-2 mb-6">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Yuran Anak</span>
                    <span className="font-medium">RM{summaryTotals.yuran.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Tiket Bas</span>
                    <span className="font-medium">RM{summaryTotals.bus.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Sumbangan</span>
                    <span className="font-medium">RM{summaryTotals.sumbangan.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Koperasi</span>
                    <span className="font-medium">RM{summaryTotals.koperasi.toFixed(2)}</span>
                  </div>
                </div>
                
                {/* Pay Now Button */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handlePayNow}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 transition-colors"
                  data-testid="pay-now-btn"
                >
                  <CreditCard size={18} />
                  Bayar Sekarang
                </motion.button>
              </div>
            </div>
          </aside>
        </div>
      </div>
      
      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-2 z-50">
        <div className="flex justify-around">
          {[
            { icon: Home, label: 'Dashboard', section: 'dashboard' },
            { icon: GraduationCap, label: 'Yuran', section: 'yuran' },
            { icon: Bus, label: 'Bas', section: 'tiket-bas' },
            { icon: ShoppingBag, label: 'Koperasi', section: 'koperasi' },
            { icon: History, label: 'Sejarah', section: 'sejarah' }
          ].map(item => (
            <button
              key={item.section}
              onClick={() => item.section === 'dashboard' ? setActiveSection('dashboard') : handleSectionChange(item.section)}
              className={`flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors ${
                activeSection === item.section 
                  ? 'text-blue-600' 
                  : 'text-slate-500'
              }`}
            >
              <item.icon size={20} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default PaymentCenterDashboard;
