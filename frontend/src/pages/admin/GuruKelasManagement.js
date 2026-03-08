import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Users, Search, Plus, Edit, Trash2, X, Save, RefreshCw,
  UserCheck, GraduationCap, Building, Check
} from 'lucide-react';
import api from '../../services/api';

const Spinner = ({ size = 'md' }) => (
  <div className={`animate-spin rounded-full border-2 border-primary-200 border-t-primary-600 ${size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'}`}></div>
);

const Card = ({ children, className = '', ...props }) => (
  <div className={`bg-white rounded-xl border border-slate-100 p-6 shadow-sm ${className}`} {...props}>{children}</div>
);

const Badge = ({ variant = 'default', children }) => {
  const styles = {
    active: 'bg-emerald-100 text-emerald-800',
    inactive: 'bg-slate-100 text-slate-600',
    default: 'bg-primary-100 text-primary-800'
  };
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${styles[variant] || styles.default}`}>{children}</span>;
};

const MALAYSIAN_STATES = [
  'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan',
  'Pahang', 'Perak', 'Perlis', 'Pulau Pinang', 'Sabah',
  'Sarawak', 'Selangor', 'Terengganu', 'W.P. Kuala Lumpur',
  'W.P. Labuan', 'W.P. Putrajaya'
];

const GuruKelasManagement = () => {
  const [loading, setLoading] = useState(true);
  const [classSummary, setClassSummary] = useState(null);
  const [systemConfig, setSystemConfig] = useState({ kelas: [], tingkatan: [] });
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingGuru, setEditingGuru] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedTingkatan, setSelectedTingkatan] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignTarget, setAssignTarget] = useState(null);
  
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    phone_alt: '',
    ic_number: '',
    state: '',
    assigned_form: '',
    assigned_class: '',
    password: '',
    status: 'active'
  });

  // Fetch class summary with guru assignments
  const fetchClassSummary = useCallback(async () => {
    try {
      const res = await api.get('/api/admin/class-summary');
      setClassSummary(res.data);
    } catch (err) {
      console.error('Failed to fetch class summary:', err);
      toast.error('Gagal memuatkan ringkasan kelas');
    }
  }, []);

  // Fetch system config
  const fetchSystemConfig = useCallback(async () => {
    try {
      const res = await api.get('/api/settings/system-config');
      setSystemConfig({
        kelas: res.data?.kelas || ['A', 'B', 'C', 'D', 'E', 'F'],
        tingkatan: res.data?.tingkatan || [1, 2, 3, 4, 5]
      });
    } catch (err) {
      console.error('Failed to fetch system config:', err);
      setSystemConfig({ kelas: ['A', 'B', 'C', 'D', 'E', 'F'], tingkatan: [1, 2, 3, 4, 5] });
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchClassSummary(), fetchSystemConfig()]);
      setLoading(false);
    };
    loadData();
  }, [fetchClassSummary, fetchSystemConfig]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'ic_number') {
      setFormData(prev => ({ ...prev, [name]: value.replace(/[-\s]/g, '').slice(0, 12) }));
      return;
    }
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData({
      full_name: '',
      email: '',
      phone: '',
      phone_alt: '',
      ic_number: '',
      state: '',
      assigned_form: '',
      assigned_class: '',
      password: '',
      status: 'active'
    });
    setEditingGuru(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (guru) => {
    setEditingGuru(guru);
    setFormData({
      full_name: guru.name || '',
      email: guru.email || '',
      phone: guru.phone || '',
      phone_alt: guru.phone_alt || '',
      ic_number: (guru.ic_number || '').replace(/[-\s]/g, ''),
      state: guru.state || '',
      assigned_form: guru.assigned_form || '',
      assigned_class: guru.assigned_class || '',
      password: '',
      status: guru.status || 'active'
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.full_name || !formData.email) {
      toast.error('Sila lengkapkan maklumat wajib');
      return;
    }
    
    if (!editingGuru && !formData.password) {
      toast.error('Kata laluan diperlukan untuk guru baharu');
      return;
    }
    
    setSubmitting(true);
    
    try {
      const payload = {
        full_name: formData.full_name,
        email: formData.email,
        phone: formData.phone,
        phone_alt: formData.phone_alt,
        ic_number: formData.ic_number,
        state: formData.state,
        assigned_form: formData.assigned_form ? parseInt(formData.assigned_form) : null,
        assigned_class: formData.assigned_class || null,
        role: 'guru_kelas',
        status: formData.status
      };
      
      if (formData.password) {
        payload.password = formData.password;
      }
      
      if (editingGuru) {
        await api.put(`/api/users/${editingGuru.id}`, payload);
        toast.success('Maklumat guru berjaya dikemas kini');
      } else {
        await api.post('/api/auth/register', {
          ...payload,
          password: formData.password
        });
        toast.success('Guru kelas baharu berjaya didaftarkan');
      }
      
      setShowModal(false);
      resetForm();
      fetchClassSummary();
    } catch (err) {
      console.error('Failed to save guru:', err);
      toast.error(err.response?.data?.detail || 'Gagal menyimpan maklumat guru');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (guru) => {
    if (!window.confirm(`Adakah anda pasti ingin memadam ${guru.name}?`)) {
      return;
    }
    
    try {
      await api.delete(`/api/users/${guru.id}`);
      toast.success('Guru berjaya dipadam');
      fetchClassSummary();
    } catch (err) {
      console.error('Failed to delete guru:', err);
      toast.error('Gagal memadam guru');
    }
  };

  const handleAssignGuru = async (guruId) => {
    if (!assignTarget) return;
    
    setSubmitting(true);
    try {
      await api.post(`/api/admin/guru-kelas/assign?guru_id=${guruId}&tingkatan=${assignTarget.tingkatan}&kelas=${assignTarget.kelas}`);
      toast.success(`Berjaya menugaskan guru ke T${assignTarget.tingkatan} ${assignTarget.kelas}`);
      setShowAssignModal(false);
      setAssignTarget(null);
      fetchClassSummary();
    } catch (err) {
      console.error('Failed to assign guru:', err);
      toast.error(err.response?.data?.detail || 'Gagal menugaskan guru');
    } finally {
      setSubmitting(false);
    }
  };

  const openAssignModal = (tingkatan, kelas) => {
    setAssignTarget({ tingkatan, kelas });
    setShowAssignModal(true);
  };

  // Filter guru list by search
  const filteredGuru = (classSummary?.guru_list || []).filter(guru => {
    const searchLower = searchQuery.toLowerCase();
    return (
      guru.name?.toLowerCase().includes(searchLower) ||
      guru.email?.toLowerCase().includes(searchLower)
    );
  });

  // Get unassigned guru for assignment modal
  const unassignedGuru = (classSummary?.guru_list || []).filter(g => !g.assigned_form || !g.assigned_class);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="guru-kelas-management">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 font-heading">Pengurusan Guru Kelas</h1>
          <p className="text-slate-600">Tahun {classSummary?.tahun || new Date().getFullYear()} - {classSummary?.statistics?.total_classes || 30} kelas</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchClassSummary()}
            className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            title="Muat Semula"
          >
            <RefreshCw size={20} className="text-slate-600" />
          </button>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors"
            data-testid="add-guru-btn"
          >
            <Plus size={18} />
            Tambah Guru Kelas
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary-100 rounded-lg">
              <Users className="text-primary-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Jumlah Guru</p>
              <p className="text-2xl font-bold text-slate-900">{classSummary?.statistics?.total_guru_kelas || 0}</p>
            </div>
          </div>
        </Card>
        
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-100 rounded-lg">
              <UserCheck className="text-emerald-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Ditugaskan</p>
              <p className="text-2xl font-bold text-emerald-600">{classSummary?.statistics?.assigned_classes || 0}</p>
            </div>
          </div>
        </Card>
        
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-100 rounded-lg">
              <Building className="text-amber-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Jumlah Kelas</p>
              <p className="text-2xl font-bold text-amber-600">{classSummary?.statistics?.total_classes || 30}</p>
            </div>
          </div>
        </Card>
        
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-100 rounded-lg">
              <X className="text-red-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Belum Ditugaskan</p>
              <p className="text-2xl font-bold text-red-600">{classSummary?.statistics?.unassigned_classes || 0}</p>
              <p className="text-xs text-slate-400 mt-1">Bilangan kelas yang belum ada guru kelas</p>
            </div>
          </div>
        </Card>
        
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 rounded-lg">
              <GraduationCap className="text-blue-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Jumlah Pelajar</p>
              <p className="text-2xl font-bold text-blue-600">{classSummary?.statistics?.total_students || 0}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Class Matrix by Tingkatan */}
      <Card>
        <h3 className="font-semibold text-slate-800 mb-4">Matriks Kelas Mengikut Tingkatan</h3>
        
        {/* Tingkatan Tabs */}
        <div className="flex flex-wrap gap-2 mb-4 border-b border-slate-200 pb-4">
          <button
            onClick={() => setSelectedTingkatan(null)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedTingkatan === null ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Semua Tingkatan
          </button>
          {systemConfig.tingkatan.map(t => (
            <button
              key={t}
              onClick={() => setSelectedTingkatan(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedTingkatan === t ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Tingkatan {t}
            </button>
          ))}
        </div>
        
        {/* Class Grid */}
        {(classSummary?.class_matrix || [])
          .filter(tm => selectedTingkatan === null || tm.tingkatan === selectedTingkatan)
          .map(tingkatanData => (
            <div key={tingkatanData.tingkatan} className="mb-6">
              <h4 className="font-medium text-slate-700 mb-3 flex items-center gap-2">
                <GraduationCap size={18} className="text-primary-600" />
                Tingkatan {tingkatanData.tingkatan}
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                {tingkatanData.classes.map(kelas => (
                  <div
                    key={`${tingkatanData.tingkatan}-${kelas.class_name}`}
                    className={`p-4 rounded-xl border-2 text-center cursor-pointer transition-all hover:shadow-md ${
                      kelas.has_guru 
                        ? 'border-emerald-200 bg-emerald-50 hover:border-emerald-300' 
                        : 'border-slate-200 bg-slate-50 hover:border-primary-300'
                    }`}
                    onClick={() => !kelas.has_guru && openAssignModal(tingkatanData.tingkatan, kelas.class_name)}
                    data-testid={`class-cell-t${tingkatanData.tingkatan}-${kelas.class_name}`}
                  >
                    <p className="text-lg font-bold text-slate-800">
                      T{tingkatanData.tingkatan} {kelas.class_name}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{kelas.student_count} pelajar</p>
                    {kelas.has_guru ? (
                      <div className="mt-2">
                        <p className="text-xs text-emerald-600 font-medium truncate" title={kelas.guru?.name}>
                          {kelas.guru?.name}
                        </p>
                        <Check size={16} className="mx-auto mt-1 text-emerald-500" />
                      </div>
                    ) : (
                      <div className="mt-2">
                        <p className="text-xs text-slate-400">Belum ditugaskan</p>
                        <Plus size={16} className="mx-auto mt-1 text-slate-400" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
      </Card>

      {/* Guru List */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800">Senarai Guru Kelas</h3>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Cari nama atau email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
              data-testid="search-guru-input"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="pb-3 font-medium">Nama Guru</th>
                <th className="pb-3 font-medium">Email</th>
                <th className="pb-3 font-medium">No. Telefon</th>
                <th className="pb-3 font-medium">Tingkatan</th>
                <th className="pb-3 font-medium">Kelas</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium text-center">Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {filteredGuru.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-500">
                    {searchQuery ? 'Tiada guru dijumpai' : 'Belum ada guru kelas didaftarkan'}
                  </td>
                </tr>
              ) : (
                filteredGuru.map((guru) => (
                  <tr key={guru.id} className="border-b border-slate-50 hover:bg-slate-50" data-testid={`guru-row-${guru.id}`}>
                    <td className="py-3">
                      <p className="font-medium text-slate-800">{guru.name}</p>
                    </td>
                    <td className="py-3 text-slate-600">{guru.email}</td>
                    <td className="py-3 text-slate-600">{guru.phone || '-'}</td>
                    <td className="py-3">
                      {guru.assigned_form ? (
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                          Tingkatan {guru.assigned_form}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3">
                      {guru.assigned_class ? (
                        <span className="px-2 py-1 bg-primary-100 text-primary-700 rounded text-xs font-medium">
                          Kelas {guru.assigned_class}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3">
                      <Badge variant={guru.status === 'active' ? 'active' : 'inactive'}>
                        {guru.status === 'active' ? 'Aktif' : 'Tidak Aktif'}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEditModal(guru)}
                          className="p-2 hover:bg-primary-100 rounded-lg transition-colors text-primary-600"
                          title="Edit"
                          data-testid={`edit-guru-${guru.id}`}
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(guru)}
                          className="p-2 hover:bg-red-100 rounded-lg transition-colors text-red-600"
                          title="Padam"
                          data-testid={`delete-guru-${guru.id}`}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen" onClick={() => !submitting && setShowModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">
                {editingGuru ? 'Edit Guru Kelas' : 'Tambah Guru Kelas Baharu'}
              </h3>
              <button 
                onClick={() => !submitting && setShowModal(false)} 
                className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-slate-100 rounded-lg"
                disabled={submitting}
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Full Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nama Penuh <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              
              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              
              {/* IC Number - tanpa "-" */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">No. Kad Pengenalan (12 digit tanpa -)</label>
                <input
                  type="text"
                  name="ic_number"
                  value={formData.ic_number}
                  onChange={handleInputChange}
                  placeholder="901201061234"
                  maxLength={12}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              
              {/* Phone Numbers */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">No. Telefon</label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    placeholder="01X-XXXXXXX"
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">No. Telefon Alternatif</label>
                  <input
                    type="tel"
                    name="phone_alt"
                    value={formData.phone_alt}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              
              {/* State */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Negeri</label>
                <select
                  name="state"
                  value={formData.state}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Pilih Negeri</option>
                  {MALAYSIAN_STATES.map(state => (
                    <option key={state} value={state}>{state}</option>
                  ))}
                </select>
              </div>
              
              {/* Tingkatan & Kelas */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tingkatan</label>
                  <select
                    name="assigned_form"
                    value={formData.assigned_form}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Pilih Tingkatan</option>
                    {systemConfig.tingkatan.map(t => (
                      <option key={t} value={t}>Tingkatan {t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Kelas</label>
                  <select
                    name="assigned_class"
                    value={formData.assigned_class}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Pilih Kelas</option>
                    {systemConfig.kelas.map(k => (
                      <option key={k} value={k}>Kelas {k}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Kata Laluan {!editingGuru && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder={editingGuru ? 'Kosongkan jika tidak mahu tukar' : 'Masukkan kata laluan'}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                  required={!editingGuru}
                />
              </div>
              
              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="active">Aktif</option>
                  <option value="inactive">Tidak Aktif</option>
                </select>
              </div>
            </form>
            
            <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => !submitting && setShowModal(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
                disabled={submitting}
              >
                Batal
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {submitting ? <Spinner size="sm" /> : <Save size={18} />}
                {editingGuru ? 'Simpan' : 'Daftar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Guru Modal */}
      {showAssignModal && assignTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen" onClick={() => setShowAssignModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-800">
                Tugaskan Guru ke T{assignTarget.tingkatan} {assignTarget.kelas}
              </h3>
              <p className="text-sm text-slate-500 mt-1">Pilih guru untuk ditugaskan ke kelas ini</p>
            </div>
            
            <div className="p-6 max-h-80 overflow-y-auto">
              {unassignedGuru.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <p>Tiada guru yang belum ditugaskan</p>
                  <button
                    onClick={() => { setShowAssignModal(false); openAddModal(); }}
                    className="mt-2 text-primary-600 hover:underline text-sm"
                  >
                    Tambah guru baharu
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {unassignedGuru.map(guru => (
                    <button
                      key={guru.id}
                      onClick={() => handleAssignGuru(guru.id)}
                      disabled={submitting}
                      className="w-full p-4 text-left border border-slate-200 rounded-xl hover:border-primary-300 hover:bg-primary-50 transition-colors disabled:opacity-50"
                    >
                      <p className="font-medium text-slate-800">{guru.name}</p>
                      <p className="text-sm text-slate-500">{guru.email}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-slate-100">
              <button
                onClick={() => setShowAssignModal(false)}
                className="w-full px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export { GuruKelasManagement };
export default GuruKelasManagement;
