import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Users, Home, DoorOpen, LogOut, Check, FileText, User, X, CalendarCheck, ClipboardList, UtensilsCrossed, Building2, Pencil, Trash2, BedDouble, LayoutList
} from 'lucide-react';
import api from '../../services/api';
import { Button, Input, Select, Card, StatCard, Spinner } from '../../components/common';
import { CARA_PULANG_OPTIONS } from '../../constants/hostel';

// Hostel categories
const HOSTEL_CATEGORIES = {
  lawatan: { name: 'Lawatan', color: 'bg-blue-100 text-blue-700' },
  pulang_bermalam: { name: 'Pulang Bermalam', color: 'bg-pastel-lavender text-violet-700' },
  klinik: { name: 'Klinik/Hospital', color: 'bg-sky-100 text-sky-700' },
  aktiviti: { name: 'Aktiviti Sekolah', color: 'bg-green-100 text-green-700' },
  kem_motivasi: { name: 'Kem Motivasi', color: 'bg-teal-100 text-teal-700' },
  kecemasan: { name: 'Kecemasan', color: 'bg-red-100 text-red-700' },
  sakit: { name: 'Sakit', color: 'bg-amber-100 text-amber-700' },
  pertandingan: { name: 'Pertandingan', color: 'bg-pastel-mint text-teal-700' },
  program_rasmi: { name: 'Program Rasmi', color: 'bg-slate-100 text-slate-700' },
};

export const WardenDashboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [stats, setStats] = useState(null);
  const [students, setStudents] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [filterForm, setFilterForm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [pulangRequests, setPulangRequests] = useState([]);
  const [pulangBlockFilter, setPulangBlockFilter] = useState('');
  const [selectedPulangIds, setSelectedPulangIds] = useState(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);
  const [pulangStats, setPulangStats] = useState(null);
  const [reportDateFrom, setReportDateFrom] = useState('');
  const [reportDateTo, setReportDateTo] = useState('');
  const [presenceReport, setPresenceReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [categoryReport, setCategoryReport] = useState({ outing: [], pulang: [], leave: [], klinik: [] });
  const [categoryReportLoading, setCategoryReportLoading] = useState(false);
  const [klinikRequests, setKlinikRequests] = useState([]);
  const [showKlinikModal, setShowKlinikModal] = useState(false);
  const [showKlinikEditModal, setShowKlinikEditModal] = useState(false);
  const [selectedKlinikRecord, setSelectedKlinikRecord] = useState(null);
  const [emptyRoomsByBlock, setEmptyRoomsByBlock] = useState([]);
  const [outingRequests, setOutingRequests] = useState([]);
  const [showOutingModal, setShowOutingModal] = useState(false);
  const [outingForm, setOutingForm] = useState({
    student_id: '',
    tarikh_keluar: new Date().toISOString().slice(0, 16),
    tarikh_pulang: '',
    destinasi: '',
    sebab: '',
    pic_name: '',
    pic_phone: '',
  });
  const [outingSubmitting, setOutingSubmitting] = useState(false);
  const [approvingOutingId, setApprovingOutingId] = useState(null);
  const [rejectingOutingId, setRejectingOutingId] = useState(null);
  const [klinikForm, setKlinikForm] = useState({
    student_id: '',
    tarikh_keluar: new Date().toISOString().slice(0, 16),
    tarikh_pulang: '',
    destinasi: '',
    sebab: '',
    pic_name: '',
    pic_phone: '',
  });

  const [checkoutForm, setCheckoutForm] = useState({
    tarikh_keluar: new Date().toISOString().slice(0, 16),
    tarikh_pulang: '',
    pic_name: '',
    driver_name: '',
    vehicle_out: '',
    kategori: 'lawatan',
    remarks: ''
  });

  const fetchData = async () => {
    setLoading(true);
    const endpoints = [
      ['stats', '/api/hostel/stats'],
      ['students', '/api/hostel/students'],
      ['records', '/api/hostel/records'],
      ['pulang', '/api/hostel/pulang-bermalam/requests?status=pending'],
      ['pulangStats', '/api/hostel/pulang-bermalam/stats'],
      ['klinik', '/api/hostel/klinik/requests'],
      ['emptyRooms', '/api/hostel/empty-rooms'],
      ['outing', '/api/hostel/outing/requests?status=pending'],
    ];
    const results = await Promise.allSettled(endpoints.map(([, url]) => api.get(url)));
    const getData = (i) => (results[i].status === 'fulfilled' ? results[i].value?.data : null);

    setStats(getData(0) ?? null);
    setStudents(Array.isArray(getData(1)) ? getData(1) : []);
    setRecords(Array.isArray(getData(2)) ? getData(2) : []);
    setPulangRequests(Array.isArray(getData(3)) ? getData(3) : []);
    setPulangStats(getData(4) ?? null);
    setKlinikRequests(Array.isArray(getData(5)) ? getData(5) : []);
    setEmptyRoomsByBlock(Array.isArray(getData(6)?.blocks) ? getData(6).blocks : []);
    setOutingRequests(Array.isArray(getData(7)) ? getData(7) : []);

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) toast.error(`Gagal memuatkan sebahagian data (${failed} permintaan)`);
    setLoading(false);
  };

  const loadPresenceReport = async () => {
    setReportLoading(true);
    try {
      const params = new URLSearchParams();
      if (reportDateFrom) params.set('date_from', reportDateFrom);
      if (reportDateTo) params.set('date_to', reportDateTo);
      const res = await api.get(`/api/hostel/presence-report?${params.toString()}`);
      setPresenceReport(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal muat laporan');
      setPresenceReport(null);
    } finally {
      setReportLoading(false);
    }
  };

  const loadCategoryReport = async () => {
    setCategoryReportLoading(true);
    try {
      const [outRes, pulangRes, leaveRes, klinikRes] = await Promise.all([
        api.get('/api/hostel/outing/requests'),
        api.get('/api/hostel/pulang-bermalam/requests'),
        api.get('/api/hostel/leave/requests'),
        api.get('/api/hostel/klinik/requests'),
      ]);
      setCategoryReport({
        outing: Array.isArray(outRes.data) ? outRes.data : [],
        pulang: Array.isArray(pulangRes.data) ? pulangRes.data : [],
        leave: Array.isArray(leaveRes.data) ? leaveRes.data : [],
        klinik: Array.isArray(klinikRes.data) ? klinikRes.data : [],
      });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal muat laporan ikut kategori');
      setCategoryReport({ outing: [], pulang: [], leave: [], klinik: [] });
    } finally {
      setCategoryReportLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    if (activeTab === 'category') loadCategoryReport();
  }, [activeTab]);

  useEffect(() => {
    const tab = searchParams.get('tab');
    const studentId = searchParams.get('student_id');
    if (tab === 'klinik' && studentId) {
      setActiveTab('klinik');
      setKlinikForm(prev => ({ ...prev, student_id: studentId }));
      setShowKlinikModal(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleCheckout = async () => {
    if (!selectedStudent) return;
    try {
      await api.post('/api/hostel/checkout', {
        student_id: selectedStudent.id,
        ...checkoutForm
      });
      toast.success('Rekod keluar berjaya disimpan');
      setShowCheckoutModal(false);
      setSelectedStudent(null);
      setCheckoutForm({
        tarikh_keluar: new Date().toISOString().slice(0, 16),
        tarikh_pulang: '',
        pic_name: '',
        driver_name: '',
        vehicle_out: '',
        kategori: 'lawatan',
        remarks: ''
      });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan rekod');
    }
  };

  const handleCheckin = async () => {
    if (!selectedRecord) return;
    try {
      await api.post(`/api/hostel/checkin/${selectedRecord.id}`);
      toast.success('Rekod masuk berjaya dikemaskini');
      setShowCheckinModal(false);
      setSelectedRecord(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal mengemaskini rekod');
    }
  };

  const filteredStudents = students.filter(s => {
    if (filterForm && s.form !== parseInt(filterForm)) return false;
    if (filterStatus && s.hostel_status !== filterStatus) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return s.fullName?.toLowerCase().includes(query) || s.matric?.toLowerCase().includes(query);
    }
    return true;
  });

  const outStudents = records.filter(r => r.check_type === 'keluar' && !r.actual_return);

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="warden-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 font-heading">e-Hostel Management</h1>
          <p className="text-slate-600">Blok: {stats?.block || 'Semua Blok'}</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={Users} label="Jumlah Pelajar" value={stats?.total_students || 0} color="primary" />
        <StatCard icon={Home} label="Dalam Asrama" value={stats?.in_hostel || 0} color="success" />
        <StatCard icon={DoorOpen} label="Sedang Keluar" value={stats?.out_count || 0} color="warning" />
        <StatCard icon={LogOut} label="Keluar Hari Ini" value={stats?.today_checkouts || 0} color="secondary" />
        <StatCard icon={Check} label="Masuk Hari Ini" value={stats?.today_checkins || 0} color="success" />
      </div>

      {/* Bilik/Katil Kosong ikut Blok - memudahkan tetapan penginapan pelajar baru */}
      <Card className="border-l-4 border-l-emerald-500 bg-gradient-to-r from-emerald-50/80 to-teal-50/80">
        <div className="flex items-center gap-2 mb-3">
          <BedDouble className="text-emerald-600" size={22} />
          <div>
            <h3 className="font-semibold text-slate-800">Bilik/Katil Kosong ikut Blok</h3>
            <p className="text-sm text-slate-600">Bilik/Katil yang ada slot kosong — senang rujuk bila tetapkan penginapan pelajar baru</p>
          </div>
        </div>
        {emptyRoomsByBlock.length === 0 ? (
          <p className="text-slate-500 text-sm py-2">Tiada bilik/katil dengan slot kosong setakat ini, atau data belum dimuatkan.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {emptyRoomsByBlock.map((b) => (
              <div
                key={b.block}
                className="rounded-xl border-2 border-emerald-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500 text-white flex items-center justify-center font-bold text-lg">
                    {b.block || '–'}
                  </div>
                  <div>
                    <span className="font-bold text-slate-900">Blok {b.block}</span>
                    <p className="text-xs text-slate-500">
                      {b.total_empty_rooms} bilik · {b.total_empty_beds} katil kosong
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {b.empty_rooms.map((r) => (
                    <span
                      key={`${b.block}-${r.room}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-800 font-medium text-sm border border-emerald-200"
                      title={`Bilik/Katil ${r.room}: ${r.occupants}/${r.capacity} (${r.empty_beds} katil kosong)`}
                    >
                      Bilik/Katil {r.room}
                      <span className="text-emerald-600">({r.empty_beds})</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Status Kelulusan Pulang Bermalam */}
      {pulangStats && (
        <Card className="border-l-4 border-l-violet-500">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CalendarCheck className="text-violet-600" size={24} />
              <div>
                <h3 className="font-semibold text-slate-800">Kelulusan Pulang Bermalam</h3>
                <p className="text-sm text-slate-500">
                  Menunggu: {pulangStats.pending} · Diluluskan: {pulangStats.approved} · Ditolak: {pulangStats.rejected}
                </p>
              </div>
            </div>
            {pulangStats.kelulusan_selesai ? (
              <span className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-800 rounded-lg font-medium text-sm">
                <Check size={18} /> Kelulusan telah dilakukan
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-800 rounded-lg font-medium text-sm">
                {pulangStats.pending} permohonan menunggu kelulusan
              </span>
            )}
          </div>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {[
          { id: 'overview', label: 'Pelajar', icon: Users },
          { id: 'out', label: `Sedang Keluar (${outStudents.length})`, icon: DoorOpen },
          { id: 'pulang', label: `Permohonan Pulang Bermalam (${pulangRequests.length})`, icon: CalendarCheck },
          { id: 'outing', label: `Permohonan Outing (${outingRequests.length})`, icon: LogOut },
          { id: 'klinik', label: `Klinik/Hospital (${klinikRequests.length})`, icon: Building2 },
          { id: 'report', label: 'Laporan Keberadaan', icon: ClipboardList },
          { id: 'category', label: 'Laporan ikut Kategori', icon: LayoutList },
          { id: 'records', label: 'Rekod', icon: FileText }
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

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <Input
              placeholder="Cari nama atau matrik..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64"
              data-testid="search-student"
            />
            <Select value={filterForm} onChange={(e) => setFilterForm(e.target.value)} data-testid="filter-form">
              <option value="">Semua Tingkatan</option>
              {[1, 2, 3, 4, 5].map(f => <option key={f} value={f}>Tingkatan {f}</option>)}
            </Select>
            <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} data-testid="filter-status">
              <option value="">Semua Status</option>
              <option value="dalam_asrama">Dalam Asrama</option>
              <option value="keluar">Sedang Keluar</option>
            </Select>
          </div>

          {/* Students Table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Matrik</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Nama</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Tingkatan</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Kelas</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Blok</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Status</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-slate-600">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-8 text-slate-500">Tiada pelajar dijumpai</td></tr>
                  ) : (
                    filteredStudents.map(student => (
                      <tr key={student.id} className="hover:bg-slate-50" data-testid={`student-row-${student.matric}`}>
                        <td className="py-3 px-4 font-mono text-sm">{student.matric}</td>
                        <td className="py-3 px-4 font-medium">{student.fullName}</td>
                        <td className="py-3 px-4">T{student.form}</td>
                        <td className="py-3 px-4">{student.kelas}</td>
                        <td className="py-3 px-4">{student.block}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                            student.hostel_status === 'dalam_asrama' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {student.hostel_status === 'dalam_asrama' ? <Home size={12} /> : <DoorOpen size={12} />}
                            {student.hostel_status === 'dalam_asrama' ? 'Dalam Asrama' : 'Keluar'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {student.hostel_status === 'dalam_asrama' ? (
                            <Button
                              size="sm"
                              onClick={() => { setSelectedStudent(student); setShowCheckoutModal(true); }}
                              data-testid={`checkout-btn-${student.matric}`}
                            >
                              <DoorOpen size={14} /> Rekod Keluar
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="success"
                              onClick={() => {
                                const record = records.find(r => r.student_id === student.id && r.check_type === 'keluar' && !r.actual_return);
                                if (record) { setSelectedRecord(record); setShowCheckinModal(true); }
                              }}
                              data-testid={`checkin-btn-${student.matric}`}
                            >
                              <Check size={14} /> Rekod Masuk
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'pulang' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-800">Permohonan Pulang Bermalam</h3>
          <p className="text-sm text-slate-500">Lulus satu-satu atau pilih semua pelajar mengikut blok (WAJIB Pulang).</p>
          {(() => {
            const blocks = [...new Set(pulangRequests.map(r => r.student_block).filter(Boolean))].sort();
            const filtered = pulangBlockFilter
              ? pulangRequests.filter(r => r.student_block === pulangBlockFilter)
              : pulangRequests;
            const pendingInFilter = filtered;
            const allInFilterSelected = pendingInFilter.length > 0 && pendingInFilter.every(r => selectedPulangIds.has(r.id));
            return (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  {blocks.length > 1 && (
                    <Select
                      value={pulangBlockFilter}
                      onChange={(e) => {
                        setPulangBlockFilter(e.target.value);
                        setSelectedPulangIds(new Set());
                      }}
                      className="min-w-[140px]"
                    >
                      <option value="">Semua Blok</option>
                      {blocks.map(b => <option key={b} value={b}>{b}</option>)}
                    </Select>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={allInFilterSelected}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedPulangIds(new Set(pendingInFilter.map(r => r.id)));
                        } else {
                          setSelectedPulangIds(new Set());
                        }
                      }}
                      className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm font-medium text-slate-700">Pilih semua (WAJIB Pulang)</span>
                  </label>
                  {selectedPulangIds.size > 0 && (
                    <Button
                      size="sm"
                      onClick={async () => {
                        setBulkApproving(true);
                        try {
                          const res = await api.post('/api/hostel/pulang-bermalam/bulk-approve', {
                            request_ids: Array.from(selectedPulangIds)
                          });
                          toast.success(res.data?.message || `${res.data?.approved_count ?? 0} permohonan diluluskan`);
                          setSelectedPulangIds(new Set());
                          fetchData();
                        } catch (err) {
                          toast.error(err.response?.data?.detail || 'Gagal meluluskan');
                        } finally {
                          setBulkApproving(false);
                        }
                      }}
                      disabled={bulkApproving}
                    >
                      {bulkApproving ? <Spinner size="sm" /> : <Check size={16} />}
                      Lulus yang dipilih ({selectedPulangIds.size})
                    </Button>
                  )}
                </div>
                {pendingInFilter.length === 0 ? (
                  <Card><p className="text-center py-8 text-slate-500">Tiada permohonan pulang bermalam menunggu kelulusan</p></Card>
                ) : (
                  <div className="grid gap-3">
                    {pendingInFilter.map(r => (
                      <Card key={r.id} className="flex items-center justify-between gap-4 flex-wrap p-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={selectedPulangIds.has(r.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedPulangIds(s => new Set([...s, r.id]));
                              } else {
                                setSelectedPulangIds(s => { const n = new Set(s); n.delete(r.id); return n; });
                              }
                            }}
                            className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                          />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800">{r.student_name}</p>
                            <p className="text-sm text-slate-500">
                              {r.student_block && `${r.student_block} · `}{r.student_room && `Bilik/Katil ${r.student_room} · `}
                              {new Date(r.tarikh_keluar).toLocaleString('ms-MY')} – {new Date(r.tarikh_pulang).toLocaleString('ms-MY')}
                            </p>
                            {(r.pic_name || r.cara_pulang) && (
                              <p className="text-xs text-slate-500 mt-0.5">
                                {r.cara_pulang && `Cara: ${CARA_PULANG_OPTIONS.find((o) => o.value === r.cara_pulang)?.label || r.cara_pulang}. `}
                                Person In Charge: {r.pic_name || '–'}
                                {r.plate_number && ` · Plat: ${r.plate_number}`}
                                {r.transport_remarks && ` · ${r.transport_remarks}`}
                              </p>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="success"
                          onClick={async () => {
                            try {
                              await api.post(`/api/hostel/pulang-bermalam/${r.id}/approve`);
                              toast.success('Permohonan diluluskan');
                              fetchData();
                              setSelectedPulangIds(s => { const n = new Set(s); n.delete(r.id); return n; });
                            } catch (err) {
                              toast.error(err.response?.data?.detail || 'Gagal meluluskan');
                            }
                          }}
                        >
                          <Check size={14} /> Lulus
                        </Button>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {activeTab === 'outing' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-800">Permohonan Outing</h3>
          <p className="text-sm text-slate-500">Lulus atau tolak permohonan outing pelajar; atau mohon outing bagi pihak pelajar.</p>
          <Button onClick={() => { setOutingForm({ student_id: '', tarikh_keluar: new Date().toISOString().slice(0, 16), tarikh_pulang: '', destinasi: '', sebab: '', pic_name: '', pic_phone: '' }); setShowOutingModal(true); }}>
            <LogOut size={18} /> Mohon Outing bagi Pelajar
          </Button>
          {outingRequests.length === 0 ? (
            <Card><p className="text-center py-8 text-slate-500">Tiada permohonan outing menunggu kelulusan</p></Card>
          ) : (
            <div className="grid gap-3">
              {outingRequests.map((r) => (
                <Card key={r.id} className="flex items-center justify-between gap-4 flex-wrap p-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800">{r.student_name}</p>
                    <p className="text-sm text-slate-500">
                      {r.tarikh_keluar && new Date(r.tarikh_keluar).toLocaleString('ms-MY')} – {r.tarikh_pulang && new Date(r.tarikh_pulang).toLocaleString('ms-MY')}
                    </p>
                    {(r.pic_name || r.destinasi || r.sebab) && (
                      <p className="text-xs text-slate-500 mt-0.5">Person In Charge: {r.pic_name || '–'}{r.destinasi ? ` · ${r.destinasi}` : ''}{r.sebab ? ` · ${r.sebab}` : ''}</p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="success"
                      disabled={approvingOutingId === r.id}
                      onClick={async () => {
                        setApprovingOutingId(r.id);
                        try {
                          await api.post(`/api/hostel/outing/${r.id}/approve`);
                          toast.success('Permohonan diluluskan');
                          fetchData();
                        } catch (err) {
                          toast.error(err.response?.data?.detail || 'Gagal meluluskan');
                        } finally {
                          setApprovingOutingId(null);
                        }
                      }}
                    >
                      {approvingOutingId === r.id ? <Spinner size="sm" /> : <Check size={14} />} Lulus
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      disabled={rejectingOutingId === r.id}
                      onClick={async () => {
                        const reason = window.prompt('Sebab tolak (pilihan):');
                        setRejectingOutingId(r.id);
                        try {
                          await api.post(`/api/hostel/outing/${r.id}/reject`, null, { params: { reason: reason || '' } });
                          toast.success('Permohonan ditolak');
                          fetchData();
                        } catch (err) {
                          toast.error(err.response?.data?.detail || 'Gagal menolak');
                        } finally {
                          setRejectingOutingId(null);
                        }
                      }}
                    >
                      {rejectingOutingId === r.id ? <Spinner size="sm" /> : 'Tolak'}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'klinik' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-800">Kebenaran Ke Klinik/Hospital</h3>
          <p className="text-sm text-slate-500">Warden boleh memohon kebenaran e-hostel ke klinik atau hospital bagi pihak pelajar. Permohonan diluluskan secara automatik dan disegerakkan dengan modul asrama.</p>
          <Button onClick={() => { setKlinikForm({ student_id: '', tarikh_keluar: new Date().toISOString().slice(0, 16), tarikh_pulang: '', destinasi: '', sebab: '', pic_name: '', pic_phone: '' }); setShowKlinikModal(true); }}>
            <Building2 size={18} /> Mohon Kebenaran Ke Klinik/Hospital
          </Button>
          {klinikRequests.length === 0 ? (
            <Card><p className="text-center py-8 text-slate-500">Tiada permohonan klinik/hospital</p></Card>
          ) : (
            <div className="grid gap-3">
              {klinikRequests.map((r) => (
                <Card key={r.id} className="flex items-center justify-between gap-4 flex-wrap p-4">
                  <div>
                    <p className="font-semibold text-slate-800">{r.student_name}</p>
                    <p className="text-sm text-slate-500">{r.student_block && `${r.student_block} · `}{r.student_room && `Bilik/Katil ${r.student_room} · `}{r.destinasi}</p>
                    <p className="text-sm text-slate-600">{new Date(r.tarikh_keluar).toLocaleString('ms-MY')} – {new Date(r.tarikh_pulang).toLocaleString('ms-MY')}</p>
                    {r.pic_name && <p className="text-xs text-slate-500">Person In Charge: {r.pic_name}{r.pic_phone ? ` · ${r.pic_phone}` : ''}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setSelectedKlinikRecord(r); setKlinikForm({ student_id: r.student_id, tarikh_keluar: r.tarikh_keluar?.slice(0, 16) || '', tarikh_pulang: r.tarikh_pulang?.slice(0, 16) || '', destinasi: r.destinasi || '', sebab: r.sebab || '', pic_name: r.pic_name || '', pic_phone: r.pic_phone || '' }); setShowKlinikEditModal(true); }}
                    >
                      <Pencil size={14} /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      onClick={async () => {
                        if (!window.confirm('Padam permohonan ini?')) return;
                        try {
                          await api.delete(`/api/hostel/klinik/${r.id}`);
                          toast.success('Permohonan telah dipadam');
                          fetchData();
                        } catch (err) {
                          toast.error(err.response?.data?.detail || 'Gagal padam');
                        }
                      }}
                    >
                      <Trash2 size={14} /> Padam
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'report' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-800">Laporan Keberadaan Pelajar</h3>
          <p className="text-sm text-slate-500">Laporan lengkap untuk dewan makan: senarai pelajar yang pulang bermalam dan yang berada di maktab (tidak pulang).</p>
          <Card className="p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Tarikh mula</label>
                <input
                  type="date"
                  value={reportDateFrom}
                  onChange={(e) => setReportDateFrom(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Tarikh akhir</label>
                <input
                  type="date"
                  value={reportDateTo}
                  onChange={(e) => setReportDateTo(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
              <Button onClick={loadPresenceReport} disabled={reportLoading}>
                {reportLoading ? <Spinner size="sm" /> : <ClipboardList size={16} />}
                Muat Laporan
              </Button>
            </div>
            <p className="text-xs text-slate-400 mt-2">Kosongkan tarikh untuk guna hujung minggu ini (Jumaat–Ahad).</p>
          </Card>

          {presenceReport && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <Card className="p-4 bg-slate-50">
                  <p className="text-sm text-slate-500">Tempoh</p>
                  <p className="font-semibold text-slate-800">{presenceReport.date_from} – {presenceReport.date_to}</p>
                  <p className="text-xs text-slate-500 mt-1">Blok: {presenceReport.block || '–'}</p>
                </Card>
                <Card className="p-4 bg-pastel-lavender">
                  <p className="text-sm text-slate-600">Pulang bermalam</p>
                  <p className="text-2xl font-bold text-violet-700">{presenceReport.summary?.total_pulang ?? 0}</p>
                </Card>
                <Card className="p-4 bg-emerald-50">
                  <p className="text-sm text-slate-600 flex items-center gap-1"><UtensilsCrossed size={14} /> Berada di maktab (Dewan Makan)</p>
                  <p className="text-2xl font-bold text-emerald-700">{presenceReport.summary?.total_di_maktab ?? 0}</p>
                </Card>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                    <DoorOpen size={18} /> Pelajar pulang bermalam ({presenceReport.pelajar_pulang_bermalam?.length ?? 0})
                  </h4>
                  <div className="max-h-80 overflow-y-auto">
                    {(!presenceReport.pelajar_pulang_bermalam || presenceReport.pelajar_pulang_bermalam.length === 0) ? (
                      <p className="text-slate-500 text-sm py-4">Tiada rekod</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-slate-50">
                          <tr>
                            <th className="text-left py-2 px-2">Bil</th>
                            <th className="text-left py-2 px-2">Nama</th>
                            <th className="text-left py-2 px-2">Matrik</th>
                            <th className="text-left py-2 px-2">Bilik/Katil</th>
                          </tr>
                        </thead>
                        <tbody>
                          {presenceReport.pelajar_pulang_bermalam.map((p, i) => (
                            <tr key={p.student_id} className="border-t border-slate-100">
                              <td className="py-2 px-2 text-slate-500">{i + 1}</td>
                              <td className="py-2 px-2 font-medium">{p.student_name}</td>
                              <td className="py-2 px-2">{p.student_matric}</td>
                              <td className="py-2 px-2">{p.student_room || '–'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </Card>

                <Card>
                  <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                    <UtensilsCrossed size={18} /> Senarai dewan makan – pelajar yang tidak pulang ({presenceReport.pelajar_berada_di_maktab?.length ?? 0})
                  </h4>
                  <div className="max-h-80 overflow-y-auto">
                    {(!presenceReport.pelajar_berada_di_maktab || presenceReport.pelajar_berada_di_maktab.length === 0) ? (
                      <p className="text-slate-500 text-sm py-4">Tiada rekod</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-slate-50">
                          <tr>
                            <th className="text-left py-2 px-2">Bil</th>
                            <th className="text-left py-2">Nama</th>
                            <th className="text-left py-2 px-2">Matrik</th>
                            <th className="text-left py-2 px-2">Ting.</th>
                            <th className="text-left py-2 px-2">Bilik/Katil</th>
                          </tr>
                        </thead>
                        <tbody>
                          {presenceReport.pelajar_berada_di_maktab.map((s, i) => (
                            <tr key={s.student_id} className="border-t border-slate-100">
                              <td className="py-2 px-2 text-slate-500">{i + 1}</td>
                              <td className="py-2 px-2 font-medium">{s.name}</td>
                              <td className="py-2 px-2">{s.matric}</td>
                              <td className="py-2 px-2">{s.form}</td>
                              <td className="py-2 px-2">{s.room || '–'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </Card>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'category' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800">Laporan Keluar Asrama ikut Kategori</h3>
            <Button onClick={loadCategoryReport} disabled={categoryReportLoading} size="sm">
              {categoryReportLoading ? <Spinner size="sm" /> : <LayoutList size={16} />}
              {categoryReportLoading ? 'Memuatkan...' : 'Muat Semula'}
            </Button>
          </div>
          {categoryReportLoading && categoryReport.outing.length === 0 && categoryReport.pulang.length === 0 && categoryReport.leave.length === 0 && categoryReport.klinik.length === 0 ? (
            <Card><div className="flex items-center justify-center py-12"><Spinner size="lg" /></div></Card>
          ) : (
            <>
              <Card>
                <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                  <LogOut size={18} className="text-violet-600" /> Outing ({categoryReport.outing.length})
                </h4>
                <div className="max-h-64 overflow-y-auto">
                  {categoryReport.outing.length === 0 ? (
                    <p className="text-slate-500 text-sm py-2">Tiada rekod</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-50">
                        <tr>
                          <th className="text-left py-2 px-2">Pelajar</th>
                          <th className="text-left py-2 px-2">Tarikh Keluar – Pulang</th>
                          <th className="text-left py-2 px-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categoryReport.outing.map((r) => (
                          <tr key={r.id} className="border-t border-slate-100">
                            <td className="py-2 px-2 font-medium">{r.student_name}</td>
                            <td className="py-2 px-2">{r.tarikh_keluar && new Date(r.tarikh_keluar).toLocaleString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} – {r.tarikh_pulang && new Date(r.tarikh_pulang).toLocaleString('ms-MY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                            <td className="py-2 px-2">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : r.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                                {r.status === 'approved' ? 'Lulus' : r.status === 'rejected' ? 'Ditolak' : 'Menunggu'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </Card>
              <Card>
                <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                  <Home size={18} className="text-fuchsia-600" /> Pulang Bermalam ({categoryReport.pulang.length})
                </h4>
                <div className="max-h-64 overflow-y-auto">
                  {categoryReport.pulang.length === 0 ? (
                    <p className="text-slate-500 text-sm py-2">Tiada rekod</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-50">
                        <tr>
                          <th className="text-left py-2 px-2">Pelajar</th>
                          <th className="text-left py-2 px-2">Tarikh Keluar – Pulang</th>
                          <th className="text-left py-2 px-2">Cara Pulang</th>
                          <th className="text-left py-2 px-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categoryReport.pulang.map((r) => (
                          <tr key={r.id} className="border-t border-slate-100">
                            <td className="py-2 px-2 font-medium">{r.student_name}</td>
                            <td className="py-2 px-2">{r.tarikh_keluar && new Date(r.tarikh_keluar).toLocaleString('ms-MY', { day: '2-digit', month: 'short' })} – {r.tarikh_pulang && new Date(r.tarikh_pulang).toLocaleString('ms-MY', { day: '2-digit', month: 'short' })}</td>
                            <td className="py-2 px-2 text-slate-600">{CARA_PULANG_OPTIONS.find((o) => o.value === r.cara_pulang)?.label || r.cara_pulang || '–'}</td>
                            <td className="py-2 px-2">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : r.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                                {r.status === 'approved' ? 'Lulus' : r.status === 'rejected' ? 'Ditolak' : 'Menunggu'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </Card>
              <Card>
                <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                  <FileText size={18} className="text-amber-600" /> Keluar Aktiviti Rasmi Maktab ({categoryReport.leave.length})
                </h4>
                <div className="max-h-64 overflow-y-auto">
                  {categoryReport.leave.length === 0 ? (
                    <p className="text-slate-500 text-sm py-2">Tiada rekod</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-50">
                        <tr>
                          <th className="text-left py-2 px-2">Pelajar</th>
                          <th className="text-left py-2 px-2">Kategori</th>
                          <th className="text-left py-2 px-2">Tarikh Keluar – Pulang</th>
                          <th className="text-left py-2 px-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categoryReport.leave.map((r) => (
                          <tr key={r.id} className="border-t border-slate-100">
                            <td className="py-2 px-2 font-medium">{r.student_name}</td>
                            <td className="py-2 px-2"><span className={`px-2 py-0.5 rounded text-xs ${HOSTEL_CATEGORIES[r.kategori]?.color || 'bg-slate-100 text-slate-600'}`}>{HOSTEL_CATEGORIES[r.kategori]?.name || r.kategori || '–'}</span></td>
                            <td className="py-2 px-2">{r.tarikh_keluar && new Date(r.tarikh_keluar).toLocaleString('ms-MY', { day: '2-digit', month: 'short' })} – {r.tarikh_pulang && new Date(r.tarikh_pulang).toLocaleString('ms-MY', { day: '2-digit', month: 'short' })}</td>
                            <td className="py-2 px-2">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : r.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                                {r.status === 'approved' ? 'Lulus' : r.status === 'rejected' ? 'Ditolak' : 'Menunggu'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </Card>
              <Card>
                <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                  <Building2 size={18} className="text-sky-600" /> Klinik/Hospital ({categoryReport.klinik.length})
                </h4>
                <div className="max-h-64 overflow-y-auto">
                  {categoryReport.klinik.length === 0 ? (
                    <p className="text-slate-500 text-sm py-2">Tiada rekod</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-50">
                        <tr>
                          <th className="text-left py-2 px-2">Pelajar</th>
                          <th className="text-left py-2 px-2">Tarikh Keluar – Pulang</th>
                          <th className="text-left py-2 px-2">Destinasi / Sebab</th>
                          <th className="text-left py-2 px-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categoryReport.klinik.map((r) => (
                          <tr key={r.id} className="border-t border-slate-100">
                            <td className="py-2 px-2 font-medium">{r.student_name}</td>
                            <td className="py-2 px-2">{r.tarikh_keluar && new Date(r.tarikh_keluar).toLocaleString('ms-MY', { day: '2-digit', month: 'short' })} – {r.tarikh_pulang && new Date(r.tarikh_pulang).toLocaleString('ms-MY', { day: '2-digit', month: 'short' })}</td>
                            <td className="py-2 px-2 text-slate-600">{[r.destinasi, r.sebab].filter(Boolean).join(' · ') || '–'}</td>
                            <td className="py-2 px-2">
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">Auto-lulus</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {activeTab === 'out' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-800">Pelajar Sedang Keluar ({outStudents.length})</h3>
          {outStudents.length === 0 ? (
            <Card><p className="text-center py-8 text-slate-500">Tiada pelajar yang sedang keluar</p></Card>
          ) : (
            <div className="grid gap-4">
              {outStudents.map(record => (
                <Card key={record.id} className="hover:shadow-md transition-shadow" data-testid={`out-record-${record.id}`}>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <User className="text-slate-400" size={20} />
                        <div>
                          <p className="font-semibold text-slate-800">{record.student_name}</p>
                          <p className="text-sm text-slate-500">
                            Keluar: {new Date(record.tarikh_keluar).toLocaleString('ms-MY')}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${HOSTEL_CATEGORIES[record.kategori]?.color || 'bg-slate-100 text-slate-600'}`}>
                          {HOSTEL_CATEGORIES[record.kategori]?.name || record.kategori}
                        </span>
                        {record.pic_name && <span className="text-xs text-slate-500">Person In Charge: {record.pic_name}</span>}
                        {record.tarikh_pulang && (
                          <span className="text-xs text-slate-500">
                            Jangka Pulang: {new Date(record.tarikh_pulang).toLocaleString('ms-MY')}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="success"
                      onClick={() => { setSelectedRecord(record); setShowCheckinModal(true); }}
                      data-testid={`checkin-record-${record.id}`}
                    >
                      <Check size={16} /> Rekod Masuk
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'records' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-800">Rekod Keluar/Masuk Terkini</h3>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Pelajar</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Kategori</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Tarikh Keluar</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Tarikh Pulang</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Person In Charge</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.slice(0, 50).map(record => (
                    <tr key={record.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-medium">{record.student_name}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${HOSTEL_CATEGORIES[record.kategori]?.color || 'bg-slate-100 text-slate-600'}`}>
                          {HOSTEL_CATEGORIES[record.kategori]?.name || record.kategori}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm">{new Date(record.tarikh_keluar).toLocaleString('ms-MY')}</td>
                      <td className="py-3 px-4 text-sm">
                        {record.actual_return ? new Date(record.actual_return).toLocaleString('ms-MY') : '-'}
                      </td>
                      <td className="py-3 px-4 text-sm">{record.pic_name || '-'}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          record.actual_return ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {record.actual_return ? 'Sudah Pulang' : 'Belum Pulang'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Checkout Slide-in Panel */}
      <AnimatePresence>
        {showCheckoutModal && (
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
              className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col"
            >
              {/* Panel Header */}
              <div className="p-6 border-b bg-gradient-to-r from-teal-500 to-violet-500 text-white">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <DoorOpen size={24} />
                    Rekod Keluar Asrama
                  </h3>
                  <button onClick={() => setShowCheckoutModal(false)} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-white/20 rounded-lg transition">
                    <X size={24} />
                  </button>
                </div>
                {selectedStudent && (
                  <div className="bg-white/10 rounded-xl p-3">
                    <p className="font-semibold">{selectedStudent.fullName}</p>
                    <p className="text-sm text-white/80">{selectedStudent.matric} • T{selectedStudent.form} {selectedStudent.kelas}</p>
                  </div>
                )}
              </div>
              
              {/* Panel Content - Scrollable */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Tarikh & Masa Keluar"
                    type="datetime-local"
                    value={checkoutForm.tarikh_keluar}
                    onChange={(e) => setCheckoutForm({ ...checkoutForm, tarikh_keluar: e.target.value })}
                    required
                    data-testid="checkout-datetime"
                  />
                  <Input
                    label="Jangka Tarikh Pulang"
                    type="datetime-local"
                    value={checkoutForm.tarikh_pulang}
                    onChange={(e) => setCheckoutForm({ ...checkoutForm, tarikh_pulang: e.target.value })}
                    data-testid="return-datetime"
                  />
                </div>

                <Select
                  label="Kategori Keluar"
                  value={checkoutForm.kategori}
                  onChange={(e) => setCheckoutForm({ ...checkoutForm, kategori: e.target.value })}
                  required
                  data-testid="checkout-kategori"
                >
                  {Object.entries(HOSTEL_CATEGORIES).map(([key, val]) => (
                    <option key={key} value={key}>{val.name}</option>
                  ))}
                </Select>

                <Input
                  label="Nama Person In Charge / Penjaga"
                  value={checkoutForm.pic_name}
                  onChange={(e) => setCheckoutForm({ ...checkoutForm, pic_name: e.target.value })}
                  placeholder="Nama ibu bapa / penjaga"
                  data-testid="pic-name"
                />

                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Nama Pemandu"
                    value={checkoutForm.driver_name}
                    onChange={(e) => setCheckoutForm({ ...checkoutForm, driver_name: e.target.value })}
                    placeholder="Nama pemandu"
                    data-testid="driver-name"
                  />
                  <Input
                    label="No. Kenderaan"
                    value={checkoutForm.vehicle_out}
                    onChange={(e) => setCheckoutForm({ ...checkoutForm, vehicle_out: e.target.value })}
                    placeholder="cth: ABC 1234"
                    data-testid="vehicle-out"
                  />
                </div>

                <Input
                  label="Catatan"
                  value={checkoutForm.remarks}
                  onChange={(e) => setCheckoutForm({ ...checkoutForm, remarks: e.target.value })}
                  placeholder="Catatan tambahan (pilihan)"
                  data-testid="checkout-remarks"
                />
              </div>

              {/* Panel Footer */}
              <div className="p-4 border-t bg-slate-50 flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowCheckoutModal(false)}>Batal</Button>
                <Button className="flex-1" onClick={handleCheckout} data-testid="confirm-checkout">
                  <DoorOpen size={16} /> Simpan Rekod Keluar
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Checkin Slide-in Panel */}
      <AnimatePresence>
        {showCheckinModal && selectedRecord && (
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
              className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col"
            >
              {/* Panel Header */}
              <div className="p-6 border-b bg-gradient-to-r from-green-500 to-emerald-600 text-white">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Check size={24} />
                    Rekod Masuk Asrama
                  </h3>
                  <button onClick={() => setShowCheckinModal(false)} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-white/20 rounded-lg transition">
                    <X size={24} />
                  </button>
                </div>
                <div className="bg-white/10 rounded-xl p-3">
                  <p className="font-semibold">{selectedRecord.student_name}</p>
                  <p className="text-sm text-white/80">
                    Keluar: {new Date(selectedRecord.tarikh_keluar).toLocaleString('ms-MY')}
                  </p>
                </div>
              </div>
              
              {/* Panel Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-sm text-slate-500">
                    Kategori: {HOSTEL_CATEGORIES[selectedRecord.kategori]?.name || selectedRecord.kategori}
                  </p>
                </div>
                
                <p className="text-slate-600">Sahkan pelajar ini telah kembali ke asrama?</p>
              </div>

              {/* Panel Footer */}
              <div className="p-4 border-t bg-slate-50 flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowCheckinModal(false)}>Batal</Button>
                <Button variant="primary" className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600" onClick={handleCheckin} data-testid="confirm-checkin">
                  <Check size={16} /> Sahkan Masuk
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Mohon Outing bagi Pelajar */}
      <AnimatePresence>
        {showOutingModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50" onClick={() => setShowOutingModal(false)} />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col">
              <div className="p-6 border-b bg-gradient-to-r from-amber-500 to-orange-600 text-white">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold flex items-center gap-2"><LogOut size={24} /> Mohon Outing bagi Pelajar</h3>
                  <button onClick={() => setShowOutingModal(false)} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-white/20 rounded-lg transition"><X size={24} /></button>
                </div>
              </div>
              <form
                className="flex-1 overflow-y-auto p-6 space-y-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!outingForm.student_id || !outingForm.tarikh_keluar || !outingForm.tarikh_pulang || !outingForm.pic_name?.trim()) {
                    toast.error('Sila isi pelajar, tarikh keluar, tarikh pulang dan nama Person In Charge.');
                    return;
                  }
                  setOutingSubmitting(true);
                  try {
                    await api.post('/api/hostel/outing/request-by-warden', {
                      student_id: outingForm.student_id,
                      tarikh_keluar: outingForm.tarikh_keluar,
                      tarikh_pulang: outingForm.tarikh_pulang,
                      sebab: outingForm.sebab || 'Outing',
                      destinasi: outingForm.destinasi || undefined,
                      pic_name: outingForm.pic_name.trim(),
                      pic_phone: outingForm.pic_phone || undefined,
                    });
                    toast.success('Permohonan outing berjaya dihantar');
                    setShowOutingModal(false);
                    setOutingForm({ student_id: '', tarikh_keluar: new Date().toISOString().slice(0, 16), tarikh_pulang: '', destinasi: '', sebab: '', pic_name: '', pic_phone: '' });
                    fetchData();
                  } catch (err) {
                    toast.error(err.response?.data?.detail || 'Gagal menghantar permohonan');
                  } finally {
                    setOutingSubmitting(false);
                  }
                }}
              >
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Pelajar *</label>
                  <select
                    value={outingForm.student_id}
                    onChange={(e) => setOutingForm((f) => ({ ...f, student_id: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500"
                    required
                  >
                    <option value="">Pilih pelajar...</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>{s.fullName} • {s.matric} • T{s.form}</option>
                    ))}
                  </select>
                </div>
                <Input label="Tarikh & Masa Keluar *" type="datetime-local" value={outingForm.tarikh_keluar} onChange={(e) => setOutingForm((f) => ({ ...f, tarikh_keluar: e.target.value }))} required />
                <Input label="Tarikh & Masa Pulang *" type="datetime-local" value={outingForm.tarikh_pulang} onChange={(e) => setOutingForm((f) => ({ ...f, tarikh_pulang: e.target.value }))} required />
                <Input label="Destinasi (pilihan)" value={outingForm.destinasi} onChange={(e) => setOutingForm((f) => ({ ...f, destinasi: e.target.value }))} placeholder="Contoh: Bandar" />
                <Input label="Sebab / Tujuan" value={outingForm.sebab} onChange={(e) => setOutingForm((f) => ({ ...f, sebab: e.target.value }))} placeholder="Contoh: Urusan keluarga" />
                <Input label="Nama Person In Charge (Penjaga) *" value={outingForm.pic_name} onChange={(e) => setOutingForm((f) => ({ ...f, pic_name: e.target.value }))} placeholder="Nama penjaga yang mengambil" required />
                <Input label="No. Telefon Person In Charge" type="tel" value={outingForm.pic_phone} onChange={(e) => setOutingForm((f) => ({ ...f, pic_phone: e.target.value }))} placeholder="01xxxxxxxx" />
                <div className="p-4 border-t bg-slate-50 flex gap-3 -mx-6 -mb-6 mt-6">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setShowOutingModal(false)}>Batal</Button>
                  <Button type="submit" className="flex-1" disabled={outingSubmitting}>{outingSubmitting ? <Spinner size="sm" /> : 'Hantar Permohonan'}</Button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Klinik/Hospital – Tambah */}
      <AnimatePresence>
        {showKlinikModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50" onClick={() => setShowKlinikModal(false)} />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col">
              <div className="p-6 border-b bg-gradient-to-r from-sky-500 to-blue-600 text-white">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold flex items-center gap-2"><Building2 size={24} /> Mohon Kebenaran Ke Klinik/Hospital</h3>
                  <button onClick={() => setShowKlinikModal(false)} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-white/20 rounded-lg transition"><X size={24} /></button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Pelajar *</label>
                  <select
                    value={klinikForm.student_id}
                    onChange={(e) => setKlinikForm((f) => ({ ...f, student_id: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500"
                    required
                  >
                    <option value="">Pilih pelajar...</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>{s.fullName} • {s.matric} • T{s.form}</option>
                    ))}
                  </select>
                </div>
                <Input label="Tarikh & Masa Keluar" type="datetime-local" value={klinikForm.tarikh_keluar} onChange={(e) => setKlinikForm((f) => ({ ...f, tarikh_keluar: e.target.value }))} required />
                <Input label="Tarikh & Masa Pulang" type="datetime-local" value={klinikForm.tarikh_pulang} onChange={(e) => setKlinikForm((f) => ({ ...f, tarikh_pulang: e.target.value }))} required />
                <Input label="Destinasi (Klinik/Hospital) *" value={klinikForm.destinasi} onChange={(e) => setKlinikForm((f) => ({ ...f, destinasi: e.target.value }))} placeholder="Contoh: Klinik Kesihatan, Hospital Sultanah Aminah" required />
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Sebab / Simptom *</label>
                  <textarea value={klinikForm.sebab} onChange={(e) => setKlinikForm((f) => ({ ...f, sebab: e.target.value }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl" rows={2} required placeholder="Contoh: Demam, perlu rawatan" />
                </div>
                <Input label="Nama Pengiring (Person In Charge)" value={klinikForm.pic_name} onChange={(e) => setKlinikForm((f) => ({ ...f, pic_name: e.target.value }))} placeholder="Pilihan" />
                <Input label="No. Telefon Pengiring" type="tel" value={klinikForm.pic_phone} onChange={(e) => setKlinikForm((f) => ({ ...f, pic_phone: e.target.value }))} placeholder="01xxxxxxxx" />
              </div>
              <div className="p-4 border-t bg-slate-50 flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowKlinikModal(false)}>Batal</Button>
                <Button className="flex-1" onClick={async () => {
                  if (!klinikForm.student_id || !klinikForm.tarikh_keluar || !klinikForm.tarikh_pulang || !klinikForm.destinasi || !klinikForm.sebab.trim()) { toast.error('Isi pelajar, tarikh, destinasi dan sebab'); return; }
                  try {
                    await api.post('/api/hostel/klinik/request', klinikForm);
                    toast.success('Kebenaran ke klinik/hospital diluluskan');
                    setShowKlinikModal(false);
                    fetchData();
                  } catch (err) {
                    toast.error(err.response?.data?.detail || 'Gagal menghantar');
                  }
                }}><Building2 size={16} /> Hantar (Auto Lulus)</Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Klinik/Hospital – Edit */}
      <AnimatePresence>
        {showKlinikEditModal && selectedKlinikRecord && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50" onClick={() => setShowKlinikEditModal(false)} />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col">
              <div className="p-6 border-b bg-gradient-to-r from-amber-500 to-orange-600 text-white">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold flex items-center gap-2"><Pencil size={24} /> Edit Permohonan Klinik/Hospital</h3>
                  <button onClick={() => setShowKlinikEditModal(false)} className="p-2 hover:bg-white/20 rounded-lg transition"><X size={24} /></button>
                </div>
                <div className="bg-white/10 rounded-xl p-3 mt-3">
                  <p className="font-semibold">{selectedKlinikRecord.student_name}</p>
                  <p className="text-sm text-white/80">{selectedKlinikRecord.student_matric}</p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <Input label="Tarikh & Masa Keluar" type="datetime-local" value={klinikForm.tarikh_keluar} onChange={(e) => setKlinikForm((f) => ({ ...f, tarikh_keluar: e.target.value }))} required />
                <Input label="Tarikh & Masa Pulang" type="datetime-local" value={klinikForm.tarikh_pulang} onChange={(e) => setKlinikForm((f) => ({ ...f, tarikh_pulang: e.target.value }))} required />
                <Input label="Destinasi (Klinik/Hospital) *" value={klinikForm.destinasi} onChange={(e) => setKlinikForm((f) => ({ ...f, destinasi: e.target.value }))} required />
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Sebab / Simptom *</label>
                  <textarea value={klinikForm.sebab} onChange={(e) => setKlinikForm((f) => ({ ...f, sebab: e.target.value }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl" rows={2} required />
                </div>
                <Input label="Nama Pengiring (Person In Charge)" value={klinikForm.pic_name} onChange={(e) => setKlinikForm((f) => ({ ...f, pic_name: e.target.value }))} />
                <Input label="No. Telefon Pengiring" type="tel" value={klinikForm.pic_phone} onChange={(e) => setKlinikForm((f) => ({ ...f, pic_phone: e.target.value }))} />
              </div>
              <div className="p-4 border-t bg-slate-50 flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowKlinikEditModal(false)}>Batal</Button>
                <Button className="flex-1" onClick={async () => {
                  try {
                    await api.put(`/api/hostel/klinik/${selectedKlinikRecord.id}`, {
                      tarikh_keluar: klinikForm.tarikh_keluar,
                      tarikh_pulang: klinikForm.tarikh_pulang,
                      destinasi: klinikForm.destinasi,
                      sebab: klinikForm.sebab,
                      pic_name: klinikForm.pic_name || undefined,
                      pic_phone: klinikForm.pic_phone || undefined,
                    });
                    toast.success('Permohonan dikemaskini');
                    setShowKlinikEditModal(false);
                    setSelectedKlinikRecord(null);
                    fetchData();
                  } catch (err) {
                    toast.error(err.response?.data?.detail || 'Gagal mengemaskini');
                  }
                }}><Pencil size={16} /> Simpan</Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WardenDashboard;
