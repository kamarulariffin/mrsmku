"""
Test cases for Accounting Full Module (Sistem Perakaunan MRSM Bersepadu)
Testing: Categories, Transactions, Verification, Reports, Dashboard Stats

Endpoints:
- GET /api/accounting-full/dashboard/stats
- GET /api/accounting-full/categories
- POST /api/accounting-full/categories
- PUT /api/accounting-full/categories/{id}
- DELETE /api/accounting-full/categories/{id}
- GET /api/accounting-full/transactions
- POST /api/accounting-full/transactions
- GET /api/accounting-full/transactions/{id}
- PUT /api/accounting-full/transactions/{id}
- DELETE /api/accounting-full/transactions/{id}
- POST /api/accounting-full/transactions/{id}/verify
- GET /api/accounting-full/pending-verification
- GET /api/accounting-full/reports/monthly
- GET /api/accounting-full/reports/annual
- GET /api/accounting-full/reports/balance-sheet
- GET /api/accounting-full/period-locks
- POST /api/accounting-full/period-locks
"""

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
CREDENTIALS = {
    "bendahari": {"email": "bendahari@muafakat.link", "password": "bendahari123"},
    "sub_bendahari": {"email": "sub_bendahari@muafakat.link", "password": "pembantubendahari123"},
    "juruaudit": {"email": "juruaudit@muafakat.link", "password": "juruaudit123"},
    "superadmin": {"email": "admin@muafakat.link", "password": "admin123"}
}


class TestAccountingFullModule:
    """Tests for the full accounting module"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for each test"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.tokens = {}
        
    def get_token(self, role):
        """Get authentication token for a specific role"""
        if role in self.tokens:
            return self.tokens[role]
            
        creds = CREDENTIALS.get(role)
        if not creds:
            return None
            
        response = self.session.post(f"{BASE_URL}/api/auth/login", json=creds)
        if response.status_code == 200:
            token = response.json().get("access_token")
            self.tokens[role] = token
            return token
        return None
    
    def auth_header(self, role):
        """Get auth header for a role"""
        token = self.get_token(role)
        return {"Authorization": f"Bearer {token}"} if token else {}
    
    # ==================== AUTHENTICATION TESTS ====================
    
    def test_bendahari_login_success(self):
        """Test bendahari can login"""
        response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json=CREDENTIALS["bendahari"]
        )
        assert response.status_code == 200, f"Bendahari login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        print("PASS: Bendahari login successful")
        
    def test_juruaudit_login_success(self):
        """Test juruaudit can login"""
        response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json=CREDENTIALS["juruaudit"]
        )
        assert response.status_code == 200, f"Juruaudit login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        print("PASS: Juruaudit login successful")
        
    # ==================== DASHBOARD STATS TESTS ====================
    
    def test_get_dashboard_stats_bendahari(self):
        """Test bendahari can access dashboard stats"""
        response = self.session.get(
            f"{BASE_URL}/api/accounting-full/dashboard/stats",
            headers=self.auth_header("bendahari")
        )
        assert response.status_code == 200, f"Dashboard stats failed: {response.text}"
        data = response.json()
        
        # Verify structure
        assert "current_month" in data
        assert "all_time" in data
        assert "pending_verification" in data
        assert "total_transactions" in data
        
        # Verify current_month fields
        assert "month" in data["current_month"]
        assert "month_name" in data["current_month"]
        assert "income" in data["current_month"]
        assert "expense" in data["current_month"]
        assert "net" in data["current_month"]
        
        # Verify all_time fields
        assert "income" in data["all_time"]
        assert "expense" in data["all_time"]
        assert "balance" in data["all_time"]
        
        print(f"PASS: Dashboard stats returned - Month: {data['current_month']['month_name']}, " +
              f"Pending: {data['pending_verification']}, Total: {data['total_transactions']}")
              
    def test_get_dashboard_stats_juruaudit(self):
        """Test juruaudit can access dashboard stats"""
        response = self.session.get(
            f"{BASE_URL}/api/accounting-full/dashboard/stats",
            headers=self.auth_header("juruaudit")
        )
        assert response.status_code == 200, f"Juruaudit dashboard stats failed: {response.text}"
        print("PASS: Juruaudit can access dashboard stats")
        
    def test_dashboard_stats_unauthenticated(self):
        """Test unauthenticated access is rejected"""
        response = self.session.get(f"{BASE_URL}/api/accounting-full/dashboard/stats")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASS: Unauthenticated access correctly rejected")
        
    # ==================== CATEGORIES TESTS ====================
    
    def test_list_categories(self):
        """Test listing categories"""
        response = self.session.get(
            f"{BASE_URL}/api/accounting-full/categories",
            headers=self.auth_header("bendahari")
        )
        assert response.status_code == 200, f"List categories failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list)
        if len(data) > 0:
            cat = data[0]
            assert "id" in cat
            assert "name" in cat
            assert "type" in cat
            assert cat["type"] in ["income", "expense"]
            
        print(f"PASS: Categories listed - {len(data)} categories found")
        
    def test_list_categories_by_type(self):
        """Test listing categories filtered by type"""
        # Income categories
        response = self.session.get(
            f"{BASE_URL}/api/accounting-full/categories?type=income",
            headers=self.auth_header("bendahari")
        )
        assert response.status_code == 200
        income_cats = response.json()
        for cat in income_cats:
            assert cat["type"] == "income"
            
        # Expense categories
        response = self.session.get(
            f"{BASE_URL}/api/accounting-full/categories?type=expense",
            headers=self.auth_header("bendahari")
        )
        assert response.status_code == 200
        expense_cats = response.json()
        for cat in expense_cats:
            assert cat["type"] == "expense"
            
        print(f"PASS: Category filter by type works - Income: {len(income_cats)}, Expense: {len(expense_cats)}")
        
    def test_create_category_bendahari(self):
        """Test bendahari can create a category"""
        test_name = f"TEST_Kategori_{datetime.now().strftime('%H%M%S')}"
        response = self.session.post(
            f"{BASE_URL}/api/accounting-full/categories",
            headers=self.auth_header("bendahari"),
            json={
                "name": test_name,
                "type": "income",
                "description": "Test category created by pytest"
            }
        )
        assert response.status_code == 200, f"Create category failed: {response.text}"
        data = response.json()
        
        assert "id" in data
        assert data["name"] == test_name
        assert data["type"] == "income"
        
        # Store for cleanup
        self.created_category_id = data["id"]
        print(f"PASS: Category created - ID: {data['id']}, Name: {data['name']}")
        
    def test_create_category_juruaudit_forbidden(self):
        """Test juruaudit cannot create categories"""
        response = self.session.post(
            f"{BASE_URL}/api/accounting-full/categories",
            headers=self.auth_header("juruaudit"),
            json={
                "name": "Test Category",
                "type": "income"
            }
        )
        assert response.status_code == 403, f"Expected 403 for juruaudit, got {response.status_code}"
        print("PASS: Juruaudit correctly forbidden from creating categories")
        
    # ==================== TRANSACTIONS TESTS ====================
    
    def test_list_transactions(self):
        """Test listing transactions"""
        response = self.session.get(
            f"{BASE_URL}/api/accounting-full/transactions",
            headers=self.auth_header("bendahari")
        )
        assert response.status_code == 200, f"List transactions failed: {response.text}"
        data = response.json()
        
        assert "transactions" in data
        assert "pagination" in data
        assert isinstance(data["transactions"], list)
        
        pagination = data["pagination"]
        assert "page" in pagination
        assert "total" in pagination
        assert "total_pages" in pagination
        
        print(f"PASS: Transactions listed - {len(data['transactions'])} transactions, Total: {pagination['total']}")
        
    def test_list_transactions_with_filters(self):
        """Test listing transactions with filters"""
        # Test type filter
        response = self.session.get(
            f"{BASE_URL}/api/accounting-full/transactions?type=income",
            headers=self.auth_header("bendahari")
        )
        assert response.status_code == 200
        
        # Test status filter
        response = self.session.get(
            f"{BASE_URL}/api/accounting-full/transactions?status=verified",
            headers=self.auth_header("bendahari")
        )
        assert response.status_code == 200
        
        # Test pagination
        response = self.session.get(
            f"{BASE_URL}/api/accounting-full/transactions?page=1&limit=5",
            headers=self.auth_header("bendahari")
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["transactions"]) <= 5
        
        print("PASS: Transaction filters work correctly")
        
    def test_create_transaction_bendahari(self):
        """Test bendahari can create a transaction"""
        # First get a category
        cat_response = self.session.get(
            f"{BASE_URL}/api/accounting-full/categories?type=income",
            headers=self.auth_header("bendahari")
        )
        categories = cat_response.json()
        
        if not categories:
            pytest.skip("No income categories available")
            
        category_id = categories[0]["id"]
        today = datetime.now().strftime("%Y-%m-%d")
        
        response = self.session.post(
            f"{BASE_URL}/api/accounting-full/transactions",
            headers=self.auth_header("bendahari"),
            json={
                "type": "income",
                "category_id": category_id,
                "amount": 100.00,
                "transaction_date": today,
                "description": "TEST_Transaksi ujian pytest - harap diabaikan",
                "source": "manual"
            }
        )
        assert response.status_code == 200, f"Create transaction failed: {response.text}"
        data = response.json()
        
        assert "id" in data
        assert "transaction_number" in data
        assert data["transaction_number"].startswith("TRX-")
        
        self.created_transaction_id = data["id"]
        self.created_transaction_number = data["transaction_number"]
        print(f"PASS: Transaction created - {data['transaction_number']}")
        return data["id"], data["transaction_number"]
        
    def test_create_transaction_auto_numbering(self):
        """Test that transaction numbers are auto-generated correctly"""
        # Get a category
        cat_response = self.session.get(
            f"{BASE_URL}/api/accounting-full/categories?type=expense",
            headers=self.auth_header("bendahari")
        )
        categories = cat_response.json()
        
        if not categories:
            pytest.skip("No expense categories available")
            
        category_id = categories[0]["id"]
        today = datetime.now().strftime("%Y-%m-%d")
        
        # Create two transactions
        tx_numbers = []
        for i in range(2):
            response = self.session.post(
                f"{BASE_URL}/api/accounting-full/transactions",
                headers=self.auth_header("bendahari"),
                json={
                    "type": "expense",
                    "category_id": category_id,
                    "amount": 50.00 + i,
                    "transaction_date": today,
                    "description": f"TEST_Transaksi ujian auto-numbering {i}",
                    "source": "manual"
                }
            )
            if response.status_code == 200:
                tx_numbers.append(response.json()["transaction_number"])
                
        # Verify format TRX-YYYY-XXXX
        year = datetime.now().year
        for tx_num in tx_numbers:
            assert tx_num.startswith(f"TRX-{year}-")
            parts = tx_num.split("-")
            assert len(parts) == 3
            assert len(parts[2]) == 4  # 4-digit sequence
            
        print(f"PASS: Auto-numbering works - Generated: {tx_numbers}")
        
    def test_get_transaction_details(self):
        """Test getting transaction details"""
        # First get a transaction
        list_response = self.session.get(
            f"{BASE_URL}/api/accounting-full/transactions?limit=1",
            headers=self.auth_header("bendahari")
        )
        transactions = list_response.json().get("transactions", [])
        
        if not transactions:
            pytest.skip("No transactions available")
            
        tx_id = transactions[0]["id"]
        
        response = self.session.get(
            f"{BASE_URL}/api/accounting-full/transactions/{tx_id}",
            headers=self.auth_header("bendahari")
        )
        assert response.status_code == 200, f"Get transaction failed: {response.text}"
        data = response.json()
        
        # Verify all expected fields
        assert "id" in data
        assert "transaction_number" in data
        assert "type" in data
        assert "type_display" in data
        assert "category_name" in data
        assert "amount" in data
        assert "status" in data
        assert "status_display" in data
        assert "created_by_name" in data
        
        print(f"PASS: Transaction details retrieved - {data['transaction_number']}: RM{data['amount']}")
        
    def test_create_transaction_juruaudit_forbidden(self):
        """Test juruaudit cannot create transactions"""
        cat_response = self.session.get(
            f"{BASE_URL}/api/accounting-full/categories?type=income",
            headers=self.auth_header("juruaudit")
        )
        categories = cat_response.json()
        
        if not categories:
            pytest.skip("No categories available")
            
        response = self.session.post(
            f"{BASE_URL}/api/accounting-full/transactions",
            headers=self.auth_header("juruaudit"),
            json={
                "type": "income",
                "category_id": categories[0]["id"],
                "amount": 100.00,
                "transaction_date": datetime.now().strftime("%Y-%m-%d"),
                "description": "Test transaction by juruaudit",
                "source": "manual"
            }
        )
        assert response.status_code == 403, f"Expected 403 for juruaudit, got {response.status_code}"
        print("PASS: Juruaudit correctly forbidden from creating transactions")
        
    # ==================== VERIFICATION TESTS ====================
    
    def test_get_pending_verification_juruaudit(self):
        """Test juruaudit can get pending verification list"""
        response = self.session.get(
            f"{BASE_URL}/api/accounting-full/pending-verification",
            headers=self.auth_header("juruaudit")
        )
        assert response.status_code == 200, f"Pending verification failed: {response.text}"
        data = response.json()
        
        assert "transactions" in data
        assert "pagination" in data
        
        print(f"PASS: Pending verification - {data['pagination']['total']} transactions waiting")
        
    def test_pending_verification_bendahari_forbidden(self):
        """Test bendahari cannot access pending verification"""
        response = self.session.get(
            f"{BASE_URL}/api/accounting-full/pending-verification",
            headers=self.auth_header("bendahari")
        )
        assert response.status_code == 403, f"Expected 403 for bendahari, got {response.status_code}"
        print("PASS: Bendahari correctly forbidden from pending verification page")
        
    def test_verify_transaction_juruaudit(self):
        """Test juruaudit can verify a transaction"""
        # First get a pending transaction
        response = self.session.get(
            f"{BASE_URL}/api/accounting-full/pending-verification",
            headers=self.auth_header("juruaudit")
        )
        pending = response.json().get("transactions", [])
        
        if not pending:
            pytest.skip("No pending transactions to verify")
            
        tx_id = pending[0]["id"]
        
        # Verify the transaction
        verify_response = self.session.post(
            f"{BASE_URL}/api/accounting-full/transactions/{tx_id}/verify",
            headers=self.auth_header("juruaudit"),
            json={
                "status": "verified",
                "verification_notes": "TEST: Verified by pytest"
            }
        )
        assert verify_response.status_code == 200, f"Verify failed: {verify_response.text}"
        data = verify_response.json()
        assert "message" in data
        
        print(f"PASS: Transaction verified by juruaudit - {pending[0]['transaction_number']}")
        
    def test_verify_transaction_bendahari_forbidden(self):
        """Test bendahari cannot verify transactions"""
        # Get a pending transaction
        response = self.session.get(
            f"{BASE_URL}/api/accounting-full/pending-verification",
            headers=self.auth_header("juruaudit")
        )
        pending = response.json().get("transactions", [])
        
        if not pending:
            pytest.skip("No pending transactions available")
            
        tx_id = pending[0]["id"]
        
        # Try to verify as bendahari
        verify_response = self.session.post(
            f"{BASE_URL}/api/accounting-full/transactions/{tx_id}/verify",
            headers=self.auth_header("bendahari"),
            json={
                "status": "verified",
                "verification_notes": "Test"
            }
        )
        assert verify_response.status_code == 403, f"Expected 403 for bendahari verify, got {verify_response.status_code}"
        print("PASS: Bendahari correctly forbidden from verifying transactions")
        
    # ==================== REPORTS TESTS ====================
    
    def test_get_monthly_report(self):
        """Test getting monthly report"""
        now = datetime.now()
        response = self.session.get(
            f"{BASE_URL}/api/accounting-full/reports/monthly?year={now.year}&month={now.month}",
            headers=self.auth_header("bendahari")
        )
        assert response.status_code == 200, f"Monthly report failed: {response.text}"
        data = response.json()
        
        assert data["year"] == now.year
        assert data["month"] == now.month
        assert "month_name" in data
        assert "total_income" in data
        assert "total_expense" in data
        assert "net_balance" in data
        assert "income_by_category" in data
        assert "expense_by_category" in data
        assert "transaction_count" in data
        assert "verified_count" in data
        assert "pending_count" in data
        assert "is_locked" in data
        
        print(f"PASS: Monthly report - {data['month_name']} {data['year']}: " +
              f"Income={data['total_income']}, Expense={data['total_expense']}, Net={data['net_balance']}")
              
    def test_get_annual_report(self):
        """Test getting annual report"""
        year = datetime.now().year
        response = self.session.get(
            f"{BASE_URL}/api/accounting-full/reports/annual?year={year}",
            headers=self.auth_header("bendahari")
        )
        assert response.status_code == 200, f"Annual report failed: {response.text}"
        data = response.json()
        
        assert data["year"] == year
        assert "total_income" in data
        assert "total_expense" in data
        assert "net_balance" in data
        assert "monthly_breakdown" in data
        assert "income_by_category" in data
        assert "expense_by_category" in data
        
        # Verify monthly breakdown has 12 months
        assert len(data["monthly_breakdown"]) == 12
        
        print(f"PASS: Annual report {year}: Income={data['total_income']}, Expense={data['total_expense']}")
        
    def test_get_balance_sheet(self):
        """Test getting balance sheet"""
        response = self.session.get(
            f"{BASE_URL}/api/accounting-full/reports/balance-sheet",
            headers=self.auth_header("bendahari")
        )
        assert response.status_code == 200, f"Balance sheet failed: {response.text}"
        data = response.json()
        
        assert "as_of_date" in data
        assert "opening_balance" in data
        assert "total_income" in data
        assert "total_expense" in data
        assert "closing_balance" in data
        assert "monthly_trend" in data
        
        print(f"PASS: Balance sheet - Closing balance: RM{data['closing_balance']}")
        
    # ==================== PERIOD LOCKS TESTS ====================
    
    def test_get_period_locks_juruaudit(self):
        """Test juruaudit can view period locks"""
        response = self.session.get(
            f"{BASE_URL}/api/accounting-full/period-locks",
            headers=self.auth_header("juruaudit")
        )
        assert response.status_code == 200, f"Period locks failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        
        print(f"PASS: Period locks retrieved - {len(data)} locked periods")
        
    def test_period_locks_bendahari_forbidden(self):
        """Test bendahari cannot access period locks"""
        response = self.session.get(
            f"{BASE_URL}/api/accounting-full/period-locks",
            headers=self.auth_header("bendahari")
        )
        assert response.status_code == 403, f"Expected 403 for bendahari, got {response.status_code}"
        print("PASS: Bendahari correctly forbidden from period locks")
        
    # ==================== AUDIT LOGS TESTS ====================
    
    def test_get_audit_logs_juruaudit(self):
        """Test juruaudit can view audit logs"""
        response = self.session.get(
            f"{BASE_URL}/api/accounting-full/audit-logs",
            headers=self.auth_header("juruaudit")
        )
        assert response.status_code == 200, f"Audit logs failed: {response.text}"
        data = response.json()
        
        assert "logs" in data
        assert "pagination" in data
        
        print(f"PASS: Audit logs - {data['pagination']['total']} entries")
        
    def test_audit_logs_bendahari_forbidden(self):
        """Test bendahari cannot access audit logs"""
        response = self.session.get(
            f"{BASE_URL}/api/accounting-full/audit-logs",
            headers=self.auth_header("bendahari")
        )
        assert response.status_code == 403, f"Expected 403 for bendahari, got {response.status_code}"
        print("PASS: Bendahari correctly forbidden from audit logs")


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
