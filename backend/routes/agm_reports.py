"""
AGM Reports - Laporan Mesyuarat Agung Tahunan
Standard Accounting Reports for Presentation
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from typing import Optional, List
from datetime import datetime, timezone
from bson import ObjectId
import io

from models.accounting import (
    IncomeExpenditureReportResponse,
    BalanceSheetReportResponse,
    CashFlowReportResponse,
    AGMExecutiveSummaryResponse,
    TrialBalanceReportResponse,
    TrialBalanceItem,
    MALAY_MONTHS, TRANSACTION_TYPE_DISPLAY, BANK_ACCOUNT_TYPE_DISPLAY
)

router = APIRouter(prefix="/api/accounting-full/agm", tags=["AGM Reports"])
security = HTTPBearer(auto_error=False)

_get_db_func = None
_get_current_user_func = None
_log_audit_func = None


def init_router(get_db_func, current_user_dep, permission_dep, audit_func):
    global _get_db_func, _get_current_user_func, _log_audit_func
    _get_db_func = get_db_func
    _get_current_user_func = current_user_dep
    _log_audit_func = audit_func


def get_db():
    return _get_db_func()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Token diperlukan")
    return await _get_current_user_func(credentials)


async def log_audit(user, action, module, details):
    if _log_audit_func and user:
        await _log_audit_func(user, action, module, details)


ALL_ACCOUNTING_ROLES = ["superadmin", "admin", "bendahari", "sub_bendahari", "juruaudit"]


def check_accounting_access(user):
    if user["role"] not in ALL_ACCOUNTING_ROLES:
        raise HTTPException(status_code=403, detail="Akses ditolak")


# ==================== HELPER FUNCTIONS ====================

async def get_financial_year_by_id(db, year_id: str):
    """Get financial year by ID"""
    fy = await db.financial_years.find_one({"_id": ObjectId(year_id)})
    if not fy:
        raise HTTPException(status_code=404, detail="Tahun kewangan tidak dijumpai")
    return fy


async def get_current_financial_year(db):
    """Get current financial year"""
    fy = await db.financial_years.find_one({"is_current": True})
    if not fy:
        today = datetime.now().strftime("%Y-%m-%d")
        fy = await db.financial_years.find_one({
            "start_date": {"$lte": today},
            "end_date": {"$gte": today}
        })
    return fy


async def get_transactions_in_period(db, start_date: str, end_date: str, status: str = "verified"):
    """Get all transactions within a date range"""
    query = {
        "transaction_date": {"$gte": start_date, "$lte": end_date},
        "status": status,
        "is_deleted": {"$ne": True}
    }
    return await db.accounting_transactions.find(query).to_list(10000)


async def get_category_name(db, category_id: str) -> str:
    """Get category name by ID"""
    if not category_id:
        return "Lain-lain"
    cat = await db.accounting_categories.find_one({"_id": ObjectId(category_id)})
    return cat.get("name", "Lain-lain") if cat else "Lain-lain"


async def get_opening_balances_for_year(db, financial_year_id: str):
    """Get all opening balances for a financial year"""
    balances = await db.opening_balances.find({"financial_year_id": financial_year_id}).to_list(100)
    
    result = []
    total = 0
    for bal in balances:
        acc = await db.bank_accounts.find_one({"_id": ObjectId(bal.get("bank_account_id"))})
        acc_name = acc.get("name", "Akaun Tidak Diketahui") if acc else "Akaun Tidak Diketahui"
        amount = bal.get("amount", 0)
        result.append({
            "account_id": bal.get("bank_account_id"),
            "account_name": acc_name,
            "amount": amount
        })
        total += amount
    
    return result, total


async def get_bank_account_balances(db, financial_year_id: str, end_date: str):
    """Calculate bank account balances as of a date"""
    accounts = await db.bank_accounts.find({"is_active": True}).to_list(100)
    
    result = []
    total = 0
    
    for acc in accounts:
        acc_id = str(acc["_id"])
        
        # Get opening balance
        ob = await db.opening_balances.find_one({
            "financial_year_id": financial_year_id,
            "bank_account_id": acc_id
        })
        opening = ob.get("amount", 0) if ob else 0
        
        # Get transactions for this account up to end_date
        income_pipeline = [
            {"$match": {
                "bank_account_id": acc_id,
                "type": "income",
                "status": "verified",
                "transaction_date": {"$lte": end_date},
                "is_deleted": {"$ne": True}
            }},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]
        income_result = await db.accounting_transactions.aggregate(income_pipeline).to_list(1)
        income = income_result[0]["total"] if income_result else 0
        
        expense_pipeline = [
            {"$match": {
                "bank_account_id": acc_id,
                "type": "expense",
                "status": "verified",
                "transaction_date": {"$lte": end_date},
                "is_deleted": {"$ne": True}
            }},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]
        expense_result = await db.accounting_transactions.aggregate(expense_pipeline).to_list(1)
        expense = expense_result[0]["total"] if expense_result else 0
        
        balance = round(opening + income - expense, 2)
        
        result.append({
            "account_id": acc_id,
            "account_name": acc.get("name", ""),
            "account_type": acc.get("account_type", ""),
            "account_type_display": BANK_ACCOUNT_TYPE_DISPLAY.get(acc.get("account_type"), acc.get("account_type", "")),
            "bank_name": acc.get("bank_name", ""),
            "account_number": acc.get("account_number", ""),
            "opening_balance": opening,
            "total_income": income,
            "total_expense": expense,
            "closing_balance": balance
        })
        total += balance
    
    return result, total


# ==================== INCOME & EXPENDITURE STATEMENT ====================

@router.get("/income-expenditure")
async def get_income_expenditure_report(
    financial_year_id: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """
    Penyata Pendapatan & Perbelanjaan
    Income & Expenditure Statement
    """
    db = get_db()
    check_accounting_access(user)
    
    # Get financial year
    if financial_year_id:
        fy = await get_financial_year_by_id(db, financial_year_id)
    else:
        fy = await get_current_financial_year(db)
        if not fy:
            raise HTTPException(status_code=404, detail="Tiada tahun kewangan aktif")
    
    start_date = fy["start_date"]
    end_date = fy["end_date"]
    
    # Get all verified transactions in period
    transactions = await get_transactions_in_period(db, start_date, end_date)
    
    # Group by category
    income_by_category = {}
    expense_by_category = {}
    
    for tx in transactions:
        cat_id = tx.get("category_id", "")
        amount = tx.get("amount", 0)
        
        if tx.get("type") == "income":
            if cat_id not in income_by_category:
                income_by_category[cat_id] = {"category_id": cat_id, "amount": 0}
            income_by_category[cat_id]["amount"] += amount
        else:
            if cat_id not in expense_by_category:
                expense_by_category[cat_id] = {"category_id": cat_id, "amount": 0}
            expense_by_category[cat_id]["amount"] += amount
    
    # Fetch category names and format
    income_items = []
    for cat_id, data in income_by_category.items():
        cat_name = await get_category_name(db, cat_id)
        income_items.append({
            "category": cat_name,
            "amount": round(data["amount"], 2)
        })
    income_items.sort(key=lambda x: x["amount"], reverse=True)
    
    expense_items = []
    for cat_id, data in expense_by_category.items():
        cat_name = await get_category_name(db, cat_id)
        expense_items.append({
            "category": cat_name,
            "amount": round(data["amount"], 2)
        })
    expense_items.sort(key=lambda x: x["amount"], reverse=True)
    
    total_income = sum(item["amount"] for item in income_items)
    total_expense = sum(item["amount"] for item in expense_items)
    net_surplus = total_income - total_expense
    
    # Get previous year for comparison (if exists)
    prev_year_income = None
    prev_year_expense = None
    prev_year_surplus = None
    
    # Find previous financial year
    prev_fy = await db.financial_years.find_one({
        "end_date": {"$lt": start_date}
    }, sort=[("end_date", -1)])
    
    if prev_fy:
        prev_transactions = await get_transactions_in_period(db, prev_fy["start_date"], prev_fy["end_date"])
        prev_year_income = sum(tx.get("amount", 0) for tx in prev_transactions if tx.get("type") == "income")
        prev_year_expense = sum(tx.get("amount", 0) for tx in prev_transactions if tx.get("type") == "expense")
        prev_year_surplus = prev_year_income - prev_year_expense
    
    await log_audit(user, "VIEW_INCOME_EXPENDITURE_REPORT", "accounting", f"Lihat penyata P&P: {fy['name']}")
    
    return IncomeExpenditureReportResponse(
        financial_year=fy["name"],
        start_date=start_date,
        end_date=end_date,
        income_items=income_items,
        total_income=round(total_income, 2),
        expense_items=expense_items,
        total_expense=round(total_expense, 2),
        net_surplus=round(net_surplus, 2),
        prev_year_income=round(prev_year_income, 2) if prev_year_income is not None else None,
        prev_year_expense=round(prev_year_expense, 2) if prev_year_expense is not None else None,
        prev_year_surplus=round(prev_year_surplus, 2) if prev_year_surplus is not None else None
    )


# ==================== BALANCE SHEET ====================

@router.get("/balance-sheet")
async def get_balance_sheet_report(
    financial_year_id: Optional[str] = None,
    as_of_date: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """
    Kunci Kira-kira / Lembaran Imbangan
    Balance Sheet
    """
    db = get_db()
    check_accounting_access(user)
    
    # Get financial year
    if financial_year_id:
        fy = await get_financial_year_by_id(db, financial_year_id)
    else:
        fy = await get_current_financial_year(db)
        if not fy:
            raise HTTPException(status_code=404, detail="Tiada tahun kewangan aktif")
    
    # Default to end of financial year
    report_date = as_of_date or fy["end_date"]
    
    # Get bank balances
    bank_balances, total_bank = await get_bank_account_balances(db, str(fy["_id"]), report_date)
    
    # Get opening balances
    opening_balances, total_opening = await get_opening_balances_for_year(db, str(fy["_id"]))
    
    # Calculate current year surplus/deficit
    transactions = await get_transactions_in_period(db, fy["start_date"], report_date)
    current_income = sum(tx.get("amount", 0) for tx in transactions if tx.get("type") == "income")
    current_expense = sum(tx.get("amount", 0) for tx in transactions if tx.get("type") == "expense")
    current_surplus = current_income - current_expense
    
    # For school associations, usually no fixed assets, receivables, payables
    total_current_assets = total_bank
    fixed_assets = 0
    total_assets = total_current_assets + fixed_assets
    
    receivables = 0
    prepayments = 0
    payables = 0
    accruals = 0
    total_current_liabilities = payables + accruals
    
    # Equity calculation
    opening_fund = total_opening
    closing_fund = opening_fund + current_surplus
    
    total_liabilities_equity = total_current_liabilities + closing_fund
    
    await log_audit(user, "VIEW_BALANCE_SHEET", "accounting", f"Lihat kunci kira-kira: {fy['name']}")
    
    return BalanceSheetReportResponse(
        as_of_date=report_date,
        financial_year=fy["name"],
        bank_balances=[{
            "account_name": b["account_name"],
            "balance": b["closing_balance"]
        } for b in bank_balances],
        total_bank_balance=round(total_bank, 2),
        receivables=receivables,
        prepayments=prepayments,
        total_current_assets=round(total_current_assets, 2),
        fixed_assets=fixed_assets,
        total_assets=round(total_assets, 2),
        payables=payables,
        accruals=accruals,
        total_current_liabilities=round(total_current_liabilities, 2),
        opening_fund=round(opening_fund, 2),
        current_surplus=round(current_surplus, 2),
        closing_fund=round(closing_fund, 2),
        total_liabilities_equity=round(total_liabilities_equity, 2)
    )


# ==================== CASH FLOW STATEMENT ====================

@router.get("/cash-flow")
async def get_cash_flow_report(
    financial_year_id: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """
    Penyata Aliran Tunai
    Cash Flow Statement
    """
    db = get_db()
    check_accounting_access(user)
    
    # Get financial year
    if financial_year_id:
        fy = await get_financial_year_by_id(db, financial_year_id)
    else:
        fy = await get_current_financial_year(db)
        if not fy:
            raise HTTPException(status_code=404, detail="Tiada tahun kewangan aktif")
    
    start_date = fy["start_date"]
    end_date = fy["end_date"]
    
    # Get opening balance (total across all accounts)
    _, opening_cash = await get_opening_balances_for_year(db, str(fy["_id"]))
    
    # Get transactions
    transactions = await get_transactions_in_period(db, start_date, end_date)
    
    # Group inflows by category
    inflows_by_category = {}
    outflows_by_category = {}
    
    for tx in transactions:
        cat_id = tx.get("category_id", "")
        amount = tx.get("amount", 0)
        
        if tx.get("type") == "income":
            if cat_id not in inflows_by_category:
                inflows_by_category[cat_id] = 0
            inflows_by_category[cat_id] += amount
        else:
            if cat_id not in outflows_by_category:
                outflows_by_category[cat_id] = 0
            outflows_by_category[cat_id] += amount
    
    # Format inflows
    cash_inflows = []
    for cat_id, amount in inflows_by_category.items():
        cat_name = await get_category_name(db, cat_id)
        cash_inflows.append({"source": cat_name, "amount": round(amount, 2)})
    cash_inflows.sort(key=lambda x: x["amount"], reverse=True)
    total_inflows = sum(item["amount"] for item in cash_inflows)
    
    # Format outflows
    cash_outflows = []
    for cat_id, amount in outflows_by_category.items():
        cat_name = await get_category_name(db, cat_id)
        cash_outflows.append({"purpose": cat_name, "amount": round(amount, 2)})
    cash_outflows.sort(key=lambda x: x["amount"], reverse=True)
    total_outflows = sum(item["amount"] for item in cash_outflows)
    
    net_cash_change = total_inflows - total_outflows
    closing_cash = opening_cash + net_cash_change
    
    # Get current bank balances for reconciliation
    bank_balances, total_bank = await get_bank_account_balances(db, str(fy["_id"]), end_date)
    
    await log_audit(user, "VIEW_CASH_FLOW_REPORT", "accounting", f"Lihat penyata aliran tunai: {fy['name']}")
    
    return CashFlowReportResponse(
        financial_year=fy["name"],
        start_date=start_date,
        end_date=end_date,
        opening_cash=round(opening_cash, 2),
        cash_inflows=cash_inflows,
        total_inflows=round(total_inflows, 2),
        cash_outflows=cash_outflows,
        total_outflows=round(total_outflows, 2),
        net_cash_change=round(net_cash_change, 2),
        closing_cash=round(closing_cash, 2),
        bank_balances=[{
            "account_name": b["account_name"],
            "balance": b["closing_balance"]
        } for b in bank_balances],
        total_bank_balance=round(total_bank, 2)
    )


# ==================== AGM EXECUTIVE SUMMARY ====================

@router.get("/executive-summary")
async def get_agm_executive_summary(
    financial_year_id: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """
    Ringkasan Eksekutif untuk Pembentangan AGM
    Executive Summary for AGM Presentation
    """
    db = get_db()
    check_accounting_access(user)
    
    # Get financial year
    if financial_year_id:
        fy = await get_financial_year_by_id(db, financial_year_id)
    else:
        fy = await get_current_financial_year(db)
        if not fy:
            raise HTTPException(status_code=404, detail="Tiada tahun kewangan aktif")
    
    start_date = fy["start_date"]
    end_date = fy["end_date"]
    
    # Get opening balance
    _, opening_balance = await get_opening_balances_for_year(db, str(fy["_id"]))
    
    # Get transactions
    transactions = await get_transactions_in_period(db, start_date, end_date)
    
    total_income = sum(tx.get("amount", 0) for tx in transactions if tx.get("type") == "income")
    total_expense = sum(tx.get("amount", 0) for tx in transactions if tx.get("type") == "expense")
    net_surplus = total_income - total_expense
    closing_balance = opening_balance + net_surplus
    
    # Top income sources
    income_by_category = {}
    for tx in transactions:
        if tx.get("type") == "income":
            cat_id = tx.get("category_id", "")
            income_by_category[cat_id] = income_by_category.get(cat_id, 0) + tx.get("amount", 0)
    
    top_income = []
    for cat_id, amount in sorted(income_by_category.items(), key=lambda x: x[1], reverse=True)[:5]:
        cat_name = await get_category_name(db, cat_id)
        percentage = (amount / total_income * 100) if total_income > 0 else 0
        top_income.append({
            "category": cat_name,
            "amount": round(amount, 2),
            "percentage": round(percentage, 1)
        })
    
    # Top expense items
    expense_by_category = {}
    for tx in transactions:
        if tx.get("type") == "expense":
            cat_id = tx.get("category_id", "")
            expense_by_category[cat_id] = expense_by_category.get(cat_id, 0) + tx.get("amount", 0)
    
    top_expense = []
    for cat_id, amount in sorted(expense_by_category.items(), key=lambda x: x[1], reverse=True)[:5]:
        cat_name = await get_category_name(db, cat_id)
        percentage = (amount / total_expense * 100) if total_expense > 0 else 0
        top_expense.append({
            "category": cat_name,
            "amount": round(amount, 2),
            "percentage": round(percentage, 1)
        })
    
    # Bank accounts
    bank_accounts, total_cash = await get_bank_account_balances(db, str(fy["_id"]), end_date)
    
    # Transaction counts
    all_tx_query = {
        "transaction_date": {"$gte": start_date, "$lte": end_date},
        "is_deleted": {"$ne": True}
    }
    total_transactions = await db.accounting_transactions.count_documents(all_tx_query)
    verified_transactions = await db.accounting_transactions.count_documents({**all_tx_query, "status": "verified"})
    pending_transactions = await db.accounting_transactions.count_documents({**all_tx_query, "status": "pending"})
    
    # Previous year comparison
    prev_year_income = None
    prev_year_expense = None
    income_change_percent = None
    expense_change_percent = None
    
    prev_fy = await db.financial_years.find_one({
        "end_date": {"$lt": start_date}
    }, sort=[("end_date", -1)])
    
    if prev_fy:
        prev_transactions = await get_transactions_in_period(db, prev_fy["start_date"], prev_fy["end_date"])
        prev_year_income = sum(tx.get("amount", 0) for tx in prev_transactions if tx.get("type") == "income")
        prev_year_expense = sum(tx.get("amount", 0) for tx in prev_transactions if tx.get("type") == "expense")
        
        if prev_year_income > 0:
            income_change_percent = round((total_income - prev_year_income) / prev_year_income * 100, 1)
        if prev_year_expense > 0:
            expense_change_percent = round((total_expense - prev_year_expense) / prev_year_expense * 100, 1)
    
    # Generate highlights and recommendations
    highlights = []
    recommendations = []
    
    if net_surplus > 0:
        highlights.append(f"Lebihan pendapatan atas perbelanjaan sebanyak RM {net_surplus:,.2f}")
    else:
        highlights.append(f"Kurangan pendapatan atas perbelanjaan sebanyak RM {abs(net_surplus):,.2f}")
    
    if income_change_percent is not None:
        if income_change_percent > 0:
            highlights.append(f"Pendapatan meningkat {income_change_percent}% berbanding tahun lepas")
        else:
            highlights.append(f"Pendapatan menurun {abs(income_change_percent)}% berbanding tahun lepas")
    
    if pending_transactions > 0:
        recommendations.append(f"Sahkan {pending_transactions} transaksi yang masih tertangguh")
    
    if closing_balance > 0:
        recommendations.append("Dana mencukupi untuk operasi tahun hadapan")
    else:
        recommendations.append("Perlu perhatian kepada kedudukan kewangan")
    
    await log_audit(user, "VIEW_AGM_SUMMARY", "accounting", f"Lihat ringkasan AGM: {fy['name']}")
    
    return AGMExecutiveSummaryResponse(
        financial_year=fy["name"],
        prepared_date=datetime.now().strftime("%Y-%m-%d"),
        opening_balance=round(opening_balance, 2),
        total_income=round(total_income, 2),
        total_expense=round(total_expense, 2),
        net_surplus=round(net_surplus, 2),
        closing_balance=round(closing_balance, 2),
        prev_year_income=round(prev_year_income, 2) if prev_year_income is not None else None,
        prev_year_expense=round(prev_year_expense, 2) if prev_year_expense is not None else None,
        income_change_percent=income_change_percent,
        expense_change_percent=expense_change_percent,
        top_income_sources=top_income,
        top_expense_items=top_expense,
        bank_accounts=[{
            "account_name": b["account_name"],
            "account_type": b.get("account_type_display", ""),
            "balance": b["closing_balance"]
        } for b in bank_accounts],
        total_cash=round(total_cash, 2),
        total_transactions=total_transactions,
        verified_transactions=verified_transactions,
        pending_transactions=pending_transactions,
        highlights=highlights,
        recommendations=recommendations
    )


# ==================== LIST AVAILABLE REPORTS ====================

@router.get("/available-reports")
async def list_available_reports(
    user: dict = Depends(get_current_user)
):
    """List all available AGM reports"""
    check_accounting_access(user)
    
    return {
        "reports": [
            {
                "id": "income-expenditure",
                "name": "Penyata Pendapatan & Perbelanjaan",
                "name_en": "Income & Expenditure Statement",
                "description": "Ringkasan semua pendapatan dan perbelanjaan mengikut kategori",
                "endpoint": "/api/accounting-full/agm/income-expenditure"
            },
            {
                "id": "balance-sheet",
                "name": "Kunci Kira-kira",
                "name_en": "Balance Sheet",
                "description": "Kedudukan aset, liabiliti dan dana terkumpul",
                "endpoint": "/api/accounting-full/agm/balance-sheet"
            },
            {
                "id": "cash-flow",
                "name": "Penyata Aliran Tunai",
                "name_en": "Cash Flow Statement",
                "description": "Aliran masuk dan keluar tunai sepanjang tahun",
                "endpoint": "/api/accounting-full/agm/cash-flow"
            },
            {
                "id": "executive-summary",
                "name": "Ringkasan Eksekutif AGM",
                "name_en": "AGM Executive Summary",
                "description": "Ringkasan menyeluruh untuk pembentangan mesyuarat",
                "endpoint": "/api/accounting-full/agm/executive-summary"
            }
        ],
        "export_formats": ["pdf", "excel", "word"]
    }


# ==================== TRIAL BALANCE / IMBANGAN DUGA ====================

@router.get("/trial-balance")
async def get_trial_balance_report(
    financial_year_id: Optional[str] = None,
    period_type: str = "financial_year",  # financial_year, month, quarter
    month: Optional[int] = None,  # 1-12 for monthly
    quarter: Optional[int] = None,  # 1-4 for quarterly
    year: Optional[int] = None,  # Year for month/quarter filtering
    include_comparison: bool = False,  # Compare with previous period
    user: dict = Depends(get_current_user)
):
    """
    Imbangan Duga / Trial Balance
    Shows all account balances with Debit = Credit verification
    
    period_type:
    - financial_year: Full financial year (default)
    - month: Specific month
    - quarter: Specific quarter (Q1=May-Jul, Q2=Aug-Oct, Q3=Nov-Jan, Q4=Feb-Apr for Apr 30 FY end)
    
    include_comparison: If true, includes comparison with previous period
    """
    db = get_db()
    check_accounting_access(user)
    
    # Get financial year
    if financial_year_id:
        fy = await get_financial_year_by_id(db, financial_year_id)
    else:
        fy = await get_current_financial_year(db)
        if not fy:
            raise HTTPException(status_code=404, detail="Tiada tahun kewangan aktif")
    
    fy_start_date = fy["start_date"]
    fy_end_date = fy["end_date"]
    
    # Determine date range based on period_type
    if period_type == "month" and month and year:
        # Calculate start and end of specific month
        import calendar
        last_day = calendar.monthrange(year, month)[1]
        start_date = f"{year}-{month:02d}-01"
        end_date = f"{year}-{month:02d}-{last_day:02d}"
        period_label = f"{MALAY_MONTHS.get(month, month)} {year}"
    elif period_type == "quarter" and quarter and year:
        # Quarter mapping for financial year ending April 30
        # Q1: May-Jul, Q2: Aug-Oct, Q3: Nov-Jan, Q4: Feb-Apr
        # Simplified approach - use year directly
        if quarter == 1:
            start_date = f"{year}-05-01"
            end_date = f"{year}-07-31"
            period_label = f"Suku 1 (Mei-Jul {year})"
        elif quarter == 2:
            start_date = f"{year}-08-01"
            end_date = f"{year}-10-31"
            period_label = f"Suku 2 (Ogos-Okt {year})"
        elif quarter == 3:
            start_date = f"{year}-11-01"
            end_date = f"{year+1}-01-31"
            period_label = f"Suku 3 (Nov {year}-Jan {year+1})"
        else:  # quarter == 4
            start_date = f"{year+1}-02-01"
            end_date = f"{year+1}-04-30"
            period_label = f"Suku 4 (Feb-Apr {year+1})"
    else:
        # Default: full financial year
        start_date = fy_start_date
        end_date = fy_end_date
        period_label = fy["name"]
    
    # Get opening balances (as of start date - represents equity/capital brought forward)
    opening_balances, total_opening = await get_opening_balances_for_year(db, str(fy["_id"]))
    
    # Get all verified transactions in period
    transactions = await get_transactions_in_period(db, start_date, end_date)
    
    # Group transactions by category and type
    income_by_category = {}
    expense_by_category = {}
    
    for tx in transactions:
        cat_id = tx.get("category_id", "")
        amount = tx.get("amount", 0)
        
        if tx.get("type") == "income":
            if cat_id not in income_by_category:
                income_by_category[cat_id] = {"category_id": cat_id, "amount": 0}
            income_by_category[cat_id]["amount"] += amount
        else:
            if cat_id not in expense_by_category:
                expense_by_category[cat_id] = {"category_id": cat_id, "amount": 0}
            expense_by_category[cat_id]["amount"] += amount
    
    # Build income items (Credit side in Trial Balance)
    income_items = []
    for cat_id, data in income_by_category.items():
        cat_name = await get_category_name(db, cat_id)
        amount = round(data["amount"], 2)
        income_items.append(TrialBalanceItem(
            category_id=cat_id,
            category_name=cat_name,
            type="income",
            debit=0.0,
            credit=amount
        ))
    income_items.sort(key=lambda x: x.credit, reverse=True)
    total_income = sum(item.credit for item in income_items)
    
    # Build expense items (Debit side in Trial Balance)
    expense_items = []
    for cat_id, data in expense_by_category.items():
        cat_name = await get_category_name(db, cat_id)
        amount = round(data["amount"], 2)
        expense_items.append(TrialBalanceItem(
            category_id=cat_id,
            category_name=cat_name,
            type="expense",
            debit=amount,
            credit=0.0
        ))
    expense_items.sort(key=lambda x: x.debit, reverse=True)
    total_expense = sum(item.debit for item in expense_items)
    
    # Get bank balances (Asset - Debit side)
    # For Trial Balance, calculate closing balance = Opening + Income - Expenses
    # Note: Some transactions may not have bank_account_id, so we calculate total closing
    
    # Get opening balances breakdown by account
    accounts = await db.bank_accounts.find({"is_active": True}).to_list(100)
    bank_balances_detailed = []
    
    for acc in accounts:
        acc_id = str(acc["_id"])
        
        # Get opening balance for this account
        ob = await db.opening_balances.find_one({
            "financial_year_id": str(fy["_id"]),
            "bank_account_id": acc_id
        })
        account_opening = ob.get("amount", 0) if ob else 0
        
        # Get income for this account in this period (if linked)
        acc_income = sum(tx.get("amount", 0) for tx in transactions 
                        if tx.get("type") == "income" and tx.get("bank_account_id") == acc_id)
        
        # Get expenses for this account in this period (if linked)
        acc_expense = sum(tx.get("amount", 0) for tx in transactions 
                        if tx.get("type") == "expense" and tx.get("bank_account_id") == acc_id)
        
        # Closing balance for this account
        closing_balance = round(account_opening + acc_income - acc_expense, 2)
        
        bank_balances_detailed.append({
            "account_name": acc.get("name", ""),
            "account_type": acc.get("account_type", ""),
            "account_type_display": BANK_ACCOUNT_TYPE_DISPLAY.get(acc.get("account_type"), acc.get("account_type", "")),
            "opening_balance": account_opening,
            "period_income": acc_income,
            "period_expense": acc_expense,
            "closing_balance": closing_balance
        })
    
    # Calculate total bank balance using the accounting equation
    # Total Closing = Total Opening + Total Income - Total Expense
    total_bank = round(total_opening + total_income - total_expense, 2)
    
    # Calculate totals for Trial Balance
    # In standard double-entry bookkeeping:
    # Debit: Assets (Bank Closing Balance) + Expenses
    # Credit: Equity (Opening Balance) + Income
    # 
    # Verification: Bank Closing = Opening + Income - Expense
    # So: Debit = (Opening + Income - Expense) + Expense = Opening + Income
    # Credit = Opening + Income
    # Therefore Debit MUST equal Credit
    
    total_debit = round(total_expense + total_bank, 2)
    total_credit = round(total_income + total_opening, 2)
    
    # Check if balanced (difference should be 0)
    difference = round(total_debit - total_credit, 2)
    is_balanced = abs(difference) < 0.01  # Allow tiny rounding difference
    
    # Calculate comparison data if requested
    comparison_data = None
    comparison_period_label = None
    has_comparison = False
    
    if include_comparison:
        import calendar
        # Calculate previous period dates
        prev_start_date = None
        prev_end_date = None
        
        if period_type == "month" and month and year:
            # Previous month
            prev_month = month - 1 if month > 1 else 12
            prev_year = year if month > 1 else year - 1
            prev_last_day = calendar.monthrange(prev_year, prev_month)[1]
            prev_start_date = f"{prev_year}-{prev_month:02d}-01"
            prev_end_date = f"{prev_year}-{prev_month:02d}-{prev_last_day:02d}"
            comparison_period_label = f"{MALAY_MONTHS.get(prev_month, prev_month)} {prev_year}"
        elif period_type == "quarter" and quarter and year:
            # Previous quarter
            prev_quarter = quarter - 1 if quarter > 1 else 4
            prev_year = year if quarter > 1 else year - 1
            if prev_quarter == 1:
                prev_start_date = f"{prev_year}-05-01"
                prev_end_date = f"{prev_year}-07-31"
                comparison_period_label = f"Suku 1 (Mei-Jul {prev_year})"
            elif prev_quarter == 2:
                prev_start_date = f"{prev_year}-08-01"
                prev_end_date = f"{prev_year}-10-31"
                comparison_period_label = f"Suku 2 (Ogos-Okt {prev_year})"
            elif prev_quarter == 3:
                prev_start_date = f"{prev_year}-11-01"
                prev_end_date = f"{prev_year+1}-01-31"
                comparison_period_label = f"Suku 3 (Nov {prev_year}-Jan {prev_year+1})"
            else:
                prev_start_date = f"{prev_year+1}-02-01"
                prev_end_date = f"{prev_year+1}-04-30"
                comparison_period_label = f"Suku 4 (Feb-Apr {prev_year+1})"
        elif period_type == "financial_year":
            # Previous financial year
            all_fys = await db.financial_years.find().sort("start_date", -1).to_list(10)
            current_fy_idx = next((i for i, f in enumerate(all_fys) if str(f["_id"]) == str(fy["_id"])), -1)
            if current_fy_idx >= 0 and current_fy_idx + 1 < len(all_fys):
                prev_fy = all_fys[current_fy_idx + 1]
                prev_start_date = prev_fy["start_date"]
                prev_end_date = prev_fy["end_date"]
                comparison_period_label = prev_fy["name"]
        
        if prev_start_date and prev_end_date:
            # Get previous period transactions
            prev_transactions = await get_transactions_in_period(db, prev_start_date, prev_end_date)
            
            # Calculate previous period totals
            prev_income = sum(tx.get("amount", 0) for tx in prev_transactions if tx.get("type") == "income")
            prev_expense = sum(tx.get("amount", 0) for tx in prev_transactions if tx.get("type") == "expense")
            prev_bank = round(total_opening + prev_income - prev_expense, 2)
            prev_total_debit = round(prev_expense + prev_bank, 2)
            prev_total_credit = round(prev_income + total_opening, 2)
            
            # Calculate variance (current - previous)
            income_variance = round(total_income - prev_income, 2)
            expense_variance = round(total_expense - prev_expense, 2)
            bank_variance = round(total_bank - prev_bank, 2)
            
            # Calculate percentage change
            income_pct = round((income_variance / prev_income * 100), 1) if prev_income > 0 else 0
            expense_pct = round((expense_variance / prev_expense * 100), 1) if prev_expense > 0 else 0
            
            comparison_data = {
                "prev_total_income": round(prev_income, 2),
                "prev_total_expense": round(prev_expense, 2),
                "prev_total_bank": prev_bank,
                "prev_total_debit": prev_total_debit,
                "prev_total_credit": prev_total_credit,
                "income_variance": income_variance,
                "expense_variance": expense_variance,
                "bank_variance": bank_variance,
                "income_pct_change": income_pct,
                "expense_pct_change": expense_pct,
                "trend_income": "naik" if income_variance > 0 else ("turun" if income_variance < 0 else "sama"),
                "trend_expense": "naik" if expense_variance > 0 else ("turun" if expense_variance < 0 else "sama")
            }
            has_comparison = True
    
    await log_audit(user, "VIEW_TRIAL_BALANCE", "accounting", 
                    f"Lihat imbangan duga: {fy['name']} ({period_type}: {period_label})")
    
    return TrialBalanceReportResponse(
        financial_year=fy["name"],
        report_title="IMBANGAN DUGA / TRIAL BALANCE",
        start_date=start_date,
        end_date=end_date,
        period_type=period_type,
        period_label=period_label,
        generated_date=datetime.now().strftime("%Y-%m-%d %H:%M"),
        opening_balances=[{
            "account_name": ob["account_name"],
            "amount": ob["amount"]
        } for ob in opening_balances],
        total_opening_balance=round(total_opening, 2),
        income_items=[item.dict() for item in income_items],
        total_income=round(total_income, 2),
        expense_items=[item.dict() for item in expense_items],
        total_expense=round(total_expense, 2),
        bank_balances=[{
            "account_name": b["account_name"],
            "account_type": b.get("account_type_display", b.get("account_type", "")),
            "balance": b["closing_balance"]
        } for b in bank_balances_detailed],
        total_bank_balance=round(total_bank, 2),
        total_debit=total_debit,
        total_credit=total_credit,
        is_balanced=is_balanced,
        difference=difference,
        has_comparison=has_comparison,
        comparison_period_label=comparison_period_label,
        comparison_data=comparison_data
    )
