import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Bus, Ticket, Calendar, Clock, MapPinned, ArrowRight, X, Check, AlertCircle, FileCheck, Plus, Map
} from 'lucide-react';
import api, { API_URL } from '../../services/api';
import { Spinner, Button, Card } from '../../components/common';
import { CARA_PULANG_OPTIONS, CARA_PULANG_NEEDS_PLATE, CARA_PULANG_NEEDS_REMARKS } from '../../constants/hostel';

const BusTicketPage = () => {
  const navigate = useNavigate();
  const [trips, setTrips] = useState([]);
  const [children, setChildren] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [seatMap, setSeatMap] = useState(null);
  const [showBookingPanel, setShowBookingPanel] = useState(false);
  const [selectedChild, setSelectedChild] = useState('');
  const [selectedDropOff, setSelectedDropOff] = useState('');
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('trips'); // trips, bookings, leaves
  
  // Bus booking settings
  const [busSettings, setBusSettings] = useState({ require_leave_approval: false });
  const [leaveCheckResult, setLeaveCheckResult] = useState(null);
  const [checkingLeave, setCheckingLeave] = useState(false);
  
  // Pulang bermalam requests
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [showLeaveRequestPanel, setShowLeaveRequestPanel] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    student_id: '',
    tarikh_keluar: '',
    tarikh_pulang: '',
    sebab: '',
    cara_pulang: 'ibu_bapa',
    plate_number: '',
    transport_remarks: '',
    pic_name: '',
    pic_phone: ''
  });
  const [submittingLeave, setSubmittingLeave] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [tripsRes, childrenRes, bookingsRes, settingsRes, leavesRes] = await Promise.all([
        api.get(`${API_URL}/api/public/bus/trips`),
        api.get('/api/students'),
        api.get('/api/bus/bookings'),
        api.get(`${API_URL}/api/public/settings/bus-booking`),
        api.get('/api/hostel/pulang-bermalam/requests')
      ]);
      setTrips(tripsRes.data);
      setChildren(childrenRes.data.filter(c => c.status === 'approved'));
      setBookings(bookingsRes.data);
      setBusSettings(settingsRes.data);
      setLeaveRequests(leavesRes.data);
    } catch (err) {
      console.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchSeatMap = async (tripId) => {
    try {
      const res = await api.get(`${API_URL}/api/public/bus/trips/${tripId}/seats`);
      setSeatMap(res.data);
    } catch (err) {
      toast.error('Gagal memuatkan peta tempat duduk');
    }
  };

  // Check leave requirement when child is selected
  const checkLeaveRequirement = async (studentId, tripId) => {
    if (!busSettings.require_leave_approval) {
      setLeaveCheckResult({ can_book: true, require_leave_approval: false });
      return;
    }
    
    setCheckingLeave(true);
    try {
      const res = await api.get(`/api/bus/check-leave-requirement?student_id=${studentId}&trip_id=${tripId}`);
      setLeaveCheckResult(res.data);
    } catch (err) {
      setLeaveCheckResult({ can_book: false, message: 'Gagal menyemak kelulusan' });
    } finally {
      setCheckingLeave(false);
    }
  };

  const handleSelectTrip = async (trip) => {
    setSelectedTrip(trip);
    await fetchSeatMap(trip.id);
    setShowBookingPanel(true);
    setSelectedChild('');
    setSelectedDropOff(trip.drop_off_points[0]?.location || '');
    setLeaveCheckResult(null);
  };

  const handleChildSelect = (childId) => {
    setSelectedChild(childId);
    if (childId && selectedTrip) {
      checkLeaveRequirement(childId, selectedTrip.id);
    } else {
      setLeaveCheckResult(null);
    }
  };

  const handleBooking = async () => {
    if (!selectedChild) {
      toast.error('Sila pilih anak anda');
      return;
    }
    if (!selectedDropOff) {
      toast.error('Sila pilih lokasi turun');
      return;
    }
    
    // Check leave requirement
    if (busSettings.require_leave_approval && leaveCheckResult && !leaveCheckResult.can_book) {
      toast.error('Sila dapatkan kelulusan pulang bermalam terlebih dahulu');
      return;
    }

    setProcessing(true);
    try {
      await api.post('/api/bus/bookings', {
        trip_id: selectedTrip.id,
        student_id: selectedChild,
        drop_off_point: selectedDropOff
      });
      toast.success('Tempahan berjaya! Menunggu pengesahan.');
      setShowBookingPanel(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal membuat tempahan');
    } finally {
      setProcessing(false);
    }
  };

  // Submit leave request (disegerakkan dengan borang permohonan pulang bermalam & data keluar/masuk)
  const handleSubmitLeaveRequest = async () => {
    if (!leaveForm.student_id || !leaveForm.tarikh_keluar || !leaveForm.tarikh_pulang || !leaveForm.pic_name?.trim()) {
      toast.error('Sila lengkapkan maklumat wajib: anak, tarikh keluar/pulang, nama penjaga.');
      return;
    }
    if (CARA_PULANG_NEEDS_PLATE.includes(leaveForm.cara_pulang) && !(leaveForm.plate_number || '').trim()) {
      toast.error('Sila isi nombor plat kenderaan.');
      return;
    }
    if (CARA_PULANG_NEEDS_REMARKS.includes(leaveForm.cara_pulang) && !(leaveForm.transport_remarks || '').trim()) {
      toast.error(leaveForm.cara_pulang === 'bas' ? 'Sila isi catatan bas.' : 'Sila nyatakan cara pulang (lain-lain).');
      return;
    }
    setSubmittingLeave(true);
    try {
      await api.post('/api/hostel/pulang-bermalam/request', {
        student_id: leaveForm.student_id,
        tarikh_keluar: leaveForm.tarikh_keluar,
        tarikh_pulang: leaveForm.tarikh_pulang,
        sebab: leaveForm.sebab || 'Pulang bermalam',
        cara_pulang: leaveForm.cara_pulang,
        plate_number: (leaveForm.plate_number || '').trim() || undefined,
        transport_remarks: (leaveForm.transport_remarks || '').trim() || undefined,
        pic_name: leaveForm.pic_name.trim(),
        pic_phone: leaveForm.pic_phone || undefined,
      });
      toast.success('Permohonan pulang bermalam berjaya dihantar');
      setShowLeaveRequestPanel(false);
      setLeaveForm({ student_id: '', tarikh_keluar: '', tarikh_pulang: '', sebab: '', cara_pulang: 'ibu_bapa', plate_number: '', transport_remarks: '', pic_name: '', pic_phone: '' });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menghantar permohonan');
    } finally {
      setSubmittingLeave(false);
    }
  };

  const handleCancelBooking = async (bookingId) => {
    if (!window.confirm('Adakah anda pasti ingin membatalkan tempahan ini?')) return;
    
    try {
      await api.post(`/api/bus/bookings/${bookingId}/cancel`);
      toast.success('Tempahan berjaya dibatalkan');
      fetchData();
    } catch (err) {
      toast.error('Gagal membatalkan tempahan');
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-amber-100 text-amber-700',
      confirmed: 'bg-blue-100 text-blue-700',
      assigned: 'bg-emerald-100 text-emerald-700',
      cancelled: 'bg-red-100 text-red-700',
      completed: 'bg-slate-100 text-slate-700',
      approved: 'bg-emerald-100 text-emerald-700',
      rejected: 'bg-red-100 text-red-700'
    };
    const labels = {
      pending: 'Menunggu',
      confirmed: 'Disahkan',
      assigned: 'Tempat Diberikan',
      cancelled: 'Dibatalkan',
      completed: 'Selesai',
      approved: 'Diluluskan',
      rejected: 'Ditolak'
    };
    return <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${styles[status] || 'bg-slate-100'}`}>{labels[status] || status}</span>;
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="bus-ticket-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent font-heading">
            Tiket Bas Pulang Bermalam
          </h1>
          <p className="text-slate-600 mt-1">Tempah tiket bas untuk anak anda</p>
          <button
            type="button"
            onClick={() => navigate('/bus-tickets/live-map')}
            className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-50 text-cyan-700 hover:bg-cyan-100 text-sm font-medium"
          >
            <Map size={18} /> Peta live bas
          </button>
          
          {/* Show leave requirement notice */}
          {busSettings.require_leave_approval && (
            <div className="mt-2 flex items-center gap-2 text-amber-700 bg-amber-50 px-3 py-2 rounded-lg text-sm">
              <AlertCircle size={16} />
              <span>Kelulusan pulang bermalam diperlukan sebelum beli tiket</span>
            </div>
          )}
        </div>
        
        {/* Tabs */}
        <div className="flex bg-slate-100 rounded-xl p-1">
          <button
            onClick={() => setActiveTab('trips')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'trips' ? 'bg-white text-cyan-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            data-testid="tab-trips"
          >
            <Bus size={16} className="inline mr-2" />
            Trip
          </button>
          <button
            onClick={() => setActiveTab('bookings')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'bookings' ? 'bg-white text-cyan-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            data-testid="tab-bookings"
          >
            <Ticket size={16} className="inline mr-2" />
            Tempahan ({bookings.length})
          </button>
          <button
            onClick={() => setActiveTab('leaves')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'leaves' ? 'bg-white text-cyan-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            data-testid="tab-leaves"
          >
            <FileCheck size={16} className="inline mr-2" />
            Pulang ({leaveRequests.length})
          </button>
        </div>
      </div>

      {/* Trip List Tab */}
      {activeTab === 'trips' && (
        <div className="space-y-4">
          {trips.length === 0 ? (
            <Card className="text-center py-12">
              <Bus className="mx-auto text-slate-300 mb-4" size={48} />
              <p className="text-slate-500">Tiada trip tersedia buat masa ini</p>
            </Card>
          ) : (
            <div className="grid gap-4">
              {trips.map((trip) => (
                <motion.div
                  key={trip.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ scale: 1.01 }}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-lg transition-all cursor-pointer"
                  onClick={() => handleSelectTrip(trip)}
                  data-testid={`trip-card-${trip.id}`}
                >
                  <div className="p-5">
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                      {/* Route Info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
                            <Bus className="text-white" size={24} />
                          </div>
                          <div>
                            <h3 className="font-bold text-lg text-slate-900">{trip.route_name}</h3>
                            <p className="text-slate-500 text-sm">{trip.company_name}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 text-slate-700">
                          <MapPinned size={16} className="text-cyan-600" />
                          <span className="font-medium">{trip.origin}</span>
                          <ArrowRight size={16} className="text-slate-400" />
                          <span className="font-medium">{trip.destination}</span>
                        </div>
                      </div>

                      {/* Date & Time */}
                      <div className="flex flex-col md:items-end gap-2">
                        <div className="flex items-center gap-2 text-slate-700">
                          <Calendar size={16} className="text-amber-600" />
                          <span className="font-semibold">{new Date(trip.departure_date).toLocaleDateString('ms-MY', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-600">
                          <Clock size={16} />
                          <span>{trip.departure_time}</span>
                        </div>
                      </div>

                      {/* Seats Info */}
                      <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-xl p-4 text-center min-w-[120px]">
                        <p className="text-2xl font-bold text-cyan-700">{trip.available_seats}</p>
                        <p className="text-xs text-slate-600">Tempat Kosong</p>
                        <p className="text-xs text-slate-400">dari {trip.total_seats}</p>
                      </div>
                    </div>

                    {/* Drop-off Points */}
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <p className="text-xs text-slate-500 mb-2">LOKASI TURUN:</p>
                      <div className="flex flex-wrap gap-2">
                        {trip.drop_off_points.map((point, idx) => (
                          <span key={idx} className="px-3 py-1.5 bg-slate-100 rounded-full text-xs font-medium text-slate-700">
                            {point.location} • <span className="text-cyan-600">RM {point.price}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Book Button */}
                  <div className="bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-3 text-center">
                    <span className="text-white font-semibold">Klik untuk Tempah Tiket</span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bookings Tab */}
      {activeTab === 'bookings' && (
        <div className="space-y-4">
          {bookings.length === 0 ? (
            <Card className="text-center py-12">
              <Ticket className="mx-auto text-slate-300 mb-4" size={48} />
              <p className="text-slate-500">Anda belum mempunyai tempahan</p>
              <Button variant="primary" className="mt-4" onClick={() => setActiveTab('trips')}>
                Tempah Sekarang
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4">
              {bookings.map((booking) => (
                <motion.div
                  key={booking.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm"
                  data-testid={`booking-card-${booking.id}`}
                >
                  {/* Ticket Header */}
                  <div className="bg-gradient-to-r from-cyan-600 to-blue-700 p-4 text-white">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Ticket size={24} />
                        <div>
                          <p className="text-xs text-cyan-100">NO. TEMPAHAN</p>
                          <p className="font-bold text-lg tracking-wider">{booking.booking_number}</p>
                        </div>
                      </div>
                      {getStatusBadge(booking.status)}
                    </div>
                  </div>

                  {/* Ticket Body */}
                  <div className="p-5">
                    <div className="flex flex-col md:flex-row gap-6">
                      {/* Student Info */}
                      <div className="flex-1">
                        <p className="text-xs text-slate-500 mb-1">PENUMPANG</p>
                        <p className="font-bold text-lg text-slate-900">{booking.student_name}</p>
                        <p className="text-sm text-slate-500">{booking.student_matric}</p>
                      </div>

                      {/* Route Info */}
                      <div className="flex-1">
                        <p className="text-xs text-slate-500 mb-1">PERJALANAN</p>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-800">{booking.origin}</span>
                          <ArrowRight size={16} className="text-slate-400" />
                          <span className="font-medium text-slate-800">{booking.destination}</span>
                        </div>
                        <p className="text-sm text-cyan-600 mt-1">Turun: {booking.drop_off_point}</p>
                      </div>

                      {/* Date & Seat */}
                      <div className="text-right">
                        <p className="text-xs text-slate-500 mb-1">TARIKH</p>
                        <p className="font-semibold text-slate-800">{new Date(booking.departure_date).toLocaleDateString('ms-MY')}</p>
                        <p className="text-sm text-slate-600">{booking.departure_time}</p>
                        {booking.assigned_seat && (
                          <div className="mt-2 inline-block bg-emerald-100 text-emerald-700 px-3 py-1 rounded-lg text-sm font-bold">
                            Tempat: {booking.assigned_seat}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Price & Actions */}
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                      <div>
                        <p className="text-xs text-slate-500">HARGA</p>
                        <p className="text-2xl font-bold text-cyan-700">RM {booking.drop_off_price?.toFixed(2)}</p>
                      </div>
                      {booking.status === 'pending' && (
                        <Button variant="danger" size="sm" onClick={() => handleCancelBooking(booking.id)}>
                          Batal Tempahan
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Bus Info Footer */}
                  <div className="bg-slate-50 px-5 py-3 flex items-center justify-between text-sm text-slate-600">
                    <span><Bus size={14} className="inline mr-1" />{booking.company_name}</span>
                    <span>{booking.bus_plate}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Booking Slide-in Panel */}
      <AnimatePresence>
        {showBookingPanel && selectedTrip && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="fixed inset-0 bg-black/50 z-50" 
              onClick={() => setShowBookingPanel(false)} 
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col"
            >
              {/* Panel Header */}
              <div className="p-6 border-b bg-gradient-to-r from-cyan-500 to-blue-600 text-white">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Ticket size={24} />
                    Tempah Tiket Bas
                  </h3>
                  <button onClick={() => setShowBookingPanel(false)} className="p-2 hover:bg-white/20 rounded-lg transition">
                    <X size={24} />
                  </button>
                </div>
                {/* Trip Summary in Header */}
                <div className="bg-white/10 rounded-xl p-3">
                  <h4 className="font-semibold">{selectedTrip.route_name}</h4>
                  <p className="text-sm text-white/80">{selectedTrip.company_name} • {selectedTrip.bus_plate}</p>
                  <div className="flex items-center gap-2 mt-2 text-sm">
                    <Calendar size={14} />
                    <span>{new Date(selectedTrip.departure_date).toLocaleDateString('ms-MY')} • {selectedTrip.departure_time}</span>
                  </div>
                </div>
              </div>
              
              {/* Panel Content - Scrollable */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Select Child */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Pilih Anak</label>
                  {children.length === 0 ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-700 text-sm">
                      Tiada anak yang disahkan. Sila pastikan pendaftaran anak anda telah disahkan oleh admin.
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {children.map((child) => (
                        <label
                          key={child.id}
                          className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${selectedChild === child.id ? 'border-cyan-500 bg-cyan-50' : 'border-slate-200 hover:border-slate-300'}`}
                        >
                          <input
                            type="radio"
                            name="child"
                            value={child.id}
                            checked={selectedChild === child.id}
                            onChange={(e) => handleChildSelect(e.target.value)}
                            className="sr-only"
                          />
                          <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                            {child.full_name.charAt(0)}
                          </div>
                          <div className="flex-1">
                            <p className="font-semibold text-slate-900">{child.full_name}</p>
                            <p className="text-sm text-slate-500">{child.matric_number} • Tingkatan {child.form}</p>
                          </div>
                          {selectedChild === child.id && <Check className="text-cyan-600" size={20} />}
                        </label>
                      ))}
                    </div>
                  )}
                  
                  {/* Leave Requirement Check Result */}
                  {selectedChild && busSettings.require_leave_approval && (
                    <div className="mt-3">
                      {checkingLeave ? (
                        <div className="bg-slate-100 rounded-lg p-3 flex items-center gap-2 text-slate-600">
                          <Spinner size="sm" /> Menyemak kelulusan pulang bermalam...
                        </div>
                      ) : leaveCheckResult && (
                        <div className={`rounded-lg p-3 flex items-start gap-2 ${leaveCheckResult.can_book ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                          {leaveCheckResult.can_book ? (
                            <>
                              <Check size={18} className="mt-0.5" />
                              <div>
                                <p className="font-medium">Kelulusan pulang bermalam ditemui</p>
                                {leaveCheckResult.leave_date_out && (
                                  <p className="text-sm">{leaveCheckResult.leave_date_out} - {leaveCheckResult.leave_date_return}</p>
                                )}
                              </div>
                            </>
                          ) : (
                            <>
                              <AlertCircle size={18} className="mt-0.5" />
                              <div>
                                <p className="font-medium">Kelulusan pulang bermalam diperlukan</p>
                                <p className="text-sm">{leaveCheckResult.message}</p>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="mt-2"
                                  onClick={() => {
                                    setShowBookingPanel(false);
                                    setActiveTab('leaves');
                                    setShowLeaveRequestPanel(true);
                                    setLeaveForm(prev => ({ ...prev, student_id: selectedChild }));
                                  }}
                                >
                                  <Plus size={14} className="mr-1" /> Mohon Pulang Bermalam
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Select Drop-off */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Pilih Lokasi Turun</label>
                  <div className="grid gap-2">
                    {selectedTrip.drop_off_points.map((point) => (
                      <label
                        key={point.location}
                        className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all ${selectedDropOff === point.location ? 'border-cyan-500 bg-cyan-50' : 'border-slate-200 hover:border-slate-300'}`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="dropoff"
                            value={point.location}
                            checked={selectedDropOff === point.location}
                            onChange={(e) => setSelectedDropOff(e.target.value)}
                            className="sr-only"
                          />
                          <MapPinned size={18} className={selectedDropOff === point.location ? 'text-cyan-600' : 'text-slate-400'} />
                          <span className="font-medium text-slate-800">{point.location}</span>
                        </div>
                        <span className={`font-bold ${selectedDropOff === point.location ? 'text-cyan-600' : 'text-slate-600'}`}>
                          RM {point.price.toFixed(2)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Seat Map Preview */}
                {seatMap && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Peta Tempat Duduk ({seatMap.available_count} kosong)
                    </label>
                    <div className="bg-slate-100 rounded-xl p-4">
                      <div className="flex justify-center mb-4">
                        <div className="bg-slate-700 text-white px-4 py-1 rounded text-xs">PEMANDU</div>
                      </div>
                      <div className="grid grid-cols-5 gap-1 max-w-xs mx-auto">
                        {seatMap.seats.map((seat) => (
                          <div
                            key={seat.seat_id}
                            className={`w-8 h-8 rounded flex items-center justify-center text-xs font-medium ${
                              seat.is_booked 
                                ? 'bg-red-200 text-red-700' 
                                : 'bg-emerald-200 text-emerald-700'
                            } ${seat.column === 'B' ? 'mr-4' : ''}`}
                            title={seat.is_booked ? 'Sudah ditempah' : 'Kosong'}
                          >
                            {seat.seat_id}
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-center gap-4 mt-4 text-xs">
                        <span className="flex items-center gap-1"><div className="w-4 h-4 bg-emerald-200 rounded"></div> Kosong</span>
                        <span className="flex items-center gap-1"><div className="w-4 h-4 bg-red-200 rounded"></div> Ditempah</span>
                      </div>
                      <p className="text-center text-xs text-slate-500 mt-2">
                        * Tempat duduk akan diberikan oleh Admin Bas
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Panel Footer - Fixed */}
              <div className="border-t p-6 bg-white space-y-4">
                {/* Total Price */}
                {selectedDropOff && (
                  <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4 flex items-center justify-between">
                    <span className="font-medium text-cyan-800">Jumlah Bayaran</span>
                    <span className="text-2xl font-bold text-cyan-700">
                      RM {selectedTrip.drop_off_points.find(p => p.location === selectedDropOff)?.price.toFixed(2) || '0.00'}
                    </span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setShowBookingPanel(false)}>
                    Batal
                  </Button>
                  <Button 
                    variant="primary" 
                    className="flex-1 bg-gradient-to-r from-cyan-600 to-blue-600"
                    onClick={handleBooking}
                    loading={processing}
                    disabled={!selectedChild || !selectedDropOff || children.length === 0 || (busSettings.require_leave_approval && leaveCheckResult && !leaveCheckResult.can_book)}
                  >
                    <Ticket size={18} className="mr-2" />
                    Tempah Tiket
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Leaves Tab - Pulang Bermalam */}
      {activeTab === 'leaves' && (
        <div className="space-y-4">
          {/* Add New Request Button */}
          <div className="flex justify-end">
            <Button 
              variant="primary" 
              onClick={() => setShowLeaveRequestPanel(true)}
              className="bg-gradient-to-r from-emerald-600 to-teal-600"
            >
              <Plus size={18} className="mr-2" />
              Mohon Pulang Bermalam
            </Button>
          </div>
          
          {leaveRequests.length === 0 ? (
            <Card className="text-center py-12">
              <FileCheck className="mx-auto text-slate-300 mb-4" size={48} />
              <p className="text-slate-500">Tiada permohonan pulang bermalam</p>
              <Button variant="primary" className="mt-4" onClick={() => setShowLeaveRequestPanel(true)}>
                Mohon Sekarang
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4">
              {leaveRequests.map((leave) => (
                <motion.div
                  key={leave.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm"
                  data-testid={`leave-card-${leave.id}`}
                >
                  <div className="p-5">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
                            <FileCheck className="text-white" size={24} />
                          </div>
                          <div>
                            <h3 className="font-bold text-lg text-slate-900">{leave.student_name}</h3>
                            <p className="text-slate-500 text-sm">{leave.student_matric}</p>
                          </div>
                          {getStatusBadge(leave.status)}
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-slate-500">Tarikh Keluar</p>
                            <p className="font-semibold text-slate-800">{new Date(leave.tarikh_keluar).toLocaleDateString('ms-MY')}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Tarikh Pulang</p>
                            <p className="font-semibold text-slate-800">{new Date(leave.tarikh_pulang).toLocaleDateString('ms-MY')}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Penjaga</p>
                            <p className="font-semibold text-slate-800">{leave.pic_name}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Sebab</p>
                            <p className="font-semibold text-slate-800">{leave.sebab || '-'}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Cara pulang</p>
                            <p className="font-semibold text-slate-800">{CARA_PULANG_OPTIONS.find((o) => o.value === leave.cara_pulang)?.label || leave.cara_pulang || '–'}</p>
                          </div>
                          {(leave.plate_number || leave.transport_remarks) && (
                            <div className="col-span-2">
                              <p className="text-slate-500">Plat / Catatan</p>
                              <p className="font-semibold text-slate-800">{[leave.plate_number, leave.transport_remarks].filter(Boolean).join(' · ') || '–'}</p>
                            </div>
                          )}
                        </div>
                        
                        {leave.status === 'approved' && leave.approved_by && (
                          <div className="mt-3 bg-emerald-50 text-emerald-700 rounded-lg px-3 py-2 text-sm">
                            Diluluskan oleh: {leave.approved_by}
                          </div>
                        )}
                        
                        {leave.status === 'rejected' && leave.rejection_reason && (
                          <div className="mt-3 bg-red-50 text-red-700 rounded-lg px-3 py-2 text-sm">
                            Sebab ditolak: {leave.rejection_reason}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-slate-50 px-5 py-3 text-sm text-slate-500">
                    Dimohon pada {new Date(leave.created_at).toLocaleDateString('ms-MY')}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Leave Request Slide-in Panel */}
      <AnimatePresence>
        {showLeaveRequestPanel && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="fixed inset-0 bg-black/50 z-50" 
              onClick={() => setShowLeaveRequestPanel(false)} 
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col"
            >
              {/* Panel Header */}
              <div className="p-6 border-b bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <FileCheck size={24} />
                    Mohon Pulang Bermalam
                  </h3>
                  <button onClick={() => setShowLeaveRequestPanel(false)} className="p-2 hover:bg-white/20 rounded-lg transition">
                    <X size={24} />
                  </button>
                </div>
                <p className="text-emerald-100 mt-2 text-sm">
                  Mohon kelulusan untuk pelajar keluar asrama
                </p>
              </div>
              
              {/* Panel Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Select Child */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Pilih Anak *</label>
                  <select 
                    className="w-full border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    value={leaveForm.student_id}
                    onChange={(e) => setLeaveForm(prev => ({ ...prev, student_id: e.target.value }))}
                  >
                    <option value="">-- Pilih Anak --</option>
                    {children.map(child => (
                      <option key={child.id} value={child.id}>{child.full_name} ({child.matric_number})</option>
                    ))}
                  </select>
                </div>
                
                {/* Dates */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Tarikh Keluar *</label>
                    <input 
                      type="date"
                      className="w-full border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      value={leaveForm.tarikh_keluar}
                      onChange={(e) => setLeaveForm(prev => ({ ...prev, tarikh_keluar: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Tarikh Pulang *</label>
                    <input 
                      type="date"
                      className="w-full border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      value={leaveForm.tarikh_pulang}
                      onChange={(e) => setLeaveForm(prev => ({ ...prev, tarikh_pulang: e.target.value }))}
                      min={leaveForm.tarikh_keluar}
                    />
                  </div>
                </div>
                
                {/* Sebab */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Sebab Pulang Bermalam</label>
                  <textarea 
                    className="w-full border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    rows={2}
                    placeholder="Cth: Cuti semester, program keluarga, dll"
                    value={leaveForm.sebab}
                    onChange={(e) => setLeaveForm(prev => ({ ...prev, sebab: e.target.value }))}
                  />
                </div>

                {/* Cara pulang */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Cara pulang *</label>
                  <select
                    className="w-full border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    value={leaveForm.cara_pulang}
                    onChange={(e) => setLeaveForm(prev => ({ ...prev, cara_pulang: e.target.value }))}
                  >
                    {CARA_PULANG_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {CARA_PULANG_NEEDS_PLATE.includes(leaveForm.cara_pulang) && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">No. Plat Kenderaan *</label>
                    <input
                      type="text"
                      className="w-full border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="Contoh: BCC 1234"
                      value={leaveForm.plate_number}
                      onChange={(e) => setLeaveForm(prev => ({ ...prev, plate_number: e.target.value }))}
                    />
                  </div>
                )}

                {leaveForm.cara_pulang === 'bas' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Catatan bas *</label>
                    <textarea
                      className="w-full border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
                      rows={2}
                      placeholder="Nombor bas, syarikat, masa berlepas (jika ada)"
                      value={leaveForm.transport_remarks}
                      onChange={(e) => setLeaveForm(prev => ({ ...prev, transport_remarks: e.target.value }))}
                    />
                  </div>
                )}

                {leaveForm.cara_pulang === 'lain_lain' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Nyatakan cara pulang *</label>
                    <textarea
                      className="w-full border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
                      rows={2}
                      placeholder="Contoh: Dijemput rakan, teksi, dll."
                      value={leaveForm.transport_remarks}
                      onChange={(e) => setLeaveForm(prev => ({ ...prev, transport_remarks: e.target.value }))}
                    />
                  </div>
                )}
                
                {/* Penjaga Info */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Nama Penjaga Yang Akan Ambil *</label>
                  <input 
                    type="text"
                    className="w-full border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="Nama penuh penjaga"
                    value={leaveForm.pic_name}
                    onChange={(e) => setLeaveForm(prev => ({ ...prev, pic_name: e.target.value }))}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">No. Telefon Penjaga</label>
                  <input 
                    type="tel"
                    className="w-full border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="01x-xxxxxxx"
                    value={leaveForm.pic_phone}
                    onChange={(e) => setLeaveForm(prev => ({ ...prev, pic_phone: e.target.value }))}
                  />
                </div>
              </div>
              
              {/* Panel Footer */}
              <div className="border-t p-6 bg-white">
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setShowLeaveRequestPanel(false)}>
                    Batal
                  </Button>
                  <Button 
                    variant="primary" 
                    className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600"
                    onClick={handleSubmitLeaveRequest}
                    loading={submittingLeave}
                    disabled={!leaveForm.student_id || !leaveForm.tarikh_keluar || !leaveForm.tarikh_pulang || !leaveForm.pic_name}
                  >
                    <FileCheck size={18} className="mr-2" />
                    Hantar Permohonan
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BusTicketPage;
