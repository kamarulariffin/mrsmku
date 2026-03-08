import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Settings, DollarSign, Percent, Save, ArrowLeft, AlertCircle, 
  Award, Store, Image
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../../../services/api';

const MarketplaceSettingsPage = () => {
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Commission form
  const [danaPercent, setDanaPercent] = useState(5);
  const [koopPercent, setKoopPercent] = useState(5);
  const [vendorPercent, setVendorPercent] = useState(90);
  const [regFee, setRegFee] = useState(20);

  // Ad packages form
  const [bronzePrice, setBronzePrice] = useState(25);
  const [silverPrice, setSilverPrice] = useState(90);
  const [goldPrice, setGoldPrice] = useState(500);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await api.get('/api/marketplace/settings');
      setSettings(res.data);
      setDanaPercent(res.data.dana_kecemerlangan_percent || 5);
      setKoopPercent(res.data.koperasi_percent || 5);
      setVendorPercent(res.data.vendor_percent || 90);
      setRegFee(res.data.vendor_registration_fee || 20);
      
      if (res.data.ad_packages) {
        setBronzePrice(res.data.ad_packages.bronze?.price || 25);
        setSilverPrice(res.data.ad_packages.silver?.price || 90);
        setGoldPrice(res.data.ad_packages.gold?.price || 500);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast.error('Gagal memuatkan tetapan');
    } finally {
      setLoading(false);
    }
  };

  const validateCommission = () => {
    const total = parseFloat(danaPercent) + parseFloat(koopPercent) + parseFloat(vendorPercent);
    return total === 100;
  };

  const saveCommissionSettings = async () => {
    if (!validateCommission()) {
      toast.error('Jumlah peratusan mesti sama dengan 100%');
      return;
    }

    setSaving(true);
    try {
      await api.put('/api/marketplace/settings/commission', {
        dana_kecemerlangan_percent: parseFloat(danaPercent),
        koperasi_percent: parseFloat(koopPercent),
        vendor_percent: parseFloat(vendorPercent),
        vendor_registration_fee: parseFloat(regFee)
      });
      toast.success('Tetapan komisyen berjaya disimpan');
      fetchSettings();
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error(error.response?.data?.detail || 'Gagal menyimpan tetapan');
    } finally {
      setSaving(false);
    }
  };

  const saveAdPackageSettings = async () => {
    setSaving(true);
    try {
      await api.put('/api/marketplace/settings/ad-packages', {
        bronze_price: parseFloat(bronzePrice),
        silver_price: parseFloat(silverPrice),
        gold_price: parseFloat(goldPrice)
      });
      toast.success('Harga pakej iklan berjaya disimpan');
      fetchSettings();
    } catch (error) {
      console.error('Error saving ad packages:', error);
      toast.error(error.response?.data?.detail || 'Gagal menyimpan harga pakej');
    } finally {
      setSaving(false);
    }
  };

  const commissionTotal = parseFloat(danaPercent || 0) + parseFloat(koopPercent || 0) + parseFloat(vendorPercent || 0);
  const isValidTotal = commissionTotal === 100;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 min-w-0 overflow-x-hidden" data-testid="marketplace-settings-page">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate('/admin/marketplace')}
          className="p-2 hover:bg-gray-100 rounded-lg transition"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="h-6 w-6 text-teal-600" />
            Tetapan Marketplace
          </h1>
          <p className="text-gray-500">Konfigurasi komisyen dan pakej iklan</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Commission Settings */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="p-6 border-b">
            <h3 className="font-semibold flex items-center gap-2">
              <Percent className="h-5 w-5 text-emerald-600" />
              Tetapan Komisyen
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Pembahagian hasil jualan antara Dana Kecemerlangan, Koperasi, dan Vendor
            </p>
          </div>
          <div className="p-6 space-y-6">
            {/* Visual Split */}
            <div className="h-8 rounded-lg overflow-hidden flex">
              <div 
                className="bg-emerald-500 flex items-center justify-center text-white text-xs font-medium transition-all"
                style={{ width: `${danaPercent}%` }}
              >
                {danaPercent > 10 && `${danaPercent}%`}
              </div>
              <div 
                className="bg-amber-500 flex items-center justify-center text-white text-xs font-medium transition-all"
                style={{ width: `${koopPercent}%` }}
              >
                {koopPercent > 10 && `${koopPercent}%`}
              </div>
              <div 
                className="bg-teal-500 flex items-center justify-center text-white text-xs font-medium transition-all"
                style={{ width: `${vendorPercent}%` }}
              >
                {vendorPercent > 10 && `${vendorPercent}%`}
              </div>
            </div>

            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                <span>Dana Kecemerlangan</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                <span>Koperasi</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-teal-500"></div>
                <span>Vendor</span>
              </div>
            </div>

            {/* Input Fields */}
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="flex items-center gap-2 mb-2 text-sm font-medium">
                    <Award className="h-4 w-4 text-emerald-600" />
                    Dana Kecemerlangan
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={danaPercent}
                      onChange={(e) => setDanaPercent(e.target.value)}
                      min="0"
                      max="100"
                      step="0.5"
                      className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-2 mb-2 text-sm font-medium">
                    <Store className="h-4 w-4 text-amber-600" />
                    Koperasi
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={koopPercent}
                      onChange={(e) => setKoopPercent(e.target.value)}
                      min="0"
                      max="100"
                      step="0.5"
                      className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-2 mb-2 text-sm font-medium">
                    <DollarSign className="h-4 w-4 text-teal-600" />
                    Vendor
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={vendorPercent}
                      onChange={(e) => setVendorPercent(e.target.value)}
                      min="0"
                      max="100"
                      step="0.5"
                      className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                  </div>
                </div>
              </div>

              {/* Total Indicator */}
              <div className={`p-3 rounded-lg flex items-center justify-between ${isValidTotal ? 'bg-emerald-50' : 'bg-red-50'}`}>
                <span className={`flex items-center gap-2 ${isValidTotal ? 'text-emerald-700' : 'text-red-700'}`}>
                  {isValidTotal ? (
                    <Award className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  Jumlah Peratusan: {commissionTotal.toFixed(1)}%
                </span>
                {!isValidTotal && (
                  <span className="text-red-600 text-sm">Mesti = 100%</span>
                )}
              </div>

              {/* Registration Fee */}
              <div>
                <label className="mb-2 block text-sm font-medium">Yuran Pendaftaran Vendor</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">RM</span>
                  <input
                    type="number"
                    value={regFee}
                    onChange={(e) => setRegFee(e.target.value)}
                    min="0"
                    step="1"
                    className="w-full pl-12 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
            </div>

            <button 
              onClick={saveCommissionSettings} 
              disabled={saving || !isValidTotal}
              className="w-full px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Save className="h-4 w-4" />
              Simpan Tetapan Komisyen
            </button>
          </div>
        </div>

        {/* Ad Package Settings */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="p-6 border-b">
            <h3 className="font-semibold flex items-center gap-2">
              <Image className="h-5 w-5 text-blue-600" />
              Pakej Iklan
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Tetapkan harga pakej iklan untuk vendor
            </p>
          </div>
          <div className="p-6 space-y-6">
            {/* Bronze */}
            <div className="p-4 border rounded-lg bg-amber-50/50">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-semibold text-amber-800">Bronze</h4>
                  <p className="text-sm text-amber-600">1 bulan paparan</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-amber-200 flex items-center justify-center">
                  <Award className="h-5 w-5 text-amber-700" />
                </div>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">RM</span>
                <input
                  type="number"
                  value={bronzePrice}
                  onChange={(e) => setBronzePrice(e.target.value)}
                  min="0"
                  step="1"
                  className="w-full pl-12 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            {/* Silver */}
            <div className="p-4 border rounded-lg bg-gray-50">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-semibold text-gray-700">Silver</h4>
                  <p className="text-sm text-gray-500">3 bulan paparan</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                  <Award className="h-5 w-5 text-gray-600" />
                </div>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">RM</span>
                <input
                  type="number"
                  value={silverPrice}
                  onChange={(e) => setSilverPrice(e.target.value)}
                  min="0"
                  step="1"
                  className="w-full pl-12 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500"
                />
              </div>
            </div>

            {/* Gold */}
            <div className="p-4 border rounded-lg bg-yellow-50">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-semibold text-yellow-800">Gold</h4>
                  <p className="text-sm text-yellow-600">12 bulan paparan + Premium</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-yellow-200 flex items-center justify-center">
                  <Award className="h-5 w-5 text-yellow-700" />
                </div>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">RM</span>
                <input
                  type="number"
                  value={goldPrice}
                  onChange={(e) => setGoldPrice(e.target.value)}
                  min="0"
                  step="1"
                  className="w-full pl-12 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500"
                />
              </div>
            </div>

            <button 
              onClick={saveAdPackageSettings} 
              disabled={saving}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Save className="h-4 w-4" />
              Simpan Harga Pakej
            </button>
          </div>
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-800">Cara Komisyen Berfungsi</h4>
            <p className="text-sm text-blue-700 mt-1">
              Setiap kali pembelian selesai, sistem akan secara automatik membahagikan hasil jualan mengikut 
              peratusan yang ditetapkan. Dana Kecemerlangan dan Koperasi akan direkodkan dalam 
              <span className="font-medium"> Financial Ledger</span> untuk pelaporan. Semua transaksi akan 
              dipaparkan secara terperinci dalam laporan Dana Kecemerlangan.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketplaceSettingsPage;
