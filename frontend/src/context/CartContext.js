import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import api from '../services/api';

const CartContext = createContext(null);

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    console.warn('useCart used outside CartProvider, returning defaults');
    return {
      cart: { items: [], total_amount: 0, item_count: 0 },
      loading: false,
      isOpen: false,
      fetchCart: () => {},
      addToCart: () => Promise.resolve({ success: false }),
      addKoperasiToCart: () => Promise.resolve({ success: false }),
      addBusTicketToCart: () => Promise.resolve({ success: false }),
      addYuranToCart: () => Promise.resolve({ success: false }),
      addInfaqToCart: () => Promise.resolve({ success: false }),
      removeFromCart: () => Promise.resolve({ success: false }),
      updateQuantity: () => Promise.resolve({ success: false }),
      clearCart: () => Promise.resolve({ success: false }),
      openCart: () => {},
      closeCart: () => {},
      toggleCart: () => {}
    };
  }
  return context;
};

export const CartProvider = ({ children }) => {
  const [cart, setCart] = useState({ items: [], total_amount: 0, item_count: 0 });
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Fetch cart from backend
  const fetchCart = useCallback(async () => {
    try {
      const response = await api.get('/api/payment-center/cart');
      setCart({
        items: response.data.items || [],
        total_amount: response.data.total_amount || 0,
        item_count: response.data.items?.length || 0
      });
    } catch (error) {
      console.error('Error fetching cart:', error);
    }
  }, []);

  // Load cart on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetchCart();
    }
  }, [fetchCart]);

  // Add item to cart
  const addToCart = async (itemType, itemData) => {
    setLoading(true);
    try {
      const payload = {
        item_type: itemType,
        ...itemData
      };
      
      const response = await api.post('/api/payment-center/cart/add', payload);
      
      setCart({
        items: response.data.cart?.items || [],
        total_amount: response.data.cart?.total_amount || 0,
        item_count: response.data.cart?.item_count || 0
      });
      
      toast.success(response.data.message || 'Item ditambah ke troli');
      return { success: true, data: response.data };
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Gagal menambah ke troli';
      toast.error(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setLoading(false);
    }
  };

  // Add Koperasi item to cart
  const addKoperasiToCart = async (product, quantity = 1) => {
    return addToCart('koperasi', {
      item_id: product._id || product.id,
      name: product.name,
      description: product.category || 'Produk Koperasi',
      amount: product.price,
      quantity: quantity,
      metadata: {
        product_id: product._id || product.id,
        product_name: product.name,
        category: product.category,
        image_url: product.image_url
      }
    });
  };

  // Add Bus Ticket to cart
  const addBusTicketToCart = async (schedule, student, quantity = 1) => {
    return addToCart('bus', {
      item_id: schedule._id || schedule.id,
      name: `Tiket Bas - ${schedule.route_name || schedule.destination}`,
      description: `${student.full_name} - ${schedule.departure_date}`,
      amount: schedule.price,
      quantity: quantity,
      metadata: {
        schedule_id: schedule._id || schedule.id,
        student_id: student._id || student.id,
        student_name: student.full_name,
        route_name: schedule.route_name,
        destination: schedule.destination,
        departure_date: schedule.departure_date,
        departure_time: schedule.departure_time
      }
    });
  };

  // Add Yuran item to cart
  const addYuranToCart = async (yuran, paymentType = 'full', metadata = {}) => {
    return addToCart(paymentType === 'partial' ? 'yuran_partial' : 'yuran', {
      item_id: yuran._id || yuran.item_id,
      name: yuran.name || yuran.set_yuran_nama,
      description: `${yuran.student_name} - Tingkatan ${yuran.tingkatan}`,
      amount: metadata.amount || yuran.amount,
      quantity: 1,
      metadata: {
        student_name: yuran.student_name,
        student_id: yuran.student_id,
        tingkatan: yuran.tingkatan,
        ...metadata
      }
    });
  };

  // Add Infaq/Tabung to cart
  const addInfaqToCart = async (campaign, amount, donorInfo = {}) => {
    return addToCart('infaq', {
      item_id: campaign._id || campaign.id,
      name: campaign.name || campaign.title,
      description: campaign.category || 'Sumbangan',
      amount: amount,
      quantity: 1,
      metadata: {
        campaign_id: campaign._id || campaign.id,
        campaign_name: campaign.name || campaign.title,
        donor_name: donorInfo.name,
        donor_phone: donorInfo.phone,
        message: donorInfo.message
      }
    });
  };

  // Remove item from cart
  const removeFromCart = async (cartItemId) => {
    setLoading(true);
    try {
      const response = await api.delete(`/api/payment-center/cart/remove/${cartItemId}`);
      
      setCart({
        items: response.data.cart?.items || [],
        total_amount: response.data.cart?.total_amount || 0,
        item_count: response.data.cart?.item_count || 0
      });
      
      toast.success('Item dibuang dari troli');
      return { success: true };
    } catch (error) {
      toast.error('Gagal membuang item');
      return { success: false };
    } finally {
      setLoading(false);
    }
  };

  // Update item quantity
  const updateQuantity = async (cartItemId, quantity) => {
    setLoading(true);
    try {
      const response = await api.patch(`/api/payment-center/cart/update/${cartItemId}`, {
        quantity: quantity
      });
      
      setCart({
        items: response.data.cart?.items || [],
        total_amount: response.data.cart?.total_amount || 0,
        item_count: response.data.cart?.item_count || 0
      });
      
      return { success: true };
    } catch (error) {
      toast.error('Gagal mengemas kini kuantiti');
      return { success: false };
    } finally {
      setLoading(false);
    }
  };

  // Clear cart
  const clearCart = async () => {
    setLoading(true);
    try {
      await api.delete('/api/payment-center/cart/clear');
      setCart({ items: [], total_amount: 0, item_count: 0 });
      toast.success('Troli dikosongkan');
      return { success: true };
    } catch (error) {
      toast.error('Gagal mengosongkan troli');
      return { success: false };
    } finally {
      setLoading(false);
    }
  };

  // Toggle cart drawer
  const openCart = () => setIsOpen(true);
  const closeCart = () => setIsOpen(false);
  const toggleCart = () => setIsOpen(prev => !prev);

  const value = {
    cart,
    loading,
    isOpen,
    fetchCart,
    addToCart,
    addKoperasiToCart,
    addBusTicketToCart,
    addYuranToCart,
    addInfaqToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    openCart,
    closeCart,
    toggleCart
  };

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
};

export default CartContext;
