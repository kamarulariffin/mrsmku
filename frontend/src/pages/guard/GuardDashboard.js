import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Car, Check, AlertCircle, Clock, Plus, Eye, Trash2, X, Fingerprint, LogIn, LogOut
} from 'lucide-react';
import api from '../../services/api';
import { Button, Input, Select, Card, StatCard, Spinner } from '../../components/common';

// Guard constants
const RELATIONSHIP_OPTIONS = [
  { value: 'bapa', label: 'Bapa' },
  { value: 'ibu', label: 'Ibu' },
  { value: 'penjaga', label: 'Penjaga' },
  { value: 'adik_beradik', label: 'Adik Beradik' },
  { value: 'lain', label: 'Lain-lain' }
];

export const GuardDashboard = () => {
  const [stats, setStats] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('scan');
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [searchPlate, setSearchPlate] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentSearch, setStudentSearch] = useState('');

  const [registerForm, setRegisterForm] = useState({
    plate_number: '',
    owner_name: '',
    relationship: 'bapa',
    phone: ''
  });

  const [matricScan, setMatricScan] = useState({ matric_number: '', direction: 'out', reason: '' });
  const [matricSubmitting, setMatricSubmitting] = useState(false);
  const [lastMatricResult, setLastMatricResult] = useState(null);

  const fetchData = async () => {
    try {
      const [statsRes, vehiclesRes, scansRes] = await Promise.all([
        api.get('/api/vehicles/stats'),
        api.get('/api/vehicles'),
        api.get('/api/vehicles/scans')
      ]);
      setStats(statsRes.data);
      setVehicles(vehiclesRes.data);
      setScans(scansRes.data);
    } catch (err) {
      toast.error('Gagal memuatkan data');
    } finally {
      setLoading(false);
    }
  };

  const searchStudents = async (query) => {
    if (query.length < 2) { setStudents([]); return; }
    try {
      const res = await api.get(`/api/guard/students?search=${query}`);
      setStudents(res.data);
    } catch { setStudents([]); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSearch = async () => {
    if (!searchPlate) return;
    try {
      const res = await api.get(`/api/vehicles/search/${searchPlate}`);
      setSearchResult(res.data);
      if (res.data.found) {
        // Log the scan
        await api.post(`/api/vehicles/scan/${searchPlate}`);
        toast.success('Kenderaan disahkan!');
        fetchData();
      }
    } catch (err) {
      setSearchResult({ found: false, message: 'Kenderaan tidak dijumpai' });
      toast.error('Kenderaan tidak berdaftar!');
    }
  };

  const handleRegister = async () => {
    if (!selectedStudent) { toast.error('Sila pilih pelajar'); return; }
    if (!registerForm.plate_number) { toast.error('Sila masukkan no. plat'); return; }
    try {
      await api.post('/api/vehicles/register', {
        ...registerForm,
        student_id: selectedStudent.id
      });
      toast.success('Kenderaan berjaya didaftarkan');
      setShowRegisterModal(false);
      setSelectedStudent(null);
      setRegisterForm({ plate_number: '', owner_name: '', relationship: 'bapa', phone: '' });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal mendaftar kenderaan');
    }
  };

  const handleDeleteVehicle = async (vehicleId) => {
    if (!window.confirm('Padam kenderaan ini?')) return;
    try {
      await api.delete(`/api/vehicles/${vehicleId}`);
      toast.success('Kenderaan dipadam');
      fetchData();
    } catch (err) {
      toast.error('Gagal memadam');
    }
  };

  const handleMatricScan = async (e) => {
    e.preventDefault();
    if (!matricScan.matric_number.trim()) {
      toast.error('Sila masukkan nombor matrik');
      return;
    }
    setMatricSubmitting(true);
    setLastMatricResult(null);
    try {
      const res = await api.post('/api/hostel/guard/scan', {
        matric_number: matricScan.matric_number.trim(),
        direction: matricScan.direction,
        reason: matricScan.reason.trim() || undefined,
      });
      setLastMatricResult(res.data);
      toast.success(res.data?.message || 'Imbasan berjaya');
      setMatricScan((prev) => ({ ...prev, matric_number: '', reason: '' }));
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Imbasan gagal');
    } finally {
      setMatricSubmitting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="guard-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 font-heading">Kawalan Kenderaan</h1>
          <p className="text-slate-600">Sistem QR Keselamatan</p>
        </div>
        <Button onClick={() => setShowRegisterModal(true)} data-testid="register-vehicle-btn">
          <Plus size={18} /> Daftar Kenderaan
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard icon={Car} label="Kenderaan Berdaftar" value={stats?.total_vehicles || 0} color="primary" />
        <StatCard icon={Check} label="Imbasan Hari Ini" value={stats?.today_scans || 0} color="success" />
        <Card className="p-4">
          <p className="text-sm text-slate-500 mb-2">Imbasan Terkini</p>
          {stats?.recent_scans?.slice(0, 2).map((s, i) => (
            <p key={i} className="text-xs text-slate-600">{s.plate_number} - {new Date(s.scan_time).toLocaleTimeString('ms-MY')}</p>
          ))}
        </Card>
      </div>

      {/* Quick Scan Section */}
      <Card className="p-6 bg-gradient-to-r from-primary-50 to-primary-100">
        <h3 className="text-lg font-semibold text-primary-800 mb-4">Imbas / Cari Kenderaan</h3>
        <div className="flex gap-3">
          <Input
            placeholder="Masukkan no. plat (cth: ABC1234)"
            value={searchPlate}
            onChange={(e) => setSearchPlate(e.target.value.toUpperCase())}
            className="flex-1 text-lg font-mono"
            data-testid="search-plate"
          />
          <Button onClick={handleSearch} size="lg" data-testid="scan-btn">
            <Eye size={20} /> Semak
          </Button>
        </div>
        {searchResult && (
          <div className={`mt-4 p-4 rounded-lg ${searchResult.found ? 'bg-green-100' : 'bg-red-100'}`}>
            {searchResult.found ? (
              <div className="flex items-center gap-4">
                <Check className="text-green-600" size={32} />
                <div>
                  <p className="font-bold text-green-800 text-lg">{searchResult.vehicle.plate_number}</p>
                  <p className="text-green-700">Pemilik: {searchResult.vehicle.owner_name} ({searchResult.vehicle.relationship})</p>
                  <p className="text-green-700">Pelajar: {searchResult.vehicle.student_name}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <AlertCircle className="text-red-600" size={32} />
                <p className="font-bold text-red-800">Kenderaan tidak berdaftar!</p>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {[
          { id: 'scan', label: 'Imbasan Terkini', icon: Clock },
          { id: 'matric', label: 'Imbasan Kad Matrik', icon: Fingerprint },
          { id: 'vehicles', label: `Kenderaan Berdaftar (${vehicles.length})`, icon: Car }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 min-h-[44px] px-4 py-2 border-b-2 transition-colors ${
              activeTab === tab.id ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Recent Scans */}
      {activeTab === 'scan' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">No. Plat</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Masa Imbasan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scans.length === 0 ? (
                  <tr><td colSpan={2} className="text-center py-8 text-slate-500">Tiada imbasan</td></tr>
                ) : scans.map(scan => (
                  <tr key={scan.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono font-bold">{scan.plate_number}</td>
                    <td className="py-3 px-4 text-sm">{new Date(scan.scan_time).toLocaleString('ms-MY')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Imbasan Kad Matrik - Keluar/Masuk Outing atau Pulang Bermalam */}
      {activeTab === 'matric' && (
        <Card>
          <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <Fingerprint size={20} /> Imbasan Kad Matrik Pelajar
          </h3>
          <p className="text-sm text-slate-600 mb-4">
            Scan kad matrik pelajar apabila keluar maktab (outing/pulang bermalam) atau masuk semula. Alasan boleh dinyatakan di bawah.
          </p>
          <form onSubmit={handleMatricScan} className="space-y-4 max-w-md">
            <Input
              label="Nombor Matrik"
              value={matricScan.matric_number}
              onChange={(e) => setMatricScan((s) => ({ ...s, matric_number: e.target.value }))}
              placeholder="cth: MRSM2024001"
              required
            />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Arah</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="direction" value="out" checked={matricScan.direction === 'out'} onChange={(e) => setMatricScan((s) => ({ ...s, direction: e.target.value }))} />
                  <LogOut size={18} /> Keluar
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="direction" value="in" checked={matricScan.direction === 'in'} onChange={(e) => setMatricScan((s) => ({ ...s, direction: e.target.value }))} />
                  <LogIn size={18} /> Masuk
                </label>
              </div>
            </div>
            <Input
              label="Alasan / Catatan (pilihan)"
              value={matricScan.reason}
              onChange={(e) => setMatricScan((s) => ({ ...s, reason: e.target.value }))}
              placeholder="Sebab keluar/masuk jika perlu"
            />
            <Button type="submit" disabled={matricSubmitting}>
              {matricSubmitting ? 'Memproses...' : 'Rekod Imbasan'}
            </Button>
          </form>
          {lastMatricResult && (
            <div className="mt-4 p-3 bg-emerald-50 rounded-lg text-sm text-emerald-800">
              {lastMatricResult.student_name && <p><strong>Pelajar:</strong> {lastMatricResult.student_name}</p>}
              {lastMatricResult.is_late_return && <p className="text-amber-700">Lewat balik.</p>}
            </div>
          )}
        </Card>
      )}

      {/* Registered Vehicles */}
      {activeTab === 'vehicles' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">No. Plat</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Pemilik</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Hubungan</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Pelajar</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">No. Telefon</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-slate-600">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vehicles.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-slate-500">Tiada kenderaan berdaftar</td></tr>
                ) : vehicles.map(v => (
                  <tr key={v.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono font-bold">{v.plate_number}</td>
                    <td className="py-3 px-4">{v.owner_name}</td>
                    <td className="py-3 px-4 capitalize">{v.relationship}</td>
                    <td className="py-3 px-4">{v.student_name}</td>
                    <td className="py-3 px-4">{v.phone}</td>
                    <td className="py-3 px-4 text-right">
                      <Button size="sm" variant="danger" onClick={() => handleDeleteVehicle(v.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Register Vehicle Slide-in Panel */}
      <AnimatePresence>
        {showRegisterModal && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="fixed inset-0 bg-black/50 z-50" 
              onClick={() => setShowRegisterModal(false)} 
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col"
            >
              {/* Panel Header */}
              <div className="p-6 border-b bg-gradient-to-r from-slate-700 to-gray-800 text-white">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Car size={24} />
                    Daftar Kenderaan Baru
                  </h3>
                  <button onClick={() => setShowRegisterModal(false)} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-white/20 rounded-lg transition">
                    <X size={24} />
                  </button>
                </div>
              </div>
              
              {/* Panel Content - Scrollable */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {/* Student Search */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cari Pelajar</label>
                  <Input
                    placeholder="Taip nama atau no. matrik..."
                    value={studentSearch}
                    onChange={(e) => { setStudentSearch(e.target.value); searchStudents(e.target.value); }}
                    data-testid="search-student-guard"
                  />
                  {students.length > 0 && (
                    <div className="mt-2 border rounded-lg max-h-40 overflow-y-auto">
                      {students.map(s => (
                        <div
                          key={s.id}
                          onClick={() => { setSelectedStudent(s); setStudents([]); setStudentSearch(s.fullName); }}
                          className="px-3 py-2 hover:bg-slate-100 cursor-pointer"
                        >
                          <p className="font-medium">{s.fullName}</p>
                          <p className="text-xs text-slate-500">{s.matric} • T{s.form} {s.kelas}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedStudent && (
                    <div className="mt-2 p-3 bg-blue-50 rounded-lg">
                      <p className="font-medium text-blue-800">{selectedStudent.fullName}</p>
                      <p className="text-sm text-blue-600">{selectedStudent.matric} • T{selectedStudent.form} {selectedStudent.kelas}</p>
                    </div>
                  )}
                </div>

                <Input
                  label="No. Plat Kenderaan *"
                  value={registerForm.plate_number}
                  onChange={(e) => setRegisterForm({ ...registerForm, plate_number: e.target.value.toUpperCase() })}
                  placeholder="cth: ABC1234"
                  className="font-mono"
                  data-testid="plate-number"
                />

                <Input
                  label="Nama Pemilik *"
                  value={registerForm.owner_name}
                  onChange={(e) => setRegisterForm({ ...registerForm, owner_name: e.target.value })}
                  placeholder="Nama penuh pemilik kenderaan"
                  data-testid="owner-name"
                />

                <Select
                  label="Hubungan dengan Pelajar"
                  value={registerForm.relationship}
                  onChange={(e) => setRegisterForm({ ...registerForm, relationship: e.target.value })}
                  data-testid="relationship"
                >
                  {RELATIONSHIP_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </Select>

                <Input
                  label="No. Telefon"
                  value={registerForm.phone}
                  onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })}
                  placeholder="cth: 0123456789"
                  data-testid="phone"
                />
              </div>

              {/* Panel Footer */}
              <div className="p-4 border-t bg-slate-50 flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowRegisterModal(false)}>Batal</Button>
                <Button className="flex-1" onClick={handleRegister} data-testid="confirm-register">
                  <Car size={16} /> Daftar Kenderaan
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default GuardDashboard;
