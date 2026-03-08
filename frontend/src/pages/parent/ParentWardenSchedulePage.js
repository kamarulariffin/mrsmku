/**
 * Jadual Guru Asrama / Warden Bertugas (paparan ibu bapa – read-only)
 * Menggunakan API awam /api/warden/calendar-public
 */
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Shield } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../services/api';
import { Card } from '../../components/common';

const MONTHS_MY = ['', 'Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];
const DAYS_HEADER = ['Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab', 'Ahd'];

export default function ParentWardenSchedulePage() {
  const [loading, setLoading] = useState(true);
  const [calendar, setCalendar] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await api.get('/api/warden/calendar-public', {
          params: { bulan: currentMonth, tahun: currentYear },
        });
        setCalendar(res.data?.calendar || null);
      } catch (e) {
        toast.error('Gagal muat jadual guru asrama');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [currentMonth, currentYear]);

  const navigateMonth = (delta) => {
    let m = currentMonth + delta;
    let y = currentYear;
    if (m > 12) {
      m = 1;
      y++;
    } else if (m < 1) {
      m = 12;
      y--;
    }
    setCurrentMonth(m);
    setCurrentYear(y);
  };

  const today = new Date().toISOString().split('T')[0];
  const calMonth = currentMonth;
  const calYear = currentYear;

  const buildCalendarGrid = () => {
    if (!calendar?.days?.length) return [];
    const first = new Date(calYear, calMonth - 1, 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - offset);
    const grid = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const isCurrentMonth = d.getMonth() === calMonth - 1;
      const dayData = calendar.days.find((x) => x.tarikh === dateStr) || null;
      grid.push({
        dateStr,
        dayNum: d.getDate(),
        month: d.getMonth() + 1,
        year: d.getFullYear(),
        isCurrentMonth,
        dayData,
      });
    }
    return grid;
  };

  const calendarGrid = calendar?.days ? buildCalendarGrid() : [];

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="parent-warden-schedule-page">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-pastel-lavender/90 via-pastel-lilac/80 to-pastel-rose/90 text-slate-800 p-8 shadow-pastel-lg border border-white/40"
      >
        <div className="relative flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-white/50">
            <Shield size={28} className="text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold mb-1 font-heading">
              Jadual Guru Asrama
            </h1>
            <p className="text-slate-700/90 text-sm md:text-base">
              Kalendar bertugas warden / guru asrama – untuk rujukan ibu bapa
            </p>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex items-center justify-between bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-100 px-4 py-3 shadow-card-soft"
      >
        <button
          type="button"
          onClick={() => navigateMonth(-1)}
          className="p-2.5 hover:bg-pastel-lavender/40 rounded-xl transition-colors duration-200"
        >
          <ChevronLeft size={22} className="text-slate-600" />
        </button>
        <span className="text-lg font-bold text-slate-800 flex items-center gap-2 font-heading">
          <CalendarIcon size={20} className="text-violet-500" />
          {MONTHS_MY[currentMonth]} {currentYear}
        </span>
        <button
          type="button"
          onClick={() => navigateMonth(1)}
          className="p-2.5 hover:bg-pastel-lavender/40 rounded-xl transition-colors duration-200"
        >
          <ChevronRight size={22} className="text-slate-600" />
        </button>
      </motion.div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-10 h-10 border-4 border-pastel-lavender border-t-violet-500 rounded-full animate-spin" />
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Card className="overflow-hidden p-0 border-pastel-lavender/30">
            <div className="rounded-2xl overflow-hidden shadow-card-soft">
              <div className="grid grid-cols-7 bg-gradient-to-r from-pastel-lavender/30 to-pastel-sky/20 border-b border-slate-100">
                {DAYS_HEADER.map((d) => (
                  <div
                    key={d}
                    className="p-2 text-center text-xs font-semibold text-slate-600"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 auto-rows-fr" style={{ minHeight: 0 }}>
                {calendarGrid.map((cell, idx) => {
                  const isToday = cell.dateStr === today;
                  const wardensDay = cell.dayData?.wardens || [];
                  const outingType = cell.dayData?.outing_type;
                  const eventNote = cell.dayData?.event_note;
                  return (
                    <div
                      key={idx}
                      className={`min-h-[88px] border-b border-r border-slate-100 p-2 flex flex-col transition-colors ${
                        !cell.isCurrentMonth ? 'bg-slate-50/60 text-slate-400' : 'bg-white/50'
                      } ${isToday ? 'bg-pastel-lavender/40 ring-2 ring-inset ring-violet-400' : ''}`}
                    >
                      <div className="flex justify-end items-start mb-1">
                        <span
                          className={`text-sm font-medium ${
                            isToday
                              ? 'text-violet-700'
                              : cell.isCurrentMonth
                              ? 'text-slate-700'
                              : 'text-slate-400'
                          }`}
                        >
                          {cell.dayNum}
                        </span>
                        {isToday && (
                          <span className="ml-1 text-[10px] bg-violet-500 text-white px-1.5 py-0.5 rounded-lg">
                            Hari Ini
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-h-0 overflow-hidden space-y-0.5">
                        {wardensDay.length > 0 ? (
                          wardensDay.map((w, i) => (
                            <div
                              key={i}
                              className="text-xs bg-pastel-lavender/50 text-violet-700 px-1.5 py-0.5 rounded-lg truncate"
                              title={w.warden_name + (w.warden_phone ? ` – ${w.warden_phone}` : '')}
                            >
                              {w.warden_name}
                            </div>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400 italic">–</span>
                        )}
                        {outingType && (
                          <div className="text-[10px] font-medium text-slate-600 mt-0.5">
                            ({outingType.toUpperCase()})
                          </div>
                        )}
                        {eventNote && (
                          <div
                            className="text-[10px] text-rose-600 mt-0.5 truncate"
                            title={eventNote}
                          >
                            {eventNote}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="text-sm text-slate-500 p-4 border-t border-slate-100 text-center bg-slate-50/50">
              Paparan read-only. Untuk kemaskini jadual, sila hubungi Unit Asrama.
            </p>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
