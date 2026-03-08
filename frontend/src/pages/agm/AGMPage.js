import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar, Users, MapPin, Clock, Plus, Search, Filter, Eye, Edit, Trash2,
  FileText, QrCode, UserCheck, AlertTriangle, CheckCircle, XCircle,
  ChevronRight, BarChart3, Download, Camera, Globe, Video, Building,
  Upload, X, Save, RefreshCw, SwitchCamera
} from 'lucide-react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { API_URL } from '../../services/api';

const MALAYSIA_STATES = [
  'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang',
  'Perak', 'Perlis', 'Pulau Pinang', 'Sabah', 'Sarawak', 'Selangor',
  'Terengganu', 'Wilayah Persekutuan Kuala Lumpur', 'Wilayah Persekutuan Labuan',
  'Wilayah Persekutuan Putrajaya'
];

const JENIS_MESYUARAT = ['AGM Tahunan', 'EGM', 'Mesyuarat Khas'];
const MOD_MESYUARAT = ['Fizikal', 'Online', 'Hybrid'];
const STATUS_EVENT = ['Draf', 'Aktif', 'Selesai', 'Ditangguhkan'];
const KATEGORI_PESERTA = ['Ahli', 'AJK', 'Pemerhati', 'Jemputan'];
const JENIS_AGENDA = ['Laporan', 'Perbincangan', 'Pengesahan', 'Makluman'];
const JENIS_DOKUMEN = ['Notis Mesyuarat', 'Agenda Rasmi', 'Minit Mesyuarat Lepas', 'Laporan Kewangan', 'Laporan Tahunan', 'Kertas Kerja', 'Slide Pembentangan'];

const AGMPage = () => {
  const [activeTab, setActiveTab] = useState('events');
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showAttendeeModal, setShowAttendeeModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showAgendaModal, setShowAgendaModal] = useState(false);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [attendees, setAttendees] = useState([]);
  const [agendas, setAgendas] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [scanResult, setScanResult] = useState(null);
  const [manualQR, setManualQR] = useState('');
  const [feeCheckResult, setFeeCheckResult] = useState(null);
  const [checkingFee, setCheckingFee] = useState(false);
  const [cameraActive, setCameraActive] = useState(true);
  const [scannerError, setScannerError] = useState(null);
  const [isScanning, setIsScanning] = useState(false);

  // Form states
  const [eventForm, setEventForm] = useState({
    nama_event: '',
    jenis_mesyuarat: 'AGM Tahunan',
    tahun_kewangan: new Date().getFullYear().toString(),
    tarikh_mesyuarat: '',
    hari: '',
    masa_mula: '',
    masa_tamat: '',
    status: 'Draf',
    mod_mesyuarat: 'Fizikal',
    nama_tempat: '',
    alamat_penuh: '',
    pic_lokasi: '',
    platform_mesyuarat: '',
    link_mesyuarat: '',
    host_mesyuarat: '',
    quorum_minimum: 50,
    kaedah_kehadiran: 'QR Code'
  });

  const [attendeeForm, setAttendeeForm] = useState({
    nama_penuh: '',
    no_ic: '',
    email: '',
    no_telefon: '',
    jantina: 'Lelaki',
    negeri: 'Selangor',
    kategori_peserta: 'Ahli',
    status_yuran: 'Belum Bayar',
    anak_belum_bayar: []
  });

  const [agendaForm, setAgendaForm] = useState({
    no_agenda: 1,
    tajuk_agenda: '',
    penerangan: '',
    pembentang: '',
    masa_diperuntukkan: '',
    jenis_agenda: 'Laporan'
  });

  const [documentForm, setDocumentForm] = useState({
    nama_dokumen: '',
    jenis_dokumen: 'Notis Mesyuarat',
    file_url: '',
    versi: '1.0',
    dimuat_naik_oleh: '',
    akses_pengguna: 'Ahli'
  });

  useEffect(() => {
    fetchEvents();
  }, []);

  useEffect(() => {
    if (selectedEvent) {
      fetchAttendees(selectedEvent.id);
      fetchAgendas(selectedEvent.id);
      fetchDocuments(selectedEvent.id);
      fetchReport(selectedEvent.id);
    }
  }, [selectedEvent]);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/agm/events`);
      const data = await res.json();
      setEvents(data.events || []);
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAttendees = async (eventId) => {
    try {
      const res = await fetch(`${API_URL}/api/agm/attendees/${eventId}`);
      const data = await res.json();
      setAttendees(data.attendees || []);
    } catch (error) {
      console.error('Error fetching attendees:', error);
    }
  };

  const fetchAgendas = async (eventId) => {
    try {
      const res = await fetch(`${API_URL}/api/agm/agendas/${eventId}`);
      const data = await res.json();
      setAgendas(data.agendas || []);
    } catch (error) {
      console.error('Error fetching agendas:', error);
    }
  };

  const fetchDocuments = async (eventId) => {
    try {
      const res = await fetch(`${API_URL}/api/agm/documents/${eventId}`);
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
    }
  };

  const fetchReport = async (eventId) => {
    try {
      const res = await fetch(`${API_URL}/api/agm/reports/${eventId}`);
      const data = await res.json();
      setReport(data.report || null);
    } catch (error) {
      console.error('Error fetching report:', error);
    }
  };

  const handleCreateEvent = async () => {
    try {
      const res = await fetch(`${API_URL}/api/agm/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventForm)
      });
      if (res.ok) {
        setShowEventModal(false);
        fetchEvents();
        resetEventForm();
      }
    } catch (error) {
      console.error('Error creating event:', error);
    }
  };

  const handleUpdateEvent = async () => {
    try {
      const res = await fetch(`${API_URL}/api/agm/events/${selectedEvent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventForm)
      });
      if (res.ok) {
        setShowEventModal(false);
        fetchEvents();
        setSelectedEvent(null);
      }
    } catch (error) {
      console.error('Error updating event:', error);
    }
  };

  const handleDeleteEvent = async (eventId) => {
    if (!window.confirm('Adakah anda pasti mahu memadam event ini?')) return;
    try {
      const res = await fetch(`${API_URL}/api/agm/events/${eventId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchEvents();
        if (selectedEvent?.id === eventId) setSelectedEvent(null);
      }
    } catch (error) {
      console.error('Error deleting event:', error);
    }
  };

  const handleCheckFeeByIC = async () => {
    if (!attendeeForm.no_ic.trim()) return;
    setCheckingFee(true);
    setFeeCheckResult(null);
    try {
      const res = await fetch(`${API_URL}/api/agm/attendees/check-fee/${encodeURIComponent(attendeeForm.no_ic)}`);
      const data = await res.json();
      setFeeCheckResult(data);
      
      // Auto-fill name and email if found
      if (data.found) {
        setAttendeeForm(prev => ({
          ...prev,
          nama_penuh: data.user_name || prev.nama_penuh,
          email: data.user_email || prev.email,
          status_yuran: data.fee_status?.all_paid ? 'Sudah Bayar' : 'Belum Bayar',
          anak_belum_bayar: data.fee_status?.anak_belum_bayar || []
        }));
      }
    } catch (error) {
      console.error('Error checking fee:', error);
      setFeeCheckResult({ error: 'Gagal menyemak yuran' });
    } finally {
      setCheckingFee(false);
    }
  };

  const handleRegisterAttendee = async () => {
    try {
      const res = await fetch(`${API_URL}/api/agm/attendees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...attendeeForm, event_id: selectedEvent.id })
      });
      if (res.ok) {
        setShowAttendeeModal(false);
        fetchAttendees(selectedEvent.id);
        fetchReport(selectedEvent.id);
        resetAttendeeForm();
      }
    } catch (error) {
      console.error('Error registering attendee:', error);
    }
  };

  const handleScanQR = async (qrValue = null) => {
    const codeToScan = qrValue || manualQR.trim();
    if (!codeToScan) return;
    
    setIsScanning(true);
    try {
      let endpoint;
      
      // Check QR code format
      if (codeToScan.startsWith('MRSMKU-USER-')) {
        // New user permanent QR code format
        endpoint = `${API_URL}/api/agm/user/scan-attendance?qr_code=${encodeURIComponent(codeToScan)}&event_id=${selectedEvent.id}`;
      } else {
        // Legacy AGM attendee QR code format
        endpoint = `${API_URL}/api/agm/attendees/scan?qr_code=${encodeURIComponent(codeToScan)}`;
      }
      
      const res = await fetch(endpoint, {
        method: 'POST'
      });
      const data = await res.json();
      setScanResult(data);
      
      // Pause camera after successful scan
      if (res.ok) {
        setCameraActive(false);
        fetchAttendees(selectedEvent.id);
        fetchReport(selectedEvent.id);
      }
    } catch (error) {
      console.error('Error scanning QR:', error);
      setScanResult({ error: 'QR Code tidak sah atau ralat rangkaian' });
    } finally {
      setIsScanning(false);
    }
  };

  // Handle camera QR scan
  const handleCameraScan = (detectedCodes) => {
    if (detectedCodes && detectedCodes.length > 0 && !isScanning) {
      const qrValue = detectedCodes[0].rawValue;
      if (qrValue) {
        setManualQR(qrValue);
        handleScanQR(qrValue);
      }
    }
  };

  // Handle scanner error
  const handleScannerError = (error) => {
    console.error('Scanner error:', error);
    setScannerError('Tidak dapat mengakses kamera. Sila berikan kebenaran kamera atau gunakan input manual.');
  };

  // Reset scanner state
  const resetScanner = () => {
    setScanResult(null);
    setManualQR('');
    setScannerError(null);
    setCameraActive(true);
  };

  // Close scanner modal
  const closeScannerModal = () => {
    setShowScannerModal(false);
    resetScanner();
  };

  const handleCreateAgenda = async () => {
    try {
      const res = await fetch(`${API_URL}/api/agm/agendas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...agendaForm, event_id: selectedEvent.id })
      });
      if (res.ok) {
        setShowAgendaModal(false);
        fetchAgendas(selectedEvent.id);
        resetAgendaForm();
      }
    } catch (error) {
      console.error('Error creating agenda:', error);
    }
  };

  const handleDeleteAgenda = async (agendaId) => {
    if (!window.confirm('Padam agenda ini?')) return;
    try {
      const res = await fetch(`${API_URL}/api/agm/agendas/${agendaId}`, { method: 'DELETE' });
      if (res.ok) fetchAgendas(selectedEvent.id);
    } catch (error) {
      console.error('Error deleting agenda:', error);
    }
  };

  const handleCreateDocument = async () => {
    try {
      const res = await fetch(`${API_URL}/api/agm/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...documentForm, event_id: selectedEvent.id })
      });
      if (res.ok) {
        setShowDocumentModal(false);
        fetchDocuments(selectedEvent.id);
        resetDocumentForm();
      }
    } catch (error) {
      console.error('Error creating document:', error);
    }
  };

  const handleDeleteDocument = async (docId) => {
    if (!window.confirm('Padam dokumen ini?')) return;
    try {
      const res = await fetch(`${API_URL}/api/agm/documents/${docId}`, { method: 'DELETE' });
      if (res.ok) fetchDocuments(selectedEvent.id);
    } catch (error) {
      console.error('Error deleting document:', error);
    }
  };

  const resetEventForm = () => {
    setEventForm({
      nama_event: '', jenis_mesyuarat: 'AGM Tahunan', tahun_kewangan: new Date().getFullYear().toString(),
      tarikh_mesyuarat: '', hari: '', masa_mula: '', masa_tamat: '', status: 'Draf',
      mod_mesyuarat: 'Fizikal', nama_tempat: '', alamat_penuh: '', pic_lokasi: '',
      platform_mesyuarat: '', link_mesyuarat: '', host_mesyuarat: '', quorum_minimum: 50, kaedah_kehadiran: 'QR Code'
    });
  };

  const resetAttendeeForm = () => {
    setAttendeeForm({
      nama_penuh: '', no_ic: '', email: '', no_telefon: '', jantina: 'Lelaki',
      negeri: 'Selangor', kategori_peserta: 'Ahli', status_yuran: 'Belum Bayar', anak_belum_bayar: []
    });
  };

  const resetAgendaForm = () => {
    setAgendaForm({
      no_agenda: agendas.length + 1, tajuk_agenda: '', penerangan: '',
      pembentang: '', masa_diperuntukkan: '', jenis_agenda: 'Laporan'
    });
  };

  const resetDocumentForm = () => {
    setDocumentForm({
      nama_dokumen: '', jenis_dokumen: 'Notis Mesyuarat', file_url: '',
      versi: '1.0', dimuat_naik_oleh: '', akses_pengguna: 'Ahli'
    });
  };

  const openEditEvent = (event) => {
    setEventForm(event);
    setSelectedEvent(event);
    setShowEventModal(true);
  };

  const filteredEvents = events.filter(e => {
    const matchSearch = e.nama_event?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = filterStatus === 'all' || e.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'Aktif': return 'bg-green-100 text-green-700';
      case 'Draf': return 'bg-yellow-100 text-yellow-700';
      case 'Selesai': return 'bg-blue-100 text-blue-700';
      case 'Ditangguhkan': return 'bg-red-100 text-red-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getModIcon = (mod) => {
    switch (mod) {
      case 'Online': return <Video size={16} className="text-blue-500" />;
      case 'Hybrid': return <Globe size={16} className="text-violet-500" />;
      default: return <Building size={16} className="text-green-500" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-pastel-lavender/30 p-6 min-w-0 overflow-x-hidden" data-testid="agm-page">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900" data-testid="agm-title">Pengurusan Mesyuarat Agung (AGM)</h1>
        <p className="text-slate-600 mt-1">Urus event AGM, kehadiran, agenda dan dokumen</p>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Panel - Event List */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-2xl shadow-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-900">Senarai Event</h2>
              <button
                onClick={() => { resetEventForm(); setSelectedEvent(null); setShowEventModal(true); }}
                className="p-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                data-testid="create-event-btn"
              >
                <Plus size={18} />
              </button>
            </div>

            {/* Search & Filter */}
            <div className="space-y-2 mb-4">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari event..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                  data-testid="search-event-input"
                />
              </div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                data-testid="filter-status-select"
              >
                <option value="all">Semua Status</option>
                {STATUS_EVENT.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Event List */}
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {loading ? (
                <div className="text-center py-8 text-slate-500">Memuatkan...</div>
              ) : filteredEvents.length === 0 ? (
                <div className="text-center py-8 text-slate-500">Tiada event dijumpai</div>
              ) : (
                filteredEvents.map(event => (
                  <motion.div
                    key={event.id}
                    whileHover={{ scale: 1.02 }}
                    onClick={() => setSelectedEvent(event)}
                    className={`p-3 rounded-xl cursor-pointer transition-all ${
                      selectedEvent?.id === event.id 
                        ? 'bg-pastel-mint border-2 border-teal-500' 
                        : 'bg-slate-50 hover:bg-slate-100 border-2 border-transparent'
                    }`}
                    data-testid={`event-item-${event.id}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-slate-900 truncate text-sm">{event.nama_event}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          {getModIcon(event.mod_mesyuarat)}
                          <span className="text-xs text-slate-500">{event.tarikh_mesyuarat}</span>
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(event.status)}`}>
                        {event.status}
                      </span>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Event Details */}
        <div className="lg:col-span-3">
          {selectedEvent ? (
            <div className="space-y-6">
              {/* Event Header */}
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-2xl font-bold text-slate-900">{selectedEvent.nama_event}</h2>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(selectedEvent.status)}`}>
                        {selectedEvent.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-slate-600">
                      <div className="flex items-center gap-2">
                        <Calendar size={16} />
                        <span>{selectedEvent.tarikh_mesyuarat} ({selectedEvent.hari})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock size={16} />
                        <span>{selectedEvent.masa_mula} - {selectedEvent.masa_tamat}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {getModIcon(selectedEvent.mod_mesyuarat)}
                        <span>{selectedEvent.mod_mesyuarat}</span>
                      </div>
                    </div>
                    {selectedEvent.mod_mesyuarat === 'Fizikal' || selectedEvent.mod_mesyuarat === 'Hybrid' ? (
                      <div className="flex items-center gap-2 mt-2 text-slate-600">
                        <MapPin size={16} />
                        <span>{selectedEvent.nama_tempat}, {selectedEvent.alamat_penuh}</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEditEvent(selectedEvent)}
                      className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                      data-testid="edit-event-btn"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => handleDeleteEvent(selectedEvent.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      data-testid="delete-event-btn"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="bg-white rounded-2xl shadow-lg">
                <div className="flex border-b border-slate-200">
                  {[
                    { id: 'kehadiran', label: 'Kehadiran', icon: UserCheck },
                    { id: 'agenda', label: 'Agenda', icon: FileText },
                    { id: 'dokumen', label: 'Dokumen', icon: Upload },
                    { id: 'laporan', label: 'Laporan', icon: BarChart3 }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors ${
                        activeTab === tab.id
                          ? 'text-teal-600 border-b-2 border-teal-600'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                      data-testid={`tab-${tab.id}`}
                    >
                      <tab.icon size={18} />
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="p-6">
                  {/* Kehadiran Tab */}
                  {activeTab === 'kehadiran' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-slate-900">Senarai Peserta</h3>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowScannerModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                            data-testid="scan-qr-btn"
                          >
                            <QrCode size={18} />
                            Imbas QR
                          </button>
                          <button
                            onClick={() => { resetAttendeeForm(); setShowAttendeeModal(true); }}
                            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
                            data-testid="add-attendee-btn"
                          >
                            <Plus size={18} />
                            Daftar Peserta
                          </button>
                        </div>
                      </div>

                      {/* Quick Stats */}
                      <div className="grid grid-cols-4 gap-4">
                        <div className="bg-blue-50 rounded-xl p-4 text-center">
                          <div className="text-2xl font-bold text-blue-600">{attendees.length}</div>
                          <div className="text-sm text-blue-700">Didaftarkan</div>
                        </div>
                        <div className="bg-green-50 rounded-xl p-4 text-center">
                          <div className="text-2xl font-bold text-green-600">
                            {attendees.filter(a => a.status_kehadiran === 'Hadir').length}
                          </div>
                          <div className="text-sm text-green-700">Hadir</div>
                        </div>
                        <div className="bg-red-50 rounded-xl p-4 text-center">
                          <div className="text-2xl font-bold text-red-600">
                            {attendees.filter(a => a.status_kehadiran === 'Tidak Hadir').length}
                          </div>
                          <div className="text-sm text-red-700">Tidak Hadir</div>
                        </div>
                        <div className="bg-yellow-50 rounded-xl p-4 text-center">
                          <div className="text-2xl font-bold text-yellow-600">
                            {attendees.filter(a => a.status_yuran === 'Belum Bayar').length}
                          </div>
                          <div className="text-sm text-yellow-700">Belum Bayar Yuran</div>
                        </div>
                      </div>

                      {/* Attendees Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full" data-testid="attendees-table">
                          <thead>
                            <tr className="bg-slate-50">
                              <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Nama</th>
                              <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">No IC</th>
                              <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Negeri</th>
                              <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Jantina</th>
                              <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Kategori</th>
                              <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Kehadiran</th>
                              <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Yuran</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {attendees.map(att => (
                              <tr key={att.id} className="hover:bg-slate-50">
                                <td className="px-4 py-3 text-sm text-slate-900">{att.nama_penuh}</td>
                                <td className="px-4 py-3 text-sm text-slate-600">{att.no_ic}</td>
                                <td className="px-4 py-3 text-sm text-slate-600">{att.negeri}</td>
                                <td className="px-4 py-3 text-sm text-slate-600">{att.jantina}</td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-1 rounded-full text-xs ${
                                    att.kategori_peserta === 'Pemerhati' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                                  }`}>
                                    {att.kategori_peserta}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-1 rounded-full text-xs ${
                                    att.status_kehadiran === 'Hadir' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                  }`}>
                                    {att.status_kehadiran}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-1 rounded-full text-xs ${
                                    att.status_yuran === 'Sudah Bayar' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                  }`}>
                                    {att.status_yuran}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {attendees.length === 0 && (
                          <div className="text-center py-8 text-slate-500">Tiada peserta didaftarkan</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Agenda Tab */}
                  {activeTab === 'agenda' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-slate-900">Agenda Mesyuarat</h3>
                        <button
                          onClick={() => { resetAgendaForm(); setShowAgendaModal(true); }}
                          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
                          data-testid="add-agenda-btn"
                        >
                          <Plus size={18} />
                          Tambah Agenda
                        </button>
                      </div>

                      <div className="space-y-3">
                        {agendas.map((agenda, idx) => (
                          <div key={agenda.id} className="bg-slate-50 rounded-xl p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex gap-4">
                                <div className="w-10 h-10 bg-teal-600 text-white rounded-full flex items-center justify-center font-bold">
                                  {agenda.no_agenda}
                                </div>
                                <div>
                                  <h4 className="font-medium text-slate-900">{agenda.tajuk_agenda}</h4>
                                  {agenda.penerangan && <p className="text-sm text-slate-600 mt-1">{agenda.penerangan}</p>}
                                  <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                                    {agenda.pembentang && <span>Pembentang: {agenda.pembentang}</span>}
                                    {agenda.masa_diperuntukkan && <span>Masa: {agenda.masa_diperuntukkan}</span>}
                                    <span className="px-2 py-0.5 bg-slate-200 rounded">{agenda.jenis_agenda}</span>
                                  </div>
                                </div>
                              </div>
                              <button
                                onClick={() => handleDeleteAgenda(agenda.id)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        ))}
                        {agendas.length === 0 && (
                          <div className="text-center py-8 text-slate-500">Tiada agenda ditambah</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Dokumen Tab */}
                  {activeTab === 'dokumen' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-slate-900">Dokumen AGM</h3>
                        <button
                          onClick={() => { resetDocumentForm(); setShowDocumentModal(true); }}
                          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
                          data-testid="add-document-btn"
                        >
                          <Plus size={18} />
                          Muat Naik Dokumen
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        {documents.map(doc => (
                          <div key={doc.id} className="bg-slate-50 rounded-xl p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex gap-3">
                                <div className="p-3 bg-pastel-mint rounded-lg">
                                  <FileText size={24} className="text-teal-600" />
                                </div>
                                <div>
                                  <h4 className="font-medium text-slate-900">{doc.nama_dokumen}</h4>
                                  <p className="text-sm text-slate-500">{doc.jenis_dokumen}</p>
                                  <p className="text-xs text-slate-400 mt-1">Versi {doc.versi}</p>
                                </div>
                              </div>
                              <button
                                onClick={() => handleDeleteDocument(doc.id)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        ))}
                        {documents.length === 0 && (
                          <div className="col-span-2 text-center py-8 text-slate-500">Tiada dokumen dimuat naik</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Laporan Tab */}
                  {activeTab === 'laporan' && report && (
                    <div className="space-y-6" data-testid="report-section">
                      {/* Quorum Status */}
                      <div className={`p-4 rounded-xl ${report.quorum.tercapai ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                        <div className="flex items-center gap-3">
                          {report.quorum.tercapai ? (
                            <CheckCircle size={24} className="text-green-600" />
                          ) : (
                            <AlertTriangle size={24} className="text-red-600" />
                          )}
                          <div>
                            <h4 className={`font-semibold ${report.quorum.tercapai ? 'text-green-800' : 'text-red-800'}`}>
                              {report.quorum.tercapai ? 'Quorum Tercapai!' : 'Quorum Belum Tercapai'}
                            </h4>
                            <p className={`text-sm ${report.quorum.tercapai ? 'text-green-600' : 'text-red-600'}`}>
                              Kehadiran: {report.quorum.peratus_semasa}% (Minimum: {report.quorum.minimum_diperlukan}%)
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Attendance Summary */}
                      <div>
                        <h3 className="font-semibold text-slate-900 mb-3">Ringkasan Kehadiran</h3>
                        <div className="grid grid-cols-4 gap-4">
                          <div className="bg-blue-50 rounded-xl p-4 text-center">
                            <div className="text-3xl font-bold text-blue-600">{report.ringkasan_kehadiran.jumlah_didaftarkan}</div>
                            <div className="text-sm text-blue-700">Didaftarkan</div>
                          </div>
                          <div className="bg-green-50 rounded-xl p-4 text-center">
                            <div className="text-3xl font-bold text-green-600">{report.ringkasan_kehadiran.jumlah_hadir}</div>
                            <div className="text-sm text-green-700">Hadir</div>
                          </div>
                          <div className="bg-red-50 rounded-xl p-4 text-center">
                            <div className="text-3xl font-bold text-red-600">{report.ringkasan_kehadiran.jumlah_tidak_hadir}</div>
                            <div className="text-sm text-red-700">Tidak Hadir</div>
                          </div>
                          <div className="bg-pastel-lavender rounded-xl p-4 text-center">
                            <div className="text-3xl font-bold text-violet-600">{report.ringkasan_kehadiran.peratus_kehadiran}%</div>
                            <div className="text-sm text-violet-700">Peratus</div>
                          </div>
                        </div>
                      </div>

                      {/* Gender Stats */}
                      <div>
                        <h3 className="font-semibold text-slate-900 mb-3">Statistik Jantina</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-sky-50 rounded-xl p-4">
                            <div className="flex items-center justify-between">
                              <span className="text-sky-700">Lelaki</span>
                              <span className="text-2xl font-bold text-sky-600">{report.statistik_jantina.lelaki_hadir}</span>
                            </div>
                          </div>
                          <div className="bg-pink-50 rounded-xl p-4">
                            <div className="flex items-center justify-between">
                              <span className="text-pink-700">Perempuan</span>
                              <span className="text-2xl font-bold text-pink-600">{report.statistik_jantina.perempuan_hadir}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* State Stats */}
                      <div>
                        <h3 className="font-semibold text-slate-900 mb-3">Kehadiran Mengikut Negeri</h3>
                        {report.negeri_paling_ramai.negeri && (
                          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                            <div className="flex items-center gap-2">
                              <span className="text-amber-700">Negeri Paling Ramai:</span>
                              <span className="font-bold text-amber-800">{report.negeri_paling_ramai.negeri}</span>
                              <span className="px-2 py-0.5 bg-amber-200 rounded text-amber-800 text-sm">
                                {report.negeri_paling_ramai.jumlah} orang
                              </span>
                            </div>
                          </div>
                        )}
                        <div className="grid grid-cols-3 gap-3">
                          {Object.entries(report.statistik_negeri).map(([negeri, count]) => (
                            <div key={negeri} className="bg-slate-50 rounded-lg p-3 flex items-center justify-between">
                              <span className="text-sm text-slate-700">{negeri}</span>
                              <span className="font-semibold text-slate-900">{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Fee Status */}
                      <div>
                        <h3 className="font-semibold text-slate-900 mb-3">Status Yuran</h3>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="bg-green-50 rounded-xl p-4 text-center">
                            <div className="text-2xl font-bold text-green-600">{report.statistik_yuran.sudah_bayar}</div>
                            <div className="text-sm text-green-700">Sudah Bayar</div>
                          </div>
                          <div className="bg-yellow-50 rounded-xl p-4 text-center">
                            <div className="text-2xl font-bold text-yellow-600">{report.statistik_yuran.belum_bayar}</div>
                            <div className="text-sm text-yellow-700">Belum Bayar</div>
                          </div>
                          <div className="bg-orange-50 rounded-xl p-4 text-center">
                            <div className="text-2xl font-bold text-orange-600">{report.statistik_yuran.pemerhati}</div>
                            <div className="text-sm text-orange-700">Pemerhati</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
              <Calendar size={48} className="mx-auto text-slate-300 mb-4" />
              <h3 className="text-xl font-semibold text-slate-700">Pilih Event AGM</h3>
              <p className="text-slate-500 mt-2">Sila pilih event dari senarai di sebelah kiri atau cipta event baru</p>
            </div>
          )}
        </div>
      </div>

      {/* Event Modal */}
      <AnimatePresence>
        {showEventModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto min-h-[100dvh] min-h-screen"
            onClick={() => setShowEventModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-slate-200 shrink-0">
                <h2 className="text-xl font-bold text-slate-900">
                  {selectedEvent ? 'Kemaskini Event AGM' : 'Cipta Event AGM Baru'}
                </h2>
              </div>
              <div className="p-6 space-y-4">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nama Event</label>
                    <input
                      type="text"
                      value={eventForm.nama_event}
                      onChange={e => setEventForm({...eventForm, nama_event: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                      placeholder="cth: AGM Tahunan PIBG 2024"
                      data-testid="event-name-input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Jenis Mesyuarat</label>
                    <select
                      value={eventForm.jenis_mesyuarat}
                      onChange={e => setEventForm({...eventForm, jenis_mesyuarat: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                    >
                      {JENIS_MESYUARAT.map(j => <option key={j} value={j}>{j}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Tahun Kewangan</label>
                    <input
                      type="text"
                      value={eventForm.tahun_kewangan}
                      onChange={e => setEventForm({...eventForm, tahun_kewangan: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Tarikh</label>
                    <input
                      type="date"
                      value={eventForm.tarikh_mesyuarat}
                      onChange={e => {
                        const date = new Date(e.target.value);
                        const days = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
                        setEventForm({...eventForm, tarikh_mesyuarat: e.target.value, hari: days[date.getDay()]});
                      }}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                      data-testid="event-date-input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Hari</label>
                    <input
                      type="text"
                      value={eventForm.hari}
                      readOnly
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-slate-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Masa Mula</label>
                    <input
                      type="time"
                      value={eventForm.masa_mula}
                      onChange={e => setEventForm({...eventForm, masa_mula: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Masa Tamat</label>
                    <input
                      type="time"
                      value={eventForm.masa_tamat}
                      onChange={e => setEventForm({...eventForm, masa_tamat: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                    <select
                      value={eventForm.status}
                      onChange={e => setEventForm({...eventForm, status: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                    >
                      {STATUS_EVENT.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Mod Mesyuarat</label>
                    <select
                      value={eventForm.mod_mesyuarat}
                      onChange={e => setEventForm({...eventForm, mod_mesyuarat: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                    >
                      {MOD_MESYUARAT.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>

                {/* Location Info */}
                {(eventForm.mod_mesyuarat === 'Fizikal' || eventForm.mod_mesyuarat === 'Hybrid') && (
                  <div className="border-t pt-4">
                    <h3 className="font-medium text-slate-900 mb-3">Maklumat Lokasi Fizikal</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Nama Tempat</label>
                        <input
                          type="text"
                          value={eventForm.nama_tempat}
                          onChange={e => setEventForm({...eventForm, nama_tempat: e.target.value})}
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                          placeholder="cth: Dewan Besar MRSMKU"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Alamat Penuh</label>
                        <textarea
                          value={eventForm.alamat_penuh}
                          onChange={e => setEventForm({...eventForm, alamat_penuh: e.target.value})}
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                          rows={2}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Person In Charge Lokasi</label>
                        <input
                          type="text"
                          value={eventForm.pic_lokasi}
                          onChange={e => setEventForm({...eventForm, pic_lokasi: e.target.value})}
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Online Info */}
                {(eventForm.mod_mesyuarat === 'Online' || eventForm.mod_mesyuarat === 'Hybrid') && (
                  <div className="border-t pt-4">
                    <h3 className="font-medium text-slate-900 mb-3">Maklumat Mesyuarat Online</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Platform</label>
                        <input
                          type="text"
                          value={eventForm.platform_mesyuarat}
                          onChange={e => setEventForm({...eventForm, platform_mesyuarat: e.target.value})}
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                          placeholder="cth: Zoom, Google Meet"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Host/Admin</label>
                        <input
                          type="text"
                          value={eventForm.host_mesyuarat}
                          onChange={e => setEventForm({...eventForm, host_mesyuarat: e.target.value})}
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Link Mesyuarat</label>
                        <input
                          type="url"
                          value={eventForm.link_mesyuarat}
                          onChange={e => setEventForm({...eventForm, link_mesyuarat: e.target.value})}
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Quorum Settings */}
                <div className="border-t pt-4">
                  <h3 className="font-medium text-slate-900 mb-3">Tetapan Quorum & Kehadiran</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Quorum Minimum (%)</label>
                      <input
                        type="number"
                        value={eventForm.quorum_minimum}
                        onChange={e => setEventForm({...eventForm, quorum_minimum: parseInt(e.target.value)})}
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                        min={0}
                        max={100}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Kaedah Kehadiran</label>
                      <select
                        value={eventForm.kaedah_kehadiran}
                        onChange={e => setEventForm({...eventForm, kaedah_kehadiran: e.target.value})}
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                      >
                        <option value="QR Code">QR Code</option>
                        <option value="Manual">Manual</option>
                        <option value="Auto login">Auto login</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
                <button
                  onClick={() => setShowEventModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  onClick={selectedEvent ? handleUpdateEvent : handleCreateEvent}
                  className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
                  data-testid="save-event-btn"
                >
                  {selectedEvent ? 'Kemaskini' : 'Cipta Event'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Attendee Modal */}
      <AnimatePresence>
        {showAttendeeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto min-h-[100dvh] min-h-screen"
            onClick={() => { setShowAttendeeModal(false); setFeeCheckResult(null); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-slate-200 shrink-0">
                <h2 className="text-xl font-bold text-slate-900">Daftar Peserta Baru</h2>
                <p className="text-sm text-slate-500 mt-1">Sistem akan auto-semak status yuran Muafakat anak</p>
              </div>
              <div className="p-6 space-y-4">
                {/* IC Number with Fee Check Button */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">No IC Ibu Bapa</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={attendeeForm.no_ic}
                      onChange={e => setAttendeeForm({...attendeeForm, no_ic: e.target.value})}
                      className="flex-1 px-4 py-2 border border-slate-200 rounded-lg"
                      placeholder="000000000000"
                      data-testid="attendee-ic-input"
                    />
                    <button
                      onClick={handleCheckFeeByIC}
                      disabled={checkingFee || !attendeeForm.no_ic.trim()}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300 flex items-center gap-2"
                      data-testid="check-fee-btn"
                    >
                      {checkingFee ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
                      Semak Yuran Muafakat
                    </button>
                  </div>
                </div>

                {/* Fee Check Result */}
                {feeCheckResult && (
                  <div className={`p-4 rounded-xl ${feeCheckResult.found ? (feeCheckResult.fee_status?.all_paid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200') : 'bg-yellow-50 border border-yellow-200'}`}>
                    {!feeCheckResult.found ? (
                      <div className="flex items-center gap-2 text-yellow-700">
                        <AlertTriangle size={18} />
                        <span>Pengguna tidak dijumpai dalam sistem. Sila daftar manual.</span>
                      </div>
                    ) : feeCheckResult.fee_status?.all_paid ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-green-700">
                          <CheckCircle size={18} />
                          <span className="font-medium">Semua yuran Muafakat telah dijelaskan!</span>
                        </div>
                        <p className="text-sm text-green-600">Nama: {feeCheckResult.user_name}</p>
                        {feeCheckResult.fee_status?.anak_sudah_bayar?.length > 0 && (
                          <p className="text-sm text-green-600">
                            Anak: {feeCheckResult.fee_status.anak_sudah_bayar.join(', ')}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-red-700">
                          <AlertTriangle size={18} />
                          <span className="font-medium">AMARAN: Ada yuran Muafakat belum dibayar!</span>
                        </div>
                        <p className="text-sm text-red-600">Nama: {feeCheckResult.user_name}</p>
                        <div className="mt-2 p-2 bg-red-100 rounded-lg">
                          <p className="text-sm font-medium text-red-800">Anak belum bayar yuran:</p>
                          <ul className="list-disc list-inside text-sm text-red-700 mt-1">
                            {feeCheckResult.fee_status?.anak_belum_bayar?.map((anak, i) => (
                              <li key={i}>{anak}</li>
                            ))}
                          </ul>
                          {feeCheckResult.fee_status?.total_unpaid_amount > 0 && (
                            <p className="text-sm text-red-700 mt-2 font-medium">
                              Jumlah tertunggak: RM {feeCheckResult.fee_status.total_unpaid_amount.toFixed(2)}
                            </p>
                          )}
                        </div>
                        <p className="text-xs text-red-600 mt-2">
                          * Peserta akan didaftarkan sebagai PEMERHATI sahaja sehingga yuran dijelaskan
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nama Penuh</label>
                  <input
                    type="text"
                    value={attendeeForm.nama_penuh}
                    onChange={e => setAttendeeForm({...attendeeForm, nama_penuh: e.target.value})}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                    data-testid="attendee-name-input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">No Telefon</label>
                  <input
                    type="tel"
                    value={attendeeForm.no_telefon}
                    onChange={e => setAttendeeForm({...attendeeForm, no_telefon: e.target.value})}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={attendeeForm.email}
                    onChange={e => setAttendeeForm({...attendeeForm, email: e.target.value})}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Jantina</label>
                    <select
                      value={attendeeForm.jantina}
                      onChange={e => setAttendeeForm({...attendeeForm, jantina: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                    >
                      <option value="Lelaki">Lelaki</option>
                      <option value="Perempuan">Perempuan</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Negeri</label>
                    <select
                      value={attendeeForm.negeri}
                      onChange={e => setAttendeeForm({...attendeeForm, negeri: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                    >
                      {MALAYSIA_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Kategori Peserta</label>
                    <select
                      value={attendeeForm.kategori_peserta}
                      onChange={e => setAttendeeForm({...attendeeForm, kategori_peserta: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                    >
                      {KATEGORI_PESERTA.map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Status Yuran</label>
                    <select
                      value={attendeeForm.status_yuran}
                      onChange={e => setAttendeeForm({...attendeeForm, status_yuran: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                    >
                      <option value="Sudah Bayar">Sudah Bayar</option>
                      <option value="Belum Bayar">Belum Bayar</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
                <button
                  onClick={() => setShowAttendeeModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  onClick={handleRegisterAttendee}
                  className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
                  data-testid="save-attendee-btn"
                >
                  Daftar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* QR Scanner Modal */}
      <AnimatePresence>
        {showScannerModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto min-h-[100dvh] min-h-screen"
            onClick={closeScannerModal}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0"
              onClick={e => e.stopPropagation()}
              data-testid="qr-scanner-modal"
            >
              <div className="p-4 border-b border-slate-200 flex items-center justify-between shrink-0">
                <h2 className="text-xl font-bold text-slate-900 min-w-0 truncate pr-2">Imbas QR Code Kehadiran</h2>
                <button
                  onClick={closeScannerModal}
                  className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-slate-100 rounded-lg flex-shrink-0"
                  aria-label="Tutup"
                  data-testid="close-scanner-btn"
                >
                  <X size={20} className="text-slate-500" />
                </button>
              </div>
              
              <div className="p-4 space-y-4">
                {/* Camera Scanner */}
                {!scanResult && (
                  <div className="relative">
                    <div className="rounded-xl overflow-hidden bg-black" style={{ minHeight: '280px' }}>
                      {cameraActive ? (
                        <Scanner
                          onScan={handleCameraScan}
                          onError={handleScannerError}
                          scanDelay={500}
                          allowMultiple={false}
                          formats={['qr_code']}
                          components={{
                            audio: true,
                            torch: true,
                            zoom: true,
                            finder: true
                          }}
                          styles={{
                            container: { 
                              width: '100%',
                              height: '280px'
                            },
                            video: {
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover'
                            }
                          }}
                          data-testid="qr-camera-scanner"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-[280px] bg-slate-800">
                          <div className="text-center text-white">
                            <Camera size={48} className="mx-auto mb-3 text-slate-400" />
                            <p className="text-slate-300">Kamera dijeda</p>
                            <button
                              onClick={() => { setCameraActive(true); setScanResult(null); }}
                              className="mt-3 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                              data-testid="resume-camera-btn"
                            >
                              <RefreshCw size={16} className="inline mr-2" />
                              Imbas Lagi
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Scanning indicator */}
                    {isScanning && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-xl">
                        <div className="text-center text-white">
                          <RefreshCw size={32} className="mx-auto animate-spin mb-2" />
                          <p>Memproses...</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Scanner Error */}
                {scannerError && !scanResult && (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
                    <div className="flex items-start gap-3">
                      <AlertTriangle size={20} className="text-yellow-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-yellow-800 text-sm">{scannerError}</p>
                        <p className="text-yellow-600 text-xs mt-1">Sila gunakan input manual di bawah.</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Manual Input */}
                {!scanResult && (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px bg-slate-200"></div>
                      <span className="text-slate-400 text-sm">atau masukkan kod manual</span>
                      <div className="flex-1 h-px bg-slate-200"></div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Kod QR</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={manualQR}
                          onChange={e => setManualQR(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleScanQR()}
                          className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                          placeholder="AGM-xxxxx-xxxxx-xxxxx"
                          data-testid="manual-qr-input"
                        />
                        <button
                          onClick={() => handleScanQR()}
                          disabled={!manualQR.trim() || isScanning}
                          className="px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-2"
                          data-testid="scan-submit-btn"
                        >
                          <QrCode size={18} />
                          Imbas
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* Scan Result */}
                {scanResult && (
                  <div className="space-y-4">
                    <div className={`p-4 rounded-xl ${scanResult.error ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
                      {scanResult.error || scanResult.detail ? (
                        <div className="flex items-start gap-3">
                          <XCircle size={24} className="text-red-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="font-medium text-red-800">{scanResult.error || scanResult.detail}</p>
                            <p className="text-sm text-red-600 mt-1">Sila pastikan kod QR adalah sah dan peserta sudah didaftarkan.</p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-start gap-3">
                            <CheckCircle size={24} className="text-green-600 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="font-medium text-green-800">{scanResult.message}</p>
                              {scanResult.attendee && (
                                <div className="mt-2 space-y-1">
                                  <p className="text-green-700">
                                    <span className="font-medium">Nama:</span> {scanResult.attendee.nama_penuh}
                                  </p>
                                  <p className="text-green-700">
                                    <span className="font-medium">No IC:</span> {scanResult.attendee.no_ic}
                                  </p>
                                  <p className="text-green-700">
                                    <span className="font-medium">Kategori:</span>{' '}
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                      scanResult.attendee.kategori_peserta === 'Pemerhati' 
                                        ? 'bg-orange-100 text-orange-700' 
                                        : 'bg-blue-100 text-blue-700'
                                    }`}>
                                      {scanResult.attendee.kategori_peserta === 'Pemerhati' 
                                        ? 'Ahli Muafakat Pemerhati' 
                                        : 'Ahli Muafakat Aktif'}
                                    </span>
                                  </p>
                                  <p className="text-green-700">
                                    <span className="font-medium">Waktu Hadir:</span> {new Date().toLocaleTimeString('ms-MY')}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {/* Fee Alert */}
                          {scanResult.fee_alert && (
                            <div className="mt-3 p-3 bg-yellow-100 border border-yellow-300 rounded-lg">
                              <div className="flex items-start gap-2">
                                <AlertTriangle size={20} className="text-yellow-700 mt-0.5 flex-shrink-0" />
                                <div>
                                  <p className="font-medium text-yellow-800">{scanResult.fee_alert.message}</p>
                                  <p className="text-sm text-yellow-700 mt-1">
                                    Status keahlian: <span className="font-medium">{scanResult.fee_alert.status}</span>
                                  </p>
                                  {scanResult.fee_alert.anak_belum_bayar?.length > 0 && (
                                    <div className="mt-2">
                                      <p className="text-sm text-yellow-700 font-medium">Anak belum bayar yuran:</p>
                                      <ul className="list-disc list-inside text-sm text-yellow-700 mt-1">
                                        {scanResult.fee_alert.anak_belum_bayar.map((anak, i) => (
                                          <li key={i}>{anak}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {scanResult.fee_alert.total_unpaid_amount > 0 && (
                                    <p className="text-sm text-yellow-700 mt-2">
                                      Jumlah tertunggak: <span className="font-bold">RM {scanResult.fee_alert.total_unpaid_amount.toFixed(2)}</span>
                                    </p>
                                  )}
                                  <p className="text-xs text-yellow-600 mt-2 italic">{scanResult.fee_alert.info}</p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action Buttons after scan */}
                    <div className="flex gap-3">
                      <button
                        onClick={resetScanner}
                        className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
                        data-testid="scan-another-btn"
                      >
                        <RefreshCw size={18} />
                        Imbas Peserta Lain
                      </button>
                      <button
                        onClick={closeScannerModal}
                        className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
                        data-testid="close-after-scan-btn"
                      >
                        Selesai
                      </button>
                    </div>
                  </div>
                )}

                {/* Instructions */}
                {!scanResult && (
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <span className="font-medium">Arahan:</span> Halakan kamera ke arah kod QR peserta. 
                      Sistem akan auto-semak status yuran dan mendaftarkan kehadiran sebagai:
                    </p>
                    <ul className="mt-2 text-sm text-blue-700 space-y-1">
                      <li className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                        <span><strong>Ahli Muafakat Aktif</strong> - Yuran telah dijelaskan</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                        <span><strong>Ahli Muafakat Pemerhati</strong> - Yuran belum dijelaskan</span>
                      </li>
                    </ul>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Agenda Modal */}
      <AnimatePresence>
        {showAgendaModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto min-h-[100dvh] min-h-screen"
            onClick={() => setShowAgendaModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0 flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-slate-200 shrink-0">
                <h2 className="text-xl font-bold text-slate-900">Tambah Agenda</h2>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">No Agenda</label>
                    <input
                      type="number"
                      value={agendaForm.no_agenda}
                      onChange={e => setAgendaForm({...agendaForm, no_agenda: parseInt(e.target.value)})}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                      min={1}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Jenis Agenda</label>
                    <select
                      value={agendaForm.jenis_agenda}
                      onChange={e => setAgendaForm({...agendaForm, jenis_agenda: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                    >
                      {JENIS_AGENDA.map(j => <option key={j} value={j}>{j}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tajuk Agenda</label>
                  <input
                    type="text"
                    value={agendaForm.tajuk_agenda}
                    onChange={e => setAgendaForm({...agendaForm, tajuk_agenda: e.target.value})}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                    data-testid="agenda-title-input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Penerangan</label>
                  <textarea
                    value={agendaForm.penerangan}
                    onChange={e => setAgendaForm({...agendaForm, penerangan: e.target.value})}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Pembentang</label>
                    <input
                      type="text"
                      value={agendaForm.pembentang}
                      onChange={e => setAgendaForm({...agendaForm, pembentang: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Masa Diperuntukkan</label>
                    <input
                      type="text"
                      value={agendaForm.masa_diperuntukkan}
                      onChange={e => setAgendaForm({...agendaForm, masa_diperuntukkan: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                      placeholder="cth: 15 minit"
                    />
                  </div>
                </div>
              </div>
              <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
                <button
                  onClick={() => setShowAgendaModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  onClick={handleCreateAgenda}
                  className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
                  data-testid="save-agenda-btn"
                >
                  Tambah
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Document Modal */}
      <AnimatePresence>
        {showDocumentModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto min-h-[100dvh] min-h-screen"
            onClick={() => setShowDocumentModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0 flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-slate-200 shrink-0">
                <h2 className="text-xl font-bold text-slate-900">Muat Naik Dokumen</h2>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nama Dokumen</label>
                  <input
                    type="text"
                    value={documentForm.nama_dokumen}
                    onChange={e => setDocumentForm({...documentForm, nama_dokumen: e.target.value})}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                    data-testid="document-name-input"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Jenis Dokumen</label>
                    <select
                      value={documentForm.jenis_dokumen}
                      onChange={e => setDocumentForm({...documentForm, jenis_dokumen: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                    >
                      {JENIS_DOKUMEN.map(j => <option key={j} value={j}>{j}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Versi</label>
                    <input
                      type="text"
                      value={documentForm.versi}
                      onChange={e => setDocumentForm({...documentForm, versi: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">URL Dokumen</label>
                  <input
                    type="url"
                    value={documentForm.file_url}
                    onChange={e => setDocumentForm({...documentForm, file_url: e.target.value})}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                    placeholder="https://..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Dimuat Naik Oleh</label>
                    <input
                      type="text"
                      value={documentForm.dimuat_naik_oleh}
                      onChange={e => setDocumentForm({...documentForm, dimuat_naik_oleh: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Akses Pengguna</label>
                    <select
                      value={documentForm.akses_pengguna}
                      onChange={e => setDocumentForm({...documentForm, akses_pengguna: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                    >
                      <option value="Admin sahaja">Admin sahaja</option>
                      <option value="Ahli">Ahli</option>
                      <option value="Umum">Umum</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
                <button
                  onClick={() => setShowDocumentModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  onClick={handleCreateDocument}
                  className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
                  data-testid="save-document-btn"
                >
                  Muat Naik
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AGMPage;
