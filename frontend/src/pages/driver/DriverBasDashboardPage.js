import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bus, Users, MapPin, Calendar, ChevronRight, AlertCircle } from 'lucide-react';
import api from '../../services/api';

export default function DriverBasDashboardPage() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/bus/driver/trips')
      .then((res) => setTrips(res.data || []))
      .catch((err) => {
        setError(err.response?.data?.detail || 'Gagal memuatkan trip');
        setTrips([]);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Driver Bas — Dashboard</h1>
        <p className="text-slate-600 mt-1">Trip anda hari ini dan akan datang. Pilih trip untuk lihat senarai pelajar dan kongsi lokasi.</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
          <AlertCircle size={20} />
          <span>{error}</span>
          {error.includes('assigned') && (
            <span className="text-sm">Sila hubungi Admin Bas untuk ditugaskan ke bas.</span>
          )}
        </div>
      )}

      {trips.length === 0 && !error && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Bus className="mx-auto text-slate-300 mb-4" size={48} />
          <p className="text-slate-600">Tiada trip untuk bas anda pada masa ini.</p>
        </div>
      )}

      <div className="grid gap-4">
        {trips.map((trip) => (
          <button
            key={trip.id}
            type="button"
            onClick={() => navigate(`/driver-bas/trip/${trip.id}`)}
            className="w-full text-left bg-white rounded-2xl border border-slate-200 p-5 min-h-[44px] hover:border-cyan-300 hover:shadow-md transition-all flex items-center gap-4"
          >
            <div className="w-14 h-14 rounded-xl bg-cyan-100 flex items-center justify-center flex-shrink-0">
              <Bus className="text-cyan-600" size={28} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-900">{trip.route_name}</p>
              <p className="text-sm text-slate-500">{trip.origin} → {trip.destination}</p>
              <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-600">
                <span className="flex items-center gap-1"><Calendar size={14} /> {trip.departure_date} {trip.departure_time}</span>
                <span className="flex items-center gap-1"><Users size={14} /> {trip.booked_seats} / {trip.total_seats} pelajar</span>
                <span className="px-2 py-0.5 rounded-full bg-slate-100">{trip.bus_plate}</span>
              </div>
            </div>
            <ChevronRight className="text-slate-400 flex-shrink-0" size={24} />
          </button>
        ))}
      </div>
    </div>
  );
}
