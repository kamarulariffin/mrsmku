import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, X, Image as ImageIcon, Trash2, Star,
  Plus, ZoomIn, ChevronLeft, ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import api, { API_URL } from '../services/api';

/**
 * ProductImageUpload - Drag & Drop Image Upload Component
 * Features:
 * - Drag & drop support
 * - Max 10 images per product
 * - Max 3MB per file
 * - Auto compression
 * - Reorder images
 * - Set primary image
 * - Gallery with zoom
 */

export const ProductImageUpload = ({ 
  productId, 
  productType = 'koperasi',  // 'koperasi' or 'pum'
  existingImages = [], 
  onImagesChange,
  maxImages = 10,
  compact = false
}) => {
  const [images, setImages] = useState(existingImages || []);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [showZoom, setShowZoom] = useState(false);
  const fileInputRef = useRef(null);
  
  // Validate file
  const validateFile = (file) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const maxSize = 3 * 1024 * 1024; // 3MB
    
    if (!allowedTypes.includes(file.type)) {
      toast.error(`${file.name}: Hanya fail JPG, PNG, WEBP dibenarkan`);
      return false;
    }
    
    if (file.size > maxSize) {
      toast.error(`${file.name}: Melebihi had 3MB`);
      return false;
    }
    
    return true;
  };

  // Handle file upload
  const uploadFiles = async (files) => {
    const validFiles = Array.from(files).filter(validateFile);
    
    if (validFiles.length === 0) return;
    
    const remainingSlots = maxImages - images.length;
    if (validFiles.length > remainingSlots) {
      toast.error(`Hanya boleh muat naik ${remainingSlots} gambar lagi`);
      return;
    }
    
    setUploading(true);
    
    try {
      const formData = new FormData();
      validFiles.forEach(file => formData.append('files', file));
      formData.append('product_id', productId);
      formData.append('product_type', productType);
      
      const res = await api.post('/api/upload/product-images-bulk', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      if (res.data.uploaded && res.data.uploaded.length > 0) {
        const newImages = [...images, ...res.data.uploaded];
        setImages(newImages);
        onImagesChange?.(newImages);
        toast.success(`${res.data.uploaded.length} gambar berjaya dimuat naik`);
      }
      
      if (res.data.errors && res.data.errors.length > 0) {
        res.data.errors.forEach(err => toast.error(err));
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal memuat naik gambar');
    } finally {
      setUploading(false);
    }
  };

  // Handle drag events
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    uploadFiles(e.dataTransfer.files);
  }, [images.length]);

  // Handle file input
  const handleFileSelect = (e) => {
    uploadFiles(e.target.files);
    e.target.value = ''; // Reset input
  };

  // Delete image
  const deleteImage = async (imageId) => {
    try {
      await api.delete(`/api/upload/product-image/${productId}/${imageId}?product_type=${productType}`);
      const newImages = images.filter(img => img.id !== imageId);
      setImages(newImages);
      onImagesChange?.(newImages);
      toast.success('Gambar dipadam');
    } catch (err) {
      toast.error('Gagal memadam gambar');
    }
  };

  // Set primary image
  const setPrimaryImage = async (imageId) => {
    try {
      await api.put(`/api/upload/product-image/${productId}/set-primary/${imageId}?product_type=${productType}`);
      const reordered = [
        images.find(img => img.id === imageId),
        ...images.filter(img => img.id !== imageId)
      ];
      setImages(reordered);
      onImagesChange?.(reordered);
      toast.success('Gambar utama dikemaskini');
    } catch (err) {
      toast.error('Gagal menetapkan gambar utama');
    }
  };

  // Navigate zoom gallery
  const navigateZoom = (direction) => {
    const currentIndex = images.findIndex(img => img.id === selectedImage?.id);
    let newIndex;
    
    if (direction === 'next') {
      newIndex = currentIndex < images.length - 1 ? currentIndex + 1 : 0;
    } else {
      newIndex = currentIndex > 0 ? currentIndex - 1 : images.length - 1;
    }
    
    setSelectedImage(images[newIndex]);
  };

  const remainingSlots = maxImages - images.length;
  
  if (compact) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700">
            Gambar Produk ({images.length}/{maxImages})
          </span>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || remainingSlots <= 0}
            className="px-3 py-1.5 bg-pastel-lavender text-violet-700 text-sm font-medium rounded-lg hover:bg-pastel-lilac disabled:opacity-50"
          >
            <Plus size={14} className="inline mr-1" />
            Tambah
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
        
        {images.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {images.map((img, idx) => (
              <div key={img.id} className="relative flex-shrink-0 w-16 h-16 group">
                <img
                  src={`${API_URL}${img.url}`}
                  alt={`Product ${idx + 1}`}
                  className="w-full h-full object-cover rounded-lg border-2 border-slate-200"
                  onClick={() => { setSelectedImage(img); setShowZoom(true); }}
                />
                {idx === 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center">
                    <Star size={10} className="text-white" />
                  </span>
                )}
                <button
                  onClick={() => deleteImage(img.id)}
                  className="absolute -top-1 -left-1 w-5 h-5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="product-image-upload">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-slate-800">Gambar Produk</h4>
          <p className="text-sm text-slate-500">
            {images.length}/{maxImages} gambar • Max 3MB • JPG, PNG, WEBP
          </p>
        </div>
        {images.length > 0 && (
          <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-sm font-medium rounded-full">
            {remainingSlots} slot lagi
          </span>
        )}
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
          dragOver 
            ? 'border-teal-400 bg-pastel-mint/50' 
            : 'border-slate-200 hover:border-teal-300 hover:bg-pastel-mint/50'
        } ${uploading ? 'pointer-events-none opacity-50' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          data-testid="file-input"
        />
        
        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-teal-200 border-t-teal-500 rounded-full animate-spin"></div>
            <p className="text-teal-600 font-medium">Memuat naik gambar...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
              dragOver ? 'bg-teal-500' : 'bg-gradient-to-br from-pastel-lavender to-pastel-rose'
            }`}>
              <Upload size={28} className={dragOver ? 'text-white' : 'text-violet-500'} />
            </div>
            <div>
              <p className="text-slate-700 font-medium">
                {dragOver ? 'Lepaskan fail di sini' : 'Seret & lepas gambar di sini'}
              </p>
              <p className="text-slate-500 text-sm mt-1">
                atau klik untuk pilih fail
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Image Gallery */}
      {images.length > 0 && (
        <div className="grid grid-cols-5 gap-3">
          {images.map((img, idx) => (
            <motion.div
              key={img.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative group aspect-square rounded-xl overflow-hidden border-2 border-slate-200 hover:border-teal-300 transition"
            >
              <img
                src={`${API_URL}${img.url}`}
                alt={`Product ${idx + 1}`}
                className="w-full h-full object-cover"
              />
              
              {/* Primary Badge */}
              {idx === 0 && (
                <div className="absolute top-2 left-2 px-2 py-1 bg-amber-400 text-white text-xs font-bold rounded-full flex items-center gap-1">
                  <Star size={10} />
                  Utama
                </div>
              )}
              
              {/* Hover Overlay */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                <button
                  onClick={() => { setSelectedImage(img); setShowZoom(true); }}
                  className="p-2 bg-white/90 rounded-lg hover:bg-white transition"
                  title="Zum"
                >
                  <ZoomIn size={18} className="text-slate-700" />
                </button>
                {idx !== 0 && (
                  <button
                    onClick={() => setPrimaryImage(img.id)}
                    className="p-2 bg-amber-400 rounded-lg hover:bg-amber-500 transition"
                    title="Jadikan Gambar Utama"
                  >
                    <Star size={18} className="text-white" />
                  </button>
                )}
                <button
                  onClick={() => deleteImage(img.id)}
                  className="p-2 bg-red-500 rounded-lg hover:bg-red-600 transition"
                  title="Padam"
                >
                  <Trash2 size={18} className="text-white" />
                </button>
              </div>
            </motion.div>
          ))}
          
          {/* Add More Button */}
          {remainingSlots > 0 && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="aspect-square rounded-xl border-2 border-dashed border-slate-200 hover:border-teal-300 hover:bg-pastel-mint/50 transition flex flex-col items-center justify-center gap-2"
            >
              <Plus size={24} className="text-slate-400" />
              <span className="text-xs text-slate-400">Tambah</span>
            </button>
          )}
        </div>
      )}

      {/* Image Zoom Modal */}
      <AnimatePresence>
        {showZoom && selectedImage && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/90 z-[100]"
              onClick={() => setShowZoom(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed inset-0 z-[101] flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen"
            >
              <button
                onClick={() => setShowZoom(false)}
                className="absolute top-4 right-4 p-3 bg-white/10 hover:bg-white/20 rounded-full transition"
              >
                <X size={24} className="text-white" />
              </button>
              
              {images.length > 1 && (
                <>
                  <button
                    onClick={() => navigateZoom('prev')}
                    className="absolute left-4 p-3 bg-white/10 hover:bg-white/20 rounded-full transition"
                  >
                    <ChevronLeft size={28} className="text-white" />
                  </button>
                  <button
                    onClick={() => navigateZoom('next')}
                    className="absolute right-4 p-3 bg-white/10 hover:bg-white/20 rounded-full transition"
                  >
                    <ChevronRight size={28} className="text-white" />
                  </button>
                </>
              )}
              
              <img
                src={`${API_URL}${selectedImage.url}`}
                alt="Zoom"
                className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
              />
              
              {/* Thumbnail Strip */}
              {images.length > 1 && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 p-2 bg-black/50 rounded-xl">
                  {images.map((img, idx) => (
                    <button
                      key={img.id}
                      onClick={() => setSelectedImage(img)}
                      className={`w-12 h-12 rounded-lg overflow-hidden transition ${
                        selectedImage.id === img.id ? 'ring-2 ring-white' : 'opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={`${API_URL}${img.url}`}
                        alt={`Thumb ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

/**
 * ProductGallery - Display product images with carousel/zoom
 */
export const ProductGallery = ({ images = [], productName = 'Product' }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showZoom, setShowZoom] = useState(false);
  
  if (!images || images.length === 0) {
    return (
      <div className="aspect-square bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl flex items-center justify-center">
        <ImageIcon size={48} className="text-slate-300" />
      </div>
    );
  }
  
  const mainImage = images[selectedIndex];
  
  return (
    <div className="space-y-3" data-testid="product-gallery">
      {/* Main Image */}
      <div 
        className="relative aspect-square rounded-2xl overflow-hidden cursor-zoom-in group"
        onClick={() => setShowZoom(true)}
      >
        <img
          src={`${API_URL}${mainImage.url}`}
          alt={productName}
          className="w-full h-full object-cover transition group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition flex items-center justify-center">
          <ZoomIn size={32} className="text-white opacity-0 group-hover:opacity-100 transition" />
        </div>
      </div>
      
      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img, idx) => (
            <button
              key={img.id || idx}
              onClick={() => setSelectedIndex(idx)}
              className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden transition ${
                idx === selectedIndex 
                  ? 'ring-2 ring-teal-500 ring-offset-2' 
                  : 'opacity-60 hover:opacity-100'
              }`}
            >
              <img
                src={`${API_URL}${img.url}`}
                alt={`${productName} ${idx + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
      
      {/* Zoom Modal */}
      <AnimatePresence>
        {showZoom && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/90 z-[100]"
              onClick={() => setShowZoom(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed inset-0 z-[101] flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen"
            >
              <button
                onClick={() => setShowZoom(false)}
                className="absolute top-4 right-4 p-3 bg-white/10 hover:bg-white/20 rounded-full"
              >
                <X size={24} className="text-white" />
              </button>
              
              {images.length > 1 && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedIndex(selectedIndex > 0 ? selectedIndex - 1 : images.length - 1);
                    }}
                    className="absolute left-4 p-3 bg-white/10 hover:bg-white/20 rounded-full"
                  >
                    <ChevronLeft size={28} className="text-white" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedIndex(selectedIndex < images.length - 1 ? selectedIndex + 1 : 0);
                    }}
                    className="absolute right-4 p-3 bg-white/10 hover:bg-white/20 rounded-full"
                  >
                    <ChevronRight size={28} className="text-white" />
                  </button>
                </>
              )}
              
              <img
                src={`${API_URL}${images[selectedIndex].url}`}
                alt={productName}
                className="max-w-full max-h-[85vh] object-contain rounded-lg"
              />
              
              {images.length > 1 && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 p-2 bg-black/50 rounded-xl">
                  {images.map((img, idx) => (
                    <button
                      key={img.id || idx}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedIndex(idx);
                      }}
                      className={`w-12 h-12 rounded-lg overflow-hidden transition ${
                        idx === selectedIndex ? 'ring-2 ring-white' : 'opacity-60'
                      }`}
                    >
                      <img
                        src={`${API_URL}${img.url}`}
                        alt={`Thumb ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ProductImageUpload;
