import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Package, Plus, Search, Edit, Trash2, ArrowLeft, AlertCircle, Image as ImageIcon
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../../services/api';

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

const VendorProductsPage = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteProduct, setDeleteProduct] = useState(null);

  useEffect(() => {
    fetchProducts();
  }, [filterStatus]);

  const fetchProducts = async () => {
    try {
      const params = filterStatus !== 'all' ? { status: filterStatus } : {};
      const res = await api.get('/api/marketplace/products/my-products', { params });
      setProducts(res.data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('Gagal memuatkan senarai produk');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (productId) => {
    try {
      await api.delete(`/api/marketplace/products/${productId}`);
      toast.success('Produk berjaya dipadam');
      setDeleteProduct(null);
      fetchProducts();
    } catch (error) {
      console.error('Error deleting product:', error);
      toast.error('Gagal memadam produk');
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('ms-MY', { style: 'currency', currency: 'MYR' }).format(amount);
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 min-w-0 overflow-x-hidden" data-testid="vendor-products-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/vendor')}
            className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-gray-100 rounded-lg transition"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Package className="h-6 w-6 text-violet-600" />
              Produk Saya
            </h1>
            <p className="text-gray-500">Urus produk yang anda jual</p>
          </div>
        </div>
        <button 
          onClick={() => navigate('/vendor/products/new')}
          className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition flex items-center gap-2"
        >
          <Plus className="h-5 w-5" />
          Tambah Produk
        </button>
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
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
          <select 
            value={filterStatus} 
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
          >
            <option value="all">Semua Status</option>
            <option value="pending">Menunggu</option>
            <option value="approved">Diluluskan</option>
            <option value="rejected">Ditolak</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{products.length}</p>
          <p className="text-sm text-gray-500">Jumlah Produk</p>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">
            {products.filter(p => p.approval_status === 'approved').length}
          </p>
          <p className="text-sm text-gray-500">Diluluskan</p>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">
            {products.filter(p => p.approval_status === 'pending').length}
          </p>
          <p className="text-sm text-gray-500">Menunggu</p>
        </div>
      </div>

      {/* Products Grid */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-12">
            <Package className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 mb-4">Tiada produk dijumpai</p>
            <button 
              onClick={() => navigate('/vendor/products/new')}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition flex items-center gap-2 mx-auto"
            >
              <Plus className="h-5 w-5" />
              Tambah Produk Pertama
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {filteredProducts.map((product) => (
              <div 
                key={product.id} 
                className="border rounded-xl overflow-hidden hover:shadow-lg transition-shadow"
                data-testid={`product-card-${product.id}`}
              >
                {/* Product Image */}
                <div className="h-40 bg-gray-100 flex items-center justify-center relative">
                  {product.images?.length > 0 ? (
                    <img 
                      src={product.images[0]} 
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="h-12 w-12 text-gray-300" />
                  )}
                  <span className={`absolute top-2 right-2 px-2 py-0.5 rounded text-xs font-medium ${
                    statusColors[product.approval_status]
                  }`}>
                    {statusLabels[product.approval_status]}
                  </span>
                </div>

                {/* Product Info */}
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 truncate">{product.name}</h3>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span className="capitalize">{product.category}</span>
                    {product.product_type === 'variable' && (
                      <span className="px-1.5 py-0.5 bg-pastel-mint text-teal-700 text-xs rounded">
                        {product.variants?.length || 0} Varian
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-lg font-bold text-violet-600">{formatCurrency(product.price)}</p>
                    <p className="text-sm text-gray-500">Stok: {product.stock}</p>
                  </div>
                  
                  {/* Rejection Reason */}
                  {product.approval_status === 'rejected' && product.rejection_reason && (
                    <div className="mt-2 p-2 bg-red-50 rounded text-xs text-red-600 flex items-start gap-1">
                      <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      <span>{product.rejection_reason}</span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t">
                    <button
                      onClick={() => navigate(`/vendor/products/${product.id}/edit`)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition flex items-center justify-center gap-1 text-sm"
                    >
                      <Edit className="h-4 w-4" />
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteProduct(product)}
                      className="px-3 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto min-h-[100dvh] min-h-screen">
          <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0 p-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="h-8 w-8 text-red-600" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Padam Produk?</h2>
              <p className="text-gray-500 mb-6">
                Adakah anda pasti mahu memadam "{deleteProduct.name}"? 
                Tindakan ini tidak boleh dibatalkan.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeleteProduct(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  Batal
                </button>
                <button 
                  onClick={() => handleDelete(deleteProduct.id)}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                >
                  Ya, Padam
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorProductsPage;
