import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, AlertCircle } from 'lucide-react';
import QRCode from 'react-qr-code';
import api from '../../services/api';

const MyDigitalIDModal = ({ isOpen, onClose, onSuccess }) => {
  const [countdown, setCountdown] = useState(180);
  const [status, setStatus] = useState('waiting');
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    if (isOpen) {
      api.get('/api/settings/mydigitalid')
        .then(res => setSettings(res.data))
        .catch(() => setSettings({ enabled: false }));
      
      setCountdown(180);
      setStatus('waiting');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || status !== 'waiting') return;
    
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const autoLogin = setTimeout(() => {
      setStatus('scanning');
      setTimeout(() => {
        handleMockLogin();
      }, 2000);
    }, 5000);

    return () => {
      clearInterval(timer);
      clearTimeout(autoLogin);
    };
  }, [isOpen, status]);

  const handleMockLogin = async () => {
    try {
      const res = await api.post('/api/auth/mydigitalid/mock-login');
      setStatus('success');
      setTimeout(() => {
        onSuccess(res.data);
      }, 1000);
    } catch (err) {
      setStatus('error');
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins} MINIT ${secs.toString().padStart(2, '0')} SAAT`;
  };

  const qrValue = settings?.url 
    ? JSON.stringify({ action: settings.action, url: settings.url, nonce: settings.nonce })
    : 'https://mydigitalid.gov.my';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 bg-black/60 z-50" 
            onClick={onClose} 
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen pointer-events-none" style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }} aria-hidden="true">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-md flex-shrink-0 bg-white rounded-2xl shadow-2xl overflow-hidden pointer-events-auto"
            >
            <div className="bg-white pt-6 pb-4 text-center border-b">
              <div className="flex items-center justify-center gap-1 mb-2">
                <span className="text-2xl font-bold text-red-600">my</span>
                <span className="text-2xl font-bold text-blue-600">digital</span>
                <span className="text-2xl font-bold text-amber-500">ID</span>
              </div>
              <h2 className="text-lg font-bold text-slate-800">LOG MASUK</h2>
            </div>

            <div className="bg-amber-400 py-2 text-center">
              <p className="text-sm font-bold text-amber-900 italic">
                SESI AKAN TAMAT DALAM MASA
              </p>
              <p className="text-lg font-bold text-amber-900">
                {formatTime(countdown)}
              </p>
            </div>

            <div className="p-6 text-center">
              {status === 'waiting' && (
                <>
                  <p className="text-slate-600 mb-4">
                    Imbas kod QR menggunakan<br/>
                    aplikasi MyDigital ID
                  </p>
                  
                  <div className="bg-slate-100 p-4 rounded-xl inline-block mb-4">
                    <QRCode 
                      value={qrValue}
                      size={200}
                      level="M"
                      data-testid="mydigitalid-qr"
                    />
                  </div>

                  <p className="text-xs text-slate-400 mb-4">
                    (Demo: Auto log masuk dalam 5 saat)
                  </p>
                </>
              )}

              {status === 'scanning' && (
                <div className="py-8">
                  <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-blue-600 font-medium">Mengesahkan identiti...</p>
                </div>
              )}

              {status === 'success' && (
                <div className="py-8">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check className="text-green-600" size={32} />
                  </div>
                  <p className="text-green-600 font-medium">Pengesahan berjaya!</p>
                </div>
              )}

              {status === 'error' && (
                <div className="py-8">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertCircle className="text-red-600" size={32} />
                  </div>
                  <p className="text-red-600 font-medium">Pengesahan gagal. Sila cuba lagi.</p>
                </div>
              )}

              <button
                onClick={onClose}
                className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-full transition-colors"
                data-testid="mydigitalid-cancel"
              >
                Batal
              </button>
            </div>

            <div className="bg-slate-50 py-4 text-center border-t">
              <p className="text-sm font-semibold text-slate-700">
                Lindungi Identiti Digital Anda
              </p>
              <p className="text-sm font-semibold text-slate-700">
                Dengan MyDigital ID
              </p>
            </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

export default MyDigitalIDModal;
