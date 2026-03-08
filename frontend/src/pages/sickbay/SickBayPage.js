import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Activity, Users, Check, FileText, Plus, X, Building2
} from 'lucide-react';
import api from '../../services/api';
import { Button, Input, Select, Card, StatCard, Spinner } from '../../components/common';

// Sick Bay constants
const SYMPTOMS_OPTIONS = [
  'Demam', 'Batuk', 'Selsema', 'Sakit Kepala', 'Sakit Perut', 'Muntah', 'Cirit-birit', 
  'Pening', 'Sakit Tekak', 'Alahan Kulit', 'Kecederaan', 'Lain-lain'
];

const TREATMENT_OPTIONS = [
  'Paracetamol', 'Antibiotik', 'Ubat Batuk', 'ORS', 'Antiseptik', 'Plaster/Bandage',
  'Minyak Angin', 'Rehat', 'Rujuk Klinik', 'Lain-lain'
];

export const SickBayPage = () => {
  const [stats, setStats] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('current');
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [students, setStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);

  const [checkinForm, setCheckinForm] = useState({
    check_in_time: new Date().toISOString().slice(0, 16),
    symptoms: '',
    initial_treatment: '',
    follow_up: ''
  });

  const fetchData = async () => {
    try {
      const [statsRes, recordsRes] = await Promise.all([
        api.get('/api/sickbay/stats'),
        api.get('/api/sickbay/records')
      ]);
      setStats(statsRes.data);
      setRecords(recordsRes.data);
    } catch (err) {
      toast.error('Gagal memuatkan data');
    } finally {
      setLoading(false);
    }
  };

  const searchStudents = async (query) => {
    if (query.length < 2) { setStudents([]); return; }
    try {
      const res = await api.get(`/api/sickbay/students?search=${query}`);
      setStudents(res.data);
    } catch { setStudents([]); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleCheckin = async () => {
    if (!selectedStudent) { toast.error('Sila pilih pelajar'); return; }
    if (!checkinForm.symptoms) { toast.error('Sila masukkan simptom'); return; }
    try {
      await api.post('/api/sickbay/checkin', {
        student_id: selectedStudent.id,
        ...checkinForm
      });
      toast.success('Pelajar didaftarkan ke bilik sakit');
      setShowCheckinModal(false);
      setSelectedStudent(null);
      setCheckinForm({ check_in_time: new Date().toISOString().slice(0, 16), symptoms: '', initial_treatment: '', follow_up: '' });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan rekod');
    }
  };

  const handleCheckout = async () => {
    if (!selectedRecord) return;
    try {
      await api.post(`/api/sickbay/checkout/${selectedRecord.id}`);
      toast.success('Pelajar keluar dari bilik sakit');
      setShowCheckoutModal(false);
      setSelectedRecord(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal mengemaskini rekod');
    }
  };

  const currentPatients = records.filter(r => !r.check_out_time);
  const historyRecords = records.filter(r => r.check_out_time);

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="sickbay-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 font-heading">Bilik Sakit</h1>
          <p className="text-slate-600">Pengurusan kesihatan pelajar</p>
        </div>
        <Button onClick={() => setShowCheckinModal(true)} data-testid="add-patient-btn">
          <Plus size={18} /> Daftar Pesakit
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Activity} label="Dalam Bilik Sakit" value={stats?.in_sickbay || 0} color="danger" />
        <StatCard icon={Users} label="Lawatan Hari Ini" value={stats?.today_visits || 0} color="primary" />
        <StatCard icon={Check} label="Keluar Hari Ini" value={stats?.today_discharges || 0} color="success" />
        <Card className="p-4">
          <p className="text-sm text-slate-500 mb-2">Simptom Kerap</p>
          <div className="flex flex-wrap gap-1">
            {stats?.common_symptoms?.slice(0, 3).map((s, i) => (
              <span key={i} className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">{s.symptom}</span>
            ))}
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {[
          { id: 'current', label: `Dalam Rawatan (${currentPatients.length})`, icon: Activity },
          { id: 'history', label: 'Sejarah', icon: FileText }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
              activeTab === tab.id ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Current Patients */}
      {activeTab === 'current' && (
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-100 border border-slate-200 px-4 py-3 text-sm text-slate-700">
            <strong>Log keluar bilik sakit:</strong> Setiap pelajar yang masuk mesti direkod keluar. Klik butang <strong>Log Keluar</strong> pada kad pelajar di bawah apabila pelajar dibenarkan keluar dari bilik sakit.
          </div>
          {currentPatients.length === 0 ? (
            <Card><p className="text-center py-8 text-slate-500">Tiada pesakit dalam bilik sakit</p></Card>
          ) : (
            <div className="grid gap-4">
              {currentPatients.map(record => (
                <Card key={record.id} className="hover:shadow-md transition-shadow" data-testid={`patient-${record.id}`}>
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                          <Activity className="text-red-600" size={20} />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{record.student_name}</p>
                          <p className="text-sm text-slate-500">{record.student_matric} • T{record.student_form} {record.student_kelas}</p>
                        </div>
                      </div>
                      <div className="pl-13 space-y-1">
                        <p className="text-sm"><span className="text-slate-500">Masuk:</span> {new Date(record.check_in_time).toLocaleString('ms-MY')}</p>
                        <p className="text-sm"><span className="text-slate-500">Simptom:</span> <span className="font-medium text-red-600">{record.symptoms}</span></p>
                        <p className="text-sm"><span className="text-slate-500">Rawatan:</span> {record.initial_treatment || '-'}</p>
                        {record.follow_up && <p className="text-sm"><span className="text-slate-500">Tindakan susulan:</span> {record.follow_up}</p>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      <Link
                        to={`/warden/hostel?tab=klinik&student_id=${record.student_id || ''}`}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 text-sm font-medium transition"
                        title="Mohon kebenaran e-hostel ke klinik/hospital bagi pelajar ini"
                      >
                        <Building2 size={16} /> Permohonan Hostel → Klinik/Hospital
                      </Link>
                      <Button
                        variant="success"
                        onClick={() => { setSelectedRecord(record); setShowCheckoutModal(true); }}
                        data-testid={`checkout-${record.id}`}
                        title="Rekod keluar pelajar dari bilik sakit"
                      >
                        <Check size={16} /> Log Keluar
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* History */}
      {activeTab === 'history' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Pelajar</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Simptom</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Rawatan</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Masuk</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Keluar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historyRecords.slice(0, 50).map(record => (
                  <tr key={record.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <p className="font-medium">{record.student_name}</p>
                      <p className="text-xs text-slate-500">{record.student_matric}</p>
                    </td>
                    <td className="py-3 px-4 text-sm">{record.symptoms}</td>
                    <td className="py-3 px-4 text-sm">{record.initial_treatment || '-'}</td>
                    <td className="py-3 px-4 text-sm">{new Date(record.check_in_time).toLocaleString('ms-MY')}</td>
                    <td className="py-3 px-4 text-sm">{new Date(record.check_out_time).toLocaleString('ms-MY')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Checkin Slide-in Panel */}
      <AnimatePresence>
        {showCheckinModal && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="fixed inset-0 bg-black/50 z-50" 
              onClick={() => setShowCheckinModal(false)} 
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col overflow-x-hidden"
            >
              {/* Panel Header */}
              <div className="p-6 border-b bg-gradient-to-r from-red-500 to-pink-600 text-white">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Activity size={24} />
                    Daftar Pesakit Baru
                  </h3>
                  <button onClick={() => setShowCheckinModal(false)} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-white/20 rounded-lg transition" aria-label="Tutup">
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
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); searchStudents(e.target.value); }}
                    data-testid="search-student-sickbay"
                  />
                  {students.length > 0 && (
                    <div className="mt-2 border rounded-lg max-h-40 overflow-y-auto">
                      {students.map(s => (
                        <div
                          key={s.id}
                          onClick={() => { setSelectedStudent(s); setStudents([]); setSearchQuery(s.fullName); }}
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
                  label="Masa Masuk"
                  type="datetime-local"
                  value={checkinForm.check_in_time}
                  onChange={(e) => setCheckinForm({ ...checkinForm, check_in_time: e.target.value })}
                  data-testid="checkin-time"
                />

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Simptom *</label>
                  <Select
                    value={checkinForm.symptoms}
                    onChange={(e) => setCheckinForm({ ...checkinForm, symptoms: e.target.value })}
                    data-testid="symptoms-select"
                  >
                    <option value="">Pilih simptom...</option>
                    {SYMPTOMS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Rawatan Awal</label>
                  <Select
                    value={checkinForm.initial_treatment}
                    onChange={(e) => setCheckinForm({ ...checkinForm, initial_treatment: e.target.value })}
                    data-testid="treatment-select"
                  >
                    <option value="">Pilih rawatan...</option>
                    {TREATMENT_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </Select>
                </div>

                <Input
                  label="Tindakan Susulan"
                  value={checkinForm.follow_up}
                  onChange={(e) => setCheckinForm({ ...checkinForm, follow_up: e.target.value })}
                  placeholder="cth: Rujuk klinik jika tidak baik dalam 24 jam"
                  data-testid="follow-up"
                />
              </div>

              {/* Panel Footer */}
              <div className="p-4 border-t bg-slate-50 flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowCheckinModal(false)}>Batal</Button>
                <Button className="flex-1" onClick={handleCheckin} data-testid="confirm-checkin-sickbay">
                  <Activity size={16} /> Daftar Pesakit
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Checkout Slide-in Panel */}
      <AnimatePresence>
        {showCheckoutModal && selectedRecord && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="fixed inset-0 bg-black/50 z-50" 
              onClick={() => setShowCheckoutModal(false)} 
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col overflow-x-hidden"
            >
              {/* Panel Header */}
              <div className="p-6 border-b bg-gradient-to-r from-green-500 to-emerald-600 text-white">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Check size={24} />
                    Log Keluar – Bilik Sakit
                  </h3>
                  <button onClick={() => setShowCheckoutModal(false)} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-white/20 rounded-lg transition" aria-label="Tutup">
                    <X size={24} />
                  </button>
                </div>
                <div className="bg-white/10 rounded-xl p-3">
                  <p className="font-semibold">{selectedRecord.student_name}</p>
                  <p className="text-sm text-white/80">Simptom: {selectedRecord.symptoms}</p>
                </div>
              </div>
              
              {/* Panel Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-sm text-slate-600">Rawatan: {selectedRecord.initial_treatment}</p>
                </div>
                <p className="text-slate-600">Sahkan pelajar ini dibenarkan keluar dari bilik sakit. Rekod keluar akan disimpan.</p>
              </div>

              {/* Panel Footer */}
              <div className="p-4 border-t bg-slate-50 flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowCheckoutModal(false)}>Batal</Button>
                <Button variant="primary" className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600" onClick={handleCheckout} data-testid="confirm-checkout-sickbay">
                  <Check size={16} /> Sahkan Log Keluar
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SickBayPage;
