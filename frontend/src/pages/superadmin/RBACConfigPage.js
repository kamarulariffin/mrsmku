import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { 
  Shield, Settings, Save, Check,
  Users, Wallet, BookOpen, Home, Bus, ShoppingCart, GraduationCap, Building
} from 'lucide-react';
import api from '../../services/api';

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

const Card = ({ children, className = '', ...props }) => (
  <div className={`bg-white rounded-xl border border-slate-100 p-6 relative overflow-hidden ${className}`} {...props}>{children}</div>
);

const RBACConfigPage = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rbacConfig, setRbacConfig] = useState({});
  const [availableModules, setAvailableModules] = useState({});
  const [selectedRole, setSelectedRole] = useState('admin');
  const [rolePermissions, setRolePermissions] = useState([]);

  useEffect(() => {
    fetchRBACConfig();
  }, []);

  useEffect(() => {
    if (rbacConfig[selectedRole]) {
      setRolePermissions(rbacConfig[selectedRole].permissions || []);
    }
  }, [selectedRole, rbacConfig]);

  const fetchRBACConfig = async () => {
    try {
      const res = await api.get('/api/rbac/config');
      setRbacConfig(res.data.config);
      setAvailableModules(res.data.available_modules);
    } catch (err) {
      toast.error('Gagal memuatkan konfigurasi RBAC');
    } finally {
      setLoading(false);
    }
  };

  const handlePermissionToggle = (permissionCode) => {
    if (rolePermissions.includes(permissionCode)) {
      setRolePermissions(rolePermissions.filter(p => p !== permissionCode));
    } else {
      setRolePermissions([...rolePermissions, permissionCode]);
    }
  };

  const handleModuleToggle = (moduleKey) => {
    const module = availableModules[moduleKey];
    if (!module) return;
    
    const moduleCodes = module.permissions.map(p => p.code);
    const allSelected = moduleCodes.every(code => rolePermissions.includes(code));
    
    if (allSelected) {
      // Remove all module permissions
      setRolePermissions(rolePermissions.filter(p => !moduleCodes.includes(p)));
    } else {
      // Add all module permissions
      const newPermissions = [...new Set([...rolePermissions, ...moduleCodes])];
      setRolePermissions(newPermissions);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/api/rbac/config/${selectedRole}`, { permissions: rolePermissions });
      toast.success(`Kebenaran untuk ${ROLES[selectedRole]?.name || selectedRole} berjaya dikemaskini`);
      fetchRBACConfig();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm(`Reset kebenaran ${ROLES[selectedRole]?.name || selectedRole} ke default?`)) return;
    setSaving(true);
    try {
      await api.post(`/api/rbac/reset/${selectedRole}`);
      toast.success(`Kebenaran direset ke default`);
      fetchRBACConfig();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal reset');
    } finally {
      setSaving(false);
    }
  };

  const getModuleStatus = (moduleKey) => {
    const module = availableModules[moduleKey];
    if (!module) return { selected: 0, total: 0 };
    const moduleCodes = module.permissions.map(p => p.code);
    const selected = moduleCodes.filter(code => rolePermissions.includes(code)).length;
    return { selected, total: moduleCodes.length };
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="rbac-config-page">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 font-heading">Konfigurasi RBAC</h1>
          <p className="text-slate-600 mt-1">Tetapkan akses modul untuk setiap peranan pengguna</p>
        </div>
      </div>

      {/* Role Selection */}
      <Card>
        <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Shield className="text-primary-600" size={20} />
          Pilih Peranan (Role)
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {Object.entries(ROLES).filter(([key]) => key !== 'superadmin').map(([key, role]) => {
            const RoleIcon = role.icon || Shield;
            const config = rbacConfig[key];
            const permCount = config?.permissions?.length || 0;
            return (
              <button
                key={key}
                onClick={() => setSelectedRole(key)}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  selectedRole === key 
                    ? 'border-primary-500 bg-primary-50' 
                    : 'border-slate-200 hover:border-slate-300'
                }`}
                data-testid={`role-btn-${key}`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 ${role.color}`}>
                  <RoleIcon size={20} />
                </div>
                <p className="font-medium text-slate-900 text-sm">{role.name}</p>
                <p className="text-xs text-slate-500 mt-1">{permCount} kebenaran</p>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Permissions Configuration */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <Settings className="text-primary-600" size={20} />
            Kebenaran untuk {ROLES[selectedRole]?.name || selectedRole}
          </h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleReset} disabled={saving}>
              Reset ke Default
            </Button>
            <Button size="sm" onClick={handleSave} loading={saving} data-testid="save-rbac-btn">
              <Save size={16} /> Simpan
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {Object.entries(availableModules).map(([moduleKey, module]) => {
            const { selected, total } = getModuleStatus(moduleKey);
            const allSelected = selected === total;
            const someSelected = selected > 0 && selected < total;
            
            return (
              <div key={moduleKey} className="border border-slate-200 rounded-xl overflow-hidden">
                {/* Module Header */}
                <div 
                  className={`p-4 flex items-center justify-between cursor-pointer ${
                    allSelected ? 'bg-primary-50' : someSelected ? 'bg-amber-50' : 'bg-slate-50'
                  }`}
                  onClick={() => handleModuleToggle(moduleKey)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                      allSelected ? 'bg-primary-600 border-primary-600' : 
                      someSelected ? 'bg-amber-500 border-amber-500' : 'border-slate-300'
                    }`}>
                      {(allSelected || someSelected) && <Check size={14} className="text-white" />}
                    </div>
                    <span className="font-medium text-slate-900">{module.name}</span>
                  </div>
                  <span className={`text-sm px-2 py-0.5 rounded-full ${
                    allSelected ? 'bg-primary-100 text-primary-700' :
                    someSelected ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {selected}/{total}
                  </span>
                </div>
                
                {/* Individual Permissions */}
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2 border-t border-slate-100">
                  {module.permissions.map((perm) => {
                    const isChecked = rolePermissions.includes(perm.code);
                    return (
                      <label 
                        key={perm.code}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handlePermissionToggle(perm.code)}
                          className="w-4 h-4 text-primary-600 border-slate-300 rounded focus:ring-primary-500"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700">{perm.name}</p>
                          <p className="text-xs text-slate-500 truncate">{perm.description}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Summary */}
      <Card className="bg-slate-50">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-600">Jumlah Kebenaran Dipilih</p>
            <p className="text-2xl font-bold text-primary-700">{rolePermissions.length}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-600">Peranan</p>
            <p className="text-lg font-semibold text-slate-900">{ROLES[selectedRole]?.name || selectedRole}</p>
          </div>
        </div>
      </Card>
    </div>
  );
};

export { RBACConfigPage };
export default RBACConfigPage;
