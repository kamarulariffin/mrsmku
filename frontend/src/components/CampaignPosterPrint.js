import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { Printer, Download, ArrowLeft, QrCode, Gift } from 'lucide-react';
import { API_URL } from '../services/api';

const CampaignPosterPrint = ({ campaign, onClose }) => {
  const printRef = useRef();
  
  const handlePrint = () => {
    const printWindow = window.open('', '', 'width=800,height=1000');
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Poster ${campaign.title}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: white;
          }
          .poster {
            width: 210mm;
            min-height: 297mm;
            padding: 20mm;
            margin: 0 auto;
            background: linear-gradient(135deg, #ecfdf5 0%, #f0fdfa 50%, #ecfeff 100%);
          }
          .header {
            text-align: center;
            margin-bottom: 20px;
          }
          .logo {
            width: 60px;
            height: 60px;
            background: linear-gradient(135deg, #10b981, #14b8a6);
            border-radius: 15px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 15px;
            color: white;
            font-size: 28px;
          }
          .school-name {
            font-size: 14px;
            color: #64748b;
            font-weight: 500;
          }
          .campaign-type {
            display: inline-block;
            background: #10b981;
            color: white;
            padding: 6px 16px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            margin: 15px 0;
          }
          .title {
            font-size: 32px;
            font-weight: 800;
            color: #0f172a;
            line-height: 1.2;
            margin-bottom: 15px;
          }
          .description {
            font-size: 14px;
            color: #475569;
            line-height: 1.6;
            margin-bottom: 25px;
            max-height: 150px;
            overflow: hidden;
          }
          .image-container {
            width: 100%;
            height: 200px;
            border-radius: 15px;
            overflow: hidden;
            margin-bottom: 25px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          }
          .image-container img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
            margin-bottom: 25px;
          }
          .stat-box {
            background: white;
            padding: 15px;
            border-radius: 12px;
            text-align: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.05);
          }
          .stat-value {
            font-size: 24px;
            font-weight: 700;
            color: #10b981;
          }
          .stat-label {
            font-size: 11px;
            color: #64748b;
            margin-top: 5px;
          }
          .qr-section {
            background: white;
            padding: 25px;
            border-radius: 15px;
            text-align: center;
            box-shadow: 0 5px 20px rgba(0,0,0,0.08);
          }
          .qr-title {
            font-size: 16px;
            font-weight: 600;
            color: #0f172a;
            margin-bottom: 15px;
          }
          .qr-code {
            width: 180px;
            height: 180px;
            margin: 0 auto 15px;
          }
          .qr-code img {
            width: 100%;
            height: 100%;
          }
          .qr-instruction {
            font-size: 12px;
            color: #64748b;
            margin-bottom: 10px;
          }
          .qr-url {
            font-size: 10px;
            color: #94a3b8;
            word-break: break-all;
          }
          .footer {
            margin-top: 25px;
            text-align: center;
            font-size: 11px;
            color: #94a3b8;
          }
          .cta {
            background: linear-gradient(135deg, #10b981, #14b8a6);
            color: white;
            padding: 15px 30px;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 600;
            display: inline-block;
            margin: 20px 0;
          }
          @media print {
            body { background: white; }
            .poster { 
              page-break-after: always;
              box-shadow: none;
            }
          }
        </style>
      </head>
      <body>
        <div class="poster">
          <div class="header">
            <div class="logo">🎁</div>
            <p class="school-name">Portal MRSMKU - Tabung & Sumbangan</p>
            <span class="campaign-type">${campaign.campaign_type === 'slot' ? 'Sumbangan Slot' : 'Sumbangan Umum'}</span>
          </div>
          
          <h1 class="title">${campaign.title}</h1>
          
          <p class="description">${(campaign.description || '').replace(/<[^>]*>/g, '').substring(0, 300)}${(campaign.description || '').length > 300 ? '...' : ''}</p>
          
          ${campaign.images && campaign.images.length > 0 ? `
            <div class="image-container">
              <img src="${API_URL}${campaign.images[0].url}" alt="${campaign.title}" />
            </div>
          ` : campaign.image_url ? `
            <div class="image-container">
              <img src="${campaign.image_url.startsWith('http') ? campaign.image_url : API_URL + campaign.image_url}" alt="${campaign.title}" />
            </div>
          ` : ''}
          
          <div class="stats-grid">
            <div class="stat-box">
              <div class="stat-value">RM ${(campaign.total_collected || 0).toLocaleString()}</div>
              <div class="stat-label">Terkumpul</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">${campaign.donor_count || 0}</div>
              <div class="stat-label">Penderma</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">${Math.round(campaign.progress_percent || 0)}%</div>
              <div class="stat-label">Tercapai</div>
            </div>
          </div>
          
          <div class="qr-section">
            <p class="qr-title">Imbas untuk Menyumbang</p>
            ${campaign.qr_code_base64 ? `
              <div class="qr-code">
                <img src="data:image/png;base64,${campaign.qr_code_base64}" alt="QR Code" />
              </div>
            ` : ''}
            <p class="qr-instruction">Imbas kod QR di atas menggunakan telefon anda</p>
            <p class="qr-url">${campaign.qr_code_url || ''}</p>
          </div>
          
          <div style="text-align: center;">
            <div class="cta">Hulurkan Sumbangan Anda</div>
          </div>
          
          <div class="footer">
            <p>© ${new Date().getFullYear()} Portal MRSMKU. Setiap sumbangan anda amat bermakna.</p>
          </div>
        </div>
      </body>
      </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
    
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };
  
  const handleDownloadPNG = async () => {
    // Create canvas from poster content
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(printRef.current, {
      scale: 2,
      useCORS: true,
      allowTaint: true
    });
    
    const link = document.createElement('a');
    link.download = `Poster_${campaign.title.replace(/\s+/g, '_')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };
  
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[95vh] overflow-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <button 
              onClick={onClose}
              className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2 className="font-bold text-lg text-slate-900">Cetak Poster Kempen</h2>
              <p className="text-sm text-slate-500">Preview dan cetak poster untuk promosi offline</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors"
            >
              <Printer size={18} /> Cetak
            </button>
            <button 
              onClick={handleDownloadPNG}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
            >
              <Download size={18} /> Muat Turun
            </button>
          </div>
        </div>
        
        {/* Poster Preview */}
        <div className="p-6 bg-slate-100">
          <div 
            ref={printRef}
            className="bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 rounded-2xl shadow-lg mx-auto"
            style={{ width: '400px', padding: '30px' }}
          >
            {/* Header */}
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
                <Gift className="text-white" size={32} />
              </div>
              <p className="text-sm text-slate-500 font-medium">Portal MRSMKU - Tabung & Sumbangan</p>
              <span className="inline-block mt-3 px-4 py-1.5 bg-emerald-500 text-white text-xs font-semibold rounded-full">
                {campaign.campaign_type === 'slot' ? 'Sumbangan Slot' : 'Sumbangan Umum'}
              </span>
            </div>
            
            {/* Title */}
            <h1 className="text-2xl font-extrabold text-slate-900 text-center mb-4 leading-tight">
              {campaign.title}
            </h1>
            
            {/* Description */}
            <p className="text-sm text-slate-600 text-center mb-5 line-clamp-3">
              {(campaign.description || '').replace(/<[^>]*>/g, '').substring(0, 150)}
              {(campaign.description || '').length > 150 ? '...' : ''}
            </p>
            
            {/* Image */}
            {(campaign.images && campaign.images.length > 0) || campaign.image_url ? (
              <div className="w-full h-40 rounded-xl overflow-hidden mb-5 shadow-md">
                <img 
                  src={campaign.images && campaign.images.length > 0 
                    ? `${API_URL}${campaign.images[0].url}`
                    : campaign.image_url?.startsWith('http') ? campaign.image_url : `${API_URL}${campaign.image_url}`
                  }
                  alt={campaign.title}
                  className="w-full h-full object-cover"
                  crossOrigin="anonymous"
                />
              </div>
            ) : null}
            
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-white p-3 rounded-xl text-center shadow-sm">
                <p className="text-lg font-bold text-emerald-600">RM {(campaign.total_collected || 0).toLocaleString()}</p>
                <p className="text-xs text-slate-500">Terkumpul</p>
              </div>
              <div className="bg-white p-3 rounded-xl text-center shadow-sm">
                <p className="text-lg font-bold text-emerald-600">{campaign.donor_count || 0}</p>
                <p className="text-xs text-slate-500">Penderma</p>
              </div>
              <div className="bg-white p-3 rounded-xl text-center shadow-sm">
                <p className="text-lg font-bold text-emerald-600">{Math.round(campaign.progress_percent || 0)}%</p>
                <p className="text-xs text-slate-500">Tercapai</p>
              </div>
            </div>
            
            {/* QR Code */}
            {campaign.qr_code_base64 && (
              <div className="bg-white p-5 rounded-xl text-center shadow-md">
                <p className="font-semibold text-slate-900 mb-3 flex items-center justify-center gap-2">
                  <QrCode size={18} className="text-emerald-600" />
                  Imbas untuk Menyumbang
                </p>
                <img 
                  src={`data:image/png;base64,${campaign.qr_code_base64}`}
                  alt="QR Code"
                  className="w-36 h-36 mx-auto mb-3"
                />
                <p className="text-xs text-slate-500">Imbas kod QR menggunakan telefon anda</p>
              </div>
            )}
            
            {/* CTA */}
            <div className="mt-5 text-center">
              <div className="inline-block px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl shadow-md">
                Hulurkan Sumbangan Anda
              </div>
            </div>
            
            {/* Footer */}
            <p className="text-center text-xs text-slate-400 mt-5">
              © {new Date().getFullYear()} Portal MRSMKU
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default CampaignPosterPrint;
