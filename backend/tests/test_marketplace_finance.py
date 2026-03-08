"""
Test Marketplace Phase 4: Financial & Reporting System
Tests: Finance Dashboard, Vendor Summary, Ledger, Commission Report, Payout Management
Commission rates: Dana Kecemerlangan 5%, Koperasi 5%, Vendor 90%
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test Credentials
SUPERADMIN_EMAIL = "superadmin@muafakat.link"
SUPERADMIN_PASSWORD = "admin123"
BENDAHARI_EMAIL = "bendahari@muafakat.link"
BENDAHARI_PASSWORD = "bendahari123"
PARENT_EMAIL = "parent@muafakat.link"
PARENT_PASSWORD = "parent123"


class TestMarketplaceFinance:
    """Test Marketplace Phase 4 Financial Dashboard & Reporting Endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup tokens for testing"""
        self.superadmin_token = self._get_token(SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
        self.bendahari_token = self._get_token(BENDAHARI_EMAIL, BENDAHARI_PASSWORD)
        self.parent_token = self._get_token(PARENT_EMAIL, PARENT_PASSWORD)
    
    def _get_token(self, email, password):
        """Get auth token for user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password
        })
        if response.status_code == 200:
            return response.json().get("access_token") or response.json().get("token")
        return None
    
    def _headers(self, token):
        """Get auth headers"""
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    # ==================== FINANCE DASHBOARD TESTS ====================
    
    def test_finance_dashboard_superadmin_access(self):
        """Test GET /api/marketplace/finance/dashboard - Superadmin can access"""
        if not self.superadmin_token:
            pytest.skip("Superadmin auth failed")
        
        response = requests.get(
            f"{BASE_URL}/api/marketplace/finance/dashboard",
            headers=self._headers(self.superadmin_token)
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "summary" in data, "Response should contain summary"
        assert "monthly_breakdown" in data, "Response should contain monthly_breakdown"
        
        summary = data["summary"]
        # Check all required fields in summary
        required_fields = [
            "dana_kecemerlangan_total", "dana_kecemerlangan_month",
            "koperasi_total", "koperasi_month",
            "vendor_earnings_total", "vendor_payouts_total", "vendor_balance_unpaid",
            "pending_payouts_count", "sales_total", "sales_month",
            "orders_total", "orders_month"
        ]
        for field in required_fields:
            assert field in summary, f"Summary missing field: {field}"
        
        print(f"✓ Finance Dashboard accessible: Dana Kecemerlangan={summary['dana_kecemerlangan_total']}, Koperasi={summary['koperasi_total']}, Vendor Earnings={summary['vendor_earnings_total']}")
    
    def test_finance_dashboard_bendahari_access(self):
        """Test GET /api/marketplace/finance/dashboard - Bendahari can access"""
        if not self.bendahari_token:
            pytest.skip("Bendahari auth failed")
        
        response = requests.get(
            f"{BASE_URL}/api/marketplace/finance/dashboard",
            headers=self._headers(self.bendahari_token)
        )
        
        assert response.status_code == 200, f"Bendahari should have access. Got {response.status_code}: {response.text}"
        print("✓ Bendahari can access Finance Dashboard")
    
    def test_finance_dashboard_parent_forbidden(self):
        """Test GET /api/marketplace/finance/dashboard - Parent denied access"""
        if not self.parent_token:
            pytest.skip("Parent auth failed")
        
        response = requests.get(
            f"{BASE_URL}/api/marketplace/finance/dashboard",
            headers=self._headers(self.parent_token)
        )
        
        assert response.status_code == 403, f"Parent should be forbidden. Got {response.status_code}"
        print("✓ Parent correctly denied access to Finance Dashboard")
    
    # ==================== VENDOR SUMMARY TESTS ====================
    
    def test_vendor_summary_superadmin_access(self):
        """Test GET /api/marketplace/finance/vendor-summary - Returns vendor financial summary"""
        if not self.superadmin_token:
            pytest.skip("Superadmin auth failed")
        
        response = requests.get(
            f"{BASE_URL}/api/marketplace/finance/vendor-summary",
            headers=self._headers(self.superadmin_token)
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Response should be a list
        assert isinstance(data, list), "Response should be a list of vendors"
        
        # If there are vendors, verify structure
        if len(data) > 0:
            vendor = data[0]
            required_fields = [
                "vendor_id", "vendor_name", "parent_name", "total_sales",
                "total_earnings", "total_paid", "pending_payout", 
                "available_balance", "orders_count"
            ]
            for field in required_fields:
                assert field in vendor, f"Vendor summary missing field: {field}"
            print(f"✓ Vendor Summary: {len(data)} vendors found. First: {vendor['vendor_name']} - Sales: {vendor['total_sales']}")
        else:
            print("✓ Vendor Summary endpoint works (no vendors with earnings yet)")
    
    def test_vendor_summary_bendahari_access(self):
        """Test GET /api/marketplace/finance/vendor-summary - Bendahari can access"""
        if not self.bendahari_token:
            pytest.skip("Bendahari auth failed")
        
        response = requests.get(
            f"{BASE_URL}/api/marketplace/finance/vendor-summary",
            headers=self._headers(self.bendahari_token)
        )
        
        assert response.status_code == 200, f"Bendahari should have access. Got {response.status_code}"
        print("✓ Bendahari can access Vendor Summary")
    
    def test_vendor_summary_parent_forbidden(self):
        """Test GET /api/marketplace/finance/vendor-summary - Parent denied access"""
        if not self.parent_token:
            pytest.skip("Parent auth failed")
        
        response = requests.get(
            f"{BASE_URL}/api/marketplace/finance/vendor-summary",
            headers=self._headers(self.parent_token)
        )
        
        assert response.status_code == 403, f"Parent should be forbidden. Got {response.status_code}"
        print("✓ Parent correctly denied access to Vendor Summary")
    
    # ==================== LEDGER TESTS ====================
    
    def test_ledger_default_pagination(self):
        """Test GET /api/marketplace/finance/ledger - Returns paginated ledger entries"""
        if not self.superadmin_token:
            pytest.skip("Superadmin auth failed")
        
        response = requests.get(
            f"{BASE_URL}/api/marketplace/finance/ledger",
            headers=self._headers(self.superadmin_token)
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "entries" in data, "Response should contain entries"
        assert "pagination" in data, "Response should contain pagination"
        assert "totals" in data, "Response should contain totals"
        
        pagination = data["pagination"]
        assert "total" in pagination
        assert "page" in pagination
        assert "limit" in pagination
        assert "pages" in pagination
        
        print(f"✓ Ledger endpoint works: {len(data['entries'])} entries, page {pagination['page']}/{pagination['pages']}")
    
    def test_ledger_filter_by_type(self):
        """Test GET /api/marketplace/finance/ledger?type=dana_kecemerlangan - Filter by type"""
        if not self.superadmin_token:
            pytest.skip("Superadmin auth failed")
        
        response = requests.get(
            f"{BASE_URL}/api/marketplace/finance/ledger?type=dana_kecemerlangan",
            headers=self._headers(self.superadmin_token)
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # All entries should be dana_kecemerlangan type
        for entry in data["entries"]:
            assert entry["type"] == "dana_kecemerlangan", f"Entry type should be dana_kecemerlangan, got {entry['type']}"
        
        print(f"✓ Ledger filter by type works: {len(data['entries'])} dana_kecemerlangan entries")
    
    def test_ledger_pagination_params(self):
        """Test GET /api/marketplace/finance/ledger?page=1&limit=10 - Pagination works"""
        if not self.superadmin_token:
            pytest.skip("Superadmin auth failed")
        
        response = requests.get(
            f"{BASE_URL}/api/marketplace/finance/ledger?page=1&limit=10",
            headers=self._headers(self.superadmin_token)
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["pagination"]["page"] == 1
        assert data["pagination"]["limit"] == 10
        assert len(data["entries"]) <= 10
        
        print(f"✓ Ledger pagination works: limit={data['pagination']['limit']}")
    
    # ==================== COMMISSION REPORT TESTS ====================
    
    def test_commission_report_no_filters(self):
        """Test GET /api/marketplace/finance/commission-report - Returns commission report"""
        if not self.superadmin_token:
            pytest.skip("Superadmin auth failed")
        
        response = requests.get(
            f"{BASE_URL}/api/marketplace/finance/commission-report",
            headers=self._headers(self.superadmin_token)
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "period" in data, "Response should contain period"
        assert "summary" in data, "Response should contain summary"
        assert "by_date" in data, "Response should contain by_date"
        assert "by_vendor" in data, "Response should contain by_vendor"
        
        summary = data["summary"]
        required_fields = ["total_sales", "total_orders", "dana_kecemerlangan", "koperasi", "vendor_earnings"]
        for field in required_fields:
            assert field in summary, f"Summary missing field: {field}"
        
        print(f"✓ Commission Report: Total Sales={summary['total_sales']}, DK={summary['dana_kecemerlangan']}, Kop={summary['koperasi']}, Vendor={summary['vendor_earnings']}")
    
    def test_commission_report_with_date_filter(self):
        """Test GET /api/marketplace/finance/commission-report?start_date=...&end_date=... - Date filter works"""
        if not self.superadmin_token:
            pytest.skip("Superadmin auth failed")
        
        response = requests.get(
            f"{BASE_URL}/api/marketplace/finance/commission-report?start_date=2024-01-01T00:00:00Z&end_date=2026-12-31T23:59:59Z",
            headers=self._headers(self.superadmin_token)
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert data["period"]["start"] == "2024-01-01T00:00:00Z"
        assert data["period"]["end"] == "2026-12-31T23:59:59Z"
        
        print("✓ Commission Report date filter works")
    
    def test_commission_report_bendahari_access(self):
        """Test GET /api/marketplace/finance/commission-report - Bendahari can access"""
        if not self.bendahari_token:
            pytest.skip("Bendahari auth failed")
        
        response = requests.get(
            f"{BASE_URL}/api/marketplace/finance/commission-report",
            headers=self._headers(self.bendahari_token)
        )
        
        assert response.status_code == 200, f"Bendahari should have access. Got {response.status_code}"
        print("✓ Bendahari can access Commission Report")
    
    # ==================== PAYOUTS MANAGEMENT TESTS ====================
    
    def test_all_payouts_default(self):
        """Test GET /api/marketplace/payouts/all - Returns all payouts with pagination"""
        if not self.superadmin_token:
            pytest.skip("Superadmin auth failed")
        
        response = requests.get(
            f"{BASE_URL}/api/marketplace/payouts/all",
            headers=self._headers(self.superadmin_token)
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "payouts" in data, "Response should contain payouts"
        assert "pagination" in data, "Response should contain pagination"
        assert "status_counts" in data, "Response should contain status_counts"
        
        # Verify payout structure if any exist
        if len(data["payouts"]) > 0:
            payout = data["payouts"][0]
            required_fields = [
                "id", "vendor_id", "vendor_name", "amount", "bank_name",
                "bank_account_number", "bank_account_name", "status", "requested_at"
            ]
            for field in required_fields:
                assert field in payout, f"Payout missing field: {field}"
        
        print(f"✓ All Payouts: {len(data['payouts'])} payouts, Status counts: {data['status_counts']}")
    
    def test_all_payouts_filter_status(self):
        """Test GET /api/marketplace/payouts/all?status=pending - Filter by status"""
        if not self.superadmin_token:
            pytest.skip("Superadmin auth failed")
        
        response = requests.get(
            f"{BASE_URL}/api/marketplace/payouts/all?status=pending",
            headers=self._headers(self.superadmin_token)
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # All returned payouts should be pending
        for payout in data["payouts"]:
            assert payout["status"] == "pending", f"Expected pending status, got {payout['status']}"
        
        print(f"✓ Payouts filter by status works: {len(data['payouts'])} pending payouts")
    
    def test_all_payouts_pagination(self):
        """Test GET /api/marketplace/payouts/all?page=1&limit=5 - Pagination works"""
        if not self.superadmin_token:
            pytest.skip("Superadmin auth failed")
        
        response = requests.get(
            f"{BASE_URL}/api/marketplace/payouts/all?page=1&limit=5",
            headers=self._headers(self.superadmin_token)
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["pagination"]["page"] == 1
        assert data["pagination"]["limit"] == 5
        assert len(data["payouts"]) <= 5
        
        print(f"✓ Payouts pagination works")
    
    def test_all_payouts_bendahari_access(self):
        """Test GET /api/marketplace/payouts/all - Bendahari can access"""
        if not self.bendahari_token:
            pytest.skip("Bendahari auth failed")
        
        response = requests.get(
            f"{BASE_URL}/api/marketplace/payouts/all",
            headers=self._headers(self.bendahari_token)
        )
        
        assert response.status_code == 200, f"Bendahari should have access. Got {response.status_code}"
        print("✓ Bendahari can access All Payouts")
    
    def test_all_payouts_parent_forbidden(self):
        """Test GET /api/marketplace/payouts/all - Parent denied access"""
        if not self.parent_token:
            pytest.skip("Parent auth failed")
        
        response = requests.get(
            f"{BASE_URL}/api/marketplace/payouts/all",
            headers=self._headers(self.parent_token)
        )
        
        assert response.status_code == 403, f"Parent should be forbidden. Got {response.status_code}"
        print("✓ Parent correctly denied access to All Payouts")
    
    # ==================== PAYOUT APPROVE/REJECT TESTS ====================
    
    def test_payout_approve_invalid_id(self):
        """Test PUT /api/marketplace/payouts/{id}/approve - Invalid ID returns 404 or 400"""
        if not self.superadmin_token:
            pytest.skip("Superadmin auth failed")
        
        # Test with invalid object ID format
        response = requests.put(
            f"{BASE_URL}/api/marketplace/payouts/invalid-id/approve",
            headers=self._headers(self.superadmin_token),
            json={"status": "approved"}
        )
        
        # Should return 400 (invalid ObjectId) or 404 (not found) or 520 (server error from invalid ObjectId)
        assert response.status_code in [400, 404, 500, 520], f"Expected error for invalid ID, got {response.status_code}"
        print(f"✓ Payout approve with invalid ID returns error: {response.status_code}")
    
    def test_payout_approve_nonexistent_id(self):
        """Test PUT /api/marketplace/payouts/{id}/approve - Nonexistent ID returns 404"""
        if not self.superadmin_token:
            pytest.skip("Superadmin auth failed")
        
        # Use a valid but nonexistent ObjectId
        fake_id = "507f1f77bcf86cd799439011"
        response = requests.put(
            f"{BASE_URL}/api/marketplace/payouts/{fake_id}/approve",
            headers=self._headers(self.superadmin_token),
            json={"status": "approved"}
        )
        
        assert response.status_code == 404, f"Expected 404 for nonexistent ID, got {response.status_code}"
        print("✓ Payout approve with nonexistent ID returns 404")


class TestCommissionRatesValidation:
    """Verify commission rates are correct: DK 5%, Koperasi 5%, Vendor 90%"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.superadmin_token = self._get_token(SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    
    def _get_token(self, email, password):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password
        })
        if response.status_code == 200:
            return response.json().get("access_token") or response.json().get("token")
        return None
    
    def _headers(self, token):
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    def test_settings_commission_rates(self):
        """Verify commission rates from settings endpoint"""
        if not self.superadmin_token:
            pytest.skip("Superadmin auth failed")
        
        response = requests.get(
            f"{BASE_URL}/api/marketplace/settings",
            headers=self._headers(self.superadmin_token)
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert data["dana_kecemerlangan_percent"] == 5.0, f"DK should be 5%, got {data['dana_kecemerlangan_percent']}"
        assert data["koperasi_percent"] == 5.0, f"Koperasi should be 5%, got {data['koperasi_percent']}"
        assert data["vendor_percent"] == 90.0, f"Vendor should be 90%, got {data['vendor_percent']}"
        
        # Verify total is 100%
        total = data["dana_kecemerlangan_percent"] + data["koperasi_percent"] + data["vendor_percent"]
        assert total == 100.0, f"Total commission should be 100%, got {total}"
        
        print(f"✓ Commission rates verified: DK={data['dana_kecemerlangan_percent']}%, Koperasi={data['koperasi_percent']}%, Vendor={data['vendor_percent']}%")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
