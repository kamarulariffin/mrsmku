import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ShoppingBag, ChevronRight } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../App';
import { Spinner } from '../../components/common';

export const KoperasiOrdersPage = () => {
  const authContext = useAuth();
  const user = authContext?.user;
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const res = await api.get('/api/koperasi/orders');
      setOrders(res.data);
    } catch (err) {
      toast.error('Gagal memuatkan pesanan');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-amber-100 text-amber-700',
      paid: 'bg-blue-100 text-blue-700',
      processing: 'bg-pastel-lavender text-violet-700',
      ready: 'bg-emerald-100 text-emerald-700',
      collected: 'bg-slate-100 text-slate-700',
      cancelled: 'bg-red-100 text-red-700'
    };
    const labels = {
      pending: 'Menunggu Bayaran',
      paid: 'Dibayar',
      processing: 'Diproses',
      ready: 'Sedia Diambil',
      collected: 'Selesai',
      cancelled: 'Dibatalkan'
    };
    return <span className={`px-3 py-1 rounded-full text-xs font-semibold ${styles[status] || 'bg-slate-100'}`}>{labels[status] || status}</span>;
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-lime-50 via-green-50 to-emerald-50 min-w-0 overflow-x-hidden" data-testid="koperasi-orders-page">
      <header className="bg-white/80 backdrop-blur-xl border-b border-lime-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/koperasi')} className="p-2 hover:bg-slate-100 rounded-lg">
              <ChevronRight size={20} className="rotate-180" />
            </button>
            <h1 className="font-bold text-slate-900">Pesanan Koperasi Saya</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {orders.length === 0 ? (
          <div className="text-center py-20">
            <ShoppingBag size={64} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500">Tiada pesanan</p>
            <button onClick={() => navigate('/koperasi')} className="mt-4 px-6 py-2 bg-lime-500 text-white rounded-xl font-medium">
              Mula Membeli
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map(order => (
              <div key={order.id} className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] p-6" data-testid={`order-${order.id}`}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="font-bold text-slate-900">{order.order_number}</p>
                    <p className="text-sm text-slate-500">{new Date(order.created_at).toLocaleDateString('ms-MY', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  </div>
                  {getStatusBadge(order.status)}
                </div>
                <div className="border-t pt-4">
                  <p className="text-sm text-slate-500 mb-2">Untuk: <span className="font-medium text-slate-700">{order.student_name}</span></p>
                  <div className="space-y-2">
                    {order.items?.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-slate-600">{item.product_name} {item.size && `(${item.size})`} x{item.quantity}</span>
                        <span className="font-medium">RM {(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border-t mt-4 pt-4 flex justify-between items-center">
                  <span className="text-slate-600">Jumlah</span>
                  <span className="text-xl font-bold text-lime-600">RM {order.total_amount?.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default KoperasiOrdersPage;
