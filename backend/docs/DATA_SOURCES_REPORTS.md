# Sumber Data Laporan & Graf (Reports & Charts Data Sources)

Semua halaman pelaporan, graf dan carta disegerakkan dengan data dalam pangkalan data dan sistem kewangan sedia ada.

## Koleksi DB yang digunakan

| Modul / Laporan | Koleksi | Keterangan |
|-----------------|---------|------------|
| **Yuran** | `student_yuran`, `set_yuran`, `payments` | Laporan yuran, pecahan tingkatan, kutipan, Analisis AI |
| **Kewangan Dashboard** | `tabung_donations`, `tabung_campaigns`, `accounting_transactions`, `accounting_categories` | Ringkasan kewangan, income/expense, kempen |
| **Analisis Kewangan AI** | `student_yuran`, `students` | Graf by tingkatan, jantina, negeri; cadangan AI |
| **Laporan (Reports)** | `student_yuran`, `payments`, `fees` | Laporan yuran, kutipan, laporan bulanan |
| **Perakaunan** | `accounting_transactions`, `accounting_categories`, `commission_records` | Ringkasan akaun, Muafakat, Koperasi, PUM |
| **Koperasi** | `koop_orders`, `koop_kits`, `koop_products`, `koperasi_settings` | Laporan koperasi, laporan detail, komisyen |
| **AGM / Accounting Full** | `accounting_transactions`, financial years, categories | Laporan AGM, trial balance, income/expenditure |

## Endpoint utama

- **Financial Dashboard**: `/api/financial-dashboard/*` (summary, yuran-breakdown, analytics-ai, yuran-detailed-report, kategori-bayaran, donation-trends, campaign-performance, recent-transactions)
- **Reports**: `/api/reports/fees`, `/api/reports/collection`, `/api/reports/monthly` — semua dari DB
- **Accounting**: `/api/accounting/summary`, `/api/accounting/monthly-trend` — dari accounting_transactions & commission_records
- **Koperasi**: `/api/koperasi/laporan-detail`, `/api/koperasi/admin/stats`, `/api/koperasi/commission/report`
- **AGM**: `/api/accounting-full/agm/*`, `/api/accounting-full/reports/monthly`, `/api/accounting-full/reports/annual`

Tiada data statik atau mock untuk laporan/graf; semua nilai dari pangkalan data.
