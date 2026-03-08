"""
Test Suite for Yuran (Fees) Module - MRSMKU Portal
Tests: Set Yuran CRUD, Statistics, Student Yuran List
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://yuran-admin-panel.preview.emergentagent.com').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@muafakat.link"
ADMIN_PASSWORD = "admin123"
PARENT_EMAIL = "parent@muafakat.link"
PARENT_PASSWORD = "parent123"


class TestYuranSetYuranAPI:
    """Test Set Yuran CRUD endpoints - Admin/Bendahari access"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup admin session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_resp.status_code == 200, f"Admin login failed: {login_resp.text}"
        token = login_resp.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        self.admin_token = token
    
    def test_get_set_yuran_list_no_filter(self):
        """GET /api/yuran/set-yuran - Get all set yuran without filter"""
        response = self.session.get(f"{BASE_URL}/api/yuran/set-yuran")
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Should return a list
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Retrieved {len(data)} Set Yuran records")
    
    def test_get_set_yuran_list_filter_by_tahun(self):
        """GET /api/yuran/set-yuran?tahun=2026 - Filter by year"""
        response = self.session.get(f"{BASE_URL}/api/yuran/set-yuran?tahun=2026")
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        
        # All items should have tahun=2026
        for item in data:
            assert item.get("tahun") == 2026, f"Item should have tahun=2026, got {item.get('tahun')}"
        
        print(f"✓ Retrieved {len(data)} Set Yuran for tahun 2026")
    
    def test_get_set_yuran_structure(self):
        """Verify Set Yuran response structure"""
        response = self.session.get(f"{BASE_URL}/api/yuran/set-yuran?tahun=2026")
        
        assert response.status_code == 200
        data = response.json()
        
        if len(data) > 0:
            set_yuran = data[0]
            # Verify required fields
            required_fields = ["id", "tahun", "tingkatan", "nama", "categories", "total_amount", "is_active"]
            for field in required_fields:
                assert field in set_yuran, f"Missing required field: {field}"
            
            # Verify tingkatan range
            assert 1 <= set_yuran["tingkatan"] <= 5, "Tingkatan should be 1-5"
            
            # Verify categories structure
            assert isinstance(set_yuran["categories"], list), "categories should be a list"
            
            print(f"✓ Set Yuran structure verified - {set_yuran['nama']}")
        else:
            print("✓ No Set Yuran data (empty list)")
    
    def test_create_set_yuran_success(self):
        """POST /api/yuran/set-yuran - Create new Set Yuran"""
        # First check if it already exists
        existing = self.session.get(f"{BASE_URL}/api/yuran/set-yuran?tahun=2027&tingkatan=1")
        existing_data = existing.json()
        
        # Skip if already exists for tingkatan 1, 2027
        ting1_2027_exists = any(s.get("tingkatan") == 1 and s.get("tahun") == 2027 for s in existing_data)
        
        if ting1_2027_exists:
            print("✓ Test skipped - Set Yuran for Tingkatan 1 2027 already exists")
            return
        
        create_payload = {
            "tahun": 2027,
            "tingkatan": 1,
            "nama": "TEST_Set Yuran Tingkatan 1 2027",
            "categories": [
                {
                    "name": "MUAFAKAT",
                    "sub_categories": [
                        {
                            "name": "Yuran Tetap",
                            "items": [
                                {"code": "M01", "name": "Yuran Tahunan", "amount": 100.00, "mandatory": True}
                            ]
                        }
                    ]
                }
            ],
            "is_active": True
        }
        
        response = self.session.post(f"{BASE_URL}/api/yuran/set-yuran", json=create_payload)
        
        assert response.status_code == 200, f"Failed to create: {response.text}"
        data = response.json()
        
        assert data.get("nama") == "TEST_Set Yuran Tingkatan 1 2027"
        assert data.get("tahun") == 2027
        assert data.get("tingkatan") == 1
        assert data.get("total_amount") == 100.00
        
        # Store ID for cleanup
        self.created_set_id = data.get("id")
        print(f"✓ Created Set Yuran: {data['nama']} (ID: {data['id']})")
        
        # Cleanup - delete created test data
        if self.created_set_id:
            del_resp = self.session.delete(f"{BASE_URL}/api/yuran/set-yuran/{self.created_set_id}")
            if del_resp.status_code in [200, 204]:
                print(f"✓ Cleaned up test Set Yuran")
    
    def test_create_duplicate_set_yuran_fails(self):
        """POST /api/yuran/set-yuran - Should fail for duplicate tahun+tingkatan"""
        # Get existing set yuran for 2026
        existing = self.session.get(f"{BASE_URL}/api/yuran/set-yuran?tahun=2026")
        existing_data = existing.json()
        
        if len(existing_data) > 0:
            first_set = existing_data[0]
            
            # Try to create duplicate
            create_payload = {
                "tahun": first_set["tahun"],
                "tingkatan": first_set["tingkatan"],
                "nama": "TEST_Duplicate Set",
                "categories": [
                    {
                        "name": "TEST",
                        "sub_categories": [
                            {"name": "Test", "items": [{"code": "T01", "name": "Test", "amount": 10.00, "mandatory": True}]}
                        ]
                    }
                ]
            }
            
            response = self.session.post(f"{BASE_URL}/api/yuran/set-yuran", json=create_payload)
            
            # Should fail with 400 (already exists)
            assert response.status_code == 400, f"Expected 400 for duplicate, got {response.status_code}"
            print(f"✓ Duplicate creation correctly rejected")
        else:
            print("✓ Skipped - no existing data to test duplicate")


class TestYuranStatisticsAPI:
    """Test Statistics endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup admin session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_resp.status_code == 200
        token = login_resp.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_get_statistics_for_year(self):
        """GET /api/yuran/statistik?tahun=2026 - Get yuran statistics"""
        response = self.session.get(f"{BASE_URL}/api/yuran/statistik?tahun=2026")
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify required fields
        required_fields = [
            "tahun", "total_expected", "total_collected", "total_outstanding",
            "collection_rate", "total_students", "paid_students", "partial_students",
            "pending_students", "set_yuran_count"
        ]
        
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
        
        assert data["tahun"] == 2026
        assert isinstance(data["total_expected"], (int, float))
        assert isinstance(data["collection_rate"], (int, float))
        
        print(f"✓ Statistics for 2026:")
        print(f"  - Total Expected: RM {data['total_expected']:.2f}")
        print(f"  - Total Collected: RM {data['total_collected']:.2f}")
        print(f"  - Total Outstanding: RM {data['total_outstanding']:.2f}")
        print(f"  - Collection Rate: {data['collection_rate']:.1f}%")
        print(f"  - Set Yuran Count: {data['set_yuran_count']}")
    
    def test_statistics_missing_tahun_fails(self):
        """GET /api/yuran/statistik without tahun should fail"""
        response = self.session.get(f"{BASE_URL}/api/yuran/statistik")
        
        # Should return 422 (validation error) since tahun is required
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        print("✓ Missing tahun parameter correctly rejected")


class TestYuranPelajarAPI:
    """Test Student Yuran List endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup admin session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_resp.status_code == 200
        token = login_resp.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_get_student_yuran_list(self):
        """GET /api/yuran/pelajar - Get student yuran list with pagination"""
        response = self.session.get(f"{BASE_URL}/api/yuran/pelajar?tahun=2026&page=1&limit=20")
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify pagination structure
        assert "data" in data, "Response should have 'data' field"
        assert "pagination" in data, "Response should have 'pagination' field"
        
        pagination = data["pagination"]
        assert "total" in pagination
        assert "page" in pagination
        assert "limit" in pagination
        assert "total_pages" in pagination
        
        print(f"✓ Student Yuran List: {pagination['total']} records, Page {pagination['page']}/{pagination['total_pages']}")
    
    def test_get_student_yuran_filter_by_tingkatan(self):
        """GET /api/yuran/pelajar?tingkatan=1 - Filter by tingkatan"""
        response = self.session.get(f"{BASE_URL}/api/yuran/pelajar?tahun=2026&tingkatan=1")
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # All items should have tingkatan=1
        for item in data.get("data", []):
            assert item.get("tingkatan") == 1, f"Expected tingkatan=1, got {item.get('tingkatan')}"
        
        print(f"✓ Filtered {len(data.get('data', []))} records for Tingkatan 1")
    
    def test_get_student_yuran_filter_by_status(self):
        """GET /api/yuran/pelajar?status=pending - Filter by status"""
        response = self.session.get(f"{BASE_URL}/api/yuran/pelajar?tahun=2026&status=pending")
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # All items should have status=pending
        for item in data.get("data", []):
            assert item.get("status") == "pending", f"Expected status=pending, got {item.get('status')}"
        
        print(f"✓ Filtered {len(data.get('data', []))} pending records")


class TestParentYuranAPI:
    """Test Parent Yuran Dashboard endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup parent session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as parent
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARENT_EMAIL,
            "password": PARENT_PASSWORD
        })
        
        if login_resp.status_code != 200:
            pytest.skip("Parent login failed - skipping parent tests")
        
        token = login_resp.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_get_anak_saya_yuran(self):
        """GET /api/yuran/anak-saya - Get children yuran for parent"""
        response = self.session.get(f"{BASE_URL}/api/yuran/anak-saya")
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Should return a list of children
        assert isinstance(data, list), "Response should be a list"
        
        print(f"✓ Parent sees {len(data)} children's yuran data")
        
        for child in data:
            required_fields = ["student_id", "name", "total_fees", "total_paid", "total_outstanding"]
            for field in required_fields:
                assert field in child, f"Missing field: {field}"
            
            print(f"  - {child['name']}: RM {child['total_outstanding']:.2f} outstanding")


class TestYuranAccessControl:
    """Test access control for Yuran endpoints"""
    
    def test_parent_cannot_access_set_yuran(self):
        """Parent should not be able to access set-yuran management"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as parent
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": PARENT_EMAIL,
            "password": PARENT_PASSWORD
        })
        
        if login_resp.status_code != 200:
            pytest.skip("Parent login failed")
        
        token = login_resp.json().get("access_token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Try to access set-yuran
        response = session.get(f"{BASE_URL}/api/yuran/set-yuran")
        
        # Should be forbidden (403)
        assert response.status_code == 403, f"Expected 403 for parent, got {response.status_code}"
        print("✓ Parent correctly denied access to set-yuran")
    
    def test_unauthorized_access_denied(self):
        """Unauthenticated request should be denied"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        response = session.get(f"{BASE_URL}/api/yuran/set-yuran")
        
        # Should be unauthorized (401 or 403)
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Unauthorized access correctly denied")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
