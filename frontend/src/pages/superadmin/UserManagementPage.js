import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { 
  Users, Shield, Wallet, UserPlus, Edit, Trash2, Power, Lock,
  LogIn, Search, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  BookOpen, Home, Bus, ShoppingCart, GraduationCap, Building
} from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../App';

// Constants
const ROLES = {
  superadmin: { name: 'Super Admin', icon: Shield, color: 'bg-red-100 text-red-700' },
  admin: { name: 'Admin MRSMKU', icon: Users, color: 'bg-pastel-lavender text-violet-700' },
  bendahari: { name: 'Bendahari', icon: Wallet, color: 'bg-green-100 text-green-700' },
  sub_bendahari: { name: 'Sub Bendahari', icon: Wallet, color: 'bg-emerald-100 text-emerald-700' },
  guru_kelas: { name: 'Guru Kelas', icon: BookOpen, color: 'bg-blue-100 text-blue-700' },
  guru_homeroom: { name: 'Guru HomeRoom', icon: Home, color: 'bg-pastel-mint text-teal-700' },
  warden: { name: 'Warden', icon: Building, color: 'bg-orange-100 text-orange-700' },
  guard: { name: 'Pengawal', icon: Shield, color: 'bg-slate-100 text-slate-700' },
  bus_admin: { name: 'Admin Bas', icon: Bus, color: 'bg-cyan-100 text-cyan-700' },
  bus_driver: { name: 'Driver Bas', icon: Bus, color: 'bg-sky-100 text-sky-700' },
  koop_admin: { name: 'Admin Koperasi', icon: ShoppingCart, color: 'bg-lime-100 text-lime-700' },
  parent: { name: 'Ibu Bapa', icon: Users, color: 'bg-teal-100 text-teal-700' },
  pelajar: { name: 'Pelajar', icon: GraduationCap, color: 'bg-amber-100 text-amber-700' }
};

// Components
const Spinner = ({ size = 'md' }) => (
  <div className={`spinner ${size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'}`}></div>
);

const Button = ({ children, variant = 'primary', size = 'md', loading, disabled, className = '', ...props }) => {
  const variants = {
    primary: 'bg-primary-700 hover:bg-primary-900 text-white shadow-sm hover:shadow-md',
    secondary: 'bg-secondary-600 hover:bg-amber-700 text-white',
    outline: 'border-2 border-primary-700 text-primary-700 hover:bg-primary-50',
    ghost: 'text-slate-600 hover:text-primary-700 hover:bg-slate-100',
    danger: 'bg-red-600 hover:bg-red-700 text-white'
  };
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-5 py-2.5 text-sm', lg: 'px-6 py-3 text-base' };
  return (
    <button className={`font-medium rounded-lg transition-all btn-click flex items-center justify-center gap-2 ${variants[variant]} ${sizes[size]} ${className} ${disabled || loading ? 'opacity-60 cursor-not-allowed' : ''}`} disabled={disabled || loading} {...props}>
      {loading ? <Spinner size="sm" /> : null}{children}
    </button>
  );
};

const Input = ({ label, error, icon: Icon, ...props }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
    <div className="relative">
      {Icon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon size={18} /></div>}
      <input className={`flex h-11 w-full rounded-lg border bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${Icon ? 'pl-10' : ''} ${error ? 'border-red-500' : 'border-slate-200'}`} {...props} />
    </div>
    {error && <p className="text-sm text-red-500">{error}</p>}
  </div>
);

const Select = ({ label, error, children, ...props }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
    <select className={`flex h-11 w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-700 focus:ring-offset-2 ${error ? 'border-red-500' : 'border-slate-200'}`} {...props}>{children}</select>
    {error && <p className="text-sm text-red-500">{error}</p>}
  </div>
);

const Card = ({ children, className = '', ...props }) => (
  <div className={`bg-white rounded-xl border border-slate-100 p-6 relative overflow-hidden ${className}`} {...props}>{children}</div>
);

const Badge = ({ status, children }) => {
  const styles = { approved: 'bg-emerald-100 text-emerald-800', pending: 'bg-amber-100 text-amber-800', rejected: 'bg-red-100 text-red-800', paid: 'bg-emerald-100 text-emerald-800', partial: 'bg-blue-100 text-blue-800', overdue: 'bg-red-100 text-red-800', active: 'bg-emerald-100 text-emerald-800', inactive: 'bg-red-100 text-red-800' };
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${styles[status] || 'bg-slate-100 text-slate-800'}`}>{children}</span>;
};

const UserManagementPage = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUserPanel, setShowUserPanel] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [filterRole, setFilterRole] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, total_pages: 1, has_next: false, has_prev: false });
  const usersPerPage = 20;
  const [formData, setFormData] = useState({ 
    email: '', password: '', full_name: '', phone: '', phone_alt: '', 
    ic_number: '', gender: '', role: 'parent', state: '',
    assigned_class: '', assigned_block: '', assigned_bus_id: '', staff_id: '' 
  });
  const [systemConfig, setSystemConfig] = useState({ negeri: [] });
  const [buses, setBuses] = useState([]);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordUser, setPasswordUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const { login, user: currentUser } = useAuth();
  const navigate = useNavigate();

  // Load system config for dropdown
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await api.get('/api/settings/system-config/public');
        setSystemConfig(res.data);
      } catch (err) {
        console.error('Failed to load system config');
      }
    };
    loadConfig();
  }, []);

  // Load buses for Driver Bas assignment (admin/superadmin)
  useEffect(() => {
    const loadBuses = async () => {
      try {
        const res = await api.get('/api/bus/buses', { params: { is_active: true } });
        setBuses(res.data || []);
      } catch (err) {
        console.error('Failed to load buses', err);
      }
    };
    if (currentUser?.role === 'superadmin' || currentUser?.role === 'admin') loadBuses();
  }, [currentUser?.role]);

  const fetchUsers = async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: usersPerPage };
      if (filterRole) params.role = filterRole;
      if (searchQuery) params.search = searchQuery;
      
      const res = await api.get('/api/users', { params });
      
      // Handle both paginated and non-paginated responses for backward compatibility
      if (res.data.users && res.data.pagination) {
        setUsers(res.data.users);
        setPagination(res.data.pagination);
      } else {
        setUsers(res.data);
        setPagination({ total: res.data.length, total_pages: 1, has_next: false, has_prev: false });
      }
    } catch (err) { toast.error('Gagal memuatkan pengguna'); }
    finally { setLoading(false); }
  };

  useEffect(() => { 
    setCurrentPage(1);
    fetchUsers(1); 
  }, [filterRole, searchQuery]);

  const totalPages = pagination.total_pages;
  const currentUsers = users;

  const handleSearch = () => {
    setSearchQuery(searchTerm);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    fetchUsers(newPage);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editUser) {
        await api.put(`/api/users/${editUser.id}`, { 
          full_name: formData.full_name, 
          phone: formData.phone, 
          phone_alt: formData.phone_alt,
          ic_number: formData.ic_number || undefined,
          gender: formData.gender, 
          role: formData.role, 
          state: formData.state,
          assigned_class: formData.assigned_class, 
          assigned_block: formData.assigned_block,
          assigned_bus_id: formData.role === 'bus_driver' ? (formData.assigned_bus_id || '') : undefined
        });
        toast.success('Pengguna dikemaskini');
      } else {
        await api.post('/api/users', formData);
        toast.success('Pengguna dicipta');
      }
      setShowUserPanel(false);
      setEditUser(null);
      setFormData({ email: '', password: '', full_name: '', phone: '', phone_alt: '', ic_number: '', gender: '', role: 'parent', state: '', assigned_class: '', assigned_block: '', assigned_bus_id: '', staff_id: '' });
      fetchUsers(currentPage);
    } catch (err) { toast.error(err.response?.data?.detail || 'Gagal menyimpan'); }
  };

  const handleToggleActive = async (userId) => {
    try {
      const res = await api.put(`/api/users/${userId}/toggle-active`);
      toast.success(res.data.message);
      fetchUsers(currentPage);
    } catch (err) { toast.error('Gagal mengubah status'); }
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('Adakah anda pasti mahu memadamkan pengguna ini?')) return;
    try {
      await api.delete(`/api/users/${userId}`);
      toast.success('Pengguna dipadam');
      fetchUsers(currentPage);
    } catch (err) { toast.error(err.response?.data?.detail || 'Gagal memadamkan'); }
  };

  const openPasswordModal = (user) => {
    setPasswordUser(user);
    setNewPassword('');
    setConfirmPassword('');
    setShowPasswordModal(true);
  };

  const closePasswordModal = () => {
    setShowPasswordModal(false);
    setPasswordUser(null);
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleSetPassword = async (e) => {
    e.preventDefault();
    if (!passwordUser) return;
    if (newPassword.length < 6) {
      toast.error('Kata laluan minimum 6 aksara');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Kata laluan dan pengesahan tidak sepadan');
      return;
    }
    setPasswordLoading(true);
    try {
      await api.put(`/api/users/${passwordUser.id}/set-password`, { new_password: newPassword });
      toast.success('Kata laluan telah dikemas kini');
      closePasswordModal();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menukar kata laluan');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleImpersonate = async (user) => {
    if (!window.confirm(`Log masuk sebagai ${user.full_name} (${ROLES[user.role]?.name || user.role})?`)) return;
    try {
      const res = await api.post('/api/auth/impersonate', { user_id: user.id });
      login(res.data);
      toast.success(`Anda kini log masuk sebagai ${user.full_name}`);
      
      // Navigate to appropriate dashboard based on role
      const role = res.data.user.role;
      if (role === 'pelajar') navigate('/pelajar');
      else if (role === 'parent') navigate('/dashboard');
      else if (role === 'superadmin') navigate('/superadmin');
      else if (['admin', 'bendahari', 'sub_bendahari'].includes(role)) navigate('/admin');
      else if (['guru_kelas', 'guru_homeroom'].includes(role)) navigate('/guru');
      else if (role === 'warden') navigate('/warden');
      else if (role === 'guard') navigate('/guard');
      else if (role === 'bus_driver') navigate('/driver-bas');
      else navigate('/dashboard');
    } catch (err) { 
      toast.error(err.response?.data?.detail || 'Gagal impersonate'); 
    }
  };

  const openEdit = (user) => {
    setEditUser(user);
    setFormData({ 
      email: user.email, 
      password: '', 
      full_name: user.full_name, 
      phone: user.phone, 
      phone_alt: user.phone_alt || '', 
      ic_number: (user.ic_number || '').replace(/[-\s]/g, ''), 
      gender: user.gender || '', 
      role: user.role, 
      state: user.state || '',
      assigned_class: user.assigned_class || '', 
      assigned_block: user.assigned_block || '', 
      staff_id: user.staff_id || '' 
    });
    setShowUserPanel(true);
  };

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="user-management-page">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 font-heading">Pengurusan Pengguna</h1>
          <p className="text-slate-600 mt-1">Cipta dan urus semua jenis pengguna sistem</p>
        </div>
        <Button onClick={() => { setEditUser(null); setFormData({ email: '', password: '', full_name: '', phone: '', phone_alt: '', ic_number: '', gender: '', role: 'parent', state: '', assigned_class: '', assigned_block: '', staff_id: '' }); setShowUserPanel(true); }} data-testid="add-user-btn">
          <UserPlus size={18} />Tambah Pengguna
        </Button>
      </div>

      {/* Search and Filter Bar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[250px]">
            <div className="relative flex">
              <input
                type="text"
                placeholder="Cari nama, email, telefon atau IC..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={handleKeyPress}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                data-testid="search-input"
              />
              <button
                onClick={handleSearch}
                className="px-4 py-2 bg-primary-600 text-white rounded-r-lg hover:bg-primary-700 transition-colors flex items-center gap-2"
                data-testid="search-btn"
              >
                <Search size={18} />
                Cari
              </button>
            </div>
          </div>
          <Select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className="min-w-[150px]">
            <option value="">Semua Role</option>
            {Object.entries(ROLES).map(([key, val]) => <option key={key} value={key}>{val.name}</option>)}
          </Select>
          {searchQuery && (
            <button
              onClick={() => { setSearchTerm(''); setSearchQuery(''); }}
              className="px-3 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1"
            >
              <X size={16} />
              Reset
            </button>
          )}
        </div>
        {searchQuery && (
          <p className="text-sm text-slate-500 mt-2">
            Menunjukkan {users.length} hasil untuk "{searchQuery}"
          </p>
        )}
      </Card>

      {loading ? <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div> : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-medium text-slate-600">Nama</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600">Email</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600">Role</th>
                  <th className="text-center py-3 px-4 font-medium text-slate-600">Status</th>
                  <th className="text-center py-3 px-4 font-medium text-slate-600">Tindakan</th>
                </tr>
              </thead>
              <tbody>
                {currentUsers.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-8 text-center text-slate-500">
                      {searchQuery ? 'Tiada pengguna dijumpai untuk carian ini' : 'Tiada pengguna'}
                    </td>
                  </tr>
                ) : currentUsers.map((user) => {
                  const roleInfo = ROLES[user.role] || ROLES.parent;
                  const RoleIcon = roleInfo.icon || Users;
                  return (
                    <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${roleInfo.color}`}><RoleIcon size={16} /></div>
                          <div>
                            <p className="font-medium text-slate-900">{user.full_name}</p>
                            <p className="text-xs text-slate-500">{user.phone}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">{user.email}</td>
                      <td className="py-3 px-4"><span className={`px-2 py-1 rounded-full text-xs ${roleInfo.color}`}>{roleInfo.name}</span></td>
                      <td className="py-3 px-4 text-center"><Badge status={user.is_active ? 'active' : 'inactive'}>{user.is_active ? 'Aktif' : 'Tidak Aktif'}</Badge></td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => handleImpersonate(user)} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded" title="Log masuk sebagai pengguna ini" data-testid={`impersonate-${user.id}`}><LogIn size={16} /></button>
                          <button onClick={() => openPasswordModal(user)} className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded" title="Tukar kata laluan"><Lock size={16} /></button>
                          <button onClick={() => openEdit(user)} className="p-1.5 text-slate-600 hover:text-primary-700 hover:bg-primary-50 rounded"><Edit size={16} /></button>
                          <button onClick={() => handleToggleActive(user.id)} className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded"><Power size={16} /></button>
                          {currentUser?.role === 'superadmin' && (
                            <button onClick={() => handleDelete(user.id)} className="p-1.5 text-slate-600 hover:text-red-700 hover:bg-red-50 rounded"><Trash2 size={16} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-4 border-t border-slate-200">
              <p className="text-sm text-slate-600">
                Menunjukkan {((currentPage - 1) * usersPerPage) + 1} - {Math.min(currentPage * usersPerPage, pagination.total)} daripada {pagination.total} pengguna
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronsLeft size={16} />
                </button>
                <button
                  onClick={() => handlePageChange(Math.max(currentPage - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={16} />
                </button>
                
                {/* Page Numbers */}
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`w-8 h-8 text-sm rounded-lg ${currentPage === pageNum ? 'bg-primary-600 text-white' : 'border border-slate-200 hover:bg-slate-50'}`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => handlePageChange(Math.min(currentPage + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  onClick={() => handlePageChange(totalPages)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronsRight size={16} />
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* User Management Slide-in Panel */}
      <AnimatePresence>
        {showUserPanel && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="fixed inset-0 bg-black/50 z-50" 
              onClick={() => { setShowUserPanel(false); setEditUser(null); }} 
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col overflow-x-hidden"
            >
              {/* Panel Header */}
              <div className="p-6 border-b bg-gradient-to-r from-primary-600 to-primary-700 text-white shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xl font-bold flex items-center gap-2 min-w-0 truncate pr-2">
                    <UserPlus size={24} className="flex-shrink-0" />
                    <span className="truncate">{editUser ? 'Edit Pengguna' : 'Tambah Pengguna Baru'}</span>
                  </h3>
                  <button onClick={() => { setShowUserPanel(false); setEditUser(null); }} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-white/20 rounded-lg transition flex-shrink-0" aria-label="Tutup">
                    <X size={24} />
                  </button>
                </div>
              </div>
              
              {/* Panel Content */}
              <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Nama Penuh" placeholder="Nama seperti dalam IC" value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} required />
                  <Input label="Email" type="email" placeholder="email@contoh.com" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required disabled={!!editUser} />
                </div>
                {!editUser && <Input label="Kata Laluan" type="password" placeholder="Minimum 6 aksara" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} required />}
                <div className="grid grid-cols-2 gap-4">
                  <Input label="No. Telefon *" placeholder="0123456789 atau +60123456789" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/[-\s]/g, '') })} required />
                  <Input label="No. Telefon Alternatif" placeholder="No. saudara mara / pasangan" value={formData.phone_alt || ''} onChange={(e) => setFormData({ ...formData, phone_alt: e.target.value.replace(/[-\s]/g, '') })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input label="No. Kad Pengenalan * (12 digit tanpa -)" placeholder="901201061234" value={formData.ic_number} onChange={(e) => setFormData({ ...formData, ic_number: e.target.value.replace(/[-\s]/g, '').slice(0, 12) })} required maxLength={12} />
                  <Select label="Negeri" value={formData.state || ''} onChange={(e) => setFormData({ ...formData, state: e.target.value })}>
                    <option value="">Pilih Negeri</option>
                    {(systemConfig.negeri || []).map(n => <option key={n} value={n}>{n}</option>)}
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Select label="Jantina" value={formData.gender} onChange={(e) => setFormData({ ...formData, gender: e.target.value })}>
                    <option value="">Pilih Jantina</option>
                    <option value="male">Lelaki</option>
                    <option value="female">Perempuan</option>
                  </Select>
                  <Select label="Role" value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })} required>
                    {Object.entries(ROLES).map(([key, val]) => <option key={key} value={key}>{val.name}</option>)}
                  </Select>
                </div>
                {['guru_kelas', 'guru_homeroom'].includes(formData.role) && <Input label="Kelas Ditugaskan" value={formData.assigned_class} onChange={(e) => setFormData({ ...formData, assigned_class: e.target.value })} placeholder="cth: A, B, C" />}
                {formData.role === 'bus_driver' && (
                  <Select label="Bas ditugaskan" value={formData.assigned_bus_id} onChange={(e) => setFormData({ ...formData, assigned_bus_id: e.target.value })}>
                    <option value="">— Tiada / Pilih bas —</option>
                    {buses.map((b) => (
                      <option key={b.id} value={b.id}>{b.plate_number} {b.name ? `(${b.name})` : ''}</option>
                    ))}
                  </Select>
                )}
                {formData.role === 'warden' && (
                  <>
                    <Input label="Blok Ditugaskan" value={formData.assigned_block} onChange={(e) => setFormData({ ...formData, assigned_block: e.target.value })} placeholder="cth: Blok A" />
                    <p className="text-xs text-slate-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                      <strong>Warden</strong> ialah role berasingan daripada Admin. Warden mempunyai dashboard sendiri untuk urusan pelajar (outing, e-hostel) dan pengurusan Bilik Sakit. Hanya Superadmin dan Admin boleh menambah warden.
                    </p>
                  </>
                )}
              </form>

              {/* Panel Footer */}
              <div className="border-t p-6 bg-white">
                <div className="flex gap-3">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => { setShowUserPanel(false); setEditUser(null); }}>Batal</Button>
                  <Button onClick={handleSubmit} className="flex-1">{editUser ? 'Kemaskini' : 'Simpan'}</Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Modal Tukar Kata Laluan */}
      <AnimatePresence>
        {showPasswordModal && passwordUser && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-[60]" onClick={closePasswordModal} />
            <div className="fixed inset-0 z-[61] flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen pointer-events-none" aria-hidden="true">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0 pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
              >
              <div className="flex items-center justify-between gap-2 mb-4">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 min-w-0">
                  <Lock size={20} className="text-emerald-600 flex-shrink-0" />
                  Tukar Kata Laluan
                </h3>
                <button type="button" onClick={closePasswordModal} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 flex-shrink-0" aria-label="Tutup">
                  <X size={20} />
                </button>
              </div>
              <p className="text-sm text-slate-600 mb-4">
                Set kata laluan baru untuk <strong>{passwordUser.full_name}</strong> ({passwordUser.email}).
              </p>
              <form onSubmit={handleSetPassword} className="space-y-4">
                <Input
                  label="Kata laluan baru"
                  type="password"
                  placeholder="Minimum 6 aksara"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                />
                <Input
                  label="Sahkan kata laluan"
                  type="password"
                  placeholder="Ulangi kata laluan"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={closePasswordModal}>Batal</Button>
                  <Button type="submit" className="flex-1" loading={passwordLoading} disabled={passwordLoading}>Simpan Kata Laluan</Button>
                </div>
              </form>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export { UserManagementPage };
export default UserManagementPage;
