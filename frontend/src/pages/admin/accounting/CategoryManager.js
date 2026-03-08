import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Edit2,
  Trash2,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  XCircle,
  RefreshCw,
  AlertCircle,
  FolderTree,
  Tag
} from 'lucide-react';
import { API_URL } from '../../../services/api';

const CategoryManager = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Filter
  const [activeTab, setActiveTab] = useState('income');

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'income',
    description: '',
    parent_id: '',
    account_code: ''
  });
  const [formLoading, setFormLoading] = useState(false);

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
      const allowedRoles = ['superadmin', 'admin', 'bendahari', 'sub_bendahari', 'juruaudit'];
      if (!allowedRoles.includes(userData.role)) {
        setError('Anda tiada kebenaran untuk mengakses halaman ini');
        return;
      }

      // Fetch categories
      const catRes = await fetch(`${API_URL}/api/accounting-full/categories?include_inactive=true`, { headers });
      if (catRes.ok) {
        const catData = await catRes.json();
        setCategories(catData);
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
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.name || formData.name.length < 2) {
      setError('Nama kategori perlu sekurang-kurangnya 2 aksara');
      return;
    }

    try {
      setFormLoading(true);
      const headers = {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      };

      const url = editingId
        ? `${API_URL}/api/accounting-full/categories/${editingId}`
        : `${API_URL}/api/accounting-full/categories`;

      const response = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers,
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Gagal menyimpan kategori');
      }

      setSuccess(editingId ? 'Kategori berjaya dikemaskini' : 'Kategori berjaya dicipta');
      setShowForm(false);
      setEditingId(null);
      setFormData({ name: '', type: 'income', description: '', parent_id: '', account_code: '' });
      fetchData();

    } catch (err) {
      setError(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = (category) => {
    setFormData({
      name: category.name,
      type: category.type,
      description: category.description || '',
      parent_id: category.parent_id || '',
      account_code: category.account_code || ''
    });
    setEditingId(category.id);
    setShowForm(true);
  };

  const handleDelete = async (category) => {
    if (!window.confirm(`Padam kategori "${category.name}"?`)) return;

    try {
      const response = await fetch(`${API_URL}/api/accounting-full/categories/${category.id}`, {
        method: 'DELETE',
        headers: getAuthHeader()
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Gagal memadam kategori');
      }

      setSuccess(data.message || 'Kategori berjaya dipadam');
      fetchData();

    } catch (err) {
      setError(err.message);
    }
  };

  const filteredCategories = categories.filter(cat => cat.type === activeTab);
  const parentCategories = categories.filter(cat => cat.type === formData.type && !cat.parent_id && cat.id !== editingId);
  const isBendahari = ['superadmin', 'admin', 'bendahari'].includes(user?.role);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Memuat...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-6 min-w-0 overflow-x-hidden" data-testid="category-manager-page">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/admin/accounting')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Dashboard
        </button>
        
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <FolderTree className="w-6 h-6 text-blue-600" />
              Pengurusan Kategori
            </h1>
            <p className="text-gray-600">Urus kategori pendapatan dan perbelanjaan</p>
          </div>
          {isBendahari && (
            <button
              onClick={() => {
                setShowForm(true);
                setEditingId(null);
                setFormData({ name: '', type: activeTab, description: '', parent_id: '', account_code: '' });
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              data-testid="add-category-btn"
            >
              <Plus className="w-4 h-4" />
              Tambah Kategori
            </button>
          )}
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5" />
          {error}
          <button onClick={() => setError('')} className="ml-auto">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}
      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
          <CheckCircle className="w-5 h-5" />
          {success}
          <button onClick={() => setSuccess('')} className="ml-auto">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => setActiveTab('income')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 font-medium transition-colors ${
              activeTab === 'income'
                ? 'text-green-700 bg-green-50 border-b-2 border-green-600'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
            data-testid="tab-income"
          >
            <TrendingUp className="w-4 h-4" />
            Wang Masuk ({categories.filter(c => c.type === 'income').length})
          </button>
          <button
            onClick={() => setActiveTab('expense')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 font-medium transition-colors ${
              activeTab === 'expense'
                ? 'text-red-700 bg-red-50 border-b-2 border-red-600'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
            data-testid="tab-expense"
          >
            <TrendingDown className="w-4 h-4" />
            Wang Keluar ({categories.filter(c => c.type === 'expense').length})
          </button>
        </div>

        {/* Category List */}
        <div className="divide-y divide-gray-100">
          {filteredCategories.length === 0 ? (
            <div className="p-8 text-center">
              <Tag className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">Tiada kategori</p>
            </div>
          ) : (
            filteredCategories.map((cat) => (
              <div
                key={cat.id}
                className={`p-4 flex items-center justify-between ${!cat.is_active ? 'bg-gray-50 opacity-60' : ''}`}
                data-testid={`category-${cat.id}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    cat.type === 'income' ? 'bg-green-100' : 'bg-red-100'
                  }`}>
                    {cat.type === 'income' ? (
                      <TrendingUp className="w-5 h-5 text-green-600" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      {cat.account_code && (
                        <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{cat.account_code}</span>
                      )}
                      <p className="font-medium text-gray-800">{cat.name}</p>
                      {!cat.is_active && (
                        <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">Tidak Aktif</span>
                      )}
                      {cat.parent_name && (
                        <span className="text-xs text-gray-500">({cat.parent_name})</span>
                      )}
                    </div>
                    {cat.description && (
                      <p className="text-sm text-gray-500">{cat.description}</p>
                    )}
                  </div>
                </div>
                
                {isBendahari && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEdit(cat)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                      data-testid={`edit-${cat.id}`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(cat)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      data-testid={`delete-${cat.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto min-h-[100dvh] min-h-screen" data-testid="category-form-modal">
          <div className="bg-white rounded-xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0">
            <h3 className="text-lg font-semibold mb-4">
              {editingId ? 'Edit Kategori' : 'Tambah Kategori Baru'}
            </h3>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Jenis</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, type: 'income', parent_id: '' }))}
                    className={`p-3 rounded-lg border flex items-center justify-center gap-2 ${
                      formData.type === 'income'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-200'
                    }`}
                  >
                    <TrendingUp className="w-4 h-4" />
                    Wang Masuk
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, type: 'expense', parent_id: '' }))}
                    className={`p-3 rounded-lg border flex items-center justify-center gap-2 ${
                      formData.type === 'expense'
                        ? 'border-red-500 bg-red-50 text-red-700'
                        : 'border-gray-200'
                    }`}
                  >
                    <TrendingDown className="w-4 h-4" />
                    Wang Keluar
                  </button>
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nama Kategori <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="Cth: Derma & Infaq"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  data-testid="category-name-input"
                />
              </div>

              {/* Parent Category */}
              {parentCategories.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Kategori Induk (Pilihan)
                  </label>
                  <select
                    name="parent_id"
                    value={formData.parent_id}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Tiada (Kategori Utama) --</option>
                    {parentCategories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Penerangan (Pilihan)</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows={2}
                  placeholder="Penerangan ringkas tentang kategori ini"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Kod Akaun COA */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Kod Akaun (Pilihan)</label>
                <input
                  type="text"
                  name="account_code"
                  value={formData.account_code}
                  onChange={handleInputChange}
                  placeholder="Cth: 4100, 5100"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Untuk Senarai Akaun & Imbangan Duga</p>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                    setFormData({ name: '', type: 'income', description: '', parent_id: '', account_code: '' });
                  }}
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
                  data-testid="save-category-btn"
                >
                  {formLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    'Simpan'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoryManager;
