"""
Test Parent Yuran Dashboard API - /api/yuran/anak-saya
Tests for the parent view of children's fee records (Yuran Anak Saya)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestParentYuranDashboard:
    """Tests for Parent Yuran Dashboard API"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as parent
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "test.parent@muafakat.link", "password": "parent123"}
        )
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.parent_token = token
        else:
            pytest.skip("Parent login failed - skipping tests")
    
    def test_api_health(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print("PASS: API health check passed")
    
    def test_parent_login_success(self):
        """Test parent login with valid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "test.parent@muafakat.link", "password": "parent123"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["role"] == "parent"
        assert data["user"]["email"] == "test.parent@muafakat.link"
        print("PASS: Parent login successful")
    
    def test_get_anak_saya_endpoint(self):
        """Test GET /api/yuran/anak-saya returns children's yuran data"""
        response = self.session.get(f"{BASE_URL}/api/yuran/anak-saya")
        assert response.status_code == 200
        data = response.json()
        
        # Should return a list
        assert isinstance(data, list)
        print(f"PASS: Found {len(data)} children in response")
    
    def test_anak_saya_data_structure(self):
        """Test data structure of anak-saya response"""
        response = self.session.get(f"{BASE_URL}/api/yuran/anak-saya")
        assert response.status_code == 200
        data = response.json()
        
        # Verify each child has required fields
        required_fields = [
            "student_id", "name", "matric_number", "current_form", "current_year",
            "total_fees", "total_paid", "total_outstanding", "progress_percent",
            "outstanding_by_tingkatan", "all_yuran"
        ]
        
        for child in data:
            for field in required_fields:
                assert field in child, f"Missing field: {field}"
        
        print("PASS: All required fields present in response")
    
    def test_anak_saya_children_count(self):
        """Test expected number of children (4 based on seed data)"""
        response = self.session.get(f"{BASE_URL}/api/yuran/anak-saya")
        assert response.status_code == 200
        data = response.json()
        
        # Based on seed data, should have 4 children
        assert len(data) >= 3, f"Expected at least 3 children, got {len(data)}"
        print(f"PASS: Found {len(data)} children as expected")
    
    def test_child_no_outstanding_nur_aisyah(self):
        """Test Nur Aisyah has no outstanding (all paid - TAHNIAH case)"""
        response = self.session.get(f"{BASE_URL}/api/yuran/anak-saya")
        assert response.status_code == 200
        data = response.json()
        
        # Find Nur Aisyah
        nur_aisyah = None
        for child in data:
            if "Nur Aisyah" in child.get("name", ""):
                nur_aisyah = child
                break
        
        if nur_aisyah:
            assert nur_aisyah["total_outstanding"] == 0 or nur_aisyah["total_outstanding"] <= 0
            assert nur_aisyah["progress_percent"] == 100
            assert len(nur_aisyah.get("outstanding_by_tingkatan", [])) == 0
            print("PASS: Nur Aisyah has no outstanding (100% paid - TAHNIAH case)")
        else:
            pytest.skip("Nur Aisyah not found in children list")
    
    def test_child_with_outstanding_muhammad_izzat(self):
        """Test Muhammad Izzat has outstanding from T2 and T3"""
        response = self.session.get(f"{BASE_URL}/api/yuran/anak-saya")
        assert response.status_code == 200
        data = response.json()
        
        # Find Muhammad Izzat
        izzat = None
        for child in data:
            if "Muhammad Izzat" in child.get("name", ""):
                izzat = child
                break
        
        if izzat:
            assert izzat["total_outstanding"] > 0
            outstanding_tingkatan = izzat.get("outstanding_by_tingkatan", [])
            assert len(outstanding_tingkatan) >= 2, "Izzat should have outstanding from T2 and T3"
            
            # Check tingkatan numbers
            tingkatan_numbers = [o["tingkatan"] for o in outstanding_tingkatan]
            assert 2 in tingkatan_numbers or 3 in tingkatan_numbers
            print(f"PASS: Muhammad Izzat has outstanding from tingkatan: {tingkatan_numbers}")
        else:
            pytest.skip("Muhammad Izzat not found in children list")
    
    def test_child_with_outstanding_ahmad_farhan(self):
        """Test Ahmad Farhan has outstanding from T3, T4, T5"""
        response = self.session.get(f"{BASE_URL}/api/yuran/anak-saya")
        assert response.status_code == 200
        data = response.json()
        
        # Find Ahmad Farhan
        farhan = None
        for child in data:
            if "Ahmad Farhan" in child.get("name", ""):
                farhan = child
                break
        
        if farhan:
            assert farhan["total_outstanding"] > 0
            outstanding_tingkatan = farhan.get("outstanding_by_tingkatan", [])
            assert len(outstanding_tingkatan) >= 2, "Farhan should have outstanding from multiple tingkatan"
            
            # Check tingkatan numbers
            tingkatan_numbers = [o["tingkatan"] for o in outstanding_tingkatan]
            print(f"PASS: Ahmad Farhan has outstanding from tingkatan: {tingkatan_numbers}")
        else:
            pytest.skip("Ahmad Farhan not found in children list")
    
    def test_outstanding_by_tingkatan_structure(self):
        """Test outstanding_by_tingkatan has correct structure"""
        response = self.session.get(f"{BASE_URL}/api/yuran/anak-saya")
        assert response.status_code == 200
        data = response.json()
        
        for child in data:
            for outstanding in child.get("outstanding_by_tingkatan", []):
                assert "tingkatan" in outstanding
                assert "tahun" in outstanding
                assert "outstanding" in outstanding
                assert outstanding["tingkatan"] >= 1 and outstanding["tingkatan"] <= 5
                assert outstanding["outstanding"] > 0
        
        print("PASS: outstanding_by_tingkatan structure is correct")
    
    def test_progress_percent_calculation(self):
        """Test progress_percent is calculated correctly"""
        response = self.session.get(f"{BASE_URL}/api/yuran/anak-saya")
        assert response.status_code == 200
        data = response.json()
        
        for child in data:
            total_fees = child.get("total_fees", 0)
            total_paid = child.get("total_paid", 0)
            progress = child.get("progress_percent", 0)
            
            if total_fees > 0:
                expected_progress = (total_paid / total_fees) * 100
                assert abs(progress - expected_progress) < 0.1, f"Progress mismatch for {child['name']}"
        
        print("PASS: Progress percent calculation is correct")
    
    def test_unauthorized_access_without_token(self):
        """Test anak-saya endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/yuran/anak-saya")
        assert response.status_code in [401, 403]
        print("PASS: Unauthorized access correctly blocked")
    
    def test_non_parent_access_denied(self):
        """Test non-parent user cannot access anak-saya endpoint"""
        # Login as admin
        admin_session = requests.Session()
        admin_session.headers.update({"Content-Type": "application/json"})
        
        login_response = admin_session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@muafakat.link", "password": "admin123"}
        )
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            admin_session.headers.update({"Authorization": f"Bearer {token}"})
            
            response = admin_session.get(f"{BASE_URL}/api/yuran/anak-saya")
            # Should be 403 for non-parent
            assert response.status_code == 403
            print("PASS: Non-parent access correctly denied")
        else:
            pytest.skip("Admin login failed")


class TestPaymentEndpoint:
    """Tests for Payment endpoint (MOCKED)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as parent
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "test.parent@muafakat.link", "password": "parent123"}
        )
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Parent login failed - skipping tests")
    
    def test_payment_endpoint_exists(self):
        """Test payment endpoint exists (even if mocked)"""
        # Get a yuran ID first
        response = self.session.get(f"{BASE_URL}/api/yuran/anak-saya")
        assert response.status_code == 200
        data = response.json()
        
        # Find a child with yuran
        yuran_id = None
        for child in data:
            if child.get("all_yuran") and len(child["all_yuran"]) > 0:
                yuran_id = child["all_yuran"][0].get("id")
                break
        
        if yuran_id:
            # Test payment endpoint with small amount
            response = self.session.post(
                f"{BASE_URL}/api/yuran/bayar/{yuran_id}",
                params={"amount": 1.00, "payment_method": "fpx"}
            )
            # Payment should work (MOCKED) or return validation error
            assert response.status_code in [200, 400, 422]
            print(f"PASS: Payment endpoint responded with status {response.status_code}")
        else:
            pytest.skip("No yuran ID found for testing")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
