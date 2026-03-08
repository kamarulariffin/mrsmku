import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Gift, Eye, X, Minus, Plus, Receipt
} from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../App';
import { Spinner, Button, Card, Input, Select } from '../../components/common';

const InfaqPage = () => {
  useAuth(); // auth context for protected route
  const [campaigns, setCampaigns] = useState([]);
  const [myDonations, setMyDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [showDonatePanel, setShowDonatePanel] = useState(false);
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [slotCount, setSlotCount] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState('fpx');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [message, setMessage] = useState('');
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('campaigns');

  const fetchData = async () => {
    try {
      const [campaignsRes, donationsRes] = await Promise.all([
        api.get('/api/infaq/campaigns?status=active'),
        api.get('/api/infaq/my-donations')
      ]);
      setCampaigns(campaignsRes.data);
      setMyDonations(donationsRes.data);
    } catch (err) { toast.error('Gagal memuatkan data'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleDonate = async () => {
    if (!selectedCampaign || slotCount < 1) return;
    setProcessing(true);
    try {
      await api.post('/api/infaq/donate', {
        campaign_id: selectedCampaign.id,
        slots: slotCount,
        payment_method: paymentMethod,
        is_anonymous: isAnonymous,
        message: message || null
      });
      toast.success(`Berjaya menderma ${slotCount} slot! Jazakallahu khairan.`);
      setShowDonatePanel(false);
      setSlotCount(1);
      setMessage('');
      setIsAnonymous(false);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Derma gagal'); }
    finally { setProcessing(false); }
  };

  const openDonatePanel = (campaign) => {
    setSelectedCampaign(campaign);
    setSlotCount(1);
    setShowDonatePanel(true);
  };

  const openDetailPanel = async (campaign) => {
    try {
      const res = await api.get(`/api/infaq/campaigns/${campaign.id}`);
      setSelectedCampaign(res.data);
      setShowDetailPanel(true);
    } catch (err) { toast.error('Gagal memuatkan butiran'); }
  };

  const totalAmount = selectedCampaign ? slotCount * selectedCampaign.price_per_slot : 0;

  return (
    <div className="space-y-6" data-testid="infaq-page">
      {/* Header */}
      <div className="text-center py-6">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl mb-4">
          <Gift className="text-white" size={32} />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 font-heading">Infaq Slot</h1>
        <p className="text-slate-600 mt-2 max-w-xl mx-auto">
          "Perumpamaan orang yang menginfakkan hartanya di jalan Allah seperti sebutir biji yang menumbuhkan tujuh tangkai" - Al-Baqarah: 261
        </p>
      </div>

      {/* Tabs */}
      <div className="flex justify-center">
        <div className="inline-flex bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('campaigns')}
            className={`px-6 py-2.5 rounded-md text-sm font-medium transition-all ${activeTab === 'campaigns' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600'}`}
          >
            Kempen Aktif
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-6 py-2.5 rounded-md text-sm font-medium transition-all ${activeTab === 'history' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600'}`}
          >
            Sejarah Saya
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>
      ) : activeTab === 'campaigns' ? (
        <>
          {campaigns.length === 0 ? (
            <Card className="text-center py-12">
              <Gift className="mx-auto text-slate-300" size={48} />
              <h3 className="mt-4 text-lg font-medium text-slate-700">Tiada kempen aktif</h3>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {campaigns.map((campaign) => (
                <motion.div
                  key={campaign.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ y: -5 }}
                  className="bg-white rounded-2xl shadow-lg overflow-hidden border border-slate-100 hover:shadow-xl transition-all"
                >
                  {/* Campaign Image */}
                  {campaign.image_url && (
                    <div className="h-40 overflow-hidden">
                      <img src={campaign.image_url} alt={campaign.title} className="w-full h-full object-cover" />
                    </div>
                  )}
                  
                  <div className="p-5">
                    <h3 className="font-bold text-lg text-slate-900 mb-2">{campaign.title}</h3>
                    <p className="text-slate-600 text-sm mb-4 line-clamp-2">{campaign.description}</p>
                    
                    {/* Slot Progress */}
                    <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-4 mb-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-slate-600">Slot Terjual</span>
                        <span className="text-lg font-bold text-emerald-600">
                          {campaign.slots_sold.toLocaleString()}/{campaign.total_slots.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-3 bg-white rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(campaign.progress_percent, 100)}%` }}
                          className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
                        />
                      </div>
                      <div className="flex justify-between text-xs text-slate-500 mt-2">
                        <span>{campaign.progress_percent.toFixed(0)}% tercapai</span>
                        <span>RM {campaign.total_collected.toLocaleString()}</span>
                      </div>
                    </div>
                    
                    {/* Slot Info */}
                    <div className="flex items-center justify-between mb-4 p-3 bg-amber-50 rounded-xl border border-amber-200">
                      <div>
                        <p className="text-xs text-amber-700">Harga/Slot</p>
                        <p className="text-lg font-bold text-amber-600">RM {campaign.price_per_slot}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-amber-700">Baki Slot</p>
                        <p className="text-lg font-bold text-amber-600">{campaign.slots_available.toLocaleString()}</p>
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => openDetailPanel(campaign)}>
                        <Eye size={16} /> Lihat
                      </Button>
                      <Button 
                        className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600" 
                        onClick={() => openDonatePanel(campaign)}
                        disabled={campaign.slots_available === 0}
                        data-testid={`donate-infaq-${campaign.id}`}
                      >
                        <Gift size={16} /> Derma
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {myDonations.length === 0 ? (
            <Card className="text-center py-12">
              <Receipt className="mx-auto text-slate-300" size={48} />
              <h3 className="mt-4 text-lg font-medium text-slate-700">Tiada sejarah derma</h3>
              <p className="text-slate-500 mt-2">Mulakan infaq anda hari ini</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {myDonations.map((donation) => (
                <Card key={donation.id} className="animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center">
                        <Gift className="text-white" size={24} />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{donation.campaign_title}</p>
                        <p className="text-sm text-slate-500">{donation.slots} slot × RM {donation.price_per_slot}</p>
                        <p className="text-xs text-slate-400">{new Date(donation.created_at).toLocaleDateString('ms-MY')}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-emerald-600">RM {donation.amount.toFixed(2)}</p>
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
        {showDonatePanel && selectedCampaign && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="fixed inset-0 bg-black/50 z-50" 
              onClick={() => setShowDonatePanel(false)} 
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
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Gift size={24} />
                    Derma Slot Infaq
                  </h3>
                  <button onClick={() => setShowDonatePanel(false)} className="p-2 hover:bg-white/20 rounded-lg transition">
                    <X size={24} />
                  </button>
                </div>
                <div className="bg-white/10 rounded-xl p-3">
                  <h4 className="font-semibold">{selectedCampaign.title}</h4>
                  <div className="flex items-center justify-between mt-2 text-sm text-white/80">
                    <span>RM {selectedCampaign.price_per_slot}/slot</span>
                    <span className="font-bold text-amber-300">{selectedCampaign.slots_available.toLocaleString()} slot tersedia</span>
                  </div>
                </div>
              </div>
              
              {/* Panel Content - Scrollable */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Slot Selection */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Pilih Jumlah Slot</label>
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => setSlotCount(Math.max(selectedCampaign.min_slots || 1, slotCount - 1))}
                      className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-700 hover:bg-slate-200 transition"
                    >
                      <Minus size={20} />
                    </button>
                    <input
                      type="number"
                      min={selectedCampaign.min_slots || 1}
                      max={Math.min(selectedCampaign.max_slots || 5000, selectedCampaign.slots_available)}
                      value={slotCount}
                      onChange={(e) => setSlotCount(Math.max(1, Math.min(selectedCampaign.slots_available, parseInt(e.target.value) || 1)))}
                      className="flex-1 h-12 text-center text-2xl font-bold border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => setSlotCount(Math.min(selectedCampaign.slots_available, selectedCampaign.max_slots || 5000, slotCount + 1))}
                      className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-700 hover:bg-slate-200 transition"
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2 text-center">
                    Min: {selectedCampaign.min_slots || 1} slot | Max: {Math.min(selectedCampaign.max_slots || 5000, selectedCampaign.slots_available)} slot
                  </p>
                </div>

                {/* Quick Slot Selection */}
                <div className="grid grid-cols-4 gap-2">
                  {[1, 5, 10, 20].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setSlotCount(Math.min(num, selectedCampaign.slots_available))}
                      disabled={num > selectedCampaign.slots_available}
                      className={`py-2 rounded-lg text-sm font-semibold transition-all ${slotCount === num ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'} disabled:opacity-50`}
                    >
                      {num} Slot
                    </button>
                  ))}
                </div>

                {/* Total Amount Display */}
                <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Jumlah Bayaran</p>
                      <p className="text-sm text-slate-500">{slotCount} slot × RM {selectedCampaign.price_per_slot}</p>
                    </div>
                    <p className="text-3xl font-bold text-emerald-600">RM {totalAmount.toFixed(2)}</p>
                  </div>
                </div>

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
                    className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-sm text-slate-700">Derma tanpa nama</span>
                </label>

                <div className="p-3 bg-amber-50 rounded-lg text-sm text-amber-800">
                  <strong>Nota:</strong> Ini adalah pembayaran demo. Tiada transaksi sebenar.
                </div>
              </div>

              {/* Panel Footer */}
              <div className="p-4 border-t bg-slate-50 flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowDonatePanel(false)}>Batal</Button>
                <Button 
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600" 
                  onClick={handleDonate} 
                  loading={processing} 
                  disabled={slotCount < 1}
                  data-testid="confirm-infaq-donation"
                >
                  <Gift size={18} />
                  Derma RM {totalAmount.toFixed(2)}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Detail Slide-in Panel */}
      <AnimatePresence>
        {showDetailPanel && selectedCampaign && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="fixed inset-0 bg-black/50 z-50" 
              onClick={() => setShowDetailPanel(false)} 
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl z-50 flex flex-col"
            >
              {/* Panel Header */}
              <div className="p-6 border-b bg-gradient-to-r from-emerald-500 to-teal-500 text-white">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Gift size={24} />
                    Butiran Kempen
                  </h3>
                  <button onClick={() => setShowDetailPanel(false)} className="p-2 hover:bg-white/20 rounded-lg transition">
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
                
                {/* Slot Stats */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-emerald-50 rounded-xl p-4 text-center">
                    <p className="text-sm text-slate-600">Slot Terjual</p>
                    <p className="text-2xl font-bold text-emerald-600">{selectedCampaign.slots_sold.toLocaleString()}</p>
                    <p className="text-xs text-slate-500">dari {selectedCampaign.total_slots.toLocaleString()}</p>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-4 text-center">
                    <p className="text-sm text-slate-600">Baki Slot</p>
                    <p className="text-2xl font-bold text-amber-600">{selectedCampaign.slots_available.toLocaleString()}</p>
                    <p className="text-xs text-slate-500">RM {selectedCampaign.price_per_slot}/slot</p>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-semibold text-emerald-600">RM {selectedCampaign.total_collected?.toLocaleString()}</span>
                    <span className="text-slate-500">Terkumpul</span>
                  </div>
                  <div className="h-3 bg-white rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(selectedCampaign.progress_percent || 0, 100)}%` }}
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
                    />
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 mt-2">
                    <span>{(selectedCampaign.progress_percent || 0).toFixed(0)}% tercapai</span>
                    <span>{selectedCampaign.donor_count || 0} penderma</span>
                  </div>
                </div>

                {/* Recent Donors */}
                {selectedCampaign.recent_donors?.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-3">Penderma Terkini</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {selectedCampaign.recent_donors.map((donor, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                          <div>
                            <p className="font-medium text-slate-900">{donor.donor_name}</p>
                            <p className="text-sm text-slate-500">{donor.slots} slot</p>
                            {donor.message && <p className="text-sm text-slate-500 italic">"{donor.message}"</p>}
                          </div>
                          <p className="font-semibold text-emerald-600">RM {donor.amount.toFixed(2)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Panel Footer */}
              <div className="p-4 border-t bg-slate-50">
                <Button 
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600" 
                  onClick={() => { setShowDetailPanel(false); openDonatePanel(selectedCampaign); }}
                  disabled={selectedCampaign.slots_available === 0}
                >
                  <Gift size={18} />Derma Sekarang
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default InfaqPage;
