import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Heart, Gift, Receipt, Eye, Target, X } from 'lucide-react';
import api from '../../../services/api';
import { Card, Button, Input, Select, Spinner } from '../../../components/common';
import { DONATION_CATEGORIES } from '../../../constants';

// Progress Bar Component
const ProgressBar = ({ percent, color = 'primary' }) => (
  <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
    <motion.div 
      initial={{ width: 0 }}
      animate={{ width: `${Math.min(percent, 100)}%` }}
      transition={{ duration: 1, ease: "easeOut" }}
      className={`h-full rounded-full bg-gradient-to-r ${color}`}
    />
  </div>
);

// Donation Card Component
const DonationCard = ({ campaign, onDonate, onViewDetails }) => {
  const catInfo = DONATION_CATEGORIES[campaign.category] || { name: campaign.category, icon: '💰', color: 'from-slate-500 to-slate-600' };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all border border-slate-100"
    >
      {/* Image Header */}
      <div className="relative h-48 overflow-hidden">
        <img 
          src={campaign.image_url || 'https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?w=400&h=300&fit=crop'} 
          alt={campaign.title}
          className="w-full h-full object-cover"
        />
        <div className={`absolute top-4 left-4 px-3 py-1.5 rounded-full bg-gradient-to-r ${catInfo.color} text-white text-sm font-medium flex items-center gap-1.5`}>
          <span>{catInfo.icon}</span>
          {catInfo.name}
        </div>
      </div>
      
      {/* Content */}
      <div className="p-5">
        <h3 className="text-lg font-bold text-slate-900 mb-2 line-clamp-2">{campaign.title}</h3>
        <p className="text-sm text-slate-600 mb-4 line-clamp-2">{campaign.description}</p>
        
        {/* Progress */}
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-semibold text-primary-700">RM {(campaign.collected_amount ?? campaign.total_collected ?? 0).toLocaleString()}</span>
            <span className="text-slate-500">/ RM {(campaign.target_amount ?? ((campaign.total_slots || 0) * (campaign.price_per_slot || 0) || 0)).toLocaleString()}</span>
          </div>
          <ProgressBar percent={campaign.progress_percent ?? 0} color={catInfo.color} />
          <div className="flex justify-between text-xs text-slate-500 mt-2">
            <span>{(campaign.progress_percent ?? 0).toFixed(0)}% tercapai</span>
            <span>{campaign.donor_count ?? 0} penderma</span>
          </div>
        </div>
        
        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => onViewDetails(campaign)}>
            <Eye size={16} />Lihat
          </Button>
          <Button size="sm" className="flex-1" onClick={() => onDonate(campaign)}>
            <Heart size={16} />Derma
          </Button>
        </div>
      </div>
    </motion.div>
  );
};

// Parent Sedekah Page
export const SedekahPage = () => {
  const [campaigns, setCampaigns] = useState([]);
  const [myDonations, setMyDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [showDonateModal, setShowDonateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [donationAmount, setDonationAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('fpx');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [message, setMessage] = useState('');
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('campaigns');

  const fetchData = async () => {
    try {
      const [campaignsRes, donationsRes] = await Promise.all([
        api.get('/api/tabung/campaigns'),
        api.get('/api/tabung/donations/my')
      ]);
      setCampaigns(campaignsRes.data);
      setMyDonations(donationsRes.data);
    } catch (err) { toast.error('Gagal memuatkan data'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleDonate = async () => {
    if (!selectedCampaign || !donationAmount) return;
    setProcessing(true);
    try {
      await api.post('/api/tabung/donate', {
        campaign_id: selectedCampaign.id,
        amount: parseFloat(donationAmount),
        payment_method: paymentMethod,
        is_anonymous: isAnonymous,
        message: message || null
      });
      toast.success('Sumbangan berjaya! Jazakallahu khairan.');
      setShowDonateModal(false);
      setDonationAmount('');
      setMessage('');
      setIsAnonymous(false);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Sumbangan gagal'); }
    finally { setProcessing(false); }
  };

  const openDonateModal = (campaign) => {
    setSelectedCampaign(campaign);
    setShowDonateModal(true);
  };

  const openDetailModal = async (campaign) => {
    try {
      const res = await api.get(`/api/tabung/campaigns/${campaign.id}`);
      setSelectedCampaign(res.data);
      setShowDetailModal(true);
    } catch (err) { toast.error('Gagal memuatkan butiran'); }
  };

  const quickAmounts = [10, 20, 50, 100, 200, 500];

  return (
    <div className="space-y-6" data-testid="sedekah-page">
      {/* Header */}
      <div className="text-center py-6">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-pink-500 to-red-500 rounded-2xl mb-4">
          <Heart className="text-white" size={32} />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 font-heading">Sedekah & Sumbangan</h1>
        <p className="text-slate-600 mt-2 max-w-xl mx-auto">
          "Sedekah itu memadamkan dosa sebagaimana air memadamkan api" - HR Tirmidzi
        </p>
      </div>

      {/* Tabs */}
      <div className="flex justify-center">
        <div className="inline-flex bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('campaigns')}
            className={`px-6 py-2.5 rounded-md text-sm font-medium transition-all ${activeTab === 'campaigns' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-600'}`}
          >
            Kempen Aktif
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-6 py-2.5 rounded-md text-sm font-medium transition-all ${activeTab === 'history' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-600'}`}
          >
            Sejarah Saya
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>
      ) : activeTab === 'campaigns' ? (
        <>
          {/* Campaign Grid */}
          {campaigns.length === 0 ? (
            <Card className="text-center py-12">
              <Gift className="mx-auto text-slate-300" size={48} />
              <h3 className="mt-4 text-lg font-medium text-slate-700">Tiada kempen aktif</h3>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {campaigns.map((campaign) => (
                <DonationCard 
                  key={campaign.id} 
                  campaign={campaign} 
                  onDonate={openDonateModal}
                  onViewDetails={openDetailModal}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Donation History */}
          {myDonations.length === 0 ? (
            <Card className="text-center py-12">
              <Receipt className="mx-auto text-slate-300" size={48} />
              <h3 className="mt-4 text-lg font-medium text-slate-700">Tiada sejarah sumbangan</h3>
              <p className="text-slate-500 mt-2">Mulakan sedekah anda hari ini</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {myDonations.map((donation) => (
                <Card key={donation.id} className="animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-r from-pink-500 to-red-500 rounded-xl flex items-center justify-center">
                        <Heart className="text-white" size={24} />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{donation.campaign_title}</p>
                        <p className="text-sm text-slate-500">{new Date(donation.created_at).toLocaleDateString('ms-MY')}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-primary-700">RM {(donation.amount ?? 0).toFixed(2)}</p>
                      <p className="text-xs text-slate-500">Resit: {donation.receipt_number}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Donate Slide-in Panel */}
      <AnimatePresence>
        {showDonateModal && selectedCampaign && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="fixed inset-0 bg-black/50 z-50" 
              onClick={() => setShowDonateModal(false)} 
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col"
            >
              {/* Panel Header */}
              <div className="p-6 border-b bg-gradient-to-r from-pink-500 to-red-500 text-white">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Heart size={24} />
                    Buat Sumbangan
                  </h3>
                  <button onClick={() => setShowDonateModal(false)} className="p-2 hover:bg-white/20 rounded-lg transition">
                    <X size={24} />
                  </button>
                </div>
                <div className="bg-white/10 rounded-xl p-3">
                  <h4 className="font-semibold">{selectedCampaign.title}</h4>
                  <div className="flex items-center gap-2 mt-1 text-sm text-white/80">
                    <Target size={14} />
                    <span>Sasaran: RM {(selectedCampaign.target_amount ?? ((selectedCampaign.total_slots || 0) * (selectedCampaign.price_per_slot || 0) || 0)).toLocaleString()}</span>
                  </div>
                </div>
              </div>
              
              {/* Panel Content - Scrollable */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {/* Quick Amount Selection */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Pilih Jumlah (RM)</label>
                  <div className="grid grid-cols-3 gap-2">
                    {quickAmounts.map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setDonationAmount(amt.toString())}
                        className={`py-3 rounded-lg text-sm font-semibold transition-all ${donationAmount === amt.toString() ? 'bg-pink-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                      >
                        RM {amt}
                      </button>
                    ))}
                  </div>
                </div>

                <Input
                  label="Atau masukkan jumlah lain (RM)"
                  type="number"
                  step="1"
                  min="1"
                  value={donationAmount}
                  onChange={(e) => setDonationAmount(e.target.value)}
                  placeholder="Jumlah sumbangan"
                  data-testid="donation-amount"
                />

                <Select
                  label="Kaedah Pembayaran"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="fpx">FPX Online Banking</option>
                  <option value="card">Kad Kredit/Debit</option>
                </Select>

                <Input
                  label="Pesanan/Doa (Pilihan)"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Semoga diberkati..."
                />

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAnonymous}
                    onChange={(e) => setIsAnonymous(e.target.checked)}
                    className="w-5 h-5 rounded border-slate-300 text-pink-600 focus:ring-pink-500"
                  />
                  <span className="text-sm text-slate-700">Sumbangan tanpa nama</span>
                </label>

                <div className="p-3 bg-amber-50 rounded-lg text-sm text-amber-800">
                  <strong>Nota:</strong> Ini adalah pembayaran demo. Tiada transaksi sebenar.
                </div>
              </div>

              {/* Panel Footer */}
              <div className="p-4 border-t bg-slate-50 flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowDonateModal(false)}>Batal</Button>
                <Button className="flex-1 bg-gradient-to-r from-pink-500 to-red-500 hover:from-pink-600 hover:to-red-600" onClick={handleDonate} loading={processing} disabled={!donationAmount} data-testid="confirm-donation">
                  <Heart size={18} />
                  Derma RM {donationAmount || '0'}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Detail Slide-in Panel */}
      <AnimatePresence>
        {showDetailModal && selectedCampaign && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="fixed inset-0 bg-black/50 z-50" 
              onClick={() => setShowDetailModal(false)} 
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl z-50 flex flex-col"
            >
              {/* Panel Header */}
              <div className="p-6 border-b bg-gradient-to-r from-pink-500 to-red-500 text-white">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Gift size={24} />
                    Butiran Kempen
                  </h3>
                  <button onClick={() => setShowDetailModal(false)} className="p-2 hover:bg-white/20 rounded-lg transition">
                    <X size={24} />
                  </button>
                </div>
              </div>
              
              {/* Panel Content - Scrollable */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {selectedCampaign.image_url && (
                  <img src={selectedCampaign.image_url} alt={selectedCampaign.title} className="w-full h-48 object-cover rounded-xl" />
                )}
                <h2 className="text-xl font-bold text-slate-900">{selectedCampaign.title}</h2>
                <p className="text-slate-600">{selectedCampaign.description}</p>
                
                <div className="p-4 bg-slate-50 rounded-xl">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-semibold text-pink-600">RM {selectedCampaign.collected_amount?.toLocaleString()}</span>
                    <span className="text-slate-500">/ RM {selectedCampaign.target_amount?.toLocaleString()}</span>
                  </div>
                  <ProgressBar percent={selectedCampaign.progress_percent || 0} color="from-pink-500 to-red-500" />
                  <div className="flex justify-between text-xs text-slate-500 mt-2">
                    <span>{(selectedCampaign.progress_percent || 0).toFixed(0)}% tercapai</span>
                    <span>{selectedCampaign.donor_count || 0} penderma</span>
                  </div>
                </div>

                {/* Recent Donors */}
                {selectedCampaign.recent_donations?.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-3">Penderma Terkini</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {selectedCampaign.recent_donations.map((donor, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                          <div>
                            <p className="font-medium text-slate-900">{donor.donor_name}</p>
                            {donor.message && <p className="text-sm text-slate-500 italic">"{donor.message}"</p>}
                          </div>
                          <p className="font-semibold text-pink-600">RM {(donor.amount || 0).toFixed(2)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Panel Footer */}
              <div className="p-4 border-t bg-slate-50">
                <Button className="w-full bg-gradient-to-r from-pink-500 to-red-500 hover:from-pink-600 hover:to-red-600" onClick={() => { setShowDetailModal(false); openDonateModal(selectedCampaign); }}>
                  <Heart size={18} />Derma Sekarang
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SedekahPage;
