/**
 * Kalendar PBW/PBP – papar jadual asrama mengikut bulan.
 * Boleh skrol kiri/kanan antara bulan; tarikh dalam tempoh PBW/PBP diserlahkan dan boleh diklik untuk isi borang.
 */
import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

const MONTH_NAMES = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];
const WEEKDAYS = ['Ahd', 'Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab']; // Ahad = 0

function getMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startOffset = first.getDay();
  const daysInMonth = last.getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push(dateStr);
  }
  return cells;
}

function getPeriodForDate(dateStr, periods) {
  if (!periods?.length) return null;
  for (const p of periods) {
    if (dateStr >= p.start_date && dateStr <= p.end_date) return p;
  }
  return null;
}

/** Format YYYY-MM-DD to dd-mm-yyyy (Malaysia). */
function formatDateDMY(dateStr) {
  if (!dateStr) return '';
  const s = String(dateStr).trim().slice(0, 10);
  const parts = s.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    const [y, m, d] = parts;
    return `${d}-${m}-${y}`;
  }
  return s;
}

export function PbwPbpCalendar({ periods = [], onSelectDate, className = '', selectedDateKeluar = null, selectedDatePulang = null }) {
  const [pickMode, setPickMode] = useState('keluar');
  const [scrollEl, setScrollEl] = useState(null);
  const keluarDate = selectedDateKeluar ? String(selectedDateKeluar).slice(0, 10) : null;
  const pulangDate = selectedDatePulang ? String(selectedDatePulang).slice(0, 10) : null;

  const year = useMemo(() => {
    const y = new Date().getFullYear();
    if (periods.length) {
      const min = Math.min(...periods.map((p) => parseInt(p.start_date.slice(0, 4), 10)));
      const max = Math.max(...periods.map((p) => parseInt(p.end_date.slice(0, 4), 10)));
      return { min: Math.min(min, y), max: Math.max(max, y) };
    }
    return { min: y, max: y };
  }, [periods]);

  const months = useMemo(() => {
    const list = [];
    for (let y = year.min; y <= year.max; y++) {
      for (let m = 0; m < 12; m++) list.push({ year: y, month: m });
    }
    return list;
  }, [year.min, year.max]);

  const handleDateClick = (dateStr) => {
    if (!onSelectDate || !dateStr) return;
    onSelectDate(pickMode, dateStr);
  };

  const scroll = (dir) => {
    if (!scrollEl) return;
    const step = 280;
    scrollEl.scrollBy({ left: dir * step, behavior: 'smooth' });
  };

  return (
    <div className={className}>
      <div className="flex flex-col w-full gap-4 mb-3">
        <div className="flex items-center justify-center gap-2 text-slate-700">
          <CalendarIcon size={20} className="text-slate-500" />
          <span className="font-semibold text-slate-800">Jadual asrama (PBW/PBP)</span>
        </div>
        <div className="w-full flex flex-col items-center justify-center gap-2">
          <span className="text-base font-semibold text-slate-700">Klik pada tarikh untuk isi:</span>
          <div className="flex rounded-xl border-2 border-slate-200 overflow-hidden shadow-sm justify-center">
            <button
              type="button"
              onClick={() => setPickMode('keluar')}
              className={`min-h-[44px] min-w-[120px] px-4 py-2.5 text-sm font-medium transition-colors ${pickMode === 'keluar' ? 'bg-red-500 text-white border-red-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'} ${keluarDate ? 'ring-2 ring-red-400 ring-offset-1' : ''}`}
            >
              Tarikh Keluar
              {keluarDate && <span className="block text-xs opacity-90 mt-0.5">{formatDateDMY(keluarDate)}</span>}
            </button>
            <button
              type="button"
              onClick={() => setPickMode('pulang')}
              className={`min-h-[44px] min-w-[120px] px-4 py-2.5 text-sm font-medium transition-colors ${pickMode === 'pulang' ? 'bg-red-500 text-white border-red-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'} ${pulangDate ? 'ring-2 ring-red-400 ring-offset-1' : ''}`}
            >
              Tarikh Pulang
              {pulangDate && <span className="block text-xs opacity-90 mt-0.5">{formatDateDMY(pulangDate)}</span>}
            </button>
          </div>
        </div>
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => scroll(-1)}
          aria-label="Bulan sebelumnya"
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white border-2 border-slate-200 shadow flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:border-slate-300"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          type="button"
          onClick={() => scroll(1)}
          aria-label="Bulan seterusnya"
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white border-2 border-slate-200 shadow flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:border-slate-300"
        >
          <ChevronRight size={20} />
        </button>

        <div
          ref={setScrollEl}
          className="flex gap-4 overflow-x-auto overflow-y-hidden pb-2 snap-x snap-mandatory scroll-smooth hide-scrollbar"
          style={{ scrollPaddingLeft: '16px' }}
        >
          {months.map(({ year: y, month: m }) => {
            const grid = getMonthGrid(y, m);
            return (
              <div
                key={`${y}-${m}`}
                className="flex-shrink-0 w-[260px] snap-center rounded-xl border-2 border-slate-200 bg-white p-3 shadow-sm"
              >
                <p className="text-center font-bold text-slate-800 mb-2">
                  {MONTH_NAMES[m]} {y}
                </p>
                <div className="grid grid-cols-7 gap-0.5 text-center">
                  {WEEKDAYS.map((wd) => (
                    <div key={wd} className="py-1 text-xs font-semibold text-slate-500">
                      {wd}
                    </div>
                  ))}
                  {grid.map((dateStr, idx) => {
                    const period = dateStr ? getPeriodForDate(dateStr, periods) : null;
                    const isPbw = period?.type === 'pbw';
                    const isPbp = period?.type === 'pbp';
                    const isSelectedKeluar = dateStr === keluarDate;
                    const isSelectedPulang = dateStr === pulangDate;
                    const isSelected = isSelectedKeluar || isSelectedPulang;
                    return (
                      <div key={idx} className="min-h-[32px] flex items-center justify-center">
                        {dateStr ? (
                          <button
                            type="button"
                            onClick={() => handleDateClick(dateStr)}
                            className={`w-8 h-8 rounded-lg text-sm font-medium transition-all min-w-[32px] min-h-[32px] ${
                              isSelected
                                ? 'bg-red-500 text-white border-2 border-red-600 shadow-md ring-2 ring-red-300 ring-offset-1'
                                : isPbw
                                ? 'bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200'
                                : isPbp
                                ? 'bg-teal-100 text-teal-800 border border-teal-300 hover:bg-teal-200'
                                : 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-red-50 hover:border-red-300'
                            }`}
                            title={period ? `${period.label} (${formatDateDMY(period.start_date)} – ${formatDateDMY(period.end_date)})` : formatDateDMY(dateStr)}
                          >
                            {parseInt(dateStr.slice(8), 10)}
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {(periods.filter((p) => {
                  const lastDay = new Date(y, m + 1, 0);
                  const firstDay = `${y}-${String(m + 1).padStart(2, '0')}-01`;
                  const lastDayStr = lastDay.toISOString().slice(0, 10);
                  return p.start_date <= lastDayStr && p.end_date >= firstDay;
                }).length > 0) && (
                  <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap gap-1">
                    {periods
                      .filter((p) => {
                        const lastDay = new Date(y, m + 1, 0);
                        const firstDay = `${y}-${String(m + 1).padStart(2, '0')}-01`;
                        const lastDayStr = lastDay.toISOString().slice(0, 10);
                        return p.start_date <= lastDayStr && p.end_date >= firstDay;
                      })
                      .map((p) => (
                        <span
                          key={p.id || p.start_date + p.end_date}
                          className={`text-xs px-1.5 py-0.5 rounded ${p.type === 'pbw' ? 'bg-amber-100 text-amber-800' : 'bg-teal-100 text-teal-800'}`}
                        >
                          {p.label}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-200 flex flex-wrap justify-center gap-4 sm:gap-6 text-xs text-slate-600">
        <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-amber-100 border border-amber-300" /> <strong>PBW</strong> = Pulang Bermalam Wajib</span>
        <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-teal-100 border border-teal-300" /> <strong>PBP</strong> = Pulang Bermalam Pilihan</span>
      </div>
      <style>{`.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; } .hide-scrollbar::-webkit-scrollbar { display: none; }`}</style>
    </div>
  );
}

export default PbwPbpCalendar;
