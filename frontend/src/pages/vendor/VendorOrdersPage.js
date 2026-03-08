import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ShoppingCart, ArrowLeft, Search, Package, User,
  Clock, CheckCircle, Truck, Home, XCircle, MapPin
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../../services/api';

const statusConfig = {
  pending_payment: { label: 'Menunggu Bayaran', color: 'bg-gray-100 text-gray-700', icon: Clock },
  paid: { label: 'Dibayar', color: 'bg-blue-100 text-blue-700', icon: CheckCircle },
  preparing: { label: 'Sedang Disediakan', color: 'bg-amber-100 text-amber-700', icon: Package },
  out_for_delivery: { label: 'Dalam Penghantaran', color: 'bg-pastel-lavender text-violet-700', icon: Truck },
  arrived_hostel: { label: 'Sampai Asrama', color: 'bg-pastel-mint text-teal-700', icon: Home },
  delivered: { label: 'Dihantar', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  failed: { label: 'Gagal', color: 'bg-red-100 text-red-700', icon: XCircle },
  cancelled: { label: 'Dibatalkan', color: 'bg-gray-100 text-gray-600', icon: XCircle }
};

const VendorOrdersPage = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [, setVendor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchData();
  }, [filterStatus]);

  const fetchData = async () => {
    try {
      // Get vendor profile first
      const vendorRes = await api.get('/api/marketplace/vendors/my-vendor');
      const vendorData = vendorRes.data?.vendor;
      setVendor(vendorData);

      if (vendorData?.id) {
        const params = { vendor_id: vendorData.id };
        if (filterStatus !== 'all') {
          params.status = filterStatus;
        }
        const ordersRes = await api.get('/api/marketplace/orders', { params });
        setOrders(ordersRes.data || []);
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error('Gagal memuatkan pesanan');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (orderId, newStatus) => {
    setUpdating(true);
    try {
      await api.put(`/api/marketplace/orders/${orderId}/status`, {
        status: newStatus
      });
      toast.success('Status pesanan dikemaskini');
      fetchData();
      setSelectedOrder(null);
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error(error.response?.data?.detail || 'Gagal mengemaskini status');
    } finally {
      setUpdating(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('ms-MY', { style: 'currency', currency: 'MYR' }).format(amount);
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('ms-MY', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredOrders = orders.filter(o => 
    o.order_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    o.student_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getNextStatus = (currentStatus) => {
    const transitions = {
      paid: 'preparing',
      preparing: 'out_for_delivery',
      out_for_delivery: 'arrived_hostel',
      arrived_hostel: 'delivered'
    };
    return transitions[currentStatus];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 min-w-0 overflow-x-hidden" data-testid="vendor-orders-page">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate('/vendor')}
          className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-gray-100 rounded-lg transition"
          aria-label="Kembali"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-teal-600" />
            Pesanan Saya
          </h1>
          <p className="text-gray-500">Urus pesanan dari pelanggan</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Cari pesanan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <select 
            value={filterStatus} 
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
          >
            <option value="all">Semua Status</option>
            <option value="paid">Dibayar</option>
            <option value="preparing">Sedang Disediakan</option>
            <option value="out_for_delivery">Dalam Penghantaran</option>
            <option value="arrived_hostel">Sampai Asrama</option>
            <option value="delivered">Dihantar</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{orders.length}</p>
          <p className="text-sm text-gray-500">Jumlah Pesanan</p>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">
            {orders.filter(o => ['paid', 'preparing'].includes(o.status)).length}
          </p>
          <p className="text-sm text-gray-500">Perlu Tindakan</p>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-2xl font-bold text-teal-600">
            {orders.filter(o => ['out_for_delivery', 'arrived_hostel'].includes(o.status)).length}
          </p>
          <p className="text-sm text-gray-500">Dalam Penghantaran</p>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">
            {orders.filter(o => o.status === 'delivered').length}
          </p>
          <p className="text-sm text-gray-500">Selesai</p>
        </div>
      </div>

      {/* Orders List */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="p-4 border-b">
          <h3 className="font-semibold">Senarai Pesanan ({filteredOrders.length})</h3>
        </div>
        
        {filteredOrders.length === 0 ? (
          <div className="text-center py-12">
            <ShoppingCart className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">Tiada pesanan dijumpai</p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredOrders.map((order) => {
              const statusInfo = statusConfig[order.status] || statusConfig.pending_payment;
              const StatusIcon = statusInfo.icon;
              
              return (
                <div 
                  key={order.id} 
                  className="p-4 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedOrder(order)}
                  data-testid={`order-row-${order.id}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-pastel-lavender rounded-lg flex items-center justify-center">
                        <ShoppingCart className="h-6 w-6 text-teal-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{order.order_number}</h3>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <User className="h-4 w-4" />
                          {order.student_name}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                          <MapPin className="h-4 w-4" />
                          {order.student_block} - Bilik/Katil {order.student_room}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">{formatDate(order.created_at)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg text-gray-900">{formatCurrency(order.total_amount)}</p>
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-sm ${statusInfo.color}`}>
                        <StatusIcon className="h-3 w-3" />
                        {statusInfo.label}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto min-h-[100dvh] min-h-screen">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0">
            <div className="p-6 border-b sticky top-0 bg-white shrink-0">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Pesanan {selectedOrder.order_number}</h2>
                <button 
                  onClick={() => setSelectedOrder(null)}
                  className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-gray-100 rounded-lg"
                  aria-label="Tutup"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Status */}
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
                  statusConfig[selectedOrder.status]?.color
                }`}>
                  {React.createElement(statusConfig[selectedOrder.status]?.icon || Clock, { className: "h-4 w-4" })}
                  {statusConfig[selectedOrder.status]?.label}
                </span>
                <p className="text-sm text-gray-500">{formatDate(selectedOrder.created_at)}</p>
              </div>

              {/* Customer Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                  <User className="h-5 w-5 text-gray-600" />
                  Maklumat Pelajar
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Nama</p>
                    <p className="font-medium">{selectedOrder.student_name}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">No. Matrik</p>
                    <p className="font-medium">{selectedOrder.student_matric}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Lokasi</p>
                    <p className="font-medium">{selectedOrder.student_block} - Bilik/Katil {selectedOrder.student_room}</p>
                  </div>
                </div>
              </div>

              {/* Order Items */}
              <div>
                <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                  <Package className="h-5 w-5 text-gray-600" />
                  Item Pesanan ({selectedOrder.items_count})
                </h4>
                <p className="text-sm text-gray-500 mb-2">
                  Jumlah: {formatCurrency(selectedOrder.total_amount)}
                </p>
              </div>

              {/* Action Buttons */}
              {getNextStatus(selectedOrder.status) && (
                <div className="pt-4 border-t">
                  <button
                    onClick={() => handleUpdateStatus(selectedOrder.id, getNextStatus(selectedOrder.status))}
                    disabled={updating}
                    className="w-full px-4 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {updating ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Mengemaskini...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-5 w-5" />
                        Tukar ke: {statusConfig[getNextStatus(selectedOrder.status)]?.label}
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Mark as Failed */}
              {['paid', 'preparing', 'out_for_delivery', 'arrived_hostel'].includes(selectedOrder.status) && (
                <button
                  onClick={() => handleUpdateStatus(selectedOrder.id, 'failed')}
                  disabled={updating}
                  className="w-full px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition"
                >
                  Tandakan Gagal
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorOrdersPage;
