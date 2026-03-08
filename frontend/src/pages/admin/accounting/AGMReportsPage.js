/**
 * AGM Reports Page
 * Laporan Mesyuarat Agung Tahunan
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { 
  FileText, RefreshCw, TrendingUp, TrendingDown,
  Building2, ArrowUpCircle, ArrowDownCircle, 
  Printer, AlertCircle, CheckCircle2, ArrowLeft,
  Download, FileSpreadsheet, FileType,
  ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel, ImageRun } from 'docx';
import { saveAs } from 'file-saver';
import { API_URL } from '../../../services/api';
import {
  DEFAULT_AGM_REPORT_TEMPLATE,
  normalizeAgmReportTemplate,
  resolveAgmReportTemplateAssetUrl,
} from '../../../utils/agmReportTemplate';

// Apply the autoTable plugin to jsPDF (required for v5.x)
applyPlugin(jsPDF);

const DEFAULT_LOGO_URL = `${process.env.PUBLIC_URL || ''}/logo-muafakat.png`;

const getImageDataUrl = (imageUrl) =>
  fetch(imageUrl)
    .then(r => r.blob())
    .then(blob => new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(blob);
    }));

const getImageArrayBuffer = (imageUrl) => fetch(imageUrl).then(r => r.arrayBuffer());

export default function AGMReportsPage() {
  const navigate = useNavigate();
  const [years, setYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState('');
  const [activeTab, setActiveTab] = useState('summary');
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState({
    incomeExpenditure: null,
    balanceSheet: null,
    cashFlow: null,
    executiveSummary: null,
    trialBalance: null
  });
  
  // Trial Balance period filter
  const [tbPeriodType, setTbPeriodType] = useState('financial_year');
  const [tbMonth, setTbMonth] = useState(new Date().getMonth() + 1);
  const [tbQuarter, setTbQuarter] = useState(1);
  const [tbYear, setTbYear] = useState(new Date().getFullYear());
  const [tbIncludeComparison, setTbIncludeComparison] = useState(false);
  const [printPreviewMode, setPrintPreviewMode] = useState(false);
  const [agmTemplateSettings, setAgmTemplateSettings] = useState(DEFAULT_AGM_REPORT_TEMPLATE);

  const getAuthHeader = () => {
    const token = localStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
  };

  const MALAY_MONTHS = {
    1: 'Januari', 2: 'Februari', 3: 'Mac', 4: 'April',
    5: 'Mei', 6: 'Jun', 7: 'Julai', 8: 'Ogos',
    9: 'September', 10: 'Oktober', 11: 'November', 12: 'Disember'
  };

  const agmTemplate = normalizeAgmReportTemplate(agmTemplateSettings);
  const agmHeaderRows = agmTemplate?.header?.rows || [];
  const agmFooterRows = agmTemplate?.footer?.rows || [];
  const agmHeaderLeftLogo = resolveAgmReportTemplateAssetUrl(agmTemplate?.header?.left_logo_url) || DEFAULT_LOGO_URL;
  const agmHeaderRightLogo = resolveAgmReportTemplateAssetUrl(agmTemplate?.header?.right_logo_url) || DEFAULT_LOGO_URL;

  const getAllAgmFooterBoxes = () => {
    const leftBoxes = Array.isArray(agmTemplate?.footer?.left_boxes) ? agmTemplate.footer.left_boxes : [];
    const rightBoxes = Array.isArray(agmTemplate?.footer?.right_boxes) ? agmTemplate.footer.right_boxes : [];
    return { leftBoxes, rightBoxes };
  };

  useEffect(() => {
    fetchYears();
    fetchAgmTemplateSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedYear) {
      fetchAllReports();
    }
  }, [selectedYear]);

  const fetchYears = async () => {
    try {
      const res = await fetch(`${API_URL}/api/accounting-full/financial-years`, {
        headers: getAuthHeader()
      });
      if (res.ok) {
        const data = await res.json();
        setYears(data);
        const current = data.find(y => y.is_current);
        if (current) {
          setSelectedYear(current.id);
        } else if (data.length > 0) {
          // Tiada tahun ditandai "semasa" — default ke tahun yang namanya sepadan tahun kalendar semasa, atau tahun pertama
          const currentCalendarYear = String(new Date().getFullYear());
          const match = data.find(y => y.name && String(y.name).includes(currentCalendarYear));
          setSelectedYear(match ? match.id : data[0].id);
        }
      }
    } catch (error) {
      console.error('Error fetching years:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAgmTemplateSettings = async () => {
    try {
      const res = await fetch(`${API_URL}/api/yuran/settings/agm-report-template`, {
        headers: getAuthHeader(),
      });
      if (!res.ok) return;
      const data = await res.json();
      setAgmTemplateSettings(normalizeAgmReportTemplate(data?.template));
    } catch (error) {
      console.error('Error fetching AGM template settings:', error);
      setAgmTemplateSettings(DEFAULT_AGM_REPORT_TEMPLATE);
    }
  };

  const fetchAllReports = async () => {
    setLoading(true);
    try {
      const headers = getAuthHeader();
      const [ieRes, bsRes, cfRes, esRes, tbRes] = await Promise.all([
        fetch(`${API_URL}/api/accounting-full/agm/income-expenditure?financial_year_id=${selectedYear}`, { headers }),
        fetch(`${API_URL}/api/accounting-full/agm/balance-sheet?financial_year_id=${selectedYear}`, { headers }),
        fetch(`${API_URL}/api/accounting-full/agm/cash-flow?financial_year_id=${selectedYear}`, { headers }),
        fetch(`${API_URL}/api/accounting-full/agm/executive-summary?financial_year_id=${selectedYear}`, { headers }),
        fetch(`${API_URL}/api/accounting-full/agm/trial-balance?financial_year_id=${selectedYear}&period_type=${tbPeriodType}&month=${tbMonth}&quarter=${tbQuarter}&year=${tbYear}`, { headers })
      ]);

      setReportData({
        incomeExpenditure: ieRes.ok ? await ieRes.json() : null,
        balanceSheet: bsRes.ok ? await bsRes.json() : null,
        cashFlow: cfRes.ok ? await cfRes.json() : null,
        executiveSummary: esRes.ok ? await esRes.json() : null,
        trialBalance: tbRes.ok ? await tbRes.json() : null
      });
    } catch (error) {
      console.error('Error fetching reports:', error);
      toast.error('Gagal memuatkan laporan');
    } finally {
      setLoading(false);
    }
  };

  // Fetch Trial Balance with specific period filter
  const fetchTrialBalance = async () => {
    if (!selectedYear) return;
    
    try {
      const headers = getAuthHeader();
      const res = await fetch(
        `${API_URL}/api/accounting-full/agm/trial-balance?financial_year_id=${selectedYear}&period_type=${tbPeriodType}&month=${tbMonth}&quarter=${tbQuarter}&year=${tbYear}&include_comparison=${tbIncludeComparison}`,
        { headers }
      );
      if (res.ok) {
        const data = await res.json();
        setReportData(prev => ({ ...prev, trialBalance: data }));
      }
    } catch (error) {
      console.error('Error fetching trial balance:', error);
      toast.error('Gagal memuatkan imbangan duga');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // ==================== EXPORT FUNCTIONS ====================

  /** Bulan & tahun berakhir dari pilihan laporan (diselaraskan dengan sistem) */
  const getReportEndMonthYear = () => {
    const ie = reportData.incomeExpenditure;
    const cf = reportData.cashFlow;
    const endDateStr = ie?.end_date || cf?.end_date;
    if (!endDateStr) return reportData.executiveSummary?.financial_year || '';
    const d = new Date(endDateStr);
    if (isNaN(d.getTime())) return endDateStr;
    const months = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];
    return `${months[d.getMonth()]} ${d.getFullYear()}`;
  };

  // Export to PDF
  const exportToPDF = async () => {
    if (!es) {
      toast.error('Sila pilih tahun kewangan terlebih dahulu');
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 20;
    const endMonthYear = getReportEndMonthYear();
    const headerRows = agmHeaderRows.length ? agmHeaderRows : ['LAPORAN PENYATA KEWANGAN', `BERAKHIR (${endMonthYear}).`];

    try {
      const [leftLogoDataUrl, rightLogoDataUrl] = await Promise.all([
        getImageDataUrl(agmHeaderLeftLogo),
        getImageDataUrl(agmHeaderRightLogo),
      ]);
      const logoW = 30;
      const logoH = 18;
      doc.addImage(leftLogoDataUrl, 'PNG', 14, 12, logoW, logoH);
      doc.addImage(rightLogoDataUrl, 'PNG', pageWidth - 14 - logoW, 12, logoW, logoH);
      yPos = 12 + logoH + 8;
    } catch (_) {
      // continue without logo if load fails
    }

    // Header
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    headerRows.forEach((row, rowIndex) => {
      let text = row;
      if (rowIndex === 1 && !String(row).includes('(') && String(row).toUpperCase().includes('BERAKHIR')) {
        text = `${row} (${endMonthYear}).`;
      }
      doc.text(String(text), pageWidth / 2, yPos, { align: 'center' });
      yPos += rowIndex === 0 ? 8 : 7;
    });
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    if (agmTemplate?.header?.right_title) {
      doc.text(String(agmTemplate.header.right_title), pageWidth / 2, yPos, { align: 'center' });
      yPos += 7;
    }
    doc.text(`Tahun Kewangan: ${es.financial_year}`, pageWidth / 2, yPos, { align: 'center' });
    yPos += 15;

    // Executive Summary
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('RINGKASAN EKSEKUTIF', 14, yPos);
    yPos += 10;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    const summaryData = [
      ['Baki Bawa Ke Hadapan', `RM ${es.opening_balance.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`],
      ['Jumlah Pendapatan', `RM ${es.total_income.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`],
      ['Jumlah Perbelanjaan', `RM ${es.total_expense.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`],
      [es.net_surplus >= 0 ? 'Lebihan' : 'Kurangan', `RM ${Math.abs(es.net_surplus).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`],
      ['Baki Terkumpul', `RM ${es.closing_balance.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`],
    ];

    doc.autoTable({
      startY: yPos,
      head: [['Perkara', 'Amaun']],
      body: summaryData,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: 14, right: 14 },
    });

    yPos = doc.lastAutoTable.finalY + 15;

    // Income & Expenditure Statement
    if (ie) {
      doc.addPage();
      yPos = 20;
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('PENYATA PENDAPATAN DAN PERBELANJAAN', pageWidth / 2, yPos, { align: 'center' });
      yPos += 6;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Bagi Tahun Kewangan Berakhir ${ie.end_date}`, pageWidth / 2, yPos, { align: 'center' });
      yPos += 12;

      // Income
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('PENDAPATAN', 14, yPos);
      yPos += 8;

      const incomeData = ie.income_items.map(item => [item.category, `RM ${item.amount.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`]);
      incomeData.push(['JUMLAH PENDAPATAN', `RM ${ie.total_income.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`]);

      doc.autoTable({
        startY: yPos,
        head: [['Kategori', 'Amaun']],
        body: incomeData,
        theme: 'striped',
        headStyles: { fillColor: [34, 197, 94] },
        margin: { left: 14, right: 14 },
        didParseCell: (data) => {
          if (data.row.index === incomeData.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [220, 252, 231];
          }
        }
      });

      yPos = doc.lastAutoTable.finalY + 12;

      // Expense
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('PERBELANJAAN', 14, yPos);
      yPos += 8;

      const expenseData = ie.expense_items.map(item => [item.category, `RM ${item.amount.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`]);
      expenseData.push(['JUMLAH PERBELANJAAN', `RM ${ie.total_expense.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`]);

      doc.autoTable({
        startY: yPos,
        head: [['Kategori', 'Amaun']],
        body: expenseData,
        theme: 'striped',
        headStyles: { fillColor: [239, 68, 68] },
        margin: { left: 14, right: 14 },
        didParseCell: (data) => {
          if (data.row.index === expenseData.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [254, 226, 226];
          }
        }
      });

      yPos = doc.lastAutoTable.finalY + 12;

      // Net Surplus
      doc.autoTable({
        startY: yPos,
        body: [[ie.net_surplus >= 0 ? 'LEBIHAN PENDAPATAN' : 'KURANGAN PENDAPATAN', `RM ${Math.abs(ie.net_surplus).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`]],
        theme: 'grid',
        margin: { left: 14, right: 14 },
        styles: { fontStyle: 'bold', fontSize: 12 },
        bodyStyles: { fillColor: ie.net_surplus >= 0 ? [219, 234, 254] : [255, 237, 213] }
      });
    }

    // Balance Sheet
    if (bs) {
      doc.addPage();
      yPos = 20;
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('KUNCI KIRA-KIRA', pageWidth / 2, yPos, { align: 'center' });
      yPos += 6;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Pada ${bs.as_of_date}`, pageWidth / 2, yPos, { align: 'center' });
      yPos += 12;

      // Assets
      const assetData = [
        ['ASET', ''],
        ['Wang di Bank:', ''],
        ...bs.bank_balances.map(acc => [`  - ${acc.account_name}`, `RM ${acc.balance.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`]),
        ['JUMLAH ASET', `RM ${bs.total_assets.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`],
        ['', ''],
        ['LIABILITI & EKUITI', ''],
        ['Dana Bawa Ke Hadapan', `RM ${bs.opening_fund.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`],
        [bs.current_surplus >= 0 ? 'Lebihan Tahun Semasa' : 'Kurangan Tahun Semasa', `RM ${bs.current_surplus.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`],
        ['Dana Terkumpul', `RM ${bs.closing_fund.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`],
        ['JUMLAH LIABILITI & EKUITI', `RM ${bs.total_liabilities_equity.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`],
      ];

      doc.autoTable({
        startY: yPos,
        body: assetData,
        theme: 'grid',
        margin: { left: 14, right: 14 },
        didParseCell: (data) => {
          const boldRows = [0, 3, 5, 9, 10];
          if (boldRows.includes(data.row.index)) {
            data.cell.styles.fontStyle = 'bold';
          }
          if (data.row.index === 0 || data.row.index === 5) {
            data.cell.styles.fillColor = [219, 234, 254];
          }
          if (data.row.index === 3 || data.row.index === 10) {
            data.cell.styles.fillColor = [254, 243, 199];
          }
        }
      });
    }

    // Cash Flow Statement
    if (cf) {
      doc.addPage();
      yPos = 20;
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('PENYATA ALIRAN TUNAI', pageWidth / 2, yPos, { align: 'center' });
      yPos += 6;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Bagi Tahun Kewangan ${cf.start_date} hingga ${cf.end_date}`, pageWidth / 2, yPos, { align: 'center' });
      yPos += 12;

      const cashFlowData = [
        ['BAKI TUNAI AWAL', `RM ${cf.opening_cash.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`],
        ['', ''],
        ['ALIRAN MASUK', ''],
        ...cf.cash_inflows.map(item => [`  ${item.source}`, `RM ${item.amount.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`]),
        ['Jumlah Aliran Masuk', `RM ${cf.total_inflows.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`],
        ['', ''],
        ['ALIRAN KELUAR', ''],
        ...cf.cash_outflows.map(item => [`  ${item.purpose}`, `RM ${item.amount.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`]),
        ['Jumlah Aliran Keluar', `RM ${cf.total_outflows.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`],
        ['', ''],
        [cf.net_cash_change >= 0 ? 'Pertambahan Tunai Bersih' : 'Pengurangan Tunai Bersih', `RM ${Math.abs(cf.net_cash_change).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`],
        ['BAKI TUNAI AKHIR', `RM ${cf.closing_cash.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`],
      ];

      doc.autoTable({
        startY: yPos,
        body: cashFlowData,
        theme: 'grid',
        margin: { left: 14, right: 14 },
        didParseCell: (data) => {
          const content = data.cell.raw;
          if (content && (content.startsWith('BAKI') || content.startsWith('Jumlah') || content === 'ALIRAN MASUK' || content === 'ALIRAN KELUAR' || content.includes('Tunai Bersih'))) {
            data.cell.styles.fontStyle = 'bold';
          }
          if (content === 'ALIRAN MASUK') {
            data.cell.styles.fillColor = [220, 252, 231];
          }
          if (content === 'ALIRAN KELUAR') {
            data.cell.styles.fillColor = [254, 226, 226];
          }
          if (content && content.startsWith('BAKI TUNAI')) {
            data.cell.styles.fillColor = [219, 234, 254];
          }
        }
      });
    }

    // Footer on last page
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      if (agmFooterRows[0]) {
        doc.text(String(agmFooterRows[0]), 14, pageHeight - 14);
      }
      if (agmFooterRows[1]) {
        doc.text(String(agmFooterRows[1]), 14, pageHeight - 10);
      }
      doc.text(`Dijana pada: ${new Date().toLocaleString('ms-MY')}`, 14, pageHeight - 6);
      doc.text(`Halaman ${i} / ${pageCount}`, pageWidth - 14, pageHeight - 6, { align: 'right' });
    }

    doc.save(`Laporan_AGM_${es.financial_year.replace(/\s+/g, '_')}.pdf`);
    toast.success('Laporan PDF berjaya dimuat turun');
  };

  // Export to Excel
  const exportToExcel = () => {
    if (!es) {
      toast.error('Sila pilih tahun kewangan terlebih dahulu');
      return;
    }

    const wb = XLSX.utils.book_new();

    // Summary Sheet
    const endMonthYear = getReportEndMonthYear();
    const summaryData = [
      ['LAPORAN PENYATA KEWANGAN'],
      [`BERAKHIR (${endMonthYear}).`],
      ['MUAFAKAT - Badan Pemaufakatan Pendidikan MARA Malaysia', ''],
      ['Tahun Kewangan', es.financial_year],
      ['Tarikh Dijana', new Date().toLocaleString('ms-MY')],
      [],
      ['RINGKASAN KEWANGAN'],
      ['Perkara', 'Amaun (RM)'],
      ['Baki Bawa Ke Hadapan', es.opening_balance],
      ['Jumlah Pendapatan', es.total_income],
      ['Jumlah Perbelanjaan', es.total_expense],
      [es.net_surplus >= 0 ? 'Lebihan' : 'Kurangan', Math.abs(es.net_surplus)],
      ['Baki Terkumpul', es.closing_balance],
      [],
      ['TOP 5 SUMBER PENDAPATAN'],
      ['Kategori', 'Amaun (RM)', 'Peratus (%)'],
      ...es.top_income_sources.map(item => [item.category, item.amount, item.percentage]),
      [],
      ['TOP 5 ITEM PERBELANJAAN'],
      ['Kategori', 'Amaun (RM)', 'Peratus (%)'],
      ...es.top_expense_items.map(item => [item.category, item.amount, item.percentage]),
      [],
      ['KEDUDUKAN AKAUN BANK'],
      ['Akaun', 'Jenis', 'Baki (RM)'],
      ...es.bank_accounts.map(acc => [acc.account_name, acc.account_type, acc.balance]),
      ['Jumlah Tunai', '', es.total_cash],
    ];
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    summaryWs['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Ringkasan');

    // Income & Expenditure Sheet
    if (ie) {
      const ieData = [
        ['PENYATA PENDAPATAN DAN PERBELANJAAN'],
        [`Bagi Tahun Kewangan Berakhir ${ie.end_date}`],
        [],
        ['PENDAPATAN'],
        ['Kategori', 'Amaun (RM)'],
        ...ie.income_items.map(item => [item.category, item.amount]),
        ['JUMLAH PENDAPATAN', ie.total_income],
        [],
        ['PERBELANJAAN'],
        ['Kategori', 'Amaun (RM)'],
        ...ie.expense_items.map(item => [item.category, item.amount]),
        ['JUMLAH PERBELANJAAN', ie.total_expense],
        [],
        [ie.net_surplus >= 0 ? 'LEBIHAN PENDAPATAN' : 'KURANGAN PENDAPATAN', Math.abs(ie.net_surplus)],
      ];
      const ieWs = XLSX.utils.aoa_to_sheet(ieData);
      ieWs['!cols'] = [{ wch: 40 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, ieWs, 'Pendapatan & Perbelanjaan');
    }

    // Balance Sheet
    if (bs) {
      const bsData = [
        ['KUNCI KIRA-KIRA'],
        [`Pada ${bs.as_of_date}`],
        [],
        ['ASET'],
        ['Perkara', 'Amaun (RM)'],
        ['Wang di Bank:', ''],
        ...bs.bank_balances.map(acc => [`  - ${acc.account_name}`, acc.balance]),
        ['JUMLAH ASET', bs.total_assets],
        [],
        ['LIABILITI & EKUITI'],
        ['Perkara', 'Amaun (RM)'],
        ['Dana Bawa Ke Hadapan', bs.opening_fund],
        [bs.current_surplus >= 0 ? 'Lebihan Tahun Semasa' : 'Kurangan Tahun Semasa', bs.current_surplus],
        ['Dana Terkumpul', bs.closing_fund],
        ['JUMLAH LIABILITI & EKUITI', bs.total_liabilities_equity],
      ];
      const bsWs = XLSX.utils.aoa_to_sheet(bsData);
      bsWs['!cols'] = [{ wch: 35 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, bsWs, 'Kunci Kira-kira');
    }

    // Cash Flow Sheet
    if (cf) {
      const cfData = [
        ['PENYATA ALIRAN TUNAI'],
        [`Bagi Tahun Kewangan ${cf.start_date} hingga ${cf.end_date}`],
        [],
        ['BAKI TUNAI AWAL', cf.opening_cash],
        [],
        ['ALIRAN MASUK'],
        ['Sumber', 'Amaun (RM)'],
        ...cf.cash_inflows.map(item => [item.source, item.amount]),
        ['Jumlah Aliran Masuk', cf.total_inflows],
        [],
        ['ALIRAN KELUAR'],
        ['Tujuan', 'Amaun (RM)'],
        ...cf.cash_outflows.map(item => [item.purpose, item.amount]),
        ['Jumlah Aliran Keluar', cf.total_outflows],
        [],
        [cf.net_cash_change >= 0 ? 'Pertambahan Tunai Bersih' : 'Pengurangan Tunai Bersih', Math.abs(cf.net_cash_change)],
        ['BAKI TUNAI AKHIR', cf.closing_cash],
      ];
      const cfWs = XLSX.utils.aoa_to_sheet(cfData);
      cfWs['!cols'] = [{ wch: 35 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, cfWs, 'Aliran Tunai');
    }

    XLSX.writeFile(wb, `Laporan_AGM_${es.financial_year.replace(/\s+/g, '_')}.xlsx`);
    toast.success('Laporan Excel berjaya dimuat turun');
  };

  // Export to Word
  const exportToWord = async () => {
    if (!es) {
      toast.error('Sila pilih tahun kewangan terlebih dahulu');
      return;
    }

    const createTableRow = (cells, isHeader = false) => {
      return new TableRow({
        children: cells.map(text => new TableCell({
          children: [new Paragraph({
            children: [new TextRun({ text: String(text), bold: isHeader })],
            alignment: AlignmentType.LEFT,
          })],
          width: { size: 50, type: WidthType.PERCENTAGE },
        })),
      });
    };

    const sections = [];
    const endMonthYear = getReportEndMonthYear();
    const headerRows = agmHeaderRows.length ? agmHeaderRows : ['LAPORAN PENYATA KEWANGAN', `BERAKHIR (${endMonthYear}).`];

    // Logo (top, centered)
    try {
      const [leftLogoBuf, rightLogoBuf] = await Promise.all([
        getImageArrayBuffer(agmHeaderLeftLogo),
        getImageArrayBuffer(agmHeaderRightLogo),
      ]);
      sections.push(
        new Paragraph({
          children: [
            new ImageRun({
              data: new Uint8Array(leftLogoBuf),
              type: 'png',
              transformation: { width: 120, height: 70 },
            }),
            new TextRun({ text: '   ' }),
            new ImageRun({
              data: new Uint8Array(rightLogoBuf),
              type: 'png',
              transformation: { width: 120, height: 70 },
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        })
      );
    } catch (_) {
      // continue without logo
    }

    // Header
    headerRows.forEach((row, idx) => {
      let text = row;
      if (idx === 1 && !String(row).includes('(') && String(row).toUpperCase().includes('BERAKHIR')) {
        text = `${row} (${endMonthYear}).`;
      }
      sections.push(
        new Paragraph({
          children: [new TextRun({ text: String(text), bold: true, size: idx === 0 ? 32 : 28 })],
          alignment: AlignmentType.CENTER,
          spacing: { after: idx === 0 ? 100 : 120 },
        })
      );
    });
    sections.push(
      new Paragraph({
        children: [new TextRun({ text: agmTemplate?.header?.right_title || 'Laporan AGM', bold: true, size: 24 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
      }),
      new Paragraph({
        children: [new TextRun({ text: `Tahun Kewangan: ${es.financial_year}`, size: 22 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
      })
    );

    // Executive Summary
    sections.push(
      new Paragraph({
        text: 'RINGKASAN EKSEKUTIF',
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 200 },
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          createTableRow(['Perkara', 'Amaun'], true),
          createTableRow(['Baki Bawa Ke Hadapan', `RM ${es.opening_balance.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`]),
          createTableRow(['Jumlah Pendapatan', `RM ${es.total_income.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`]),
          createTableRow(['Jumlah Perbelanjaan', `RM ${es.total_expense.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`]),
          createTableRow([es.net_surplus >= 0 ? 'Lebihan' : 'Kurangan', `RM ${Math.abs(es.net_surplus).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`]),
          createTableRow(['Baki Terkumpul', `RM ${es.closing_balance.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`]),
        ],
      }),
      new Paragraph({ text: '', spacing: { after: 400 } })
    );

    // Income & Expenditure
    if (ie) {
      sections.push(
        new Paragraph({
          text: 'PENYATA PENDAPATAN DAN PERBELANJAAN',
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `Bagi Tahun Kewangan Berakhir ${ie.end_date}`, italics: true })],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [new TextRun({ text: 'PENDAPATAN', bold: true })],
          spacing: { after: 100 },
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            createTableRow(['Kategori', 'Amaun (RM)'], true),
            ...ie.income_items.map(item => createTableRow([item.category, `RM ${item.amount.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`])),
            createTableRow(['JUMLAH PENDAPATAN', `RM ${ie.total_income.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`]),
          ],
        }),
        new Paragraph({ text: '', spacing: { after: 200 } }),
        new Paragraph({
          children: [new TextRun({ text: 'PERBELANJAAN', bold: true })],
          spacing: { after: 100 },
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            createTableRow(['Kategori', 'Amaun (RM)'], true),
            ...ie.expense_items.map(item => createTableRow([item.category, `RM ${item.amount.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`])),
            createTableRow(['JUMLAH PERBELANJAAN', `RM ${ie.total_expense.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`]),
          ],
        }),
        new Paragraph({ text: '', spacing: { after: 200 } }),
        new Paragraph({
          children: [new TextRun({ text: `${ie.net_surplus >= 0 ? 'LEBIHAN' : 'KURANGAN'} PENDAPATAN: RM ${Math.abs(ie.net_surplus).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`, bold: true, size: 28 })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
        })
      );
    }

    // Balance Sheet
    if (bs) {
      sections.push(
        new Paragraph({
          text: 'KUNCI KIRA-KIRA',
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `Pada ${bs.as_of_date}`, italics: true })],
          spacing: { after: 200 },
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            createTableRow(['Perkara', 'Amaun (RM)'], true),
            createTableRow(['ASET', '']),
            ...bs.bank_balances.map(acc => createTableRow([`  - ${acc.account_name}`, `RM ${acc.balance.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`])),
            createTableRow(['JUMLAH ASET', `RM ${bs.total_assets.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`]),
            createTableRow(['', '']),
            createTableRow(['LIABILITI & EKUITI', '']),
            createTableRow(['Dana Bawa Ke Hadapan', `RM ${bs.opening_fund.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`]),
            createTableRow([bs.current_surplus >= 0 ? 'Lebihan Tahun Semasa' : 'Kurangan Tahun Semasa', `RM ${bs.current_surplus.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`]),
            createTableRow(['JUMLAH LIABILITI & EKUITI', `RM ${bs.total_liabilities_equity.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`]),
          ],
        }),
        new Paragraph({ text: '', spacing: { after: 400 } })
      );
    }

    // Cash Flow
    if (cf) {
      sections.push(
        new Paragraph({
          text: 'PENYATA ALIRAN TUNAI',
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `Bagi Tahun Kewangan ${cf.start_date} hingga ${cf.end_date}`, italics: true })],
          spacing: { after: 200 },
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            createTableRow(['Perkara', 'Amaun (RM)'], true),
            createTableRow(['BAKI TUNAI AWAL', `RM ${cf.opening_cash.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`]),
            createTableRow(['', '']),
            createTableRow(['ALIRAN MASUK', '']),
            ...cf.cash_inflows.map(item => createTableRow([`  ${item.source}`, `RM ${item.amount.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`])),
            createTableRow(['Jumlah Aliran Masuk', `RM ${cf.total_inflows.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`]),
            createTableRow(['', '']),
            createTableRow(['ALIRAN KELUAR', '']),
            ...cf.cash_outflows.map(item => createTableRow([`  ${item.purpose}`, `RM ${item.amount.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`])),
            createTableRow(['Jumlah Aliran Keluar', `RM ${cf.total_outflows.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`]),
            createTableRow(['', '']),
            createTableRow([cf.net_cash_change >= 0 ? 'Pertambahan Tunai Bersih' : 'Pengurangan Tunai Bersih', `RM ${Math.abs(cf.net_cash_change).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`]),
            createTableRow(['BAKI TUNAI AKHIR', `RM ${cf.closing_cash.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`]),
          ],
        })
      );
    }

    // Footer
    sections.push(
      new Paragraph({ text: '', spacing: { after: 400 } }),
      ...(agmFooterRows || []).map((row) => (
        new Paragraph({
          children: [new TextRun({ text: String(row), size: 20 })],
          alignment: AlignmentType.LEFT,
          spacing: { after: 60 },
        })
      )),
      new Paragraph({
        children: [new TextRun({ text: `Dijana pada: ${new Date().toLocaleString('ms-MY')}`, italics: true, size: 20 })],
        alignment: AlignmentType.RIGHT,
      })
    );

    const doc = new Document({
      sections: [{
        properties: {},
        children: sections,
      }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `Laporan_AGM_${es.financial_year.replace(/\s+/g, '_')}.docx`);
    toast.success('Laporan Word berjaya dimuat turun');
  };

  const { incomeExpenditure: ie, balanceSheet: bs, cashFlow: cf, executiveSummary: es, trialBalance: tb } = reportData;
  const { leftBoxes: agmFooterLeftBoxes, rightBoxes: agmFooterRightBoxes } = getAllAgmFooterBoxes();

  const handlePrintFromPreview = () => {
    setPrintPreviewMode(false);
    setTimeout(() => window.print(), 100);
  };

  return (
    <>
      {/* Print Preview Overlay */}
      {printPreviewMode && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-white border-b shadow-md print:hidden" data-testid="print-preview-overlay">
          <div className="flex items-center justify-between px-4 py-3 max-w-6xl mx-auto">
            <span className="font-semibold text-gray-800">Pratonton sebelum cetak — kandungan di bawah ialah yang akan dicetak</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handlePrintFromPreview}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Printer className="w-4 h-4" />
                Cetak
              </button>
              <button
                type="button"
                onClick={() => setPrintPreviewMode(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100"
              >
                Tutup pratonton
              </button>
            </div>
          </div>
        </div>
      )}

    <div className={`min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-6 print:bg-white print:p-0 min-w-0 overflow-x-hidden ${printPreviewMode ? 'pt-16' : ''}`} data-testid="agm-reports-page">
      {/* Header */}
      <div className="mb-6 print:hidden">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <button 
              onClick={() => navigate('/admin/accounting-full')}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Kembali
            </button>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <FileText className="w-8 h-8 text-amber-600" />
              Laporan AGM
            </h1>
            <p className="text-gray-600 mt-1">Laporan kewangan untuk pembentangan mesyuarat</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <select 
                value={selectedYear} 
                onChange={(e) => setSelectedYear(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                data-testid="year-select"
                title="Tahun Kewangan dari modul perakaunan (boleh berbeza dengan tahun di halaman AR)"
              >
                <option value="">Pilih Tahun Kewangan</option>
                {years.map(y => (
                  <option key={y.id} value={y.id}>{y.name}</option>
                ))}
              </select>
              {years.length === 0 && !loading && (
                <span className="text-sm text-amber-700" title="Tiada tahun kewangan dalam sistem. Sila tambah di Tetapan Tahun Kewangan.">
                  Tiada tahun kewangan
                </span>
              )}
            </div>
            <button onClick={fetchAllReports} disabled={loading} className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50" data-testid="refresh-btn">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Muat Semula
            </button>
            
            {/* Export Dropdown */}
            <div className="relative group">
              <button className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700" data-testid="export-dropdown-btn">
                <Download className="w-4 h-4" />
                Eksport
              </button>
              <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                <button 
                  onClick={exportToPDF} 
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 rounded-t-lg"
                  data-testid="export-pdf-btn"
                >
                  <FileText className="w-5 h-5 text-red-500" />
                  <div>
                    <p className="font-medium">PDF</p>
                    <p className="text-xs text-gray-500">Format cetakan</p>
                  </div>
                </button>
                <button 
                  onClick={exportToExcel} 
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 border-t border-gray-100"
                  data-testid="export-excel-btn"
                >
                  <FileSpreadsheet className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="font-medium">Excel</p>
                    <p className="text-xs text-gray-500">Format spreadsheet</p>
                  </div>
                </button>
                <button 
                  onClick={exportToWord} 
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 rounded-b-lg border-t border-gray-100"
                  data-testid="export-word-btn"
                >
                  <FileType className="w-5 h-5 text-blue-600" />
                  <div>
                    <p className="font-medium">Word</p>
                    <p className="text-xs text-gray-500">Format dokumen</p>
                  </div>
                </button>
              </div>
            </div>
            
            <button onClick={() => setPrintPreviewMode(true)} className="flex items-center gap-2 px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50" data-testid="preview-print-btn">
              <FileText className="w-4 h-4" />
              Pratonton cetak
            </button>
            <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700" data-testid="print-btn">
              <Printer className="w-4 h-4" />
              Cetak
            </button>
          </div>
        </div>
      </div>

      {/* Print Header */}
      <div className="hidden print:block mb-8 border-b border-gray-300 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <img src={agmHeaderLeftLogo} alt="Logo kiri AGM" className="h-16 w-16 object-contain" />
            <img src={agmHeaderRightLogo} alt="Logo kanan AGM" className="h-16 w-16 object-contain" />
            <div className="pt-1">
              {agmHeaderRows.map((row, idx) => {
                let text = row;
                if (idx === 1 && !String(row).includes('(') && String(row).toUpperCase().includes('BERAKHIR')) {
                  text = `${row} (${getReportEndMonthYear()}).`;
                }
                return (
                  <p key={`agm-print-header-row-${idx}`} className={idx === 0 ? 'text-lg font-bold text-gray-900' : 'text-sm text-gray-700'}>
                    {text}
                  </p>
                );
              })}
              {agmHeaderRows.length === 0 && (
                <>
                  <h1 className="text-lg font-bold">LAPORAN PENYATA KEWANGAN</h1>
                  <h2 className="text-sm font-semibold">BERAKHIR ({getReportEndMonthYear()}).</h2>
                </>
              )}
              <p className="text-sm text-gray-600">Tahun Kewangan: {es?.financial_year}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-gray-900">{agmTemplate?.header?.right_title || 'Laporan AGM'}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 print:shadow-none print:border-0">
        <div className="flex border-b print:hidden overflow-x-auto">
          {[
            { id: 'summary', label: 'Ringkasan Eksekutif' },
            { id: 'income-expenditure', label: 'Pendapatan & Perbelanjaan' },
            { id: 'balance-sheet', label: 'Kunci Kira-kira' },
            { id: 'cash-flow', label: 'Aliran Tunai' },
            { id: 'trial-balance', label: 'Imbangan Duga' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 px-4 text-center text-sm font-medium whitespace-nowrap ${activeTab === tab.id ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              data-testid={`tab-${tab.id}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-4 md:p-6">
          {/* Executive Summary */}
          {activeTab === 'summary' && es && (
            <div className="space-y-6">
              {/* Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-4">
                  <p className="text-blue-100 text-sm">Baki Bawa Ke Hadapan</p>
                  <p className="text-2xl font-bold">RM {es.opening_balance.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl p-4">
                  <p className="text-green-100 text-sm">Jumlah Pendapatan</p>
                  <p className="text-2xl font-bold">RM {es.total_income.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</p>
                  {es.income_change_percent !== null && (
                    <p className={`text-sm flex items-center gap-1 ${es.income_change_percent >= 0 ? 'text-green-200' : 'text-red-200'}`}>
                      {es.income_change_percent >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {es.income_change_percent >= 0 ? '+' : ''}{es.income_change_percent}%
                    </p>
                  )}
                </div>
                <div className="bg-gradient-to-br from-red-500 to-red-600 text-white rounded-xl p-4">
                  <p className="text-red-100 text-sm">Jumlah Perbelanjaan</p>
                  <p className="text-2xl font-bold">RM {es.total_expense.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</p>
                  {es.expense_change_percent !== null && (
                    <p className={`text-sm flex items-center gap-1 ${es.expense_change_percent <= 0 ? 'text-green-200' : 'text-red-200'}`}>
                      {es.expense_change_percent >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {es.expense_change_percent >= 0 ? '+' : ''}{es.expense_change_percent}%
                    </p>
                  )}
                </div>
                <div className={`bg-gradient-to-br ${es.net_surplus >= 0 ? 'from-emerald-500 to-emerald-600' : 'from-orange-500 to-orange-600'} text-white rounded-xl p-4`}>
                  <p className="text-emerald-100 text-sm">{es.net_surplus >= 0 ? 'Lebihan' : 'Kurangan'}</p>
                  <p className="text-2xl font-bold">RM {Math.abs(es.net_surplus).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>

              {/* Closing Balance */}
              <div className="border-2 border-blue-200 bg-blue-50 rounded-xl p-6 text-center">
                <p className="text-blue-600 font-medium">Baki Terkumpul (Closing Balance)</p>
                <p className="text-4xl font-bold text-blue-700">
                  RM {es.closing_balance.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                </p>
              </div>

              {/* Top Sources & Expenses */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-50 rounded-xl p-5">
                  <h3 className="font-semibold text-gray-800 flex items-center gap-2 mb-4">
                    <ArrowUpCircle className="w-5 h-5 text-green-600" />
                    Top 5 Sumber Pendapatan
                  </h3>
                  <div className="space-y-3">
                    {es.top_income_sources.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">{idx + 1}.</span>
                          <span>{item.category}</span>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-green-600">RM {item.amount.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</p>
                          <p className="text-xs text-gray-500">{item.percentage}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-5">
                  <h3 className="font-semibold text-gray-800 flex items-center gap-2 mb-4">
                    <ArrowDownCircle className="w-5 h-5 text-red-600" />
                    Top 5 Item Perbelanjaan
                  </h3>
                  <div className="space-y-3">
                    {es.top_expense_items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">{idx + 1}.</span>
                          <span>{item.category}</span>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-red-600">RM {item.amount.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</p>
                          <p className="text-xs text-gray-500">{item.percentage}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bank Accounts */}
              <div className="bg-gray-50 rounded-xl p-5">
                <h3 className="font-semibold text-gray-800 flex items-center gap-2 mb-4">
                  <Building2 className="w-5 h-5" />
                  Kedudukan Akaun Bank
                </h3>
                <div className="space-y-3">
                  {es.bank_accounts.map((acc, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-white rounded-lg">
                      <div>
                        <p className="font-medium">{acc.account_name}</p>
                        <p className="text-sm text-gray-500">{acc.account_type}</p>
                      </div>
                      <p className="text-lg font-bold text-blue-600">
                        RM {acc.balance.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  ))}
                  <div className="flex items-center justify-between p-3 bg-blue-100 rounded-lg border-2 border-blue-300">
                    <p className="font-bold text-blue-700">Jumlah Tunai</p>
                    <p className="text-xl font-bold text-blue-700">
                      RM {es.total_cash.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </div>

              {/* Highlights & Recommendations */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-50 rounded-xl p-5">
                  <h3 className="font-semibold text-gray-800 flex items-center gap-2 mb-4">
                    <CheckCircle2 className="w-5 h-5 text-blue-600" />
                    Sorotan
                  </h3>
                  <ul className="space-y-2">
                    {es.highlights.map((h, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-gray-50 rounded-xl p-5">
                  <h3 className="font-semibold text-gray-800 flex items-center gap-2 mb-4">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                    Cadangan
                  </h3>
                  <ul className="space-y-2">
                    {es.recommendations.map((r, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Audit Status */}
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Status Transaksi</p>
                    <p className="text-lg font-semibold">
                      {es.verified_transactions} / {es.total_transactions} transaksi telah disahkan
                    </p>
                  </div>
                  {es.pending_transactions > 0 && (
                    <div className="text-right">
                      <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm">
                        {es.pending_transactions} menunggu pengesahan
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Income & Expenditure Statement */}
          {activeTab === 'income-expenditure' && ie && (
            <div>
              <div className="text-center border-b pb-4 mb-6">
                <h2 className="text-xl font-bold">PENYATA PENDAPATAN DAN PERBELANJAAN</h2>
                <p className="text-gray-600">Bagi Tahun Kewangan Berakhir {ie.end_date}</p>
              </div>
              <table className="w-full">
                <tbody>
                  <tr className="bg-green-50">
                    <td colSpan="2" className="py-2 px-4 font-bold text-green-700">PENDAPATAN</td>
                  </tr>
                  {ie.income_items.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="py-2 px-4 pl-8">{item.category}</td>
                      <td className="py-2 px-4 text-right">RM {item.amount.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                  <tr className="bg-green-100 font-bold">
                    <td className="py-2 px-4">JUMLAH PENDAPATAN</td>
                    <td className="py-2 px-4 text-right">RM {ie.total_income.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</td>
                  </tr>
                  <tr><td colSpan="2" className="py-2"></td></tr>
                  <tr className="bg-red-50">
                    <td colSpan="2" className="py-2 px-4 font-bold text-red-700">PERBELANJAAN</td>
                  </tr>
                  {ie.expense_items.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="py-2 px-4 pl-8">{item.category}</td>
                      <td className="py-2 px-4 text-right">RM {item.amount.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                  <tr className="bg-red-100 font-bold">
                    <td className="py-2 px-4">JUMLAH PERBELANJAAN</td>
                    <td className="py-2 px-4 text-right">RM {ie.total_expense.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</td>
                  </tr>
                  <tr><td colSpan="2" className="py-4"></td></tr>
                  <tr className={`${ie.net_surplus >= 0 ? 'bg-blue-100' : 'bg-orange-100'} font-bold text-lg`}>
                    <td className="py-3 px-4">{ie.net_surplus >= 0 ? 'LEBIHAN PENDAPATAN' : 'KURANGAN PENDAPATAN'}</td>
                    <td className="py-3 px-4 text-right">RM {Math.abs(ie.net_surplus).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Balance Sheet */}
          {activeTab === 'balance-sheet' && bs && (
            <div>
              <div className="text-center border-b pb-4 mb-6">
                <h2 className="text-xl font-bold">KUNCI KIRA-KIRA</h2>
                <p className="text-gray-600">Pada {bs.as_of_date}</p>
              </div>
              <table className="w-full">
                <tbody>
                  <tr className="bg-blue-50">
                    <td colSpan="2" className="py-2 px-4 font-bold text-blue-700">ASET</td>
                  </tr>
                  <tr><td className="py-1 px-4 pl-6 font-semibold text-blue-600">Aset Semasa</td><td></td></tr>
                  <tr><td className="py-1 px-4 pl-10">Wang di Bank:</td><td></td></tr>
                  {bs.bank_balances.map((acc, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="py-1 px-4 pl-14">- {acc.account_name}</td>
                      <td className="py-1 px-4 text-right">RM {acc.balance.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2 px-4 pl-10">Jumlah Wang di Bank</td>
                    <td className="py-2 px-4 text-right">RM {bs.total_bank_balance.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</td>
                  </tr>
                  <tr className="bg-blue-100 font-bold">
                    <td className="py-2 px-4">JUMLAH ASET</td>
                    <td className="py-2 px-4 text-right">RM {bs.total_assets.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</td>
                  </tr>
                  <tr><td colSpan="2" className="py-4"></td></tr>
                  <tr className="bg-amber-50">
                    <td colSpan="2" className="py-2 px-4 font-bold text-amber-700">LIABILITI & EKUITI</td>
                  </tr>
                  <tr><td className="py-1 px-4 pl-6 font-semibold text-green-600">Dana Terkumpul</td><td></td></tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-1 px-4 pl-10">Dana Bawa Ke Hadapan</td>
                    <td className="py-1 px-4 text-right">RM {bs.opening_fund.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-1 px-4 pl-10">{bs.current_surplus >= 0 ? 'Lebihan' : 'Kurangan'} Tahun Semasa</td>
                    <td className="py-1 px-4 text-right">RM {bs.current_surplus.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</td>
                  </tr>
                  <tr className="font-semibold">
                    <td className="py-2 px-4 pl-10">Dana Terkumpul</td>
                    <td className="py-2 px-4 text-right">RM {bs.closing_fund.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</td>
                  </tr>
                  <tr className="bg-amber-100 font-bold">
                    <td className="py-2 px-4">JUMLAH LIABILITI & EKUITI</td>
                    <td className="py-2 px-4 text-right">RM {bs.total_liabilities_equity.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Cash Flow Statement */}
          {activeTab === 'cash-flow' && cf && (
            <div>
              <div className="text-center border-b pb-4 mb-6">
                <h2 className="text-xl font-bold">PENYATA ALIRAN TUNAI</h2>
                <p className="text-gray-600">Bagi Tahun Kewangan {cf.start_date} hingga {cf.end_date}</p>
              </div>
              <table className="w-full">
                <tbody>
                  <tr className="bg-gray-100 font-bold">
                    <td className="py-2 px-4">BAKI TUNAI AWAL</td>
                    <td className="py-2 px-4 text-right">RM {cf.opening_cash.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</td>
                  </tr>
                  <tr><td colSpan="2" className="py-2"></td></tr>
                  <tr className="bg-green-50">
                    <td colSpan="2" className="py-2 px-4 font-bold text-green-700">ALIRAN MASUK</td>
                  </tr>
                  {cf.cash_inflows.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="py-1 px-4 pl-8">{item.source}</td>
                      <td className="py-1 px-4 text-right">RM {item.amount.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                  <tr className="bg-green-100 font-semibold">
                    <td className="py-2 px-4">Jumlah Aliran Masuk</td>
                    <td className="py-2 px-4 text-right">RM {cf.total_inflows.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</td>
                  </tr>
                  <tr><td colSpan="2" className="py-2"></td></tr>
                  <tr className="bg-red-50">
                    <td colSpan="2" className="py-2 px-4 font-bold text-red-700">ALIRAN KELUAR</td>
                  </tr>
                  {cf.cash_outflows.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="py-1 px-4 pl-8">{item.purpose}</td>
                      <td className="py-1 px-4 text-right">RM {item.amount.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                  <tr className="bg-red-100 font-semibold">
                    <td className="py-2 px-4">Jumlah Aliran Keluar</td>
                    <td className="py-2 px-4 text-right">RM {cf.total_outflows.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</td>
                  </tr>
                  <tr><td colSpan="2" className="py-4"></td></tr>
                  <tr className={`${cf.net_cash_change >= 0 ? 'bg-blue-50' : 'bg-orange-50'} font-semibold`}>
                    <td className="py-2 px-4">{cf.net_cash_change >= 0 ? 'Pertambahan' : 'Pengurangan'} Tunai Bersih</td>
                    <td className="py-2 px-4 text-right">RM {Math.abs(cf.net_cash_change).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</td>
                  </tr>
                  <tr className="bg-blue-100 font-bold text-lg">
                    <td className="py-3 px-4">BAKI TUNAI AKHIR</td>
                    <td className="py-3 px-4 text-right">RM {cf.closing_cash.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Trial Balance / Imbangan Duga */}
          {activeTab === 'trial-balance' && (
            <div data-testid="trial-balance-content">
              {/* Period Filter */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg print:hidden">
                <div className="flex flex-wrap items-center gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Jenis Tempoh</label>
                    <select
                      value={tbPeriodType}
                      onChange={(e) => setTbPeriodType(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      data-testid="tb-period-type"
                    >
                      <option value="financial_year">Tahun Kewangan</option>
                      <option value="month">Bulan</option>
                      <option value="quarter">Suku Tahun</option>
                    </select>
                  </div>
                  
                  {tbPeriodType === 'month' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Bulan</label>
                        <select
                          value={tbMonth}
                          onChange={(e) => setTbMonth(parseInt(e.target.value))}
                          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          data-testid="tb-month"
                        >
                          {Object.entries(MALAY_MONTHS).map(([num, name]) => (
                            <option key={num} value={num}>{name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tahun</label>
                        <input
                          type="number"
                          value={tbYear}
                          onChange={(e) => setTbYear(parseInt(e.target.value))}
                          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 w-24"
                          data-testid="tb-year"
                        />
                      </div>
                    </>
                  )}
                  
                  {tbPeriodType === 'quarter' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Suku</label>
                        <select
                          value={tbQuarter}
                          onChange={(e) => setTbQuarter(parseInt(e.target.value))}
                          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          data-testid="tb-quarter"
                        >
                          <option value={1}>Suku 1 (Mei-Jul)</option>
                          <option value={2}>Suku 2 (Ogos-Okt)</option>
                          <option value={3}>Suku 3 (Nov-Jan)</option>
                          <option value={4}>Suku 4 (Feb-Apr)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tahun</label>
                        <input
                          type="number"
                          value={tbYear}
                          onChange={(e) => setTbYear(parseInt(e.target.value))}
                          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 w-24"
                          data-testid="tb-year-quarter"
                        />
                      </div>
                    </>
                  )}
                  
                  {/* Comparison Toggle */}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="include-comparison"
                      checked={tbIncludeComparison}
                      onChange={(e) => setTbIncludeComparison(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      data-testid="tb-include-comparison"
                    />
                    <label htmlFor="include-comparison" className="text-sm font-medium text-gray-700">
                      Bandingkan dengan Tempoh Sebelumnya
                    </label>
                  </div>
                  
                  <div className="flex items-end">
                    <button
                      onClick={fetchTrialBalance}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                      data-testid="tb-apply-filter"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Terapkan
                    </button>
                  </div>
                </div>
              </div>

              {tb ? (
                <div>
                  <div className="text-center border-b pb-4 mb-6">
                    <h2 className="text-xl font-bold">IMBANGAN DUGA (TRIAL BALANCE)</h2>
                    <p className="text-gray-600">Tempoh: {tb.period_label}</p>
                    <p className="text-gray-500 text-sm">{tb.start_date} hingga {tb.end_date}</p>
                  </div>

                  {/* Balance Status */}
                  <div className={`mb-6 p-4 rounded-lg ${tb.is_balanced ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {tb.is_balanced ? (
                          <CheckCircle2 className="w-6 h-6 text-green-600" />
                        ) : (
                          <AlertCircle className="w-6 h-6 text-red-600" />
                        )}
                        <span className={`font-semibold ${tb.is_balanced ? 'text-green-700' : 'text-red-700'}`}>
                          {tb.is_balanced ? 'Imbangan Duga Seimbang' : 'Imbangan Duga TIDAK Seimbang'}
                        </span>
                      </div>
                      {!tb.is_balanced && (
                        <span className="text-red-600 font-bold">
                          Perbezaan: RM {Math.abs(tb.difference).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Comparison Summary Card */}
                  {tb.has_comparison && tb.comparison_data && (
                    <div className="mb-6 p-4 bg-pastel-mint/50 rounded-lg border border-pastel-lilac" data-testid="comparison-summary">
                      <h3 className="font-bold text-teal-800 mb-3 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5" />
                        Perbandingan dengan {tb.comparison_period_label}
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {/* Income Comparison */}
                        <div className="bg-white p-3 rounded-lg">
                          <p className="text-xs text-gray-500">Pendapatan</p>
                          <p className="text-lg font-bold text-green-600">
                            RM {tb.total_income.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                          </p>
                          <div className={`text-sm flex items-center gap-1 ${tb.comparison_data.income_variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {tb.comparison_data.income_variance >= 0 ? (
                              <ArrowUpRight className="w-4 h-4" />
                            ) : (
                              <ArrowDownRight className="w-4 h-4" />
                            )}
                            <span>
                              {tb.comparison_data.income_variance >= 0 ? '+' : ''}{tb.comparison_data.income_variance.toLocaleString('ms-MY', { minimumFractionDigits: 2 })} 
                              ({tb.comparison_data.income_pct_change >= 0 ? '+' : ''}{tb.comparison_data.income_pct_change}%)
                            </span>
                          </div>
                          <p className="text-xs text-gray-400">Sebelum: RM {tb.comparison_data.prev_total_income.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</p>
                        </div>
                        
                        {/* Expense Comparison */}
                        <div className="bg-white p-3 rounded-lg">
                          <p className="text-xs text-gray-500">Perbelanjaan</p>
                          <p className="text-lg font-bold text-red-600">
                            RM {tb.total_expense.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                          </p>
                          <div className={`text-sm flex items-center gap-1 ${tb.comparison_data.expense_variance <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {tb.comparison_data.expense_variance <= 0 ? (
                              <ArrowDownRight className="w-4 h-4" />
                            ) : (
                              <ArrowUpRight className="w-4 h-4" />
                            )}
                            <span>
                              {tb.comparison_data.expense_variance >= 0 ? '+' : ''}{tb.comparison_data.expense_variance.toLocaleString('ms-MY', { minimumFractionDigits: 2 })} 
                              ({tb.comparison_data.expense_pct_change >= 0 ? '+' : ''}{tb.comparison_data.expense_pct_change}%)
                            </span>
                          </div>
                          <p className="text-xs text-gray-400">Sebelum: RM {tb.comparison_data.prev_total_expense.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</p>
                        </div>
                        
                        {/* Bank Balance Comparison */}
                        <div className="bg-white p-3 rounded-lg">
                          <p className="text-xs text-gray-500">Baki Bank</p>
                          <p className="text-lg font-bold text-blue-600">
                            RM {tb.total_bank_balance.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                          </p>
                          <div className={`text-sm flex items-center gap-1 ${tb.comparison_data.bank_variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {tb.comparison_data.bank_variance >= 0 ? (
                              <ArrowUpRight className="w-4 h-4" />
                            ) : (
                              <ArrowDownRight className="w-4 h-4" />
                            )}
                            <span>
                              {tb.comparison_data.bank_variance >= 0 ? '+' : ''}{tb.comparison_data.bank_variance.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400">Sebelum: RM {tb.comparison_data.prev_total_bank.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</p>
                        </div>
                        
                        {/* Trend Summary */}
                        <div className="bg-white p-3 rounded-lg">
                          <p className="text-xs text-gray-500">Trend Kewangan</p>
                          <div className="mt-1 space-y-1">
                            <div className="flex items-center gap-2 text-sm">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                tb.comparison_data.trend_income === 'naik' ? 'bg-green-100 text-green-700' : 
                                tb.comparison_data.trend_income === 'turun' ? 'bg-red-100 text-red-700' : 
                                'bg-gray-100 text-gray-700'
                              }`}>
                                Pendapatan {tb.comparison_data.trend_income === 'naik' ? '↑' : tb.comparison_data.trend_income === 'turun' ? '↓' : '='}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                tb.comparison_data.trend_expense === 'turun' ? 'bg-green-100 text-green-700' : 
                                tb.comparison_data.trend_expense === 'naik' ? 'bg-red-100 text-red-700' : 
                                'bg-gray-100 text-gray-700'
                              }`}>
                                Perbelanjaan {tb.comparison_data.trend_expense === 'naik' ? '↑' : tb.comparison_data.trend_expense === 'turun' ? '↓' : '='}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Trial Balance Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-gray-300">
                      <thead>
                        <tr className="bg-gray-800 text-white">
                          <th className="border border-gray-300 py-3 px-4 text-left">AKAUN / KATEGORI</th>
                          <th className="border border-gray-300 py-3 px-4 text-right w-40">DEBIT (RM)</th>
                          <th className="border border-gray-300 py-3 px-4 text-right w-40">KREDIT (RM)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Assets - Bank Balances (Debit) */}
                        <tr className="bg-blue-50">
                          <td colSpan="3" className="border border-gray-300 py-2 px-4 font-bold text-blue-700">
                            ASET (TUNAI DI BANK)
                          </td>
                        </tr>
                        {tb.bank_balances.map((acc, idx) => (
                          <tr key={`bank-${idx}`} className="hover:bg-gray-50">
                            <td className="border border-gray-300 py-2 px-4 pl-8">{acc.account_name} ({acc.account_type})</td>
                            <td className="border border-gray-300 py-2 px-4 text-right font-mono">
                              {acc.balance.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="border border-gray-300 py-2 px-4 text-right font-mono text-gray-400">-</td>
                          </tr>
                        ))}
                        <tr className="bg-blue-100 font-semibold">
                          <td className="border border-gray-300 py-2 px-4">Jumlah Aset</td>
                          <td className="border border-gray-300 py-2 px-4 text-right font-mono">
                            {tb.total_bank_balance.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="border border-gray-300 py-2 px-4 text-right font-mono text-gray-400">-</td>
                        </tr>

                        {/* Expenses (Debit) */}
                        <tr className="bg-red-50">
                          <td colSpan="3" className="border border-gray-300 py-2 px-4 font-bold text-red-700">
                            PERBELANJAAN
                          </td>
                        </tr>
                        {tb.expense_items.map((item, idx) => (
                          <tr key={`exp-${idx}`} className="hover:bg-gray-50">
                            <td className="border border-gray-300 py-2 px-4 pl-8">{item.category_name}</td>
                            <td className="border border-gray-300 py-2 px-4 text-right font-mono">
                              {item.debit.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="border border-gray-300 py-2 px-4 text-right font-mono text-gray-400">-</td>
                          </tr>
                        ))}
                        {tb.expense_items.length === 0 && (
                          <tr className="text-gray-500">
                            <td className="border border-gray-300 py-2 px-4 pl-8 italic">Tiada perbelanjaan</td>
                            <td className="border border-gray-300 py-2 px-4 text-right">-</td>
                            <td className="border border-gray-300 py-2 px-4 text-right">-</td>
                          </tr>
                        )}
                        <tr className="bg-red-100 font-semibold">
                          <td className="border border-gray-300 py-2 px-4">Jumlah Perbelanjaan</td>
                          <td className="border border-gray-300 py-2 px-4 text-right font-mono">
                            {tb.total_expense.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="border border-gray-300 py-2 px-4 text-right font-mono text-gray-400">-</td>
                        </tr>

                        {/* Opening Balance / Equity (Credit) */}
                        <tr className="bg-pastel-lavender">
                          <td colSpan="3" className="border border-gray-300 py-2 px-4 font-bold text-violet-700">
                            EKUITI (BAKI BAWA KE HADAPAN)
                          </td>
                        </tr>
                        {tb.opening_balances.map((ob, idx) => (
                          <tr key={`ob-${idx}`} className="hover:bg-gray-50">
                            <td className="border border-gray-300 py-2 px-4 pl-8">{ob.account_name}</td>
                            <td className="border border-gray-300 py-2 px-4 text-right font-mono text-gray-400">-</td>
                            <td className="border border-gray-300 py-2 px-4 text-right font-mono">
                              {ob.amount.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                        {tb.opening_balances.length === 0 && (
                          <tr className="text-gray-500">
                            <td className="border border-gray-300 py-2 px-4 pl-8 italic">Tiada baki bawa ke hadapan</td>
                            <td className="border border-gray-300 py-2 px-4 text-right">-</td>
                            <td className="border border-gray-300 py-2 px-4 text-right">-</td>
                          </tr>
                        )}
                        <tr className="bg-pastel-lavender font-semibold">
                          <td className="border border-gray-300 py-2 px-4">Jumlah Ekuiti</td>
                          <td className="border border-gray-300 py-2 px-4 text-right font-mono text-gray-400">-</td>
                          <td className="border border-gray-300 py-2 px-4 text-right font-mono">
                            {tb.total_opening_balance.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>

                        {/* Income (Credit) */}
                        <tr className="bg-green-50">
                          <td colSpan="3" className="border border-gray-300 py-2 px-4 font-bold text-green-700">
                            PENDAPATAN
                          </td>
                        </tr>
                        {tb.income_items.map((item, idx) => (
                          <tr key={`inc-${idx}`} className="hover:bg-gray-50">
                            <td className="border border-gray-300 py-2 px-4 pl-8">{item.category_name}</td>
                            <td className="border border-gray-300 py-2 px-4 text-right font-mono text-gray-400">-</td>
                            <td className="border border-gray-300 py-2 px-4 text-right font-mono">
                              {item.credit.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                        {tb.income_items.length === 0 && (
                          <tr className="text-gray-500">
                            <td className="border border-gray-300 py-2 px-4 pl-8 italic">Tiada pendapatan</td>
                            <td className="border border-gray-300 py-2 px-4 text-right">-</td>
                            <td className="border border-gray-300 py-2 px-4 text-right">-</td>
                          </tr>
                        )}
                        <tr className="bg-green-100 font-semibold">
                          <td className="border border-gray-300 py-2 px-4">Jumlah Pendapatan</td>
                          <td className="border border-gray-300 py-2 px-4 text-right font-mono text-gray-400">-</td>
                          <td className="border border-gray-300 py-2 px-4 text-right font-mono">
                            {tb.total_income.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>

                        {/* TOTALS */}
                        <tr className="bg-gray-800 text-white font-bold text-lg">
                          <td className="border border-gray-300 py-3 px-4">JUMLAH</td>
                          <td className="border border-gray-300 py-3 px-4 text-right font-mono">
                            {tb.total_debit.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="border border-gray-300 py-3 px-4 text-right font-mono">
                            {tb.total_credit.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Generated Date */}
                  <div className="mt-4 text-right text-sm text-gray-500">
                    Dijana pada: {tb.generated_date}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-500">Sila pilih tahun kewangan dan klik "Terapkan" untuk melihat Imbangan Duga.</p>
                </div>
              )}
            </div>
          )}

          {!selectedYear && !loading && (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500">
                {years.length === 0
                  ? 'Tiada tahun kewangan dalam sistem. Laporan AGM guna Tahun Kewangan dari modul perakaunan (bukan tahun kalendar di AR).'
                  : 'Sila pilih tahun kewangan untuk melihat laporan.'}
              </p>
              {years.length === 0 && (
                <button
                  type="button"
                  onClick={() => navigate('/admin/accounting/financial-years')}
                  className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                >
                  Pergi ke Tetapan Tahun Kewangan
                </button>
              )}
            </div>
          )}
        </div>

        {/* Print Footer */}
        <div className="hidden print:block mt-8 border-t border-gray-300 pt-4">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              {agmFooterLeftBoxes.map((box, boxIndex) => {
                const boxImage = resolveAgmReportTemplateAssetUrl(box?.image_url);
                return (
                  <div key={`agm-print-footer-left-${boxIndex}`} className="rounded border border-gray-300 p-2">
                    {boxImage && (
                      <img src={boxImage} alt={`Footer kiri ${boxIndex + 1}`} className="h-12 w-auto object-contain mb-1" />
                    )}
                    {box?.title && <p className="text-xs font-semibold">{box.title}</p>}
                    {(box?.rows || []).map((row, rowIndex) => (
                      <p key={`agm-print-footer-left-${boxIndex}-row-${rowIndex}`} className="text-[11px] text-gray-600">
                        {row}
                      </p>
                    ))}
                    {(box?.upload_rows || []).map((row, rowIndex) => {
                      const rowImage = resolveAgmReportTemplateAssetUrl(row?.image_url);
                      if (!rowImage && !row?.caption) return null;
                      return (
                        <div key={`agm-print-footer-left-${boxIndex}-upload-${rowIndex}`} className="mt-1">
                          {rowImage && (
                            <img src={rowImage} alt={`Lampiran kiri ${rowIndex + 1}`} className="h-8 w-auto object-contain" />
                          )}
                          {row?.caption && <p className="text-[10px] text-gray-500">{row.caption}</p>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div className="space-y-3">
              {agmFooterRightBoxes.map((box, boxIndex) => {
                const boxImage = resolveAgmReportTemplateAssetUrl(box?.image_url);
                return (
                  <div key={`agm-print-footer-right-${boxIndex}`} className="rounded border border-gray-300 p-2">
                    {boxImage && (
                      <img src={boxImage} alt={`Footer kanan ${boxIndex + 1}`} className="h-12 w-auto object-contain mb-1" />
                    )}
                    {box?.title && <p className="text-xs font-semibold">{box.title}</p>}
                    {(box?.rows || []).map((row, rowIndex) => (
                      <p key={`agm-print-footer-right-${boxIndex}-row-${rowIndex}`} className="text-[11px] text-gray-600">
                        {row}
                      </p>
                    ))}
                    {(box?.upload_rows || []).map((row, rowIndex) => {
                      const rowImage = resolveAgmReportTemplateAssetUrl(row?.image_url);
                      if (!rowImage && !row?.caption) return null;
                      return (
                        <div key={`agm-print-footer-right-${boxIndex}-upload-${rowIndex}`} className="mt-1">
                          {rowImage && (
                            <img src={rowImage} alt={`Lampiran kanan ${rowIndex + 1}`} className="h-8 w-auto object-contain" />
                          )}
                          {row?.caption && <p className="text-[10px] text-gray-500">{row.caption}</p>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-3 border-t border-dashed border-gray-200 pt-2 text-center">
            {agmFooterRows.map((row, idx) => (
              <p key={`agm-print-footer-row-${idx}`} className={idx === 0 ? 'text-xs font-semibold text-gray-700' : 'text-[11px] text-gray-500 mt-1'}>
                {row}
              </p>
            ))}
            <p className="text-[11px] text-gray-500 mt-1">Dijana pada: {new Date().toLocaleString('ms-MY')}</p>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
