/**
 * Financial Year & Opening Balance Management Page
 * Pengurusan Tahun Kewangan dan Baki Bawa Ke Hadapan
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { 
  Calendar, Plus, Pencil, Lock, CheckCircle2, Building2, 
  RefreshCw, Banknote, ArrowRight, ArrowLeft, X
} from 'lucide-react';
import { API_URL } from '../../../services/api';

export default function FinancialYearPage() {
  const navigate = useNavigate();
  const [years, setYears] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [openingBalances, setOpeningBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('years');
  const [yearDialogOpen, setYearDialogOpen] = useState(false);
  const [balanceDialogOpen, setBalanceDialogOpen] = useState(false);
  const [editingYear, setEditingYear] = useState(null);
  const [selectedYear, setSelectedYear] = useState('');
  const [user, setUser] = useState(null);
  
  const [yearForm, setYearForm] = useState({
    name: '',
    start_date: '',
    end_date: '',
    is_current: false,
    notes: ''
  });
  
  const [balanceForm, setBalanceForm] = useState({
    financial_year_id: '',
    bank_account_id: '',
    amount: '',
    notes: ''
  });

  const getAuthHeader = () => {
    const token = localStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = getAuthHeader();
      
      const [yearsRes, accountsRes, balancesRes, userRes] = await Promise.all([
        fetch(`${API_URL}/api/accounting-full/financial-years`, { headers }),
        fetch(`${API_URL}/api/accounting-full/bank-accounts`, { headers }),
        fetch(`${API_URL}/api/accounting-full/opening-balances`, { headers }),
        fetch(`${API_URL}/api/auth/me`, { headers })
      ]);

      if (yearsRes.ok) {
        const yearsData = await yearsRes.json();
        setYears(yearsData);
        const current = yearsData.find(y => y.is_current);
        if (current) setSelectedYear(current.id);
      }
      if (accountsRes.ok) setBankAccounts(await accountsRes.json());
      if (balancesRes.ok) setOpeningBalances(await balancesRes.json());
      if (userRes.ok) setUser(await userRes.json());
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Gagal memuatkan data');
    } finally {
      setLoading(false);
    }
  };

  const handleYearSubmit = async (e) => {
    e.preventDefault();
    try {
      const url = editingYear 
        ? `${API_URL}/api/accounting-full/financial-years/${editingYear.id}`
        : `${API_URL}/api/accounting-full/financial-years`;
      
      const res = await fetch(url, {
        method: editingYear ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(yearForm)
      });

      if (res.ok) {
        toast.success(editingYear ? 'Tahun kewangan dikemaskini' : 'Tahun kewangan dicipta');
        setYearDialogOpen(false);
        setEditingYear(null);
        setYearForm({ name: '', start_date: '', end_date: '', is_current: false, notes: '' });
        fetchData();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Gagal menyimpan');
      }
    } catch (error) {
      toast.error('Ralat menyimpan tahun kewangan');
    }
  };

  const handleBalanceSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/accounting-full/opening-balances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          ...balanceForm,
          amount: parseFloat(balanceForm.amount)
        })
      });

      if (res.ok) {
        toast.success('Baki bawa ke hadapan ditetapkan');
        setBalanceDialogOpen(false);
        setBalanceForm({ financial_year_id: '', bank_account_id: '', amount: '', notes: '' });
        fetchData();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Gagal menyimpan baki');
      }
    } catch (error) {
      toast.error('Ralat menyimpan baki');
    }
  };

  const handleCloseYear = async (yearId) => {
    if (!window.confirm('Tutup tahun kewangan ini? Pastikan semua transaksi telah disahkan.')) return;
    
    try {
      const res = await fetch(`${API_URL}/api/accounting-full/financial-years/${yearId}/close`, {
        method: 'POST',
        headers: getAuthHeader()
      });

      if (res.ok) {
        toast.success('Tahun kewangan berjaya ditutup');
        fetchData();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Gagal menutup tahun kewangan');
      }
    } catch (error) {
      toast.error('Ralat menutup tahun kewangan');
    }
  };

  const handleSetCurrent = async (yearId) => {
    try {
      const res = await fetch(`${API_URL}/api/accounting-full/financial-years/${yearId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ is_current: true })
      });

      if (res.ok) {
        toast.success('Tahun kewangan semasa ditetapkan');
        fetchData();
      }
    } catch (error) {
      toast.error('Ralat menetapkan tahun semasa');
    }
  };

  const filteredBalances = selectedYear 
    ? openingBalances.filter(b => b.financial_year_id === selectedYear)
    : openingBalances;

  const totalOpeningBalance = filteredBalances.reduce((sum, b) => sum + b.amount, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-6 min-w-0 overflow-x-hidden" data-testid="financial-year-page">
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
              <Calendar className="w-8 h-8 text-emerald-600" />
              Tahun Kewangan & Baki Bawa Ke Hadapan
            </h1>
            <p className="text-gray-600 mt-1">Urus tahun kewangan dan baki awal setiap akaun</p>
          </div>
          <button 
            onClick={fetchData} 
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Muat Semula
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6">
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('years')}
            className={`flex-1 py-3 px-4 text-center font-medium ${activeTab === 'years' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Tahun Kewangan
          </button>
          <button
            onClick={() => setActiveTab('balances')}
            className={`flex-1 py-3 px-4 text-center font-medium ${activeTab === 'balances' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Baki Bawa Ke Hadapan
          </button>
        </div>

        {/* Financial Years Tab */}
        {activeTab === 'years' && (
          <div className="p-4 space-y-4">
            <div className="flex justify-end">
              <button
                onClick={() => {
                  setEditingYear(null);
                  setYearForm({ name: '', start_date: '', end_date: '', is_current: false, notes: '' });
                  setYearDialogOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                data-testid="add-financial-year-btn"
              >
                <Plus className="w-4 h-4" />
                Tambah Tahun Kewangan
              </button>
            </div>

            <div className="space-y-4">
              {years.map(year => (
                <div key={year.id} className={`bg-gray-50 rounded-lg p-4 ${year.is_current ? 'ring-2 ring-blue-500' : ''}`} data-testid={`financial-year-${year.id}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-lg ${year.is_current ? 'bg-blue-100 text-blue-600' : year.is_closed ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-600'}`}>
                        <Calendar className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-semibold">{year.name}</h3>
                          {year.is_current && (
                            <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">Semasa</span>
                          )}
                          {year.is_closed && (
                            <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded-full">Ditutup</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 flex items-center gap-1">
                          {year.start_date} <ArrowRight className="w-3 h-3" /> {year.end_date}
                        </p>
                        {year.notes && <p className="text-sm text-gray-400 mt-1">{year.notes}</p>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {!year.is_closed && !year.is_current && (
                        <button 
                          onClick={() => handleSetCurrent(year.id)}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Tetap Semasa
                        </button>
                      )}
                      {!year.is_closed && (user?.role === 'superadmin' || user?.role === 'juruaudit') && (
                        <button 
                          onClick={() => handleCloseYear(year.id)}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm border border-amber-300 text-amber-600 rounded-lg hover:bg-amber-50"
                        >
                          <Lock className="w-3 h-3" /> Tutup Tahun
                        </button>
                      )}
                      {!year.is_closed && (
                        <button 
                          onClick={() => {
                            setEditingYear(year);
                            setYearForm({
                              name: year.name,
                              start_date: year.start_date,
                              end_date: year.end_date,
                              is_current: year.is_current,
                              notes: year.notes || ''
                            });
                            setYearDialogOpen(true);
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {years.length === 0 && !loading && (
              <div className="text-center py-12">
                <Calendar className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">Tiada tahun kewangan. Klik "Tambah Tahun Kewangan" untuk mula.</p>
              </div>
            )}
          </div>
        )}

        {/* Opening Balances Tab */}
        {activeTab === 'balances' && (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                {years.length > 0 && (
                  <select 
                    value={selectedYear} 
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Semua Tahun</option>
                    {years.map(y => (
                      <option key={y.id} value={y.id}>{y.name}</option>
                    ))}
                  </select>
                )}
              </div>
              <button
                onClick={() => setBalanceDialogOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                data-testid="add-opening-balance-btn"
              >
                <Plus className="w-4 h-4" />
                Tetapkan Baki
              </button>
            </div>

            {/* Summary */}
            <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-emerald-100">Jumlah Baki Bawa Ke Hadapan</p>
                  <p className="text-3xl font-bold">RM {totalOpeningBalance.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</p>
                  {selectedYear && (
                    <p className="text-emerald-200 text-sm mt-1">
                      Tahun: {years.find(y => y.id === selectedYear)?.name}
                    </p>
                  )}
                </div>
                <Banknote className="w-12 h-12 text-emerald-200" />
              </div>
            </div>

            {/* Balances List */}
            <div className="space-y-4">
              {filteredBalances.map(balance => (
                <div key={balance.id} className="bg-gray-50 rounded-lg p-4" data-testid={`opening-balance-${balance.id}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-lg bg-emerald-100 text-emerald-600">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{balance.bank_account_name}</h3>
                        <p className="text-sm text-gray-500">{balance.financial_year_name}</p>
                        {balance.notes && <p className="text-sm text-gray-400">{balance.notes}</p>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-emerald-600">
                        RM {balance.amount.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-gray-400">oleh {balance.created_by_name}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {filteredBalances.length === 0 && !loading && (
              <div className="text-center py-12">
                <Banknote className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">Tiada baki bawa ke hadapan untuk tahun ini.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Year Dialog Modal */}
      {yearDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center overflow-y-auto min-h-[100dvh] min-h-screen z-50">
          <div className="bg-white rounded-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{editingYear ? 'Edit Tahun Kewangan' : 'Tambah Tahun Kewangan'}</h2>
              <button onClick={() => setYearDialogOpen(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleYearSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Tahun Kewangan *</label>
                <input 
                  type="text"
                  value={yearForm.name}
                  onChange={(e) => setYearForm({ ...yearForm, name: e.target.value })}
                  placeholder="cth: 2025/2026"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tarikh Mula *</label>
                  <input 
                    type="date"
                    value={yearForm.start_date}
                    onChange={(e) => setYearForm({ ...yearForm, start_date: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tarikh Akhir *</label>
                  <input 
                    type="date"
                    value={yearForm.end_date}
                    onChange={(e) => setYearForm({ ...yearForm, end_date: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox"
                  id="is_current"
                  checked={yearForm.is_current}
                  onChange={(e) => setYearForm({ ...yearForm, is_current: e.target.checked })}
                  className="rounded"
                />
                <label htmlFor="is_current" className="text-sm text-gray-700">Tetapkan sebagai tahun semasa</label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Catatan</label>
                <input 
                  type="text"
                  value={yearForm.notes}
                  onChange={(e) => setYearForm({ ...yearForm, notes: e.target.value })}
                  placeholder="Catatan tambahan"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button type="button" onClick={() => setYearDialogOpen(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Batal</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">{editingYear ? 'Simpan' : 'Cipta'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Balance Dialog Modal */}
      {balanceDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center overflow-y-auto min-h-[100dvh] min-h-screen z-50">
          <div className="bg-white rounded-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Tetapkan Baki Bawa Ke Hadapan</h2>
              <button onClick={() => setBalanceDialogOpen(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleBalanceSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tahun Kewangan *</label>
                <select 
                  value={balanceForm.financial_year_id} 
                  onChange={(e) => setBalanceForm({ ...balanceForm, financial_year_id: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Pilih tahun kewangan</option>
                  {years.filter(y => !y.is_closed).map(y => (
                    <option key={y.id} value={y.id}>{y.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Akaun Bank *</label>
                <select 
                  value={balanceForm.bank_account_id} 
                  onChange={(e) => setBalanceForm({ ...balanceForm, bank_account_id: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Pilih akaun bank</option>
                  {bankAccounts.filter(a => a.is_active).map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Jumlah Baki (RM) *</label>
                <input 
                  type="number"
                  step="0.01"
                  min="0"
                  value={balanceForm.amount}
                  onChange={(e) => setBalanceForm({ ...balanceForm, amount: e.target.value })}
                  placeholder="0.00"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Catatan</label>
                <input 
                  type="text"
                  value={balanceForm.notes}
                  onChange={(e) => setBalanceForm({ ...balanceForm, notes: e.target.value })}
                  placeholder="Catatan tambahan"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button type="button" onClick={() => setBalanceDialogOpen(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Batal</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
