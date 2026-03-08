import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  TrendingUp,
  TrendingDown,
  Upload,
  X,
  AlertCircle,
  CheckCircle,
  RefreshCw
} from 'lucide-react';
import { API_URL } from '../../../services/api';

const TransactionForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const preselectedType = location.state?.type || '';

  const [, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    type: preselectedType || 'income',
    category_id: '',
    bank_account_id: '',
    amount: '',
    transaction_date: new Date().toISOString().split('T')[0],
    description: '',
    reference_number: '',
    source: 'manual',
    notes: ''
  });
  const [bankAccounts, setBankAccounts] = useState([]);

  const [document, setDocument] = useState(null);

  const getAuthHeader = useCallback(() => {
    const token = localStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeader();

      // Fetch user
      const userRes = await fetch(`${API_URL}/api/auth/me`, { headers });
      if (!userRes.ok) {
        navigate('/login');
        return;
      }
      const userData = await userRes.json();
      setUser(userData);

      // Check access
      const allowedRoles = ['superadmin', 'admin', 'bendahari', 'sub_bendahari'];
      if (!allowedRoles.includes(userData.role)) {
        setError('Anda tiada kebenaran untuk mencipta transaksi');
        return;
      }

      // Fetch categories (aktif sahaja; pastikan respons sentiasa array)
      const catRes = await fetch(`${API_URL}/api/accounting-full/categories?include_inactive=false`, { headers });
      if (catRes.ok) {
        const catData = await catRes.json();
        const list = Array.isArray(catData) ? catData : (catData?.data ?? catData?.categories ?? []);
        setCategories(list);
      }
      // Fetch bank accounts (for entri bergu - pilih akaun bank)
      const bankRes = await fetch(`${API_URL}/api/accounting-full/bank-accounts`, { headers });
      if (bankRes.ok) {
        const bankData = await bankRes.json();
        setBankAccounts(Array.isArray(bankData) ? bankData : []);
      }
    } catch (err) {
      setError('Gagal memuat data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [navigate, getAuthHeader]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleTypeChange = (type) => {
    setFormData(prev => ({ ...prev, type, category_id: '' }));
  };

  const handleDocumentChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('Fail terlalu besar. Maksimum 5MB.');
        return;
      }
      setDocument(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (!formData.category_id) {
      setError('Sila pilih kategori');
      return;
    }
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      setError('Sila masukkan jumlah yang sah');
      return;
    }
    if (!formData.description || formData.description.length < 5) {
      setError('Penerangan perlu sekurang-kurangnya 5 aksara');
      return;
    }

    try {
      setSaving(true);
      const headers = {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      };

      const response = await fetch(`${API_URL}/api/accounting-full/transactions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...formData,
          amount: parseFloat(formData.amount)
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Gagal mencipta transaksi');
      }

      setSuccess(`Transaksi ${data.transaction_number} berjaya dicipta!`);
      
      // Navigate after short delay
      setTimeout(() => {
        navigate(`/admin/accounting/transactions/${data.id}`);
      }, 1500);

    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const currentType = (formData.type || 'income').toLowerCase();
  const filteredCategories = (categories || []).filter(
    cat => (cat.type || '').toLowerCase() === currentType
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Memuat...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-6 min-w-0 overflow-x-hidden" data-testid="transaction-form-page">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/admin/accounting/transactions')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali
        </button>
        <h1 className="text-2xl font-bold text-gray-800">Transaksi Baru</h1>
        <p className="text-gray-600">Rekod wang masuk atau wang keluar</p>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700" data-testid="error-alert">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700" data-testid="success-alert">
          <CheckCircle className="w-5 h-5" />
          {success}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-2xl">
        <div className="mb-4 p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700">
          <strong>Entri bergu:</strong> Sistem akan merekod debit dan kredit secara automatik. Wang masuk: Debit Akaun Bank, Kredit Hasil. Wang keluar: Debit Belanja, Kredit Akaun Bank. Jika akaun bank tidak dipilih, sistem akan guna akaun default.
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-6">
          {/* Transaction Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Jenis Transaksi</label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => handleTypeChange('income')}
                className={`p-4 rounded-xl border-2 flex items-center justify-center gap-2 transition-all ${
                  formData.type === 'income'
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-200 hover:border-green-300'
                }`}
                data-testid="type-income-btn"
              >
                <TrendingUp className="w-5 h-5" />
                <span className="font-medium">Wang Masuk</span>
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange('expense')}
                className={`p-4 rounded-xl border-2 flex items-center justify-center gap-2 transition-all ${
                  formData.type === 'expense'
                    ? 'border-red-500 bg-red-50 text-red-700'
                    : 'border-gray-200 hover:border-red-300'
                }`}
                data-testid="type-expense-btn"
              >
                <TrendingDown className="w-5 h-5" />
                <span className="font-medium">Wang Keluar</span>
              </button>
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Kategori <span className="text-red-500">*</span>
            </label>
            <select
              name="category_id"
              value={formData.category_id}
              onChange={handleInputChange}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              data-testid="category-select"
            >
              <option value="">-- Pilih Kategori --</option>
              {filteredCategories.map(cat => (
                <option key={cat.id || cat._id} value={cat.id || cat._id}>{cat.name}</option>
              ))}
            </select>
            {filteredCategories.length === 0 && (
              <p className="mt-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Tiada kategori untuk {formData.type === 'expense' ? 'Wang Keluar' : 'Wang Masuk'}. Sila{' '}
                <button type="button" onClick={() => navigate('/admin/accounting/categories')} className="underline font-medium text-amber-800 hover:text-amber-900">
                  tambah kategori
                </button>
                {' '}di Menu → Kategori, atau minta pentadbir menjalankan seed kategori default.
              </p>
            )}
          </div>

          {/* Bank Account (optional - for double-entry) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Akaun Bank (pilihan)</label>
            <select
              name="bank_account_id"
              value={formData.bank_account_id}
              onChange={handleInputChange}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              data-testid="bank-account-select"
            >
              <option value="">-- Pilih Akaun Bank (atau biar kosong untuk akaun sistem) --</option>
              {bankAccounts.map(b => (
                <option key={b.id} value={b.id}>{b.name}{b.account_number ? ` (${b.account_number})` : ''}</option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Jumlah (RM) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              name="amount"
              value={formData.amount}
              onChange={handleInputChange}
              step="0.01"
              min="0.01"
              placeholder="0.00"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg font-semibold"
              data-testid="amount-input"
            />
          </div>

          {/* Transaction Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tarikh Transaksi <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              name="transaction_date"
              value={formData.transaction_date}
              onChange={handleInputChange}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              data-testid="date-input"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Penerangan <span className="text-red-500">*</span>
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              rows={3}
              placeholder="Terangkan tujuan transaksi ini..."
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              data-testid="description-input"
            />
          </div>

          {/* Source */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Sumber</label>
            <select
              name="source"
              value={formData.source}
              onChange={handleInputChange}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              data-testid="source-select"
            >
              <option value="manual">Kemasukan Manual</option>
              <option value="external">Sumber Luar (Derma/Syarikat)</option>
              <option value="system">Auto Sistem</option>
            </select>
          </div>

          {/* Reference Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Nombor Rujukan (Pilihan)</label>
            <input
              type="text"
              name="reference_number"
              value={formData.reference_number}
              onChange={handleInputChange}
              placeholder="Cth: INV-001, RESIT-2024-001"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              data-testid="reference-input"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Nota Tambahan (Pilihan)</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              rows={2}
              placeholder="Nota tambahan untuk rekod dalaman..."
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              data-testid="notes-input"
            />
          </div>

          {/* Document Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Dokumen Sokongan (Pilihan)</label>
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center">
              {document ? (
                <div className="flex items-center justify-center gap-2">
                  <span className="text-sm text-gray-600">{document.name}</span>
                  <button
                    type="button"
                    onClick={() => setDocument(null)}
                    className="p-1 hover:bg-gray-100 rounded"
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                  <label className="cursor-pointer">
                    <span className="text-blue-600 hover:underline">Pilih fail</span>
                    <input
                      type="file"
                      onChange={handleDocumentChange}
                      accept=".pdf,.jpg,.jpeg,.png"
                      className="hidden"
                    />
                  </label>
                  <p className="text-xs text-gray-500 mt-1">PDF, JPG, PNG (Maks 5MB)</p>
                </>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-4 border-t border-gray-100">
            <button
              type="submit"
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
              data-testid="submit-btn"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Simpan Transaksi
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default TransactionForm;
