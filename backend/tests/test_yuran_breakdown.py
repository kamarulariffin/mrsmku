"""
Test suite for Financial Dashboard - Yuran Fee Breakdown Endpoints
Tests:
- GET /api/financial-dashboard/yuran-breakdown
- GET /api/financial-dashboard/tunggakan-summary
- Tab navigation functionality for Financial Dashboard
"""

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SUPERADMIN_CREDS = {"email": "superadmin@muafakat.link", "password": "admin123"}
BENDAHARI_CREDS = {"email": "bendahari@muafakat.link", "password": "bendahari123"}


class TestYuranBreakdownEndpoint:
    """Test the yuran-breakdown endpoint for fee category and payment method breakdown"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
    def get_auth_token(self, credentials):
        """Helper to get auth token"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json=credentials)
        if response.status_code == 200:
            return response.json().get("access_token")
        return None
    
    def test_yuran_breakdown_requires_auth(self):
        """Test that yuran-breakdown endpoint requires authentication"""
        response = self.session.get(f"{BASE_URL}/api/financial-dashboard/yuran-breakdown")
        assert response.status_code in [401, 403], f"Expected 401/403 but got {response.status_code}"
        print("PASS: yuran-breakdown requires authentication")
    
    def test_yuran_breakdown_superadmin_access(self):
        """Test superadmin can access yuran-breakdown"""
        token = self.get_auth_token(SUPERADMIN_CREDS)
        assert token, "Failed to get superadmin token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        response = self.session.get(f"{BASE_URL}/api/financial-dashboard/yuran-breakdown")
        
        assert response.status_code == 200, f"Expected 200 but got {response.status_code}: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "tahun" in data, "Response should contain 'tahun'"
        assert "summary" in data, "Response should contain 'summary'"
        assert "category_breakdown" in data, "Response should contain 'category_breakdown'"
        assert "payment_method_breakdown" in data, "Response should contain 'payment_method_breakdown'"
        assert "outstanding_by_tingkatan" in data, "Response should contain 'outstanding_by_tingkatan'"
        
        print(f"PASS: superadmin can access yuran-breakdown, year: {data.get('tahun')}")
    
    def test_yuran_breakdown_bendahari_access(self):
        """Test bendahari can access yuran-breakdown"""
        token = self.get_auth_token(BENDAHARI_CREDS)
        assert token, "Failed to get bendahari token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        response = self.session.get(f"{BASE_URL}/api/financial-dashboard/yuran-breakdown")
        
        assert response.status_code == 200, f"Expected 200 but got {response.status_code}"
        print("PASS: bendahari can access yuran-breakdown")
    
    def test_yuran_breakdown_summary_structure(self):
        """Test yuran-breakdown summary has correct structure"""
        token = self.get_auth_token(SUPERADMIN_CREDS)
        assert token, "Failed to get token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        response = self.session.get(f"{BASE_URL}/api/financial-dashboard/yuran-breakdown")
        
        assert response.status_code == 200
        data = response.json()
        
        summary = data.get("summary", {})
        
        # Validate summary structure
        required_fields = [
            "total_students",
            "total_expected", 
            "total_collected",
            "total_outstanding",
            "collection_rate",
            "students_fully_paid",
            "students_with_outstanding"
        ]
        
        for field in required_fields:
            assert field in summary, f"Summary should contain '{field}'"
        
        # Validate types
        assert isinstance(summary.get("total_students"), int), "total_students should be int"
        assert isinstance(summary.get("total_expected"), (int, float)), "total_expected should be numeric"
        assert isinstance(summary.get("collection_rate"), (int, float)), "collection_rate should be numeric"
        
        print(f"PASS: Summary structure valid - {summary.get('total_students')} students, {summary.get('collection_rate')}% collected")
    
    def test_yuran_breakdown_category_structure(self):
        """Test category_breakdown has correct structure"""
        token = self.get_auth_token(SUPERADMIN_CREDS)
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        response = self.session.get(f"{BASE_URL}/api/financial-dashboard/yuran-breakdown")
        assert response.status_code == 200
        
        data = response.json()
        categories = data.get("category_breakdown", [])
        
        assert isinstance(categories, list), "category_breakdown should be a list"
        
        # If there are categories, validate structure
        if len(categories) > 0:
            cat = categories[0]
            required_fields = ["name", "total_expected", "total_collected", "outstanding", "collection_rate"]
            for field in required_fields:
                assert field in cat, f"Category should have '{field}'"
            print(f"PASS: Category breakdown structure valid - {len(categories)} categories found")
        else:
            print("PASS: Category breakdown empty (no data in test environment)")
    
    def test_yuran_breakdown_payment_method_structure(self):
        """Test payment_method_breakdown has correct structure"""
        token = self.get_auth_token(SUPERADMIN_CREDS)
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        response = self.session.get(f"{BASE_URL}/api/financial-dashboard/yuran-breakdown")
        assert response.status_code == 200
        
        data = response.json()
        payment_methods = data.get("payment_method_breakdown", {})
        
        # Validate required payment methods exist
        assert "bayar_penuh" in payment_methods, "Should have 'bayar_penuh' payment method"
        assert "ansuran" in payment_methods, "Should have 'ansuran' payment method"
        assert "separa" in payment_methods, "Should have 'separa' payment method"
        
        # Validate bayar_penuh structure
        bayar_penuh = payment_methods.get("bayar_penuh", {})
        assert "label" in bayar_penuh, "bayar_penuh should have 'label'"
        assert "count" in bayar_penuh, "bayar_penuh should have 'count'"
        assert "total_collected" in bayar_penuh, "bayar_penuh should have 'total_collected'"
        assert "unique_students" in bayar_penuh, "bayar_penuh should have 'unique_students'"
        
        print(f"PASS: Payment method breakdown structure valid - bayar_penuh: {bayar_penuh.get('unique_students')} students")
    
    def test_yuran_breakdown_tingkatan_structure(self):
        """Test outstanding_by_tingkatan has correct structure"""
        token = self.get_auth_token(SUPERADMIN_CREDS)
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        response = self.session.get(f"{BASE_URL}/api/financial-dashboard/yuran-breakdown")
        assert response.status_code == 200
        
        data = response.json()
        tingkatan_list = data.get("outstanding_by_tingkatan", [])
        
        assert isinstance(tingkatan_list, list), "outstanding_by_tingkatan should be a list"
        
        if len(tingkatan_list) > 0:
            ting = tingkatan_list[0]
            required_fields = [
                "tingkatan", "total_expected", "total_collected", 
                "outstanding", "student_count", "students_with_outstanding"
            ]
            for field in required_fields:
                assert field in ting, f"Tingkatan entry should have '{field}'"
            print(f"PASS: Tingkatan breakdown structure valid - {len(tingkatan_list)} tingkatan levels")
        else:
            print("PASS: Tingkatan breakdown empty (no data in test environment)")
    
    def test_yuran_breakdown_with_year_param(self):
        """Test yuran-breakdown with specific year parameter"""
        token = self.get_auth_token(SUPERADMIN_CREDS)
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        current_year = datetime.now().year
        
        # Test with current year
        response = self.session.get(f"{BASE_URL}/api/financial-dashboard/yuran-breakdown?tahun={current_year}")
        assert response.status_code == 200
        data = response.json()
        assert data.get("tahun") == current_year, f"Expected tahun={current_year}"
        
        # Test with previous year
        prev_year = current_year - 1
        response = self.session.get(f"{BASE_URL}/api/financial-dashboard/yuran-breakdown?tahun={prev_year}")
        assert response.status_code == 200
        data = response.json()
        assert data.get("tahun") == prev_year, f"Expected tahun={prev_year}"
        
        print(f"PASS: Year parameter works - tested {current_year} and {prev_year}")


class TestTunggakanSummaryEndpoint:
    """Test the tunggakan-summary endpoint for outstanding fees summary"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
    def get_auth_token(self, credentials):
        """Helper to get auth token"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json=credentials)
        if response.status_code == 200:
            return response.json().get("access_token")
        return None
    
    def test_tunggakan_summary_requires_auth(self):
        """Test that tunggakan-summary requires authentication"""
        response = self.session.get(f"{BASE_URL}/api/financial-dashboard/tunggakan-summary")
        assert response.status_code in [401, 403], f"Expected 401/403 but got {response.status_code}"
        print("PASS: tunggakan-summary requires authentication")
    
    def test_tunggakan_summary_superadmin_access(self):
        """Test superadmin can access tunggakan-summary"""
        token = self.get_auth_token(SUPERADMIN_CREDS)
        assert token, "Failed to get superadmin token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        response = self.session.get(f"{BASE_URL}/api/financial-dashboard/tunggakan-summary")
        
        assert response.status_code == 200, f"Expected 200 but got {response.status_code}"
        data = response.json()
        
        # Validate response structure
        required_fields = [
            "tahun",
            "total_students_with_outstanding",
            "total_outstanding_amount",
            "top_10_outstanding",
            "by_tingkatan"
        ]
        
        for field in required_fields:
            assert field in data, f"Response should contain '{field}'"
        
        print(f"PASS: superadmin can access tunggakan-summary, {data.get('total_students_with_outstanding')} students with outstanding")
    
    def test_tunggakan_summary_bendahari_access(self):
        """Test bendahari can access tunggakan-summary"""
        token = self.get_auth_token(BENDAHARI_CREDS)
        assert token, "Failed to get bendahari token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        response = self.session.get(f"{BASE_URL}/api/financial-dashboard/tunggakan-summary")
        
        assert response.status_code == 200, f"Expected 200 but got {response.status_code}"
        print("PASS: bendahari can access tunggakan-summary")
    
    def test_tunggakan_summary_top10_structure(self):
        """Test top_10_outstanding has correct structure"""
        token = self.get_auth_token(SUPERADMIN_CREDS)
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        response = self.session.get(f"{BASE_URL}/api/financial-dashboard/tunggakan-summary")
        assert response.status_code == 200
        
        data = response.json()
        top_10 = data.get("top_10_outstanding", [])
        
        assert isinstance(top_10, list), "top_10_outstanding should be a list"
        assert len(top_10) <= 10, "Should have at most 10 entries"
        
        if len(top_10) > 0:
            student = top_10[0]
            required_fields = ["student_name", "tingkatan", "total_amount", "paid_amount", "outstanding"]
            for field in required_fields:
                assert field in student, f"Top outstanding entry should have '{field}'"
            print(f"PASS: Top 10 outstanding structure valid - {len(top_10)} entries")
        else:
            print("PASS: Top 10 outstanding empty (no outstanding fees in test data)")
    
    def test_tunggakan_summary_by_tingkatan_structure(self):
        """Test by_tingkatan has correct structure"""
        token = self.get_auth_token(SUPERADMIN_CREDS)
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        response = self.session.get(f"{BASE_URL}/api/financial-dashboard/tunggakan-summary")
        assert response.status_code == 200
        
        data = response.json()
        by_tingkatan = data.get("by_tingkatan", [])
        
        assert isinstance(by_tingkatan, list), "by_tingkatan should be a list"
        
        if len(by_tingkatan) > 0:
            ting = by_tingkatan[0]
            assert "tingkatan" in ting, "Should have 'tingkatan'"
            assert "count" in ting, "Should have 'count'"
            assert "total_outstanding" in ting, "Should have 'total_outstanding'"
            print(f"PASS: by_tingkatan structure valid - {len(by_tingkatan)} tingkatan levels")
        else:
            print("PASS: by_tingkatan empty (no outstanding by tingkatan in test data)")
    
    def test_tunggakan_summary_with_year_param(self):
        """Test tunggakan-summary with specific year parameter"""
        token = self.get_auth_token(SUPERADMIN_CREDS)
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        current_year = datetime.now().year
        
        response = self.session.get(f"{BASE_URL}/api/financial-dashboard/tunggakan-summary?tahun={current_year}")
        assert response.status_code == 200
        data = response.json()
        assert data.get("tahun") == current_year
        
        print(f"PASS: Year parameter works for tunggakan-summary - tahun={current_year}")


class TestExistingFinancialDashboardEndpoints:
    """Test that existing financial dashboard endpoints still work with new features"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
    def get_auth_token(self, credentials):
        """Helper to get auth token"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json=credentials)
        if response.status_code == 200:
            return response.json().get("access_token")
        return None
    
    def test_summary_endpoint_still_works(self):
        """Test that existing /summary endpoint still works"""
        token = self.get_auth_token(SUPERADMIN_CREDS)
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        response = self.session.get(f"{BASE_URL}/api/financial-dashboard/summary")
        assert response.status_code == 200
        
        data = response.json()
        assert "tabung" in data
        assert "accounting" in data
        assert "combined" in data
        
        print("PASS: /summary endpoint still works")
    
    def test_donation_trends_still_works(self):
        """Test that existing /donation-trends endpoint still works"""
        token = self.get_auth_token(SUPERADMIN_CREDS)
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        response = self.session.get(f"{BASE_URL}/api/financial-dashboard/donation-trends")
        assert response.status_code == 200
        
        data = response.json()
        assert "trends" in data
        
        print("PASS: /donation-trends endpoint still works")
    
    def test_campaign_performance_still_works(self):
        """Test that existing /campaign-performance endpoint still works"""
        token = self.get_auth_token(SUPERADMIN_CREDS)
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        response = self.session.get(f"{BASE_URL}/api/financial-dashboard/campaign-performance")
        assert response.status_code == 200
        
        data = response.json()
        assert "campaigns" in data
        
        print("PASS: /campaign-performance endpoint still works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
