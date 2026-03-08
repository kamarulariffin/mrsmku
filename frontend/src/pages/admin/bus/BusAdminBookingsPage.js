import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Ticket } from 'lucide-react';
import api from '../../../services/api';
import { Spinner, Button, Badge } from './BusAdminShared';

export default function BusAdminBookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchBookings = () => {
    setLoading(true);
    api.get('/api/bus/bookings')
      .then((res) => setBookings(res.data))
      .catch(() => toast.error('Gagal memuatkan tempahan'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const handleAssignSeat = (bookingId, seatNumber) => {
    if (!seatNumber?.trim()) {
      toast.error('Sila masukkan nombor tempat duduk');
      return;
    }
    api.post(`/api/bus/bookings/${bookingId}/assign-seat?seat_number=${seatNumber.trim()}`)
      .then(() => {
        toast.success(`Tempat duduk ${seatNumber} berjaya diberikan`);
        fetchBookings();
      })
      .catch((err) => toast.error(err.response?.data?.detail || 'Gagal memberikan tempat duduk'));
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Tempahan</h1>
        <p className="text-slate-600 mt-1">Lihat dan urus tempahan tiket bas; berikan tempat duduk jika perlu</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
        {bookings.map((booking) => (
          <div key={booking.id} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-cyan-100 rounded-full flex items-center justify-center">
                  <Ticket className="text-cyan-600" size={20} />
                </div>
                <div>
                  <p className="font-bold text-slate-900">{booking.booking_number}</p>
                  <p className="text-sm text-slate-500">{booking.student_name} • {booking.student_matric}</p>
                </div>
              </div>
              <Badge status={booking.status === 'assigned' ? 'approved' : booking.status === 'cancelled' ? 'rejected' : 'pending'}>
                {booking.status === 'pending' ? 'Menunggu' : booking.status === 'assigned' ? 'Tempat Diberikan' : booking.status}
              </Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-slate-500">Route</p>
                <p className="font-medium">{booking.route_name}</p>
              </div>
              <div>
                <p className="text-slate-500">Lokasi Turun</p>
                <p className="font-medium">{booking.drop_off_point}</p>
              </div>
              <div>
                <p className="text-slate-500">Tarikh</p>
                <p className="font-medium">{booking.departure_date ? new Date(booking.departure_date).toLocaleDateString('ms-MY') : '-'}</p>
              </div>
              <div>
                <p className="text-slate-500">Harga</p>
                <p className="font-bold text-cyan-600">RM {booking.drop_off_price?.toFixed(2) ?? '0.00'}</p>
              </div>
            </div>
            {booking.status === 'pending' && (
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Contoh: 1A"
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm w-24"
                  id={`seat-${booking.id}`}
                  onKeyDown={(e) => e.key === 'Enter' && handleAssignSeat(booking.id, e.target.value)}
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    const seat = document.getElementById(`seat-${booking.id}`)?.value;
                    handleAssignSeat(booking.id, seat);
                  }}
                >
                  Berikan Tempat
                </Button>
              </div>
            )}
            {booking.assigned_seat && (
              <p className="mt-3 text-sm font-medium text-emerald-600">Tempat Duduk: {booking.assigned_seat}</p>
            )}
          </div>
        ))}
        {bookings.length === 0 && (
          <div className="p-12 text-center">
            <Ticket className="mx-auto text-slate-300 mb-4" size={48} />
            <p className="text-slate-500">Tiada tempahan</p>
          </div>
        )}
      </div>
    </div>
  );
}
