import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Calendar, Clock, User, Phone, Building, Plus, X, Edit, Trash2,
  ChevronLeft, ChevronRight, AlertCircle, CheckCircle, MessageSquare
} from 'lucide-react';
import { useAuth } from '../../App';
import api from '../../services/api';

const MONTHS_MY = [
  '', 'Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun',
  'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'
];

const DAYS_MY = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];

// Warden Card on Parent Dashboard
export const DutyWardenCard = () => {
  const [dutyWardens, setDutyWardens] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDutyWardens();
  }, []);

  const fetchDutyWardens = async () => {
    try {
      const res = await api.get('/api/warden/on-duty');
      setDutyWardens(res.data.wardens);
    } catch (err) {
      console.error('Failed to fetch duty wardens');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-6 border border-slate-200 animate-pulse">
        <div className="h-6 bg-slate-200 rounded w-1/2 mb-4" />
        <div className="h-20 bg-slate-200 rounded" />
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl p-6 text-white" data-testid="duty-warden-card">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
          <User size={24} />
        </div>
        <div>
          <h3 className="font-bold text-lg">Warden Bertugas Hari Ini</h3>
          <p className="text-white/70 text-sm">{new Date().toLocaleDateString('ms-MY', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
      </div>

      {dutyWardens.length === 0 ? (
        <div className="bg-white/10 rounded-xl p-4 text-center">
          <AlertCircle className="mx-auto mb-2" size={32} />
          <p className="text-sm">Tiada warden dijadualkan hari ini</p>
        </div>
      ) : (
        <div className="space-y-3">
          {dutyWardens.map((w, idx) => (
            <div key={idx} className="bg-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{w.warden_name}</p>
                  <p className="text-sm text-white/70">{w.jawatan_display}</p>
                  <p className="text-xs text-white/60 mt-1">
                    <Clock size={12} className="inline mr-1" />
                    {w.waktu_mula} - {w.waktu_tamat}
                  </p>
                </div>
                <div className="flex gap-2">
                  <a
                    href={`tel:${w.warden_phone}`}
                    className="p-2 bg-white/20 rounded-lg hover:bg-white/30"
                  >
                    <Phone size={18} />
                  </a>
                  <a
                    href={`https://wa.me/${w.warden_phone?.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 bg-white/20 rounded-lg hover:bg-white/30"
                  >
                    <MessageSquare size={18} />
                  </a>
                </div>
              </div>
              {w.blok_assigned?.length > 0 && (
                <div className="flex gap-1 mt-2">
                  {w.blok_assigned.map(b => (
                    <span key={b} className="text-xs bg-white/20 px-2 py-0.5 rounded">
                      {b}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Schedule Form
const ScheduleForm = ({ schedule, wardens, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    warden_id: schedule?.warden_id || '',
    tarikh_mula: schedule?.tarikh_mula || new Date().toISOString().split('T')[0],
    tarikh_tamat: schedule?.tarikh_tamat || new Date().toISOString().split('T')[0],
    waktu_mula: schedule?.waktu_mula || '18:00',
    waktu_tamat: schedule?.waktu_tamat || '07:00',
    blok_assigned: schedule?.blok_assigned || [],
    catatan: schedule?.catatan || ''
  });

  const [blocks, setBlocks] = useState([]);

  useEffect(() => {
    fetchBlocks();
  }, []);

  const fetchBlocks = async () => {
    try {
      const res = await api.get('/api/hostel-blocks/public');
      setBlocks(res.data.blocks);
    } catch (err) {
      console.error('Failed to fetch blocks');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.warden_id) {
      toast.error('Sila pilih warden');
      return;
    }

    setLoading(true);
    try {
      if (schedule?.id) {
        await api.put(`/api/warden/schedules/${schedule.id}`, formData);
        toast.success('Jadual berjaya dikemaskini');
      } else {
        await api.post('/api/warden/schedules', formData);
        toast.success('Jadual berjaya dicipta');
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan jadual');
    } finally {
      setLoading(false);
    }
  };

  const toggleBlock = (code) => {
    setFormData(prev => ({
      ...prev,
      blok_assigned: prev.blok_assigned.includes(code)
        ? prev.blok_assigned.filter(b => b !== code)
        : [...prev.blok_assigned, code]
    }));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-2xl w-full max-w-lg p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900">
            {schedule ? 'Edit Jadual' : 'Jadual Baru'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Warden *</label>
            <select
              value={formData.warden_id}
              onChange={(e) => setFormData({ ...formData, warden_id: e.target.value })}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-lg"
              required
            >
              <option value="">Pilih Warden</option>
              {wardens.map(w => (
                <option key={w.id} value={w.id}>{w.full_name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tarikh Mula</label>
              <input
                type="date"
                value={formData.tarikh_mula}
                onChange={(e) => setFormData({ ...formData, tarikh_mula: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tarikh Tamat</label>
              <input
                type="date"
                value={formData.tarikh_tamat}
                onChange={(e) => setFormData({ ...formData, tarikh_tamat: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Waktu Mula</label>
              <input
                type="time"
                value={formData.waktu_mula}
                onChange={(e) => setFormData({ ...formData, waktu_mula: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Waktu Tamat</label>
              <input
                type="time"
                value={formData.waktu_tamat}
                onChange={(e) => setFormData({ ...formData, waktu_tamat: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Blok Assigned</label>
            <div className="flex flex-wrap gap-2">
              {blocks.map(b => (
                <button
                  key={b.code}
                  type="button"
                  onClick={() => toggleBlock(b.code)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition-all ${
                    formData.blok_assigned.includes(b.code)
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 hover:border-emerald-300'
                  }`}
                >
                  {b.code}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-1">Kosongkan untuk semua blok</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Catatan</label>
            <textarea
              value={formData.catatan}
              onChange={(e) => setFormData({ ...formData, catatan: e.target.value })}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-lg"
              rows={2}
              placeholder="Catatan tambahan..."
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};

// Main Warden Management Page
export const WardenManagementPage = () => {
  const auth = useAuth();
  const user = auth?.user;
  const [loading, setLoading] = useState(false);
  const [schedules, setSchedules] = useState([]);
  const [wardens, setWardens] = useState([]);
  const [calendar, setCalendar] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editSchedule, setEditSchedule] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [viewMode, setViewMode] = useState('calendar'); // 'calendar' or 'list'

  useEffect(() => {
    fetchData();
  }, [currentMonth, currentYear]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [schedulesRes, wardensRes, calendarRes] = await Promise.all([
        api.get('/api/warden/schedules', { params: { bulan: currentMonth, tahun: currentYear } }),
        api.get('/api/warden/list'),
        api.get('/api/warden/calendar', { params: { bulan: currentMonth, tahun: currentYear } })
      ]);
      setSchedules(schedulesRes.data.schedules);
      setWardens(wardensRes.data.wardens);
      setCalendar(calendarRes.data.calendar);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Padam jadual ini?')) return;
    try {
      await api.delete(`/api/warden/schedules/${id}`);
      toast.success('Jadual berjaya dipadam');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal memadam jadual');
    }
  };

  const navigateMonth = (delta) => {
    let newMonth = currentMonth + delta;
    let newYear = currentYear;
    
    if (newMonth > 12) {
      newMonth = 1;
      newYear++;
    } else if (newMonth < 1) {
      newMonth = 12;
      newYear--;
    }
    
    setCurrentMonth(newMonth);
    setCurrentYear(newYear);
  };

  const today = new Date().toISOString().split('T')[0];

  const canEdit = ['admin', 'superadmin'].includes(user?.role);

  return (
    <div className="space-y-6" data-testid="warden-management-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Jadual Warden</h1>
          <p className="text-slate-600">Pengurusan jadual bertugas warden</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-xl overflow-hidden border border-slate-200">
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-4 py-2 text-sm font-medium ${viewMode === 'calendar' ? 'bg-emerald-600 text-white' : 'bg-white'}`}
            >
              <Calendar size={18} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-4 py-2 text-sm font-medium ${viewMode === 'list' ? 'bg-emerald-600 text-white' : 'bg-white'}`}
            >
              Senarai
            </button>
          </div>
          {canEdit && (
            <button
              onClick={() => { setEditSchedule(null); setShowForm(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700"
              data-testid="add-schedule-btn"
            >
              <Plus size={20} />
              Tambah Jadual
            </button>
          )}
        </div>
      </div>

      {/* Month Navigation */}
      <div className="flex items-center justify-center gap-4 bg-white rounded-xl p-4 border border-slate-200">
        <button
          onClick={() => navigateMonth(-1)}
          className="p-2 hover:bg-slate-100 rounded-lg"
        >
          <ChevronLeft size={24} />
        </button>
        <h2 className="text-xl font-bold text-slate-900 min-w-[200px] text-center">
          {MONTHS_MY[currentMonth]} {currentYear}
        </h2>
        <button
          onClick={() => navigateMonth(1)}
          className="p-2 hover:bg-slate-100 rounded-lg"
        >
          <ChevronRight size={24} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
        </div>
      ) : viewMode === 'calendar' && calendar ? (
        /* Calendar View */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* Days Header */}
          <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
            {DAYS_MY.map(day => (
              <div key={day} className="p-2 text-center text-sm font-semibold text-slate-600">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7">
            {/* Empty cells for days before first day of month */}
            {calendar.days.length > 0 && (
              Array.from({ length: new Date(calendar.days[0].tarikh).getDay() }).map((_, i) => (
                <div key={`empty-${i}`} className="p-2 min-h-[100px] border-b border-r border-slate-100 bg-slate-50" />
              ))
            )}
            
            {calendar.days.map((day) => {
              const isToday = day.tarikh === today;
              const hasWardens = day.wardens.length > 0;
              
              return (
                <div
                  key={day.tarikh}
                  className={`p-2 min-h-[100px] border-b border-r border-slate-100 ${
                    isToday ? 'bg-emerald-50 ring-2 ring-inset ring-emerald-500' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm font-medium ${isToday ? 'text-emerald-700' : 'text-slate-700'}`}>
                      {day.day_number}
                    </span>
                    {isToday && (
                      <span className="text-xs bg-emerald-600 text-white px-1.5 py-0.5 rounded">
                        Hari Ini
                      </span>
                    )}
                  </div>
                  
                  {hasWardens ? (
                    <div className="space-y-1">
                      {day.wardens.slice(0, 2).map((w, idx) => (
                        <div
                          key={idx}
                          className="text-xs bg-emerald-100 text-emerald-700 p-1 rounded truncate"
                          title={`${w.warden_name} (${w.waktu_mula}-${w.waktu_tamat})`}
                        >
                          {w.warden_name}
                        </div>
                      ))}
                      {day.wardens.length > 2 && (
                        <p className="text-xs text-slate-500">+{day.wardens.length - 2} lagi</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">Tiada jadual</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* List View */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Warden</th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Tarikh</th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Waktu</th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Blok</th>
                {canEdit && <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600"></th>}
              </tr>
            </thead>
            <tbody>
              {schedules.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 5 : 4} className="text-center py-8 text-slate-500">
                    Tiada jadual untuk bulan ini
                  </td>
                </tr>
              ) : (
                schedules.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{s.warden_name}</p>
                      <p className="text-xs text-slate-500">{s.jawatan}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-slate-700">
                        {new Date(s.tarikh_mula).toLocaleDateString('ms-MY')}
                      </p>
                      <p className="text-xs text-slate-500">
                        hingga {new Date(s.tarikh_tamat).toLocaleDateString('ms-MY')}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-slate-700">{s.waktu_mula} - {s.waktu_tamat}</p>
                    </td>
                    <td className="px-4 py-3">
                      {s.blok_assigned?.length > 0 ? (
                        <div className="flex gap-1 flex-wrap">
                          {s.blok_assigned.map(b => (
                            <span key={b} className="text-xs bg-slate-100 px-2 py-0.5 rounded">
                              {b}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">Semua blok</span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setEditSchedule(s); setShowForm(true); }}
                            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(s.id)}
                            className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Schedule Form Modal */}
      <AnimatePresence>
        {showForm && (
          <ScheduleForm
            schedule={editSchedule}
            wardens={wardens}
            onClose={() => { setShowForm(false); setEditSchedule(null); }}
            onSuccess={fetchData}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default WardenManagementPage;
