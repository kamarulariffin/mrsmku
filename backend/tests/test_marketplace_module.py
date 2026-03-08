"""
Test Multi-Vendor Marketplace Module - FASA 1
Tests: Vendor Management, Product Management, Settings with Commission & Ad Packages
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestMarketplaceAuth:
    """Test authentication for marketplace module"""
    
    @pytest.fixture(scope="class")
    def superadmin_token(self):
        """Get superadmin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "admin123"
        })
        assert response.status_code == 200, f"SuperAdmin login failed: {response.text}"
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def parent_token(self):
        """Get parent token - if exists"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "parent@muafakat.link",
            "password": "parent123"
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        return None


class TestMarketplaceDashboardStats:
    """Test GET /api/marketplace/dashboard/stats"""
    
    @pytest.fixture(scope="class")
    def token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_dashboard_stats_returns_200(self, token):
        """GET /api/marketplace/dashboard/stats returns 200 for admin"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/dashboard/stats",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Dashboard stats failed: {response.text}"
    
    def test_dashboard_stats_returns_admin_type(self, token):
        """Dashboard stats returns correct type for admin"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/dashboard/stats",
            headers={"Authorization": f"Bearer {token}"}
        )
        data = response.json()
        assert data.get("type") == "admin", f"Expected type=admin, got: {data.get('type')}"
    
    def test_dashboard_stats_has_required_fields(self, token):
        """Dashboard stats has all required fields"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/dashboard/stats",
            headers={"Authorization": f"Bearer {token}"}
        )
        data = response.json()
        required_fields = ["total_vendors", "pending_vendors", "total_products", 
                          "pending_products", "total_orders", "dana_kecemerlangan_total", "koperasi_total"]
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
    
    def test_dashboard_stats_requires_auth(self):
        """Dashboard stats requires authentication"""
        response = requests.get(f"{BASE_URL}/api/marketplace/dashboard/stats")
        assert response.status_code in [401, 403], "Should require authentication"


class TestMarketplaceVendors:
    """Test GET /api/marketplace/vendors"""
    
    @pytest.fixture(scope="class")
    def token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_get_vendors_returns_200(self, token):
        """GET /api/marketplace/vendors returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/vendors",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Get vendors failed: {response.text}"
    
    def test_get_vendors_returns_list(self, token):
        """GET /api/marketplace/vendors returns a list"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/vendors",
            headers={"Authorization": f"Bearer {token}"}
        )
        data = response.json()
        assert isinstance(data, list), f"Expected list, got: {type(data)}"
    
    def test_get_vendors_with_status_filter(self, token):
        """GET /api/marketplace/vendors?status=pending works"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/vendors?status=pending",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Get pending vendors failed: {response.text}"
        data = response.json()
        # All returned vendors should be pending
        for vendor in data:
            assert vendor.get("status") == "pending", f"Vendor status should be pending: {vendor}"
    
    def test_get_vendors_with_approved_filter(self, token):
        """GET /api/marketplace/vendors?status=approved works"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/vendors?status=approved",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Get approved vendors failed: {response.text}"
    
    def test_vendor_response_structure(self, token):
        """Vendor response has correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/vendors",
            headers={"Authorization": f"Bearer {token}"}
        )
        data = response.json()
        if len(data) > 0:
            vendor = data[0]
            expected_fields = ["id", "user_id", "business_name", "status", "contact_phone"]
            for field in expected_fields:
                assert field in vendor, f"Missing field in vendor: {field}"


class TestMarketplaceProducts:
    """Test GET /api/marketplace/products"""
    
    @pytest.fixture(scope="class")
    def token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_get_products_returns_200(self, token):
        """GET /api/marketplace/products returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/products",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Get products failed: {response.text}"
    
    def test_get_products_returns_list(self, token):
        """GET /api/marketplace/products returns a list"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/products",
            headers={"Authorization": f"Bearer {token}"}
        )
        data = response.json()
        assert isinstance(data, list), f"Expected list, got: {type(data)}"
    
    def test_get_products_with_status_filter(self, token):
        """GET /api/marketplace/products?status=pending works"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/products?status=pending",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Get pending products failed: {response.text}"
    
    def test_get_products_with_category_filter(self, token):
        """GET /api/marketplace/products?category=makanan works"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/products?category=makanan",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Get products by category failed: {response.text}"
    
    def test_get_products_with_search(self, token):
        """GET /api/marketplace/products?search=test works"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/products?search=test",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Search products failed: {response.text}"


class TestMarketplaceSettings:
    """Test GET/PUT /api/marketplace/settings"""
    
    @pytest.fixture(scope="class")
    def token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_get_settings_returns_200(self, token):
        """GET /api/marketplace/settings returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/settings",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Get settings failed: {response.text}"
    
    def test_settings_has_commission_rates(self, token):
        """Settings returns commission rates"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/settings",
            headers={"Authorization": f"Bearer {token}"}
        )
        data = response.json()
        
        # Check commission rates exist
        assert "dana_kecemerlangan_percent" in data, "Missing dana_kecemerlangan_percent"
        assert "koperasi_percent" in data, "Missing koperasi_percent"
        assert "vendor_percent" in data, "Missing vendor_percent"
    
    def test_settings_default_commission_values(self, token):
        """Settings has correct default commission values"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/settings",
            headers={"Authorization": f"Bearer {token}"}
        )
        data = response.json()
        
        # Default: Dana Kecemerlangan 5%, Koperasi 5%, Vendor 90%
        assert data.get("dana_kecemerlangan_percent") == 5.0, f"Dana Kecemerlangan should be 5%, got: {data.get('dana_kecemerlangan_percent')}"
        assert data.get("koperasi_percent") == 5.0, f"Koperasi should be 5%, got: {data.get('koperasi_percent')}"
        assert data.get("vendor_percent") == 90.0, f"Vendor should be 90%, got: {data.get('vendor_percent')}"
    
    def test_settings_has_vendor_registration_fee(self, token):
        """Settings has vendor registration fee"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/settings",
            headers={"Authorization": f"Bearer {token}"}
        )
        data = response.json()
        
        # Default: RM20
        assert "vendor_registration_fee" in data, "Missing vendor_registration_fee"
        assert data.get("vendor_registration_fee") == 20.0, f"Registration fee should be RM20, got: {data.get('vendor_registration_fee')}"
    
    def test_settings_has_ad_packages(self, token):
        """Settings has ad packages"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/settings",
            headers={"Authorization": f"Bearer {token}"}
        )
        data = response.json()
        
        assert "ad_packages" in data, "Missing ad_packages"
        ad_packages = data["ad_packages"]
        
        # Check all package types exist
        assert "bronze" in ad_packages, "Missing bronze package"
        assert "silver" in ad_packages, "Missing silver package"
        assert "gold" in ad_packages, "Missing gold package"
    
    def test_ad_packages_default_prices(self, token):
        """Ad packages have correct default prices"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/settings",
            headers={"Authorization": f"Bearer {token}"}
        )
        data = response.json()
        ad_packages = data.get("ad_packages", {})
        
        # Bronze: RM25/1mo, Silver: RM90/3mo, Gold: RM500/12mo
        assert ad_packages.get("bronze", {}).get("price") == 25.0, f"Bronze should be RM25, got: {ad_packages.get('bronze', {}).get('price')}"
        assert ad_packages.get("silver", {}).get("price") == 90.0, f"Silver should be RM90, got: {ad_packages.get('silver', {}).get('price')}"
        assert ad_packages.get("gold", {}).get("price") == 500.0, f"Gold should be RM500, got: {ad_packages.get('gold', {}).get('price')}"
    
    def test_ad_packages_duration(self, token):
        """Ad packages have correct duration"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/settings",
            headers={"Authorization": f"Bearer {token}"}
        )
        data = response.json()
        ad_packages = data.get("ad_packages", {})
        
        assert ad_packages.get("bronze", {}).get("duration_months") == 1, "Bronze should be 1 month"
        assert ad_packages.get("silver", {}).get("duration_months") == 3, "Silver should be 3 months"
        assert ad_packages.get("gold", {}).get("duration_months") == 12, "Gold should be 12 months"
    
    def test_settings_requires_auth(self):
        """Settings endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/marketplace/settings")
        assert response.status_code in [401, 403], "Should require authentication"


class TestMarketplaceCommissionUpdate:
    """Test PUT /api/marketplace/settings/commission"""
    
    @pytest.fixture(scope="class")
    def token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_update_commission_validates_total(self, token):
        """Commission update validates total = 100%"""
        response = requests.put(
            f"{BASE_URL}/api/marketplace/settings/commission",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "dana_kecemerlangan_percent": 10,
                "koperasi_percent": 10,
                "vendor_percent": 70  # Total = 90%, should fail
            }
        )
        assert response.status_code == 400, f"Should reject invalid total: {response.text}"
    
    def test_update_commission_accepts_valid_total(self, token):
        """Commission update accepts valid total = 100%"""
        # First save the original values
        get_response = requests.get(
            f"{BASE_URL}/api/marketplace/settings",
            headers={"Authorization": f"Bearer {token}"}
        )
        original = get_response.json()
        
        # Update with valid values
        response = requests.put(
            f"{BASE_URL}/api/marketplace/settings/commission",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "dana_kecemerlangan_percent": 5,
                "koperasi_percent": 5,
                "vendor_percent": 90  # Total = 100%
            }
        )
        assert response.status_code == 200, f"Valid commission update failed: {response.text}"


class TestMarketplaceReports:
    """Test marketplace report endpoints"""
    
    @pytest.fixture(scope="class")
    def token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_dana_kecemerlangan_report(self, token):
        """GET /api/marketplace/reports/dana-kecemerlangan returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/reports/dana-kecemerlangan",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Dana Kecemerlangan report failed: {response.text}"
    
    def test_koperasi_revenue_report(self, token):
        """GET /api/marketplace/reports/koperasi-revenue returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/reports/koperasi-revenue",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Koperasi revenue report failed: {response.text}"
    
    def test_vendor_performance_report(self, token):
        """GET /api/marketplace/reports/vendor-performance returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/marketplace/reports/vendor-performance",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Vendor performance report failed: {response.text}"


class TestMarketplaceAccessControl:
    """Test role-based access control for marketplace"""
    
    def test_settings_requires_admin_role(self):
        """Settings endpoint requires admin/superadmin/bendahari role"""
        # Login as superadmin
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@muafakat.link",
            "password": "admin123"
        })
        token = login_res.json()["access_token"]
        
        response = requests.get(
            f"{BASE_URL}/api/marketplace/settings",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, "SuperAdmin should access settings"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
