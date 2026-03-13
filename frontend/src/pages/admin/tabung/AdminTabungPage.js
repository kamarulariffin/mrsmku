import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Gift, Target, Users, Wallet, Edit, Trash2, Plus, X, Eye,
  TrendingUp, Calendar, Download, RefreshCw, BarChart3, 
  Grid3X3, DollarSign, Receipt, FileText
} from 'lucide-react';
import api from '../../../services/api';

// ===================== SHARED COMPONENTS =====================

const Spinner = ({ size = 'md' }) => (
  <div className={`animate-spin rounded-full border-2 border-t-transparent border-primary-600 ${size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'}`} />
);

const Button = ({ children, variant = 'primary', size = 'md', loading, disabled, className = '', ...props }) => {
  const variants = {
    primary: 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg hover:shadow-xl',
    secondary: 'bg-gradient-to-r from-violet-600 to-fuchsia-500 hover:from-violet-700 hover:to-fuchsia-600 text-white',
    outline: 'border-2 border-emerald-600 text-emerald-700 hover:bg-emerald-50',
    ghost: 'text-slate-600 hover:text-emerald-700 hover:bg-slate-100',
    danger: 'bg-red-600 hover:bg-red-700 text-white'
  };
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-5 py-2.5 text-sm', lg: 'px-6 py-3 text-base' };
  return (
    <button className={`font-medium rounded-xl transition-all duration-200 flex items-center justify-center gap-2 ${variants[variant]} ${sizes[size]} ${className} ${disabled || loading ? 'opacity-60 cursor-not-allowed' : ''}`} disabled={disabled || loading} {...props}>
      {loading ? <Spinner size="sm" /> : null}{children}
    </button>
  );
};

const Input = ({ label, error, icon: Icon, ...props }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
    <div className="relative">
      {Icon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon size={18} /></div>}
      <input className={`flex h-11 w-full rounded-xl border bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 transition-all ${Icon ? 'pl-10' : ''} ${error ? 'border-red-500' : 'border-slate-200'}`} {...props} />
    </div>
    {error && <p className="text-sm text-red-500">{error}</p>}
  </div>
);

const Select = ({ label, error, children, ...props }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
    <select className={`flex h-11 w-full rounded-xl border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all ${error ? 'border-red-500' : 'border-slate-200'}`} {...props}>{children}</select>
    {error && <p className="text-sm text-red-500">{error}</p>}
  </div>
);

const Card = ({ children, className = '', ...props }) => (
  <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow ${className}`} {...props}>{children}</div>
);

const Badge = ({ type, children }) => {
  const styles = {
    slot: 'bg-violet-100 text-violet-800 border border-violet-200',
    amount: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
    active: 'bg-green-100 text-green-800',
    paused: 'bg-amber-100 text-amber-800',
    completed: 'bg-blue-100 text-blue-800',
    cancelled: 'bg-red-100 text-red-800',
    pending: 'bg-amber-100 text-amber-800',
    success: 'bg-green-100 text-green-800'
  };
  return <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${styles[type] || 'bg-slate-100 text-slate-800'}`}>{children}</span>;
};

const StatCard = ({ icon: Icon, label, value, subtext, color = 'emerald', trend }) => {
  const colors = {
    emerald: 'from-emerald-500 to-teal-500',
    violet: 'from-violet-500 to-fuchsia-500',
    amber: 'from-amber-500 to-orange-500',
    blue: 'from-blue-500 to-teal-500'
  };
  return (
    <Card className="p-5 overflow-hidden relative">
      <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-gradient-to-br opacity-10 ${colors[color]}" />
      <div className="flex items-start justify-between relative z-10">
        <div>
          <p className="text-sm text-slate-500 font-medium">{label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
          {subtext && <p className="text-xs text-slate-400 mt-1">{subtext}</p>}
          {trend && (
            <div className="flex items-center gap-1 mt-2">
              <TrendingUp size={14} className="text-emerald-500" />
              <span className="text-xs text-emerald-600 font-medium">{trend}</span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-xl bg-gradient-to-br ${colors[color]} text-white shadow-lg`}>
          <Icon size={24} />
        </div>
      </div>
    </Card>
  );
};

const ProgressBar = ({ percent, color = 'emerald' }) => {
  const colors = {
    emerald: 'from-emerald-500 to-teal-500',
    violet: 'from-violet-500 to-fuchsia-500'
  };
  return (
    <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(percent, 100)}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className={`h-full rounded-full bg-gradient-to-r ${colors[color]}`}
      />
    </div>
  );
};

// ===================== MAIN PAGE =====================

export default function AdminTabungPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [donations, setDonations] = useState([]);
  const [stats, setStats] = useState(null);
  const [realtimeReport, setRealtimeReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('campaigns');
  const [showCampaignPanel, setShowCampaignPanel] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  
  const [campaignForm, setCampaignForm] = useState({
    title: '',
    description: '',
    image_url: '',
    campaign_type: 'slot',
    total_slots: 100,
    price_per_slot: 25,
    min_slots: 1,
    max_slots: 5000,
    target_amount: 10000,
    min_amount: 1,
    max_amount: 100000
  });

  const fetchData = useCallback(async () => {
    try {
      const [campaignsRes, donationsRes, statsRes, realtimeRes] = await Promise.all([
        api.get('/api/tabung/campaigns'),
        api.get('/api/tabung/donations'),
        api.get('/api/tabung/stats'),
        api.get('/api/tabung/reports/real-time')
      ]);
      setCampaigns(campaignsRes.data);
      setDonations(donationsRes.data);
      setStats(statsRes.data);
      setRealtimeReport(realtimeRes.data);
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuatkan data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openAddPanel = () => {
    setEditingCampaign(null);
    setCampaignForm({
      title: '',
      description: '',
      image_url: '',
      campaign_type: 'slot',
      total_slots: 100,
      price_per_slot: 25,
      min_slots: 1,
      max_slots: 5000,
      target_amount: 10000,
      min_amount: 1,
      max_amount: 100000
    });
    setShowCampaignPanel(true);
  };

  const openEditPanel = (campaign) => {
    setEditingCampaign(campaign);
    setCampaignForm({
      title: campaign.title,
      description: campaign.description || '',
      image_url: campaign.image_url || '',
      campaign_type: campaign.campaign_type,
      total_slots: campaign.total_slots || 100,
      price_per_slot: campaign.price_per_slot || 25,
      min_slots: campaign.min_slots || 1,
      max_slots: campaign.max_slots || 5000,
      target_amount: campaign.target_amount || 10000,
      min_amount: campaign.min_amount || 1,
      max_amount: campaign.max_amount || 100000,
      status: campaign.status
    });
    setShowCampaignPanel(true);
  };

  const handleSaveCampaign = async () => {
    if (!campaignForm.title) {
      toast.error('Sila masukkan nama kempen');
      return;
    }
    
    if (campaignForm.campaign_type === 'slot') {
      if (!campaignForm.total_slots || !campaignForm.price_per_slot) {
        toast.error('Sila masukkan jumlah slot dan harga per slot');
        return;
      }
    } else {
      if (!campaignForm.target_amount) {
        toast.error('Sila masukkan jumlah sasaran');
        return;
      }
    }
    
    setProcessing(true);
    try {
      if (editingCampaign) {
        await api.put(`/api/tabung/campaigns/${editingCampaign.id}`, campaignForm);
        toast.success('Kempen berjaya dikemaskini');
      } else {
        await api.post('/api/tabung/campaigns', campaignForm);
        toast.success('Kempen berjaya dicipta');
      }
      setShowCampaignPanel(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Operasi gagal');
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteCampaign = async (campaignId) => {
    if (!window.confirm('Adakah anda pasti ingin membatalkan kempen ini?')) return;
    try {
      await api.delete(`/api/tabung/campaigns/${campaignId}`);
      toast.success('Kempen dibatalkan');
      fetchData();
    } catch (err) {
      toast.error('Gagal membatalkan kempen');
    }
  };

  const filteredCampaigns = campaigns.filter(c => {
    if (filterType !== 'all' && c.campaign_type !== filterType) return false;
    if (filterStatus !== 'all' && c.status !== filterStatus) return false;
    return true;
  });

  const filteredDonations = donations.filter(d => {
    if (filterType !== 'all' && d.campaign_type !== filterType) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 min-w-0 overflow-x-hidden" data-testid="admin-tabung-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white">
              <Gift size={24} />
            </div>
            Tabung & Sumbangan
          </h1>
          <p className="text-slate-600 mt-1">Pengurusan bersepadu Tabung Slot & Sumbangan Bebas</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={fetchData}>
            <RefreshCw size={18} /> Muat Semula
          </Button>
          <Button onClick={openAddPanel} data-testid="add-campaign-btn">
            <Plus size={18} /> Kempen Baru
          </Button>
        </div>
      </div>

      {/* Real-time Banner */}
      {realtimeReport && (
        <Card className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-medium text-emerald-700">Kutipan Hari Ini</span>
              </div>
              <span className="text-2xl font-bold text-emerald-800">RM {(realtimeReport.today?.total || 0).toLocaleString()}</span>
              <span className="text-sm text-slate-600">({realtimeReport.today?.count || 0} sumbangan)</span>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">Bulan Ini</p>
              <p className="text-lg font-bold text-emerald-700">RM {(realtimeReport.this_month?.total || 0).toLocaleString()}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          icon={Target} 
          label="Kempen Aktif" 
          value={stats?.campaigns?.active || 0}
          subtext={`${stats?.campaigns?.slot_based || 0} slot, ${stats?.campaigns?.amount_based || 0} sumbangan`}
          color="emerald"
        />
        <StatCard 
          icon={Users} 
          label="Penderma Unik" 
          value={stats?.donations?.unique_donors || 0}
          subtext={`${stats?.donations?.total_donations || 0} jumlah sumbangan`}
          color="violet"
        />
        <StatCard 
          icon={Grid3X3} 
          label="Slot Terjual" 
          value={(stats?.donations?.total_slots_sold || 0).toLocaleString()}
          subtext={`RM ${(stats?.by_type?.slot?.total || 0).toLocaleString()}`}
          color="amber"
        />
        <StatCard 
          icon={Wallet} 
          label="Jumlah Terkumpul" 
          value={`RM ${(stats?.donations?.total_amount || 0).toLocaleString()}`}
          subtext={`${stats?.campaigns?.completed || 0} kempen selesai`}
          color="blue"
        />
      </div>

      {/* Tabs & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2">
          {[
            { key: 'campaigns', label: 'Kempen', icon: Target },
            { key: 'donations', label: 'Sumbangan', icon: Receipt },
            { key: 'reports', label: 'Laporan', icon: BarChart3 }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.key 
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>
        
        <div className="flex gap-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">Semua Jenis</option>
            <option value="slot">Tabung Slot</option>
            <option value="amount">Sumbangan Bebas</option>
          </select>
          
          {activeTab === 'campaigns' && (
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">Semua Status</option>
              <option value="active">Aktif</option>
              <option value="paused">Dijeda</option>
              <option value="completed">Selesai</option>
              <option value="cancelled">Dibatal</option>
            </select>
          )}
        </div>
      </div>

      {/* Campaigns Tab */}
      {activeTab === 'campaigns' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left py-4 px-4 font-semibold text-slate-600">Kempen</th>
                  <th className="text-center py-4 px-4 font-semibold text-slate-600">Jenis</th>
                  <th className="text-center py-4 px-4 font-semibold text-slate-600">Progress</th>
                  <th className="text-right py-4 px-4 font-semibold text-slate-600">Terkumpul</th>
                  <th className="text-center py-4 px-4 font-semibold text-slate-600">Penderma</th>
                  <th className="text-center py-4 px-4 font-semibold text-slate-600">Status</th>
                  <th className="text-right py-4 px-4 font-semibold text-slate-600">Tindakan</th>
                </tr>
              </thead>
              <tbody>
                {filteredCampaigns.map((campaign) => (
                  <tr key={campaign.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-4 px-4">
                      <p className="font-semibold text-slate-900">{campaign.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{campaign.description?.slice(0, 50)}</p>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <Badge type={campaign.campaign_type}>
                        {campaign.campaign_type === 'slot' ? 'Slot' : 'Sumbangan'}
                      </Badge>
                    </td>
                    <td className="py-4 px-4">
                      <div className="w-32 mx-auto">
                        <ProgressBar 
                          percent={campaign.progress_percent} 
                          color={campaign.campaign_type === 'slot' ? 'violet' : 'emerald'} 
                        />
                        <p className="text-xs text-center mt-1 text-slate-600">
                          {campaign.campaign_type === 'slot' 
                            ? `${campaign.slots_sold}/${campaign.total_slots} slot`
                            : `${campaign.progress_percent.toFixed(0)}%`
                          }
                        </p>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <span className="text-lg font-bold text-emerald-600">
                        RM {(campaign.total_collected || 0).toLocaleString()}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className="text-slate-700 font-medium">{campaign.donor_count || 0}</span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <Badge type={campaign.status}>
                        {campaign.status === 'active' ? 'Aktif' : 
                         campaign.status === 'paused' ? 'Dijeda' :
                         campaign.status === 'completed' ? 'Selesai' : 'Dibatal'}
                      </Badge>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openEditPanel(campaign)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit size={16} />
                        </button>
                        {campaign.status === 'active' && (
                          <button
                            onClick={() => handleDeleteCampaign(campaign.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Batalkan"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredCampaigns.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      Tiada kempen dijumpai
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Donations Tab */}
      {activeTab === 'donations' && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Senarai Sumbangan</h3>
            <span className="text-sm text-slate-500">{filteredDonations.length} rekod</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left py-4 px-4 font-semibold text-slate-600">Tarikh</th>
                  <th className="text-left py-4 px-4 font-semibold text-slate-600">Penderma</th>
                  <th className="text-left py-4 px-4 font-semibold text-slate-600">Kempen</th>
                  <th className="text-center py-4 px-4 font-semibold text-slate-600">Jenis</th>
                  <th className="text-center py-4 px-4 font-semibold text-slate-600">Slot</th>
                  <th className="text-right py-4 px-4 font-semibold text-slate-600">Jumlah</th>
                  <th className="text-center py-4 px-4 font-semibold text-slate-600">Status</th>
                  <th className="text-left py-4 px-4 font-semibold text-slate-600">No. Resit</th>
                </tr>
              </thead>
              <tbody>
                {filteredDonations.slice(0, 100).map((donation) => (
                  <tr key={donation.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 text-slate-600">
                      {new Date(donation.created_at).toLocaleDateString('ms-MY', { 
                        day: '2-digit', month: 'short', year: 'numeric' 
                      })}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-900">
                        {donation.is_anonymous ? 'Tanpa Nama' : donation.donor_name}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{donation.campaign_title}</td>
                    <td className="py-3 px-4 text-center">
                      <Badge type={donation.campaign_type || (donation.is_slot_based ? 'slot' : 'amount')}>
                        {donation.is_slot_based ? 'Slot' : 'Sumbangan'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-center font-medium">
                      {donation.slots ? donation.slots : '-'}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-600">
                      RM {donation.amount.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Badge type={donation.payment_status === 'completed' ? 'success' : 'pending'}>
                        {donation.payment_status === 'completed' ? 'Berjaya' : 'Pending'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-slate-500">
                      {donation.receipt_number}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {/* Top Donors */}
          <Card className="p-6">
            <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Users size={20} className="text-emerald-600" />
              Top 10 Penderma
            </h3>
            <div className="space-y-3">
              {stats?.top_donors?.map((donor, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-lg ${
                      i === 0 ? 'bg-gradient-to-br from-amber-400 to-amber-600' : 
                      i === 1 ? 'bg-gradient-to-br from-slate-400 to-slate-500' : 
                      i === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-800' : 
                      'bg-slate-300'
                    }`}>
                      {i + 1}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{donor.name}</p>
                      <p className="text-xs text-slate-500">{donor.count} sumbangan</p>
                    </div>
                  </div>
                  <p className="text-xl font-bold text-emerald-600">RM {donor.total.toLocaleString()}</p>
                </div>
              ))}
              {(!stats?.top_donors || stats.top_donors.length === 0) && (
                <p className="text-center text-slate-500 py-8">Tiada data penderma</p>
              )}
            </div>
          </Card>

          {/* Monthly Trend */}
          <Card className="p-6">
            <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <TrendingUp size={20} className="text-emerald-600" />
              Trend Bulanan
            </h3>
            <div className="space-y-3">
              {stats?.monthly_trend?.slice(0, 6).map((month, i) => (
                <div key={i} className="flex items-center gap-4">
                  <span className="w-20 text-sm text-slate-600">{month.month}</span>
                  <div className="flex-1">
                    <ProgressBar 
                      percent={(month.total / (stats?.monthly_trend?.[0]?.total || 1)) * 100} 
                      color="emerald" 
                    />
                  </div>
                  <span className="w-32 text-right font-medium text-slate-900">
                    RM {month.total.toLocaleString()}
                  </span>
                  <span className="w-20 text-right text-sm text-slate-500">
                    {month.count} sumbangan
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Campaign Slide-in Panel */}
      <AnimatePresence>
        {showCampaignPanel && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="fixed inset-0 bg-black/50 z-50" 
              onClick={() => setShowCampaignPanel(false)} 
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col"
            >
              {/* Panel Header */}
              <div className="p-6 border-b bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Gift size={24} />
                    {editingCampaign ? 'Edit Kempen' : 'Kempen Baru'}
                  </h3>
                  <button onClick={() => setShowCampaignPanel(false)} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-white/20 rounded-lg transition" aria-label="Tutup">
                    <X size={24} />
                  </button>
                </div>
              </div>
              
              {/* Panel Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <Input
                  label="Nama Kempen *"
                  value={campaignForm.title}
                  onChange={(e) => setCampaignForm({...campaignForm, title: e.target.value})}
                  placeholder="cth: Tabung Surau Al-Hidayah"
                  data-testid="campaign-title"
                />
                
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">Penerangan</label>
                  <textarea
                    value={campaignForm.description}
                    onChange={(e) => setCampaignForm({...campaignForm, description: e.target.value})}
                    placeholder="Penerangan kempen..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    rows={3}
                  />
                </div>

                <Input
                  label="URL Gambar"
                  value={campaignForm.image_url}
                  onChange={(e) => setCampaignForm({...campaignForm, image_url: e.target.value})}
                  placeholder="https://..."
                />

                <Select
                  label="Jenis Kempen *"
                  value={campaignForm.campaign_type}
                  onChange={(e) => setCampaignForm({...campaignForm, campaign_type: e.target.value})}
                  disabled={!!editingCampaign}
                >
                  <option value="slot">Tabung Slot</option>
                  <option value="amount">Sumbangan Bebas</option>
                </Select>

                {campaignForm.campaign_type === 'slot' ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <Input
                        label="Jumlah Slot *"
                        type="number"
                        min="1"
                        value={campaignForm.total_slots}
                        onChange={(e) => setCampaignForm({...campaignForm, total_slots: parseInt(e.target.value) || 0})}
                        data-testid="total-slots"
                      />
                      <Input
                        label="Harga/Slot (RM) *"
                        type="number"
                        min="1"
                        step="0.01"
                        value={campaignForm.price_per_slot}
                        onChange={(e) => setCampaignForm({...campaignForm, price_per_slot: parseFloat(e.target.value) || 0})}
                        data-testid="price-per-slot"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <Input
                        label="Min Slot/Penderma"
                        type="number"
                        min="1"
                        value={campaignForm.min_slots}
                        onChange={(e) => setCampaignForm({...campaignForm, min_slots: parseInt(e.target.value) || 1})}
                      />
                      <Input
                        label="Max Slot/Penderma"
                        type="number"
                        min="1"
                        value={campaignForm.max_slots}
                        onChange={(e) => setCampaignForm({...campaignForm, max_slots: parseInt(e.target.value) || 5000})}
                      />
                    </div>

                    <div className="p-4 bg-violet-50 rounded-xl border border-violet-200">
                      <h4 className="text-sm font-medium text-violet-700 mb-2">Pratonton Sasaran</h4>
                      <p className="text-xl font-bold text-violet-900">
                        RM {(campaignForm.total_slots * campaignForm.price_per_slot).toLocaleString()}
                      </p>
                      <p className="text-sm text-violet-600">
                        {campaignForm.total_slots} slot × RM {campaignForm.price_per_slot}/slot
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <Input
                      label="Jumlah Sasaran (RM) *"
                      type="number"
                      min="1"
                      value={campaignForm.target_amount}
                      onChange={(e) => setCampaignForm({...campaignForm, target_amount: parseFloat(e.target.value) || 0})}
                    />
                    
                    <div className="grid grid-cols-2 gap-4">
                      <Input
                        label="Min Sumbangan (RM)"
                        type="number"
                        min="1"
                        value={campaignForm.min_amount}
                        onChange={(e) => setCampaignForm({...campaignForm, min_amount: parseFloat(e.target.value) || 1})}
                      />
                      <Input
                        label="Max Sumbangan (RM)"
                        type="number"
                        min="1"
                        value={campaignForm.max_amount}
                        onChange={(e) => setCampaignForm({...campaignForm, max_amount: parseFloat(e.target.value) || 100000})}
                      />
                    </div>

                    <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                      <h4 className="text-sm font-medium text-emerald-700 mb-2">Sasaran</h4>
                      <p className="text-xl font-bold text-emerald-900">
                        RM {(campaignForm.target_amount || 0).toLocaleString()}
                      </p>
                    </div>
                  </>
                )}

                {editingCampaign && (
                  <Select
                    label="Status"
                    value={campaignForm.status}
                    onChange={(e) => setCampaignForm({...campaignForm, status: e.target.value})}
                  >
                    <option value="active">Aktif</option>
                    <option value="paused">Dijeda</option>
                    <option value="completed">Selesai</option>
                  </Select>
                )}
              </div>

              {/* Panel Footer */}
              <div className="p-4 border-t bg-slate-50 flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowCampaignPanel(false)}>Batal</Button>
                <Button 
                  className="flex-1" 
                  onClick={handleSaveCampaign} 
                  loading={processing}
                  data-testid="save-campaign-btn"
                >
                  {editingCampaign ? 'Kemaskini' : 'Cipta Kempen'}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
