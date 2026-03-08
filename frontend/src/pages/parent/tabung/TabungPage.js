import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Gift, Heart, Grid3X3, Wallet, ArrowRight, X, 
  CheckCircle, History, User
} from 'lucide-react';
import api from '../../../services/api';

// ===================== COMPONENTS =====================

const Spinner = ({ size = 'md' }) => (
  <div className={`animate-spin rounded-full border-2 border-t-transparent border-emerald-600 ${size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'}`} />
);

const Button = ({ children, variant = 'primary', size = 'md', loading, disabled, className = '', ...props }) => {
  const variants = {
    primary: 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg',
    secondary: 'bg-gradient-to-r from-violet-600 to-fuchsia-500 hover:from-violet-700 hover:to-fuchsia-600 text-white',
    outline: 'border-2 border-emerald-600 text-emerald-700 hover:bg-emerald-50',
    ghost: 'text-slate-600 hover:text-emerald-700 hover:bg-slate-100'
  };
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-5 py-2.5 text-sm', lg: 'px-6 py-3 text-base' };
  return (
    <button className={`font-medium rounded-xl transition-all flex items-center justify-center gap-2 ${variants[variant]} ${sizes[size]} ${className} ${disabled || loading ? 'opacity-60 cursor-not-allowed' : ''}`} disabled={disabled || loading} {...props}>
      {loading ? <Spinner size="sm" /> : null}{children}
    </button>
  );
};

const Card = ({ children, className = '', onClick, hover = false, ...props }) => (
  <div 
    className={`bg-white rounded-2xl border border-slate-100 shadow-sm transition-all ${hover ? 'hover:shadow-lg hover:-translate-y-1 cursor-pointer' : ''} ${className}`} 
    onClick={onClick}
    {...props}
  >
    {children}
  </div>
);

const Badge = ({ type, children }) => {
  const styles = {
    slot: 'bg-violet-100 text-violet-800',
    amount: 'bg-emerald-100 text-emerald-800'
  };
  return <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${styles[type] || 'bg-slate-100 text-slate-800'}`}>{children}</span>;
};

const ProgressBar = ({ percent, color = 'emerald' }) => {
  const colors = {
    emerald: 'from-emerald-500 to-teal-500',
    violet: 'from-violet-500 to-fuchsia-500'
  };
  return (
    <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(percent, 100)}%` }}
        transition={{ duration: 0.8 }}
        className={`h-full rounded-full bg-gradient-to-r ${colors[color]}`}
      />
    </div>
  );
};

// ===================== MAIN PAGE =====================

export default function TabungPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [myDonations, setMyDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('campaigns');
  const [showDonatePanel, setShowDonatePanel] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [donateSuccess, setDonateSuccess] = useState(null);
  
  const [donationForm, setDonationForm] = useState({
    slots: 1,
    amount: 10,
    is_anonymous: false,
    message: '',
    payment_method: 'fpx'
  });

  const fetchData = useCallback(async () => {
    try {
      const [campaignsRes, donationsRes] = await Promise.all([
        api.get('/api/tabung/campaigns?active_only=true'),
        api.get('/api/tabung/donations/my')
      ]);
      setCampaigns(campaignsRes.data);
      setMyDonations(donationsRes.data);
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

  const openDonatePanel = (campaign) => {
    setSelectedCampaign(campaign);
    setDonationForm({
      slots: campaign.min_slots || 1,
      amount: campaign.min_amount || 10,
      is_anonymous: false,
      message: '',
      payment_method: 'fpx'
    });
    setDonateSuccess(null);
    setShowDonatePanel(true);
  };

  const handleDonate = async () => {
    if (!selectedCampaign) return;
    
    setProcessing(true);
    try {
      const payload = {
        campaign_id: selectedCampaign.id,
        is_anonymous: donationForm.is_anonymous,
        message: donationForm.message,
        payment_method: donationForm.payment_method
      };
      
      if (selectedCampaign.campaign_type === 'slot') {
        payload.slots = donationForm.slots;
      } else {
        payload.amount = donationForm.amount;
      }
      
      const res = await api.post('/api/tabung/donate', payload);
      setDonateSuccess(res.data);
      fetchData();
      toast.success('Sumbangan berjaya direkodkan!');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal membuat sumbangan');
    } finally {
      setProcessing(false);
    }
  };

  const calculateAmount = () => {
    if (!selectedCampaign) return 0;
    if (selectedCampaign.campaign_type === 'slot') {
      return donationForm.slots * selectedCampaign.price_per_slot;
    }
    return donationForm.amount;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6" data-testid="tabung-page">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex p-3 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white mb-4">
          <Gift size={32} />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Tabung & Sumbangan</h1>
        <p className="text-slate-600 mt-1">Hulurkan sumbangan anda untuk kebaikan bersama</p>
      </div>

      {/* Tabs */}
      <div className="flex justify-center gap-2">
        <button
          onClick={() => setActiveTab('campaigns')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
            activeTab === 'campaigns' 
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg' 
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Heart size={18} />
          Kempen Aktif
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
            activeTab === 'history' 
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg' 
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <History size={18} />
          Sejarah Saya
        </button>
      </div>

      {/* Campaigns */}
      {activeTab === 'campaigns' && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => (
            <Card key={campaign.id} hover onClick={() => openDonatePanel(campaign)} className="overflow-hidden">
              {campaign.image_url && (
                <div className="h-40 overflow-hidden">
                  <img 
                    src={campaign.image_url} 
                    alt={campaign.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-bold text-slate-900 text-lg">{campaign.title}</h3>
                  <Badge type={campaign.campaign_type}>
                    {campaign.campaign_type === 'slot' ? 'Slot' : 'Sumbangan'}
                  </Badge>
                </div>
                
                {campaign.description && (
                  <p className="text-sm text-slate-600 mb-4 line-clamp-2">{campaign.description}</p>
                )}

                <div className="space-y-3">
                  <ProgressBar 
                    percent={campaign.progress_percent} 
                    color={campaign.campaign_type === 'slot' ? 'violet' : 'emerald'} 
                  />
                  
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">
                      {campaign.campaign_type === 'slot' 
                        ? `${campaign.slots_sold}/${campaign.total_slots} slot`
                        : `${campaign.progress_percent.toFixed(0)}% tercapai`
                      }
                    </span>
                    <span className="font-bold text-emerald-600">
                      RM {(campaign.total_collected || 0).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm text-slate-500">
                    <span className="flex items-center gap-1">
                      <User size={14} />
                      {campaign.donor_count || 0} penderma
                    </span>
                    {campaign.campaign_type === 'slot' && (
                      <span>RM {campaign.price_per_slot}/slot</span>
                    )}
                  </div>
                </div>

                <Button className="w-full mt-4" size="md">
                  Sumbang Sekarang <ArrowRight size={16} />
                </Button>
              </div>
            </Card>
          ))}
          
          {campaigns.length === 0 && (
            <div className="col-span-full text-center py-12 text-slate-500">
              <Heart size={48} className="mx-auto mb-4 text-slate-300" />
              <p>Tiada kempen aktif buat masa ini</p>
            </div>
          )}
        </div>
      )}

      {/* History */}
      {activeTab === 'history' && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900">Sejarah Sumbangan Saya</h3>
          </div>
          
          {myDonations.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {myDonations.map((donation) => (
                <div key={donation.id} className="p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-slate-900">{donation.campaign_title}</p>
                      <p className="text-sm text-slate-500 mt-0.5">
                        {new Date(donation.created_at).toLocaleDateString('ms-MY', {
                          day: '2-digit', month: 'long', year: 'numeric'
                        })}
                      </p>
                      {donation.slots && (
                        <p className="text-sm text-violet-600 mt-1">{donation.slots} slot</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-emerald-600">RM {donation.amount.toFixed(2)}</p>
                      <p className="text-xs text-slate-400 mt-1 font-mono">{donation.receipt_number}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center text-slate-500">
              <History size={48} className="mx-auto mb-4 text-slate-300" />
              <p>Anda belum membuat sebarang sumbangan</p>
            </div>
          )}
        </Card>
      )}

      {/* Donate Panel */}
      <AnimatePresence>
        {showDonatePanel && selectedCampaign && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="fixed inset-0 bg-black/50 z-50" 
              onClick={() => !processing && setShowDonatePanel(false)} 
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl z-50 max-h-[90vh] overflow-y-auto"
            >
              {donateSuccess ? (
                // Success View
                <div className="p-8 text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-full flex items-center justify-center mx-auto mb-4"
                  >
                    <CheckCircle size={40} className="text-white" />
                  </motion.div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Sumbangan Berjaya!</h3>
                  <p className="text-slate-600 mb-4">Terima kasih atas sumbangan anda</p>
                  
                  <div className="bg-slate-50 rounded-xl p-4 mb-6 text-left">
                    <div className="flex justify-between mb-2">
                      <span className="text-slate-600">Kempen</span>
                      <span className="font-medium text-slate-900">{donateSuccess.campaign_title}</span>
                    </div>
                    <div className="flex justify-between mb-2">
                      <span className="text-slate-600">Jumlah</span>
                      <span className="font-bold text-emerald-600">RM {donateSuccess.amount.toFixed(2)}</span>
                    </div>
                    {donateSuccess.slots && (
                      <div className="flex justify-between mb-2">
                        <span className="text-slate-600">Slot</span>
                        <span className="font-medium text-violet-600">{donateSuccess.slots} slot</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 border-t border-slate-200">
                      <span className="text-slate-600">No. Resit</span>
                      <span className="font-mono text-sm text-slate-900">{donateSuccess.receipt_number}</span>
                    </div>
                  </div>
                  
                  <Button className="w-full" onClick={() => setShowDonatePanel(false)}>
                    Selesai
                  </Button>
                </div>
              ) : (
                // Donation Form
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-slate-900">Buat Sumbangan</h3>
                    <button 
                      onClick={() => setShowDonatePanel(false)} 
                      className="p-2 hover:bg-slate-100 rounded-lg"
                      disabled={processing}
                    >
                      <X size={20} />
                    </button>
                  </div>

                  {/* Campaign Info */}
                  <div className="bg-slate-50 rounded-xl p-4 mb-6">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${selectedCampaign.campaign_type === 'slot' ? 'bg-violet-100 text-violet-600' : 'bg-emerald-100 text-emerald-600'}`}>
                        {selectedCampaign.campaign_type === 'slot' ? <Grid3X3 size={20} /> : <Heart size={20} />}
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-900">{selectedCampaign.title}</h4>
                        <p className="text-sm text-slate-500">
                          {selectedCampaign.campaign_type === 'slot' 
                            ? `RM ${selectedCampaign.price_per_slot}/slot • ${selectedCampaign.slots_available} slot tersedia`
                            : `Sasaran: RM ${(selectedCampaign.target_amount || 0).toLocaleString()}`
                          }
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Input */}
                  {selectedCampaign.campaign_type === 'slot' ? (
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-slate-700 mb-2">Bilangan Slot</label>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setDonationForm(f => ({ ...f, slots: Math.max(selectedCampaign.min_slots || 1, f.slots - 1) }))}
                          className="w-12 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-xl font-bold"
                          disabled={processing}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          value={donationForm.slots}
                          onChange={(e) => setDonationForm(f => ({ ...f, slots: parseInt(e.target.value) || 1 }))}
                          className="flex-1 h-12 text-center text-2xl font-bold border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                          min={selectedCampaign.min_slots || 1}
                          max={Math.min(selectedCampaign.max_slots || 5000, selectedCampaign.slots_available)}
                          disabled={processing}
                        />
                        <button
                          onClick={() => setDonationForm(f => ({ ...f, slots: Math.min(selectedCampaign.max_slots || 5000, f.slots + 1) }))}
                          className="w-12 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-xl font-bold"
                          disabled={processing}
                        >
                          +
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 mt-2 text-center">
                        Min: {selectedCampaign.min_slots || 1} • Max: {Math.min(selectedCampaign.max_slots || 5000, selectedCampaign.slots_available)}
                      </p>
                    </div>
                  ) : (
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-slate-700 mb-2">Jumlah Sumbangan (RM)</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">RM</span>
                        <input
                          type="number"
                          value={donationForm.amount}
                          onChange={(e) => setDonationForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                          className="w-full h-14 pl-12 text-2xl font-bold border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                          min={selectedCampaign.min_amount || 1}
                          max={selectedCampaign.max_amount || 100000}
                          disabled={processing}
                        />
                      </div>
                      {/* Quick amounts */}
                      <div className="flex gap-2 mt-3">
                        {[10, 50, 100, 500].map(amt => (
                          <button
                            key={amt}
                            onClick={() => setDonationForm(f => ({ ...f, amount: amt }))}
                            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                              donationForm.amount === amt 
                                ? 'bg-emerald-100 text-emerald-700 border-2 border-emerald-500' 
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                            disabled={processing}
                          >
                            RM {amt}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Anonymous */}
                  <label className="flex items-center gap-3 mb-4 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={donationForm.is_anonymous}
                      onChange={(e) => setDonationForm(f => ({ ...f, is_anonymous: e.target.checked }))}
                      className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      disabled={processing}
                    />
                    <span className="text-sm text-slate-700">Sumbangan tanpa nama</span>
                  </label>

                  {/* Message */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Pesanan (pilihan)</label>
                    <textarea
                      value={donationForm.message}
                      onChange={(e) => setDonationForm(f => ({ ...f, message: e.target.value }))}
                      placeholder="Doa atau pesanan anda..."
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
                      rows={2}
                      disabled={processing}
                    />
                  </div>

                  {/* Total */}
                  <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-4 mb-6 border border-emerald-200">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-700 font-medium">Jumlah Sumbangan</span>
                      <span className="text-3xl font-bold text-emerald-600">
                        RM {calculateAmount().toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Submit */}
                  <Button 
                    className="w-full" 
                    size="lg" 
                    onClick={handleDonate}
                    loading={processing}
                    data-testid="confirm-donate-btn"
                  >
                    <Wallet size={20} />
                    Sahkan Sumbangan
                  </Button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
