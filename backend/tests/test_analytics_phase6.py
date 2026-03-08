"""
Phase 6 Comprehensive Reporting - Backend Tests
Tests for analytics endpoints, export functionality, and scheduler
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_CREDENTIALS = {"email": "superadmin@muafakat.link", "password": "admin123"}
VENDOR_CREDENTIALS = {"email": "parent@muafakat.link", "password": "parent123"}


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Admin authentication failed")


@pytest.fixture(scope="module")
def vendor_token():
    """Get vendor authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=VENDOR_CREDENTIALS)
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Vendor authentication failed")


@pytest.fixture(scope="module")
def vendor_id(vendor_token):
    """Get vendor ID for the logged-in vendor"""
    response = requests.get(
        f"{BASE_URL}/api/marketplace/vendors/my-vendor",
        headers={"Authorization": f"Bearer {vendor_token}"}
    )
    if response.status_code == 200:
        data = response.json()
        if data.get("vendor"):
            return data["vendor"]["id"]
    pytest.skip("Could not get vendor profile")


class TestSalesOverviewAnalytics:
    """Test GET /api/marketplace/analytics/sales-overview - Admin sales analytics"""
    
    def test_sales_overview_admin_access(self, admin_token):
        """Admin should be able to access sales overview analytics"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/analytics/sales-overview",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify response structure
        assert "summary" in data, "Response should contain 'summary'"
        assert "monthly_trend" in data, "Response should contain 'monthly_trend'"
        assert "daily_trend" in data, "Response should contain 'daily_trend'"
        assert "top_vendors" in data, "Response should contain 'top_vendors'"
        assert "category_breakdown" in data, "Response should contain 'category_breakdown'"
        assert "order_status_distribution" in data, "Response should contain 'order_status_distribution'"
        
        # Verify summary structure
        summary = data["summary"]
        assert "total_sales" in summary
        assert "total_orders" in summary
        assert "dana_kecemerlangan" in summary
        assert "koperasi" in summary
        assert "vendor_earnings" in summary
        
        print(f"Sales Overview: Total sales = {summary.get('total_sales', 0)}, Orders = {summary.get('total_orders', 0)}")
    
    def test_sales_overview_with_6_months_period(self, admin_token):
        """Test sales overview with 6 months period filter"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/analytics/sales-overview?period=6months",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("period") == "6months"
        print(f"6 months data: {len(data.get('monthly_trend', []))} months of data")
    
    def test_sales_overview_with_12_months_period(self, admin_token):
        """Test sales overview with 12 months period filter"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/analytics/sales-overview?period=12months",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("period") == "12months"
    
    def test_sales_overview_with_all_period(self, admin_token):
        """Test sales overview with 'all' period filter"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/analytics/sales-overview?period=all",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("period") == "all"
    
    def test_sales_overview_vendor_access_denied(self, vendor_token):
        """Non-admin (vendor) should be denied access to sales overview"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/analytics/sales-overview",
            headers={"Authorization": f"Bearer {vendor_token}"}
        )
        # Vendor parent role should be denied
        assert response.status_code == 403, f"Expected 403 for vendor, got {response.status_code}"
    
    def test_sales_overview_no_auth(self):
        """Unauthenticated request should be denied"""
        response = requests.get(f"{BASE_URL}/api/marketplace/analytics/sales-overview")
        assert response.status_code == 401


class TestVendorSpecificAnalytics:
    """Test GET /api/marketplace/analytics/vendor/{vendor_id} - Vendor-specific analytics"""
    
    def test_vendor_analytics_by_admin(self, admin_token, vendor_id):
        """Admin should be able to access any vendor's analytics"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/analytics/vendor/{vendor_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify response structure
        assert "vendor" in data, "Response should contain 'vendor'"
        assert "monthly_trend" in data, "Response should contain 'monthly_trend'"
        assert "earnings_trend" in data, "Response should contain 'earnings_trend'"
        assert "top_products" in data, "Response should contain 'top_products'"
        assert "category_breakdown" in data, "Response should contain 'category_breakdown'"
        assert "order_status" in data, "Response should contain 'order_status'"
        assert "wallet" in data, "Response should contain 'wallet'"
        
        # Verify vendor data
        vendor = data["vendor"]
        assert "id" in vendor
        assert "business_name" in vendor
        assert "tier" in vendor
        assert "total_sales" in vendor
        assert "total_products" in vendor
        
        print(f"Vendor: {vendor.get('business_name')}, Sales: {vendor.get('total_sales', 0)}")
    
    def test_vendor_analytics_by_owner(self, vendor_token, vendor_id):
        """Vendor should be able to access their own analytics"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/analytics/vendor/{vendor_id}",
            headers={"Authorization": f"Bearer {vendor_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "vendor" in data
        assert "wallet" in data
    
    def test_vendor_analytics_invalid_vendor_id(self, admin_token):
        """Test with invalid vendor ID should return 404"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/analytics/vendor/000000000000000000000000",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 404


class TestMyVendorAnalytics:
    """Test GET /api/marketplace/analytics/my-analytics - Vendor's own analytics"""
    
    def test_my_analytics_as_vendor(self, vendor_token):
        """Vendor should be able to access their own analytics via my-analytics endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/analytics/my-analytics",
            headers={"Authorization": f"Bearer {vendor_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Should have same structure as vendor-specific analytics
        assert "vendor" in data
        assert "monthly_trend" in data
        assert "wallet" in data
        
        wallet = data.get("wallet", {})
        print(f"Wallet: Available balance = {wallet.get('available_balance', 0)}")
    
    def test_my_analytics_with_period(self, vendor_token):
        """Test my-analytics with different periods"""
        for period in ["6months", "12months", "all"]:
            response = requests.get(
                f"{BASE_URL}/api/marketplace/analytics/my-analytics?period={period}",
                headers={"Authorization": f"Bearer {vendor_token}"}
            )
            assert response.status_code == 200, f"Period {period} failed: {response.text}"
    
    def test_my_analytics_non_vendor(self, admin_token):
        """Non-vendor (admin) should get 403 when accessing my-analytics"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/analytics/my-analytics",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        # Admin is not a vendor, should get 403
        assert response.status_code == 403


class TestExportSalesData:
    """Test GET /api/marketplace/analytics/export/sales - Export sales data as CSV"""
    
    def test_export_sales_json_format(self, admin_token):
        """Admin should be able to export sales data in JSON format"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/analytics/export/sales?format=json",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "format" in data
        assert data["format"] == "json"
        assert "data" in data
        assert "record_count" in data
        
        print(f"Export JSON: {data.get('record_count', 0)} records")
    
    def test_export_sales_csv_format(self, admin_token):
        """Admin should be able to export sales data in CSV format"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/analytics/export/sales?format=csv",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "format" in data
        assert data["format"] == "csv"
        assert "filename" in data
        assert "content" in data
        assert "record_count" in data
        assert ".csv" in data["filename"]
        
        print(f"Export CSV: {data.get('record_count', 0)} records, filename: {data.get('filename')}")
    
    def test_export_sales_with_date_filters(self, admin_token):
        """Test export sales with date filters"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/analytics/export/sales?format=json&start_date=2024-01-01&end_date=2025-12-31",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "record_count" in data
    
    def test_export_sales_vendor_denied(self, vendor_token):
        """Vendor should be denied access to sales export"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/analytics/export/sales",
            headers={"Authorization": f"Bearer {vendor_token}"}
        )
        assert response.status_code == 403


class TestExportLedgerData:
    """Test GET /api/marketplace/analytics/export/ledger - Export ledger data as CSV"""
    
    def test_export_ledger_json_format(self, admin_token):
        """Admin should be able to export ledger data in JSON format"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/analytics/export/ledger?format=json",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "format" in data
        assert data["format"] == "json"
        assert "data" in data
        assert "record_count" in data
        
        print(f"Ledger JSON: {data.get('record_count', 0)} entries")
    
    def test_export_ledger_csv_format(self, admin_token):
        """Admin should be able to export ledger data in CSV format"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/analytics/export/ledger?format=csv",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "format" in data
        assert data["format"] == "csv"
        assert "filename" in data
        assert "content" in data
        assert ".csv" in data["filename"]
        
        print(f"Ledger CSV: {data.get('record_count', 0)} entries")
    
    def test_export_ledger_with_type_filter(self, admin_token):
        """Test export ledger with ledger_type filter"""
        # Test with various ledger types
        for ledger_type in ["vendor_earning", "dana_kecemerlangan", "koperasi"]:
            response = requests.get(
                f"{BASE_URL}/api/marketplace/analytics/export/ledger?format=json&ledger_type={ledger_type}",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            assert response.status_code == 200, f"Ledger type {ledger_type} failed"
    
    def test_export_ledger_vendor_denied(self, vendor_token):
        """Vendor should be denied access to ledger export"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/analytics/export/ledger",
            headers={"Authorization": f"Bearer {vendor_token}"}
        )
        assert response.status_code == 403


class TestSchedulerExpireFeatures:
    """Test POST /api/marketplace/scheduler/expire-features - Monetization scheduler"""
    
    def test_scheduler_admin_access(self, admin_token):
        """Admin should be able to run the expiration scheduler"""
        response = requests.post(
            f"{BASE_URL}/api/marketplace/scheduler/expire-features",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data
        assert "expired" in data
        assert "run_at" in data
        
        expired = data.get("expired", {})
        assert "ads" in expired
        assert "boosts" in expired
        assert "subscriptions" in expired
        
        print(f"Scheduler ran: Expired - Ads: {expired.get('ads', 0)}, Boosts: {expired.get('boosts', 0)}, Subscriptions: {expired.get('subscriptions', 0)}")
    
    def test_scheduler_vendor_denied(self, vendor_token):
        """Vendor should be denied access to run scheduler"""
        response = requests.post(
            f"{BASE_URL}/api/marketplace/scheduler/expire-features",
            headers={"Authorization": f"Bearer {vendor_token}"}
        )
        assert response.status_code == 403
    
    def test_scheduler_no_auth_denied(self):
        """Unauthenticated request should be denied"""
        response = requests.post(f"{BASE_URL}/api/marketplace/scheduler/expire-features")
        assert response.status_code == 401 or response.status_code == 403
    
    def test_scheduler_with_cron_key(self):
        """Test scheduler with valid CRON_SECRET_KEY"""
        cron_key = os.environ.get("CRON_SECRET_KEY", "mrsmku-cron-2026")
        response = requests.post(
            f"{BASE_URL}/api/marketplace/scheduler/expire-features?cron_key={cron_key}"
        )
        # Should succeed with valid cron key
        assert response.status_code == 200, f"Expected 200 with cron key, got {response.status_code}: {response.text}"
    
    def test_scheduler_with_invalid_cron_key(self):
        """Test scheduler with invalid CRON_SECRET_KEY should be denied"""
        response = requests.post(
            f"{BASE_URL}/api/marketplace/scheduler/expire-features?cron_key=invalid-key"
        )
        assert response.status_code == 403


class TestDataIntegrity:
    """Test data integrity and consistency in analytics"""
    
    def test_sales_overview_data_consistency(self, admin_token):
        """Verify sales overview data is consistent"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/analytics/sales-overview",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        summary = data.get("summary", {})
        
        # Total sales should equal sum of commission components (roughly)
        total = summary.get("total_sales", 0)
        dk = summary.get("dana_kecemerlangan", 0)
        kop = summary.get("koperasi", 0)
        vendor = summary.get("vendor_earnings", 0)
        
        if total > 0:
            commission_sum = dk + kop + vendor
            # Allow small rounding differences
            assert abs(total - commission_sum) < total * 0.01, f"Commission split inconsistent: {total} vs {commission_sum}"
            print(f"Data integrity check: Total={total}, DK+Kop+Vendor={commission_sum}")
    
    def test_vendor_analytics_wallet_consistency(self, vendor_token):
        """Verify vendor wallet data is consistent"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/analytics/my-analytics",
            headers={"Authorization": f"Bearer {vendor_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        wallet = data.get("wallet", {})
        
        # Available + pending + withdrawn should equal total earnings (roughly)
        total = wallet.get("total_earnings", 0)
        available = wallet.get("available_balance", 0)
        pending = wallet.get("pending_amount", 0)
        withdrawn = wallet.get("total_withdrawn", 0)
        
        if total > 0:
            calculated = available + pending + withdrawn
            # Allow small rounding differences
            assert abs(total - calculated) < total * 0.05, f"Wallet inconsistent: {total} vs {calculated}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
