import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Package, CheckCircle, XCircle, Clock, Eye, Search,
  ArrowLeft, AlertCircle, ImageIcon, Tag, X
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../../../services/api';

const statusColors = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700'
};

const statusLabels = {
  pending: 'Menunggu',
  approved: 'Diluluskan',
  rejected: 'Ditolak'
};

const ProductManagementPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalAction, setApprovalAction] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchProducts();
  }, [filterStatus]);

  useEffect(() => {
    const productId = searchParams.get('id');
    if (productId && products.length > 0) {
      const product = products.find(p => p.id === productId);
      if (product) {
        setSelectedProduct(product);
        setShowDetailModal(true);
      }
    }
  }, [searchParams, products]);

  const fetchProducts = async () => {
    try {
      const params = filterStatus !== 'all' ? { status: filterStatus } : {};
      const res = await api.get('/api/marketplace/products', { params });
      setProducts(res.data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('Gagal memuatkan senarai produk');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = (product) => {
    setSelectedProduct(product);
    setApprovalAction('approved');
    setRejectionReason('');
    setShowApprovalModal(true);
  };

  const handleReject = (product) => {
    setSelectedProduct(product);
    setApprovalAction('rejected');
    setRejectionReason('');
    setShowApprovalModal(true);
  };

  const submitApproval = async () => {
    if (approvalAction === 'rejected' && !rejectionReason.trim()) {
      toast.error('Sila nyatakan sebab penolakan');
      return;
    }

    try {
      await api.put(`/api/marketplace/products/${selectedProduct.id}/approve`, {
        status: approvalAction,
        rejection_reason: approvalAction === 'rejected' ? rejectionReason : null
      });
      toast.success(`Produk berjaya di${approvalAction === 'approved' ? 'luluskan' : 'tolak'}`);
      setShowApprovalModal(false);
      setShowDetailModal(false);
      fetchProducts();
    } catch (error) {
      console.error('Error updating product:', error);
      toast.error('Gagal mengemaskini status produk');
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('ms-MY', { style: 'currency', currency: 'MYR' }).format(amount);
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.vendor_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 min-w-0 overflow-x-hidden" data-testid="product-management-page">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate('/admin/marketplace')}
          className="p-2 hover:bg-gray-100 rounded-lg transition"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="h-6 w-6 text-blue-600" />
            Pengurusan Produk
          </h1>
          <p className="text-gray-500">Luluskan dan semak produk marketplace</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Cari produk..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select 
            value={filterStatus} 
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Semua Status</option>
            <option value="pending">Menunggu</option>
            <option value="approved">Diluluskan</option>
            <option value="rejected">Ditolak</option>
          </select>
        </div>
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProducts.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-500">
            <Package className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p>Tiada produk dijumpai</p>
          </div>
        ) : (
          filteredProducts.map((product) => (
            <div 
              key={product.id} 
              className="bg-white rounded-xl border overflow-hidden hover:shadow-lg transition-shadow"
              data-testid={`product-card-${product.id}`}
            >
              <div className="aspect-video bg-gray-100 relative">
                {product.images && product.images.length > 0 ? (
                  <img 
                    src={product.images[0]} 
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="h-12 w-12 text-gray-300" />
                  </div>
                )}
                <span className={`absolute top-2 right-2 px-2 py-1 rounded text-xs ${statusColors[product.approval_status]}`}>
                  {statusLabels[product.approval_status]}
                </span>
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-gray-900 line-clamp-1">{product.name}</h3>
                <p className="text-sm text-gray-500 mt-1">{product.vendor_name}</p>
                <div className="flex items-center justify-between mt-3">
                  <p className="font-bold text-blue-600">{formatCurrency(product.price)}</p>
                  <span className="px-2 py-0.5 bg-gray-100 rounded text-xs capitalize flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    {product.category}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
                  <span>Stok: {product.stock}</span>
                  <span>Jualan: {product.sales_count}</span>
                </div>
                <div className="flex gap-2 mt-4">
                  <button 
                    onClick={() => {
                      setSelectedProduct(product);
                      setShowDetailModal(true);
                    }}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm flex items-center justify-center gap-1 hover:bg-gray-50"
                  >
                    <Eye className="h-4 w-4" /> Lihat
                  </button>
                  {product.approval_status === 'pending' && (
                    <>
                      <button 
                        onClick={() => handleApprove(product)}
                        className="p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                      >
                        <CheckCircle className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => handleReject(product)}
                        className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto min-h-[100dvh] min-h-screen">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0">
            <div className="p-6 border-b flex items-center justify-between shrink-0">
              <h2 className="text-xl font-semibold flex items-center gap-2 min-w-0 truncate pr-2">
                <Package className="h-5 w-5 text-blue-600 flex-shrink-0" />
                <span className="truncate">Maklumat Produk</span>
              </h2>
              <button onClick={() => setShowDetailModal(false)} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-gray-100 rounded-lg flex-shrink-0" aria-label="Tutup">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-semibold">{selectedProduct.name}</h3>
                  <p className="text-gray-500">{selectedProduct.vendor_name}</p>
                </div>
                <span className={`px-3 py-1 rounded ${statusColors[selectedProduct.approval_status]}`}>
                  {statusLabels[selectedProduct.approval_status]}
                </span>
              </div>

              {/* Product Images */}
              {selectedProduct.images && selectedProduct.images.length > 0 && (
                <div className="flex gap-2 overflow-x-auto py-2">
                  {selectedProduct.images.map((img, idx) => (
                    <img 
                      key={idx}
                      src={img}
                      alt={`${selectedProduct.name} ${idx + 1}`}
                      className="w-24 h-24 object-cover rounded-lg border"
                    />
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Harga</p>
                  <p className="font-bold text-lg text-blue-600">{formatCurrency(selectedProduct.price)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Stok</p>
                  <p className="font-medium">{selectedProduct.stock} unit</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Kategori</p>
                  <span className="inline-block px-2 py-1 bg-gray-100 rounded text-sm capitalize mt-1">
                    {selectedProduct.category}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Jualan</p>
                  <p className="font-medium">{selectedProduct.sales_count} unit</p>
                </div>
              </div>

              {selectedProduct.description && (
                <div>
                  <p className="text-sm text-gray-500">Penerangan</p>
                  <p className="mt-1">{selectedProduct.description}</p>
                </div>
              )}

              {selectedProduct.rejection_reason && (
                <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                  <p className="text-sm text-red-600 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Sebab Penolakan:
                  </p>
                  <p className="mt-1 text-red-700">{selectedProduct.rejection_reason}</p>
                </div>
              )}
            </div>

            {selectedProduct.approval_status === 'pending' && (
              <div className="p-6 border-t flex justify-end gap-3">
                <button 
                  onClick={() => {
                    setShowDetailModal(false);
                    handleReject(selectedProduct);
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
                >
                  <XCircle className="h-4 w-4" />
                  Tolak
                </button>
                <button 
                  onClick={() => {
                    setShowDetailModal(false);
                    handleApprove(selectedProduct);
                  }}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2"
                >
                  <CheckCircle className="h-4 w-4" />
                  Luluskan
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Approval Modal */}
      {showApprovalModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto min-h-[100dvh] min-h-screen">
          <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0">
            <div className="p-6 border-b shrink-0">
              <h2 className="text-xl font-semibold">
                {approvalAction === 'approved' ? 'Luluskan Produk' : 'Tolak Produk'}
              </h2>
              <p className="text-gray-500 mt-1">
                {approvalAction === 'approved' 
                  ? `Adakah anda pasti mahu meluluskan produk "${selectedProduct?.name}"?`
                  : `Sila nyatakan sebab penolakan untuk produk "${selectedProduct?.name}".`
                }
              </p>
            </div>
            
            <div className="p-6">
              {approvalAction === 'rejected' && (
                <textarea
                  placeholder="Sebab penolakan..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={3}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>

            <div className="p-6 border-t flex justify-end gap-3">
              <button 
                onClick={() => setShowApprovalModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Batal
              </button>
              <button 
                onClick={submitApproval}
                className={`px-4 py-2 text-white rounded-lg ${
                  approvalAction === 'approved' 
                    ? 'bg-emerald-600 hover:bg-emerald-700' 
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {approvalAction === 'approved' ? 'Luluskan' : 'Tolak'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductManagementPage;
