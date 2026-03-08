"""
Accounting Module - Pydantic Models
Sistem Perakaunan MRSM Bersepadu dengan Kawalan Audit
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


# ==================== ENUMS ====================

class TransactionType(str, Enum):
    INCOME = "income"      # Wang Masuk
    EXPENSE = "expense"    # Wang Keluar


class TransactionStatus(str, Enum):
    PENDING = "pending"           # Menunggu Pengesahan
    VERIFIED = "verified"         # Disahkan oleh JuruAudit
    REJECTED = "rejected"         # Ditolak oleh JuruAudit
    LOCKED = "locked"             # Dalam tempoh dikunci


class TransactionSource(str, Enum):
    MANUAL = "manual"             # Kemasukan manual oleh Bendahari
    SYSTEM = "system"             # Auto dari sistem (Yuran, Koperasi, dll)
    EXTERNAL = "external"         # Derma luar / tunai


# ==================== TRANSACTION CATEGORY ====================

class TransactionCategoryCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    type: TransactionType  # income or expense
    description: Optional[str] = None
    parent_id: Optional[str] = None  # For hierarchy support
    account_code: Optional[str] = None  # Kod akaun COA, e.g. 4100
    is_active: bool = True


class TransactionCategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = None
    parent_id: Optional[str] = None
    account_code: Optional[str] = None
    is_active: Optional[bool] = None


class TransactionCategoryResponse(BaseModel):
    id: str
    name: str
    type: str
    description: Optional[str] = None
    parent_id: Optional[str] = None
    parent_name: Optional[str] = None
    account_code: Optional[str] = None
    is_active: bool
    created_at: str
    created_by_name: Optional[str] = None


# ==================== JOURNAL (DOUBLE-ENTRY) ====================

class JournalLineResponse(BaseModel):
    id: str
    account_type: str  # bank | category
    account_id: str
    account_code: Optional[str] = None
    account_name: str
    debit: float
    credit: float
    memo: Optional[str] = None


class JournalEntryResponse(BaseModel):
    id: str
    entry_number: str
    transaction_id: str
    transaction_date: str
    description: str
    source: str
    status: str
    total_debit: float
    total_credit: float
    lines: List["JournalLineResponse"]
    created_at: str
    created_by_name: Optional[str] = None


# ==================== TRANSACTION ====================

class TransactionCreate(BaseModel):
    type: TransactionType  # income or expense
    category_id: str
    bank_account_id: Optional[str] = None  # Link to bank account
    amount: float = Field(..., gt=0)
    transaction_date: str  # YYYY-MM-DD
    description: str = Field(..., min_length=5, max_length=500)
    reference_number: Optional[str] = None  # External reference
    source: TransactionSource = TransactionSource.MANUAL
    notes: Optional[str] = None


class TransactionUpdate(BaseModel):
    category_id: Optional[str] = None
    bank_account_id: Optional[str] = None  # Link to bank account
    amount: Optional[float] = Field(None, gt=0)
    transaction_date: Optional[str] = None
    description: Optional[str] = Field(None, min_length=5, max_length=500)
    reference_number: Optional[str] = None
    notes: Optional[str] = None


class TransactionVerify(BaseModel):
    status: TransactionStatus  # verified or rejected
    verification_notes: Optional[str] = None


class TransactionResponse(BaseModel):
    id: str
    transaction_number: str  # TRX-YYYY-XXXX
    type: str
    type_display: str
    category_id: str
    category_name: str
    amount: float
    transaction_date: str
    description: str
    reference_number: Optional[str] = None
    source: str
    source_display: str
    status: str
    status_display: str
    notes: Optional[str] = None
    document_url: Optional[str] = None
    created_by: str
    created_by_name: str
    created_at: str
    verified_by: Optional[str] = None
    verified_by_name: Optional[str] = None
    verified_at: Optional[str] = None
    verification_notes: Optional[str] = None


# ==================== PERIOD LOCK ====================

class PeriodLockCreate(BaseModel):
    year: int = Field(..., ge=2020, le=2100)
    month: int = Field(..., ge=1, le=12)
    notes: Optional[str] = None


class PeriodLockResponse(BaseModel):
    id: str
    year: int
    month: int
    month_name: str
    is_locked: bool
    locked_at: Optional[str] = None
    locked_by: Optional[str] = None
    locked_by_name: Optional[str] = None
    notes: Optional[str] = None


# ==================== AUDIT LOG ====================

class AccountingAuditLogResponse(BaseModel):
    id: str
    transaction_id: str
    transaction_number: str
    action: str  # created, updated, verified, rejected, document_uploaded
    action_display: str
    old_value: Optional[dict] = None
    new_value: Optional[dict] = None
    performed_by: str
    performed_by_name: str
    performed_by_role: str
    performed_at: str
    notes: Optional[str] = None


# ==================== REPORTS ====================

class MonthlyReportResponse(BaseModel):
    year: int
    month: int
    month_name: str
    total_income: float
    total_expense: float
    net_balance: float
    income_by_category: List[dict]
    expense_by_category: List[dict]
    transaction_count: int
    verified_count: int
    pending_count: int
    is_locked: bool


class AnnualReportResponse(BaseModel):
    year: int
    total_income: float
    total_expense: float
    net_balance: float
    monthly_breakdown: List[dict]
    income_by_category: List[dict]
    expense_by_category: List[dict]


class BalanceSheetResponse(BaseModel):
    as_of_date: str
    opening_balance: float
    total_income: float
    total_expense: float
    closing_balance: float
    monthly_trend: List[dict]


# ==================== DISPLAY MAPPINGS ====================

TRANSACTION_TYPE_DISPLAY = {
    "income": "Wang Masuk",
    "expense": "Wang Keluar"
}

TRANSACTION_STATUS_DISPLAY = {
    "pending": "Menunggu Pengesahan",
    "verified": "Disahkan",
    "rejected": "Ditolak",
    "locked": "Tempoh Dikunci"
}

TRANSACTION_SOURCE_DISPLAY = {
    "manual": "Kemasukan Manual",
    "system": "Auto Sistem",
    "external": "Sumber Luar"
}

AUDIT_ACTION_DISPLAY = {
    "created": "Dicipta",
    "updated": "Dikemaskini",
    "verified": "Disahkan",
    "rejected": "Ditolak",
    "document_uploaded": "Dokumen Dimuat Naik",
    "document_deleted": "Dokumen Dipadam"
}

# Default Categories
DEFAULT_INCOME_CATEGORIES = [
    {"name": "Yuran Pelajar", "description": "Kutipan yuran tahunan pelajar"},
    {"name": "Derma & Infaq", "description": "Sumbangan dan infaq dari orang awam"},
    {"name": "Tajaan Syarikat", "description": "Sumbangan dari syarikat dan korporat"},
    {"name": "Jualan Merchandise", "description": "Hasil jualan barangan Muafakat"},
    {"name": "Jualan Koperasi", "description": "Hasil jualan kit dan barangan koperasi"},
    {"name": "Jualan PUM", "description": "Hasil jualan Persatuan Usahawan Muda"},
    {"name": "Janaan Komisyen Koperasi", "description": "Hasil komisyen dari jualan koperasi (termasuk komisyen PUM dari Barangan Rasmi)"},
    {"name": "Pendapatan Lain", "description": "Pendapatan lain-lain"}
]

DEFAULT_EXPENSE_CATEGORIES = [
    {"name": "Operasi Am", "description": "Perbelanjaan operasi harian"},
    {"name": "Program Pelajar", "description": "Perbelanjaan program dan aktiviti pelajar"},
    {"name": "Pembelian Inventori", "description": "Pembelian stok untuk jualan"},
    {"name": "Penyelenggaraan", "description": "Perbelanjaan penyelenggaraan fasiliti"},
    {"name": "Upah & Elaun", "description": "Bayaran upah dan elaun"},
    {"name": "Utiliti", "description": "Bil elektrik, air dan utiliti lain"},
    {"name": "Perbelanjaan Lain", "description": "Perbelanjaan lain-lain"}
]

MALAY_MONTHS = {
    1: "Januari", 2: "Februari", 3: "Mac", 4: "April",
    5: "Mei", 6: "Jun", 7: "Julai", 8: "Ogos",
    9: "September", 10: "Oktober", 11: "November", 12: "Disember"
}


# ==================== BANK ACCOUNT ====================

class BankAccountType(str, Enum):
    CURRENT = "current"       # Akaun Semasa
    SAVINGS = "savings"       # Akaun Simpanan
    PETTY_CASH = "petty_cash" # Tunai Runcit
    FIXED_DEPOSIT = "fixed_deposit"  # Simpanan Tetap


BANK_ACCOUNT_TYPE_DISPLAY = {
    "current": "Akaun Semasa",
    "savings": "Akaun Simpanan",
    "petty_cash": "Tunai Runcit",
    "fixed_deposit": "Simpanan Tetap"
}


class BankAccountCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    account_type: BankAccountType
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    description: Optional[str] = None
    account_code: Optional[str] = None  # Kod akaun COA, e.g. 1100
    is_active: bool = True


class BankAccountUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    account_type: Optional[BankAccountType] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    description: Optional[str] = None
    account_code: Optional[str] = None
    is_active: Optional[bool] = None


class BankAccountResponse(BaseModel):
    id: str
    name: str
    account_type: str
    account_type_display: str
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    description: Optional[str] = None
    account_code: Optional[str] = None
    is_active: bool
    current_balance: float = 0.0
    created_at: str
    created_by_name: Optional[str] = None


# ==================== FINANCIAL YEAR ====================

class FinancialYearCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)  # e.g., "2025/2026"
    start_date: str  # YYYY-MM-DD (e.g., "2025-05-01")
    end_date: str    # YYYY-MM-DD (e.g., "2026-04-30")
    is_current: bool = False
    notes: Optional[str] = None


class FinancialYearUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_current: Optional[bool] = None
    is_closed: Optional[bool] = None
    notes: Optional[str] = None


class FinancialYearResponse(BaseModel):
    id: str
    name: str
    start_date: str
    end_date: str
    is_current: bool
    is_closed: bool
    notes: Optional[str] = None
    created_at: str
    created_by_name: Optional[str] = None


# ==================== OPENING BALANCE ====================

class OpeningBalanceCreate(BaseModel):
    financial_year_id: str
    bank_account_id: str
    amount: float = Field(..., ge=0)
    notes: Optional[str] = None


class OpeningBalanceUpdate(BaseModel):
    amount: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = None


class OpeningBalanceResponse(BaseModel):
    id: str
    financial_year_id: str
    financial_year_name: str
    bank_account_id: str
    bank_account_name: str
    amount: float
    notes: Optional[str] = None
    created_at: str
    created_by_name: Optional[str] = None


# ==================== AGM REPORT MODELS ====================

class IncomeExpenditureReportResponse(BaseModel):
    """Penyata Pendapatan & Perbelanjaan"""
    financial_year: str
    start_date: str
    end_date: str
    
    # Pendapatan
    income_items: List[dict]  # [{category, amount}]
    total_income: float
    
    # Perbelanjaan
    expense_items: List[dict]  # [{category, amount}]
    total_expense: float
    
    # Lebihan/Kurangan
    net_surplus: float  # Lebihan pendapatan atas perbelanjaan
    
    # Comparison with previous year
    prev_year_income: Optional[float] = None
    prev_year_expense: Optional[float] = None
    prev_year_surplus: Optional[float] = None


class BalanceSheetReportResponse(BaseModel):
    """Kunci Kira-kira / Lembaran Imbangan"""
    as_of_date: str
    financial_year: str
    
    # Aset Semasa (Current Assets)
    bank_balances: List[dict]  # [{account_name, balance}]
    total_bank_balance: float
    receivables: float  # Penghutang (if any)
    prepayments: float  # Bayaran terdahulu (if any)
    total_current_assets: float
    
    # Aset Tetap (Fixed Assets) - usually 0 for school associations
    fixed_assets: float
    
    # Jumlah Aset
    total_assets: float
    
    # Liabiliti Semasa (Current Liabilities)
    payables: float  # Pemiutang (if any)
    accruals: float  # Akruan (if any)
    total_current_liabilities: float
    
    # Ekuiti / Dana Terkumpul
    opening_fund: float       # Dana bawa ke hadapan
    current_surplus: float    # Lebihan/(kurangan) tahun semasa
    closing_fund: float       # Dana terkumpul
    
    # Jumlah Liabiliti + Ekuiti
    total_liabilities_equity: float


class CashFlowReportResponse(BaseModel):
    """Penyata Aliran Tunai"""
    financial_year: str
    start_date: str
    end_date: str
    
    # Baki Awal
    opening_cash: float
    
    # Aliran Masuk
    cash_inflows: List[dict]  # [{source, amount}]
    total_inflows: float
    
    # Aliran Keluar
    cash_outflows: List[dict]  # [{purpose, amount}]
    total_outflows: float
    
    # Perubahan Bersih
    net_cash_change: float
    
    # Baki Akhir
    closing_cash: float
    
    # Reconciliation with bank
    bank_balances: List[dict]
    total_bank_balance: float


class AGMExecutiveSummaryResponse(BaseModel):
    """Ringkasan Eksekutif untuk Pembentangan AGM"""
    financial_year: str
    prepared_date: str
    
    # Ringkasan Kewangan
    opening_balance: float
    total_income: float
    total_expense: float
    net_surplus: float
    closing_balance: float
    
    # Perbandingan Tahun Lepas
    prev_year_income: Optional[float] = None
    prev_year_expense: Optional[float] = None
    income_change_percent: Optional[float] = None
    expense_change_percent: Optional[float] = None
    
    # Top 5 Pendapatan
    top_income_sources: List[dict]
    
    # Top 5 Perbelanjaan
    top_expense_items: List[dict]
    
    # Akaun Bank
    bank_accounts: List[dict]
    total_cash: float
    
    # Status Audit
    total_transactions: int
    verified_transactions: int
    pending_transactions: int
    
    # Catatan Penting
    highlights: List[str]
    recommendations: List[str]


# ==================== TRIAL BALANCE / IMBANGAN DUGA ====================

class TrialBalanceItem(BaseModel):
    """Item dalam Imbangan Duga"""
    category_id: str
    category_name: str
    type: str  # income or expense
    debit: float = 0.0
    credit: float = 0.0


class TrialBalanceReportResponse(BaseModel):
    """Laporan Imbangan Duga"""
    financial_year: str
    report_title: str
    start_date: str
    end_date: str
    period_type: str  # financial_year, month, quarter
    period_label: str  # e.g., "Januari 2026" or "Suku 1 2026" or "2025/2026"
    generated_date: str
    
    # Opening balances
    opening_balances: List[dict]
    total_opening_balance: float
    
    # Income items (Credit side)
    income_items: List[TrialBalanceItem]
    total_income: float
    
    # Expense items (Debit side)
    expense_items: List[TrialBalanceItem]
    total_expense: float
    
    # Bank account balances (Debit side - assets)
    bank_balances: List[dict]
    total_bank_balance: float
    
    # Totals
    total_debit: float
    total_credit: float
    is_balanced: bool  # Should always be true if accounting is correct
    difference: float  # Should be 0 if balanced
    
    # Comparison with previous period (optional)
    has_comparison: bool = False
    comparison_period_label: Optional[str] = None
    comparison_data: Optional[dict] = None  # Contains prev period totals and variance
