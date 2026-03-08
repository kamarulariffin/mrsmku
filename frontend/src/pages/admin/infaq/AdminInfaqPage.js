import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Gift, Target, Users, Wallet, Edit, Trash2, Plus, X
} from 'lucide-react';
import api from '../../../services/api';

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

// ===================== ADMIN INFAQ PAGE =====================

export const AdminInfaqPage = () => {
  const [campaigns, setCampaigns] = useState([]);
  const [donations, setDonations] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('campaigns');
  const [showCampaignPanel, setShowCampaignPanel] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [campaignForm, setCampaignForm] = useState({
    title: '',
    description: '',
    image_url: '',
    total_slots: 100,
    price_per_slot: 25,
    min_slots: 1,
    max_slots: 5000
  });

  const fetchData = async () => {
    try {
      const [campaignsRes, donationsRes, statsRes] = await Promise.all([
        api.get('/api/infaq/campaigns'),
        api.get('/api/infaq/admin/donations'),
        api.get('/api/infaq/admin/stats')
      ]);
      setCampaigns(campaignsRes.data);
      setDonations(donationsRes.data);
      setStats(statsRes.data);
    } catch (err) { toast.error('Gagal memuatkan data'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const openAddPanel = () => {
    setEditingCampaign(null);
    setCampaignForm({
      title: '',
      description: '',
      image_url: '',
      total_slots: 100,
      price_per_slot: 25,
      min_slots: 1,
      max_slots: 5000
    });
    setShowCampaignPanel(true);
  };

  const openEditPanel = (campaign) => {
    setEditingCampaign(campaign);
    setCampaignForm({
      title: campaign.title,
      description: campaign.description || '',
      image_url: campaign.image_url || '',
      total_slots: campaign.total_slots,
      price_per_slot: campaign.price_per_slot,
      min_slots: campaign.min_slots || 1,
      max_slots: campaign.max_slots || 5000,
      status: campaign.status
    });
    setShowCampaignPanel(true);
  };

  const handleSaveCampaign = async () => {
    if (!campaignForm.title || !campaignForm.total_slots || !campaignForm.price_per_slot) {
      toast.error('Sila isi semua maklumat wajib');
      return;
    }
    setProcessing(true);
    try {
      if (editingCampaign) {
        await api.put(`/api/infaq/admin/campaigns/${editingCampaign.id}`, campaignForm);
        toast.success('Kempen dikemaskini');
      } else {
        await api.post('/api/infaq/admin/campaigns', campaignForm);
        toast.success('Kempen berjaya dicipta');
      }
      setShowCampaignPanel(false);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Operasi gagal'); }
    finally { setProcessing(false); }
  };

  const handleDeleteCampaign = async (campaignId) => {
    if (!window.confirm('Adakah anda pasti ingin membatalkan kempen ini?')) return;
    try {
      await api.delete(`/api/infaq/admin/campaigns/${campaignId}`);
      toast.success('Kempen dibatalkan');
      fetchData();
    } catch (err) { toast.error('Gagal membatalkan kempen'); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="admin-infaq-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 font-heading">Pengurusan Infaq Slot</h1>
          <p className="text-slate-600 mt-1">Urus kempen infaq dan lihat sumbangan</p>
        </div>
        <Button onClick={openAddPanel} data-testid="add-infaq-campaign-btn">
          <Plus size={18} /> Kempen Baru
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Target} label="Kempen Aktif" value={stats?.active_campaigns || 0} color="primary" />
        <StatCard icon={Gift} label="Slot Terjual" value={(stats?.total_slots_sold || 0).toLocaleString()} color="secondary" />
        <StatCard icon={Users} label="Jumlah Penderma" value={stats?.unique_donors || 0} color="warning" />
        <StatCard icon={Wallet} label="Terkumpul" value={`RM ${(stats?.total_amount || 0).toLocaleString()}`} color="success" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {['campaigns', 'donations'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {tab === 'campaigns' ? 'Kempen' : 'Sumbangan'}
          </button>
        ))}
      </div>

      {activeTab === 'campaigns' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-medium text-slate-600">Kempen</th>
                  <th className="text-center py-3 px-4 font-medium text-slate-600">Slot</th>
                  <th className="text-right py-3 px-4 font-medium text-slate-600">Harga/Slot</th>
                  <th className="text-right py-3 px-4 font-medium text-slate-600">Terkumpul</th>
                  <th className="text-center py-3 px-4 font-medium text-slate-600">Status</th>
                  <th className="text-right py-3 px-4 font-medium text-slate-600">Tindakan</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-900">{campaign.title}</p>
                      <p className="text-xs text-slate-500">{campaign.donor_count || 0} penderma</p>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="font-semibold text-emerald-600">{campaign.slots_sold}</span>
                      <span className="text-slate-400">/{campaign.total_slots}</span>
                    </td>
                    <td className="py-3 px-4 text-right">RM {campaign.price_per_slot}</td>
                    <td className="py-3 px-4 text-right font-semibold text-emerald-600">
                      RM {(campaign.total_collected || 0).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Badge status={campaign.status === 'active' ? 'approved' : campaign.status === 'completed' ? 'paid' : 'rejected'}>
                        {campaign.status === 'active' ? 'Aktif' : campaign.status === 'completed' ? 'Selesai' : 'Batal'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openEditPanel(campaign)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg">
                          <Edit size={16} />
                        </button>
                        {campaign.status === 'active' && (
                          <button onClick={() => handleDeleteCampaign(campaign.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'donations' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-medium text-slate-600">Tarikh</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600">Penderma</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600">Kempen</th>
                  <th className="text-center py-3 px-4 font-medium text-slate-600">Slot</th>
                  <th className="text-right py-3 px-4 font-medium text-slate-600">Jumlah</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600">Resit</th>
                </tr>
              </thead>
              <tbody>
                {donations.slice(0, 50).map((donation) => (
                  <tr key={donation.id} className="border-b border-slate-100">
                    <td className="py-3 px-4 text-xs text-slate-500">{new Date(donation.created_at).toLocaleDateString('ms-MY')}</td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-900">{donation.is_anonymous ? 'Tanpa Nama' : donation.donor_name}</p>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{donation.campaign_title}</td>
                    <td className="py-3 px-4 text-center font-semibold">{donation.slots}</td>
                    <td className="py-3 px-4 text-right font-semibold text-emerald-600">RM {donation.amount.toFixed(2)}</td>
                    <td className="py-3 px-4 text-xs text-slate-500">{donation.receipt_number}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
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
              <div className="p-6 border-b bg-gradient-to-r from-emerald-500 to-teal-500 text-white">
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
              
              {/* Panel Content - Scrollable */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <Input
                  label="Nama Kempen *"
                  value={campaignForm.title}
                  onChange={(e) => setCampaignForm({...campaignForm, title: e.target.value})}
                  placeholder="cth: Infaq Pembangunan Surau"
                  data-testid="campaign-title"
                />
                
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">Penerangan</label>
                  <textarea
                    value={campaignForm.description}
                    onChange={(e) => setCampaignForm({...campaignForm, description: e.target.value})}
                    placeholder="Penerangan kempen..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
                    rows={3}
                  />
                </div>

                <Input
                  label="URL Gambar"
                  value={campaignForm.image_url}
                  onChange={(e) => setCampaignForm({...campaignForm, image_url: e.target.value})}
                  placeholder="https://..."
                />

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

                {/* Preview */}
                <div className="p-4 bg-slate-50 rounded-xl">
                  <h4 className="text-sm font-medium text-slate-700 mb-2">Pratonton</h4>
                  <p className="text-sm text-slate-600">
                    Jumlah sasaran: <strong>RM {(campaignForm.total_slots * campaignForm.price_per_slot).toLocaleString()}</strong>
                  </p>
                  <p className="text-sm text-slate-600">
                    {campaignForm.total_slots} slot × RM {campaignForm.price_per_slot}/slot
                  </p>
                </div>
              </div>

              {/* Panel Footer */}
              <div className="p-4 border-t bg-slate-50 flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowCampaignPanel(false)}>Batal</Button>
                <Button 
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500" 
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
};

export default AdminInfaqPage;
