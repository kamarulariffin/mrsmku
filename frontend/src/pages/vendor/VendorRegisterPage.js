import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Store, ArrowLeft, Phone, Building, CreditCard, 
  AlertCircle, CheckCircle, DollarSign
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../../services/api';

const VendorRegisterPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    business_name: '',
    business_description: '',
    business_category: 'general',
    contact_phone: '',
    bank_name: '',
    bank_account_number: '',
    bank_account_name: ''
  });
  const [errors, setErrors] = useState({});

  const categories = [
    { value: 'general', label: 'Umum' },
    { value: 'food', label: 'Makanan & Minuman' },
    { value: 'clothing', label: 'Pakaian & Aksesori' },
    { value: 'stationery', label: 'Alat Tulis' },
    { value: 'electronics', label: 'Elektronik' },
    { value: 'services', label: 'Perkhidmatan' },
    { value: 'crafts', label: 'Kraftangan' },
    { value: 'others', label: 'Lain-lain' }
  ];

  const banks = [
    'Maybank',
    'CIMB Bank',
    'Public Bank',
    'RHB Bank',
    'Hong Leong Bank',
    'AmBank',
    'Bank Islam',
    'Bank Rakyat',
    'BSN',
    'Affin Bank',
    'OCBC Bank',
    'UOB Bank',
    'HSBC',
    'Standard Chartered'
  ];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateStep1 = () => {
    const newErrors = {};
    if (!formData.business_name.trim()) {
      newErrors.business_name = 'Nama perniagaan diperlukan';
    } else if (formData.business_name.trim().length < 3) {
      newErrors.business_name = 'Nama perniagaan mesti sekurang-kurangnya 3 aksara';
    }
    if (!formData.contact_phone.trim()) {
      newErrors.contact_phone = 'No. telefon diperlukan';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = () => {
    const newErrors = {};
    if (!formData.bank_name) {
      newErrors.bank_name = 'Sila pilih bank';
    }
    if (!formData.bank_account_number.trim()) {
      newErrors.bank_account_number = 'No. akaun diperlukan';
    }
    if (!formData.bank_account_name.trim()) {
      newErrors.bank_account_name = 'Nama pemegang akaun diperlukan';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNextStep = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
    }
  };

  const handleSubmit = async () => {
    if (!validateStep2()) return;

    setLoading(true);
    try {
      await api.post('/api/marketplace/vendors/apply', formData);
      toast.success('Permohonan vendor berjaya dihantar!');
      navigate('/vendor');
    } catch (error) {
      console.error('Error submitting vendor application:', error);
      toast.error(error.response?.data?.detail || 'Gagal menghantar permohonan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 min-w-0 overflow-x-hidden" data-testid="vendor-register-page">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button 
            onClick={() => navigate('/vendor')}
            className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-gray-200 rounded-lg transition"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Store className="h-6 w-6 text-violet-600" />
              Permohonan Vendor
            </h1>
            <p className="text-gray-500">Daftar sebagai vendor marketplace</p>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${
              step >= 1 ? 'bg-violet-600 text-white' : 'bg-gray-200 text-gray-500'
            }`}>
              <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-sm">1</span>
              <span className="font-medium">Maklumat Perniagaan</span>
            </div>
            <div className="w-8 h-0.5 bg-gray-300"></div>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${
              step >= 2 ? 'bg-violet-600 text-white' : 'bg-gray-200 text-gray-500'
            }`}>
              <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-sm">2</span>
              <span className="font-medium">Maklumat Bank</span>
            </div>
          </div>
        </div>

        {/* Commission Info */}
        <div className="bg-gradient-to-r from-pastel-lavender to-pastel-mint rounded-xl border border-pastel-lilac p-4 mb-6">
          <div className="flex items-start gap-3">
            <DollarSign className="h-5 w-5 text-violet-600 mt-0.5" />
            <div>
              <p className="font-medium text-violet-900">Pecahan Pendapatan</p>
              <p className="text-sm text-violet-700">
                90% kepada anda, 5% Dana Kecemerlangan, 5% Koperasi. 
                Yuran pendaftaran: <strong>RM 20.00</strong> (sekali sahaja).
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl border shadow-sm">
          {step === 1 && (
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-2 text-gray-900 font-medium border-b pb-4">
                <Building className="h-5 w-5 text-violet-600" />
                Maklumat Perniagaan
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nama Perniagaan / Kedai <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="business_name"
                    value={formData.business_name}
                    onChange={handleChange}
                    placeholder="Contoh: Kedai Runcit Aminah"
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 ${
                      errors.business_name ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.business_name && (
                    <p className="text-sm text-red-500 mt-1">{errors.business_name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Penerangan Perniagaan
                  </label>
                  <textarea
                    name="business_description"
                    value={formData.business_description}
                    onChange={handleChange}
                    placeholder="Terangkan perniagaan anda secara ringkas..."
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Kategori Perniagaan
                  </label>
                  <select
                    name="business_category"
                    value={formData.business_category}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  >
                    {categories.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    No. Telefon <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="tel"
                      name="contact_phone"
                      value={formData.contact_phone}
                      onChange={handleChange}
                      placeholder="01X-XXXXXXX"
                      className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 ${
                        errors.contact_phone ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                  </div>
                  {errors.contact_phone && (
                    <p className="text-sm text-red-500 mt-1">{errors.contact_phone}</p>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t">
                <button
                  onClick={handleNextStep}
                  className="px-6 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition"
                >
                  Seterusnya
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-2 text-gray-900 font-medium border-b pb-4">
                <CreditCard className="h-5 w-5 text-violet-600" />
                Maklumat Bank
              </div>

              <div className="bg-amber-50 p-4 rounded-lg flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium">Penting!</p>
                  <p>Maklumat bank ini akan digunakan untuk pemindahan pendapatan anda. 
                  Pastikan maklumat adalah tepat dan betul.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nama Bank <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="bank_name"
                    value={formData.bank_name}
                    onChange={handleChange}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 ${
                      errors.bank_name ? 'border-red-500' : 'border-gray-300'
                    }`}
                  >
                    <option value="">-- Pilih Bank --</option>
                    {banks.map(bank => (
                      <option key={bank} value={bank}>{bank}</option>
                    ))}
                  </select>
                  {errors.bank_name && (
                    <p className="text-sm text-red-500 mt-1">{errors.bank_name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    No. Akaun Bank <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="bank_account_number"
                    value={formData.bank_account_number}
                    onChange={handleChange}
                    placeholder="Contoh: 1234567890"
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 ${
                      errors.bank_account_number ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.bank_account_number && (
                    <p className="text-sm text-red-500 mt-1">{errors.bank_account_number}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nama Pemegang Akaun <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="bank_account_name"
                    value={formData.bank_account_name}
                    onChange={handleChange}
                    placeholder="Nama seperti dalam akaun bank"
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 ${
                      errors.bank_account_name ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.bank_account_name && (
                    <p className="text-sm text-red-500 mt-1">{errors.bank_account_name}</p>
                  )}
                </div>
              </div>

              <div className="flex justify-between pt-4 border-t">
                <button
                  onClick={() => setStep(1)}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  Kembali
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="px-6 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition flex items-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Menghantar...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-5 w-5" />
                      Hantar Permohonan
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VendorRegisterPage;
