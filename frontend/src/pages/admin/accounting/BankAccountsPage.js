/**
 * Bank Accounts Management Page
 * Pengurusan Akaun Bank
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { 
  Building2, Plus, Pencil, Trash2, Wallet, PiggyBank, 
  Banknote, CreditCard, RefreshCw, ArrowLeft, X
} from 'lucide-react';
import { API_URL } from '../../../services/api';

const ACCOUNT_TYPES = [
  { value: 'current', label: 'Akaun Semasa', icon: Building2 },
  { value: 'savings', label: 'Akaun Simpanan', icon: PiggyBank },
  { value: 'petty_cash', label: 'Tunai Runcit', icon: Wallet },
  { value: 'fixed_deposit', label: 'Simpanan Tetap', icon: Banknote }
];

const getAccountIcon = (type) => {
  const found = ACCOUNT_TYPES.find(t => t.value === type);
  return found ? found.icon : CreditCard;
};

export default function BankAccountsPage() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    account_type: 'current',
    bank_name: '',
    account_number: '',
    description: '',
    account_code: ''
  });

  const getAuthHeader = () => {
    const token = localStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/accounting-full/bank-accounts?include_inactive=true`, {
        headers: getAuthHeader()
      });
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);
      }
    } catch (error) {
      console.error('Error fetching accounts:', error);
      toast.error('Gagal memuatkan senarai akaun');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const url = editingAccount 
        ? `${API_URL}/api/accounting-full/bank-accounts/${editingAccount.id}`
        : `${API_URL}/api/accounting-full/bank-accounts`;
      
      const res = await fetch(url, {
        method: editingAccount ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader()
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        toast.success(editingAccount ? 'Akaun berjaya dikemaskini' : 'Akaun berjaya dicipta');
        setDialogOpen(false);
        setEditingAccount(null);
        setFormData({ name: '', account_type: 'current', bank_name: '', account_number: '', description: '', account_code: '' });
        fetchAccounts();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Gagal menyimpan akaun');
      }
    } catch (error) {
      console.error('Error saving account:', error);
      toast.error('Ralat menyimpan akaun');
    }
  };

  const handleEdit = (account) => {
    setEditingAccount(account);
    setFormData({
      name: account.name,
      account_type: account.account_type,
      bank_name: account.bank_name || '',
      account_number: account.account_number || '',
      description: account.description || '',
      account_code: account.account_code || ''
    });
    setDialogOpen(true);
  };

  const handleDelete = async (account) => {
    if (!window.confirm(`Padam akaun "${account.name}"?`)) return;
    
    try {
      const res = await fetch(`${API_URL}/api/accounting-full/bank-accounts/${account.id}`, {
        method: 'DELETE',
        headers: getAuthHeader()
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(data.message);
        fetchAccounts();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Gagal memadam akaun');
      }
    } catch (error) {
      console.error('Error deleting account:', error);
      toast.error('Ralat memadam akaun');
    }
  };

  const totalBalance = accounts.filter(a => a.is_active).reduce((sum, acc) => sum + acc.current_balance, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-6 min-w-0 overflow-x-hidden" data-testid="bank-accounts-page">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <button 
              onClick={() => navigate('/admin/accounting-full')}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Kembali
            </button>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <Building2 className="w-8 h-8 text-blue-600" />
              Pengurusan Akaun Bank
            </h1>
            <p className="text-gray-600 mt-1">Urus akaun bank dan baki</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={fetchAccounts} 
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Muat Semula
            </button>
            <button 
              onClick={() => {
                setEditingAccount(null);
                setFormData({ name: '', account_type: 'current', bank_name: '', account_number: '', description: '', account_code: '' });
                setDialogOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              data-testid="add-bank-account-btn"
            >
              <Plus className="w-4 h-4" />
              Tambah Akaun
            </button>
          </div>
        </div>
      </div>

      {/* Summary Card */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-blue-100">Jumlah Baki Semua Akaun</p>
            <p className="text-3xl font-bold">RM {totalBalance.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</p>
          </div>
          <Building2 className="w-12 h-12 text-blue-200" />
        </div>
      </div>

      {/* Accounts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map(account => {
          const Icon = getAccountIcon(account.account_type);
          return (
            <div key={account.id} className={`bg-white rounded-xl shadow-sm border border-gray-100 ${!account.is_active ? 'opacity-60' : ''}`} data-testid={`bank-account-${account.id}`}>
              {!account.is_active && (
                <div className="px-4 pt-3">
                  <span className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded">Tidak Aktif</span>
                </div>
              )}
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      account.account_type === 'current' ? 'bg-blue-100 text-blue-600' :
                      account.account_type === 'savings' ? 'bg-green-100 text-green-600' :
                      account.account_type === 'petty_cash' ? 'bg-amber-100 text-amber-600' :
                      'bg-pastel-lavender text-violet-600'
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        {account.account_code && (
                          <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{account.account_code}</span>
                        )}
                        <h3 className="font-semibold text-gray-800">{account.name}</h3>
                      </div>
                      <p className="text-sm text-gray-500">{account.account_type_display}</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  {account.bank_name && (
                    <p className="text-sm text-gray-600">{account.bank_name}</p>
                  )}
                  {account.account_number && (
                    <p className="text-sm font-mono text-gray-500">{account.account_number}</p>
                  )}
                  <div className="pt-2 border-t">
                    <p className="text-sm text-gray-500">Baki Semasa</p>
                    <p className={`text-xl font-bold ${account.current_balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      RM {account.current_balance.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => handleEdit(account)} className="flex-1 flex items-center justify-center gap-1 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                    <button onClick={() => handleDelete(account)} className="flex-1 flex items-center justify-center gap-1 px-3 py-2 border border-red-300 rounded-lg text-sm text-red-600 hover:bg-red-50">
                      <Trash2 className="w-3 h-3" /> Padam
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {accounts.length === 0 && !loading && (
        <div className="bg-white rounded-xl p-12 text-center">
          <Building2 className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-500">Tiada akaun bank. Klik "Tambah Akaun" untuk mula.</p>
        </div>
      )}

      {/* Dialog Modal */}
      {dialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto min-h-[100dvh] min-h-screen">
          <div className="bg-white rounded-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{editingAccount ? 'Edit Akaun Bank' : 'Tambah Akaun Bank'}</h2>
              <button onClick={() => setDialogOpen(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Akaun *</label>
                <input 
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="cth: Akaun Semasa MUAFAKAT"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Jenis Akaun *</label>
                <select 
                  value={formData.account_type} 
                  onChange={(e) => setFormData({ ...formData, account_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {ACCOUNT_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Bank</label>
                <input 
                  type="text"
                  value={formData.bank_name}
                  onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                  placeholder="cth: Bank Islam Malaysia Berhad"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombor Akaun</label>
                <input 
                  type="text"
                  value={formData.account_number}
                  onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                  placeholder="cth: 14-123-456789-0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Keterangan</label>
                <input 
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Keterangan ringkas"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kod Akaun (COA)</label>
                <input 
                  type="text"
                  value={formData.account_code}
                  onChange={(e) => setFormData({ ...formData, account_code: e.target.value })}
                  placeholder="cth: 1100 (pilihan - untuk Senarai Akaun)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button type="button" onClick={() => setDialogOpen(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                  Batal
                </button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  {editingAccount ? 'Simpan' : 'Cipta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
