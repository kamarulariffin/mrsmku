"""
Test Accounting Module - API Tests
Testing accounting dashboard endpoints for Muafakat, Merchandise, Koperasi, and PUM accounts
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@muafakat.link"
ADMIN_PASSWORD = "admin123"
BENDAHARI_EMAIL = "bendahari@muafakat.link"
BENDAHARI_PASSWORD = "bendahari123"
PARENT_EMAIL = "parent@muafakat.link"
PARENT_PASSWORD = "parent123"

class TestAccountingModule:
    """Accounting Module API Tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def get_auth_token(self, email, password):
        """Helper to get auth token"""
        res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password
        })
        if res.status_code == 200:
            return res.json().get("access_token")
        return None
    
    # ============ AUTHENTICATION TESTS ============
    
    def test_admin_login(self):
        """Test admin can login"""
        res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert res.status_code == 200, f"Admin login failed: {res.text}"
        data = res.json()
        assert "access_token" in data
        assert data["user"]["role"] == "admin"
        print(f"✓ Admin login successful")
    
    def test_bendahari_login(self):
        """Test bendahari can login"""
        res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": BENDAHARI_EMAIL,
            "password": BENDAHARI_PASSWORD
        })
        assert res.status_code == 200, f"Bendahari login failed: {res.text}"
        data = res.json()
        assert "access_token" in data
        assert data["user"]["role"] == "bendahari"
        print(f"✓ Bendahari login successful")
    
    # ============ ACCOUNTING SUMMARY TESTS ============
    
    def test_accounting_summary_admin_access(self):
        """Test admin can access accounting summary endpoint"""
        token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token, "Failed to get admin token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        res = self.session.get(f"{BASE_URL}/api/accounting/summary")
        
        assert res.status_code == 200, f"Failed to get accounting summary: {res.text}"
        data = res.json()
        
        # Verify response structure
        assert "generated_at" in data, "Missing generated_at in response"
        assert "period" in data, "Missing period in response"
        assert "grand_totals" in data, "Missing grand_totals in response"
        assert "accounts" in data, "Missing accounts in response"
        
        # Verify grand_totals structure
        grand_totals = data["grand_totals"]
        assert "total_revenue" in grand_totals, "Missing total_revenue"
        assert "total_sales" in grand_totals, "Missing total_sales"
        assert "total_inventory_value" in grand_totals, "Missing total_inventory_value"
        assert "total_orders" in grand_totals, "Missing total_orders"
        
        print(f"✓ Accounting summary accessible by admin")
        print(f"  - Total Revenue: RM {grand_totals['total_revenue']}")
        print(f"  - Total Sales: RM {grand_totals['total_sales']}")
        print(f"  - Total Inventory Value: RM {grand_totals['total_inventory_value']}")
        print(f"  - Total Orders: {grand_totals['total_orders']}")
    
    def test_accounting_summary_bendahari_access(self):
        """Test bendahari can access accounting summary endpoint"""
        token = self.get_auth_token(BENDAHARI_EMAIL, BENDAHARI_PASSWORD)
        assert token, "Failed to get bendahari token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        res = self.session.get(f"{BASE_URL}/api/accounting/summary")
        
        assert res.status_code == 200, f"Bendahari should have access to accounting summary: {res.text}"
        data = res.json()
        assert "accounts" in data
        print(f"✓ Accounting summary accessible by bendahari")
    
    def test_accounting_summary_parent_denied(self):
        """Test parent cannot access accounting summary endpoint"""
        token = self.get_auth_token(PARENT_EMAIL, PARENT_PASSWORD)
        assert token, "Failed to get parent token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        res = self.session.get(f"{BASE_URL}/api/accounting/summary")
        
        assert res.status_code == 403, f"Parent should be denied access: {res.status_code}"
        print(f"✓ Parent correctly denied access to accounting summary")
    
    def test_accounting_summary_accounts_structure(self):
        """Test the accounts structure in accounting summary"""
        token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token, "Failed to get admin token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        res = self.session.get(f"{BASE_URL}/api/accounting/summary")
        
        assert res.status_code == 200
        accounts = res.json()["accounts"]
        
        # Test Muafakat account
        assert "muafakat" in accounts, "Missing muafakat account"
        muafakat = accounts["muafakat"]
        assert "name" in muafakat
        assert "total_revenue" in muafakat
        assert "confirmed" in muafakat
        assert "paid_out" in muafakat
        assert "pending" in muafakat
        print(f"✓ Muafakat account: Total Revenue RM {muafakat['total_revenue']}")
        
        # Test Merchandise account
        assert "merchandise" in accounts, "Missing merchandise account"
        merchandise = accounts["merchandise"]
        assert "name" in merchandise
        assert "total_sales" in merchandise
        assert "total_orders" in merchandise
        assert "inventory" in merchandise
        print(f"✓ Merchandise account: Sales RM {merchandise['total_sales']}, Orders: {merchandise['total_orders']}")
        
        # Test Koperasi account
        assert "koperasi" in accounts, "Missing koperasi account"
        koperasi = accounts["koperasi"]
        assert "name" in koperasi
        assert "total_sales" in koperasi
        assert "commission_earned" in koperasi
        assert "total_orders" in koperasi
        print(f"✓ Koperasi account: Sales RM {koperasi['total_sales']}, Commission: RM {koperasi['commission_earned']}")
        
        # Test PUM account
        assert "pum" in accounts, "Missing pum account"
        pum = accounts["pum"]
        assert "name" in pum
        assert "total_sales" in pum
        assert "commission_earned" in pum
        assert "inventory" in pum
        print(f"✓ PUM account: Sales RM {pum['total_sales']}, Commission: RM {pum['commission_earned']}")
    
    def test_accounting_summary_with_period_filter(self):
        """Test accounting summary with date period filter"""
        token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token, "Failed to get admin token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Test with start_date only (this year)
        res = self.session.get(f"{BASE_URL}/api/accounting/summary", params={
            "start_date": "2025-01-01T00:00:00Z"
        })
        assert res.status_code == 200, f"Failed with start_date filter: {res.text}"
        
        # Test with both start and end date
        res = self.session.get(f"{BASE_URL}/api/accounting/summary", params={
            "start_date": "2025-01-01T00:00:00Z",
            "end_date": "2025-12-31T23:59:59Z"
        })
        assert res.status_code == 200, f"Failed with date range filter: {res.text}"
        print(f"✓ Accounting summary works with period filters")
    
    # ============ MONTHLY TREND TESTS ============
    
    def test_monthly_trend_admin_access(self):
        """Test admin can access monthly trend endpoint"""
        token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token, "Failed to get admin token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        res = self.session.get(f"{BASE_URL}/api/accounting/monthly-trend")
        
        assert res.status_code == 200, f"Failed to get monthly trend: {res.text}"
        data = res.json()
        
        # Verify response structure
        assert "months_requested" in data, "Missing months_requested"
        assert "trend" in data, "Missing trend data"
        assert isinstance(data["trend"], list), "Trend should be a list"
        
        print(f"✓ Monthly trend accessible by admin")
        print(f"  - Months requested: {data['months_requested']}")
        print(f"  - Trend data points: {len(data['trend'])}")
    
    def test_monthly_trend_with_custom_months(self):
        """Test monthly trend with custom months parameter"""
        token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token, "Failed to get admin token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Test with 3 months
        res = self.session.get(f"{BASE_URL}/api/accounting/monthly-trend", params={"months": 3})
        assert res.status_code == 200
        data = res.json()
        assert data["months_requested"] == 3
        
        # Test with 12 months
        res = self.session.get(f"{BASE_URL}/api/accounting/monthly-trend", params={"months": 12})
        assert res.status_code == 200
        data = res.json()
        assert data["months_requested"] == 12
        
        print(f"✓ Monthly trend works with custom months parameter")
    
    def test_monthly_trend_data_structure(self):
        """Test the structure of monthly trend data"""
        token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token, "Failed to get admin token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        res = self.session.get(f"{BASE_URL}/api/accounting/monthly-trend", params={"months": 6})
        
        assert res.status_code == 200
        trend = res.json()["trend"]
        
        # If there's any data, verify structure
        if len(trend) > 0:
            month_data = trend[0]
            assert "period" in month_data, "Missing period in trend data"
            assert "month_name" in month_data, "Missing month_name in trend data"
            assert "muafakat" in month_data, "Missing muafakat in trend data"
            assert "koperasi" in month_data, "Missing koperasi in trend data"
            assert "pum" in month_data, "Missing pum in trend data"
            assert "total" in month_data, "Missing total in trend data"
            print(f"✓ Monthly trend data structure is correct")
            print(f"  - Sample month: {month_data['month_name']}, Total: RM {month_data['total']}")
        else:
            print(f"✓ Monthly trend endpoint works (no data yet)")
    
    def test_monthly_trend_parent_denied(self):
        """Test parent cannot access monthly trend endpoint"""
        token = self.get_auth_token(PARENT_EMAIL, PARENT_PASSWORD)
        assert token, "Failed to get parent token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        res = self.session.get(f"{BASE_URL}/api/accounting/monthly-trend")
        
        assert res.status_code == 403, f"Parent should be denied access: {res.status_code}"
        print(f"✓ Parent correctly denied access to monthly trend")
    
    # ============ TRANSACTIONS ENDPOINT TESTS ============
    
    def test_recent_transactions_admin_access(self):
        """Test admin can access recent transactions endpoint"""
        token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token, "Failed to get admin token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        res = self.session.get(f"{BASE_URL}/api/accounting/transactions")
        
        assert res.status_code == 200, f"Failed to get transactions: {res.text}"
        data = res.json()
        
        assert "transactions" in data, "Missing transactions in response"
        assert "total" in data, "Missing total count"
        assert isinstance(data["transactions"], list), "Transactions should be a list"
        
        print(f"✓ Transactions accessible by admin")
        print(f"  - Total transactions: {data['total']}")
    
    def test_transactions_with_limit(self):
        """Test transactions with custom limit"""
        token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token, "Failed to get admin token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        res = self.session.get(f"{BASE_URL}/api/accounting/transactions", params={"limit": 10})
        assert res.status_code == 200
        data = res.json()
        assert len(data["transactions"]) <= 10, "Returned more than limit"
        print(f"✓ Transactions respect limit parameter")
    
    # ============ COMMISSION BREAKDOWN TESTS ============
    
    def test_commission_breakdown_admin_access(self):
        """Test admin can access commission breakdown endpoint"""
        token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token, "Failed to get admin token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        res = self.session.get(f"{BASE_URL}/api/accounting/commission-breakdown")
        
        assert res.status_code == 200, f"Failed to get commission breakdown: {res.text}"
        data = res.json()
        
        assert "breakdown" in data, "Missing breakdown in response"
        assert "totals_by_type" in data, "Missing totals_by_type in response"
        
        print(f"✓ Commission breakdown accessible by admin")
        print(f"  - Breakdown items: {len(data['breakdown'])}")
        print(f"  - Totals by type: {len(data['totals_by_type'])}")
    
    def test_commission_breakdown_with_date_range(self):
        """Test commission breakdown with date range"""
        token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token, "Failed to get admin token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        res = self.session.get(f"{BASE_URL}/api/accounting/commission-breakdown", params={
            "start_date": "2025-01-01T00:00:00Z",
            "end_date": "2025-12-31T23:59:59Z"
        })
        assert res.status_code == 200, f"Failed with date range: {res.text}"
        print(f"✓ Commission breakdown works with date range filter")
    
    # ============ AUTHORIZATION TESTS ============
    
    def test_accounting_endpoints_require_auth(self):
        """Test all accounting endpoints require authentication"""
        endpoints = [
            "/api/accounting/summary",
            "/api/accounting/monthly-trend",
            "/api/accounting/transactions",
            "/api/accounting/commission-breakdown"
        ]
        
        # Create a new session without auth
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        for endpoint in endpoints:
            res = session.get(f"{BASE_URL}{endpoint}")
            # Should return 401 or 403 without auth
            assert res.status_code in [401, 403], f"Endpoint {endpoint} should require auth, got {res.status_code}"
        
        print(f"✓ All accounting endpoints require authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
