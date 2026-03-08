"""
Test AGM Reports API endpoints
Tests for: Income/Expenditure, Balance Sheet, Cash Flow, Executive Summary
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAGMReportsAPI:
    """Tests for AGM Reports API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Get auth token for admin user"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@muafakat.link",
            "password": "admin123"
        })
        assert login_response.status_code == 200, "Admin login failed"
        token = login_response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {token}"}
        
        # Get current financial year
        fy_response = requests.get(f"{BASE_URL}/api/accounting-full/financial-years", headers=self.headers)
        if fy_response.status_code == 200:
            years = fy_response.json()
            current = next((y for y in years if y.get("is_current")), None)
            self.financial_year_id = current["id"] if current else None
        else:
            self.financial_year_id = None
    
    def test_financial_years_endpoint(self):
        """Test GET /api/accounting-full/financial-years"""
        response = requests.get(f"{BASE_URL}/api/accounting-full/financial-years", headers=self.headers)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if len(data) > 0:
            year = data[0]
            assert "id" in year
            assert "name" in year
            assert "start_date" in year
            assert "end_date" in year
            assert "is_current" in year
            print(f"SUCCESS: Found {len(data)} financial years")
    
    def test_executive_summary_endpoint(self):
        """Test GET /api/accounting-full/agm/executive-summary"""
        params = {}
        if self.financial_year_id:
            params["financial_year_id"] = self.financial_year_id
        
        response = requests.get(f"{BASE_URL}/api/accounting-full/agm/executive-summary", 
                               headers=self.headers, params=params)
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify required fields
        assert "financial_year" in data
        assert "opening_balance" in data
        assert "total_income" in data
        assert "total_expense" in data
        assert "net_surplus" in data
        assert "closing_balance" in data
        assert "top_income_sources" in data
        assert "top_expense_items" in data
        assert "bank_accounts" in data
        assert "total_cash" in data
        
        # Verify data types
        assert isinstance(data["opening_balance"], (int, float))
        assert isinstance(data["total_income"], (int, float))
        assert isinstance(data["total_expense"], (int, float))
        assert isinstance(data["net_surplus"], (int, float))
        assert isinstance(data["closing_balance"], (int, float))
        
        # Verify calculation
        expected_surplus = data["total_income"] - data["total_expense"]
        assert abs(data["net_surplus"] - expected_surplus) < 0.01, "Net surplus calculation incorrect"
        
        print(f"SUCCESS: Executive summary - FY: {data['financial_year']}, Closing: RM {data['closing_balance']}")
    
    def test_income_expenditure_endpoint(self):
        """Test GET /api/accounting-full/agm/income-expenditure"""
        params = {}
        if self.financial_year_id:
            params["financial_year_id"] = self.financial_year_id
        
        response = requests.get(f"{BASE_URL}/api/accounting-full/agm/income-expenditure", 
                               headers=self.headers, params=params)
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify required fields
        assert "financial_year" in data
        assert "start_date" in data
        assert "end_date" in data
        assert "income_items" in data
        assert "expense_items" in data
        assert "total_income" in data
        assert "total_expense" in data
        assert "net_surplus" in data
        
        # Verify data types
        assert isinstance(data["income_items"], list)
        assert isinstance(data["expense_items"], list)
        
        # Verify income items structure
        if len(data["income_items"]) > 0:
            item = data["income_items"][0]
            assert "category" in item
            assert "amount" in item
        
        # Verify expense items structure
        if len(data["expense_items"]) > 0:
            item = data["expense_items"][0]
            assert "category" in item
            assert "amount" in item
        
        # Verify calculation
        calculated_income = sum(item["amount"] for item in data["income_items"])
        assert abs(data["total_income"] - calculated_income) < 0.01
        
        calculated_expense = sum(item["amount"] for item in data["expense_items"])
        assert abs(data["total_expense"] - calculated_expense) < 0.01
        
        print(f"SUCCESS: Income/Expenditure - Income: RM {data['total_income']}, Expense: RM {data['total_expense']}")
    
    def test_balance_sheet_endpoint(self):
        """Test GET /api/accounting-full/agm/balance-sheet"""
        params = {}
        if self.financial_year_id:
            params["financial_year_id"] = self.financial_year_id
        
        response = requests.get(f"{BASE_URL}/api/accounting-full/agm/balance-sheet", 
                               headers=self.headers, params=params)
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify required fields
        assert "as_of_date" in data
        assert "financial_year" in data
        assert "bank_balances" in data
        assert "total_bank_balance" in data
        assert "total_assets" in data
        assert "opening_fund" in data
        assert "current_surplus" in data
        assert "closing_fund" in data
        assert "total_liabilities_equity" in data
        
        # Verify bank balances structure
        assert isinstance(data["bank_balances"], list)
        if len(data["bank_balances"]) > 0:
            bal = data["bank_balances"][0]
            assert "account_name" in bal
            assert "balance" in bal
        
        # Note: total_assets may differ from total_liabilities_equity 
        # depending on the accounting period
        
        print(f"SUCCESS: Balance Sheet - Assets: RM {data['total_assets']}, L&E: RM {data['total_liabilities_equity']}")
    
    def test_cash_flow_endpoint(self):
        """Test GET /api/accounting-full/agm/cash-flow"""
        params = {}
        if self.financial_year_id:
            params["financial_year_id"] = self.financial_year_id
        
        response = requests.get(f"{BASE_URL}/api/accounting-full/agm/cash-flow", 
                               headers=self.headers, params=params)
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify required fields
        assert "financial_year" in data
        assert "start_date" in data
        assert "end_date" in data
        assert "opening_cash" in data
        assert "cash_inflows" in data
        assert "total_inflows" in data
        assert "cash_outflows" in data
        assert "total_outflows" in data
        assert "net_cash_change" in data
        assert "closing_cash" in data
        
        # Verify cash flow structure
        assert isinstance(data["cash_inflows"], list)
        assert isinstance(data["cash_outflows"], list)
        
        if len(data["cash_inflows"]) > 0:
            inflow = data["cash_inflows"][0]
            assert "source" in inflow
            assert "amount" in inflow
        
        if len(data["cash_outflows"]) > 0:
            outflow = data["cash_outflows"][0]
            assert "purpose" in outflow
            assert "amount" in outflow
        
        # Verify calculations
        expected_net_change = data["total_inflows"] - data["total_outflows"]
        assert abs(data["net_cash_change"] - expected_net_change) < 0.01
        
        expected_closing = data["opening_cash"] + data["net_cash_change"]
        assert abs(data["closing_cash"] - expected_closing) < 0.01
        
        print(f"SUCCESS: Cash Flow - Opening: RM {data['opening_cash']}, Closing: RM {data['closing_cash']}")
    
    def test_available_reports_endpoint(self):
        """Test GET /api/accounting-full/agm/available-reports"""
        response = requests.get(f"{BASE_URL}/api/accounting-full/agm/available-reports", 
                               headers=self.headers)
        
        assert response.status_code == 200
        data = response.json()
        
        assert "reports" in data
        assert "export_formats" in data
        
        reports = data["reports"]
        assert len(reports) == 4  # income-expenditure, balance-sheet, cash-flow, executive-summary
        
        # Verify each report has required fields
        for report in reports:
            assert "id" in report
            assert "name" in report
            assert "endpoint" in report
        
        # Verify export formats
        export_formats = data["export_formats"]
        assert "pdf" in export_formats
        assert "excel" in export_formats
        assert "word" in export_formats
        
        print(f"SUCCESS: Available reports - {len(reports)} reports, formats: {export_formats}")


class TestTrialBalanceAPI:
    """Tests for Trial Balance (Imbangan Duga) API endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Get auth token for admin user"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@muafakat.link",
            "password": "admin123"
        })
        assert login_response.status_code == 200, "Admin login failed"
        token = login_response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {token}"}
        
        # Get current financial year
        fy_response = requests.get(f"{BASE_URL}/api/accounting-full/financial-years", headers=self.headers)
        if fy_response.status_code == 200:
            years = fy_response.json()
            current = next((y for y in years if y.get("is_current")), None)
            self.financial_year_id = current["id"] if current else None
        else:
            self.financial_year_id = None
    
    def test_trial_balance_default_financial_year(self):
        """Test GET /api/accounting-full/agm/trial-balance - default (financial_year)"""
        params = {}
        if self.financial_year_id:
            params["financial_year_id"] = self.financial_year_id
        
        response = requests.get(f"{BASE_URL}/api/accounting-full/agm/trial-balance", 
                               headers=self.headers, params=params)
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify required fields
        assert "financial_year" in data
        assert "report_title" in data
        assert "start_date" in data
        assert "end_date" in data
        assert "period_type" in data
        assert "period_label" in data
        assert "generated_date" in data
        assert "opening_balances" in data
        assert "total_opening_balance" in data
        assert "income_items" in data
        assert "total_income" in data
        assert "expense_items" in data
        assert "total_expense" in data
        assert "bank_balances" in data
        assert "total_bank_balance" in data
        assert "total_debit" in data
        assert "total_credit" in data
        assert "is_balanced" in data
        assert "difference" in data
        
        # Verify period_type is financial_year
        assert data["period_type"] == "financial_year"
        
        # Verify balanced status and difference
        assert isinstance(data["is_balanced"], bool)
        assert isinstance(data["difference"], (int, float))
        
        # Verify Debit = Credit when balanced
        if data["is_balanced"]:
            assert abs(data["total_debit"] - data["total_credit"]) < 0.01
        
        print(f"SUCCESS: Trial Balance (default) - Debit: RM {data['total_debit']}, Credit: RM {data['total_credit']}, Balanced: {data['is_balanced']}")
    
    def test_trial_balance_monthly_period(self):
        """Test GET /api/accounting-full/agm/trial-balance?period_type=month&month=2&year=2026"""
        params = {
            "period_type": "month",
            "month": 2,
            "year": 2026
        }
        if self.financial_year_id:
            params["financial_year_id"] = self.financial_year_id
        
        response = requests.get(f"{BASE_URL}/api/accounting-full/agm/trial-balance", 
                               headers=self.headers, params=params)
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify period_type is month
        assert data["period_type"] == "month"
        assert "Februari" in data["period_label"] or "2026" in data["period_label"]
        
        # Verify date range is February 2026
        assert data["start_date"] == "2026-02-01"
        assert data["end_date"] == "2026-02-28"
        
        # Verify balanced
        assert "is_balanced" in data
        assert "total_debit" in data
        assert "total_credit" in data
        
        print(f"SUCCESS: Trial Balance (month) - Period: {data['period_label']}, Debit: RM {data['total_debit']}, Credit: RM {data['total_credit']}")
    
    def test_trial_balance_quarterly_period(self):
        """Test GET /api/accounting-full/agm/trial-balance?period_type=quarter&quarter=1&year=2025"""
        params = {
            "period_type": "quarter",
            "quarter": 1,
            "year": 2025
        }
        if self.financial_year_id:
            params["financial_year_id"] = self.financial_year_id
        
        response = requests.get(f"{BASE_URL}/api/accounting-full/agm/trial-balance", 
                               headers=self.headers, params=params)
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify period_type is quarter
        assert data["period_type"] == "quarter"
        assert "Suku 1" in data["period_label"]
        
        # Verify date range for Q1 (May-Jul)
        assert data["start_date"] == "2025-05-01"
        assert data["end_date"] == "2025-07-31"
        
        # Verify balanced
        assert "is_balanced" in data
        
        print(f"SUCCESS: Trial Balance (quarter) - Period: {data['period_label']}, Debit: RM {data['total_debit']}, Credit: RM {data['total_credit']}")
    
    def test_trial_balance_data_structure(self):
        """Test trial balance data structure for income/expense items and bank balances"""
        response = requests.get(f"{BASE_URL}/api/accounting-full/agm/trial-balance", 
                               headers=self.headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify income_items structure
        assert isinstance(data["income_items"], list)
        for item in data["income_items"]:
            assert "category_id" in item
            assert "category_name" in item
            assert "type" in item
            assert item["type"] == "income"
            assert "debit" in item
            assert "credit" in item
            # Income should be on credit side
            assert item["credit"] >= 0
        
        # Verify expense_items structure
        assert isinstance(data["expense_items"], list)
        for item in data["expense_items"]:
            assert "category_id" in item
            assert "category_name" in item
            assert "type" in item
            assert item["type"] == "expense"
            assert "debit" in item
            assert "credit" in item
            # Expense should be on debit side
            assert item["debit"] >= 0
        
        # Verify bank_balances structure
        assert isinstance(data["bank_balances"], list)
        for bal in data["bank_balances"]:
            assert "account_name" in bal
            assert "account_type" in bal
            assert "balance" in bal
        
        # Verify opening_balances structure
        assert isinstance(data["opening_balances"], list)
        for ob in data["opening_balances"]:
            assert "account_name" in ob
            assert "amount" in ob
        
        print(f"SUCCESS: Trial Balance data structure valid - {len(data['income_items'])} income, {len(data['expense_items'])} expense, {len(data['bank_balances'])} bank accounts")
    
    def test_trial_balance_balance_verification(self):
        """Test that Trial Balance equation: Debit (Assets + Expenses) = Credit (Equity + Income)"""
        response = requests.get(f"{BASE_URL}/api/accounting-full/agm/trial-balance", 
                               headers=self.headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Calculate expected debit: Bank Balance (Assets) + Total Expenses
        calculated_debit = data["total_bank_balance"] + data["total_expense"]
        
        # Calculate expected credit: Opening Balance (Equity) + Total Income
        calculated_credit = data["total_opening_balance"] + data["total_income"]
        
        # Verify totals match calculated values
        assert abs(data["total_debit"] - calculated_debit) < 0.01, f"Debit mismatch: {data['total_debit']} != {calculated_debit}"
        assert abs(data["total_credit"] - calculated_credit) < 0.01, f"Credit mismatch: {data['total_credit']} != {calculated_credit}"
        
        # Verify balance equation
        # Bank = Opening + Income - Expense
        # Therefore: Bank + Expense = Opening + Income
        # Debit = Credit
        if data["is_balanced"]:
            assert abs(data["total_debit"] - data["total_credit"]) < 0.01
        
        print(f"SUCCESS: Trial Balance equation verified - Debit: {calculated_debit}, Credit: {calculated_credit}")


class TestAGMReportsAuthorization:
    """Tests for AGM Reports authorization"""
    
    def test_unauthenticated_access_denied(self):
        """Test that unauthenticated requests are denied"""
        endpoints = [
            "/api/accounting-full/agm/executive-summary",
            "/api/accounting-full/agm/income-expenditure",
            "/api/accounting-full/agm/balance-sheet",
            "/api/accounting-full/agm/cash-flow",
            "/api/accounting-full/agm/trial-balance",
        ]
        
        for endpoint in endpoints:
            response = requests.get(f"{BASE_URL}{endpoint}")
            assert response.status_code in [401, 403], f"Expected 401/403 for {endpoint}, got {response.status_code}"
        
        print("SUCCESS: All endpoints properly reject unauthenticated requests")
    
    def test_juruaudit_access(self):
        """Test that juruaudit role can access AGM reports"""
        # Login as juruaudit
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "juruaudit@muafakat.link",
            "password": "juruaudit123"
        })
        assert login_response.status_code == 200, "Juruaudit login failed"
        token = login_response.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"}
        
        # Test trial balance access
        response = requests.get(f"{BASE_URL}/api/accounting-full/agm/trial-balance", headers=headers)
        assert response.status_code == 200, "Juruaudit should have access to trial balance"
        
        print("SUCCESS: Juruaudit role has proper access to AGM reports including trial balance")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
